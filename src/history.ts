import { existsSync, readdirSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { TestRunResult } from "./runner.js";
import type {
  AttemptRecord,
  HintRecord,
  HistoryRecord,
  LabSpec,
} from "./schema.js";
import { readJson } from "./util.js";

export function attemptsFilePath(labDir: string): string {
  return join(labDir, "orion-attempts.jsonl");
}

export async function readAttemptsLog(labDir: string): Promise<HistoryRecord[]> {
  const p = attemptsFilePath(labDir);
  if (!existsSync(p)) return [];

  const text = await readFile(p, "utf8");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const records: HistoryRecord[] = [];

  for (const line of lines) {
    try {
      const obj = JSON.parse(line) as HistoryRecord;
      records.push(obj);
    } catch {
      // ignore corrupted lines
    }
  }

  return records;
}

export async function appendAttemptRecord(labDir: string, record: AttemptRecord): Promise<void> {
  const p = attemptsFilePath(labDir);
  const line = JSON.stringify(record) + "\n";
  await appendFile(p, line, "utf8");
}

export async function appendHintRecord(labDir: string, record: HintRecord): Promise<void> {
  const p = attemptsFilePath(labDir);
  const line = JSON.stringify(record) + "\n";
  await appendFile(p, line, "utf8");
}

/** Computes the gap between the learner's prediction and the actual test run */
export function computePredictionGap(
  prediction: string | null | undefined,
  runResult: TestRunResult,
): string | null {
  if (!prediction || !prediction.trim()) return null;

  const failing = runResult.tests.filter((t) => t.status === "failed" || t.status === "error");
  const failingNames = failing.map((t) => t.name).join(", ");

  if (runResult.passed) {
    return `Dự đoán: "${prediction}". Thực tế: Đạt toàn bộ ${runResult.total}/${runResult.total} bài kiểm tra (100%). Hoàn thành Definition of Done.`;
  }

  const gapDetail = failingNames
    ? `Các kiểm tra chưa đạt: ${failingNames}.`
    : `Lỗi thực thi kiểm thử.`;

  return `Dự đoán: "${prediction}". Thực tế: ${runResult.passedCount}/${runResult.total} pass (${runResult.failedCount} fail). Điểm lệch: ${gapDetail}`;
}

/* ───────── Lab Status Report ───────── */

export interface LabStatusData {
  labDir: string;
  title: string;
  subject: string;
  module?: string;
  language: string;
  status: "completed" | "in_progress" | "not_started";
  attemptsCount: number;
  firstPassSuccess: boolean;
  totalTimeMinutes: number;
  timeboxMinutes?: number;
  hintsUsed: Record<string, number>;
  latestAttempt?: AttemptRecord;
  dodStatus: Array<{ item: string; completed: boolean }>;
}

export async function getLabStatus(labDir: string, spec: LabSpec): Promise<LabStatusData> {
  const history = await readAttemptsLog(labDir);
  const attempts = history.filter((r): r is AttemptRecord => r.type === "attempt" || ("tests" in r && !("check" in r)));
  const hintRecords = history.filter((r): r is HintRecord => r.type === "hint");

  // Aggregate hints used per check
  const hintsUsed: Record<string, number> = { ...(spec.hintLevels ?? {}) };
  for (const hr of hintRecords) {
    const cur = hintsUsed[hr.check] ?? 0;
    if (hr.level > cur) hintsUsed[hr.check] = hr.level;
  }

  const attemptsCount = attempts.length;
  const latestAttempt = attempts[attempts.length - 1];
  const passed = latestAttempt?.passed === true;

  let status: "completed" | "in_progress" | "not_started" = "not_started";
  if (passed) {
    status = "completed";
  } else if (attemptsCount > 0) {
    status = "in_progress";
  }

  const firstPassSuccess = attemptsCount > 0 && attempts[0]?.passed === true;
  const totalDurationMs = attempts.reduce((acc, a) => acc + (a.durationMs || 0), 0);
  const totalTimeMinutes = Math.round((totalDurationMs / 60000) * 10) / 10;

  const dodStatus = spec.dod.map((item) => ({
    item,
    completed: passed,
  }));

  return {
    labDir,
    title: spec.title,
    subject: spec.subject,
    module: spec.module,
    language: spec.language,
    status,
    attemptsCount,
    firstPassSuccess,
    totalTimeMinutes,
    timeboxMinutes: spec.timeboxMinutes,
    hintsUsed,
    latestAttempt,
    dodStatus,
  };
}

export function formatLabStatusReport(data: LabStatusData): string {
  const lines: string[] = [
    `# Báo cáo thực hành: ${data.title}`,
    `- Môn học: ${data.subject}${data.module ? ` (Module: ${data.module})` : ""}`,
    `- Ngôn ngữ: ${data.language}`,
    `- Trạng thái: ${
      data.status === "completed"
        ? "ĐÃ HOÀN THÀNH (Completed)"
        : data.status === "in_progress"
          ? "ĐANG LÀM (In Progress)"
          : "CHƯA BẮT ĐẦU (Not Started)"
    }`,
    `- Số lần chạy (attempts): ${data.attemptsCount}`,
    `- Đạt ngay lần đầu (First-pass): ${data.firstPassSuccess ? "Có" : "Chưa"}`,
    `- Tổng thời gian chạy test: ${data.totalTimeMinutes} phút${
      data.timeboxMinutes ? ` / Giới hạn timebox: ${data.timeboxMinutes} phút` : ""
    }`,
  ];

  if (data.latestAttempt) {
    lines.push(
      "",
      `## Lần chạy gần nhất (Attempt #${data.latestAttempt.attempt})`,
      `- Thời gian: ${data.latestAttempt.timestamp}`,
      `- Kết quả: ${data.latestAttempt.passedCount}/${data.latestAttempt.total} kiểm tra đạt`,
    );
    if (data.latestAttempt.prediction) {
      lines.push(`- Dự đoán trước chạy: "${data.latestAttempt.prediction}"`);
    }
    if (data.latestAttempt.gap) {
      lines.push(`- Điểm lệch (Gap): ${data.latestAttempt.gap}`);
    }
  }

  // Hints used
  const hintKeys = Object.keys(data.hintsUsed);
  if (hintKeys.length > 0) {
    lines.push("", "## Gợi ý bậc thang đã dùng (Tutoring Ladder Hints)");
    for (const k of hintKeys) {
      lines.push(`- ${k}: Level ${data.hintsUsed[k]} / 4`);
    }
  }

  // DoD
  lines.push("", "## Tiêu chuẩn hoàn thành (Definition of Done)");
  for (const dod of data.dodStatus) {
    lines.push(`- [${dod.completed ? "x" : " "}] ${dod.item}`);
  }

  return lines.join("\n");
}

/* ───────── Global Stats Report ───────── */

export interface GlobalStatsData {
  rootScanned: string;
  totalLabs: number;
  completedLabs: number;
  inProgressLabs: number;
  notStartedLabs: number;
  totalAttempts: number;
  firstPassRatePercent: number;
  totalTimeMinutes: number;
  frequentFailingChecks: Array<{ check: string; count: number }>;
  hintsConsumedByLevel: Record<number, number>;
  labsList: Array<{ title: string; dir: string; status: string; attempts: number }>;
}

/** Shallow discovery of labs (depth <= 2, never scanning node_modules or full drive) */
export function discoverLabDirs(root: string): string[] {
  const labs: string[] = [];
  if (existsSync(join(root, "lab.json"))) {
    return [root];
  }

  // Inspect level 1
  try {
    const entries = readdirSync(root, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      if (ent.name.startsWith(".") || ent.name === "node_modules" || ent.name === "dist" || ent.name === "build") {
        continue;
      }
      const sub1 = join(root, ent.name);
      if (existsSync(join(sub1, "lab.json"))) {
        labs.push(sub1);
        continue;
      }

      // Inspect level 2
      try {
        const subEntries = readdirSync(sub1, { withFileTypes: true });
        for (const subEnt of subEntries) {
          if (!subEnt.isDirectory()) continue;
          if (subEnt.name.startsWith(".") || subEnt.name === "node_modules") continue;
          const sub2 = join(sub1, subEnt.name);
          if (existsSync(join(sub2, "lab.json"))) {
            labs.push(sub2);
          }
        }
      } catch {
        // ignore permission or unreadable folders
      }
    }
  } catch {
    // ignore
  }

  return labs;
}

export async function getGlobalStats(rootDir = process.cwd()): Promise<GlobalStatsData> {
  const labDirs = discoverLabDirs(rootDir);

  let completedLabs = 0;
  let inProgressLabs = 0;
  let notStartedLabs = 0;
  let totalAttempts = 0;
  let firstPassSuccessCount = 0;
  let totalTimeMs = 0;

  const failingCheckCounts: Record<string, number> = {};
  const hintsConsumedByLevel: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const labsList: Array<{ title: string; dir: string; status: string; attempts: number }> = [];

  for (const ldir of labDirs) {
    const spec = await readJson<LabSpec>(join(ldir, "lab.json"));
    if (!spec) continue;

    const statusData = await getLabStatus(ldir, spec);
    if (statusData.status === "completed") {
      completedLabs++;
      if (statusData.firstPassSuccess) firstPassSuccessCount++;
    } else if (statusData.status === "in_progress") {
      inProgressLabs++;
    } else {
      notStartedLabs++;
    }

    totalAttempts += statusData.attemptsCount;
    totalTimeMs += statusData.totalTimeMinutes * 60000;

    labsList.push({
      title: spec.title,
      dir: ldir,
      status: statusData.status,
      attempts: statusData.attemptsCount,
    });

    // Check hints
    for (const lvl of Object.values(statusData.hintsUsed)) {
      if (lvl >= 1 && lvl <= 4) {
        hintsConsumedByLevel[lvl] = (hintsConsumedByLevel[lvl] ?? 0) + 1;
      }
    }

    // Check failures from history
    const history = await readAttemptsLog(ldir);
    for (const rec of history) {
      if (rec.type === "attempt" && rec.tests) {
        for (const t of rec.tests) {
          if (t.status === "failed" || t.status === "error") {
            failingCheckCounts[t.name] = (failingCheckCounts[t.name] ?? 0) + 1;
          }
        }
      }
    }
  }

  const firstPassRatePercent =
    completedLabs > 0 ? Math.round((firstPassSuccessCount / completedLabs) * 100) : 0;

  const frequentFailingChecks = Object.entries(failingCheckCounts)
    .map(([check, count]) => ({ check, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    rootScanned: rootDir,
    totalLabs: labDirs.length,
    completedLabs,
    inProgressLabs,
    notStartedLabs,
    totalAttempts,
    firstPassRatePercent,
    totalTimeMinutes: Math.round((totalTimeMs / 60000) * 10) / 10,
    frequentFailingChecks,
    hintsConsumedByLevel,
    labsList,
  };
}

export function formatGlobalStatsReport(data: GlobalStatsData): string {
  const lines: string[] = [
    `# Thống kê tổng quan Orion Labs`,
    `- Thư mục quét: ${data.rootScanned}`,
    `- Tổng số bài thực hành (labs): ${data.totalLabs}`,
    `  - Đã hoàn thành (100% test pass): ${data.completedLabs}`,
    `  - Đang thực hành: ${data.inProgressLabs}`,
    `  - Chưa bắt đầu: ${data.notStartedLabs}`,
    `- Tổng số lần chạy test (attempts): ${data.totalAttempts}`,
    `- Tỉ lệ đạt ngay lần đầu (First-pass rate): ${data.firstPassRatePercent}%`,
    `- Tổng thời gian kiểm thử: ${data.totalTimeMinutes} phút`,
    "",
    "## Phân bố gợi ý bậc thang đã sử dụng (Tutoring Ladder)",
    `- Level 1 (Symptom): ${data.hintsConsumedByLevel[1] ?? 0}`,
    `- Level 2 (Questions): ${data.hintsConsumedByLevel[2] ?? 0}`,
    `- Level 3 (Counter-example): ${data.hintsConsumedByLevel[3] ?? 0}`,
    `- Level 4 (Pseudocode/Signatures): ${data.hintsConsumedByLevel[4] ?? 0}`,
    `- Level 5 (Solution code): 0 (luôn từ chối bởi Orion)`,
  ];

  if (data.frequentFailingChecks.length > 0) {
    lines.push("", "## Các bài kiểm tra hay gặp lỗi nhất");
    for (const fc of data.frequentFailingChecks) {
      lines.push(`- ${fc.check}: ${fc.count} lần thất bại`);
    }
  }

  if (data.labsList.length > 0) {
    lines.push("", "## Danh sách các bài lab");
    for (const lb of data.labsList) {
      lines.push(`- [${lb.status}] ${lb.title} (${lb.attempts} attempts) - ${lb.dir}`);
    }
  }

  return lines.join("\n");
}
