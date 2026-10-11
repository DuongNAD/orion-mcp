import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  appendAttemptRecord,
  computePredictionGap,
  getLabStatus,
  readAttemptsLog,
} from "./history.js";
import { getLevel1HintForTest } from "./ladder.js";
import { executeLabTests } from "./runner.js";
import {
  validateLabSpec,
  type AttemptRecord,
  type AttemptTestItem,
  type LabSpec,
  type OrionExportResult,
  type PolarisErrorLogExport,
  type VegaCardCandidate,
} from "./schema.js";
import { atomicWriteFile, readJson, todayIso, writeJson } from "./util.js";

export async function loadLab(labDir: string): Promise<LabSpec> {
  const p = join(resolve(labDir), "lab.json");
  if (!existsSync(p)) {
    throw new Error(`lab.json not found in directory: ${labDir}`);
  }
  const raw = await readJson<unknown>(p);
  const outcome = validateLabSpec(raw);
  if (!outcome.ok || !outcome.value) {
    throw new Error(`Invalid lab.json in ${labDir}:\n${outcome.errors.join("\n")}`);
  }
  return outcome.value;
}

export async function saveLab(labDir: string, spec: LabSpec): Promise<void> {
  const p = join(resolve(labDir), "lab.json");
  await writeJson(p, spec);
}

function containsSolutionKeyword(obj: unknown): boolean {
  if (!obj || typeof obj !== "object") return false;
  if (Array.isArray(obj)) {
    return obj.some(containsSolutionKeyword);
  }
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const k = key.toLowerCase();
    if (k === "solution" || k === "solutions" || k === "solution_code" || k === "solutioncode") {
      return true;
    }
    if (containsSolutionKeyword(record[key])) {
      return true;
    }
  }
  return false;
}

export interface ScaffoldResult {
  dir: string;
  files: string[];
  spec: LabSpec;
}

export async function scaffoldLab(targetDir: string, rawSpec: unknown): Promise<ScaffoldResult> {
  const absDir = resolve(targetDir);

  // 1. Refuse solution code in spec
  if (containsSolutionKeyword(rawSpec)) {
    throw new Error(
      "Refusing to scaffold lab: spec contains solution field. Orion never includes solutions.",
    );
  }

  // 2. Validate spec
  const outcome = validateLabSpec(rawSpec);
  if (!outcome.ok || !outcome.value) {
    throw new Error(`Invalid lab specification:\n${outcome.errors.join("\n")}`);
  }
  const spec = outcome.value;

  await mkdir(absDir, { recursive: true });
  const createdFiles: string[] = [];

  // 3. Write lab.json
  const labJsonPath = join(absDir, "lab.json");
  await atomicWriteFile(labJsonPath, JSON.stringify(spec, null, 2) + "\n");
  createdFiles.push("lab.json");

  // 4. Write README.md (Vietnamese)
  const readmePath = join(absDir, "README.md");
  if (!existsSync(readmePath)) {
    const customReadme = (rawSpec as { readme?: string })?.readme;
    const readmeContent =
      customReadme && customReadme.trim()
        ? customReadme.trim() + "\n"
        : generateDefaultReadme(spec);
    await atomicWriteFile(readmePath, readmeContent);
    createdFiles.push("README.md");
  }

  // 5. Create tests/ folder and test file
  const testsRelPath = spec.tests.path || (spec.language === "python" ? "tests/test_main.py" : "tests/test_main.test.js");
  const testsFullPath = join(absDir, testsRelPath);
  const testsDir = dirname(testsFullPath);
  await mkdir(testsDir, { recursive: true });

  const customTests = (rawSpec as { testsContent?: string })?.testsContent;
  if (!existsSync(testsFullPath)) {
    const testContent =
      customTests && customTests.trim()
        ? customTests.trim() + "\n"
        : generateDefaultTestFile(spec);
    await atomicWriteFile(testsFullPath, testContent);
    createdFiles.push(testsRelPath);
  }

  // 6. Create starter entry file ONLY if it does not already exist
  const entryFullPath = join(absDir, spec.entry);
  await mkdir(dirname(entryFullPath), { recursive: true });

  if (!existsSync(entryFullPath)) {
    const starterContent = generateDefaultStarterFile(spec);
    await atomicWriteFile(entryFullPath, starterContent);
    createdFiles.push(spec.entry);
  }

  return {
    dir: absDir,
    files: createdFiles,
    spec,
  };
}

