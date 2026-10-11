import { z } from "zod";
import { closest } from "./util.js";

export const RUNNERS = ["pytest", "node", "command"] as const;
export type RunnerType = (typeof RUNNERS)[number];

export const LANGUAGES = ["python", "node", "other"] as const;
export type LanguageType = (typeof LANGUAGES)[number];

export interface ValidationOutcome<T> {
  ok: boolean;
  value?: T;
  errors: string[];
}

export function formatZodErrors(issues: z.ZodIssue[], schemaShape?: Record<string, unknown>): string[] {
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
      const allowed = schemaShape ? Object.keys(schemaShape) : [];
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

export const LabCheckSchema = z.strictObject({
  concept: z.string().min(1).describe("Concept or topic tag e.g. 'max-steps-limit'"),
  hints: z
    .array(z.string().min(1))
    .min(1)
    .max(4)
    .describe(
      "Tutoring ladder hints: [0]=L1 symptom, [1]=L2 questions, [2]=L3 counter-example, [3]=L4 pseudocode/signatures",
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

export const LabSpecSchema = z.strictObject({
  title: z.string().min(1).describe("Lab title"),
  subject: z.string().min(1).describe("Subject name or slug e.g. 'AI Agents 101'"),
  module: z.string().optional().describe("Module identifier e.g. 'M1'"),
  language: z.enum(LANGUAGES).default("python").describe("Language: python | node | other"),
  entry: z.string().min(1).describe("Learner file relative to lab root e.g. 'my_react.py'"),
  starter: z.string().optional().describe("Starter code or relative path to template"),
  tests: LabTestsSchema,
  timeboxMinutes: z.number().int().min(1).optional().describe("Estimated target timebox in minutes"),
  dod: z.array(z.string().min(1)).min(1).describe("Definition of Done checklist"),
  checks: z.record(z.string(), LabCheckSchema).describe("Map of check/test patterns to concept and hints"),
  // Mutable lab state stored directly in lab.json
  pendingPrediction: z.string().optional().describe("Pending prediction for the next test run"),
  hintLevels: z.record(z.string(), z.number().int().min(1).max(4)).optional().describe("Recorded hint levels given so far per check"),
});
export type LabSpec = z.output<typeof LabSpecSchema>;
export type LabSpecInput = z.input<typeof LabSpecSchema>;

export function validateLabSpec(raw: unknown): ValidationOutcome<LabSpec> {
  const parsed = LabSpecSchema.safeParse(raw);
  if (parsed.success) return { ok: true, value: parsed.data, errors: [] };
  return {
    ok: false,
    errors: formatZodErrors(parsed.error.issues, LabSpecSchema.shape),
  };
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
  attempt: z.number().int().min(1).describe("1-based attempt sequence number"),
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

export type HistoryRecord = AttemptRecord | HintRecord;

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

export interface OrionExportResult {
  lab: string;
  title: string;
  errorLogEntries: PolarisErrorLogExport[];
  vegaCards: VegaCardCandidate[];
  summary: string;
}
