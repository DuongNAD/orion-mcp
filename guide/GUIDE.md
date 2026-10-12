# Orion MCP Guide (v0.2.0)

Orion is the practice lab engine of the learner's MCP ecosystem: hands-on exercises checked by real tests, an optional warm-up ladder (PRIMM) before the main task, hints that follow the learning hub's tutoring ladder (never the solution), predict-then-run, and attempt history that feeds the error log (Polaris) and memory cards (Vega). Named after the mythical hunter: practice is hunting your own bugs.

## Ecosystem Table

| Project | Author | Role in Learning Hub |
|---|---|---|
| **Polaris** | DuongNAD | Course architect, roadmaps, facts, and spaced-review error log |
| **Aurora Slides** | DuongNAD | Keynote-grade lessons, notebook pages, memory palaces, quizzes |
| **SmartDrive-OS** | DuongNAD | SSD storage governance, indexing, and fast learning search |
| **Constellation** | DuongNAD | MCP ecosystem registration, health checks, and contracts |
| **Vega** | DuongNAD | Adaptive spaced repetition memory engine (FSRS); one review queue, fed through its inbox |
| **Mira** | DuongNAD | Line-by-line trace player of the learner's own code (`mira_record`) |
| **Orion** | DuongNAD | Practice labs, real test runners, warm-up ladder, tutoring ladder, and attempt history |

---

## 1. Principles

