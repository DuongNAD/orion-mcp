#!/usr/bin/env node
/**
 * End-to-end test over real MCP stdio for Orion MCP.
 *
 * Exercises all 8 tools, pytest runner with JUnit XML, TAP parser for node --test,
 * tutoring ladder escalation 1 -> 4 and refusal above 4, predict-then-run gap recording,
 * attempt history log shape, export for Polaris error log and Vega memory cards,
 * timeout handling (sleeping test killed with taskkill /T /F), and CLI commands.
 *
 * All fixtures are created strictly under %TEMP%.
 *
 *   node scripts/e2e.mjs
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  console.log(`${cond ? "ok  " : "FAIL"} ${name}${detail ? `  (${detail})` : ""}`);
};
const textOf = (r) =>
  (r.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");

console.log(`\n=== Running Orion MCP E2E Tests in ${TEST_DIR} ===\n`);

/* ───────── 1. Setup MCP Client over Stdio ───────── */

const client = new Client({ name: "orion-e2e", version: "1.0.0" });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(ROOT, "dist", "orion.mjs")],
  stderr: "inherit",
  env: {
    ...process.env,
  },
});

await client.connect(transport);
const call = (name, args = {}) =>
  client.callTool({ name, arguments: args }, undefined, { timeout: 35000 });

try {
  // 1.1 Server Identification and Instructions
  const info = client.getServerVersion();
  ok("server identifies itself as orion 0.1.0", info?.name === "orion" && info?.version === "0.1.0");

  const instructions = client.getInstructions() ?? "";
  ok(
    "server instructions include Workflow, Rules, and Done when",
    instructions.includes("Workflow:") &&
      instructions.includes("Rules:") &&
      instructions.includes("Done when:") &&
      instructions.includes("Level 5"),
  );

  // 1.2 Tool Registration Check
  const { tools } = await client.listTools();
  const toolNames = tools.map((t) => t.name).sort();
  ok(
    "all 8 tools registered",
    toolNames.length === 8 &&
      toolNames.includes("orion_guide") &&
      toolNames.includes("orion_new_lab") &&
      toolNames.includes("orion_predict") &&
      toolNames.includes("orion_run") &&
      toolNames.includes("orion_hint") &&
      toolNames.includes("orion_status") &&
      toolNames.includes("orion_stats") &&
      toolNames.includes("orion_export"),
    toolNames.join(", "),
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
  ok("CLI version prints 0.1.0", versionOut === "0.1.0");

  const helpOut = runCli(["help"]);
  ok("CLI help lists commands", helpOut.includes("run <lab>") && helpOut.includes("predict <lab>"));

  const jsonStatusOut = runCli(["status", lab1Dir, "--json"]);
  const parsedStatus = JSON.parse(jsonStatusOut);
  ok("CLI status --json outputs valid JSON", parsedStatus.status === "completed" && parsedStatus.attemptsCount === 2);

  const jsonStatsOut = runCli(["stats", TEST_DIR, "--json"]);
  const parsedStats = JSON.parse(jsonStatsOut);
  ok("CLI stats --json outputs valid JSON", parsedStats.totalLabs >= 3);
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
