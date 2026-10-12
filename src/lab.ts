import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import {
  appendAttemptRecord,
  appendHintRecord,
  appendStageRecord,
  computePredictionGap,
  getLabStatus,
  mainStatusText,
  readAttemptsLog,
} from "./history.js";
import {
  getHintForCheck,
  getLevel1HintForTest,
  MIRA_TRACE_MIN_LEVEL,
  miraTraceLine,
  resolveCheck,
  type HintOutcome,
} from "./ladder.js";
import { executeLabTests, type TestRunResult } from "./runner.js";
import {
  isAttemptRecord,
  isMainAttempt,
  validateLabSpec,
  type AttemptRecord,
  type AttemptTestItem,
  type ExportCardSource,
  type HistoryRecord,
  type LabSpec,
  type LabTests,
  type OrionExportResult,
  type PolarisErrorLogExport,
  type VegaCardCandidate,
  type VegaInboxOutcome,
  type WarmupKind,
  type WarmupStage,
} from "./schema.js";
import { atomicWriteFile, normRelPath, readJson, todayIso, writeJson } from "./util.js";
import { buildInboxLines, resolveHub, writeVegaInbox } from "./vega.js";
import {
  computeStageStates,
  formatLadderLines,
  formatStageDetail,
  formatStageRunReport,
  formatWarmupSuggestion,
  KIND_LABEL,
  MAIN_STAGE_LABEL,
  nextUnfinished,
  nextUnfinishedAfter,
  referencesLabEntry,
  resolveStage,
  stageFileSkeleton,
  stageTestsSkeleton,
  testsPathIsFile,
  WARMUP_SUGGEST_MAX_ATTEMPTS,
  type StageState,
} from "./warmup.js";

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

/* ───────── Scaffold ───────── */

/** Text supplied alongside the spec that is written to files but never stored in lab.json. */
interface ScaffoldExtras {
  readme?: string;
  testsContent?: string;
  /** Warm-up file content keyed by lab-relative path (a stage `file` or a stage `tests.path`). */
  warmupFiles: Record<string, string>;
}

const MAX_SCAFFOLD_TEXT = 200_000;

function invalidSpec(...problems: string[]): Error {
  return new Error(`Invalid lab specification:\n${problems.join("\n")}`);
}

function splitScaffoldExtras(raw: unknown): { rest: unknown; extras: ScaffoldExtras } {
  const extras: ScaffoldExtras = { warmupFiles: {} };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { rest: raw, extras };

  const { readme, testsContent, warmupFiles, ...rest } = raw as Record<string, unknown>;
  for (const [name, value] of [["readme", readme], ["testsContent", testsContent]] as const) {
    if (value === undefined) continue;
    if (typeof value !== "string" || value.length > MAX_SCAFFOLD_TEXT) {
      throw invalidSpec(`${name}: must be a string of at most ${MAX_SCAFFOLD_TEXT} characters (scaffold-only, not stored in lab.json)`);
    }
    extras[name] = value;
  }
  if (warmupFiles !== undefined) {
    if (!warmupFiles || typeof warmupFiles !== "object" || Array.isArray(warmupFiles)) {
      throw invalidSpec("warmupFiles: must be an object mapping a lab-relative path to its text (scaffold-only, not stored in lab.json)");
    }
    for (const [path, content] of Object.entries(warmupFiles as Record<string, unknown>)) {
      if (typeof content !== "string" || !content.trim() || content.length > MAX_SCAFFOLD_TEXT) {
        throw invalidSpec(`warmupFiles["${path}"]: must be a non-empty string of at most ${MAX_SCAFFOLD_TEXT} characters`);
      }
      extras.warmupFiles[path] = content;
    }
  }
  return { rest, extras };
}

/**
 * Matches `warmupFiles` to stage paths and applies the isomorphic guard.
 * Returns the supplied text keyed by lower-cased normalized path.
 */
