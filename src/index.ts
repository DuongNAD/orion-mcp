/**
 * Orion MCP: Practice Lab Engine with Real Test Runners & Tutoring Ladder.
 *
 *   node dist/orion.mjs                     -> MCP server on stdio
 *   node dist/orion.mjs run <lab>           -> CLI run tests with prediction gap
 *   node dist/orion.mjs predict <lab> <p>   -> CLI store prediction for next run
 *   node dist/orion.mjs hint <lab> <c> [l]  -> CLI request tutoring hint (L1..L4)
 *   node dist/orion.mjs status <lab>        -> CLI view lab status & DoD
 *   node dist/orion.mjs stats [root]        -> CLI view global practice stats
 *   node dist/orion.mjs export <lab>        -> CLI export to Polaris & Vega
 *   node dist/orion.mjs new <dir> <spec>    -> CLI scaffold new lab
 *   node dist/orion.mjs guide [topic]       -> CLI view guide
 *   node dist/orion.mjs version             -> 0.1.0
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
  appendHintRecord,
  formatGlobalStatsReport,
  formatLabStatusReport,
  getGlobalStats,
  getLabStatus,
} from "./history.js";
import { exportLab, loadLab, runLab, saveLab, scaffoldLab } from "./lab.js";
import { getHintForCheck } from "./ladder.js";
import { errMsg, VERSION } from "./util.js";

export * from "./guide.js";
export * from "./history.js";
export * from "./lab.js";
export * from "./ladder.js";
export * from "./runner.js";
export * from "./schema.js";
export * from "./util.js";

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

export const INSTRUCTIONS = `Orion MCP is the practice lab engine of the learning hub: hands-on exercises checked by real tests, tutoring ladder hints, predict-then-run, and attempt tracking.

Workflow:
1. orion_predict { lab, prediction } to record your mental model before executing tests.
2. orion_run { lab } to execute the tests with a timeout, evaluate the prediction gap, and inspect failing checks with Level 1 hints only.
3. If blocked, orion_hint { lab, check } to escalate tutoring hints one level at a time (max Level 4).
4. Fix the implementation in the lab entry file, then repeat predict -> run.
5. orion_status { lab } to inspect progress, attempts, hints used, and DoD completion.
6. orion_export { lab } to export repeated mistakes to Polaris error log and Vega memory cards.

Rules:
- Never write the learner's solution: starter files contain only docstrings and TODOs; Orion never provides Level 5 hints (full solution code).
- Tutoring ladder escalation: hints climb one level at a time (1: symptom, 2: guiding questions, 3: minimal counter-example, 4: pseudocode/signatures).
- Real tests: run locally with pytest, node --test, or declared commands; never guess results.
- Predict first: always capture the mental model before execution; learning happens in the gap.
- Learner fit: learner-facing text and READMEs in the learner's language (Vietnamese); no emoji.
- Clean files: only lab.json and append-only orion-attempts.jsonl; no recursive scans of D:.

Done when:
All Definition of Done (DoD) test checks pass with real test runners, attempts are recorded, and gaps are analyzed.`;

export function createServer(): McpServer {
  const server = new McpServer({ name: "orion", version: VERSION }, { instructions: INSTRUCTIONS });

  /* 1. orion_guide */
  server.registerTool(
    "orion_guide",
    {
      title: "Orion Guide & Practice Lab Documentation",
      description:
        "READ FIRST. Documentation on the 5-level tutoring ladder, lab format (lab.json), writing tests and hints, workflows, and runners. No argument = overview.",
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
        "Validate and scaffold a lab folder (lab.json, README.md, tests/, starter entry with TODOs). Refuses to write solution code (the spec has no solution field; starter bodies are TODOs / NotImplementedError). Never overwrites existing entry file.",
      inputSchema: {
        dir: z.string().min(1).describe("Target folder path for the new lab"),
        spec: z.unknown().describe("Lab specification object (matching lab.json schema)"),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ dir, spec }) =>
      safe(async () => {
        const res = await scaffoldLab(dir, spec);
        return text(
          `Khởi tạo thành công bài thực hành tại: ${res.dir}\nCác tệp đã tạo: ${res.files.join(", ")}\nTiêu chuẩn hoàn thành (DoD): ${res.spec.dod.length} mục.`,
        );
      }),
  );

  /* 3. orion_predict */
  server.registerTool(
    "orion_predict",
    {
      title: "Store Learner Prediction Before Run",
      description:
        "Store the learner's prediction of the outcome before a run. The subsequent run evaluates and reports the gap between prediction and reality.",
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
        "Run the tests with a timeout, parse results (JUnit XML / TAP), append an attempt line (time, passed/failed tests, duration, prediction and gap), and return a compact report with Level 1 hints only for failing checks.",
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
        "Get the next ladder level hint for one failing check (Level 1: symptom, Level 2: questions, Level 3: counter-example, Level 4: pseudocode/signatures). Level 5 (full code) is NEVER provided. Usage is recorded.",
      inputSchema: {
        lab: z.string().min(1).describe("Path to the lab folder"),
        check: z.string().min(1).describe("Check / test name to get hint for"),
        level: z.number().int().min(1).optional().describe("Optional explicit ladder level (1..4)"),
      },
      annotations: { readOnlyHint: false, openWorldHint: false },
    },
    async ({ lab, check, level }) =>
      safe(async () => {
        const absDir = resolve(lab);
        const spec = await loadLab(absDir);
        const curLevel = spec.hintLevels?.[check] ?? 0;
        const outcome = getHintForCheck(spec, check, level, curLevel);

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

        const msg = [
          `# Gợi ý bài thực hành: ${outcome.checkKey}`,
          `- Concept: \`${outcome.concept}\``,
          `- Bậc gợi ý: **Level ${outcome.level}/4: ${outcome.levelName}**`,
          "",
          "### Nội dung gợi ý:",
          outcome.hint,
          "",
          `> [!NOTE] Còn lại ${outcome.remainingHints} cấp độ gợi ý bậc thang. Orion không bao giờ cung cấp Level 5 (lời giải hoàn chỉnh).`,
        ].join("\n");

        return text(msg);
      }),
  );

  /* 6. orion_status */
  server.registerTool(
    "orion_status",
    {
      title: "Inspect Lab Status and History",
      description:
        "Inspect attempts, total practice time, hints used per check, first-pass success, and Definition of Done (DoD) status for a lab.",
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
        "Export error-log entries in the Polaris 'Sổ lỗi' shape for checks that failed repeatedly (prediction vs result, concept, hints used) and Vega memory card candidates as JSON ready for polaris_errorlog_add and vega_add.",
      inputSchema: {
        lab: z.string().min(1).describe("Path to the lab folder"),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ lab }) =>
      safe(async () => {
        const absDir = resolve(lab);
        const exportData = await exportLab(absDir);
        const output = [
          exportData.summary,
          "",
          "```json",
          JSON.stringify(
            {
              errorLogEntries: exportData.errorLogEntries,
              vegaCards: exportData.vegaCards,
            },
            null,
            2,
          ),
          "```",
        ].join("\n");
        return text(output);
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

export async function cli(argv: string[]): Promise<number> {
  const cmd = argv[0]?.toLowerCase() ?? "help";
  const isJson = argv.includes("--json");
  const filteredArgs = argv.filter((a) => a !== "--json");

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
  status <lab>                View lab status, attempts, hints used, and DoD
  stats [root]                View global practice stats across all labs
  export <lab>                Export mistakes to Polaris error log and Vega cards
  new <dir> <spec>            Scaffold new lab from spec file or JSON string
  guide [topic]               View Orion guide and tutoring ladder rules
  version                     Print Orion MCP version (0.1.0)
  help                        Show this help message

Options:
  --json                      Output machine-readable JSON`);
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
      const absDir = resolve(labDir);
      const spec = await loadLab(absDir);
      const curLevel = spec.hintLevels?.[check] ?? 0;
      const outcome = getHintForCheck(spec, check, explicitLevel, curLevel);

      if (!spec.hintLevels) spec.hintLevels = {};
      spec.hintLevels[outcome.checkKey] = outcome.level;
      await saveLab(absDir, spec);

      await appendHintRecord(absDir, {
        type: "hint",
        timestamp: new Date().toISOString(),
        check: outcome.checkKey,
        level: outcome.level,
        concept: outcome.concept,
        hint: outcome.hint,
      });

      if (isJson) {
        console.log(JSON.stringify(outcome, null, 2));
      } else {
        console.log(`[${outcome.levelName}] ${outcome.checkKey} (${outcome.concept}):\n${outcome.hint}`);
      }
      return 0;
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
        console.error("Usage: orion export <lab> [--json]");
        return 1;
      }
      const absDir = resolve(labDir);
      const exportData = await exportLab(absDir);
      if (isJson) {
        console.log(JSON.stringify(exportData, null, 2));
      } else {
        console.log(exportData.summary);
        console.log(`Error log entries: ${exportData.errorLogEntries.length}`);
        console.log(`Vega cards: ${exportData.vegaCards.length}`);
      }
      return 0;
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