1. **Never the solution**: Labs ship tests, a Vietnamese README, and a starter file with docstrings and TODOs only. Hints climb the ladder one level at a time; Level 5 (full code) is never produced by Orion (the agent decides, following AGENTS.md, and only on the learner's explicit request).
2. **Real checks**: Tests run locally with the learner's own tools (pytest for Python, node --test for JavaScript, or a command declared in lab.json), time-boxed, results parsed from structured output (JUnit XML / TAP), never from guesses.
3. **Predict first**: `orion_predict` stores the learner's prediction of the outcome before a run; the run reports the gap, which is what gets learned.
4. **Few files, local only**: Per lab one `lab.json` (definition), one `orion-attempts.jsonl` (history), and the stage and test files named in `lab.json`; nothing leaves the machine except a new Vega inbox file on request; no recursive scans of D:; no node_modules on D: (exFAT drive).
5. **Toolchain discipline**: TypeScript, one esbuild bundle `dist/orion.mjs`, external toolchain via `ORION_TOOLCHAIN`.
6. **Warm-up before make (PRIMM)**: a lab may carry 0-4 warm-up stages built on an ISOMORPHIC problem (same solution structure, different surface), never the lab's own solution; the main lab is the final "make" stage. Orion never generates stage code: stage files come from text supplied in the spec or comment-only TODO skeletons. The ladder never blocks; the learner may skip it.
7. **One review queue**: `orion_export { lab, to_vega: true }` drops card candidates into Vega's inbox; Vega alone schedules reviews.

---

## 2. Tutoring Ladder

Orion implements the 5-level tutoring ladder from `D:/02_Learning_Knowledge/AGENTS.md`:

- **Level 1**: Point at the symptom or state, no fix (automatically included in `orion_run` for failing checks).
- **Level 2**: Ask guiding questions (boundaries, invariants, data flow).
- **Level 3**: Minimal failing counter-example (once root cause is known).
- **Level 4**: Pseudocode or API signatures (syntax only).
- **Level 5**: Full code (**NEVER produced by Orion**; only upon explicit user request to a human or agent mentor).

### Mira link for counter-examples (`trace`)

A check may declare `trace`: one single-line Python call expression (at most 300 characters) that reproduces the minimal counter-example, for example `run_agent('q', max_steps=3)`. When `orion_hint` returns **Level 3 or 4** for such a check, the reply ends with:

```
Dò code với Mira: mira_record { lab: "<lab dir>", call: "<trace>" }
```

Mira is a sibling MCP that records a real line-by-line trace of the learner's own entry file. Both values are JSON strings, so quotes inside the call stay unambiguous. Levels 1 and 2, and checks without `trace`, never carry the line.

---

## 3. Warm-up Ladder: Bậc khởi động (PRIMM)

Before the main task a lab may declare `warmup`: 0-4 stages ordered from most to least assistance. The main lab (entry and tests) is the final **make** stage. The ladder is **never blocking**: the learner may skip it.

**Why** (short):
- Novices gain from high assistance and lose with hints-only problem solving (expertise reversal meta-analysis; Tetzlaff et al., 2025, doi:10.1016/j.learninstruc.2025.102142).
- Worked examples followed by faded steps give near and far transfer (Atkinson, Renkl and Merrill, 2003, doi:10.1037/0022-0663.95.4.774).
- Parsons problems are faster with similar learning (Ericson, Margulieux and Rick, 2017, doi:10.1145/3141880.3141895).
- PRIMM = Predict, Run, Investigate, Modify, Make (Sentance, Waite and Kallia, 2019, doi:10.1080/08993408.2019.1608781).

| Stage `kind` | PRIMM | The learner | `tests` |
|---|---|---|---|
| `example` | Predict, Run, Investigate | Reads a worked example, predicts, runs it (Mira `player` if set), investigates; then `orion_stage ... action: "done"` | optional |
| `complete` | Modify (faded steps) | Fills the TODO gaps of an isomorphic solution, then `run` | required |
| `parsons` | Modify (faded steps) | Reorders shuffled lines, then `run` | required |
| `modify` | Modify | Changes a working isomorphic program to meet a new requirement, then `run` | required |
| main lab | Make | Writes the entry file until `orion_run` passes | `tests` |

**Rule: isomorphic, never the lab's own solution.** Warm-up material has the same solution structure as the main task but a different surface (for an agent-loop lab: a tiny calculator REPL with a step budget). It is never the lab's own solution. Orion never writes code: `orion_new_lab` writes stage files only from text supplied in the spec (`warmupFiles`, a scaffold-only map `{ "<relative path>": "<text>" }` that is not stored in `lab.json`) or as comment-only TODO skeletons whose default tests fail on purpose. What Orion validates: stages never reuse the lab's `entry` file or its tests path, stage tests have their own path (and the main `tests.path` must be declared so the main run does not collect them), ids are unique, paths stay inside the lab folder, and `warmupFiles` text must not import the lab's entry file.

Stage object: `{ id, kind, title, file, tests?, player?, note? }`.

```json
{
  "title": "Agent Loop ReAct",
  "entry": "my_react.py",
  "tests": { "runner": "pytest", "path": "tests/test_react.py" },
  "warmup": [
    { "id": "w1", "kind": "example", "title": "Ví dụ mẫu: máy tính REPL có ngân sách bước", "file": "warmup/w1_calc_repl_example.py", "player": "warmup/w1_calc_repl.player.html" },
    { "id": "w2", "kind": "complete", "title": "Điền chỗ trống: vòng lặp REPL", "file": "warmup/w2_calc_repl_complete.py",
      "tests": { "runner": "pytest", "path": "warmup/test_w2_calc_repl.py" } },
    { "id": "w3", "kind": "modify", "title": "Sửa REPL: lệnh lạ trả về quan sát lỗi", "file": "warmup/w3_calc_repl_modify.py",
      "tests": { "runner": "pytest", "path": "warmup/test_w3_calc_repl.py" } }
  ]
}
```

Commands:
- `orion_stage { lab, stage, action: "run" }` runs that stage's tests through the same runner code path; the attempt line in `orion-attempts.jsonl` gets a `stage` field and is numbered per stage. A pending prediction is consumed by the next run, whichever it is.
- `orion_stage { lab, stage, action: "done" }` marks an `example` stage as studied (one history record `{ type: "stage", event: "studied" }`; repeating it appends nothing).
- `orion_stage { lab, stage?, action: "status" }` shows per-stage state; omit `stage` for the whole ladder.
- `orion_status` shows the ladder (Khởi động -> Làm chính) with each stage state. `orion_run` names the next unfinished warm-up stage when the main tests fail on attempts 1-3, then stops mentioning it.
- Stage runs never count toward the main lab's attempts, first pass, global stats, or export.

---

## 4. Lab Format (`lab.json`)

```json
{
  "title": "Agent Loop ReAct",
  "subject": "AI Agents 101",
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
    "Pass max_steps test",
    "Pass unknown_tool test",
    "Pass final_answer test"
  ],
  "checks": {
    "test_max_steps": {
      "concept": "loop-termination",
      "trace": "run_agent('q', max_steps=3)",
      "hints": [
        "Loop ran forever without stopping at max_steps.",
        "What invariant bounds the execution loop?",
        "counter = 0; while counter < max_steps: counter += 1",
        "if steps >= max_steps: return 'Max steps reached'"
      ]
    }
  }
}
```

Optional fields added in v0.2: `warmup` (section 3) and `checks.<name>.trace` (section 2). `orion_new_lab` also accepts scaffold-only text that is written to files and never stored in `lab.json`: `readme`, `testsContent` (the main tests file) and `warmupFiles`.

---

## 5. MCP Tools & CLI Commands

| MCP Tool | CLI Command | Purpose |
|---|---|---|
| `orion_guide {topic?}` | `orion guide [topic]` | View guidance on ladder, warm-up, format, hints, workflows, runners |
| `orion_new_lab {dir, spec}` | `orion new <dir> <spec>` | Validate and scaffold a lab (and warm-up stage files); refuses solution fields; never overwrites existing files |
| `orion_predict {lab, prediction}` | `orion predict <lab> <text>` | Record learner prediction before the next run (main or stage) |
| `orion_run {lab}` | `orion run <lab>` | Run tests, evaluate prediction gap, return compact report with L1 hints (and the next warm-up stage on early failures) |
| `orion_hint {lab, check, level?}` | `orion hint <lab> <check> [l]` | Request next ladder hint (max Level 4; Level 5 refused); Level 3+ adds the Mira link for checks with `trace` |
| `orion_stage {lab, stage?, action}` | `orion stage <lab> [stage] [run\|done\|status]` | Warm-up ladder: run a stage's tests, mark an example studied, or show stage state |
| `orion_status {lab}` | `orion status <lab>` | Inspect attempts, time, hints used, the ladder (Khởi động -> Làm chính), and DoD completion |
| `orion_stats {root?}` | `orion stats [root]` | Inspect global first-pass rate, total attempts, and frequent mistakes |
| `orion_export {lab, to_vega?, hub?}` | `orion export <lab> [--to-vega] [--hub <path>]` | Export repeated mistakes to Polaris error log and Vega memory cards; `to_vega` also writes the Vega inbox file |

---

## 6. Vega inbox (`orion_export ... to_vega`)

One adaptive review queue: Orion never writes Vega's `cards.json` or `reviews.jsonl`. With `to_vega: true` (CLI `--to-vega`) it writes the exported card candidates as **one new file** `<hub>/.vega/inbox/orion-<YYYYMMDDTHHmmss>-<6 hex>.jsonl` (UTC) following contract `vega-card-inbox.v1`:

- one JSON object per line: `v: 1`, `t`, `producer: "orion"`, `key: "orion:<lab folder name>:<check key>"`, `subject`, `deck`, `kind: "basic"`, `front`, `back`, `hint`, `origin: { kind: "orion-attempt", path: <lab dir>, locator: <check key> }`, `tags`, `reason`;
- every line is validated against the contract before writing (unknown fields, key prefix, date-time, length limits, no emoji); free text is clipped to the limits, keys are never altered;
- written atomically (`<name>.jsonl.tmp`, then rename); an existing inbox file is never appended to or rewritten; Vega dedupes by `key`;
- hub: parameter `hub`, then env `ORION_HUB`, then env `POLARIS_HUB`, then `D:/02_Learning_Knowledge`; the hub folder must already exist;
- only failures that match a check declared in `lab.json` become cards (they carry a concept and hints). Import errors on a first attempt, timeouts and helper tests are reported as skipped; the JSON `vegaCards` payload still lists every candidate.