function planWarmupFiles(spec: LabSpec, files: Record<string, string>): Map<string, string> {
  const plan = new Map<string, string>();
  const entries = Object.entries(files);
  if (entries.length === 0) return plan;

  const stages = spec.warmup ?? [];
  const allowed = new Map<string, { stage: WarmupStage; role: "file" | "tests" }>();
  for (const st of stages) {
    allowed.set(normRelPath(st.file).toLowerCase(), { stage: st, role: "file" });
    if (st.tests?.path) allowed.set(normRelPath(st.tests.path).toLowerCase(), { stage: st, role: "tests" });
  }

  const problems: string[] = [];
  const stageFiles = stages.map((s) => s.file);
  for (const [path, content] of entries) {
    const key = normRelPath(path).toLowerCase();
    const hit = allowed.get(key);
    if (!hit) {
      problems.push(
        `warmupFiles["${path}"]: not a warm-up stage file or stage tests path. Allowed: ${[...allowed.values()]
          .map((a) => (a.role === "file" ? a.stage.file : a.stage.tests?.path))
          .join(", ") || "(none: the spec has no warmup stages)"}`,
      );
      continue;
    }
    if (hit.role === "tests" && !testsPathIsFile(hit.stage.tests?.path)) {
      problems.push(`warmupFiles["${path}"]: stage '${hit.stage.id}' tests.path has no file extension, so it names a folder and cannot hold text`);
      continue;
    }
    if (referencesLabEntry(content, spec.entry, stageFiles)) {
      problems.push(
        `warmupFiles["${path}"]: imports the lab entry file "${spec.entry}". Warm-up material is an isomorphic problem (same solution structure, different surface), never the lab's own solution.`,
      );
      continue;
    }
    plan.set(key, content);
  }
  if (problems.length > 0) throw invalidSpec(...problems);
  return plan;
}

export interface ScaffoldResult {
  dir: string;
  files: string[];
  spec: LabSpec;
  /** Warm-up stage files: written from spec text, written as TODO skeletons, or kept because they already exist. */
  warmup: { fromSpec: string[]; skeleton: string[]; kept: string[] };
}

