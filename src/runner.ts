import { existsSync } from "node:fs";
import { readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AttemptTestItem, LabTests } from "./schema.js";
import { parseJunitXml, parseTapOutput, runProcessWithTimeout } from "./util.js";

export interface TestRunResult {
  passed: boolean;
  total: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  durationMs: number;
  timedOut: boolean;
  tests: AttemptTestItem[];
  rawOutput?: string;
}

export function resolvePythonCommand(): { cmd: string; defaultArgs: string[] } {
  if (process.env.ORION_PYTHON && process.env.ORION_PYTHON.trim()) {
    const parts = process.env.ORION_PYTHON.trim().split(/\s+/);
    return { cmd: parts[0]!, defaultArgs: parts.slice(1) };
  }
  if (process.platform === "win32") {
    // py -3.11 is preferred on Windows
    return { cmd: "py", defaultArgs: ["-3.11"] };
  }
  return { cmd: "python3", defaultArgs: [] };
}

export async function runPytest(labDir: string, testsConfig: LabTests): Promise<TestRunResult> {
  const timeoutMs = (testsConfig.timeoutSec ?? 120) * 1000;
  const tempXmlPath = join(
    tmpdir(),
    `orion_junit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.xml`,
  );

  const { cmd, defaultArgs } = resolvePythonCommand();
  const args = [
    ...defaultArgs,
    "-m",
    "pytest",
    "-q",
    "-p",
    "no:cacheprovider",
    `--junitxml=${tempXmlPath}`,
  ];
  if (testsConfig.path) {
    args.push(testsConfig.path);
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONIOENCODING: "utf-8",
    PYTHONDONTWRITEBYTECODE: "1",
  };

  try {
    const outcome = await runProcessWithTimeout(cmd, args, {
      cwd: labDir,
      env,
      timeoutMs,
    });

    if (outcome.timedOut) {
      return {
        passed: false,
        total: 1,
        passedCount: 0,
        failedCount: 1,
        skippedCount: 0,
        durationMs: outcome.durationMs,
        timedOut: true,
        tests: [
          {
            id: "timeout",
            name: "Pytest Timeout",
            status: "failed",
            durationMs: outcome.durationMs,
            message: `Pytest execution timed out after ${testsConfig.timeoutSec ?? 120}s. Process tree killed.`,
          },
        ],
        rawOutput: (outcome.stdout + "\n" + outcome.stderr).trim(),
      };
    }

    // Parse JUnit XML if produced
    if (existsSync(tempXmlPath)) {
      const xmlContent = await readFile(tempXmlPath, "utf8");
      const parsed = parseJunitXml(xmlContent);

      if (parsed.tests.length > 0) {
        const allPassed = parsed.passedCount === parsed.total && parsed.total > 0;
        return {
          passed: allPassed,
          total: parsed.total,
          passedCount: parsed.passedCount,
          failedCount: parsed.failedCount,
          skippedCount: parsed.skippedCount,
          durationMs: parsed.durationMs || outcome.durationMs,
          timedOut: false,
          tests: parsed.tests,
          rawOutput: outcome.stdout.trim(),
        };
      }
    }

    // If XML was not created or had no tests (e.g. syntax error or collection failure)
    const errText = (outcome.stderr || outcome.stdout).trim();
    const passed = outcome.exitCode === 0;
    return {
      passed,
      total: 1,
      passedCount: passed ? 1 : 0,
      failedCount: passed ? 0 : 1,
      skippedCount: 0,
      durationMs: outcome.durationMs,
      timedOut: false,
      tests: [
        {
          id: "pytest_run",
          name: "Pytest Execution",
          status: passed ? "passed" : "error",
          durationMs: outcome.durationMs,
          message: errText || `Exited with code ${outcome.exitCode}`,
        },
      ],
      rawOutput: errText,
    };
  } finally {
    try {
      if (existsSync(tempXmlPath)) {
        await unlink(tempXmlPath);
      }
    } catch {
      // ignore temp file removal errors
    }
  }
}

