import { z } from "zod";
import { closest, normRelPath, pathsOverlap, relPathProblem } from "./util.js";

export const RUNNERS = ["pytest", "node", "command"] as const;
export type RunnerType = (typeof RUNNERS)[number];

export const LANGUAGES = ["python", "node", "other"] as const;
export type LanguageType = (typeof LANGUAGES)[number];

/** Warm-up (PRIMM) stage kinds, from most to least assistance. The main lab is the final "make" stage. */
export const WARMUP_KINDS = ["example", "complete", "parsons", "modify"] as const;
export type WarmupKind = (typeof WARMUP_KINDS)[number];

export const WARMUP_MAX_STAGES = 4;

/** Stage ids that would collide with CLI actions (`orion stage <lab> <stage> run|done|status`). */
export const RESERVED_STAGE_IDS = ["run", "done", "status"] as const;

export interface ValidationOutcome<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

type ShapeLike = Record<string, unknown>;
type ShapeResolver = (path: ReadonlyArray<PropertyKey>) => ShapeLike | undefined;

export function formatZodErrors(issues: z.ZodIssue[], schemaShape?: ShapeLike | ShapeResolver): string[] {
  return issues.slice(0, 25).map((issue) => {
    let where = "";
    issue.path.forEach((seg) => {
      if (typeof seg === "number") {
        where += `[${seg}]`;
      } else {
        where += where ? `.${String(seg)}` : String(seg);
      }
    });

    let msg = issue.message;
    const issueObj = issue as unknown as Record<string, unknown>;
    if (issue.code === "unrecognized_keys") {
      const keys = (issueObj.keys as string[]) ?? [];
      const shape = typeof schemaShape === "function" ? schemaShape(issue.path) : schemaShape;
      const allowed = shape ? Object.keys(shape) : [];
      const hints = keys.map((k) => [k, closest(k, allowed)] as const).filter(([, s]) => Boolean(s));
      if (hints.length) {
        msg += ` (did you mean ${hints.map(([k, s]) => `"${s}" for "${k}"`).join(", ")}?)`;
      }
      if (allowed.length) {
        msg += ` - allowed keys: ${allowed.join(", ")}`;
      }
    } else if (issue.code === "invalid_value") {
      const values = (issueObj.values as string[]) ?? (issueObj.options as string[]) ?? [];
      const received = (issueObj.input as string) ?? (issueObj.received as string);
      if (received && values.length) {
        const guess = closest(String(received), values);
        if (guess) {
          msg += ` (did you mean "${guess}"?)`;
        }
      }
    }
    return `${where || "(root)"}: ${msg}`;
  });
}

/* ───────── Lab Definition (lab.json) ───────── */

/** One single-line Python call expression, e.g. run_agent("q", max_steps=3). */
export const TRACE_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*\s*\([^\r\n]*\)$/;

export const LabCheckSchema = z.strictObject({
  concept: z.string().min(1).describe("Concept or topic tag e.g. 'max-steps-limit'"),
  hints: z
    .array(z.string().min(1))
    .min(1)
    .max(4)
    .describe(
      "Tutoring ladder hints: [0]=L1 symptom, [1]=L2 questions, [2]=L3 counter-example, [3]=L4 pseudocode/signatures",
    ),
  trace: z
    .string()
    .min(1)
    .max(300)
    .regex(
      TRACE_PATTERN,
      'trace must be one single-line Python call expression such as run_agent("q", max_steps=3)',
    )
    .optional()
    .describe(
      "Python call expression reproducing the minimal counter-example; hints at Level 3+ link it to Mira (mira_record { lab, call })",
    ),
});
export type LabCheck = z.output<typeof LabCheckSchema>;

export const LabTestsSchema = z.strictObject({
  runner: z.enum(RUNNERS).default("pytest").describe("Test runner: pytest | node | command"),
  path: z.string().optional().describe("Path to test file or test folder relative to lab root"),
  command: z.string().optional().describe("Custom shell command to execute if runner is command"),
  timeoutSec: z.number().int().min(1).max(600).default(120).describe("Test execution timeout in seconds (default: 120)"),
});
export type LabTests = z.output<typeof LabTestsSchema>;

export const WarmupStageSchema = z.strictObject({
  id: z
    .string()
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/,
      "stage id must be 1-40 characters of letters, digits, '_', '.', '-' (starting with a letter or digit)",
    )
    .describe("Stage id, unique in the lab, e.g. 'w1' (not run, done, status)"),
  kind: z
    .enum(WARMUP_KINDS)
    .describe("example (worked example, studied) | complete (fill the gaps) | parsons (reorder lines) | modify (change a working program)"),
  title: z.string().min(1).describe("Stage title shown to the learner"),
  file: z.string().min(1).describe("Stage material relative to the lab folder, e.g. 'warmup/w1_example.py'"),
  tests: LabTestsSchema.optional().describe("Stage tests (required for complete, parsons, modify; optional for example)"),
  player: z.string().min(1).optional().describe("Optional path to a Mira trace player for an example stage"),
  note: z.string().max(1000).optional().describe("Optional note: what to look at, and how the stage mirrors the main task"),
});
export type WarmupStage = z.output<typeof WarmupStageSchema>;