export async function scaffoldLab(targetDir: string, rawSpec: unknown): Promise<ScaffoldResult> {
  const absDir = resolve(targetDir);

  // 1. Refuse solution code in spec
  if (containsSolutionKeyword(rawSpec)) {
    throw new Error(
      "Refusing to scaffold lab: spec contains solution field. Orion never includes solutions.",
    );
  }

  // 2. Scaffold-only text (readme, testsContent, warmupFiles) is written to files, never stored in lab.json
  const { rest, extras } = splitScaffoldExtras(rawSpec);

  // 3. Validate spec
  const outcome = validateLabSpec(rest);
  if (!outcome.ok || !outcome.value) {
    throw new Error(`Invalid lab specification:\n${outcome.errors.join("\n")}`);
  }
  const spec = outcome.value;

  // 4. Warm-up content must be an isomorphic problem, never the lab's own solution
  const warmupPlan = planWarmupFiles(spec, extras.warmupFiles);

  await mkdir(absDir, { recursive: true });
  const createdFiles: string[] = [];
  const warmup: ScaffoldResult["warmup"] = { fromSpec: [], skeleton: [], kept: [] };

  // 5. Write lab.json
  const labJsonPath = join(absDir, "lab.json");
  await atomicWriteFile(labJsonPath, JSON.stringify(spec, null, 2) + "\n");
  createdFiles.push("lab.json");

  // 6. Write README.md (Vietnamese)
  const readmePath = join(absDir, "README.md");
  if (!existsSync(readmePath)) {
    const customReadme = extras.readme;
    const readmeContent =
      customReadme && customReadme.trim()
        ? customReadme.trim() + "\n"
        : generateDefaultReadme(spec);
    await atomicWriteFile(readmePath, readmeContent);
    createdFiles.push("README.md");
  }

  // 7. Create tests/ folder and test file
  const testsRelPath = spec.tests.path || (spec.language === "python" ? "tests/test_main.py" : "tests/test_main.test.js");
  const testsFullPath = join(absDir, testsRelPath);
  const testsDir = dirname(testsFullPath);
  await mkdir(testsDir, { recursive: true });

  const customTests = extras.testsContent;
  if (!existsSync(testsFullPath)) {
    const testContent =
      customTests && customTests.trim()
        ? customTests.trim() + "\n"
        : generateDefaultTestFile(spec);
    await atomicWriteFile(testsFullPath, testContent);
    createdFiles.push(testsRelPath);
  }

  // 8. Create starter entry file ONLY if it does not already exist
  const entryFullPath = join(absDir, spec.entry);
  await mkdir(dirname(entryFullPath), { recursive: true });

  if (!existsSync(entryFullPath)) {
    const starterContent = generateDefaultStarterFile(spec);
    await atomicWriteFile(entryFullPath, starterContent);
    createdFiles.push(spec.entry);
  }

  // 9. Warm-up stage files: only text given in the spec, or TODO skeletons. Existing files are never overwritten.
  const writeStageFile = async (rel: string, supplied: string | undefined, skeleton: () => string | undefined) => {
    const full = resolve(absDir, rel);
    if (full !== absDir && !full.startsWith(absDir + sep)) {
      throw new Error(`Refusing to write outside the lab folder: ${rel}`);
    }
    if (existsSync(full)) {
      warmup.kept.push(rel);
      return;
    }
    const content = supplied !== undefined ? supplied.trimEnd() + "\n" : skeleton();
    if (content === undefined) return;
    await atomicWriteFile(full, content);
    createdFiles.push(rel);
    (supplied !== undefined ? warmup.fromSpec : warmup.skeleton).push(rel);
  };

  for (const st of spec.warmup ?? []) {
    await writeStageFile(st.file, warmupPlan.get(normRelPath(st.file).toLowerCase()), () => stageFileSkeleton(st));
    const tp = st.tests?.path;
    if (tp) {
      if (testsPathIsFile(tp)) {
        await writeStageFile(tp, warmupPlan.get(normRelPath(tp).toLowerCase()), () => stageTestsSkeleton(st));
      } else {
        await mkdir(resolve(absDir, tp), { recursive: true });
      }
    }
  }

  return {
    dir: absDir,
    files: createdFiles,
    spec,
    warmup,
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

  const stages = spec.warmup ?? [];
  if (stages.length > 0) {
    lines.push(
      "## 7. Thang khởi động (PRIMM) - tùy chọn",
      "Trước bài chính, bạn có thể đi qua các bậc khởi động bên dưới. Mỗi bậc là một bài **đẳng cấu** (isomorphic) với bài chính: cùng cấu trúc lời giải nhưng khác bề mặt bài toán. Chúng **không** phải lời giải của chính bài này. Bạn có thể bỏ qua thang khởi động; Orion không chặn.",
      "",
      "| Bậc | Loại | Tên | Tệp | Kiểm thử |",
      "|---|---|---|---|---|",
    );
    stages.forEach((st, i) => {
      const tests = st.tests ? `\`${st.tests.path ?? st.tests.command ?? st.tests.runner}\`` : "(không có, dùng `done`)";
      lines.push(`| ${i + 1}. \`${st.id}\` | ${KIND_LABEL[st.kind]} | ${st.title} | \`${st.file}\` | ${tests} |`);
    });
    lines.push(
      `| ${stages.length + 1}. ${MAIN_STAGE_LABEL} | Bài chính | ${spec.title} | \`${spec.entry}\` | \`${spec.tests.path ?? spec.tests.runner}\` |`,
      "",
      "Lệnh: `orion_stage { lab, stage, action: \"run\" | \"done\" | \"status\" }`. Bậc ví dụ mẫu: đọc, dự đoán, điều tra, rồi `done`. Các bậc còn lại: làm trong tệp của bậc rồi `run`.",
      "",
    );
  }

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

/* ───────── Run (shared by the main lab and warm-up stages) ───────── */

interface ExecutedRun {
  /** 1-based attempt number within the same scope (main lab, or the stage). */
  attempt: number;
  prediction: string | null;
  gap: string | null;
  run: TestRunResult;
  /** Attempts of the same scope that happened before this run. */
  pastAttempts: AttemptRecord[];
  /** Whole log as it was before this run. */
  history: HistoryRecord[];
}

/**
 * Runs the given tests, appends the attempt line (with `stage` for warm-up runs) and consumes the pending
 * prediction. The same code path serves orion_run and orion_stage run.
 */
async function executeAndRecord(
  absDir: string,
  spec: LabSpec,
  testsConfig: LabTests,
  stageId?: string,
): Promise<ExecutedRun> {
  const history = await readAttemptsLog(absDir);
  const pastAttempts = history.filter(
    (r): r is AttemptRecord => isAttemptRecord(r) && (stageId ? r.stage === stageId : !r.stage),
  );
  const attempt = pastAttempts.length + 1;
  const prediction = spec.pendingPrediction ?? null;

  const run = await executeLabTests(absDir, testsConfig);
  const gap = computePredictionGap(prediction, run, stageId ? { stageId } : {});

  const record: AttemptRecord = {
    type: "attempt",
    timestamp: new Date().toISOString(),
    attempt,
    ...(stageId ? { stage: stageId } : {}),
    passed: run.passed,
    total: run.total,
    passedCount: run.passedCount,
    failedCount: run.failedCount,
    skippedCount: run.skippedCount,
    durationMs: run.durationMs,
    timedOut: run.timedOut,
    prediction,
    gap,
    tests: run.tests,
    // Hint levels belong to the main lab's checks; stage runs do not snapshot them.
    ...(stageId ? {} : { hintsUsed: { ...(spec.hintLevels ?? {}) } }),
  };
  await appendAttemptRecord(absDir, record);

  // Clear pendingPrediction in lab.json
  if (spec.pendingPrediction !== undefined) {
    spec.pendingPrediction = undefined;
    await saveLab(absDir, spec);
  }

  return { attempt, prediction, gap, run, pastAttempts, history };
}

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
  /** Next unfinished warm-up stage, set only on the first failing attempts of a lab with a warm-up ladder. */
  nextWarmup?: { id: string; kind: WarmupKind; title: string; file: string };
  reportMarkdown: string;
}

export async function runLab(labDir: string): Promise<RunLabResult> {
  const absDir = resolve(labDir);
  const spec = await loadLab(absDir);

  const { attempt: attemptNum, prediction, gap, run: runResult, pastAttempts, history } = await executeAndRecord(
    absDir,
    spec,
    spec.tests,
  );

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

  let nextWarmup: RunLabResult["nextWarmup"];

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
    );

    // Non-blocking: during the first failing attempts, point at the next unfinished warm-up stage.
    if (attemptNum <= WARMUP_SUGGEST_MAX_ATTEMPTS) {
      const next = nextUnfinished(computeStageStates(spec.warmup, history));
      const stage = next ? spec.warmup?.find((s) => s.id === next.id) : undefined;
      if (next && stage) {
        nextWarmup = { id: next.id, kind: next.kind, title: next.title, file: next.file };
        lines.push("", ...formatWarmupSuggestion(next, stage, absDir));
      }
    }

    lines.push("", "### Tiêu chuẩn hoàn thành (DoD)");
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
    ...(nextWarmup ? { nextWarmup } : {}),
    reportMarkdown: lines.join("\n"),
  };
}