function generateDefaultReadme(spec: LabSpec): string {
  const lines: string[] = [
    `# ${spec.title}`,
    "",
    `> **Môn học:** ${spec.subject}${spec.module ? ` · **Module:** ${spec.module}` : ""} · **Thời gian ước tính:** ${spec.timeboxMinutes ?? 45} phút`,
    "",
    "## 1. Mục tiêu (Objectives)",
    `Rèn luyện kỹ năng thực hành và củng cố mental model thông qua việc hoàn thành các bài kiểm thử của môn **${spec.subject}**.`,
    "",
    "## 2. Yêu cầu & Giao diện (Requirements & Interface)",
    `- Tệp bài làm của người học: \`${spec.entry}\``,
    `- Công cụ kiểm thử: \`${spec.tests.runner}\` (được chạy tự động qua lệnh \`orion_run\`)`,
    `- **Quy tắc quan trọng:** Tuyệt đối không chỉnh sửa tệp kiểm thử trong thư mục \`tests/\`. Mọi cài đặt phải được thực hiện trong \`${spec.entry}\`.`,
    "",
    "## 3. Công cụ & Dữ liệu (Tools & Data)",
    `- Ngôn ngữ: ${spec.language}`,
    `- Trình kiểm thử: ${spec.tests.runner} ${spec.tests.path ? `(${spec.tests.path})` : ""}`,
    "",
    "## 4. Các bẫy thường gặp (Common Pitfalls)",
    "- Không kiểm tra điều kiện biên hoặc dữ liệu rỗng.",
    "- Vi phạm điều kiện dừng hoặc để vòng lặp chạy vô hạn.",
    "- Bỏ qua việc đọc kỹ thông điệp lỗi trước khi sửa.",
    "",
    "## 5. Tiêu chuẩn hoàn thành (Definition of Done - DoD)",
  ];

  for (const item of spec.dod) {
    lines.push(`- [ ] ${item}`);
  }

  lines.push(
    "",
    "## 6. Quy trình thực hành với Orion MCP",
    "1. **Dự đoán trước khi chạy (Predict):** Dùng `orion_predict` ghi nhận phán đoán của bạn về số lượng test sẽ pass/fail.",
    "2. **Chạy kiểm thử (Run):** Dùng `orion_run` để chạy test thực tế và nhận diện điểm lệch (gap).",
    "3. **Xem gợi ý bậc thang (Hints):** Nếu gặp lỗi, Orion cung cấp gợi ý Level 1 (triệu chứng). Nếu cần thêm trợ giúp, dùng `orion_hint` để leo lên Level 2 (câu hỏi định hướng) -> Level 3 (phản ví dụ) -> Level 4 (mã giả / chữ ký). Orion **không bao giờ** cung cấp lời giải hoàn chỉnh (Level 5).",
    "4. **Hoàn thành:** Khi 100% tests pass, tiêu chuẩn DoD được đánh dấu hoàn tất!",
    "",
  );

  return lines.join("\n");
}

function generateDefaultTestFile(spec: LabSpec): string {
  if (spec.language === "python") {
    const checkKeys = Object.keys(spec.checks);
    const testFns = checkKeys.length > 0 ? checkKeys : ["test_example"];
    const lines = [
      `"""Unit tests for ${spec.title}."""`,
      `import pytest`,
      "",
    ];
    for (const ck of testFns) {
      lines.push(`def ${ck}():`, `    # TODO: write assertions for ${ck}`, `    pass`, "");
    }
    return lines.join("\n");
  } else {
    const checkKeys = Object.keys(spec.checks);
    const testFns = checkKeys.length > 0 ? checkKeys : ["test_example"];
    const lines = [
      `import { test } from "node:test";`,
      `import assert from "node:assert/strict";`,
      "",
    ];
    for (const ck of testFns) {
      lines.push(`test("${ck}", () => {`, `  // TODO: assertions for ${ck}`, `  assert.ok(true);`, `});`, "");
    }
    return lines.join("\n");
  }
}

function generateDefaultStarterFile(spec: LabSpec): string {
  if (spec.starter && spec.starter.trim()) {
    return spec.starter.trim() + "\n";
  }

  if (spec.language === "python") {
    return [
      `"""${spec.title}`,
      `Subject: ${spec.subject}`,
      `Learner entry file. Implement functions below until all checks pass.`,
      `"""`,
      "",
      "# TODO: Imports needed for your implementation",
      "",
      "# TODO: Define functions and classes required by tests",
      "# Remember: Orion never writes your solution. Hunt your own bugs!",
      "",
    ].join("\n");
  } else {
    return [
      `/**`,
      ` * ${spec.title}`,
      ` * Subject: ${spec.subject}`,
      ` * Learner entry file. Implement functions below until all checks pass.`,
      ` */`,
      "",
      "// TODO: Implement required functions and exports",
      "// Orion never writes your solution. Hunt your own bugs!",
      "",
    ].join("\n");
  }
}

/* ───────── Run Lab & Compact Report ───────── */

export interface RunLabResult {
  labDir: string;
  title: string;
  attempt: number;
  passed: boolean;
  total: number;
  passedCount: number;
  failedCount: number;
  durationMs: number;
  prediction?: string;
  gap?: string;
  failingChecksWithL1Hint: Array<{
    testId: string;
    testName: string;
    message?: string;
    concept?: string;
    hintL1?: string;
  }>;
  reportMarkdown: string;
}