export const LabSpecSchema = z.strictObject({
  title: z.string().min(1).describe("Lab title"),
  subject: z.string().min(1).describe("Subject name or slug e.g. 'AI Agents 101'"),
  module: z.string().optional().describe("Module identifier e.g. 'M1'"),
  language: z.enum(LANGUAGES).default("python").describe("Language: python | node | other"),
  entry: z.string().min(1).describe("Learner file relative to lab root e.g. 'my_react.py'"),
  starter: z.string().optional().describe("Starter code or relative path to template"),
  tests: LabTestsSchema,
  timeboxMinutes: z.number().int().min(1).optional().describe("Estimated target timebox in minutes"),
  warmup: z
    .array(WarmupStageSchema)
    .max(WARMUP_MAX_STAGES)
    .optional()
    .describe("Optional warm-up ladder (PRIMM), 0-4 stages in order; the main lab is the final 'make' stage"),
  dod: z.array(z.string().min(1)).min(1).describe("Definition of Done checklist"),
  checks: z.record(z.string(), LabCheckSchema).describe("Map of check/test patterns to concept and hints"),
  // Mutable lab state stored directly in lab.json
  pendingPrediction: z.string().optional().describe("Pending prediction for the next test run"),
  hintLevels: z.record(z.string(), z.number().int().min(1).max(4)).optional().describe("Recorded hint levels given so far per check"),
});
export type LabSpec = z.output<typeof LabSpecSchema>;
export type LabSpecInput = z.input<typeof LabSpecSchema>;

/** Resolves which object shape an "unrecognized key" issue refers to, so suggestions list the right keys. */
function labShapeForPath(path: ReadonlyArray<PropertyKey>): ShapeLike | undefined {
  const [a, b, c] = path;
  if (path.length === 0) return LabSpecSchema.shape;
  if (a === "tests" && path.length === 1) return LabTestsSchema.shape;
  if (a === "checks" && typeof b === "string" && path.length === 2) return LabCheckSchema.shape;
  if (a === "warmup" && typeof b === "number") {
    if (path.length === 2) return WarmupStageSchema.shape;
    if (c === "tests" && path.length === 3) return LabTestsSchema.shape;
  }
  return undefined;
}

/**
 * Cross-field rules for the warm-up ladder that a plain object schema cannot express.
 * Warm-up material is an ISOMORPHIC problem, never the lab's own solution: stages therefore never share the lab's
 * entry file or tests, and their tests must not be collected by the main run.
 */
