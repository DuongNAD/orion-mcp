/**
 * Warm-up ladder (PRIMM) support: stage state derived from the attempts log, Vietnamese reports,
 * TODO skeletons for scaffolding, and the "isomorphic, never the lab's own solution" guard.
 *
 * Pure functions only (no file or process access) so they can be shared by history, lab and the CLI.
 */
import {
  isAttemptRecord,
  isStageRecord,
  type HistoryRecord,
  type LabTests,
  type WarmupKind,
  type WarmupStage,
} from "./schema.js";
import { closest, escapeRegExp, normRelPath, toPosix } from "./util.js";

/* ───────── Labels ───────── */

export const KIND_LABEL: Record<WarmupKind, string> = {
  example: "Ví dụ mẫu",
  complete: "Hoàn thành chỗ trống",
  parsons: "Sắp xếp các dòng (Parsons)",
  modify: "Sửa đổi chương trình",
};

export type StageStateKind = "todo" | "in_progress" | "passed" | "studied";

export const STATE_LABEL: Record<StageStateKind, string> = {
  todo: "Chưa làm",
  in_progress: "Đang làm",
  passed: "Đã đạt",
  studied: "Đã xem",
};

/** The main task is the "make" stage of the ladder. */
export const MAIN_STAGE_LABEL = "Làm chính (Make)";

/** The next-stage suggestion in orion_run is shown only on the first failing attempts of the main lab. */
export const WARMUP_SUGGEST_MAX_ATTEMPTS = 3;

/* ───────── Stage state (derived from the attempts log) ───────── */

export interface StageState {
  id: string;
  kind: WarmupKind;
  title: string;
  file: string;
  state: StageStateKind;
  /** True when the stage is finished: an example that was studied, or a tested stage whose latest run passed. */
  done: boolean;
  hasTests: boolean;
  attempts: number;
  lastPassedCount?: number;
  lastTotal?: number;
  lastRunAt?: string;
  studiedAt?: string;
  player?: string;
  note?: string;
}

export function computeStageStates(stages: WarmupStage[] | undefined, history: HistoryRecord[]): StageState[] {
  // lab.json may be read unvalidated (global stats): tolerate a missing or malformed warmup.
  return (Array.isArray(stages) ? stages : []).map((st) => {
    const runs = history.filter((r) => isAttemptRecord(r) && r.stage === st.id);
    const last = runs[runs.length - 1];
    const lastAttempt = last && isAttemptRecord(last) ? last : undefined;
    const studiedRec = history.find((r) => isStageRecord(r) && r.stage === st.id && r.event === "studied");

    let state: StageStateKind = "todo";
    if (st.kind === "example") {
      if (studiedRec) state = "studied";
    } else if (lastAttempt?.passed) {
      state = "passed";
    } else if (runs.length > 0) {
      state = "in_progress";
    }

    return {
      id: st.id,
      kind: st.kind,
      title: st.title,
      file: st.file,
      state,
      done: state === "passed" || state === "studied",
      hasTests: Boolean(st.tests),
      attempts: runs.length,
      lastPassedCount: lastAttempt?.passedCount,
      lastTotal: lastAttempt?.total,
      lastRunAt: lastAttempt?.timestamp,
      studiedAt: studiedRec?.timestamp,
      player: st.player,
      note: st.note,
    };
  });
}

/** First stage (in ladder order) that is not finished. */
export function nextUnfinished(states: StageState[]): StageState | undefined {
  return states.find((s) => !s.done);
}

/**
 * The natural continuation after the stage at `index`: the next unfinished stage after it,
 * falling back to the first unfinished stage overall (one the learner skipped earlier).
 */
export function nextUnfinishedAfter(states: StageState[], index: number): StageState | undefined {
  return states.slice(index + 1).find((s) => !s.done) ?? nextUnfinished(states);
}

/** Finds a stage by id (exact, then case-insensitive) or by 1-based position. */
export function resolveStage(stages: WarmupStage[], query: string): { index: number; stage: WarmupStage } {
  const q = query.trim();
  let index = stages.findIndex((s) => s.id === q);
  if (index < 0) index = stages.findIndex((s) => s.id.toLowerCase() === q.toLowerCase());
  if (index < 0 && /^\d+$/.test(q)) {
    const n = parseInt(q, 10);
    if (n >= 1 && n <= stages.length) index = n - 1;
  }
  const stage = index >= 0 ? stages[index] : undefined;
  if (!stage) {
    const ids = stages.map((s) => s.id);
    const suggestion = closest(q, ids);
    throw new Error(
      `Stage '${query}' not found in lab.json warmup.${suggestion ? ` Did you mean '${suggestion}'?` : ""} Available stages: ${ids.join(", ") || "(none)"}`,
    );
  }
  return { index, stage };
}

