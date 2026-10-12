# Orion MCP - plan and design

Orion is the practice lab of the learner's MCP ecosystem: hands-on exercises checked by real tests, hints that follow
the learning hub's tutoring ladder (never the solution), predict-then-run before each run, an optional warm-up ladder
(PRIMM) before the main task, and attempt history that feeds the error log (Polaris) and the one adaptive review queue
(Vega). Named after the hunter: practice is hunting your own bugs.

Ecosystem (all by DuongNAD): Polaris (course architect), Aurora Slides (lessons and progress), SmartDrive-OS (SSD
governance and learning search), Constellation (registration, health, contracts), Vega (FSRS memory), Mira (line-by-line
trace player), Orion (this).

## Why
The learner's method is theory -> anchors -> notebook -> practice -> recall, and their roadmaps define practice with a
Definition of Done (for example: write my_react.py from an empty file until 4 asserts pass). Today nothing runs those
checks, gives graded hints, or remembers attempts. The hub rules (D:/02_Learning_Knowledge/AGENTS.md) define a
tutoring ladder: 1 point at the symptom, 2 guiding questions, 3 a minimal failing counter-example, 4 pseudocode or API
signatures, 5 full code only on an explicit request. Orion makes that ladder a tool.

v0.2 reason: the learner's first lab ("write my_react.py from an empty file") has 0 attempts. Evidence: novices gain
from high assistance and lose with hints-only problem solving (expertise reversal meta-analysis, Tetzlaff et al. 2025,
doi:10.1016/j.learninstruc.2025.102142); worked examples then faded steps give near and far transfer (Atkinson, Renkl
and Merrill 2003, doi:10.1037/0022-0663.95.4.774); Parsons problems are faster with similar learning (Ericson,
Margulieux and Rick 2017, doi:10.1145/3141880.3141895); PRIMM = Predict, Run, Investigate, Modify, Make (Sentance,
Waite and Kallia 2019, doi:10.1080/08993408.2019.1608781). One adaptive review queue (Vega) instead of separate lists.

## Principles
1. Never the solution: labs ship tests, a Vietnamese README and a starter file with docstrings and TODOs only. Hints
   climb the ladder one level at a time, recorded; level 5 is never produced by Orion (the agent decides, following
   AGENTS.md, and only on the learner's explicit request).
2. Real checks: tests run locally with the learner's own tools (pytest for Python, node --test for JavaScript, or a
   command declared in lab.json), time-boxed, results parsed from structured output (JUnit XML / TAP), never from
   guesses.
3. Predict first: `orion_predict` stores the learner's prediction of the outcome before a run; the run reports the
   gap, which is what gets learned.
4. Few files, local only: per lab one lab.json (definition), one orion-attempts.jsonl (history) and the stage and test
   files named in lab.json; nothing leaves the machine except a new Vega inbox file on request; no recursive scans of
   D:; no node_modules on D: (exFAT, 512 KB clusters).
5. Same toolchain discipline as the sister projects (TypeScript, one esbuild bundle dist/orion.mjs, external
   toolchain via ORION_TOOLCHAIN falling back to the Aurora toolchain).
6. Warm-up before make (v0.2): a lab may carry 0-4 warm-up stages built on an ISOMORPHIC problem (same solution
   structure, different surface), never the lab's own solution. Orion never generates code: `orion_new_lab` writes
   stage files only from text supplied in the spec (`warmupFiles`) or comment-only TODO skeletons whose default tests
   fail on purpose. The ladder never blocks.
7. One review queue (v0.2): card candidates go to Vega's inbox (contract vega-card-inbox.v1); Orion never writes
   Vega's cards or reviews. Only failures that match a check declared in lab.json become cards.

## Lab format (lab.json)
`{title, subject, module?, language: python | node | other, entry: "<learner file, relative>", starter?,
tests: {runner: pytest | node | command, path?, command?, timeoutSec?}, timeboxMinutes?,
warmup?: Stage[] (0-4), dod: ["..."],
checks: {"<test id or name pattern>": {concept: "<concept tag>", hints: ["L1 symptom", "L2 questions",
"L3 counter-example", "L4 pseudocode or signatures"], trace?: "<one-line Python call expression>"}}}`

Stage = `{id, kind: example | complete | parsons | modify, title, file (relative to the lab), tests?: {runner, path?,
command?, timeoutSec?} (required for complete, parsons, modify), player? (Mira trace player, example only), note?}`.
Validated: ids unique and not run/done/status; paths relative and inside the lab; a stage never uses the lab's entry
file or tests path; pytest/node stage tests need their own path and then the main tests.path is required; a command
stage needs a command; `trace` is one single-line Python call expression (300 characters at most).

Scaffold-only spec keys (written to files, never stored in lab.json): `readme`, `testsContent` (main tests file),
`warmupFiles` (`{"<relative path>": "<text>"}` for stage files and stage tests; keys must match a stage `file` or
`tests.path`; text must not import the lab entry file).

A lab folder also holds README.md (Vietnamese: objectives, requirements, tools, data, common pitfalls, DoD), tests/,
optional warmup/, and the learner's entry file (created from the starter only when missing; never overwritten).