export function warmupProblems(spec: LabSpec): string[] {
  const stages = spec.warmup ?? [];
  const problems: string[] = [];
  if (stages.length === 0) return problems;

  const entryNorm = normRelPath(spec.entry).toLowerCase();
  const mainTestsPath = spec.tests.path;
  const seenIds = new Map<string, number>();
  const seenFiles = new Map<string, number>();
  const testPaths: Array<{ index: number; path: string }> = [];
  let anyStageTests = false;

  stages.forEach((st, i) => {
    const at = `warmup[${i}]`;

    // id
    if ((RESERVED_STAGE_IDS as readonly string[]).includes(st.id.toLowerCase())) {
      problems.push(`${at}.id: "${st.id}" is reserved (${RESERVED_STAGE_IDS.join(", ")})`);
    }
    const idKey = st.id.toLowerCase();
    const sameId = seenIds.get(idKey);
    if (sameId !== undefined) {
      problems.push(`${at}.id: duplicate stage id "${st.id}" (already used by warmup[${sameId}])`);
    } else {
      seenIds.set(idKey, i);
    }

    // file
    const fileProblem = relPathProblem(st.file);
    if (fileProblem) {
      problems.push(`${at}.file: ${fileProblem}`);
    } else {
      const fileNorm = normRelPath(st.file).toLowerCase();
      if (fileNorm === entryNorm) {
        problems.push(
          `${at}.file: must not be the lab entry file "${spec.entry}" (warm-up material is an isomorphic problem, never the lab's own solution)`,
        );
      }
      const sameFile = seenFiles.get(fileNorm);
      if (sameFile !== undefined) {
        problems.push(`${at}.file: "${st.file}" is already used by warmup[${sameFile}]`);
      } else {
        seenFiles.set(fileNorm, i);
      }
      if (mainTestsPath && pathsOverlap(st.file, mainTestsPath)) {
        problems.push(`${at}.file: must not overlap the main tests path "${mainTestsPath}"`);
      }
    }

    // kind rules
    if (st.kind !== "example" && !st.tests) {
      problems.push(`${at}.tests: required for kind "${st.kind}" (this stage is checked by its own tests)`);
    }
    if (st.player !== undefined) {
      if (st.kind !== "example") {
        problems.push(`${at}.player: only valid for kind "example"`);
      } else if (/[\r\n]/.test(st.player) || st.player !== st.player.trim()) {
        problems.push(`${at}.player: must be a single-line path without leading or trailing spaces`);
      }
    }

    // tests rules
    const t = st.tests;
    if (t) {
      anyStageTests = true;
      if (t.runner === "command") {
        if (!t.command || !t.command.trim()) {
          problems.push(`${at}.tests.command: required when runner is "command"`);
        } else if (spec.tests.runner === "command" && spec.tests.command?.trim() === t.command.trim()) {
          problems.push(`${at}.tests.command: must differ from the main tests command (warm-up checks its own isomorphic problem)`);
        }
        if (t.path !== undefined) {
          const pp = relPathProblem(t.path);
          if (pp) problems.push(`${at}.tests.path: ${pp}`);
        }
      } else if (!t.path) {
        problems.push(
          `${at}.tests.path: required for runner "${t.runner}" (without a path the runner would also collect the main tests)`,
        );
      } else {
        const pp = relPathProblem(t.path);
        if (pp) {
          problems.push(`${at}.tests.path: ${pp}`);
        } else {
          if (mainTestsPath && pathsOverlap(t.path, mainTestsPath)) {
            problems.push(`${at}.tests.path: must not overlap the main tests path "${mainTestsPath}"`);
          }
          if (pathsOverlap(t.path, spec.entry)) {
            problems.push(`${at}.tests.path: must not be or contain the lab entry file "${spec.entry}"`);
          }
          if (normRelPath(t.path).toLowerCase() === normRelPath(st.file).toLowerCase()) {
            problems.push(`${at}.tests.path: must differ from the stage file "${st.file}"`);
          }
          for (const prev of testPaths) {
            if (pathsOverlap(t.path, prev.path)) {
              problems.push(`${at}.tests.path: overlaps warmup[${prev.index}].tests.path ("${prev.path}")`);
              break;
            }
          }
          testPaths.push({ index: i, path: t.path });
        }
      }
    }
  });

  // The main run must not collect the warm-up tests: it needs its own explicit path.
  if (anyStageTests && spec.tests.runner !== "command" && !spec.tests.path) {
    problems.push(
      `tests.path: required when warmup stages have tests (otherwise the main run would also execute the warm-up tests)`,
    );
  }
  return problems;
}

export function validateLabSpec(raw: unknown): ValidationOutcome<LabSpec> {
  const parsed = LabSpecSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: formatZodErrors(parsed.error.issues, labShapeForPath),
    };
  }
  const problems = warmupProblems(parsed.data);
  if (problems.length > 0) return { ok: false, errors: problems };
  return { ok: true, value: parsed.data, errors: [] };
}

/* ───────── Attempt & History Records (orion-attempts.jsonl) ───────── */

export const AttemptTestItemSchema = z.strictObject({
  id: z.string().min(1).describe("Test identifier e.g. 'test_max_steps'"),
  name: z.string().min(1).describe("Test display name"),
  status: z.enum(["passed", "failed", "error", "skipped"]).describe("Test outcome"),
  durationMs: z.number().optional().describe("Test duration in milliseconds"),
  message: z.string().optional().describe("Failure or error message"),
});
export type AttemptTestItem = z.output<typeof AttemptTestItemSchema>;

export const AttemptRecordSchema = z.strictObject({
  type: z.literal("attempt").default("attempt"),
  timestamp: z.string().describe("ISO timestamp when the run completed"),
  attempt: z.number().int().min(1).describe("1-based attempt sequence number (per stage for warm-up stage runs)"),
  stage: z.string().min(1).optional().describe("Warm-up stage id when the run executed a warm-up stage; absent for main lab runs"),
  passed: z.boolean().describe("Whether all required tests passed"),
  total: z.number().int().min(0).describe("Total number of tests executed"),
  passedCount: z.number().int().min(0).describe("Number of passing tests"),
  failedCount: z.number().int().min(0).describe("Number of failing tests"),
  skippedCount: z.number().int().min(0).default(0).describe("Number of skipped tests"),
  durationMs: z.number().min(0).describe("Total execution duration in milliseconds"),
  timedOut: z.boolean().default(false).describe("Whether the test run hit the timeout"),
  prediction: z.string().nullable().optional().describe("Learner prediction before the run"),
  gap: z.string().nullable().optional().describe("Evaluated gap between prediction and outcome"),
  tests: z.array(AttemptTestItemSchema).describe("Detailed results for individual tests"),
  hintsUsed: z.record(z.string(), z.number().int()).optional().describe("Snapshot of hint levels used up to this run"),
});
export type AttemptRecord = z.output<typeof AttemptRecordSchema>;

