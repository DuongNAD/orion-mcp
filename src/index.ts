/**
 * Orion MCP: Practice Lab Engine with Real Test Runners & Tutoring Ladder.
 *
 *   node dist/orion.mjs                     -> MCP server on stdio
 *   node dist/orion.mjs run <lab>           -> CLI run tests with prediction gap
 *   node dist/orion.mjs predict <lab> <p>   -> CLI store prediction for next run
 *   node dist/orion.mjs hint <lab> <c> [l]  -> CLI request tutoring hint (L1..L4)
 *   node dist/orion.mjs stage <lab> [<stage>] [run|done|status] -> CLI warm-up ladder (PRIMM) stage
 *   node dist/orion.mjs status <lab>        -> CLI view lab status, ladder & DoD
 *   node dist/orion.mjs stats [root]        -> CLI view global practice stats
 *   node dist/orion.mjs export <lab> [--to-vega] [--hub <path>] -> CLI export to Polaris & Vega (+ Vega inbox)
 *   node dist/orion.mjs new <dir> <spec>    -> CLI scaffold new lab
 *   node dist/orion.mjs guide [topic]       -> CLI view guide
 *   node dist/orion.mjs version             -> 0.2.0
 *   node dist/orion.mjs help                -> CLI command list
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { GUIDE_TOPICS, getGuideTopic } from "./guide.js";
import {
  formatGlobalStatsReport,
  formatLabStatusReport,
  getGlobalStats,
  getLabStatus,
} from "./history.js";
import {
  exportLab,
  loadLab,
  requestHint,
  runLab,
  saveLab,
  scaffoldLab,
  stageAction,
  type HintResult,
  type StageAction,
} from "./lab.js";
import { describeInboxOutcome } from "./vega.js";
import { errMsg, VERSION } from "./util.js";

export * from "./guide.js";
export * from "./history.js";
export * from "./lab.js";
export * from "./ladder.js";
export * from "./runner.js";
export * from "./schema.js";
export * from "./util.js";
export * from "./vega.js";
export * from "./warmup.js";

type Content = { type: "text"; text: string };
type ToolResult = { content: Content[]; isError?: boolean };

const text = (t: string, isError = false): ToolResult => ({
  content: [{ type: "text", text: t }],
  ...(isError ? { isError: true } : {}),
});

async function safe(fn: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await fn();
  } catch (e) {
    return text(errMsg(e), true);
  }
}

export const INSTRUCTIONS = `Orion MCP is the practice lab engine of the learning hub: hands-on exercises checked by real tests, an optional warm-up ladder (PRIMM) before the main task, tutoring ladder hints, predict-then-run, and attempt tracking.

Workflow:
1. orion_status { lab } shows the ladder (Khởi động -> Làm chính). If the lab has a warm-up and the learner is a novice, go through it first: orion_stage { lab, stage, action: "done" } after studying an example stage, orion_stage { lab, stage, action: "run" } for complete / parsons / modify stages. It is never blocking: the learner may skip it.
2. orion_predict { lab, prediction } to record your mental model before executing tests.
3. orion_run { lab } to execute the tests with a timeout, evaluate the prediction gap, and inspect failing checks with Level 1 hints only. On the first failing attempts it also names the next unfinished warm-up stage.
4. If blocked, orion_hint { lab, check } to escalate tutoring hints one level at a time (max Level 4). At Level 3+ a check that has a trace adds a Mira link: mira_record { lab, call }.
5. Fix the implementation in the lab entry file, then repeat predict -> run.
6. orion_status { lab } to inspect progress, attempts, hints used, warm-up stages, and DoD completion.
7. orion_export { lab } to export repeated mistakes to Polaris error log and Vega memory cards; with to_vega: true it also writes the card candidates as one Vega inbox file (<hub>/.vega/inbox/), so Vega stays the single review queue.

Rules:
- Never write the learner's solution: starter files contain only docstrings and TODOs; Orion never provides Level 5 hints (full solution code).
- Warm-up material is an ISOMORPHIC problem (same solution structure, different surface), never the lab's own solution. orion_new_lab writes warm-up files only from text supplied in the spec (warmupFiles) or as TODO skeletons; it never generates code itself.
- Tutoring ladder escalation: hints climb one level at a time (1: symptom, 2: guiding questions, 3: minimal counter-example, 4: pseudocode/signatures).
- Before hinting, ground the concept behind a failing check in the course materials with Rigel (search_material).
- Real tests: run locally with pytest, node --test, or declared commands; never guess results.
- Predict first: always capture the mental model before execution; learning happens in the gap.
- Learner fit: learner-facing text and READMEs in the learner's language (Vietnamese); no emoji.
- Clean files: per lab only lab.json, the append-only orion-attempts.jsonl, and the stage and test files named in lab.json; the only file written outside a lab is a new Vega inbox file on request; no recursive scans of D:.

Done when:
All Definition of Done (DoD) test checks pass with real test runners, attempts are recorded, and gaps are analyzed.`;

/** The hint message shown by orion_hint: level, content, then the Mira link at Level 3+ for checks with a trace. */
function formatHintMessage(res: HintResult): string {
  const { outcome, miraLine } = res;
  return [
    `# Gợi ý bài thực hành: ${outcome.checkKey}`,
    `- Concept: \`${outcome.concept}\``,
    `- Bậc gợi ý: **Level ${outcome.level}/4: ${outcome.levelName}**`,
    "",
    "### Nội dung gợi ý:",
    outcome.hint,
    ...(miraLine ? ["", miraLine] : []),
    "",
    `> [!NOTE] Còn lại ${outcome.remainingHints} cấp độ gợi ý bậc thang. Orion không bao giờ cung cấp Level 5 (lời giải hoàn chỉnh).`,
  ].join("\n");
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "orion", version: VERSION }, { instructions: INSTRUCTIONS });

  /* 1. orion_guide */
  server.registerTool(
    "orion_guide",
    {
      title: "Orion Guide & Practice Lab Documentation",
      description:
        "READ FIRST. Documentation on the 5-level tutoring ladder, the warm-up ladder (PRIMM), lab format (lab.json), writing tests and hints, workflows, and runners. No argument = overview.",
      inputSchema: {
        topic: z.enum(GUIDE_TOPICS).optional().describe(`Topic: ${GUIDE_TOPICS.join(" | ")}`),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ topic }) => safe(async () => text(getGuideTopic(topic))),
  );

  /* 2. orion_new_lab */
  server.registerTool(
    "orion_new_lab",
    {
      title: "Scaffold New Practice Lab",
      description:
        "Validate and scaffold a lab folder (lab.json, README.md, tests/, starter entry with TODOs). Refuses to write solution code (the spec has no solution field; starter bodies are TODOs / NotImplementedError). Never overwrites existing files. Optional warm-up ladder (PRIMM): spec.warmup holds 0-4 stages {id, kind: example | complete | parsons | modify, title, file, tests?, player?, note?}; spec.warmupFiles {<relative path>: <text>} supplies the isomorphic stage material and its tests (scaffold-only, not stored in lab.json), otherwise comment-only TODO skeletons are written. Warm-up material must be an isomorphic problem, never the lab's own solution; Orion never generates code itself. Checks may carry trace, a Python call expression that links Level 3+ hints to Mira.",
      inputSchema: {
        dir: z.string().min(1).describe("Target folder path for the new lab"),
        spec: z.unknown().describe("Lab specification object (matching lab.json schema, plus scaffold-only readme, testsContent, warmupFiles)"),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ dir, spec }) =>
      safe(async () => {
        const res = await scaffoldLab(dir, spec);
        const lines = [
          `Khởi tạo thành công bài thực hành tại: ${res.dir}`,
          `Các tệp đã tạo: ${res.files.join(", ")}`,
          `Tiêu chuẩn hoàn thành (DoD): ${res.spec.dod.length} mục.`,
        ];
        const stages = res.spec.warmup ?? [];
        if (stages.length > 0) {
          lines.push(`Thang khởi động (PRIMM): ${stages.length} bậc (${stages.map((s) => `${s.id}:${s.kind}`).join(", ")}), rồi Làm chính.`);
          if (res.warmup.fromSpec.length > 0) {
            lines.push(`- Tệp bậc ghi từ nội dung trong spec (warmupFiles): ${res.warmup.fromSpec.join(", ")}`);
          }
          if (res.warmup.skeleton.length > 0) {
            lines.push(
              `- Khung TODO chỉ có chú thích (người soạn lab thay bằng bài ĐẲNG CẤU, không phải lời giải của bài chính): ${res.warmup.skeleton.join(", ")}`,
            );
          }
          if (res.warmup.kept.length > 0) {
            lines.push(`- Giữ nguyên tệp đã tồn tại: ${res.warmup.kept.join(", ")}`);
          }
        }
        return text(lines.join("\n"));
      }),
  );

  /* 3. orion_predict */
  server.registerTool(
    "orion_predict",
    {
      title: "Store Learner Prediction Before Run",
      description:
        "Store the learner's prediction of the outcome before a run. The next run (orion_run or orion_stage run) evaluates and reports the gap between prediction and reality.",
      inputSchema: {
        lab: z.string().min(1).describe("Path to the lab folder"),
        prediction: z.string().min(1).describe("Learner prediction of pass/fail outcome or behavior"),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ lab, prediction }) =>
      safe(async () => {
        const absDir = resolve(lab);
        const spec = await loadLab(absDir);
        spec.pendingPrediction = prediction.trim();
        await saveLab(absDir, spec);
        return text(
          `Đã ghi nhận dự đoán cho bài lab "${spec.title}":\n"${prediction.trim()}"\nHãy chạy orion_run khi sẵn sàng kiểm tra.`,
        );
      }),
  );

  /* 4. orion_run */
  server.registerTool(
    "orion_run",
    {
      title: "Execute Tests and Return Compact Report",
      description:
        "Run the main tests with a timeout, parse results (JUnit XML / TAP), append an attempt line (time, passed/failed tests, duration, prediction and gap), and return a compact report with Level 1 hints only for failing checks. On the first failing attempts of a lab with a warm-up ladder it also names the next unfinished warm-up stage (never blocking).",
      inputSchema: {
        lab: z.string().min(1).describe("Path to the lab folder"),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ lab }) =>
      safe(async () => {
        const res = await runLab(lab);
        return text(res.reportMarkdown);
      }),
  );

  /* 5. orion_hint */
  server.registerTool(
    "orion_hint",
    {
      title: "Request Next Tutoring Ladder Hint",
      description:
        "Get the next ladder level hint for one failing check (Level 1: symptom, Level 2: questions, Level 3: counter-example, Level 4: pseudocode/signatures). Level 5 (full code) is NEVER provided. Usage is recorded. At Level 3+ for a check that has a trace, the reply adds a Mira link line: mira_record { lab, call }.",
      inputSchema: {
        lab: z.string().min(1).describe("Path to the lab folder"),
        check: z.string().min(1).describe("Check / test name to get hint for"),
        level: z.number().int().min(1).optional().describe("Optional explicit ladder level (1..4)"),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ lab, check, level }) =>
      safe(async () => text(formatHintMessage(await requestHint(lab, check, level)))),
  );

  /* 6. orion_status */
  server.registerTool(
    "orion_status",
    {
      title: "Inspect Lab Status and History",
      description:
        "Inspect attempts, total practice time, hints used per check, first-pass success, the warm-up ladder (Khởi động -> Làm chính) with each stage state, and Definition of Done (DoD) status for a lab.",
      inputSchema: {
        lab: z.string().min(1).describe("Path to the lab folder"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ lab }) =>
      safe(async () => {
        const absDir = resolve(lab);
        const spec = await loadLab(absDir);
        const statusData = await getLabStatus(absDir, spec);
        return text(formatLabStatusReport(statusData));
      }),
  );

  /* 7. orion_stats */
  server.registerTool(
    "orion_stats",
    {
      title: "View Global Practice Lab Statistics",
      description:
        "Inspect global statistics across labs: total attempts, practice time, hints used per check, first-pass rate, completed labs, and frequent failing concepts.",
      inputSchema: {
        root: z.string().optional().describe("Root directory to scan (default: current working directory)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ root }) =>
      safe(async () => {
        const rootDir = root ? resolve(root) : process.cwd();
        const statsData = await getGlobalStats(rootDir);
        return text(formatGlobalStatsReport(statsData));
      }),
  );

  /* 8. orion_export */
  server.registerTool(
    "orion_export",
    {
      title: "Export Repeated Mistakes to Polaris Error Log and Vega Cards",
      description:
        "Export error-log entries in the Polaris 'Sổ lỗi' shape for checks that failed repeatedly (prediction vs result, concept, hints used) and Vega memory card candidates as JSON ready for polaris_errorlog_add and vega_add. With to_vega: true it also writes the card candidates as one new inbox file <hub>/.vega/inbox/orion-<timestamp>-<hex>.jsonl (contract vega-card-inbox.v1: key orion:<lab folder>:<check>, origin orion-attempt; validated, written atomically, never rewriting an existing file).",
      inputSchema: {
        lab: z.string().min(1).describe("Path to the lab folder"),
        to_vega: z
          .boolean()
          .optional()
          .describe("Also write the Vega card candidates as one inbox file under <hub>/.vega/inbox/"),
        hub: z
          .string()
          .optional()
          .describe("Learning hub root for the Vega inbox (default: env ORION_HUB, then env POLARIS_HUB, then D:/02_Learning_Knowledge); used only with to_vega"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ lab, to_vega, hub }) =>
      safe(async () => {
        const absDir = resolve(lab);
        const exportData = await exportLab(absDir, { toVega: to_vega === true, hub });
        const inbox = exportData.vegaInbox;
        const output = [
          exportData.summary,
          "",
          "```json",
          JSON.stringify(
            {
              errorLogEntries: exportData.errorLogEntries,
              vegaCards: exportData.vegaCards,
              ...(inbox ? { vegaInbox: inbox } : {}),
            },
            null,
            2,
          ),
          "```",
          ...(inbox ? ["", ...describeInboxOutcome(inbox)] : []),
        ].join("\n");
        const nothingWritten = inbox !== undefined && inbox.written === 0 && inbox.rejected.length > 0;
        return text(output, nothingWritten);
      }),
  );

  /* 9. orion_stage */
  server.registerTool(
    "orion_stage",
    {
      title: "Warm-up Ladder Stage (PRIMM): Run, Mark Studied, or Inspect",
      description:
        "Work the optional warm-up ladder of a lab (stages in lab.json warmup, then the main task). action run: run that stage's tests with the same runner (attempt lines get a stage field; a pending prediction is consumed). action done: mark an example stage as studied. action status: per-stage state (omit stage for the whole ladder). Warm-up material is an isomorphic problem, never the lab's own solution. Never blocking: the learner may skip the ladder.",
      inputSchema: {
        lab: z.string().min(1).describe("Path to the lab folder"),
        stage: z
          .string()
          .optional()
          .describe("Stage id from lab.json warmup (or its 1-based position). Required for run and done; omit with status for the whole ladder"),
        action: z.enum(["run", "done", "status"]).describe("run | done | status"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    async ({ lab, stage, action }) =>
      safe(async () => {
        const res = await stageAction(lab, stage, action);
        return text(res.report);
      }),
  );

  return server;
}

export async function startMcp(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/* ───────── CLI Command Dispatcher ───────── */

const STAGE_ACTIONS: readonly string[] = ["run", "done", "status"];
const isStageAction = (s: string | undefined): s is StageAction => s !== undefined && STAGE_ACTIONS.includes(s);

export async function cli(argv: string[]): Promise<number> {
  const cmd = argv[0]?.toLowerCase() ?? "help";
  const isJson = argv.includes("--json");
  const toVega = argv.includes("--to-vega");

  // Flags are removed from the positional arguments: --json, --to-vega, --hub <path> | --hub=<path>.
  let hubArg: string | undefined;
  let hubFlagMissingValue = false;
  const filteredArgs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--json" || a === "--to-vega") continue;
    if (a === "--hub") {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) {
        hubFlagMissingValue = true;
      } else {
        hubArg = v;
        i++;
      }
      continue;
    }
    if (a.startsWith("--hub=")) {
      hubArg = a.slice("--hub=".length);
      continue;
    }
    filteredArgs.push(a);
  }

  switch (cmd) {
    case "version":
    case "-v":
    case "--version": {
      console.log(VERSION);
      return 0;
    }

    case "help":
    case "-h":
    case "--help": {
      console.log(`Orion MCP v${VERSION} - Practice Lab & Tutoring Ladder Engine

Usage:
  orion <command> [options]

Commands:
  run <lab>                   Execute lab tests and return compact report
  predict <lab> <text>        Store learner prediction before next test run
  hint <lab> <check> [level]  Request tutoring ladder hint (Level 1..4)
  stage <lab> [stage] [action]  Warm-up ladder (PRIMM) stage: run | done | status (default status)
  status <lab>                View lab status, attempts, hints used, ladder, and DoD
  stats [root]                View global practice stats across all labs
  export <lab>                Export mistakes to Polaris error log and Vega cards
  new <dir> <spec>            Scaffold new lab from spec file or JSON string
  guide [topic]               View Orion guide and tutoring ladder rules
  version                     Print Orion MCP version (${VERSION})
  help                        Show this help message

Options:
  --json                      Output machine-readable JSON
  --to-vega                   export: also write the Vega inbox file (<hub>/.vega/inbox/)
  --hub <path>                export --to-vega: hub root (default: env ORION_HUB, env POLARIS_HUB, D:/02_Learning_Knowledge)`);
      return 0;
    }

    case "guide": {
      const topic = filteredArgs[1];
      const content = getGuideTopic(topic);
      if (isJson) {
        console.log(JSON.stringify({ topic: topic ?? "overview", content }, null, 2));
      } else {
        console.log(content);
      }
      return 0;
    }

    case "new": {
      const dir = filteredArgs[1];
      const specArg = filteredArgs[2];
      if (!dir || !specArg) {
        console.error("Usage: orion new <dir> <spec_file_or_json> [--json]");
        return 1;
      }
      let rawSpec: unknown;
      if (existsSync(specArg)) {
        rawSpec = JSON.parse(readFileSync(specArg, "utf8"));
      } else {
        rawSpec = JSON.parse(specArg);
      }
      const res = await scaffoldLab(dir, rawSpec);
      if (isJson) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log(`Scaffolded lab at: ${res.dir}\nFiles created: ${res.files.join(", ")}`);
        if (res.warmup.skeleton.length > 0) {
          console.log(`Warm-up TODO skeletons (replace with an isomorphic problem): ${res.warmup.skeleton.join(", ")}`);
        }
      }
      return 0;
    }

    case "predict": {
      const labDir = filteredArgs[1];
      const predictionText = filteredArgs.slice(2).join(" ");
      if (!labDir || !predictionText) {
        console.error("Usage: orion predict <lab> <prediction_text> [--json]");
        return 1;
      }
      const absDir = resolve(labDir);
      const spec = await loadLab(absDir);
      spec.pendingPrediction = predictionText.trim();
      await saveLab(absDir, spec);
      if (isJson) {
        console.log(JSON.stringify({ lab: absDir, prediction: spec.pendingPrediction }, null, 2));
      } else {
        console.log(`Stored prediction for lab "${spec.title}": "${spec.pendingPrediction}"`);
      }
      return 0;
    }

    case "run": {
      const labDir = filteredArgs[1];
      if (!labDir) {
        console.error("Usage: orion run <lab> [--json]");
        return 1;
      }
      const res = await runLab(labDir);
      if (isJson) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log(res.reportMarkdown);
      }
      return res.passed ? 0 : 2;
    }

    case "hint": {
      const labDir = filteredArgs[1];
      const check = filteredArgs[2];
      const levelStr = filteredArgs[3];
      if (!labDir || !check) {
        console.error("Usage: orion hint <lab> <check> [level] [--json]");
        return 1;
      }
      const explicitLevel = levelStr ? parseInt(levelStr, 10) : undefined;
      const { outcome, miraLine } = await requestHint(labDir, check, explicitLevel);

      if (isJson) {
        console.log(JSON.stringify({ ...outcome, ...(miraLine ? { mira: miraLine } : {}) }, null, 2));
      } else {
        console.log(`[${outcome.levelName}] ${outcome.checkKey} (${outcome.concept}):\n${outcome.hint}`);
        if (miraLine) console.log(`\n${miraLine}`);
      }
      return 0;
    }

    case "stage": {
      const labDir = filteredArgs[1];
      const rest = filteredArgs.slice(2);
      const usage = "Usage: orion stage <lab> [<stage>] [run|done|status] [--json]";
      if (!labDir || rest.length > 2) {
        console.error(usage);
        return 1;
      }
      let stageId: string | undefined;
      let action: StageAction = "status";
      if (rest.length === 2) {
        stageId = rest[0];
        if (!isStageAction(rest[1])) {
          console.error(usage);
          return 1;
        }
        action = rest[1];
      } else if (rest.length === 1) {
        if (isStageAction(rest[0])) action = rest[0];
        else stageId = rest[0];
      }
      const res = await stageAction(labDir, stageId, action);
      if (isJson) {
        console.log(JSON.stringify(res, null, 2));
      } else {
        console.log(res.report);
      }
      return action === "run" && res.passed === false ? 2 : 0;
    }

    case "status": {
      const labDir = filteredArgs[1];
      if (!labDir) {
        console.error("Usage: orion status <lab> [--json]");
        return 1;
      }
      const absDir = resolve(labDir);
      const spec = await loadLab(absDir);
      const statusData = await getLabStatus(absDir, spec);
      if (isJson) {
        console.log(JSON.stringify(statusData, null, 2));
      } else {
        console.log(formatLabStatusReport(statusData));
      }
      return 0;
    }

    case "stats": {
      const rootArg = filteredArgs[1];
      const rootDir = rootArg ? resolve(rootArg) : process.cwd();
      const statsData = await getGlobalStats(rootDir);
      if (isJson) {
        console.log(JSON.stringify(statsData, null, 2));
      } else {
        console.log(formatGlobalStatsReport(statsData));
      }
      return 0;
    }

    case "export": {
      const labDir = filteredArgs[1];
      if (!labDir) {
        console.error("Usage: orion export <lab> [--to-vega] [--hub <path>] [--json]");
        return 1;
      }
      if (hubFlagMissingValue) {
        console.error("Usage: --hub needs a folder path. orion export <lab> --to-vega --hub <path>");
        return 1;
      }
      const absDir = resolve(labDir);
      const exportData = await exportLab(absDir, { toVega, hub: hubArg });
      const inbox = exportData.vegaInbox;
      if (isJson) {
        console.log(JSON.stringify(exportData, null, 2));
      } else {
        console.log(exportData.summary);
        console.log(`Error log entries: ${exportData.errorLogEntries.length}`);
        console.log(`Vega cards: ${exportData.vegaCards.length}`);
        if (inbox) {
          for (const line of describeInboxOutcome(inbox)) console.log(line);
        }
      }
      return inbox !== undefined && inbox.written === 0 && inbox.rejected.length > 0 ? 3 : 0;
    }

    default: {
      console.error(`Unknown command: ${cmd}. Run 'orion help' for usage.`);
      return 1;
    }
  }
}

// Entrypoint
const isMain =
  Boolean(process.argv[1]) &&
  (resolve(process.argv[1]!) === fileURLToPath(import.meta.url) ||
    basename(process.argv[1]!).startsWith("orion"));

if (isMain) {
  const isCli = process.argv.length > 2 && !["mcp"].includes(process.argv[2]!);
  if (isCli) {
    cli(process.argv.slice(2))
      .then((code) => {
        if (code !== 0) process.exit(code);
      })
      .catch((err) => {
        console.error(errMsg(err));
        process.exit(1);
      });
  } else {
    startMcp().catch((err) => {
      console.error("Failed to start Orion MCP server:", errMsg(err));
      process.exit(1);
    });
  }
}
