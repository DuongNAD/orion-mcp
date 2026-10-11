# Orion MCP - plan and design

Orion is the practice lab of the learner's MCP ecosystem: hands-on exercises checked by real tests, hints that follow
the learning hub's tutoring ladder (never the solution), predict-then-run before each run, and attempt history that
feeds the error log (Polaris) and memory cards (Vega). Named after the hunter: practice is hunting your own bugs.

Ecosystem (all by DuongNAD): Polaris (course architect), Aurora Slides (lessons and progress), SmartDrive-OS (SSD
governance and learning search), Constellation (registration, health, contracts), Vega (FSRS memory), Orion (this).

## Why
The learner's method is theory -> anchors -> notebook -> practice -> recall, and their roadmaps define practice with a
Definition of Done (for example: write my_react.py from an empty file until 4 asserts pass). Today nothing runs those
checks, gives graded hints, or remembers attempts. The hub rules (D:/02_Learning_Knowledge/AGENTS.md) define a
tutoring ladder: 1 point at the symptom, 2 guiding questions, 3 a minimal failing counter-example, 4 pseudocode or API
signatures, 5 full code only on an explicit request. Orion makes that ladder a tool.

## Principles
1. Never the solution: labs ship tests, a Vietnamese README and a starter file with docstrings and TODOs only. Hints
   climb the ladder one level at a time, recorded; level 5 is never produced by Orion (the agent decides, following
   AGENTS.md, and only on the learner's explicit request).
2. Real checks: tests run locally with the learner's own tools (pytest for Python, node --test for JavaScript, or a
   command declared in lab.json), time-boxed, results parsed from structured output (JUnit XML / TAP), never from
   guesses.
3. Predict first: `orion_predict` stores the learner's prediction of the outcome before a run; the run reports the
   gap, which is what gets learned.
4. Few files, local only: per lab one lab.json (definition) and one orion-attempts.jsonl (history); nothing leaves the
   machine; no recursive scans of D:; no node_modules on D: (exFAT, 512 KB clusters).
5. Same toolchain discipline as the sister projects (TypeScript, one esbuild bundle dist/orion.mjs, external
   toolchain via ORION_TOOLCHAIN falling back to the Aurora toolchain).

## Lab format (lab.json)
`{title, subject, module?, language: python | node | other, entry: "<learner file, relative>", starter?,
tests: {runner: pytest | node | command, path?, command?, timeoutSec?}, timeboxMinutes?, dod: ["..."],
checks: {"<test id or name pattern>": {concept: "<concept tag>", hints: ["L1 symptom", "L2 questions",
"L3 counter-example", "L4 pseudocode or signatures"]}}}`
A lab folder also holds README.md (Vietnamese: objectives, requirements, tools, data, common pitfalls, DoD), tests/,
and the learner's entry file (created from the starter only when missing; never overwritten).

## Tools (v0.1) and CLI
- `orion_guide {topic?}`: the ladder, lab format, writing good tests and hints, workflows.
- `orion_new_lab {dir, spec}`: validate and scaffold a lab (lab.json, README.md, tests/, starter entry with TODOs),
  refusing to write solution code (the spec has no solution field; starter bodies are `raise NotImplementedError` or
  TODO comments).
- `orion_predict {lab, prediction}`: store the prediction for the next run.
- `orion_run {lab}`: run the tests with a timeout, parse results, append an attempt line (time, passed/failed tests,
  duration, prediction and the gap), return a compact report: pass count, failing checks with their level-1 hint
  only, time spent so far, attempt number, DoD status.
- `orion_hint {lab, check, level?}`: the next ladder level for one failing check (never above 4), recorded.
- `orion_status {lab}` and `orion_stats {root?}`: attempts, time, hints used per check, first-pass rate, labs done.
- `orion_export {lab}`: error-log entries in the Polaris "Sổ lỗi" shape for checks that failed repeatedly (prediction
  vs result, concept, hints used) and Vega card candidates for their concepts, as JSON for polaris_errorlog_add and
  vega_add.
- CLI mirrors the tools (`run`, `predict`, `hint`, `status`, `stats`, `export`, `new`, `guide`, `version`, `help`,
  `--json`).

## Tests (e2e under %TEMP%)
A Python lab fixture with 3 pytest checks and a deliberately incomplete entry file: run reports 1/3 with level-1
hints; hint escalation 1 -> 4 and refusal above 4; a fixed entry passes 3/3 and DoD done; predict gap recorded; attempts
log shape; export produces error-log entries and card candidates; timeout handling (a sleeping test); a node --test lab;
scaffold never overwrites an existing entry file and contains no solution.

## First real lab (after v0.1 passes)
AMD AI Agents 101, Module 1: 03_Materials_Code/my_work/ lab for my_react.py with the roadmap's four checks (max_steps
limit; unknown tool returns an error observation; a Final Answer that follows an unexecuted Action is rejected; nested
brackets parse), a stated interface in the README, a TODO-only starter, hints for each check, and a task in the
project's TASKS.md.

## Status
- 2026-10-11: plan written; v0.1 built and verified (build --check types OK, e2e passes all checks, CLI help/version verified).