export const HintRecordSchema = z.strictObject({
  type: z.literal("hint").default("hint"),
  timestamp: z.string().describe("ISO timestamp when the hint was requested"),
  check: z.string().min(1).describe("Check identifier"),
  level: z.number().int().min(1).max(4).describe("Tutoring ladder level (1..4)"),
  concept: z.string().min(1).describe("Associated concept tag"),
  hint: z.string().min(1).describe("Hint text given to learner"),
});
export type HintRecord = z.output<typeof HintRecordSchema>;

export const StageRecordSchema = z.strictObject({
  type: z.literal("stage").default("stage"),
  timestamp: z.string().describe("ISO timestamp when the event happened"),
  stage: z.string().min(1).describe("Warm-up stage id"),
  kind: z.enum(WARMUP_KINDS).describe("Stage kind at the time of the event"),
  event: z.literal("studied").describe("An example stage was marked as studied"),
});
export type StageRecord = z.output<typeof StageRecordSchema>;

export type HistoryRecord = AttemptRecord | HintRecord | StageRecord;

/** Any attempt line (main lab or warm-up stage). Lines without `type` but with `tests` are legacy attempts. */
export function isAttemptRecord(r: HistoryRecord): r is AttemptRecord {
  return r.type === "attempt" || ("tests" in r && !("check" in r));
}

/** An attempt of the main lab (no `stage` field). Only these count toward attempts, first pass and export. */
export function isMainAttempt(r: HistoryRecord): r is AttemptRecord {
  return isAttemptRecord(r) && !r.stage;
}

/** An attempt of a warm-up stage (has a `stage` field). */
export function isStageAttempt(r: HistoryRecord): r is AttemptRecord {
  return isAttemptRecord(r) && typeof r.stage === "string" && r.stage.length > 0;
}

export function isStageRecord(r: HistoryRecord): r is StageRecord {
  return r.type === "stage";
}

/* ───────── Exports for Polaris & Vega ───────── */

export const PolarisErrorLogExportSchema = z.strictObject({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  module: z.string().optional(),
  lesson: z.string().optional(),
  prediction: z.string().optional(),
  result: z.string().optional(),
  why: z.string().min(1).describe("Nguyên nhân gốc rễ gây lỗi"),
  fix: z.string().min(1).describe("Cách sửa và quy tắc rút ra"),
  source: z.string().optional().describe("Nguồn hoặc tài liệu tham khảo"),
});
export type PolarisErrorLogExport = z.output<typeof PolarisErrorLogExportSchema>;

export const VegaCardOriginSchema = z.strictObject({
  kind: z.enum([
    "manual",
    "polaris-errorlog",
    "polaris-fact",
    "aurora-notebook",
    "aurora-quiz",
    "aurora-flashcard",
    "aurora-palace",
  ]),
  path: z.string().min(1),
  locator: z.string().optional(),
});

export const VegaCardCandidateSchema = z.strictObject({
  subject: z.string().optional(),
  deck: z.string().optional(),
  kind: z.enum(["basic", "cloze", "palace", "reverse"]).default("basic"),
  front: z.string().min(1),
  back: z.string(),
  hint: z.string().optional(),
  hook: z.string().optional(),
  origin: VegaCardOriginSchema,
  tags: z.array(z.string()).default([]),
});
export type VegaCardCandidate = z.output<typeof VegaCardCandidateSchema>;

/** Where one exported card candidate came from (aligned by index with errorLogEntries and vegaCards). */
export interface ExportCardSource {
  checkKey: string;
  concept: string;
  failCount: number;
  /**
   * False when the failing test matched no check declared in lab.json (import or collection error, timeout,
   * helper test): there is no concept or hint to build a faithful review card from. Defaults to true.
   */
  declared?: boolean;
}

/** Result of writing the Vega inbox file (contract vega-card-inbox.v1). */
export interface VegaInboxOutcome {
  hub: string;
  dir: string;
  /** Absolute path of the inbox file, or null when nothing was written. */
  file: string | null;
  written: number;
  /** Lines that failed validation against the contract and were not written. */
  rejected: Array<{ key: string; errors: string[] }>;
  /** Failing tests that match no declared check, left out of the inbox on purpose. */
  skipped: Array<{ check: string; reason: string }>;
  note?: string;
}

export interface OrionExportResult {
  lab: string;
  title: string;
  errorLogEntries: PolarisErrorLogExport[];
  vegaCards: VegaCardCandidate[];
  cardSources: ExportCardSource[];
  summary: string;
  vegaInbox?: VegaInboxOutcome;
}
