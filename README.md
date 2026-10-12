[Tiếng Việt](README.vi.md) | English

<p align="center"><img src="docs/banner.jpg" alt="Orion MCP — Orion constellation and the glowing Orion Nebula" width="100%"></p>

# Orion MCP

*Named after the hunter: practice as hunting your own bugs.*

Orion is the practice lab engine of the learner's MCP ecosystem: hands-on exercises checked by real tests (pytest, node --test, or declared commands), an optional warm-up ladder (PRIMM) before the main task, tutoring ladder hints that never reach the solution, predict-then-run before each run, attempt history, a link from counter-example hints to Mira's line-by-line trace, and exports for the Polaris error log ("Sổ lỗi") and Vega memory cards (including Vega's inbox, so there is one review queue).

Named after the hunter: practice is hunting your own bugs.

**Version 0.2.0** adds the warm-up ladder (`orion_stage`), the Mira link (`trace`), and the Vega inbox export (`orion_export ... to_vega`).

---

## Ecosystem

All projects by DuongNAD:

| Project | Role | Repository |
| :--- | :--- | :--- |
| **Polaris** | Course architect & syllabus engine | [polaris-mcp](https://github.com/DuongNAD/polaris-mcp) |
| **Aurora Slides** | Lessons & presentation engine | [aurora-slides-mcp](https://github.com/DuongNAD/aurora-slides-mcp) |
| **SmartDrive-OS** | SSD governance & learning search | [smart-drive-os](https://github.com/DuongNAD/smart-drive-os) |
| **Constellation** | MCP registration & ecosystem contracts | [constellation-mcp](https://github.com/DuongNAD/constellation-mcp) |
| **Vega** | Adaptive spaced repetition engine (FSRS) | [vega-mcp](https://github.com/DuongNAD/vega-mcp) |
| **Orion** | Practice labs, real test runners & tutoring ladder | [orion-mcp](https://github.com/DuongNAD/orion-mcp) |

---

## Why Orion?

The learner's method is theory -> anchors -> notebook -> practice -> recall, and roadmaps define practice with a strict Definition of Done (DoD).

Previously, nothing ran these checks locally, provided graduated hints without spoiling the answer, or preserved attempt histories. Orion operationalizes the learning hub's tutoring ladder (`D:/02_Learning_Knowledge/AGENTS.md`) into a durable, local MCP server and CLI.

---

## Principles

1. **Never the solution**: Labs ship tests, a Vietnamese README, and a starter file with docstrings and `# TODO` / `raise NotImplementedError` bodies only. Hints climb the ladder one level at a time; Level 5 (full code) is never produced by Orion (the agent decides, following AGENTS.md, only upon the learner's explicit request).
2. **Real checks**: Tests run locally with real tools (`pytest` for Python, `node --test` for JavaScript/TypeScript, or a declared command in `lab.json`), time-boxed, and parsed from structured output (JUnit XML / TAP).
3. **Predict first**: `orion_predict` stores the learner's prediction of the outcome before a run; `orion_run` reports the gap between prediction and reality.
4. **Few files, local only**: Per lab one `lab.json` (definition), one `orion-attempts.jsonl` (history), and the stage and test files named in `lab.json`; nothing leaves the machine except a new Vega inbox file on request; no recursive scans of D:; no `node_modules` on D: (exFAT drive).
5. **Toolchain discipline**: TypeScript, single esbuild bundle `dist/orion.mjs`, external toolchain via `ORION_TOOLCHAIN`.
6. **Warm-up before make (PRIMM)**: a lab may carry 0-4 warm-up stages built on an *isomorphic* problem, never the lab's own solution; the main lab is the final "make" stage; the ladder never blocks.
7. **One review queue**: card candidates go to Vega's inbox (`orion_export ... to_vega`); Vega alone schedules reviews.

---

## Tutoring Ladder

Orion implements the 5-level tutoring ladder:

| Level | Name | Purpose | Orion Behavior |
|---|---|---|---|
| **Level 1** | Symptom | Point at the failing line, symptom, or state without fix | Automatically returned in `orion_run` for failing checks |
| **Level 2** | Guiding questions | Boundaries, loop invariants, data flow | Escalated via `orion_hint` |
| **Level 3** | Counter-example | Minimal failing counter-example once root cause is known | Escalated via `orion_hint`; a check with `trace` adds a Mira link |
| **Level 4** | Signatures / Pseudocode | Function signature, types, or skeleton when syntax is missing | Max level provided by Orion |
| **Level 5** | Full code | Complete code implementation with invariants explained | **Always refused by Orion** |

### Mira link for counter-examples

A check may declare `trace`: a single-line Python call expression that reproduces the minimal counter-example. When `orion_hint` returns Level 3 or 4 for such a check, the reply ends with a hand-off to Mira, the sibling MCP that records a real line-by-line trace of the learner's own entry file:

```
Dò code với Mira: mira_record { lab: "<lab dir>", call: "<trace>" }
```

Levels 1 and 2, and checks without `trace`, never carry the line.

---

## Warm-up Ladder (PRIMM)

Before the main task a lab may declare `warmup`: 0-4 stages from most to least assistance. The main lab (entry + tests) is the final *make* stage. It is optional; `orion_run` only names the next unfinished stage when the main tests fail on attempts 1-3.

**Evidence** (short):
- Novices gain from high assistance and lose with hints-only problem solving (expertise reversal meta-analysis; Tetzlaff et al., 2025, [doi:10.1016/j.learninstruc.2025.102142](https://doi.org/10.1016/j.learninstruc.2025.102142)).
- Worked examples then faded steps give near and far transfer (Atkinson, Renkl and Merrill, 2003, [doi:10.1037/0022-0663.95.4.774](https://doi.org/10.1037/0022-0663.95.4.774)).
- Parsons problems are faster with similar learning (Ericson, Margulieux and Rick, 2017, [doi:10.1145/3141880.3141895](https://doi.org/10.1145/3141880.3141895)).
- PRIMM = Predict, Run, Investigate, Modify, Make (Sentance, Waite and Kallia, 2019, [doi:10.1080/08993408.2019.1608781](https://doi.org/10.1080/08993408.2019.1608781)).

| Stage `kind` | PRIMM | The learner | `tests` |
|---|---|---|---|
| `example` | Predict, Run, Investigate | Reads a worked example, predicts, runs it (optional Mira `player`), then `orion_stage ... "done"` | optional |
| `complete` | Modify (faded steps) | Fills the TODO gaps of an isomorphic solution | required |
| `parsons` | Modify (faded steps) | Reorders shuffled lines | required |
| `modify` | Modify | Changes a working isomorphic program for a new requirement | required |
| main lab | Make | Writes the entry file until `orion_run` passes | `tests` |

Stage: `{ id, kind, title, file, tests?, player?, note? }`, where `tests` is `{ runner, path?, command?, timeoutSec? }`.

**Rule: isomorphic, never the lab's own solution.** Warm-up material has the same solution structure as the main task but a different surface (for an agent-loop lab: a tiny calculator REPL with a step budget). Orion never writes code: `orion_new_lab` writes stage files only from text given in the spec (`warmupFiles`, scaffold-only, not stored in `lab.json`) or as comment-only TODO skeletons whose default tests fail on purpose. Validated mechanically: stages never reuse the lab's entry file or tests path, stage tests have their own path (the main `tests.path` must then be declared), ids are unique, paths stay inside the lab folder, and `warmupFiles` text must not import the lab's entry file.

```json
{
  "entry": "my_react.py",
  "tests": { "runner": "pytest", "path": "tests/test_react.py" },
  "warmup": [
    { "id": "w1", "kind": "example", "title": "Worked example: calculator REPL with a step budget", "file": "warmup/w1_calc_repl_example.py" },
    { "id": "w2", "kind": "complete", "title": "Fill the gaps: REPL loop with a step budget", "file": "warmup/w2_calc_repl_complete.py",
      "tests": { "runner": "pytest", "path": "warmup/test_w2_calc_repl.py" } }
  ]
}
```

`orion_stage { lab, stage, action }`: `run` runs that stage's tests through the same runner (attempt lines get a `stage` field, numbered per stage; they never count toward the main lab), `done` marks an `example` stage as studied, `status` shows per-stage state (omit `stage` for the whole ladder). `orion_status` shows the ladder (Khởi động -> Làm chính).

---

## Lab Format (`lab.json`)

```json
{
  "title": "Agent Loop ReAct",
  "subject": "AMD AI Agents 101",
  "module": "M1",
  "language": "python",
  "entry": "my_react.py",
  "tests": {
    "runner": "pytest",
    "path": "tests/test_react.py",
    "timeoutSec": 120
  },
  "timeboxMinutes": 45,
  "dod": [
    "Break loop when steps reach max_steps",
    "Return error observation on unknown tool",
    "Stop immediately upon Final Answer"
  ],
  "checks": {
    "test_max_steps": {
      "concept": "loop-termination",
      "trace": "run_agent('q', max_steps=3)",
      "hints": [
        "Loop ran forever without breaking at max_steps.",
        "What invariant bounds the execution loop?",
        "counter = 0; while counter < max_steps: counter += 1",
        "def check_limit(steps: int, max_steps: int) -> bool: ..."
      ]
    }
  }
}
```

Optional: `warmup` (see Warm-up Ladder) and `checks.<name>.trace` (see Mira link). `orion_new_lab` also accepts scaffold-only text that is written to files and never stored in `lab.json`: `readme`, `testsContent` (main tests file), `warmupFiles` (`{ "<relative path>": "<text>" }` for warm-up files and their tests).

A lab folder structure:
```
my_lab/
├── lab.json                 # Lab specification
├── README.md                # Vietnamese guide (Objectives, Interface, DoD)
├── tests/                   # Test suite directory
│   └── test_react.py
├── warmup/                  # Optional warm-up stages (isomorphic material + their tests)
├── my_react.py              # Learner's entry file (created only when missing)
└── orion-attempts.jsonl     # Append-only run history, hint events, stage events
```

---

## MCP Tools & CLI Commands

| MCP Tool | CLI Command | Purpose |
|---|---|---|
| `orion_guide {topic?}` | `orion guide [topic]` | View ladder, warm-up, format, hints, workflows, runners |
| `orion_new_lab {dir, spec}` | `orion new <dir> <spec>` | Scaffold lab folder (and warm-up stage files); refuses solution; preserves existing files |
| `orion_predict {lab, prediction}` | `orion predict <lab> <text>` | Store learner prediction before the next run |
| `orion_run {lab}` | `orion run <lab>` | Run tests, evaluate prediction gap, return compact L1 report (+ next warm-up stage on early failures) |
| `orion_hint {lab, check, level?}` | `orion hint <lab> <check> [l]` | Escalate ladder hints (max Level 4; Level 5 refused); Level 3+ adds the Mira link for checks with `trace` |
| `orion_stage {lab, stage?, action}` | `orion stage <lab> [stage] [run\|done\|status]` | Warm-up ladder: run a stage's tests, mark an example studied, or show stage state |
| `orion_status {lab}` | `orion status <lab>` | Inspect attempts, time, hints used, the ladder (Khởi động -> Làm chính), and DoD completion |
| `orion_stats {root?}` | `orion stats [root]` | Inspect global first-pass rate, total attempts, and mistakes |
| `orion_export {lab, to_vega?, hub?}` | `orion export <lab> [--to-vega] [--hub <path>]` | Export mistakes to Polaris error log and Vega memory cards; `to_vega` also writes the Vega inbox file |

---

## Vega inbox

One adaptive review queue: Orion never writes Vega's `cards.json` or `reviews.jsonl`. `orion_export { lab, to_vega: true }` (CLI `orion export <lab> --to-vega [--hub <path>]`) writes the exported card candidates as **one new file** `<hub>/.vega/inbox/orion-<YYYYMMDDTHHmmss>-<6 hex>.jsonl` (UTC), following contract `vega-card-inbox.v1`:

- one JSON object per line: `v: 1`, `t`, `producer: "orion"`, `key: "orion:<lab folder name>:<check key>"`, `subject`, `deck`, `kind: "basic"`, `front`, `back`, `hint`, `origin: { kind: "orion-attempt", path: <lab dir>, locator: <check key> }`, `tags`, `reason`;
- every line is validated against the contract before writing (unknown fields, key prefix, date-time, length limits, no emoji); free text is clipped to the limits, keys are never altered;
- written atomically (`<name>.jsonl.tmp`, then rename); an existing inbox file is never appended to or rewritten; Vega dedupes by `key` on `vega_sync`;
- hub: parameter `hub`, then env `ORION_HUB`, then env `POLARIS_HUB`, then `D:/02_Learning_Knowledge`; the hub folder must already exist;
- only failures that match a check declared in `lab.json` become cards (a card needs the check's concept and hints). Import errors on a first attempt, timeouts and helper tests are reported as skipped; the JSON `vegaCards` payload still lists every candidate.

---

## Environment

| Variable | Purpose |
|---|---|
| `ORION_TOOLCHAIN` | Build and test toolchain folder (falls back to `VEGA_TOOLCHAIN`, `POLARIS_TOOLCHAIN`, then the Aurora toolchain) |
| `ORION_PYTHON` | Python command for pytest (default `py -3.11` on Windows, `python3` elsewhere) |
| `ORION_HUB`, `POLARIS_HUB` | Learning hub root for the Vega inbox (after the `hub` parameter; default `D:/02_Learning_Knowledge`) |

---

## Test Runners & Safety

- **Pytest**: Ran via `py -3.11 -m pytest` on Windows (configurable via `ORION_PYTHON`), with `-q -p no:cacheprovider --junitxml=<temp-file-outside-lab>`, `PYTHONIOENCODING=utf-8`, and `PYTHONDONTWRITEBYTECODE=1` (no micro `__pycache__` files on exFAT).
- **Node Test**: Ran via `node --test --test-reporter=tap` with TAP v13 output parsing.
- **Command**: Custom shell command with exit code and trailing 40 lines.
- **Process Timeout**: Configurable timeout (default 120s); kills entire process tree on Windows via `taskkill /PID <pid> /T /F`.

---

## Development

```powershell
$env:ORION_TOOLCHAIN = "C:\Users\Admin\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Local\aurora-slides\toolchain"
node scripts/build.mjs --check
node scripts/e2e.mjs
```

---

## License

MIT License (c) 2026 DuongNAD