export async function runNodeTest(labDir: string, testsConfig: LabTests): Promise<TestRunResult> {
  const timeoutMs = (testsConfig.timeoutSec ?? 120) * 1000;
  const args = ["--test", "--test-reporter=tap"];
  if (testsConfig.path) {
    args.push(testsConfig.path);
  }

  const outcome = await runProcessWithTimeout(process.execPath, args, {
    cwd: labDir,
    timeoutMs,
  });

  if (outcome.timedOut) {
    return {
      passed: false,
      total: 1,
      passedCount: 0,
      failedCount: 1,
      skippedCount: 0,
      durationMs: outcome.durationMs,
      timedOut: true,
      tests: [
        {
          id: "timeout",
          name: "Node Test Timeout",
          status: "failed",
          durationMs: outcome.durationMs,
          message: `Node test execution timed out after ${testsConfig.timeoutSec ?? 120}s. Process tree killed.`,
        },
      ],
      rawOutput: (outcome.stdout + "\n" + outcome.stderr).trim(),
    };
  }

  const tapReport = parseTapOutput(outcome.stdout);
  if (tapReport.tests.length > 0) {
    const allPassed = tapReport.passedCount === tapReport.total && tapReport.total > 0;
    return {
      passed: allPassed,
      total: tapReport.total,
      passedCount: tapReport.passedCount,
      failedCount: tapReport.failedCount,
      skippedCount: tapReport.skippedCount,
      durationMs: tapReport.durationMs || outcome.durationMs,
      timedOut: false,
      tests: tapReport.tests,
      rawOutput: outcome.stdout.trim(),
    };
  }

  const errText = (outcome.stderr || outcome.stdout).trim();
  const passed = outcome.exitCode === 0;
  return {
    passed,
    total: 1,
    passedCount: passed ? 1 : 0,
    failedCount: passed ? 0 : 1,
    skippedCount: 0,
    durationMs: outcome.durationMs,
    timedOut: false,
    tests: [
      {
        id: "node_test",
        name: "Node Test Execution",
        status: passed ? "passed" : "error",
        durationMs: outcome.durationMs,
        message: errText || `Exited with code ${outcome.exitCode}`,
      },
    ],
    rawOutput: errText,
  };
}

export async function runCommandTest(labDir: string, testsConfig: LabTests): Promise<TestRunResult> {
  const command = testsConfig.command;
  if (!command) {
    throw new Error("Runner is 'command' but no command string was specified in tests.command");
  }
  const timeoutMs = (testsConfig.timeoutSec ?? 120) * 1000;

  let cmd = command;
  let args: string[] = [];
  if (process.platform === "win32") {
    cmd = "cmd.exe";
    args = ["/d", "/s", "/c", command];
  } else {
    cmd = "/bin/sh";
    args = ["-c", command];
  }

  const outcome = await runProcessWithTimeout(cmd, args, {
    cwd: labDir,
    timeoutMs,
  });

  const allOutput = (outcome.stdout + "\n" + outcome.stderr).trim();
  const outputLines = allOutput.split(/\r?\n/);
  const last40 = outputLines.slice(-40).join("\n");
  const passed = outcome.exitCode === 0 && !outcome.timedOut;

  return {
    passed,
    total: 1,
    passedCount: passed ? 1 : 0,
    failedCount: passed ? 0 : 1,
    skippedCount: 0,
    durationMs: outcome.durationMs,
    timedOut: outcome.timedOut,
    tests: [
      {
        id: "command",
        name: command,
        status: passed ? "passed" : "failed",
        durationMs: outcome.durationMs,
        message: passed
          ? undefined
          : outcome.timedOut
            ? `Timed out after ${testsConfig.timeoutSec ?? 120}s`
            : last40,
      },
    ],
    rawOutput: last40,
  };
}

export async function executeLabTests(labDir: string, testsConfig: LabTests): Promise<TestRunResult> {
  switch (testsConfig.runner) {
    case "pytest":
      return runPytest(labDir, testsConfig);
    case "node":
      return runNodeTest(labDir, testsConfig);
    case "command":
      return runCommandTest(labDir, testsConfig);
    default: {
      const exhaustiveCheck: never = testsConfig.runner;
      throw new Error(`Unsupported test runner: ${String(exhaustiveCheck)}`);
    }
  }
}