/* ───────── Reports (Vietnamese, learner-facing) ───────── */

export function stateText(s: StageState): string {
  switch (s.state) {
    case "studied":
      return STATE_LABEL.studied;
    case "passed":
      return `${STATE_LABEL.passed} (${s.attempts} lần chạy)`;
    case "in_progress":
      return `${STATE_LABEL.in_progress} (${s.attempts} lần chạy, lần cuối ${s.lastPassedCount ?? 0}/${s.lastTotal ?? 0} đạt)`;
    default:
      return STATE_LABEL.todo;
  }
}

export function describeTests(t: LabTests | undefined): string {
  if (!t) return "(không có kiểm thử)";
  if (t.runner === "command") return `lệnh: ${t.command ?? ""}`;
  if (t.runner === "node") return `node --test ${t.path ?? ""}`.trim();
  return `pytest ${t.path ?? ""}`.trim();
}

/** The ladder block shown by orion_status and `orion_stage status`: warm-up stages, then the main task. */
export function formatLadderLines(states: StageState[], main: { entry: string; statusText: string }): string[] {
  const lines: string[] = ["## Thang học: Khởi động -> Làm chính (PRIMM)"];
  states.forEach((s, i) => {
    lines.push(`${i + 1}. [${s.done ? "x" : " "}] \`${s.id}\` (${KIND_LABEL[s.kind]}) ${s.title} - ${stateText(s)}`);
  });
  lines.push(`${states.length + 1}. ${MAIN_STAGE_LABEL}: \`${main.entry}\` - ${main.statusText}`);
  const next = nextUnfinished(states);
  lines.push(
    next
      ? `- Bậc khởi động tiếp theo: \`${next.id}\` (không bắt buộc, có thể bỏ qua thang khởi động).`
      : "- Đã xong thang khởi động.",
  );
  return lines;
}

export function formatStageDetail(stage: WarmupStage, state: StageState, labDir: string): string[] {
  const dir = toPosix(labDir);
  const lines: string[] = [
    `# Bậc khởi động \`${stage.id}\`: ${stage.title}`,
    `- Loại: ${KIND_LABEL[stage.kind]} (${stage.kind})`,
    `- Trạng thái: ${stateText(state)}`,
    `- Tệp của bậc: \`${stage.file}\``,
    `- Kiểm thử: ${describeTests(stage.tests)}`,
  ];
  if (stage.player) lines.push(`- Trình phát Mira: ${playerLocation(stage.player, dir)}`);
  if (stage.note) lines.push(`- Ghi chú: ${stage.note}`);
  if (state.studiedAt) lines.push(`- Đã xem lúc: ${state.studiedAt}`);
  if (state.lastRunAt) lines.push(`- Lần chạy gần nhất: ${state.lastRunAt}`);
  lines.push(`- ${stageNextAction(stage, dir)}`);
  return lines;
}

/** Absolute (forward-slash) location of a Mira player: a relative `player` is resolved against the lab folder. */
export function playerLocation(player: string, labDirPosix: string): string {
  const isAbs = /^[A-Za-z]:/.test(player) || player.startsWith("/") || player.startsWith("\\");
  return isAbs ? toPosix(player) : `${labDirPosix}/${normRelPath(player)}`;
}

/** What the learner does next with this stage, as a tool call. */
export function stageNextAction(stage: WarmupStage, labDirPosix: string): string {
  const player = stage.player ? ` (trình phát Mira: ${playerLocation(stage.player, labDirPosix)})` : "";
  if (stage.kind === "example" && !stage.tests) {
    return `Đọc \`${stage.file}\`, dự đoán trước rồi điều tra từng bước${player}; xong thì \`orion_stage { lab: "${labDirPosix}", stage: "${stage.id}", action: "done" }\`.`;
  }
  if (stage.kind === "example") {
    return `Đọc \`${stage.file}\`${player}, dự đoán rồi chạy thử bằng \`orion_stage { lab: "${labDirPosix}", stage: "${stage.id}", action: "run" }\`; xong thì \`action: "done"\`.`;
  }
  return `Làm trong \`${stage.file}\`, rồi chạy \`orion_stage { lab: "${labDirPosix}", stage: "${stage.id}", action: "run" }\`.`;
}

/** Non-blocking hint appended to a failing main run during the first attempts. */
export function formatWarmupSuggestion(next: StageState, stage: WarmupStage, labDir: string): string[] {
  return [
    `> [!NOTE] Gợi ý khởi động (không bắt buộc, có thể bỏ qua): bậc \`${next.id}\` (${KIND_LABEL[next.kind]}) "${next.title}" chưa xong.`,
    `> ${stageNextAction(stage, toPosix(labDir))}`,
    "> Lý do: người mới học tốt hơn khi có ví dụ mẫu và bài điền chỗ trống trước, thay vì chỉ nhận gợi ý (xem `orion_guide { topic: \"ladder\" }`).",
  ];
}

