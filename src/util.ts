import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { AttemptTestItem } from "./schema.js";

export const VERSION = "0.2.0";

export function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/* ───────── Path and text helpers ───────── */

/** Forward-slash form of a path (display and cross-platform comparison). */
export function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Normalizes a lab-relative path for comparison: forward slashes, no "." segments, no trailing slash. */
export function normRelPath(p: string): string {
  return toPosix(p)
    .split("/")
    .filter((s) => s !== "" && s !== ".")
    .join("/");
}

/** Returns a problem description when `p` is not a safe lab-relative path, otherwise undefined. */
export function relPathProblem(p: string): string | undefined {
  if (!p.trim()) return "must not be empty";
  if (p !== p.trim()) return "must not have leading or trailing spaces";
  const posix = toPosix(p);
  if (posix.startsWith("/") || /^[A-Za-z]:/.test(posix)) {
    return "must be relative to the lab folder (no absolute path)";
  }
  if (posix.split("/").some((s) => s === "..")) {
    return 'must stay inside the lab folder (no ".." segment)';
  }
  if (/[<>:"|?*\u0000-\u001f]/.test(posix)) {
    return 'contains a character not allowed on Windows/exFAT (< > : " | ? *)';
  }
  if (!normRelPath(p)) return "must not be empty";
  return undefined;
}

/** True when two lab-relative paths are equal or one contains the other (case-insensitive: Windows/exFAT). */
export function pathsOverlap(a: string, b: string): boolean {
  const x = normRelPath(a).toLowerCase();
  const y = normRelPath(b).toLowerCase();
  if (!x || !y) return false;
  return x === y || x.startsWith(`${y}/`) || y.startsWith(`${x}/`);
}

/** Truncates to at most `max` UTF-16 units with an ellipsis, never splitting a surrogate pair. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  let cut = s.slice(0, Math.max(0, max - 1));
  const last = cut.charCodeAt(cut.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) cut = cut.slice(0, -1);
  return cut.trimEnd() + "…";
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export const hash = (s: string, n = 8): string =>
  createHash("sha1").update(s).digest("hex").slice(0, n);

export function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Atomic file write via temp file + rename to prevent corruption */
export async function atomicWriteFile(targetPath: string, content: string | Buffer): Promise<void> {
  const dir = dirname(targetPath);
  await mkdir(dir, { recursive: true });
  const tempPath = `${targetPath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    await writeFile(tempPath, content, "utf8");
    await rename(tempPath, targetPath);
  } catch (err) {
    try {
      if (existsSync(tempPath)) {
        await unlink(tempPath);
      }
    } catch {
      // ignore cleanup error
    }
    throw err;
  }
}

export async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    const text = await readFile(path, "utf8");
    return JSON.parse(text.replace(/^\uFEFF/, "")) as T;
  } catch {
    return undefined;
  }
}

export async function writeJson(path: string, data: unknown): Promise<void> {
  await atomicWriteFile(path, JSON.stringify(data, null, 2) + "\n");
}

/** Levenshtein distance matching for corrective suggestions */
export function closest(word: string, candidates: string[]): string | undefined {
  const w = word.toLowerCase();
  let best: string | undefined;
  let bestD = Infinity;
  for (const c of candidates) {
    const a = w;
    const b = c.toLowerCase();
    const row = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0]!;
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const tmp = row[j]!;
        row[j] = Math.min(row[j]! + 1, row[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = tmp;
      }
    }
    const d = row[b.length]!;
    if (d < bestD && d <= Math.max(3, Math.floor(b.length * 0.45))) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/* ───────── Process Execution with Timeout and Tree Termination ───────── */

export interface ProcessRunOutcome {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export async function runProcessWithTimeout(
  command: string,
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
  },
): Promise<ProcessRunOutcome> {
  const timeoutMs = options.timeoutMs ?? 120_000;
  const start = Date.now();

  return new Promise<ProcessRunOutcome>((resolvePromise) => {
    let timedOut = false;
    let stdout = "";
    let stderr = "";
    let timer: NodeJS.Timeout | null = null;
    let settled = false;

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
    } catch (spawnErr) {
      settled = true;
      resolvePromise({
        exitCode: 1,
        stdout: "",
        stderr: errMsg(spawnErr),
        timedOut: false,
        durationMs: Date.now() - start,
      });
      return;
    }

    const killProcessTree = () => {
      if (child.pid === undefined) return;
      if (process.platform === "win32") {
        try {
          execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        } catch {
          // ignore if process already terminated
        }
      } else {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }
    };

    timer = setTimeout(() => {
      timedOut = true;
      killProcessTree();
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    const finalize = (code: number | null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolvePromise({
        exitCode: code,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - start,
      });
    };

    child.on("close", (code) => {
      finalize(code);
    });

    child.on("error", (err) => {
      stderr += `\n${errMsg(err)}`;
      finalize(1);
    });
  });
}

/* ───────── JUnit XML Parser (Pytest) ───────── */

export interface ParsedJunitReport {
  total: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  durationMs: number;
  tests: AttemptTestItem[];
}

export function parseJunitXml(xmlText: string): ParsedJunitReport {
  const tests: AttemptTestItem[] = [];
  let totalDuration = 0;

  // Extract <testsuite ...> attributes
  const suiteMatch = /<testsuite\b([^>]*)>/i.exec(xmlText);
  if (suiteMatch) {
    const timeMatch = /\btime="([^"]+)"/i.exec(suiteMatch[1] ?? "");
    if (timeMatch && timeMatch[1]) {
      const parsedSec = parseFloat(timeMatch[1]);
      if (!isNaN(parsedSec)) totalDuration = Math.round(parsedSec * 1000);
    }
  }

  // Regex to match each <testcase ...>...</testcase> or <testcase .../>
  const testcaseRegex = /<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/gi;
  let tcMatch: RegExpExecArray | null;

  while ((tcMatch = testcaseRegex.exec(xmlText)) !== null) {
    const attrs = tcMatch[1] ?? "";
    const body = tcMatch[2] ?? "";

    const nameMatch = /\bname="([^"]+)"/i.exec(attrs);
    const classMatch = /\bclassname="([^"]+)"/i.exec(attrs);
    const timeMatch = /\btime="([^"]+)"/i.exec(attrs);

    const testName = nameMatch ? nameMatch[1]! : "unnamed_test";
    const className = classMatch ? classMatch[1]! : "";
    let durationMs: number | undefined;
    if (timeMatch && timeMatch[1]) {
      const s = parseFloat(timeMatch[1]);
      if (!isNaN(s)) durationMs = Math.round(s * 1000);
    }

    let status: "passed" | "failed" | "error" | "skipped" = "passed";
    let message: string | undefined;

    // Check for failure
    const failureMatch = /<failure\b([^>]*?)>([\s\S]*?)<\/failure>/i.exec(body);
    if (failureMatch) {
      status = "failed";
      const msgAttr = /\bmessage="([^"]*)"/i.exec(failureMatch[1] ?? "");
      const bodyText = failureMatch[2]?.trim();
      message = msgAttr?.[1] ? `${msgAttr[1]}\n${bodyText ?? ""}`.trim() : bodyText;
    } else {
      const errorMatch = /<error\b([^>]*?)>([\s\S]*?)<\/error>/i.exec(body);
      if (errorMatch) {
        status = "error";
        const msgAttr = /\bmessage="([^"]*)"/i.exec(errorMatch[1] ?? "");
        const bodyText = errorMatch[2]?.trim();
        message = msgAttr?.[1] ? `${msgAttr[1]}\n${bodyText ?? ""}`.trim() : bodyText;
      } else {
        const skippedMatch = /<skipped\b([^>]*?)(?:\/>|>([\s\S]*?)<\/skipped>)/i.exec(body);
        if (skippedMatch) {
          status = "skipped";
          const msgAttr = /\bmessage="([^"]*)"/i.exec(skippedMatch[1] ?? "");
          message = msgAttr?.[1] ?? skippedMatch[2]?.trim() ?? "Skipped";
        }
      }
    }

    // Clean XML entities in message
    if (message) {
      message = message
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
    }

    // Determine ID
    const id = testName;

    tests.push({
      id,
      name: className ? `${className}::${testName}` : testName,
      status,
      durationMs,
      message,
    });
  }

  // Also check if there were suite-level collection errors
  if (tests.length === 0) {
    const errorMatch = /<error\b([^>]*?)>([\s\S]*?)<\/error>/i.exec(xmlText);
    if (errorMatch) {
      const msgAttr = /\bmessage="([^"]*)"/i.exec(errorMatch[1] ?? "");
      tests.push({
        id: "collection_error",
        name: "Test Collection",
        status: "error",
        message: msgAttr?.[1] ?? errorMatch[2]?.trim() ?? "Pytest collection error",
      });
    }
  }

  const passedCount = tests.filter((t) => t.status === "passed").length;
  const failedCount = tests.filter((t) => t.status === "failed" || t.status === "error").length;
  const skippedCount = tests.filter((t) => t.status === "skipped").length;

  return {
    total: tests.length,
    passedCount,
    failedCount,
    skippedCount,
    durationMs: totalDuration,
    tests,
  };
}

/* ───────── TAP Parser (Node --test) ───────── */

export interface ParsedTapReport {
  total: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  durationMs: number;
  tests: AttemptTestItem[];
}

export function parseTapOutput(tapText: string): ParsedTapReport {
  const tests: AttemptTestItem[] = [];
  const lines = tapText.split(/\r?\n/);
  let totalDuration = 0;

  // We look for test assertions:
  // e.g. "^(?: {0,2})(not )?ok (?:\\d+) - (.*)$"
  // And trailing summary lines:
  // "# tests 3", "# pass 2", "# fail 1", "# duration_ms 42.1"
  let currentTest: AttemptTestItem | null = null;
  let capturingYaml = false;
  let yamlLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    // Check duration summary
    const durMatch = /^# duration_ms\s+([0-9.]+)/i.exec(line);
    if (durMatch && durMatch[1]) {
      const ms = parseFloat(durMatch[1]);
      if (!isNaN(ms)) totalDuration = Math.round(ms);
    }

    // Check YAML block delimiter
    if (line.trim() === "---" && currentTest) {
      capturingYaml = true;
      yamlLines = [];
      continue;
    }
    if (line.trim() === "..." && capturingYaml && currentTest) {
      capturingYaml = false;
      // Extract error message from YAML lines
      const errLine = yamlLines.find((l) => /^\s*(?:error|failureType|message):/i.test(l));
      if (errLine) {
        currentTest.message = errLine.replace(/^\s*(?:error|failureType|message):\s*/i, "").replace(/^['"]|['"]$/g, "");
      }
      continue;
    }

    if (capturingYaml) {
      yamlLines.push(line);
      continue;
    }

    // Match top-level or subtest assertion line
    // Ignore indented subtest lines if top-level exists, or match top-level:
    // Format: "ok 1 - test name" or "not ok 2 - test name # SKIP"
    const okMatch = /^(not ok|ok)\s+\d+\s+-\s+(.+?)(?:\s+#\s+(SKIP|TODO))?$/i.exec(line);
    if (okMatch) {
      const isNotOk = okMatch[1]?.toLowerCase() === "not ok";
      const name = okMatch[2]?.trim() ?? `test_${tests.length + 1}`;
      const directive = okMatch[3]?.toUpperCase();

      let status: "passed" | "failed" | "error" | "skipped" = "passed";
      if (directive === "SKIP") {
        status = "skipped";
      } else if (isNotOk) {
        status = "failed";
      }

      currentTest = {
        id: name,
        name,
        status,
      };
      tests.push(currentTest);
    }
  }

  // If no top-level assertions matched (sometimes node produces indented ones), try matching indented ones
  if (tests.length === 0) {
    for (const line of lines) {
      const subMatch = /^\s+(not ok|ok)\s+\d+\s+-\s+(.+?)(?:\s+#\s+(SKIP|TODO))?$/i.exec(line);
      if (subMatch) {
        const isNotOk = subMatch[1]?.toLowerCase() === "not ok";
        const name = subMatch[2]?.trim() ?? `test_${tests.length + 1}`;
        const directive = subMatch[3]?.toUpperCase();
        tests.push({
          id: name,
          name,
          status: directive === "SKIP" ? "skipped" : isNotOk ? "failed" : "passed",
        });
      }
    }
  }

  const passedCount = tests.filter((t) => t.status === "passed").length;
  const failedCount = tests.filter((t) => t.status === "failed" || t.status === "error").length;
  const skippedCount = tests.filter((t) => t.status === "skipped").length;

  return {
    total: tests.length,
    passedCount,
    failedCount,
    skippedCount,
    durationMs: totalDuration,
    tests,
  };
}