/* ───────── Hints (tutoring ladder + Mira link) ───────── */

export interface HintResult {
  outcome: HintOutcome;
  /** Set at Level 3+ when the check has a `trace`: `Dò code với Mira: mira_record { lab, call }`. */
  miraLine?: string;
}

/** Escalates one hint level for a check, records it, and adds the Mira link at Level 3+ for checks with a `trace`. */
export async function requestHint(labDir: string, check: string, level?: number): Promise<HintResult> {
  const absDir = resolve(labDir);
  const spec = await loadLab(absDir);

  // Resolve the check first so the recorded level is looked up under the real key (not the raw query).
  const resolved = resolveCheck(spec, check);
  const curLevel = spec.hintLevels?.[resolved.key] ?? 0;
  const outcome = getHintForCheck(spec, resolved.key, level, curLevel);

  // Update recorded level in lab.json
  if (!spec.hintLevels) spec.hintLevels = {};
  spec.hintLevels[outcome.checkKey] = outcome.level;
  await saveLab(absDir, spec);

  // Append to history
  await appendHintRecord(absDir, {
    type: "hint",
    timestamp: new Date().toISOString(),
    check: outcome.checkKey,
    level: outcome.level,
    concept: outcome.concept,
    hint: outcome.hint,
  });

  const miraLine =
    outcome.level >= MIRA_TRACE_MIN_LEVEL && outcome.trace ? miraTraceLine(absDir, outcome.trace) : undefined;
  return { outcome, ...(miraLine ? { miraLine } : {}) };
}

/* ───────── Warm-up stages (orion_stage) ───────── */

export type StageAction = "run" | "done" | "status";