## Tools (v0.2) and CLI
- `orion_guide {topic?}`: the ladder (incl. "Bậc khởi động (PRIMM)"), lab format, writing good tests and hints,
  workflows.
- `orion_new_lab {dir, spec}`: validate and scaffold a lab (lab.json, README.md, tests/, starter entry with TODOs, and
  warm-up stage files), refusing solution code (the spec has no solution field; starter bodies are
  `raise NotImplementedError` or TODO comments). Never overwrites an existing file.
- `orion_predict {lab, prediction}`: store the prediction for the next run (main or stage).
- `orion_run {lab}`: run the main tests with a timeout, parse results, append an attempt line (time, passed/failed
  tests, duration, prediction and the gap), return a compact report: pass count, failing checks with their level-1
  hint only, time spent so far, attempt number, DoD status. On a failing attempt 1-3 it names the next unfinished
  warm-up stage (never blocking).
- `orion_hint {lab, check, level?}`: the next ladder level for one failing check (never above 4), recorded. At level
  3 and 4, for a check with `trace`, it appends `Dò code với Mira: mira_record { lab: "<lab dir>", call: "<trace>" }`.
- `orion_stage {lab, stage?, action: run | done | status}` (new): `run` runs a stage's tests through the same runner
  (attempt lines get a `stage` field, numbered per stage, never counted toward the main lab); `done` marks an example
  stage as studied (history record `{type: "stage", event: "studied"}`); `status` shows per-stage state.
- `orion_status {lab}` (shows the ladder Khởi động -> Làm chính with each stage state) and `orion_stats {root?}`:
  attempts, time, hints used per check, first-pass rate, labs done.
- `orion_export {lab, to_vega?, hub?}`: error-log entries in the Polaris "Sổ lỗi" shape for checks that failed
  (prediction vs result, concept, hints used) and Vega card candidates, as JSON for polaris_errorlog_add and vega_add.
  With `to_vega` it also writes the candidates as one new inbox file `<hub>/.vega/inbox/orion-<UTC
  YYYYMMDDTHHmmss>-<6 hex>.jsonl` (key `orion:<lab folder name>:<check key>`, origin `orion-attempt`, path = lab dir,
  locator = check key), each line validated against the contract, atomic `.tmp` + rename, never rewriting an existing
  file; hub = param `hub` -> env ORION_HUB -> env POLARIS_HUB -> D:/02_Learning_Knowledge (must exist).
- CLI mirrors the tools (`run`, `predict`, `hint`, `stage`, `status`, `stats`, `export [--to-vega] [--hub <path>]`,
  `new`, `guide`, `version`, `help`, `--json`).

## Tests (e2e under %TEMP%)
v0.1: a Python lab fixture with 3 pytest checks and a deliberately incomplete entry file: run reports 1/3 with level-1
hints; hint escalation 1 -> 4 and refusal above 4; a fixed entry passes 3/3 and DoD done; predict gap recorded;
attempts log shape; export produces error-log entries and card candidates; timeout handling (a sleeping test); a node
--test lab; scaffold never overwrites an existing entry file and contains no solution.

v0.2 (same script, throw-away labs and hubs under %TEMP%, ORION_HUB pointed at a temp hub so the learner's hub is never
touched): warm-up validation (complete/parsons/modify without tests, more than 4 stages, entry or tests reuse, path
escape, duplicate ids and files, reserved ids, player on a non-example, unknown-key hints); scaffold from spec text and
TODO skeletons that fail on purpose, no overwrite, entry-import guard; `orion_stage` run/done/status including a
command-runner stage; `stage` field and per-stage numbering in the attempts log; `orion_status` ladder; `orion_run`
suggestion on attempts 1-3 only and never once all stages are finished or the main run passes; `trace` suffix at level
3 and 4 only; export `to_vega` into temp hubs (file name, atomic write, independent contract validator, stable keys,
new file per export, no write without the flag or for labs without declared failing checks, missing hub refused, hub
precedence, emoji line rejected); CLI `stage`, `hint`, `export --to-vega --hub`; guide topics; tool count 9.

## First real lab (after v0.1 passes)
AMD AI Agents 101, Module 1: 03_Materials_Code/my_work/ lab for my_react.py with the roadmap's four checks (max_steps
limit; unknown tool returns an error observation; a Final Answer that follows an unexecuted Action is rejected; nested
brackets parse), a stated interface in the README, a TODO-only starter, hints for each check, and a task in the
project's TASKS.md. With v0.2 the same lab can gain a warm-up (for example a tiny calculator REPL with a step budget:
worked example, then completion, then modify) and `trace` values for the checks that have a minimal counter-example.
Re-register or health-check the server after upgrading (Constellation: eco_health).

## Status
- 2026-10-11: plan written; v0.1 built and verified (build --check types OK, e2e passes all checks, CLI help/version verified).
- 2026-10-12: v0.2.0 built and verified: warm-up ladder (PRIMM) with `orion_stage` and the ladder in `orion_status`/`orion_run`,
  Mira link (`trace`) on level 3+ hints, Vega inbox export (`orion_export ... to_vega`, CLI `--to-vega --hub`); 9 tools;
  build --check types OK; e2e baseline before the change 43 ok / 0 FAIL, after the change 214 ok / 0 FAIL.
