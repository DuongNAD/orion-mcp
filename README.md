[Tiếng Việt](README.vi.md) | English

<p align="center"><img src="docs/banner.jpg" alt="Orion MCP — Orion constellation and the glowing Orion Nebula" width="100%"></p>

# Orion MCP

*Named after the hunter: practice as hunting your own bugs.*

Orion is the practice lab engine of the learner's MCP ecosystem: hands-on exercises checked by real tests (pytest, node --test, or declared commands), tutoring ladder hints that never reach the solution, predict-then-run before each run, attempt history, and exports for the Polaris error log ("Sổ lỗi") and Vega memory cards.

Named after the hunter: practice is hunting your own bugs.

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
4. **Few files, local only**: Per lab exactly one `lab.json` (definition) and one `orion-attempts.jsonl` (history); nothing leaves the machine; no recursive scans of D:; no `node_modules` on D: (exFAT drive).
5. **Toolchain discipline**: TypeScript, single esbuild bundle `dist/orion.mjs`, external toolchain via `ORION_TOOLCHAIN`.

---

## Tutoring Ladder

Orion implements the 5-level tutoring ladder:

| Level | Name | Purpose | Orion Behavior |
|---|---|---|---|
| **Level 1** | Symptom | Point at the failing line, symptom, or state without fix | Automatically returned in `orion_run` for failing checks |
| **Level 2** | Guiding questions | Boundaries, loop invariants, data flow | Escalated via `orion_hint` |
| **Level 3** | Counter-example | Minimal failing counter-example once root cause is known | Escalated via `orion_hint` |
| **Level 4** | Signatures / Pseudocode | Function signature, types, or skeleton when syntax is missing | Max level provided by Orion |
| **Level 5** | Full code | Complete code implementation with invariants explained | **Always refused by Orion** |

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

A lab folder structure:
```
my_lab/
├── lab.json                 # Lab specification
├── README.md                # Vietnamese guide (Objectives, Interface, DoD)
├── tests/                   # Test suite directory
│   └── test_react.py
├── my_react.py              # Learner's entry file (created only when missing)
└── orion-attempts.jsonl     # Append-only run history & hint events
```

---

## MCP Tools & CLI Commands

| MCP Tool | CLI Command | Purpose |
|---|---|---|
| `orion_guide {topic?}` | `orion guide [topic]` | View ladder, format, hints, workflows, runners |
| `orion_new_lab {dir, spec}` | `orion new <dir> <spec>` | Scaffold lab folder; refuses solution; preserves entry |
| `orion_predict {lab, prediction}` | `orion predict <lab> <text>` | Store learner prediction before run |
| `orion_run {lab}` | `orion run <lab>` | Run tests, evaluate prediction gap, return compact L1 report |
| `orion_hint {lab, check, level?}` | `orion hint <lab> <check> [l]` | Escalate ladder hints (max Level 4; Level 5 refused) |
| `orion_status {lab}` | `orion status <lab>` | Inspect attempts, time, hints used, and DoD completion |
| `orion_stats {root?}` | `orion stats [root]` | Inspect global first-pass rate, total attempts, and mistakes |
| `orion_export {lab}` | `orion export <lab>` | Export mistakes to Polaris error log and Vega memory cards |

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