export async function runLab(labDir: string): Promise<RunLabResult> {
  const absDir = resolve(labDir);
  const spec = await loadLab(absDir);

  const history = await readAttemptsLog(absDir);
  const pastAttempts = history.filter((r): r is AttemptRecord => r.type === "attempt" || ("tests" in r && !("check" in r)));
  const attemptNum = pastAttempts.length + 1;

  const prediction = spec.pendingPrediction ?? null;

  // Run the tests
  const runResult = await executeLabTests(absDir, spec.tests);

  // Compute prediction gap
  const gap = computePredictionGap(prediction, runResult);

  // Snapshot hints used
  const hintsUsed = { ...(spec.hintLevels ?? {}) };

  // Append attempt record
  const attemptRecord: AttemptRecord = {
    type: "attempt",
    timestamp: new Date().toISOString(),
    attempt: attemptNum,
    passed: runResult.passed,
    total: runResult.total,
    passedCount: runResult.passedCount,
    failedCount: runResult.failedCount,
    skippedCount: runResult.skippedCount,
    durationMs: runResult.durationMs,
    timedOut: runResult.timedOut,
    prediction,
    gap,
    tests: runResult.tests,
    hintsUsed,
  };
  await appendAttemptRecord(absDir, attemptRecord);

  // Clear pendingPrediction in lab.json
  if (spec.pendingPrediction !== undefined) {
    spec.pendingPrediction = undefined;
    await saveLab(absDir, spec);
  }

  // Extract failing checks with Level 1 hint ONLY
  const failingTests = runResult.tests.filter((t) => t.status === "failed" || t.status === "error");
  const failingChecksWithL1Hint = failingTests.map((t) => {
    const l1Info = getLevel1HintForTest(t, spec.checks);
    return {
      testId: t.id,
      testName: t.name,
      message: t.message,
      concept: l1Info?.concept,
      hintL1: l1Info?.hint,
    };
  });

  // Calculate cumulative time spent
  const totalDurationMs = pastAttempts.reduce((acc, a) => acc + (a.durationMs || 0), 0) + runResult.durationMs;
  const timeSpentMinutes = Math.round((totalDurationMs / 60000) * 10) / 10;

  // Format compact markdown report
  const lines: string[] = [
    `# Kết quả kiểm thử: ${spec.title} (Lần #${attemptNum})`,
    `- Kết quả: **${runResult.passedCount}/${runResult.total} kiểm tra đạt (${Math.round((runResult.passedCount / Math.max(1, runResult.total)) * 100)}%)**`,
    `- Thời gian chạy lần này: ${(runResult.durationMs / 1000).toFixed(2)}s | Tổng thời gian thực hành: ${timeSpentMinutes} phút`,
  ];

  if (prediction) {
    lines.push(`- Dự đoán trước chạy: "${prediction}"`);
    if (gap) {
      lines.push(`- **Điểm lệch (Gap):** ${gap}`);
    }
  }

  if (runResult.timedOut) {
    lines.push(
      "",
      `> [!WARNING] Kiểm thử bị gián đoạn do vượt quá thời gian tối đa (${spec.tests.timeoutSec ?? 120}s). Toàn bộ tiến trình con đã được dừng.`,
    );
  }

  if (runResult.passed) {
    lines.push(
      "",
      "> [!TIP] CHÚC MỪNG! Toàn bộ bài kiểm tra đã đạt (100%). Tiêu chuẩn hoàn thành (DoD) đã thoả mãn.",
      "",
      "### Tiêu chuẩn hoàn thành (DoD)",
    );
    for (const d of spec.dod) {
      lines.push(`- [x] ${d}`);
    }
  } else {
    lines.push(
      "",
      "### Các bài kiểm tra chưa đạt (Failing Checks & Level 1 Hints)",
    );

    for (const fc of failingChecksWithL1Hint) {
      lines.push(`\n#### \`${fc.testName}\``);
      if (fc.concept) {
        lines.push(`- **Concept:** \`${fc.concept}\``);
      }
      if (fc.message) {
        const shortMsg = fc.message.split("\n")[0]?.slice(0, 150) ?? "";
        lines.push(`- **Triệu chứng lỗi:** \`${shortMsg}\``);
      }
      if (fc.hintL1) {
        lines.push(`- **Gợi ý bậc thang (Level 1 - Triệu chứng):** ${fc.hintL1}`);
      } else {
        lines.push(`- *Chưa có gợi ý Level 1 cho bài kiểm tra này.*`);
      }
    }

    lines.push(
      "",
      "> [!NOTE] Suy nghĩ và sửa code trong tệp bài làm dựa trên gợi ý Level 1 ở trên.",
      "> Nếu vẫn bị kẹt, dùng công cụ `orion_hint { lab: \"...\", check: \"<tên check>\" }` để nâng lên Level 2 (câu hỏi định hướng).",
      "",
      "### Tiêu chuẩn hoàn thành (DoD)",
    );
    for (const d of spec.dod) {
      lines.push(`- [ ] ${d}`);
    }
  }

  return {
    labDir: absDir,
    title: spec.title,
    attempt: attemptNum,
    passed: runResult.passed,
    total: runResult.total,
    passedCount: runResult.passedCount,
    failedCount: runResult.failedCount,
    durationMs: runResult.durationMs,
    prediction: prediction ?? undefined,
    gap: gap ?? undefined,
    failingChecksWithL1Hint,
    reportMarkdown: lines.join("\n"),
  };
}

