#!/usr/bin/env node
/**
 * End-to-end test over real MCP stdio for Orion MCP.
 *
 * Exercises all 9 tools, pytest runner with JUnit XML, TAP parser for node --test,
 * tutoring ladder escalation 1 -> 4 and refusal above 4, predict-then-run gap recording,
 * attempt history log shape, export for Polaris error log and Vega memory cards,
 * timeout handling (sleeping test killed with taskkill /T /F), and CLI commands.
 *
 * v0.2: warm-up ladder (PRIMM) with orion_stage, Mira link (trace) on Level 3+ hints,
 * and the Vega inbox export (contract vega-card-inbox.v1) into a hub under %TEMP%.
 *
 * All fixtures (labs and hubs) are created strictly under %TEMP%; the learner's real hub is never touched.
 *
 *   node scripts/e2e.mjs
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base =
  process.platform === "win32"
    ? join(process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"), "aurora-slides")
    : join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "aurora-slides");

const TOOL = resolve(
  process.env.ORION_TOOLCHAIN ??
    process.env.VEGA_TOOLCHAIN ??
    process.env.POLARIS_TOOLCHAIN ??
    join(base, "toolchain"),
);

const req = createRequire(join(TOOL, "package.json"));
const { Client } = req("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = req("@modelcontextprotocol/sdk/client/stdio.js");

// Import bundled library from dist/orion.mjs
const orionLib = await import(pathToFileURL(join(ROOT, "dist", "orion.mjs")).href);

const TEST_DIR = join(tmpdir(), `orion_e2e_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
rmSync(TEST_DIR, { recursive: true, force: true });
mkdirSync(TEST_DIR, { recursive: true });

let failed = 0;
const ok = (name, cond, detail = "") => {
  if (!cond) failed++;
  // Failures print their full detail; passes only a short single-line one.
  const text = String(detail ?? "");
  const shown = cond ? (text.length <= 120 && !text.includes("\n") ? text : "") : text.slice(0, 800);
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${shown ? `  (${shown})` : ""}`);
};
const textOf = (r) =>
  (r.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");

console.log(`\n=== Running Orion MCP E2E Tests in ${TEST_DIR} ===\n`);

/* ───────── 1. Setup MCP Client over Stdio ───────── */

// A throw-away hub under %TEMP%. ORION_HUB points the spawned server at it, so even a call that forgets the
// `hub` parameter can never write into the learner's real hub (D:/02_Learning_Knowledge).
const SAFE_HUB = join(TEST_DIR, "hub_env");
mkdirSync(SAFE_HUB, { recursive: true });

const client = new Client({ name: "orion-e2e", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(ROOT, "dist", "orion.mjs")],
  stderr: "inherit",
  env: {
    ...process.env,
    ORION_HUB: SAFE_HUB,
  },
});

await client.connect(transport);
const call = (name, args = {}) =>
  client.callTool({ name, arguments: args }, undefined, { timeout: 35000 });