export interface StageRunReportInput {
  stage: WarmupStage;
  attempt: number;
  passed: boolean;
  total: number;
  passedCount: number;
  durationMs: number;
  timedOut: boolean;
  timeoutSec: number;
  prediction?: string | null;
  gap?: string | null;
  failing: Array<{ name: string; message?: string }>;
  /** Next unfinished stage after this run (never the stage just passed). */
  next?: StageState;
  entry: string;
}

export function formatStageRunReport(r: StageRunReportInput): string {
  const pct = Math.round((r.passedCount / Math.max(1, r.total)) * 100);
  const lines: string[] = [
    `# Bậc khởi động \`${r.stage.id}\` (${KIND_LABEL[r.stage.kind]}): ${r.stage.title} (Lần #${r.attempt})`,
    `- Kết quả: **${r.passedCount}/${r.total} kiểm tra đạt (${pct}%)**`,
    `- Thời gian chạy lần này: ${(r.durationMs / 1000).toFixed(2)}s`,
  ];
  if (r.prediction) {
    lines.push(`- Dự đoán trước chạy: "${r.prediction}"`);
    if (r.gap) lines.push(`- **Điểm lệch (Gap):** ${r.gap}`);
  }
  if (r.timedOut) {
    lines.push(
      "",
      `> [!WARNING] Kiểm thử bị gián đoạn do vượt quá thời gian tối đa (${r.timeoutSec}s). Toàn bộ tiến trình con đã được dừng.`,
    );
  }
  if (r.passed) {
    lines.push("", `> [!TIP] Đạt bậc \`${r.stage.id}\`.`);
    if (r.next) {
      lines.push(`> Bậc tiếp theo: \`${r.next.id}\` (${KIND_LABEL[r.next.kind]}): ${r.next.title}.`);
    } else {
      lines.push(`> Đã xong thang khởi động. Sẵn sàng làm bài chính: tệp \`${r.entry}\`, chạy \`orion_run\`.`);
    }
  } else {
    lines.push("", "### Các bài kiểm tra chưa đạt");
    for (const f of r.failing) {
      lines.push(`\n#### \`${f.name}\``);
      if (f.message) {
        lines.push(`- **Triệu chứng lỗi:** \`${f.message.split("\n")[0]?.slice(0, 150) ?? ""}\``);
      }
    }
    lines.push(
      "",
      "> [!NOTE] Bậc khởi động không có thang gợi ý như bài chính. Đọc lại ví dụ mẫu ở bậc trước" +
        (r.stage.note ? `, hoặc ghi chú của bậc: ${r.stage.note}` : "."),
    );
  }
  return lines.join("\n");
}

/* ───────── TODO skeletons (never generated code) ───────── */

type CommentStyle = "hash" | "slash" | "plain";

function extOf(file: string): string {
  return file.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
}

function commentStyleFor(file: string): CommentStyle {
  const ext = extOf(file);
  if (["js", "mjs", "cjs", "ts", "tsx", "jsx", "java", "c", "h", "cpp", "cs", "go", "rs", "php", "kt", "swift"].includes(ext)) {
    return "slash";
  }
  if (["md", "txt"].includes(ext)) return "plain";
  return "hash";
}

function commentLines(lines: string[], style: CommentStyle): string[] {
  if (style === "plain") return lines;
  const lead = style === "slash" ? "// " : "# ";
  return lines.map((l) => (l ? `${lead}${l}` : lead.trimEnd()));
}

