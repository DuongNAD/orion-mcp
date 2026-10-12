import type { LabCheck, LabSpec } from "./schema.js";
import { closest, toPosix } from "./util.js";

export const LADDER_LEVEL_NAMES = [
  "Level 1: Point at the symptom or state",
  "Level 2: Guiding questions (boundaries, invariants, data flow)",
  "Level 3: Minimal failing counter-example",
  "Level 4: Pseudocode or API signatures",
] as const;

/** From this ladder level on, a check with a `trace` links the counter-example to Mira. */
export const MIRA_TRACE_MIN_LEVEL = 3;

export interface HintOutcome {
  checkKey: string;
  concept: string;
  level: number;
  levelName: string;
  hint: string;
  remainingHints: number;
  /** Python call expression reproducing the minimal counter-example (from lab.json), if the check has one. */
  trace?: string;
}

/**
 * The Mira hand-off line appended to a hint at Level 3+ when the check has a `trace`.
 * Mira is a sibling MCP that records a real line-by-line trace of the learner's own entry file.
 * Both values are JSON strings so quotes inside the call expression stay unambiguous.
 */
export function miraTraceLine(labDir: string, trace: string): string {
  return `Dò code với Mira: mira_record { lab: ${JSON.stringify(toPosix(labDir))}, call: ${JSON.stringify(trace)} }`;
}

/** Matches a test item (id / name) to a check key or pattern in lab.checks */
export function findMatchingCheck(
  test: { id: string; name: string },
  checks: Record<string, LabCheck>,
): { key: string; check: LabCheck } | undefined {
  const keys = Object.keys(checks);

  // 1. Exact match
  for (const k of keys) {
    if (k === test.id || k === test.name) {
      return { key: k, check: checks[k]! };
    }
  }

  // 2. Suffix / Substring match (e.g. test_react.py::test_max_steps -> test_max_steps)
  for (const k of keys) {
    if (
      test.id.endsWith(`::${k}`) ||
      test.id.endsWith(k) ||
      test.name.includes(k) ||
      k.includes(test.name)
    ) {
      return { key: k, check: checks[k]! };
    }
  }

  // 3. Wildcard pattern match (e.g. "test_*_tool")
  for (const k of keys) {
    if (k.includes("*")) {
      const regexStr = "^" + k.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$";
      const reg = new RegExp(regexStr);
      if (reg.test(test.id) || reg.test(test.name)) {
        return { key: k, check: checks[k]! };
      }
    }
  }

  return undefined;
}

/** Returns the Level 1 hint for a failing test if a matching check is defined */
export function getLevel1HintForTest(
  test: { id: string; name: string },
  checks: Record<string, LabCheck>,
): { concept: string; hint: string } | undefined {
  const match = findMatchingCheck(test, checks);
  if (!match) return undefined;
  const l1 = match.check.hints[0];
  if (!l1) return undefined;
  return { concept: match.check.concept, hint: l1 };
}

/** Resolves a check query (exact key, then suffix/substring) to a lab.json check, or throws with suggestions. */
export function resolveCheck(lab: LabSpec, checkQuery: string): { key: string; check: LabCheck } {
  const checks = lab.checks;
  const keys = Object.keys(checks);

  let targetKey: string | undefined;
  let targetCheck: LabCheck | undefined;

  for (const k of keys) {
    if (k === checkQuery) {
      targetKey = k;
      targetCheck = checks[k];
      break;
    }
  }

  if (!targetKey) {
    // Try suffix/substring match
    for (const k of keys) {
      if (checkQuery.endsWith(k) || k.includes(checkQuery) || checkQuery.includes(k)) {
        targetKey = k;
        targetCheck = checks[k];
        break;
      }
    }
  }

  if (!targetKey || !targetCheck) {
    const suggestion = closest(checkQuery, keys);
    throw new Error(
      `Check '${checkQuery}' not found in lab.json checks.${
        suggestion ? ` Did you mean '${suggestion}'?` : ""
      } Available checks: ${keys.join(", ")}`,
    );
  }
  return { key: targetKey, check: targetCheck };
}

/** Resolves the requested or next hint for a check according to the tutoring ladder */
export function getHintForCheck(
  lab: LabSpec,
  checkQuery: string,
  requestedLevel?: number,
  recordedLevel = 0,
): HintOutcome {
  const { key: targetKey, check: targetCheck } = resolveCheck(lab, checkQuery);

  // Determine target ladder level
  let targetLevel: number;
  if (requestedLevel !== undefined) {
    if (requestedLevel > 4) {
      throw new Error(
        `Refusing hint level ${requestedLevel}. Orion tutoring ladder never exceeds Level 4 (pseudocode / signatures). Level 5 (full solution code) is never provided by Orion. Per AGENTS.md rules, ask your human mentor or agent mentor explicitly if needed.`,
      );
    }
    if (requestedLevel < 1) {
      throw new Error(`Hint level must be between 1 and 4 (received ${requestedLevel}).`);
    }
    targetLevel = requestedLevel;
  } else {
    targetLevel = recordedLevel + 1;
    if (targetLevel > 4) {
      throw new Error(
        `All 4 tutoring ladder hints for check '${targetKey}' have been exhausted (Level 4 reached). Orion will never provide Level 5 (solution code). Inspect the Level 4 signatures and invariants and continue your implementation.`,
      );
    }
  }

  const hintIdx = targetLevel - 1;
  const hintText = targetCheck.hints[hintIdx];
  if (!hintText) {
    throw new Error(
      `Hint Level ${targetLevel} is not defined for check '${targetKey}'. Available levels: 1..${targetCheck.hints.length}.`,
    );
  }

  const levelName = LADDER_LEVEL_NAMES[hintIdx] ?? `Level ${targetLevel}`;
  const remainingHints = Math.max(0, 4 - targetLevel);

  return {
    checkKey: targetKey,
    concept: targetCheck.concept,
    level: targetLevel,
    levelName,
    hint: hintText,
    remainingHints,
    ...(targetCheck.trace ? { trace: targetCheck.trace } : {}),
  };
}
