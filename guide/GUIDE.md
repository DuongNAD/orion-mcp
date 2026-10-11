# Orion MCP Guide

Orion is the practice lab engine of the learner's MCP ecosystem: hands-on exercises checked by real tests, hints that follow the learning hub's tutoring ladder (never the solution), predict-then-run, and attempt history that feeds the error log (Polaris) and memory cards (Vega). Named after the mythical hunter: practice is hunting your own bugs.

## Ecosystem Table

| Project | Author | Role in Learning Hub |
|---|---|---|
| **Polaris** | DuongNAD | Course architect, roadmaps, facts, and spaced-review error log |
| **Aurora Slides** | DuongNAD | Keynote-grade lessons, notebook pages, memory palaces, quizzes |
| **SmartDrive-OS** | DuongNAD | SSD storage governance, indexing, and fast learning search |
| **Constellation** | DuongNAD | MCP ecosystem registration, health checks, and contracts |
| **Vega** | DuongNAD | Adaptive spaced repetition memory engine (FSRS) |
| **Orion** | DuongNAD | Practice labs, real test runners, tutoring ladder, and attempt history |

---

## 1. Principles

1. **Never the solution**: Labs ship tests, a Vietnamese README, and a starter file with docstrings and TODOs only. Hints climb the ladder one level at a time; Level 5 (full code) is never produced by Orion (the agent decides, following AGENTS.md, and only on the learner's explicit request).
2. **Real checks**: Tests run locally with the learner's own tools (pytest for Python, node --test for JavaScript, or a command declared in lab.json), time-boxed, results parsed from structured output (JUnit XML / TAP), never from guesses.
3. **Predict first**: `orion_predict` stores the learner's prediction of the outcome before a run; the run reports the gap, which is what gets learned.
4. **Few files, local only**: Per lab one `lab.json` (definition) and one `orion-attempts.jsonl` (history); nothing leaves the machine; no recursive scans of D:; no node_modules on D: (exFAT drive).
5. **Toolchain discipline**: TypeScript, one esbuild bundle `dist/orion.mjs`, external toolchain via `ORION_TOOLCHAIN`.

---

## 2. Tutoring Ladder

Orion implements the 5-level tutoring ladder from `D:/02_Learning_Knowledge/AGENTS.md`:

- **Level 1**: Point at the symptom or state, no fix (automatically included in `orion_run` for failing checks).
- **Level 2**: Ask guiding questions (boundaries, invariants, data flow).
- **Level 3**: Minimal failing counter-example (once root cause is known).
- **Level 4**: Pseudocode or API signatures (syntax only).
- **Level 5**: Full code (**NEVER produced by Orion**; only upon explicit user request to a human or agent mentor).

---

## 3. Lab Format (`lab.json`)

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

---

## 4. MCP Tools & CLI Commands

| MCP Tool | CLI Command | Purpose |
|---|---|---|
| `orion_guide {topic?}` | `orion guide [topic]` | View guidance on ladder, format, hints, workflows, runners |
| `orion_new_lab {dir, spec}` | `orion new <dir> <spec>` | Validate and scaffold a lab; refuses solution fields; never overwrites entry |
| `orion_predict {lab, prediction}` | `orion predict <lab> <text>` | Record learner prediction before a test run |
| `orion_run {lab}` | `orion run <lab>` | Run tests, evaluate prediction gap, return compact report with L1 hints |
| `orion_hint {lab, check, level?}` | `orion hint <lab> <check> [l]` | Request next ladder hint (max Level 4; Level 5 refused) |
| `orion_status {lab}` | `orion status <lab>` | Inspect attempts, time, hints used, and DoD completion |
| `orion_stats {root?}` | `orion stats [root]` | Inspect global first-pass rate, total attempts, and frequent mistakes |
| `orion_export {lab}` | `orion export <lab>` | Export repeated mistakes to Polaris error log and Vega memory cards |