export interface StageRunResult {
  labDir: string;
  stage: string;
  kind: WarmupKind;
  title: string;
  attempt: number;
  passed: boolean;
  total: number;
  passedCount: number;
  failedCount: number;
  durationMs: number;
  prediction?: string;
  gap?: string;
  failing: Array<{ testId: string; testName: string; message?: string }>;
  reportMarkdown: string;
}

export interface StageActionResult {
  lab: string;
  action: StageAction;
  stage?: string;
  /** done: false when the stage was already marked as studied (nothing appended). */
  changed?: boolean;
  /** run: whether the stage tests passed. */
  passed?: boolean;
  report: string;
  states: StageState[];
  run?: StageRunResult;
}

function requireWarmup(spec: LabSpec): WarmupStage[] {
  const stages = spec.warmup ?? [];
  if (stages.length === 0) {
    throw new Error("This lab has no warm-up ladder (lab.json has no warmup stages).");
  }
  return stages;
}

/** run: run that stage's tests; done: mark an example stage as studied; status: per-stage state. */
export async function stageAction(
  labDir: string,
  stageQuery: string | undefined,
  action: StageAction,
): Promise<StageActionResult> {
  const absDir = resolve(labDir);
  const spec = await loadLab(absDir);

  if (action === "status") {
    const stages = spec.warmup ?? [];
    const data = await getLabStatus(absDir, spec);
    const states = data.warmup;
    if (stages.length === 0) {
      return {
        lab: absDir,
        action,
        report: `Bài lab "${spec.title}" không có thang khởi động (lab.json không có warmup). Làm thẳng bài chính: \`${spec.entry}\`.`,
        states,
      };
    }
    if (stageQuery && stageQuery.trim()) {
      const { index, stage } = resolveStage(stages, stageQuery);
      const state = states[index]!;
      return { lab: absDir, action, stage: stage.id, report: formatStageDetail(stage, state, absDir).join("\n"), states };
    }
    const report = [
      `# Thang khởi động: ${spec.title}`,
      "",
      ...formatLadderLines(states, { entry: spec.entry, statusText: mainStatusText(data) }),
    ].join("\n");
    return { lab: absDir, action, report, states };
  }

  const stages = requireWarmup(spec);
  if (!stageQuery || !stageQuery.trim()) {
    throw new Error(`Action "${action}" needs a stage id. Available stages: ${stages.map((s) => s.id).join(", ")}`);
  }
  const { index, stage } = resolveStage(stages, stageQuery);

  if (action === "done") {
    if (stage.kind !== "example") {
      throw new Error(
        `Only example stages can be marked done (stage '${stage.id}' is kind '${stage.kind}'; use action "run" to check it with its tests).`,
      );
    }
    const history = await readAttemptsLog(absDir);
    const before = computeStageStates(stages, history);
    const already = before.find((s) => s.id === stage.id)?.state === "studied";
    if (!already) {
      await appendStageRecord(absDir, {
        type: "stage",
        timestamp: new Date().toISOString(),
        stage: stage.id,
        kind: stage.kind,
        event: "studied",
      });
    }
    const states = computeStageStates(stages, already ? history : await readAttemptsLog(absDir));
    const next = nextUnfinishedAfter(states, index);
    const report = [
      already
        ? `Bậc \`${stage.id}\` (${KIND_LABEL[stage.kind]}) "${stage.title}" đã được đánh dấu là đã xem trước đó (không ghi thêm).`
        : `Đã đánh dấu bậc \`${stage.id}\` (${KIND_LABEL[stage.kind]}) "${stage.title}" là đã xem.`,
      next
        ? `Bậc tiếp theo: \`${next.id}\` (${KIND_LABEL[next.kind]}): ${next.title}.`
        : `Đã xong thang khởi động. Sẵn sàng làm bài chính: tệp \`${spec.entry}\`, chạy \`orion_run\`.`,
    ].join("\n");
    return { lab: absDir, action, stage: stage.id, changed: !already, report, states };
  }

  // run
  if (!stage.tests) {
    throw new Error(
      `Stage '${stage.id}' (${stage.kind}) has no tests. Study ${stage.file}, then mark it with action "done".`,
    );
  }
  const ex = await executeAndRecord(absDir, spec, stage.tests, stage.id);
  const states = computeStageStates(stages, await readAttemptsLog(absDir));
  const next = ex.run.passed ? nextUnfinishedAfter(states, index) : undefined;
  const failing = ex.run.tests.filter((t) => t.status === "failed" || t.status === "error");
  const reportMarkdown = formatStageRunReport({
    stage,
    attempt: ex.attempt,
    passed: ex.run.passed,
    total: ex.run.total,
    passedCount: ex.run.passedCount,
    durationMs: ex.run.durationMs,
    timedOut: ex.run.timedOut,
    timeoutSec: stage.tests.timeoutSec ?? 120,
    prediction: ex.prediction,
    gap: ex.gap,
    failing: failing.map((t) => ({ name: t.name, message: t.message })),
    next,
    entry: spec.entry,
  });
  const run: StageRunResult = {
    labDir: absDir,
    stage: stage.id,
    kind: stage.kind,
    title: stage.title,
    attempt: ex.attempt,
    passed: ex.run.passed,
    total: ex.run.total,
    passedCount: ex.run.passedCount,
    failedCount: ex.run.failedCount,
    durationMs: ex.run.durationMs,
    prediction: ex.prediction ?? undefined,
    gap: ex.gap ?? undefined,
    failing: failing.map((t) => ({ testId: t.id, testName: t.name, message: t.message })),
    reportMarkdown,
  };
  return { lab: absDir, action, stage: stage.id, passed: ex.run.passed, report: reportMarkdown, states, run };
}