function docSafe(s: string): string {
  return s.replace(/\\/g, "/").replace(/"""/g, "'''").replace(/[\r\n]+/g, " ");
}

const KIND_TODO: Record<WarmupKind, string[]> = {
  example: [
    "TODO (người soạn lab): dán vào đây một ví dụ mẫu có lời giải đầy đủ của một bài ĐẲNG CẤU (isomorphic).",
    "Đẳng cấu: cùng cấu trúc lời giải với bài chính nhưng khác bề mặt bài toán.",
    "KHÔNG dán lời giải của chính bài chính.",
    "Gợi ý cho người học: dự đoán đầu ra trước, rồi chạy, rồi điều tra từng bước.",
  ],
  complete: [
    "TODO (người soạn lab): dán lời giải của một bài ĐẲNG CẤU với một số bước bị bỏ trống (đánh dấu TODO).",
    "Số chỗ trống nên tăng dần qua các bậc (giảm dần các bước đã làm sẵn). KHÔNG dùng lời giải của chính bài chính.",
  ],
  parsons: [
    "TODO (người soạn lab): liệt kê các dòng mã của một bài ĐẲNG CẤU theo thứ tự bị xáo trộn, mỗi mảnh một dòng.",
    "Người học sắp xếp lại (và thụt lề) cho đúng. KHÔNG dùng lời giải của chính bài chính.",
  ],
  modify: [
    "TODO (người soạn lab): dán một chương trình ĐẲNG CẤU đã chạy đúng; người học sửa nó để thỏa một yêu cầu mới.",
    "Mô tả yêu cầu mới trong ghi chú của bậc (note). KHÔNG dùng lời giải của chính bài chính.",
  ],
};

/** Comment-only skeleton for a stage file; the real isomorphic material is supplied by the spec author. */
export function stageFileSkeleton(stage: WarmupStage): string {
  const style = commentStyleFor(stage.file);
  const header = `[Bậc khởi động ${stage.id} - ${KIND_LABEL[stage.kind]}] ${stage.title}`;
  if (extOf(stage.file) === "py") {
    return ['"""' + docSafe(header), "", ...KIND_TODO[stage.kind], '"""', ""].join("\n");
  }
  return [...commentLines([header, "", ...KIND_TODO[stage.kind]], style), ""].join("\n");
}

/** Whether a tests path names a file (has an extension) rather than a directory. */
export function testsPathIsFile(path: string | undefined): path is string {
  return Boolean(path) && /\.[A-Za-z0-9]+$/.test(normRelPath(path as string));
}

/**
 * Skeleton test for a stage: it fails on purpose until the author replaces it, so an empty stage can never be
 * "passed" by accident. Returns undefined when the runner/extension has no skeleton form.
 */
export function stageTestsSkeleton(stage: WarmupStage): string | undefined {
  const t = stage.tests;
  if (!t || !testsPathIsFile(t.path)) return undefined;
  const ext = extOf(t.path);
  const safeId = stage.id.replace(/[^A-Za-z0-9_]/g, "_");
  if (ext === "py") {
    return [
      '"""' + docSafe(`Kiểm thử cho bậc khởi động ${stage.id}: ${stage.title}`),
      "",
      "TODO (người soạn lab): viết các assert cho bài ĐẲNG CẤU của bậc này (không phải test của bài chính).",
      "Bài kiểm thử mặc định bên dưới chủ ý thất bại cho đến khi bạn thay nó.",
      '"""',
      "",
      "",
      `def test_todo_${safeId}():`,
      `    raise NotImplementedError(${JSON.stringify(`TODO: viết test cho bậc ${stage.id}`)})`,
      "",
    ].join("\n");
  }
  if (["js", "mjs", "cjs", "ts"].includes(ext)) {
    return [
      `import { test } from "node:test";`,
      `import assert from "node:assert/strict";`,
      "",
      `// TODO (người soạn lab): viết kiểm thử cho bài ĐẲNG CẤU của bậc ${stage.id} (không phải test của bài chính).`,
      `// Bài kiểm thử mặc định bên dưới chủ ý thất bại cho đến khi bạn thay nó.`,
      `test(${JSON.stringify(`TODO bậc ${stage.id}`)}, () => {`,
      `  assert.fail(${JSON.stringify(`TODO: viết test cho bậc ${stage.id}`)});`,
      `});`,
      "",
    ].join("\n");
  }
  return undefined;
}

/* ───────── Isomorphic guard ───────── */

function stemOf(path: string): string {
  const base = normRelPath(path).split("/").pop() ?? "";
  return base.replace(/\.[^.]+$/, "");
}

/**
 * Heuristic: does warm-up content import the lab's own entry module? Warm-up must be an isomorphic problem,
 * never the lab's own solution, so a stage that imports the entry file is refused at scaffold time.
 * Skipped when a stage file shares the entry's stem (an import of that stem is then ambiguous).
 */
export function referencesLabEntry(content: string, entry: string, stageFiles: string[]): boolean {
  const norm = normRelPath(entry);
  const base = norm.split("/").pop() ?? norm;
  const stem = stemOf(norm);
  if (!stem) return false;
  if (stageFiles.some((f) => stemOf(f).toLowerCase() === stem.toLowerCase())) return false;

  const dotted = norm.replace(/\.[^.]+$/, "").split("/").join(".");
  const names = Array.from(new Set([dotted, stem])).map(escapeRegExp).join("|");
  const py = new RegExp(`^\\s*(?:from\\s+(?:${names})(?:\\.\\w+)*\\s+import\\b|import\\s+(?:${names})\\b)`, "m");
  if (py.test(content)) return true;

  const js = new RegExp(
    `(?:\\bfrom\\s+|\\brequire\\(\\s*|\\bimport\\(\\s*|\\bimport\\s+)["'][^"']*(?:${escapeRegExp(base)}|[/\\\\]${escapeRegExp(stem)})["']`,
  );
  return js.test(content);
}