/* ───────── Export for Polaris Error Log & Vega Cards ───────── */

export async function exportLab(labDir: string): Promise<OrionExportResult> {
  const absDir = resolve(labDir);
  const spec = await loadLab(absDir);
  const history = await readAttemptsLog(absDir);

  const attempts = history.filter((r): r is AttemptRecord => r.type === "attempt" || ("tests" in r && !("check" in r)));

  // Aggregate failing counts per test
  const failureCountMap = new Map<string, { count: number; lastMessage?: string; testItem: AttemptTestItem }>();
  for (const att of attempts) {
    for (const t of att.tests) {
      if (t.status === "failed" || t.status === "error") {
        const cur = failureCountMap.get(t.name) ?? { count: 0, testItem: t };
        cur.count++;
        cur.lastMessage = t.message ?? cur.lastMessage;
        failureCountMap.set(t.name, cur);
      }
    }
  }

  const latestAttempt = attempts[attempts.length - 1];

  const errorLogEntries: PolarisErrorLogExport[] = [];
  const vegaCards: VegaCardCandidate[] = [];

  // Export checks that failed repeatedly (or failed in attempts)
  for (const [testName, info] of failureCountMap.entries()) {
    // Check if matching check in spec
    let matchedCheckKey: string | undefined;
    let matchedCheck = spec.checks[testName];
    if (matchedCheck) {
      matchedCheckKey = testName;
    } else {
      for (const k of Object.keys(spec.checks)) {
        if (testName.endsWith(k) || testName.includes(k) || k.includes(testName)) {
          matchedCheckKey = k;
          matchedCheck = spec.checks[k];
          break;
        }
      }
    }

    const concept = matchedCheck?.concept || "orion-practice-gap";
    const hints = matchedCheck?.hints || [];
    const hintL1 = hints[0] || "";
    const hintL2 = hints[1] || "";

    const checkIdentifier = matchedCheckKey || testName;

    // 1. Polaris Error Log Entry
    const firstLineErr = (info.lastMessage || "Thất bại kiểm thử").split("\n")[0]!.slice(0, 160);
    const whyText = hintL1
      ? `Concept [${concept}]: ${hintL1}`
      : `Lệch hiểu biết về [${concept}]: ${firstLineErr}`;
    const fixText = hintL2
      ? `Quy tắc / Invariants: ${hintL2}`
      : `Đảm bảo xử lý đúng điều kiện và invariants của kiểm tra ${checkIdentifier}.`;

    errorLogEntries.push({
      date: todayIso(),
      module: spec.module,
      lesson: spec.title,
      prediction: latestAttempt?.prediction || "Dự đoán trước khi chạy",
      result: `Thất bại kiểm tra '${checkIdentifier}': ${firstLineErr}`,
      why: whyText,
      fix: fixText,
      source: `Orion Lab: ${spec.title}`,
    });

    // 2. Vega Card Candidate
    vegaCards.push({
      subject: spec.subject,
      deck: spec.module || spec.title,
      kind: "basic",
      front: `Trong bài thực hành "${spec.title}", khi gặp kiểm tra "${checkIdentifier}" (${concept}): điều kiện bất biến (invariant) nào cần đảm bảo?`,
      back: fixText,
      hint: hintL1 || concept,
      origin: {
        kind: "manual",
        path: join(absDir, "lab.json"),
        locator: `check: ${checkIdentifier}`,
      },
      tags: ["orion", "lab", spec.language, concept],
    });
  }

  const summary = [
    `Đã trích xuất ${errorLogEntries.length} mục Sổ lỗi (Polaris) và ${vegaCards.length} thẻ ghi nhớ (Vega) từ bài lab "${spec.title}".`,
    `Các mục này sẵn sàng được thêm vào Polaris qua polaris_errorlog_add hoặc Vega qua vega_add.`,
  ].join("\n");

  return {
    lab: absDir,
    title: spec.title,
    errorLogEntries,
    vegaCards,
    summary,
  };
}