/* ───────── Export for Polaris Error Log & Vega Cards ───────── */

export interface ExportOptions {
  /** Also write the Vega card candidates as one inbox file (contract vega-card-inbox.v1). */
  toVega?: boolean;
  /** Hub root override; otherwise env ORION_HUB, env POLARIS_HUB, then D:/02_Learning_Knowledge. */
  hub?: string;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}

export async function exportLab(labDir: string, opts: ExportOptions = {}): Promise<OrionExportResult> {
  const absDir = resolve(labDir);
  const spec = await loadLab(absDir);
  const history = await readAttemptsLog(absDir);

  // Main-lab attempts only: warm-up stage runs are not checks of the lab.
  const attempts = history.filter(isMainAttempt);

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
  const cardSources: ExportCardSource[] = [];

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
    cardSources.push({ checkKey: checkIdentifier, concept, failCount: info.count, declared: Boolean(matchedCheckKey) });
  }

  const summary = [
    `Đã trích xuất ${errorLogEntries.length} mục Sổ lỗi (Polaris) và ${vegaCards.length} thẻ ghi nhớ (Vega) từ bài lab "${spec.title}".`,
    `Các mục này sẵn sàng được thêm vào Polaris qua polaris_errorlog_add hoặc Vega qua vega_add.`,
  ].join("\n");

  const result: OrionExportResult = {
    lab: absDir,
    title: spec.title,
    errorLogEntries,
    vegaCards,
    cardSources,
    summary,
  };

  if (opts.toVega) {
    result.vegaInbox = await exportToVegaInbox(result, absDir, opts);
  }
  return result;
}

/** Writes the exported card candidates as one Vega inbox file (atomic), after validating each line. */
async function exportToVegaInbox(
  result: OrionExportResult,
  absDir: string,
  opts: ExportOptions,
): Promise<VegaInboxOutcome> {
  const hub = resolveHub(opts.hub, opts.env ?? process.env);
  const dir = join(hub, ".vega", "inbox");
  const now = opts.now ?? new Date();
  const { lines, rejected, skipped } = buildInboxLines({
    labDir: absDir,
    title: result.title,
    cards: result.vegaCards,
    sources: result.cardSources,
    now,
  });

  if (lines.length === 0) {
    let note = "mọi dòng đều không hợp lệ";
    if (result.vegaCards.length === 0) note = "chưa có kiểm tra nào thất bại nên không có thẻ ứng viên";
    else if (rejected.length === 0) note = "chưa có thẻ ứng viên nào thuộc check khai báo trong lab.json";
    return { hub, dir, file: null, written: 0, rejected, skipped, note };
  }

  const written = await writeVegaInbox(hub, lines, now);
  return { hub, dir: written.dir, file: written.file, written: lines.length, rejected, skipped };
}