try {
  // 1.1 Server Identification and Instructions
  const info = client.getServerVersion();
  ok("server identifies itself as orion 0.2.0", info?.name === "orion" && info?.version === "0.2.0");

  const instructions = client.getInstructions() ?? "";
  ok(
    "server instructions include Workflow, Rules, and Done when",
    instructions.includes("Workflow:") &&
      instructions.includes("Rules:") &&
      instructions.includes("Done when:") &&
      instructions.includes("Level 5"),
  );
  ok(
    "server instructions state the isomorphic warm-up rule, orion_stage, Mira and to_vega",
    instructions.includes("ISOMORPHIC") &&
      instructions.includes("never the lab's own solution") &&
      instructions.includes("orion_stage") &&
      instructions.includes("mira_record") &&
      instructions.includes("to_vega"),
  );

  // 1.2 Tool Registration Check
  const { tools } = await client.listTools();
  const toolNames = tools.map((t) => t.name).sort();
  ok(
    "all 9 tools registered",
    toolNames.length === 9 &&
      toolNames.includes("orion_guide") &&
      toolNames.includes("orion_new_lab") &&
      toolNames.includes("orion_predict") &&
      toolNames.includes("orion_run") &&
      toolNames.includes("orion_hint") &&
      toolNames.includes("orion_status") &&
      toolNames.includes("orion_stats") &&
      toolNames.includes("orion_export") &&
      toolNames.includes("orion_stage"),
    toolNames.join(", "),
  );
  const stageTool = tools.find((t) => t.name === "orion_stage");
  const stageProps = stageTool?.inputSchema?.properties ?? {};
  ok(
    "orion_stage takes lab, stage, action (run | done | status); stage is optional",
    Boolean(stageProps.lab) &&
      Boolean(stageProps.stage) &&
      JSON.stringify(stageProps.action?.enum) === JSON.stringify(["run", "done", "status"]) &&
      (stageTool?.inputSchema?.required ?? []).includes("action") &&
      !(stageTool?.inputSchema?.required ?? []).includes("stage"),
    JSON.stringify(stageTool?.inputSchema),
  );
  const exportProps = tools.find((t) => t.name === "orion_export")?.inputSchema?.properties ?? {};
  ok(
    "orion_export takes optional to_vega (boolean) and hub (string)",
    exportProps.to_vega?.type === "boolean" && exportProps.hub?.type === "string",
    JSON.stringify(exportProps),
  );

  // 1.3 orion_guide
  let r = await call("orion_guide");
  ok("orion_guide overview", !r.isError && textOf(r).includes("Hướng dẫn sử dụng Orion MCP"));
  r = await call("orion_guide", { topic: "ladder" });
  ok("orion_guide ladder topic", !r.isError && textOf(r).includes("Level 1") && textOf(r).includes("Level 5"));
  r = await call("orion_guide", { topic: "format" });
  ok("orion_guide format topic", !r.isError && textOf(r).includes("lab.json") && textOf(r).includes("DoD"));

  /* ───────── 2. Scaffold Safety & Invariants ───────── */
  console.log("\n--- Testing Lab Scaffolding & Invariants ---");

  const lab1Dir = join(TEST_DIR, "lab1_react");

  // 2.1 Refusal of solution in spec
  r = await call("orion_new_lab", {
    dir: join(TEST_DIR, "bad_lab"),
    spec: {
      title: "Bad Lab",
      subject: "AI Agents",
      language: "python",
      entry: "bad.py",
      tests: { runner: "pytest" },
      dod: ["pass"],
      checks: {},
      solution: "def secret(): pass", // FORBIDDEN FIELD
    },
  });
  ok(
    "orion_new_lab refuses spec with solution field",
    r.isError && textOf(r).includes("solution field"),
    textOf(r),
  );

  // 2.2 Valid scaffold of Python lab
  const pyLabSpec = {
    title: "Vòng lặp ReAct Agent",
    subject: "AMD AI Agents 101",
    module: "M1",
    language: "python",
    entry: "my_react.py",
    tests: {
      runner: "pytest",
      path: "tests/test_react.py",
      timeoutSec: 15,
    },
    timeboxMinutes: 45,
    dod: [
      "Ngắt chính xác khi chạm max_steps",
      "Trả về observation lỗi khi gặp unknown tool",
      "Dừng ngay khi gặp Final Answer",
    ],
    checks: {
      test_max_steps: {
        concept: "loop-termination",
        hints: [
          "L1: Vòng lặp chạy vượt quá số bước max_steps mà không dừng.",
          "L2: Điều kiện dừng (invariants) trong vòng lặp while là gì?",
          "L3: while steps < max_steps: steps += 1",
          "L4: if steps >= max_steps: return 'Max steps reached'",
        ],
      },
      test_unknown_tool: {
        concept: "tool-registry-lookup",
        hints: [
          "L1: Gặp lỗi KeyError hoặc không xử lý được tên tool lạ.",
          "L2: Khi tool không có trong registry, agent trả về lỗi quan sát (Observation) như thế nào?",
          "L3: registry.get(tool_name, None)",
          "L4: if tool_name not in tools: return f'Error: unknown tool {tool_name}'",
        ],
      },
      test_final_answer: {
        concept: "react-final-answer",
        hints: [
          "L1: Không trích xuất và kết thúc ngay khi LLM sinh Final Answer.",
          "L2: Khi có Final Answer, có cần thực thi Action tiếp theo không?",
          "L3: if 'Final Answer:' in text: return text.split('Final Answer:')[1].strip()",
          "L4: match = re.search(r'Final Answer:\\s*(.*)', text); if match: return match.group(1)",
        ],
      },
    },
  };

  r = await call("orion_new_lab", {
    dir: lab1Dir,
    spec: pyLabSpec,
  });
  ok("orion_new_lab scaffolds successfully", !r.isError && existsSync(join(lab1Dir, "lab.json")));
  ok("lab.json created", existsSync(join(lab1Dir, "lab.json")));
  ok("README.md created in Vietnamese", existsSync(join(lab1Dir, "README.md")));
  ok("entry file my_react.py created with TODOs", existsSync(join(lab1Dir, "my_react.py")));

  const starterContent = readFileSync(join(lab1Dir, "my_react.py"), "utf8");
  ok(
    "starter contains TODOs and no solution",
    starterContent.includes("TODO") && !starterContent.includes("def secret"),
  );

  // 2.3 Verify scaffold NEVER overwrites existing entry file
  const customMarker = "# CUSTOM LEARNER WORK IN PROGRESS\n";
  writeFileSync(join(lab1Dir, "my_react.py"), customMarker, "utf8");

  await call("orion_new_lab", {
    dir: lab1Dir,
    spec: pyLabSpec,
  });
  const preservedContent = readFileSync(join(lab1Dir, "my_react.py"), "utf8");
  ok("scaffold preserves existing entry file without overwriting", preservedContent === customMarker);

  /* ───────── 3. Incomplete Python Lab: 1/3 Passes with L1 Hints ───────── */
  console.log("\n--- Testing Incomplete Entry & Prediction Gap ---");

  // Create tests/test_react.py with 3 checks
  const testPyContent = `
import pytest
from my_react import run_agent

def test_max_steps():
    # Only this test will pass in initial implementation
    result = run_agent("test query", max_steps=3, scenario="loop")
    assert result == "Max steps reached"

def test_unknown_tool():
    result = run_agent("use invalid_tool", max_steps=5, scenario="unknown")
    assert "Error: unknown tool" in result

def test_final_answer():
    result = run_agent("finish now", max_steps=5, scenario="final")
    assert result == "42"
`;
  writeFileSync(join(lab1Dir, "tests", "test_react.py"), testPyContent, "utf8");

  // Write incomplete implementation into my_react.py (only test_max_steps passes)
  const incompletePy = `
def run_agent(prompt: str, max_steps: int = 5, scenario: str = "loop") -> str:
    if scenario == "loop":
        return "Max steps reached"
    if scenario == "unknown":
        raise KeyError("tool not found")  # Causes test_unknown_tool to fail
    if scenario == "final":
        return "Wrong answer"  # Causes test_final_answer to fail
    return "default"
`;
  writeFileSync(join(lab1Dir, "my_react.py"), incompletePy, "utf8");

  // 3.1 Store prediction
  r = await call("orion_predict", {
    lab: lab1Dir,
    prediction: "Dự đoán chỉ có test_max_steps pass (1/3), 2 test còn lại fail",
  });
  ok("orion_predict stores prediction", !r.isError && textOf(r).includes("Đã ghi nhận dự đoán"));

  // 3.2 Run tests
  r = await call("orion_run", { lab: lab1Dir });
  const runOutput = textOf(r);
  ok("orion_run executes pytest", !r.isError);
  ok(
    "reports 1/3 tests passed (33%)",
    runOutput.includes("1/3") || runOutput.includes("33%"),
    runOutput.split("\n")[1],
  );
  ok(
    "reports Level 1 hint only for failing checks",
    runOutput.includes("L1: Gặp lỗi KeyError") && runOutput.includes("L1: Không trích xuất"),
  );
  ok(
    "does NOT leak Level 2/3/4 hints in run report",
    !runOutput.includes("L2:") && !runOutput.includes("L3:") && !runOutput.includes("L4:"),
  );
  ok(
    "prediction and gap are reported",
    runOutput.includes("Dự đoán trước chạy") && runOutput.includes("Điểm lệch (Gap)"),
  );

  // 3.3 Verify orion-attempts.jsonl shape
  const attemptsFile = join(lab1Dir, "orion-attempts.jsonl");
  ok("orion-attempts.jsonl exists", existsSync(attemptsFile));
  const attemptLines = readFileSync(attemptsFile, "utf8").trim().split("\n");
  const firstAttempt = JSON.parse(attemptLines[0]);
  ok(
    "attempt record has correct shape",
    firstAttempt.type === "attempt" &&
      firstAttempt.attempt === 1 &&
      firstAttempt.passed === false &&
      firstAttempt.total === 3 &&
      firstAttempt.passedCount === 1 &&
      firstAttempt.failedCount === 2 &&
      Array.isArray(firstAttempt.tests) &&
      firstAttempt.tests.length === 3 &&
      Boolean(firstAttempt.prediction) &&
      Boolean(firstAttempt.gap),
  );

  /* ───────── 4. Tutoring Ladder Hint Escalation (1 -> 4, refusal above 4) ───────── */
  console.log("\n--- Testing Tutoring Ladder Escalation ---");

  // Escalation for test_unknown_tool:
  // Step 1: gets Level 1
  r = await call("orion_hint", { lab: lab1Dir, check: "test_unknown_tool" });
  ok("hint escalation 1 returns Level 1", !r.isError && textOf(r).includes("Level 1/4") && textOf(r).includes("L1: Gặp lỗi KeyError"));

  // Step 2: gets Level 2
  r = await call("orion_hint", { lab: lab1Dir, check: "test_unknown_tool" });
  ok("hint escalation 2 returns Level 2", !r.isError && textOf(r).includes("Level 2/4") && textOf(r).includes("L2: Khi tool không có"));

  // Step 3: gets Level 3
  r = await call("orion_hint", { lab: lab1Dir, check: "test_unknown_tool" });
  ok("hint escalation 3 returns Level 3", !r.isError && textOf(r).includes("Level 3/4") && textOf(r).includes("L3: registry.get"));

  // Step 4: gets Level 4
  r = await call("orion_hint", { lab: lab1Dir, check: "test_unknown_tool" });
  ok("hint escalation 4 returns Level 4", !r.isError && textOf(r).includes("Level 4/4") && textOf(r).includes("L4: if tool_name not in"));

  // Step 5: next escalation is REFUSED (exhausted)
  r = await call("orion_hint", { lab: lab1Dir, check: "test_unknown_tool" });
  ok(
    "refusal when all 4 hints are exhausted",
    r.isError && textOf(r).includes("exhausted"),
    textOf(r),
  );

  // Step 6: explicit level 5 is REFUSED
  r = await call("orion_hint", { lab: lab1Dir, check: "test_unknown_tool", level: 5 });
  ok(
    "refusal of Level 5 (full solution code)",
    r.isError && textOf(r).includes("Refusing hint level 5"),
    textOf(r),
  );

  /* ───────── 5. Lab Status Inspection ───────── */
  r = await call("orion_status", { lab: lab1Dir });
  ok(
    "orion_status reports in_progress and hints used",
    !r.isError &&
      textOf(r).includes("ĐANG LÀM") &&
      textOf(r).includes("test_unknown_tool: Level 4 / 4") &&
      textOf(r).includes("Số lần chạy (attempts): 1"),
  );

  /* ───────── 6. Fixed Python Lab: Passes 3/3 and DoD Done ───────── */
  console.log("\n--- Testing Fixed Entry & DoD Completion ---");

  const fixedPy = `
def run_agent(prompt: str, max_steps: int = 5, scenario: str = "loop") -> str:
    if scenario == "loop":
        return "Max steps reached"
    if scenario == "unknown":
        return "Error: unknown tool foo"
    if scenario == "final":
        return "42"
    return "default"
`;
  writeFileSync(join(lab1Dir, "my_react.py"), fixedPy, "utf8");

  await call("orion_predict", {
    lab: lab1Dir,
    prediction: "Sửa xong code, dự đoán 3/3 pass hoàn toàn",
  });

  r = await call("orion_run", { lab: lab1Dir });
  const fixedRunOutput = textOf(r);
  ok("run after fix passes 3/3", !r.isError && (fixedRunOutput.includes("3/3") || fixedRunOutput.includes("100%")));
  ok("DoD checklist marked completed", fixedRunOutput.includes("[x] Ngắt chính xác"));

  // Check attempts count is now 2
  const updatedAttempts = readFileSync(attemptsFile, "utf8").trim().split("\n");
  const secondAttempt = JSON.parse(updatedAttempts[updatedAttempts.length - 1]);
  ok("attempt #2 recorded with passed: true", secondAttempt.attempt === 2 && secondAttempt.passed === true);

  /* ───────── 7. Export for Polaris & Vega ───────── */
  console.log("\n--- Testing Export to Polaris & Vega ---");

  r = await call("orion_export", { lab: lab1Dir });
  ok("orion_export succeeds", !r.isError && textOf(r).includes("Sổ lỗi") && textOf(r).includes("Vega"));

  const exportMatch = /```json([\s\S]*?)```/.exec(textOf(r));
  ok("export outputs valid JSON payload", Boolean(exportMatch));
  if (exportMatch) {
    const exportedObj = JSON.parse(exportMatch[1].trim());
    ok(
      "exported errorLogEntries format matches Polaris",
      Array.isArray(exportedObj.errorLogEntries) &&
        exportedObj.errorLogEntries.length >= 2 &&
        Boolean(exportedObj.errorLogEntries[0].why) &&
        Boolean(exportedObj.errorLogEntries[0].fix),
    );
    ok(
      "exported vegaCards format matches Vega",
      Array.isArray(exportedObj.vegaCards) &&
        exportedObj.vegaCards.length >= 2 &&
        Boolean(exportedObj.vegaCards[0].front) &&
        Boolean(exportedObj.vegaCards[0].origin),
    );
  }

  /* ───────── 8. Timeout Handling (Sleeping Test Killed with Taskkill) ───────── */
  console.log("\n--- Testing Timeout Handling ---");

  const timeoutLabDir = join(TEST_DIR, "lab_timeout");
  await call("orion_new_lab", {
    dir: timeoutLabDir,
    spec: {
      title: "Timeout Lab",
      subject: "Systems",
      language: "python",
      entry: "sleeper.py",
      tests: {
        runner: "pytest",
        path: "tests/test_sleep.py",
        timeoutSec: 2, // 2 second timeout
      },
      dod: ["Must complete on time"],
      checks: {
        test_sleep: {
          concept: "time-bounded-execution",
          hints: ["L1: Execution exceeded time limit."],
        },
      },
    },
  });

  writeFileSync(
    join(timeoutLabDir, "tests", "test_sleep.py"),
    `
import time
def test_sleep():
    time.sleep(10)  # Exceeds 2s timeout
`,
    "utf8",
  );

  const t0 = Date.now();
  r = await call("orion_run", { lab: timeoutLabDir });
  const elapsedSec = (Date.now() - t0) / 1000;
  ok(
    "timeout killed test within ~2-4s",
    elapsedSec < 6,
    `Elapsed: ${elapsedSec.toFixed(2)}s`,
  );
  ok("timeout reported in output", textOf(r).includes("vượt quá thời gian") || textOf(r).includes("timed out"));

  /* ───────── 9. Node --test Lab (TAP Output Parsing) ───────── */
  console.log("\n--- Testing Node --test Runner ---");

  const nodeLabDir = join(TEST_DIR, "lab_node");
  await call("orion_new_lab", {
    dir: nodeLabDir,
    spec: {
      title: "Node Math Lab",
      subject: "JavaScript",
      language: "node",
      entry: "math.js",
      tests: {
        runner: "node",
        path: "tests/math.test.js",
        timeoutSec: 10,
      },
      dod: ["Add passes", "Multiply passes"],
      checks: {
        "test addition": {
          concept: "addition",
          hints: ["L1: Addition wrong"],
        },
        "test multiplication": {
          concept: "multiplication",
          hints: ["L1: Multiplication wrong"],
        },
      },
    },
  });

  // Write Node entry
  writeFileSync(
    join(nodeLabDir, "math.js"),
    `export function add(a, b) { return a + b; }\nexport function mul(a, b) { return a * b; }\n`,
    "utf8",
  );

  // Write Node test
  writeFileSync(
    join(nodeLabDir, "tests", "math.test.js"),
    `
import { test } from "node:test";
import assert from "node:assert/strict";
import { add, mul } from "../math.js";

test("test addition", () => {
  assert.equal(add(2, 3), 5);
});

test("test multiplication", () => {
  assert.equal(mul(4, 5), 20);
});
`,
    "utf8",
  );

  r = await call("orion_run", { lab: nodeLabDir });
  ok("node --test lab passes 2/2 via TAP parser", !r.isError && textOf(r).includes("2/2"));

  /* ───────── 10. Global Stats Across Labs ───────── */
  console.log("\n--- Testing Global Stats ---");

  r = await call("orion_stats", { root: TEST_DIR });
  ok(
    "orion_stats discovers labs and aggregates statistics",
    !r.isError &&
      textOf(r).includes("Tổng số bài thực hành") &&
      textOf(r).includes("Đã hoàn thành") &&
      textOf(r).includes("Level 1"),
  );

  /* ───────── 11. CLI Commands ───────── */
  console.log("\n--- Testing CLI Commands ---");

  const runCli = (cliArgs) =>
    execFileSync(process.execPath, [join(ROOT, "dist", "orion.mjs"), ...cliArgs], {
      encoding: "utf8",
    });

  const versionOut = runCli(["version"]).trim();
  ok("CLI version prints 0.2.0", versionOut === "0.2.0");

  const helpOut = runCli(["help"]);
  ok("CLI help lists commands", helpOut.includes("run <lab>") && helpOut.includes("predict <lab>"));
  ok(
    "CLI help lists stage, --to-vega and --hub",
    helpOut.includes("stage <lab>") && helpOut.includes("--to-vega") && helpOut.includes("--hub <path>"),
  );

  const jsonStatusOut = runCli(["status", lab1Dir, "--json"]);
  const parsedStatus = JSON.parse(jsonStatusOut);
  ok("CLI status --json outputs valid JSON", parsedStatus.status === "completed" && parsedStatus.attemptsCount === 2);

  const jsonStatsOut = runCli(["stats", TEST_DIR, "--json"]);
  const parsedStats = JSON.parse(jsonStatsOut);
  ok("CLI stats --json outputs valid JSON", parsedStats.totalLabs >= 3);

  /* ═════════════════════ v0.2 helpers ═════════════════════ */

  const toPosix = (p) => p.replace(/\\/g, "/");
  const readLog = (dir) =>
    readFileSync(join(dir, "orion-attempts.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
  const throwsAsync = async (fn) => {
    try {
      await fn();
      return false;
    } catch {
      return true;
    }
  };
  // CLI runner that never throws and always points the hub env vars at the throw-away hub.
  const cliRun = (cliArgs, env = {}) => {
    const res = spawnSync(process.execPath, [join(ROOT, "dist", "orion.mjs"), ...cliArgs], {
      encoding: "utf8",
      env: { ...process.env, ORION_HUB: SAFE_HUB, POLARIS_HUB: SAFE_HUB, ...env },
    });
    return { status: res.status, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
  };

  // Independent re-statement of the vega-card-inbox.v1 line schema (does not use Orion's own validator).
  const CONTRACT_PRODUCERS = ["polaris", "orion", "mira", "aurora", "sirius", "manual"];
  const CONTRACT_ORIGINS = [
    "polaris-fact",
    "polaris-errorlog",
    "polaris-selfcheck",
    "aurora-quiz",
    "aurora-predict",
    "orion-attempt",
    "mira-stop",
    "manual",
  ];
  const CONTRACT_FIELDS = ["v", "t", "producer", "key", "subject", "deck", "kind", "front", "back", "hint", "hook", "origin", "tags", "reason"];
  const contractProblems = (line) => {
    const p = [];
    const isStr = (v) => typeof v === "string";
    for (const k of Object.keys(line)) if (!CONTRACT_FIELDS.includes(k)) p.push(`unknown field ${k}`);
    if (line.v !== 1) p.push("v");
    if (!isStr(line.t) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/.test(line.t) || Number.isNaN(Date.parse(line.t))) p.push("t");
    if (!CONTRACT_PRODUCERS.includes(line.producer)) p.push("producer");
    if (!isStr(line.key) || line.key.length < 1 || line.key.length > 200 || !line.key.startsWith(`${line.producer}:`)) p.push("key");
    if (!isStr(line.subject) || line.subject.length < 1 || line.subject.length > 120) p.push("subject");
    if (line.deck !== undefined && (!isStr(line.deck) || line.deck.length > 120)) p.push("deck");
    if (line.kind !== undefined && !["basic", "cloze", "reverse"].includes(line.kind)) p.push("kind");
    if (!isStr(line.front) || line.front.length < 1 || line.front.length > 600) p.push("front");
    if (!isStr(line.back) || line.back.length > 1200) p.push("back");
    for (const f of ["hint", "hook"]) if (line[f] !== undefined && (!isStr(line[f]) || line[f].length > 200)) p.push(f);
    const o = line.origin;
    if (!o || typeof o !== "object") {
      p.push("origin");
    } else {
      for (const k of Object.keys(o)) if (!["kind", "path", "locator", "href"].includes(k)) p.push(`unknown origin field ${k}`);
      if (!CONTRACT_ORIGINS.includes(o.kind)) p.push("origin.kind");
      if (!isStr(o.path) || o.path.length < 1 || o.path.length > 400) p.push("origin.path");
      if (o.locator !== undefined && (!isStr(o.locator) || o.locator.length > 120)) p.push("origin.locator");
      if (o.href !== undefined && (!isStr(o.href) || o.href.length > 400)) p.push("origin.href");
    }
    if (line.tags !== undefined && (!Array.isArray(line.tags) || line.tags.length > 10 || line.tags.some((t) => !isStr(t) || t.length < 1 || t.length > 40))) p.push("tags");
    if (line.reason !== undefined && (!isStr(line.reason) || line.reason.length > 200)) p.push("reason");
    if (/\p{Extended_Pictographic}/u.test(`${line.front}${line.back}${line.hint ?? ""}${line.reason ?? ""}`)) p.push("emoji");
    return p;
  };

  /* ───────── 12. Warm-up ladder (PRIMM): spec validation ───────── */
  console.log("\n--- Testing Warm-up Ladder: Spec Validation ---");

  const V = orionLib.validateLabSpec;
  const hintSet = (tag) => [`L1: ${tag} triệu chứng`, `L2: ${tag} câu hỏi định hướng`, `L3: ${tag} phản ví dụ`, `L4: ${tag} chữ ký`];
  const WARM_TRACE = 'run(["a", "b", "c", "d"], budget=2)';
  const warmBase = {
    title: "Vòng lặp có ngân sách (fixture)",
    subject: "Orion E2E",
    module: "M0",
    language: "python",
    entry: "budget_loop.py",
    tests: { runner: "pytest", path: "tests/test_budget.py", timeoutSec: 15 },
    timeboxMinutes: 30,
    dod: ["Dừng khi hết ngân sách", "Lệnh lạ trả về lỗi"],
    checks: {
      test_budget_stops: { concept: "loop-budget", trace: WARM_TRACE, hints: hintSet("budget") },
      test_unknown_cmd: { concept: "error-observation", hints: hintSet("unknown") },
    },
  };
  const warmStages = [
    { id: "w1", kind: "example", title: "Ví dụ mẫu: cộng dồn một danh sách", file: "warmup/w1_example.py", player: "warmup/w1.player.html", note: "Dự đoán đầu ra trước khi chạy." },
    { id: "w2", kind: "complete", title: "Điền chỗ trống: cộng dồn", file: "warmup/w2_complete.py", tests: { runner: "pytest", path: "warmup/test_w2.py", timeoutSec: 15 } },
    { id: "w3", kind: "parsons", title: "Sắp xếp lại các dòng", file: "warmup/w3_parsons.py", tests: { runner: "pytest", path: "warmup/test_w3.py", timeoutSec: 15 } },
  ];
  const withWarmup = (warmup, extra = {}) => ({ ...warmBase, ...extra, warmup });
  const stageOk = { id: "w1", kind: "example", title: "Ví dụ", file: "warmup/w1.py" };
  const stageComplete = { id: "w2", kind: "complete", title: "Điền", file: "warmup/w2.py", tests: { runner: "pytest", path: "warmup/test_w2.py" } };
  const rejects = (name, spec, needle) => {
    const res = V(spec);
    ok(name, !res.ok && res.errors.some((e) => e.includes(needle)), res.errors.join(" | "));
  };

  let v = V(withWarmup([stageOk, stageComplete]));
  ok("warm-up: valid ladder (example without tests + complete with tests) is accepted", v.ok, v.errors.join(" | "));
  ok("warm-up: stage tests get the same defaults as the main tests", v.value?.warmup?.[1]?.tests?.timeoutSec === 120 && v.value?.warmup?.[1]?.tests?.runner === "pytest");
  v = V({ ...warmBase });
  ok("warm-up: a lab without warmup stays valid (field is optional)", v.ok && v.value?.warmup === undefined);
  ok("warm-up: zero stages are accepted (0-4)", V(withWarmup([])).ok);
  ok("warm-up: four stages are accepted (0-4)", V(withWarmup([1, 2, 3, 4].map((i) => ({ id: `s${i}`, kind: "example", title: `S${i}`, file: `warmup/s${i}.py` })))).ok);

  rejects("warm-up: complete stage without tests is rejected", withWarmup([{ ...stageComplete, tests: undefined }]), 'warmup[0].tests: required for kind "complete"');
  for (const kind of ["parsons", "modify"]) {
    rejects(`warm-up: ${kind} stage without tests is rejected`, withWarmup([{ id: "x", kind, title: "t", file: "warmup/x.py" }]), `kind "${kind}"`);
  }
  rejects(
    "warm-up: more than 4 stages are rejected",
    withWarmup([1, 2, 3, 4, 5].map((i) => ({ id: `s${i}`, kind: "example", title: `S${i}`, file: `warmup/s${i}.py` }))),
    "warmup",
  );
  rejects("warm-up: stage file equal to the lab entry is rejected", withWarmup([{ ...stageOk, file: "budget_loop.py" }]), "lab entry file");
  rejects("warm-up: entry comparison ignores case and a ./ prefix", withWarmup([{ ...stageOk, file: "./Budget_Loop.py" }]), "lab entry file");
  rejects("warm-up: duplicate stage ids are rejected", withWarmup([stageOk, { ...stageOk, file: "warmup/other.py" }]), "duplicate stage id");
  rejects("warm-up: ids that collide with CLI actions are rejected", withWarmup([{ ...stageOk, id: "run" }]), "reserved");
  rejects("warm-up: duplicate stage files are rejected", withWarmup([stageOk, { ...stageOk, id: "w9" }]), "already used");
  rejects("warm-up: a stage file escaping the lab folder is rejected", withWarmup([{ ...stageOk, file: "../outside.py" }]), "..");
  rejects("warm-up: an absolute stage file is rejected", withWarmup([{ ...stageOk, file: "C:/x/w1.py" }]), "relative");
  rejects(
    "warm-up: stage tests equal to the main tests path are rejected",
    withWarmup([{ ...stageComplete, tests: { runner: "pytest", path: "tests/test_budget.py" } }]),
    "overlap the main tests path",
  );
  rejects(
    "warm-up: stage tests inside the main tests folder are rejected",
    { ...withWarmup([{ ...stageComplete, tests: { runner: "pytest", path: "tests/test_w2.py" } }]), tests: { runner: "pytest", path: "tests", timeoutSec: 15 } },
    "overlap the main tests path",
  );
  rejects(
    "warm-up: pytest stage tests need a path (otherwise the main tests would be collected)",
    withWarmup([{ ...stageComplete, tests: { runner: "pytest" } }]),
    'tests.path: required for runner "pytest"',
  );
  rejects(
    "warm-up: the main tests need a path when stages have tests (else the main run executes warm-up tests)",
    { ...withWarmup([stageComplete]), tests: { runner: "pytest", timeoutSec: 15 } },
    "tests.path: required when warmup stages have tests",
  );
  rejects("warm-up: a command-runner stage needs a command", withWarmup([{ ...stageComplete, tests: { runner: "command" } }]), "tests.command: required");
  rejects("warm-up: player is only valid for example stages", withWarmup([{ ...stageComplete, player: "warmup/w2.player.html" }]), "only valid for kind");
  rejects(
    "warm-up: two stages sharing a tests path are rejected",
    withWarmup([stageComplete, { ...stageComplete, id: "w3", file: "warmup/w3.py" }]),
    "overlaps warmup[0].tests.path",
  );
  const typo = V(withWarmup([{ ...stageOk, test: { runner: "pytest" } }]));
  ok(
    "warm-up: an unknown key inside a stage lists the stage's own keys and a suggestion",
    !typo.ok &&
      typo.errors.some((e) => e.includes('did you mean "tests" for "test"') && e.includes("allowed keys: id, kind, title, file, tests, player, note")),
    typo.errors.join(" | "),
  );

  const withTrace = (trace) => ({ ...warmBase, checks: { test_budget_stops: { concept: "c", trace, hints: ["h"] } } });
  ok(
    "trace: single-line call expressions are accepted",
    V(withTrace('run(["a"], budget=2)')).ok && V(withTrace("Agent(tools={}).run('q')")).ok && V(withTrace("pkg.mod.fn(1)")).ok,
  );
  ok("trace: a multi-line value is rejected", !V(withTrace("run(1)\nrun(2)")).ok);
  ok("trace: values that are not a call expression are rejected", !V(withTrace("x = 1")).ok && !V(withTrace("import os; run(1)")).ok && !V(withTrace("run")).ok);
  ok("trace: more than 300 characters is rejected", !V(withTrace(`run("${"x".repeat(300)}")`)).ok);

  const RE = orionLib.referencesLabEntry;
  ok(
    "isomorphic guard: python imports of the entry module are detected (import, from, dotted)",
    RE("import budget_loop\n", "budget_loop.py", []) && RE("from budget_loop import run\n", "budget_loop.py", []) && RE("from pkg.mod import x\n", "pkg/mod.py", []),
  );
  ok(
    "isomorphic guard: node import and require of the entry file are detected",
    RE('import { run } from "../budget_loop.js";', "budget_loop.js", []) && RE("const m = require('./budget_loop');", "budget_loop.js", []),
  );
  ok(
    "isomorphic guard: unrelated imports and comments are not flagged",
    !RE("import math\nfrom os import path\n# budget_loop is the main task\n", "budget_loop.py", []),
  );
  ok(
    "isomorphic guard: skipped when a stage file shares the entry stem (the import would be ambiguous)",
    !RE("from budget_loop import run", "budget_loop.py", ["warmup/budget_loop.py"]),
  );

  /* ───────── 12b. Warm-up ladder: scaffold safety ───────── */
  console.log("\n--- Testing Warm-up Ladder: Scaffold ---");

  const badWarmDir = join(TEST_DIR, "bad_warm");
  r = await call("orion_new_lab", { dir: badWarmDir, spec: withWarmup([{ ...stageComplete, tests: undefined }]) });
  ok(
    "orion_new_lab rejects a complete stage without tests and writes nothing",
    r.isError && textOf(r).includes("warmup[0].tests") && !existsSync(badWarmDir),
    textOf(r),
  );
  r = await call("orion_new_lab", {
    dir: badWarmDir,
    spec: { ...withWarmup(warmStages), warmupFiles: { "warmup/test_w2.py": "from budget_loop import run\n\ndef test_x():\n    assert run([], 1) == 0\n" } },
  });
  ok(
    "orion_new_lab refuses warm-up text that imports the lab entry (not isomorphic) and writes nothing",
    r.isError && textOf(r).includes("imports the lab entry file") && textOf(r).includes("isomorphic") && !existsSync(badWarmDir),
    textOf(r),
  );
  r = await call("orion_new_lab", { dir: badWarmDir, spec: { ...withWarmup(warmStages), warmupFiles: { "warmup/not_a_stage.py": "x = 1\n" } } });
  ok(
    "orion_new_lab refuses warmupFiles that do not match a stage path",
    r.isError && textOf(r).includes("not a warm-up stage file") && !existsSync(badWarmDir),
    textOf(r),
  );
  r = await call("orion_new_lab", { dir: badWarmDir, spec: { ...withWarmup(warmStages), warmupFiles: { "budget_loop.py": "def run(c, b):\n    pass\n" } } });
  ok(
    "orion_new_lab cannot write the lab entry file through warmupFiles",
    r.isError && textOf(r).includes("not a warm-up stage file") && !existsSync(badWarmDir),
    textOf(r),
  );
  r = await call("orion_new_lab", { dir: badWarmDir, spec: { ...withWarmup(warmStages), warmupFiles: { "warmup/w1_example.py": "ok\n", solution: "x" } } });
  ok("orion_new_lab still refuses a solution field next to a warm-up", r.isError && textOf(r).includes("solution field") && !existsSync(badWarmDir), textOf(r));

  const MAIN_TESTS = [
    "from budget_loop import run",
    "",
    "def test_budget_stops():",
    '    assert run(["a", "b", "c", "d"], budget=2) == 2',
    "",
    "def test_unknown_cmd():",
    '    assert run(["zzz"], budget=5) == "error: unknown zzz"',
    "",
  ].join("\n");
  const MAIN_INCOMPLETE = "def run(cmds, budget):\n    return 0\n";
  const MAIN_FIXED = [
    "def run(cmds, budget):",
    "    steps = 0",
    "    for c in cmds:",
    '        if c == "zzz":',
    '            return "error: unknown " + c',
    "        if steps >= budget:",
    "            break",
    "        steps += 1",
    "    return steps",
    "",
  ].join("\n");
  const W1_EXAMPLE = "# Ví dụ mẫu (fixture e2e): cộng dồn một danh sách\ndef total(xs):\n    acc = 0\n    for x in xs:\n        acc += x\n    return acc\n";
  const W2_INCOMPLETE = "def total(xs):\n    # TODO: cộng dồn các phần tử\n    raise NotImplementedError\n";
  const W2_TESTS = "from w2_complete import total\n\ndef test_total():\n    assert total([1, 2, 3]) == 6\n\ndef test_total_empty():\n    assert total([]) == 0\n";
  const W2_FIXED = "def total(xs):\n    return sum(xs)\n";
  const W3_TESTS = "from w3_parsons import first\n\ndef test_first():\n    assert first([7, 8]) == 7\n";
  const W3_FIXED = "def first(xs):\n    return xs[0]\n";

  const labWarmDir = join(TEST_DIR, "lab_warm");
  const labWarmSpec = {
    ...withWarmup(warmStages),
    testsContent: MAIN_TESTS,
    warmupFiles: {
      "warmup/w1_example.py": W1_EXAMPLE,
      "warmup/w2_complete.py": W2_INCOMPLETE,
      "warmup/test_w2.py": W2_TESTS,
    },
  };
  r = await call("orion_new_lab", { dir: labWarmDir, spec: labWarmSpec });
  ok("orion_new_lab scaffolds a lab with a 3-stage warm-up ladder", !r.isError && existsSync(join(labWarmDir, "lab.json")), textOf(r));
  const scaffoldText = textOf(r);
  ok(
    "scaffold result lists the ladder, spec-written stage files and TODO skeletons",
    scaffoldText.includes("Thang khởi động (PRIMM): 3 bậc") &&
      scaffoldText.includes("warmupFiles") &&
      scaffoldText.includes("warmup/w1_example.py") &&
      scaffoldText.includes("Khung TODO") &&
      scaffoldText.includes("warmup/w3_parsons.py"),
    scaffoldText,
  );
  const warmLabJson = JSON.parse(readFileSync(join(labWarmDir, "lab.json"), "utf8"));
  ok(
    "lab.json stores the stages and the check trace, but no scaffold-only text",
    warmLabJson.warmup?.length === 3 &&
      warmLabJson.warmup[0].player === "warmup/w1.player.html" &&
      warmLabJson.checks.test_budget_stops.trace === WARM_TRACE &&
      !("warmupFiles" in warmLabJson) &&
      !("testsContent" in warmLabJson) &&
      !JSON.stringify(warmLabJson).includes("NotImplementedError"),
  );
  const rd = (...p) => readFileSync(join(labWarmDir, ...p), "utf8");
  ok("example stage file is written from the text given in the spec", rd("warmup", "w1_example.py").trimEnd() === W1_EXAMPLE.trimEnd());
  ok(
    "complete stage file and its tests are written from the spec",
    rd("warmup", "w2_complete.py").trimEnd() === W2_INCOMPLETE.trimEnd() && rd("warmup", "test_w2.py").trimEnd() === W2_TESTS.trimEnd(),
  );
  const w3File = rd("warmup", "w3_parsons.py");
  const w3Tests = rd("warmup", "test_w3.py");
  ok(
    "a stage without spec text gets a comment-only TODO skeleton (no code generated)",
    w3File.includes("TODO") &&
      w3File.includes("ĐẲNG CẤU") &&
      /KHÔNG (dán|dùng) lời giải của chính bài chính/.test(w3File) &&
      !/^\s*(def|class|import|from)\s/m.test(w3File),
  );
  ok(
    "its test skeleton fails on purpose (NotImplementedError) so an empty stage cannot pass",
    w3Tests.includes("def test_todo_w3") && w3Tests.includes("NotImplementedError") && w3Tests.includes("TODO"),
  );
  ok("scaffold-only testsContent is written to the main tests file", rd("tests", "test_budget.py").trimEnd() === MAIN_TESTS.trimEnd());
  const warmReadme = rd("README.md");
  ok(
    "generated README documents the optional warm-up ladder in Vietnamese",
    warmReadme.includes("Thang khởi động (PRIMM)") && warmReadme.includes("đẳng cấu") && warmReadme.includes("orion_stage") && warmReadme.includes("w2"),
  );
  ok("the entry file is a TODO starter, not a solution", rd("budget_loop.py").includes("TODO") && !rd("budget_loop.py").includes("def run"));

  writeFileSync(join(labWarmDir, "warmup", "w2_complete.py"), "# LEARNER WORK\n", "utf8");
  r = await call("orion_new_lab", { dir: labWarmDir, spec: labWarmSpec });
  ok(
    "re-scaffolding never overwrites existing stage files",
    !r.isError && rd("warmup", "w2_complete.py") === "# LEARNER WORK\n" && textOf(r).includes("Giữ nguyên"),
    textOf(r),
  );
  writeFileSync(join(labWarmDir, "warmup", "w2_complete.py"), W2_INCOMPLETE, "utf8");
  writeFileSync(join(labWarmDir, "budget_loop.py"), MAIN_INCOMPLETE, "utf8");

  /* ───────── 12c. Warm-up ladder: orion_stage and orion_status ───────── */
  console.log("\n--- Testing Warm-up Ladder: orion_stage ---");

  r = await call("orion_status", { lab: labWarmDir });
  let st = textOf(r);
  ok(
    "orion_status shows the ladder Khởi động -> Làm chính with every stage not started",
    !r.isError &&
      st.includes("Khởi động -> Làm chính") &&
      st.includes("`w1`") &&
      st.includes("`w2`") &&
      st.includes("`w3`") &&
      (st.match(/Chưa làm/g) ?? []).length === 3 &&
      st.includes("Làm chính (Make)") &&
      st.includes("CHƯA BẮT ĐẦU"),
    st,
  );
  r = await call("orion_stage", { lab: labWarmDir, action: "status" });
  ok(
    "orion_stage status without a stage prints the whole ladder",
    !r.isError && textOf(r).includes("Thang khởi động") && textOf(r).includes("Bậc khởi động tiếp theo: `w1`"),
    textOf(r),
  );
  r = await call("orion_stage", { lab: labWarmDir, stage: "w1", action: "status" });
  ok(
    "orion_stage status of an example shows kind, file, Mira player and note",
    !r.isError &&
      textOf(r).includes("Ví dụ mẫu (example)") &&
      textOf(r).includes("warmup/w1_example.py") &&
      textOf(r).includes(`Trình phát Mira: ${toPosix(labWarmDir)}/warmup/w1.player.html`) &&
      textOf(r).includes("Dự đoán đầu ra trước khi chạy."),
    textOf(r),
  );
  r = await call("orion_stage", { lab: labWarmDir, stage: "2", action: "status" });
  ok(
    "orion_stage resolves a stage by 1-based position and shows its tests",
    !r.isError && textOf(r).includes("`w2`") && textOf(r).includes("pytest warmup/test_w2.py"),
    textOf(r),
  );
  r = await call("orion_stage", { lab: labWarmDir, stage: "w1", action: "run" });
  ok(
    "orion_stage run on an example stage without tests is refused with guidance",
    r.isError && textOf(r).includes("has no tests") && textOf(r).includes('"done"'),
    textOf(r),
  );
  r = await call("orion_stage", { lab: labWarmDir, stage: "w2", action: "done" });
  ok("orion_stage done on a non-example stage is refused", r.isError && textOf(r).includes("Only example stages"), textOf(r));
  r = await call("orion_stage", { lab: labWarmDir, stage: "ww", action: "run" });
  ok(
    "orion_stage reports an unknown stage with the available ids",
    r.isError && textOf(r).includes("not found") && textOf(r).includes("w1, w2, w3"),
    textOf(r),
  );
  r = await call("orion_stage", { lab: labWarmDir, action: "run" });
  ok("orion_stage run without a stage id is refused", r.isError && textOf(r).includes("needs a stage id"), textOf(r));
  r = await call("orion_stage", { lab: lab1Dir, action: "status" });
  ok("orion_stage status on a lab without warm-up says so (not an error)", !r.isError && textOf(r).includes("không có thang khởi động"), textOf(r));
  r = await call("orion_stage", { lab: lab1Dir, stage: "w1", action: "run" });
  ok("orion_stage run on a lab without warm-up is refused", r.isError && textOf(r).includes("no warm-up ladder"), textOf(r));

  await call("orion_predict", { lab: labWarmDir, prediction: "Bậc w2 còn NotImplementedError nên cả 2 test fail" });
  r = await call("orion_stage", { lab: labWarmDir, stage: "w2", action: "run" });
  let sr = textOf(r);
  ok(
    "orion_stage run executes the stage tests through the same runner (0/2)",
    !r.isError && sr.includes("Bậc khởi động `w2`") && sr.includes("0/2") && sr.includes("Lần #1"),
    sr,
  );
  ok(
    "stage run reports the prediction gap without the main-lab Definition of Done wording",
    sr.includes("Dự đoán trước chạy") && sr.includes("Điểm lệch (Gap)") && !sr.includes("Definition of Done"),
    sr,
  );
  ok(
    "a failing stage run names the failing tests and carries no ladder hints",
    sr.includes("test_total") && sr.includes("Triệu chứng lỗi") && !sr.includes("Level 1") && !sr.includes("L1:"),
    sr,
  );
  let wlog = readLog(labWarmDir);
  ok(
    "the attempt line of a stage run carries the stage field and per-stage numbering",
    wlog.length === 1 &&
      wlog[0].type === "attempt" &&
      wlog[0].stage === "w2" &&
      wlog[0].attempt === 1 &&
      wlog[0].passed === false &&
      wlog[0].total === 2 &&
      Boolean(wlog[0].prediction) &&
      Boolean(wlog[0].gap) &&
      !("hintsUsed" in wlog[0]),
    JSON.stringify(wlog[0]),
  );
  ok("the pending prediction is consumed by the stage run", !("pendingPrediction" in JSON.parse(rd("lab.json"))));
  r = await call("orion_status", { lab: labWarmDir });
  st = textOf(r);
  ok(
    "stage runs do not count as main-lab attempts, and the stage shows as in progress",
    st.includes("Số lần chạy (attempts): 0") && st.includes("CHƯA BẮT ĐẦU") && st.includes("Đang làm (1 lần chạy, lần cuối 0/2 đạt)"),
    st,
  );

  r = await call("orion_run", { lab: labWarmDir });
  let mr = textOf(r);
  ok("main run #1 fails 0/2 with Level 1 hints", mr.includes("Lần #1") && mr.includes("0/2") && mr.includes("L1: budget triệu chứng"), mr);
  ok(
    "main run #1 names the next unfinished warm-up stage (w1), non-blocking",
    mr.includes("Gợi ý khởi động (không bắt buộc, có thể bỏ qua)") && mr.includes("bậc `w1`") && mr.includes('action: "done"'),
    mr,
  );
  ok(
    "the suggestion points at the example's Mira player but never leaks Level 2-4 hints or the hint-level Mira call",
    mr.includes(`trình phát Mira: ${toPosix(labWarmDir)}/warmup/w1.player.html`) &&
      !mr.includes("L2:") &&
      !mr.includes("L3:") &&
      !mr.includes("L4:") &&
      !mr.includes("mira_record"),
    mr,
  );

  r = await call("orion_stage", { lab: labWarmDir, stage: "w1", action: "done" });
  ok(
    "orion_stage done marks the example as studied and points to the next stage",
    !r.isError && textOf(r).includes("là đã xem") && textOf(r).includes("Bậc tiếp theo: `w2`"),
    textOf(r),
  );
  wlog = readLog(labWarmDir);
  const studiedRecs = wlog.filter((x) => x.type === "stage");
  ok(
    "done appends one history record {type: stage, event: studied}",
    studiedRecs.length === 1 &&
      studiedRecs[0].stage === "w1" &&
      studiedRecs[0].kind === "example" &&
      studiedRecs[0].event === "studied" &&
      typeof studiedRecs[0].timestamp === "string",
    JSON.stringify(studiedRecs),
  );
  r = await call("orion_stage", { lab: labWarmDir, stage: "w1", action: "done" });
  ok(
    "done is idempotent: no second record",
    !r.isError && textOf(r).includes("trước đó") && readLog(labWarmDir).filter((x) => x.type === "stage").length === 1,
    textOf(r),
  );

  r = await call("orion_run", { lab: labWarmDir });
  mr = textOf(r);
  ok("main run #2 names w2 now that w1 is studied", mr.includes("Lần #2") && mr.includes("Gợi ý khởi động") && mr.includes("bậc `w2`") && !mr.includes("bậc `w1`"), mr);

  writeFileSync(join(labWarmDir, "warmup", "w2_complete.py"), W2_FIXED, "utf8");
  r = await call("orion_stage", { lab: labWarmDir, stage: "w2", action: "run" });
  sr = textOf(r);
  ok(
    "the completed stage passes 2/2 and points to the next stage",
    sr.includes("2/2") && sr.includes("Lần #2") && sr.includes("Đạt bậc `w2`") && sr.includes("Bậc tiếp theo: `w3`"),
    sr,
  );
  wlog = readLog(labWarmDir);
  const w2Runs = wlog.filter((x) => x.type === "attempt" && x.stage === "w2");
  ok(
    "stage attempts are numbered per stage and kept apart from main attempts",
    w2Runs.length === 2 &&
      w2Runs[1].attempt === 2 &&
      w2Runs[1].passed === true &&
      wlog.filter((x) => x.type === "attempt" && !x.stage).map((x) => x.attempt).join(",") === "1,2",
    JSON.stringify(wlog.map((x) => [x.type, x.stage, x.attempt])),
  );

  r = await call("orion_run", { lab: labWarmDir });
  mr = textOf(r);
  ok("main run #3 names w3 (last failing attempt that still suggests)", mr.includes("Lần #3") && mr.includes("bậc `w3`"), mr);

  let cr = cliRun(["stage", labWarmDir, "w3", "run"]);
  ok(
    "CLI stage run exits 2 when stage tests fail (the TODO skeleton test fails on purpose)",
    cr.status === 2 && cr.stdout.includes("0/1") && cr.stdout.includes("TODO"),
    `${cr.status} ${cr.stdout.slice(0, 300)} ${cr.stderr.slice(0, 200)}`,
  );
  writeFileSync(join(labWarmDir, "warmup", "test_w3.py"), W3_TESTS, "utf8");
  writeFileSync(join(labWarmDir, "warmup", "w3_parsons.py"), W3_FIXED, "utf8");
  r = await call("orion_stage", { lab: labWarmDir, stage: "w3", action: "run" });
  sr = textOf(r);
  ok(
    "w3 passes once the author replaces the skeleton, and the ladder is complete",
    sr.includes("1/1") && sr.includes("Lần #2") && sr.includes("Đạt bậc `w3`") && sr.includes("Đã xong thang khởi động") && sr.includes("budget_loop.py"),
    sr,
  );

  r = await call("orion_run", { lab: labWarmDir });
  mr = textOf(r);
  ok("main run #4: no warm-up suggestion once every stage is finished", mr.includes("Lần #4") && !mr.includes("Gợi ý khởi động"), mr);

  r = await call("orion_status", { lab: labWarmDir });
  st = textOf(r);
  ok(
    "orion_status ladder: w1 studied, w2 and w3 passed, ladder finished, main in progress",
    st.includes("[x] `w1`") &&
      st.includes("Đã xem") &&
      st.includes("[x] `w2`") &&
      st.includes("[x] `w3`") &&
      st.includes("Đã xong thang khởi động") &&
      st.includes("ĐANG LÀM (4 lần chạy)") &&
      st.includes("Số lần chạy (attempts): 4"),
    st,
  );
  const wStatus = JSON.parse(cliRun(["status", labWarmDir, "--json"]).stdout);
  ok(
    "status --json exposes the stage states and counts main attempts only",
    wStatus.attemptsCount === 4 &&
      wStatus.warmup.map((s) => s.state).join(",") === "studied,passed,passed" &&
      wStatus.nextWarmup === undefined &&
      wStatus.entry === "budget_loop.py",
    JSON.stringify(wStatus.warmup),
  );
  const stageJson = JSON.parse(cliRun(["stage", labWarmDir, "w2", "status", "--json"]).stdout);
  ok(
    "CLI stage <lab> <stage> status --json",
    stageJson.stage === "w2" && stageJson.action === "status" && stageJson.states.length === 3,
  );
  cr = cliRun(["stage", labWarmDir]);
  ok("CLI stage <lab> prints the ladder", cr.status === 0 && cr.stdout.includes("Khởi động -> Làm chính"), cr.stdout);
  cr = cliRun(["stage", labWarmDir, "w2", "bogus"]);
  ok("CLI stage with an unknown action prints usage and exits 1", cr.status === 1 && cr.stderr.includes("Usage: orion stage"), cr.stderr);
  const statsAfter = JSON.parse(cliRun(["stats", TEST_DIR, "--json"]).stdout);
  ok(
    "global stats leave warm-up stage tests out of the frequent failing checks",
    !statsAfter.frequentFailingChecks.some((f) => f.check.includes("test_total") || f.check.includes("test_todo_w3")),
    JSON.stringify(statsAfter.frequentFailingChecks),
  );

  // A second and third lab: the all-finished case, a command-runner stage, and the first-attempts limit.
  const miniSpec = (title, warmup) => ({
    title,
    subject: "Orion E2E",
    language: "python",
    entry: "a.py",
    tests: { runner: "pytest", path: "tests/test_fail.py", timeoutSec: 15 },
    warmup,
    dod: ["luôn thất bại"],
    checks: { test_never: { concept: "never", hints: ["L1: không bao giờ đạt"] } },
    testsContent: "def test_never():\n    assert 1 == 2\n",
  });
  const lab2Dir = join(TEST_DIR, "lab_warm2");
  r = await call("orion_new_lab", {
    dir: lab2Dir,
    spec: miniSpec("Warm2", [
      { id: "e1", kind: "example", title: "Ví dụ duy nhất", file: "warmup/e1.py" },
      { id: "m1", kind: "modify", title: "Sửa bằng lệnh", file: "warmup/m1.txt", tests: { runner: "command", command: "node -e process.exit(1)", timeoutSec: 20 } },
    ]),
  });
  ok(
    "scaffold: command-runner stage without a tests path is accepted; .txt skeleton is plain text",
    !r.isError && readFileSync(join(lab2Dir, "warmup", "m1.txt"), "utf8").includes("TODO (người soạn lab)") && !existsSync(join(lab2Dir, "warmup", "test_m1.py")),
    textOf(r),
  );
  r = await call("orion_run", { lab: lab2Dir });
  ok("warm2 main run #1 names e1", textOf(r).includes("bậc `e1`"), textOf(r));
  await call("orion_stage", { lab: lab2Dir, stage: "e1", action: "done" });
  r = await call("orion_run", { lab: lab2Dir });
  ok("warm2 main run #2 names the modify stage m1 and says to run it", textOf(r).includes("bậc `m1`") && textOf(r).includes('action: "run"'), textOf(r));
  r = await call("orion_stage", { lab: lab2Dir, stage: "m1", action: "run" });
  ok("command-runner stage fails 0/1 through the same runner path", !r.isError && textOf(r).includes("0/1") && textOf(r).includes("Lần #1"), textOf(r));
  const lab2Json = JSON.parse(readFileSync(join(lab2Dir, "lab.json"), "utf8"));
  lab2Json.warmup[1].tests.command = "node -e process.exit(0)";
  writeFileSync(join(lab2Dir, "lab.json"), JSON.stringify(lab2Json, null, 2) + "\n", "utf8");
  r = await call("orion_stage", { lab: lab2Dir, stage: "m1", action: "run" });
  ok("command-runner stage passes 1/1 and finishes the ladder", textOf(r).includes("1/1") && textOf(r).includes("Đạt bậc `m1`") && textOf(r).includes("Đã xong thang khởi động"), textOf(r));
  r = await call("orion_run", { lab: lab2Dir });
  ok("warm2 main run #3: no suggestion once all stages are finished", textOf(r).includes("Lần #3") && !textOf(r).includes("Gợi ý khởi động"), textOf(r));

  const lab3Dir = join(TEST_DIR, "lab_warm3");
  await call("orion_new_lab", { dir: lab3Dir, spec: miniSpec("Warm3", [{ id: "e1", kind: "example", title: "Chưa bao giờ xem", file: "warmup/e1.py" }]) });
  cr = cliRun(["run", lab3Dir, "--json"]);
  const run3 = JSON.parse(cr.stdout);
  ok(
    "CLI run --json exposes nextWarmup on a failing first attempt",
    cr.status === 2 && run3.attempt === 1 && run3.nextWarmup?.id === "e1" && run3.nextWarmup?.kind === "example" && run3.reportMarkdown.includes("Gợi ý khởi động"),
    cr.stdout.slice(0, 300),
  );
  for (const n of [2, 3]) {
    r = await call("orion_run", { lab: lab3Dir });
    ok(`warm3 main run #${n} still suggests the unfinished stage`, textOf(r).includes(`Lần #${n}`) && textOf(r).includes("Gợi ý khởi động"), textOf(r));
  }
  r = await call("orion_run", { lab: lab3Dir });
  ok("warm3 main run #4: the suggestion stops after the first attempts", textOf(r).includes("Lần #4") && !textOf(r).includes("Gợi ý khởi động"), textOf(r));
  writeFileSync(join(lab3Dir, "tests", "test_fail.py"), "def test_never():\n    assert 1 == 1\n", "utf8");
  r = await call("orion_run", { lab: lab3Dir });
  ok("a passing main run never shows a warm-up suggestion", textOf(r).includes("CHÚC MỪNG") && !textOf(r).includes("Gợi ý khởi động"), textOf(r));

  /* ───────── 13. Mira link for counter-examples ───────── */
  console.log("\n--- Testing Mira Link (trace) ---");

  const expectedMira = `Dò code với Mira: mira_record { lab: ${JSON.stringify(toPosix(labWarmDir))}, call: ${JSON.stringify(WARM_TRACE)} }`;
  r = await call("orion_hint", { lab: labWarmDir, check: "test_budget_stops" });
  ok("hint Level 1 of a check with trace has no Mira link", !r.isError && textOf(r).includes("Level 1/4") && !textOf(r).includes("Mira"), textOf(r));
  r = await call("orion_hint", { lab: labWarmDir, check: "test_budget_stops" });
  ok("hint Level 2 of a check with trace has no Mira link", !r.isError && textOf(r).includes("Level 2/4") && !textOf(r).includes("Mira"), textOf(r));
  r = await call("orion_hint", { lab: labWarmDir, check: "test_budget_stops" });
  let h3 = textOf(r);
  ok("hint Level 3 of a check with trace appends the Mira link", !r.isError && h3.includes("Level 3/4") && h3.includes(expectedMira), h3);
  ok(
    "the Mira line follows the hint text and comes before the closing note",
    h3.indexOf("L3: budget phản ví dụ") < h3.indexOf(expectedMira) && h3.indexOf(expectedMira) < h3.indexOf("[!NOTE]"),
    h3,
  );
  ok(
    "the Mira call is a JSON string, so quotes inside the trace stay unambiguous",
    h3.includes('call: "run([\\"a\\", \\"b\\", \\"c\\", \\"d\\"], budget=2)"'),
    h3,
  );
  r = await call("orion_hint", { lab: labWarmDir, check: "test_budget_stops" });
  ok("hint Level 4 keeps the Mira link (level >= 3)", !r.isError && textOf(r).includes("Level 4/4") && textOf(r).includes(expectedMira), textOf(r));
  r = await call("orion_hint", { lab: labWarmDir, check: "unknown_cmd" });
  ok("a partial check name resolves to the real check (Level 1)", !r.isError && textOf(r).includes("Level 1/4") && textOf(r).includes("test_unknown_cmd"), textOf(r));
  r = await call("orion_hint", { lab: labWarmDir, check: "unknown_cmd" });
  ok("a partial check name keeps escalating (Level 2, not Level 1 again)", !r.isError && textOf(r).includes("Level 2/4"), textOf(r));
  r = await call("orion_hint", { lab: labWarmDir, check: "unknown_cmd" });
  ok("Level 3 of a check without trace has no Mira link", !r.isError && textOf(r).includes("Level 3/4") && !textOf(r).includes("Mira"), textOf(r));
  const hintLevelsNow = JSON.parse(rd("lab.json")).hintLevels;
  ok("recorded hint levels use the real check keys", hintLevelsNow.test_unknown_cmd === 3 && hintLevelsNow.test_budget_stops === 4 && !("unknown_cmd" in hintLevelsNow), JSON.stringify(hintLevelsNow));
  cr = cliRun(["hint", labWarmDir, "test_budget_stops", "3", "--json"]);
  const hintJson = JSON.parse(cr.stdout);
  ok(
    "CLI hint --json at Level 3 exposes the trace and the Mira line",
    cr.status === 0 && hintJson.level === 3 && hintJson.trace === WARM_TRACE && hintJson.mira === expectedMira,
    cr.stdout,
  );
  cr = cliRun(["hint", labWarmDir, "test_budget_stops", "2"]);
  ok("CLI hint at Level 2 prints no Mira line", cr.status === 0 && cr.stdout.includes("L2: budget") && !cr.stdout.includes("Mira"), cr.stdout);
  cr = cliRun(["hint", labWarmDir, "test_budget_stops", "3"]);
  ok("CLI hint at Level 3 prints the Mira line", cr.status === 0 && cr.stdout.includes(expectedMira), cr.stdout);
  r = await call("orion_hint", { lab: labWarmDir, check: "test_budget_stops", level: 5 });
  ok("Level 5 is still refused for a check with trace", r.isError && textOf(r).includes("Refusing hint level 5"), textOf(r));

  writeFileSync(join(labWarmDir, "budget_loop.py"), MAIN_FIXED, "utf8");
  r = await call("orion_run", { lab: labWarmDir });
  ok(
    "the fixed main entry passes 2/2 (DoD) and shows no warm-up suggestion",
    textOf(r).includes("2/2") && textOf(r).includes("CHÚC MỪNG") && !textOf(r).includes("Gợi ý khởi động"),
    textOf(r),
  );

  /* ───────── 14. Vega inbox (contract vega-card-inbox.v1) ───────── */
  console.log("\n--- Testing Vega Inbox Export ---");

  const mkHub = (name) => {
    const p = join(TEST_DIR, name);
    mkdirSync(p, { recursive: true });
    return p;
  };
  const HUB_A = mkHub("hub_a");
  const inboxDirA = join(HUB_A, ".vega", "inbox");
  r = await call("orion_export", { lab: labWarmDir, to_vega: true, hub: HUB_A });
  let ex = textOf(r);
  ok("orion_export to_vega succeeds and reports the inbox file", !r.isError && ex.includes("Vega inbox: đã ghi 2 thẻ") && ex.includes(".vega/inbox/orion-"), ex);
  const filesA = readdirSync(inboxDirA);
  ok(
    "exactly one inbox file named orion-<YYYYMMDDTHHmmss>-<6 hex>.jsonl, and no .tmp left behind",
    filesA.length === 1 && /^orion-\d{8}T\d{6}-[0-9a-f]{6}\.jsonl$/.test(filesA[0]),
    filesA.join(","),
  );
  const inboxText = readFileSync(join(inboxDirA, filesA[0]), "utf8");
  const inboxLines = inboxText.trimEnd().split("\n").map((l) => JSON.parse(l));
  ok(
    "inbox file is UTF-8 JSONL: one object per line, a single trailing newline, one line per card",
    inboxText.endsWith("\n") && !inboxText.endsWith("\n\n") && inboxLines.length === 2,
    inboxText,
  );
  ok(
    "every inbox line satisfies the vega-card-inbox.v1 contract (independent validator)",
    inboxLines.every((l) => contractProblems(l).length === 0),
    JSON.stringify(inboxLines.map(contractProblems)),
  );
  ok(
    "keys follow orion:<lab folder name>:<check key>",
    inboxLines.map((l) => l.key).sort().join("|") === "orion:lab_warm:test_budget_stops|orion:lab_warm:test_unknown_cmd",
    inboxLines.map((l) => l.key).join("|"),
  );
  ok(
    "origin is orion-attempt, path = lab dir, locator = check key",
    inboxLines.every(
      (l) => l.origin.kind === "orion-attempt" && l.origin.path === toPosix(labWarmDir) && l.origin.locator === l.key.split(":").slice(2).join(":"),
    ),
    JSON.stringify(inboxLines.map((l) => l.origin)),
  );
  ok(
    "producer orion, v 1, kind basic, UTC timestamp, subject and deck from the lab",
    inboxLines.every((l) => l.producer === "orion" && l.v === 1 && l.kind === "basic" && l.t.endsWith("Z") && l.subject === "Orion E2E" && l.deck === "M0"),
  );
  const exportedPayload = JSON.parse(/```json([\s\S]*?)```/.exec(ex)[1]);
  ok(
    "the inbox lines carry the exported card candidates (same fronts, same order of checks)",
    exportedPayload.vegaCards.length === 2 &&
      new Set(exportedPayload.vegaCards.map((c) => c.front)).size === 2 &&
      exportedPayload.vegaCards.every((c) => inboxLines.some((l) => l.front === c.front && l.back === c.back)) &&
      exportedPayload.vegaInbox.written === 2 &&
      exportedPayload.vegaInbox.file.endsWith(filesA[0]),
    JSON.stringify(exportedPayload.vegaInbox),
  );
  ok(
    "warm-up stage failures are not exported (only the lab's own checks)",
    exportedPayload.errorLogEntries.length === 2 && exportedPayload.errorLogEntries.every((e) => !/test_total|test_todo_w3/.test(e.result)),
    JSON.stringify(exportedPayload.errorLogEntries.map((e) => e.result)),
  );
  ok("each card has a failure-count reason and the L1 hint", inboxLines.every((l) => l.reason?.includes("thất bại 4 lần") && l.hint?.startsWith("L1:")), JSON.stringify(inboxLines.map((l) => [l.reason, l.hint])));

  const HUB_B = mkHub("hub_b");
  r = await call("orion_export", { lab: labWarmDir, hub: HUB_B });
  ok("orion_export without to_vega writes nothing into the hub", !r.isError && !existsSync(join(HUB_B, ".vega")) && !textOf(r).includes("Vega inbox"), textOf(r));
  r = await call("orion_export", { lab: labWarmDir, to_vega: false, hub: HUB_B });
  ok("to_vega: false writes nothing either", !r.isError && !existsSync(join(HUB_B, ".vega")));

  r = await call("orion_export", { lab: labWarmDir, to_vega: true, hub: HUB_A });
  const filesA2 = readdirSync(inboxDirA);
  ok(
    "a second export writes a NEW file and never rewrites the first",
    !r.isError && filesA2.length === 2 && readFileSync(join(inboxDirA, filesA[0]), "utf8") === inboxText,
    filesA2.join(","),
  );
  const secondFile = filesA2.find((f) => f !== filesA[0]);
  const secondLines = readFileSync(join(inboxDirA, secondFile), "utf8").trimEnd().split("\n").map((l) => JSON.parse(l));
  ok(
    "keys are stable across exports (Vega dedupes by key)",
    secondLines.map((l) => l.key).sort().join("|") === inboxLines.map((l) => l.key).sort().join("|"),
  );

  r = await call("orion_export", { lab: nodeLabDir, to_vega: true, hub: HUB_A });
  ok(
    "a lab with no failed checks writes no inbox file",
    !r.isError && textOf(r).includes("không ghi tệp nào") && readdirSync(inboxDirA).length === 2,
    textOf(r),
  );
  // Failing tests that match no declared check (timeout, import error on a first attempt, helper test)
  // have no concept or hints to build a faithful card from: they are skipped on purpose, and reported.
  r = await call("orion_export", { lab: timeoutLabDir, to_vega: true, hub: HUB_A });
  ok(
    "a timeout (no declared check matched) is reported as skipped, not turned into a card",
    !r.isError &&
      textOf(r).includes("Bỏ qua 1 lỗi không khớp check nào khai báo trong lab.json") &&
      textOf(r).includes("không ghi tệp nào") &&
      readdirSync(inboxDirA).length === 2,
    textOf(r),
  );
  const HUB_F = mkHub("hub_f");
  const mixedLab = join(TEST_DIR, "lab_mixed");
  await call("orion_new_lab", {
    dir: mixedLab,
    spec: {
      title: "Mixed",
      subject: "S",
      language: "python",
      entry: "m.py",
      tests: { runner: "pytest", path: "tests/test_mixed.py", timeoutSec: 15 },
      dod: ["x"],
      checks: { test_a: { concept: "concept-a", hints: ["L1: a triệu chứng", "L2: a quy tắc"] } },
      testsContent: "def test_a():\n    assert False\n\ndef test_helper():\n    assert False\n",
    },
  });
  await call("orion_run", { lab: mixedLab });
  r = await call("orion_export", { lab: mixedLab, to_vega: true, hub: HUB_F });
  const mixedFiles = readdirSync(join(HUB_F, ".vega", "inbox"));
  const mixedLines = readFileSync(join(HUB_F, ".vega", "inbox", mixedFiles[0]), "utf8").trimEnd().split("\n").map((l) => JSON.parse(l));
  ok(
    "only declared checks become cards; the undeclared failing test is listed as skipped",
    !r.isError &&
      mixedFiles.length === 1 &&
      mixedLines.length === 1 &&
      mixedLines[0].key === "orion:lab_mixed:test_a" &&
      textOf(r).includes("Bỏ qua 1 lỗi không khớp check nào") &&
      textOf(r).includes("test_helper"),
    textOf(r),
  );
  const mixedPayload = JSON.parse(/```json([\s\S]*?)```/.exec(textOf(r))[1]);
  ok(
    "the exported payload still lists every candidate (inbox filtering does not change vegaCards)",
    mixedPayload.vegaCards.length === 2 && mixedPayload.vegaInbox.skipped.length === 1,
    JSON.stringify(mixedPayload.vegaInbox),
  );
  const firstLab = join(TEST_DIR, "lab_first");
  await call("orion_new_lab", {
    dir: firstLab,
    spec: {
      title: "First",
      subject: "S",
      language: "python",
      entry: "f.py",
      tests: { runner: "pytest", path: "tests/test_f.py", timeoutSec: 15 },
      dod: ["x"],
      checks: { test_needed: { concept: "c-f", hints: ["L1: f"] } },
      testsContent: "from f import needed\n\ndef test_needed():\n    assert needed() == 1\n",
    },
  });
  await call("orion_run", { lab: firstLab });
  r = await call("orion_export", { lab: firstLab, to_vega: true, hub: HUB_F });
  ok(
    "an import error on a first attempt (entry still a TODO starter) adds no card to the queue",
    !r.isError && textOf(r).includes("không ghi tệp nào") && textOf(r).includes("Bỏ qua 1 lỗi") && readdirSync(join(HUB_F, ".vega", "inbox")).length === 1,
    textOf(r),
  );

  const NO_HUB = join(TEST_DIR, "no_such_hub");
  r = await call("orion_export", { lab: labWarmDir, to_vega: true, hub: NO_HUB });
  ok("a missing hub folder is refused and not created", r.isError && textOf(r).includes("Hub folder not found") && !existsSync(NO_HUB), textOf(r));
  r = await call("orion_export", { lab: labWarmDir, to_vega: true });
  ok(
    "without a hub parameter the server falls back to ORION_HUB",
    !r.isError && existsSync(join(SAFE_HUB, ".vega", "inbox")) && readdirSync(join(SAFE_HUB, ".vega", "inbox")).length === 1,
    textOf(r),
  );

  const emojiLab = join(TEST_DIR, "lab_emoji");
  await call("orion_new_lab", {
    dir: emojiLab,
    spec: {
      title: "Emoji",
      subject: "S",
      language: "python",
      entry: "e.py",
      tests: { runner: "pytest", path: "tests/test_e.py", timeoutSec: 15 },
      dod: ["x"],
      checks: { test_e: { concept: "e", hints: ["L1: ok", "L2: có emoji \u{1F600} trong gợi ý"] } },
      testsContent: "def test_e():\n    assert False\n",
    },
  });
  await call("orion_run", { lab: emojiLab });
  r = await call("orion_export", { lab: emojiLab, to_vega: true, hub: HUB_A });
  ok(
    "a card line that violates the contract (emoji) is rejected before writing; nothing is written",
    r.isError && textOf(r).includes("must not contain emoji") && textOf(r).includes("vega-card-inbox.v1") && readdirSync(inboxDirA).length === 2,
    textOf(r),
  );

  const VL = orionLib.validateInboxLine;
  const goodLine = inboxLines[0];
  ok("validateInboxLine accepts a produced line", VL(goodLine).ok);
  ok("validateInboxLine accepts an empty back (0-1200 chars)", VL({ ...goodLine, back: "" }).ok);
  ok("validateInboxLine rejects unknown fields", !VL({ ...goodLine, extra: 1 }).ok && !VL({ ...goodLine, origin: { ...goodLine.origin, extra: 1 } }).ok);
  ok("validateInboxLine rejects a key without the producer prefix", !VL({ ...goodLine, key: "polaris:x:y" }).ok);
  ok("validateInboxLine rejects a producer or origin kind outside the contract lists", !VL({ ...goodLine, producer: "nobody" }).ok && !VL({ ...goodLine, origin: { ...goodLine.origin, kind: "orion" } }).ok);
  ok("validateInboxLine rejects a timestamp without an offset or Z", !VL({ ...goodLine, t: "2026-10-12T10:00:00" }).ok);
  ok("validateInboxLine rejects v other than 1", !VL({ ...goodLine, v: 2 }).ok);
  ok("validateInboxLine rejects over-long or empty fields", !VL({ ...goodLine, front: "x".repeat(601) }).ok && !VL({ ...goodLine, front: "" }).ok && !VL({ ...goodLine, back: "x".repeat(1201) }).ok && !VL({ ...goodLine, hint: "x".repeat(201) }).ok);
  ok("validateInboxLine rejects more than 10 tags or a tag over 40 characters", !VL({ ...goodLine, tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }).ok && !VL({ ...goodLine, tags: ["x".repeat(41)] }).ok);
  ok("validateInboxLine rejects emoji in front", !VL({ ...goodLine, front: "Câu hỏi \u{1F600}" }).ok);
  ok(
    "writeVegaInbox refuses an invalid line and writes nothing",
    await throwsAsync(() => orionLib.writeVegaInbox(HUB_A, [{ ...goodLine, key: "bad" }])) && readdirSync(inboxDirA).length === 2,
  );
  ok("writeVegaInbox refuses an empty batch", await throwsAsync(() => orionLib.writeVegaInbox(HUB_A, [])));

  const baseCard = { subject: "S", deck: "D", kind: "basic", front: "f", back: "b", origin: { kind: "manual", path: "p" }, tags: [] };
  const longKey = orionLib.buildInboxLines({ labDir: labWarmDir, title: "T", cards: [baseCard], sources: [{ checkKey: "k".repeat(250), concept: "c", failCount: 1 }] });
  ok(
    "a key over 200 characters is rejected, never silently truncated",
    longKey.lines.length === 0 && longKey.rejected.length === 1 && longKey.rejected[0].errors.join(" ").includes("key"),
    JSON.stringify(longKey.rejected),
  );
  const clipped = orionLib.buildInboxLines({
    labDir: labWarmDir,
    title: "T",
    cards: [{ ...baseCard, subject: "S".repeat(300), deck: "D".repeat(300), kind: "palace", front: "f".repeat(900), back: "b".repeat(2000), hint: "h".repeat(500), tags: Array.from({ length: 15 }, (_, i) => `tag${i}`) }],
    sources: [{ checkKey: "k", concept: "c", failCount: 2 }],
  });
  const cl = clipped.lines[0];
  ok(
    "long free-text fields are clipped to the contract limits and the line still validates",
    clipped.rejected.length === 0 && cl && cl.subject.length <= 120 && cl.deck.length <= 120 && cl.front.length <= 600 && cl.back.length <= 1200 && cl.hint.length <= 200 && cl.tags.length === 10 && cl.kind === "basic" && contractProblems(cl).length === 0,
    JSON.stringify(clipped.rejected),
  );
  const dedup = orionLib.buildInboxLines({ labDir: labWarmDir, title: "T", cards: [baseCard, baseCard], sources: [{ checkKey: "same", concept: "c", failCount: 1 }, { checkKey: "same", concept: "c", failCount: 1 }] });
  ok("two candidates for the same check collapse into one line", dedup.lines.length === 1 && dedup.rejected.length === 0);
  const undeclared = orionLib.buildInboxLines({
    labDir: labWarmDir,
    title: "T",
    cards: [baseCard, baseCard],
    sources: [{ checkKey: "tests.test_x", concept: "orion-practice-gap", failCount: 1, declared: false }, { checkKey: "test_ok", concept: "c", failCount: 1, declared: true }],
  });
  ok(
    "buildInboxLines skips candidates that match no declared check and keeps the others",
    undeclared.lines.length === 1 && undeclared.lines[0].key === "orion:lab_warm:test_ok" && undeclared.skipped.length === 1 && undeclared.skipped[0].check === "tests.test_x",
    JSON.stringify(undeclared.skipped),
  );

  const R = orionLib.resolveHub;
  ok("hub: the hub parameter wins over both env vars", R("C:/p", { ORION_HUB: "C:/o", POLARIS_HUB: "C:/q" }) === resolve("C:/p"));
  ok("hub: ORION_HUB is next", R(undefined, { ORION_HUB: "C:/o", POLARIS_HUB: "C:/q" }) === resolve("C:/o"));
  ok("hub: POLARIS_HUB is next", R(undefined, { POLARIS_HUB: "C:/q" }) === resolve("C:/q"));
  ok("hub: the default is D:/02_Learning_Knowledge", R(undefined, {}) === resolve("D:/02_Learning_Knowledge"));
  ok("hub: blank values are ignored", R("  ", { ORION_HUB: "", POLARIS_HUB: "   " }) === resolve("D:/02_Learning_Knowledge"));

  const HUB_C = mkHub("hub_c");
  cr = cliRun(["export", labWarmDir, "--to-vega", "--hub", HUB_C, "--json"]);
  const cj = JSON.parse(cr.stdout);
  ok(
    "CLI export --to-vega --hub writes the inbox file and --json reports it",
    cr.status === 0 && cj.vegaInbox?.written === 2 && existsSync(cj.vegaInbox.file) && cj.vegaInbox.file.startsWith(HUB_C) && cj.cardSources.length === 2,
    cr.stdout.slice(0, 300) + cr.stderr,
  );
  const HUB_D = mkHub("hub_d");
  cr = cliRun(["export", labWarmDir, "--to-vega"], { ORION_HUB: HUB_D });
  ok(
    "CLI export --to-vega falls back to ORION_HUB",
    cr.status === 0 && readdirSync(join(HUB_D, ".vega", "inbox")).length === 1 && cr.stdout.includes("Vega inbox: đã ghi 2 thẻ"),
    cr.stdout + cr.stderr,
  );
  const HUB_E = mkHub("hub_e");
  cr = cliRun(["export", labWarmDir, "--to-vega"], { ORION_HUB: "", POLARIS_HUB: HUB_E });
  ok("CLI export --to-vega falls back to POLARIS_HUB when ORION_HUB is empty", cr.status === 0 && readdirSync(join(HUB_E, ".vega", "inbox")).length === 1, cr.stdout + cr.stderr);
  cr = cliRun(["export", labWarmDir, "--to-vega", "--hub"]);
  ok("CLI --hub without a value is rejected", cr.status === 1 && cr.stderr.includes("--hub needs"), cr.stderr);
  cr = cliRun(["export", labWarmDir, "--hub", HUB_C]);
  ok("CLI export without --to-vega leaves the hub untouched", cr.status === 0 && readdirSync(join(HUB_C, ".vega", "inbox")).length === 1 && !cr.stdout.includes("Vega inbox"), cr.stdout);
  cr = cliRun(["export", emojiLab, "--to-vega", "--hub", HUB_C]);
  ok("CLI export --to-vega exits 3 when every line is rejected", cr.status === 3 && cr.stdout.includes("không hợp lệ"), cr.stdout + cr.stderr);
  cr = cliRun(["export", labWarmDir, "--to-vega", "--hub", NO_HUB]);
  ok("CLI export --to-vega with a missing hub exits 1 with a message", cr.status === 1 && cr.stderr.includes("Hub folder not found") && !existsSync(NO_HUB), cr.stderr);

  /* ───────── 15. Guide topics ───────── */
  console.log("\n--- Testing Guide Documentation ---");

  r = await call("orion_guide", { topic: "ladder" });
  const ladderDoc = textOf(r);
  ok(
    "guide ladder: section 'Bậc khởi động (PRIMM)' with the four citations",
    ladderDoc.includes("Bậc khởi động (PRIMM)") &&
      ["10.1016/j.learninstruc.2025.102142", "10.1037/0022-0663.95.4.774", "10.1145/3141880.3141895", "10.1080/08993408.2019.1608781"].every((d) => ladderDoc.includes(d)) &&
      ladderDoc.includes("Predict, Run, Investigate, Modify, Make"),
  );
  ok("guide ladder: states the isomorphic rule", ladderDoc.includes("ĐẲNG CẤU") && ladderDoc.includes("KHÔNG BAO GIỜ") && ladderDoc.includes("warmupFiles"));
  ok("guide ladder: documents the Mira link", ladderDoc.includes("Dò code với Mira: mira_record") && ladderDoc.includes("trace"));
  const ladderJson = /```json\n([\s\S]*?)```/.exec(ladderDoc);
  const ladderSpec = ladderJson ? JSON.parse(ladderJson[1]) : undefined;
  ok(
    "guide ladder: the agent-loop lab.json example (calculator REPL warm-up) validates against the real schema",
    Boolean(ladderSpec) && V(ladderSpec).ok && ladderSpec.warmup.length === 4 && ladderSpec.warmup[0].title.includes("máy tính REPL") && ladderSpec.warmup.map((s) => s.kind).join(",") === "example,complete,parsons,modify",
    ladderSpec ? V(ladderSpec).errors.join(" | ") : "no json block",
  );
  r = await call("orion_guide", { topic: "format" });
  ok(
    "guide format: documents warmup, trace and the scaffold-only warmupFiles",
    textOf(r).includes("warmup") && textOf(r).includes("trace") && textOf(r).includes("warmupFiles") && textOf(r).includes("testsContent"),
  );
  r = await call("orion_guide", { topic: "hints" });
  ok("guide hints: documents the Mira link", textOf(r).includes("trace") && textOf(r).includes("mira_record"));
  r = await call("orion_guide", { topic: "workflows" });
  ok(
    "guide workflows: orion_stage, to_vega, the contract name and the hub order",
    textOf(r).includes("orion_stage") && textOf(r).includes("to_vega") && textOf(r).includes("vega-card-inbox.v1") && textOf(r).includes("ORION_HUB") && textOf(r).includes("POLARIS_HUB"),
  );
  r = await call("orion_guide");
  ok("guide index mentions the warm-up ladder and the Mira link", textOf(r).includes("Bậc khởi động (PRIMM)") && textOf(r).includes("Mira"));
} finally {
  await client.close();
  // Cleanup test directory
  try {
    rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

console.log("\n-------------------------------------------");
if (failed > 0) {
  console.error(`FAILED: ${failed} check(s) failed.`);
  process.exit(1);
} else {
  console.log("ALL E2E CHECKS PASSED!");
  process.exit(0);
}
