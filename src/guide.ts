export const GUIDE_TOPICS = [
  "overview",
  "ladder",
  "format",
  "hints",
  "workflows",
  "runners",
] as const;
export type GuideTopic = (typeof GUIDE_TOPICS)[number];

export const GUIDE_DOCS: Record<GuideTopic, string> = {
  overview: `# Orion MCP: Practice Lab & Tutoring Ladder Engine

Orion is the practice lab engine of the learner's MCP ecosystem. Named after the mythical hunter: practice is hunting your own bugs.

## Ecosystem (DuongNAD)
- **Polaris**: Course architect: sources, facts with locators, roadmap, schedule, error log.
- **Aurora Slides**: Keynote-style lessons: quizzes, predict and trace slides, progress events.
- **Vega**: FSRS memory engine and the single review queue (card inbox).
- **Orion** (this server): Practice labs with real tests, tutoring ladder and PRIMM warm-up.
- **Mira**: Code-tracing lab: real Python traces, line-by-line players with prediction gates.
- **Rigel**: Grounded tutor: answers from the learner's lesson materials with [ref] citations.
- **Sirius**: Execution loop: deadlines, triage, today router, session timer, weekly review.
- **Constellation**: MCP registration, health checks and shared contracts.
- **SmartDrive-OS**: SSD governance, index and learning search.

## Core Principles
1. **Never the solution**: Orion never writes solution code. Starter files only contain docstrings, imports, and TODOs/NotImplementedError. Hints escalate from Level 1 to 4; Level 5 (full code) is never provided by Orion.
2. **Real checks**: Tests run locally using real runners (pytest for Python, node --test for Node, or declared commands), time-boxed, parsed from structured JUnit XML or TAP output.
3. **Predict first**: \`orion_predict\` records the mental model before execution; \`orion_run\` reports the gap between prediction and actual outcome.
4. **Local & clean**: Per lab one \`lab.json\`, one append-only \`orion-attempts.jsonl\`, and the stage and test files named in \`lab.json\`. Never scans \`D:\` recursively.
5. **Toolchain discipline**: TypeScript, single esbuild bundle (\`dist/orion.mjs\`), zero runtime dependencies, external toolchain.
6. **Warm-up before make (PRIMM)**: a lab may carry 0-4 warm-up stages (\`warmup\`) built on an ISOMORPHIC problem, never the lab's own solution; the main lab is the final "make" stage. Never blocking (\`orion_guide { topic: "ladder" }\`).
7. **One review queue**: \`orion_export { lab, to_vega: true }\` drops card candidates into Vega's inbox (\`<hub>/.vega/inbox/\`); Vega alone schedules reviews.`,

  ladder: `# Orion Tutoring Ladder (Thang hỗ trợ người học)

Based on the learning hub rules (\`D:/02_Learning_Knowledge/AGENTS.md\`), Orion enforces a 5-level tutoring ladder:

| Bậc (Level) | Mục đích | Nội dung hỗ trợ | Quy tắc Orion |
|---|---|---|---|
| **Level 1** | Chỉ triệu chứng (Symptom) | Chỉ ra dòng lỗi, biến có giá trị bất thường hoặc trạng thái sai. Tuyệt đối không gợi ý cách sửa. | Tự động trả về trong \`orion_run\` cho mỗi test thất bại. |
| **Level 2** | Câu hỏi định hướng (Guiding questions) | Đặt câu hỏi về điều kiện biên, bất biến (invariants), luồng dữ liệu (data flow). | Cung cấp qua \`orion_hint { lab, check }\`. |
| **Level 3** | Phản ví dụ tối thiểu (Counter-example) | Đưa ra một trường hợp đầu vào nhỏ nhất làm lộ ra lỗi khi đã rõ nguyên nhân. | Cung cấp qua \`orion_hint\` khi tiếp tục bị kẹt. |
| **Level 4** | Mã giả hoặc Chữ ký API (Signatures) | Đưa ra chữ ký hàm, kiểu dữ liệu hoặc khung sườn mã giả khi chỉ thiếu cú pháp. | Cấp cao nhất mà Orion hỗ trợ. |
| **Level 5** | Mã hoàn chỉnh (Full code) | Toàn bộ mã giải bài toán kèm giải thích bất biến. | **LUÔN TỪ CHỐI BỞI ORION.** Người học phải yêu cầu trực tiếp người hướng dẫn hoặc agent mentor. |

## Quy tắc leo bậc (Escalation)
- Không nhảy cóc: Người học phải đi từ Level 1 -> Level 2 -> Level 3 -> Level 4.
- Mỗi lần gọi \`orion_hint\` sẽ ghi nhận vào \`orion-attempts.jsonl\`.
- Khi đã nhận Level 4, yêu cầu gợi ý tiếp theo sẽ bị từ chối kèm thông báo giải thích.
- Từ Level 3 trở lên, nếu check có trường \`trace\` (một biểu thức gọi hàm Python tái hiện phản ví dụ tối thiểu), phần cuối gợi ý có thêm dòng \`Dò code với Mira: mira_record { lab: "<thư mục lab>", call: "<trace>" }\`. Mira là MCP anh em, ghi lại vết chạy thật từng dòng của chính tệp bài làm của người học.

---

## Bậc khởi động (PRIMM)

Trước bài chính, một bài lab có thể có **thang khởi động** (\`warmup\`, 0-4 bậc) đi từ nhiều hỗ trợ đến ít hỗ trợ, rồi mới tới **Làm chính**. Thang này không bắt buộc: người học có thể bỏ qua, Orion không chặn.

### Bằng chứng (ngắn)
- Người mới được lợi từ hỗ trợ cao và bị thiệt khi chỉ nhận gợi ý để tự giải bài (phân tích tổng hợp về hiệu ứng đảo ngược chuyên môn; Tetzlaff và cộng sự, 2025, doi:10.1016/j.learninstruc.2025.102142).
- Ví dụ mẫu rồi giảm dần các bước đã làm sẵn cho kết quả chuyển giao gần và xa (Atkinson, Renkl và Merrill, 2003, doi:10.1037/0022-0663.95.4.774).
- Bài Parsons (sắp xếp lại các dòng mã) làm nhanh hơn mà việc học tương đương (Ericson, Margulieux và Rick, 2017, doi:10.1145/3141880.3141895).
- PRIMM = Predict, Run, Investigate, Modify, Make (Sentance, Waite và Kallia, 2019, doi:10.1080/08993408.2019.1608781).

### Các loại bậc (\`kind\`)
| Loại | PRIMM | Người học làm gì | Cần \`tests\` |
|---|---|---|---|
| \`example\` | Predict, Run, Investigate | Đọc ví dụ mẫu có lời giải, dự đoán đầu ra, chạy thử (mở trình phát Mira nếu có \`player\`), điều tra từng bước; xong thì \`orion_stage { lab, stage, action: "done" }\` | Không |
| \`complete\` | Modify (giảm dần các bước làm sẵn) | Điền các chỗ trống TODO của một lời giải đẳng cấu, rồi \`run\` | Có |
| \`parsons\` | Modify (giảm dần các bước làm sẵn) | Sắp xếp lại các dòng mã bị xáo trộn, rồi \`run\` | Có |
| \`modify\` | Modify | Sửa một chương trình đẳng cấu đã chạy đúng để thỏa yêu cầu mới, rồi \`run\` | Có |
| Bài chính | Make | Viết trong tệp \`entry\` đến khi \`orion_run\` đạt 100% | Có (\`tests\`) |

Mỗi bậc: \`{ id, kind, title, file, tests?, player?, note? }\`. \`file\` tính từ thư mục lab; \`player\` (chỉ cho \`example\`) là đường dẫn trình phát vết Mira; \`tests\` có dạng \`{ runner, path?, command?, timeoutSec? }\`.

### Quy tắc đẳng cấu (isomorphic)
Tài liệu khởi động là một bài **ĐẲNG CẤU**: cùng cấu trúc lời giải với bài chính nhưng khác bề mặt bài toán. Nó **KHÔNG BAO GIỜ** là lời giải của chính bài chính. Orion không tự sinh mã: \`orion_new_lab\` chỉ ghi tệp bậc bằng nội dung do người soạn spec cung cấp (khóa \`warmupFiles\`) hoặc khung TODO chỉ có chú thích. Orion kiểm tra những gì kiểm tra được: bậc không được dùng lại tệp \`entry\` hay đường dẫn \`tests\` của bài chính, test của bậc phải có đường dẫn riêng (và bài chính phải khai báo \`tests.path\` để không gom nhầm test của bậc), và nội dung \`warmupFiles\` không được import tệp \`entry\`.

### Lệnh
- \`orion_stage { lab, stage, action: "run" }\`: chạy test của bậc bằng cùng trình chạy; dòng trong \`orion-attempts.jsonl\` có thêm trường \`stage\`. Dự đoán đang chờ (\`orion_predict\`) được dùng cho lần chạy kế tiếp, dù là bậc hay bài chính.
- \`orion_stage { lab, stage, action: "done" }\`: đánh dấu bậc \`example\` là đã xem (ghi một bản ghi vào lịch sử).
- \`orion_stage { lab, stage, action: "status" }\`: trạng thái từng bậc; bỏ \`stage\` để xem cả thang.
- \`orion_status\` hiển thị thang (Khởi động -> Làm chính) cùng trạng thái từng bậc. \`orion_run\` nhắc bậc khởi động chưa xong tiếp theo khi bài chính thất bại ở 3 lần đầu; sau đó không nhắc nữa.
- Lần chạy của bậc không tính vào số lần chạy, first-pass hay export của bài chính.

### Ví dụ \`lab.json\` có khởi động (bài vòng lặp agent, bài đẳng cấu: máy tính REPL có ngân sách bước)
\`\`\`json
{
  "title": "Agent Loop ReAct",
  "subject": "AI Agents 101",
  "module": "M1",
  "language": "python",
  "entry": "my_react.py",
  "tests": { "runner": "pytest", "path": "tests/test_react.py", "timeoutSec": 120 },
  "timeboxMinutes": 45,
  "warmup": [
    {
      "id": "w1",
      "kind": "example",
      "title": "Ví dụ mẫu: máy tính REPL có ngân sách bước",
      "file": "warmup/w1_calc_repl_example.py",
      "player": "warmup/w1_calc_repl.player.html",
      "note": "Dự đoán đầu ra trước khi chạy; để ý REPL dừng khi hết ngân sách bước."
    },
    {
      "id": "w2",
      "kind": "complete",
      "title": "Điền chỗ trống: vòng lặp REPL với ngân sách bước",
      "file": "warmup/w2_calc_repl_complete.py",
      "tests": { "runner": "pytest", "path": "warmup/test_w2_calc_repl.py", "timeoutSec": 60 }
    },
    {
      "id": "w3",
      "kind": "parsons",
      "title": "Sắp xếp lại các dòng của vòng lặp REPL",
      "file": "warmup/w3_calc_repl_parsons.py",
      "tests": { "runner": "pytest", "path": "warmup/test_w3_calc_repl.py", "timeoutSec": 60 }
    },
    {
      "id": "w4",
      "kind": "modify",
      "title": "Sửa REPL: lệnh lạ trả về quan sát lỗi thay vì dừng",
      "file": "warmup/w4_calc_repl_modify.py",
      "tests": { "runner": "pytest", "path": "warmup/test_w4_calc_repl.py", "timeoutSec": 60 }
    }
  ],
  "dod": [
    "Vòng lặp ngắt chính xác khi chạm max_steps",
    "Trả về observation lỗi khi gặp tool không xác định"
  ],
  "checks": {
    "test_max_steps": {
      "concept": "loop-termination",
      "trace": "run_agent('q', max_steps=3)",
      "hints": [
        "Vòng lặp không dừng khi số bước vượt quá max_steps.",
        "Điều kiện dừng (loop invariant) của vòng lặp while là gì?",
        "Phản ví dụ: run_agent('q', max_steps=3) khi mô hình luôn sinh Action phải dừng sau đúng 3 bước, nhưng đang chạy tiếp.",
        "def run_agent(prompt: str, max_steps: int = 5) -> str: ..."
      ]
    }
  }
}
\`\`\`
Nội dung các tệp bậc (ví dụ mẫu REPL, bài điền chỗ trống, bài Parsons, test của bậc) do người soạn lab viết, dựa trên bài đẳng cấu, và truyền qua \`warmupFiles\` khi gọi \`orion_new_lab\` (hoặc viết thẳng vào tệp). Nếu không truyền, Orion chỉ ghi khung TODO chỉ có chú thích, và test mặc định chủ ý thất bại cho đến khi người soạn thay nó.`,

  format: `# Cấu trúc bài thực hành (Lab Format)

Một thư mục lab đạt chuẩn Orion chứa:
\`\`\`
my_lab/
├── lab.json                 # Định nghĩa bài lab (bắt buộc)
├── README.md                # Tài liệu hướng dẫn bằng tiếng Việt (Mục tiêu, Giao diện, DoD)
├── tests/                   # Thư mục chứa bài kiểm thử (pytest hoặc node test)
│   └── test_main.py
├── my_solution_file.py      # Tệp bài làm của người học (chỉ TODOs khi khởi tạo)
└── orion-attempts.jsonl     # Lịch sử các lần chạy và gợi ý (tự sinh khi run)
\`\`\`

## Cấu trúc \`lab.json\`
\`\`\`json
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
    "Vòng lặp ngắt chính xác khi chạm max_steps",
    "Trả về thông báo lỗi chuẩn khi gặp tool không xác định",
    "Từ chối Final Answer nếu còn Action chưa thực thi"
  ],
  "checks": {
    "test_max_steps": {
      "concept": "loop-termination",
      "hints": [
        "Vòng lặp không dừng khi số bước vượt quá max_steps.",
        "Điều kiện dừng (loop invariant) của vòng lặp while là gì?",
        "counter = 0; while counter < max_steps: counter += 1",
        "def check_limit(steps: int, max_steps: int) -> bool: ..."
      ]
    }
  }
}
\`\`\`

## Các trường tùy chọn (từ v0.2)
- \`checks.<tên>.trace\`: một biểu thức gọi hàm Python, một dòng, tái hiện phản ví dụ tối thiểu, ví dụ \`run_agent('q', max_steps=3)\`. Từ Level 3 của \`orion_hint\`, kết quả có thêm dòng \`Dò code với Mira: mira_record { lab, call }\`.
- \`warmup\`: 0-4 bậc khởi động \`{ id, kind, title, file, tests?, player?, note? }\` trước bài chính (xem \`orion_guide { topic: "ladder" }\`, mục "Bậc khởi động (PRIMM)"). \`kind\`: \`example | complete | parsons | modify\`; \`tests\` bắt buộc với \`complete\`, \`parsons\`, \`modify\`; \`id\` duy nhất và không trùng \`run\`, \`done\`, \`status\`; \`file\` và \`tests.path\` là đường dẫn tương đối nằm trong thư mục lab. Khi có bậc có test và bài chính dùng runner \`pytest\` hoặc \`node\` thì bài chính phải khai báo \`tests.path\`.

## Khóa chỉ dùng khi scaffold (không lưu vào lab.json)
Khi gọi \`orion_new_lab\`, spec có thể kèm: \`readme\` (nội dung README tiếng Việt), \`testsContent\` (nội dung tệp test chính), \`warmupFiles\` (đối tượng \`{ "<đường dẫn tương đối>": "<nội dung>" }\` cho tệp bậc và tệp test của bậc). Khóa của \`warmupFiles\` phải trùng \`file\` hoặc \`tests.path\` của một bậc. Không có \`warmupFiles\`: Orion ghi khung TODO chỉ có chú thích (test mặc định của bậc chủ ý thất bại cho đến khi được thay). Tệp đã tồn tại không bao giờ bị ghi đè.

## Quy tắc an toàn (Safety Invariants)
- \`lab.json\` không bao giờ có trường \`solution\` hay \`solutions\`. Lệnh \`orion_new_lab\` sẽ từ chối scaffold nếu phát hiện từ khoá này.
- Khi scaffold, tệp bài làm (\`entry\`) nếu đã tồn tại thì tuyệt đối không bị ghi đè.
- Tài liệu khởi động là bài ĐẲNG CẤU, không phải lời giải của chính bài chính: bậc không được dùng \`entry\` hay \`tests\` của bài chính, và nội dung \`warmupFiles\` không được import tệp \`entry\`.`,

  hints: `# Hướng dẫn soạn Gợi ý Bậc thang (Writing Effective Ladder Hints)

Mỗi kiểm tra trong \`checks\` cần cung cấp mảng \`hints\` từ 1 đến 4 phần tử tương ứng với 4 cấp độ:

### Ví dụ chuẩn:
\`\`\`json
"test_unknown_tool": {
  "concept": "tool-registry-lookup",
  "hints": [
    "Level 1: Gặp lỗi KeyError khi tra cứu tên công cụ trong từ điển hoặc danh sách registry.",
    "Level 2: Trong kiến trúc Agent, khi LLM sinh ra một Tool Name không nằm trong danh sách được cấp phép, agent nên ném ngoại lệ hay trả về quan sát báo lỗi (Observation)?",
    "Level 3: registry.get('tool_khong_ton_tai') trả về None thay vì hàm thực thi.",
    "Level 4: if tool_name not in registry: return f'Error: Tool {tool_name} not found. Available: {list(registry.keys())}'"
  ]
}
\`\`\`

### Nguyên tắc viết gợi ý:
- **Tiếng Việt rõ ràng, chuẩn kỹ thuật**: Không dùng filler, không dùng emoji.
- **Level 1**: Mô tả triệu chứng khách quan (symptom/state), không gợi ý hành động cụ thể.
- **Level 2**: Kích thích suy nghĩ về bất biến (invariants) và kiến trúc hệ thống.
- **Level 3**: Phản ví dụ nhỏ gọn, chứng minh giả định sai.
- **Level 4**: Chữ ký hoặc khung sườn mã giả, chỉ giải quyết cú pháp khi tư duy đã đúng.

### Liên kết với Mira (\`trace\`)
Nếu phản ví dụ (Level 3) có thể viết thành một biểu thức gọi hàm, khai báo nó trong \`trace\` của check:
\`\`\`json
"test_max_steps": {
  "concept": "loop-termination",
  "trace": "run_agent('q', max_steps=3)",
  "hints": ["...", "...", "...", "..."]
}
\`\`\`
\`trace\` phải là một biểu thức gọi hàm Python trên một dòng (tối đa 300 ký tự). Khi \`orion_hint\` trả về Level 3 hoặc 4 cho check này, kết quả có thêm dòng:
\`Dò code với Mira: mira_record { lab: "<thư mục lab>", call: "<trace>" }\`
để người học xem vết chạy thật từng dòng của chính tệp bài làm. Level 1 và 2 không có dòng này; check không có \`trace\` cũng không có.`,

  workflows: `# Quy trình thực hành chuẩn với Orion MCP (Workflow)

\`\`\`mermaid
flowchart TD
    W["0. Khởi động (nếu lab có warmup): orion_stage { lab, stage, action }"] --> A
    A["1. Đọc README & Xác định mục tiêu DoD"] --> B["2. orion_predict { lab, prediction }"]
    B --> C["3. orion_run { lab }"]
    C --> D{"100% Tests Pass?"}
    D -- "Có (All Pass)" --> E["4. DoD Completed! orion_status"]
    E --> F["5. orion_export -> Polaris & Vega inbox"]
    D -- "Không (Failed)" --> G["Đọc Level 1 Hint trong báo cáo"]
    G --> H{"Tự sửa được không?"}
    H -- "Có" --> I["Sửa code trong entry file"]
    I --> B
    H -- "Không (Bị kẹt)" --> K["orion_hint { lab, check } (Leo lên L2 -> L3 -> L4; L3+ có thể kèm Mira)"]
    K --> I
\`\`\`

## Các bước thao tác:
0. **Khởi động (tùy chọn, PRIMM)**: nếu \`orion_status\` hiển thị thang Khởi động, người mới nên đi qua trước: bậc \`example\` đọc xong thì \`orion_stage { lab: "path/to/lab", stage: "w1", action: "done" }\`; các bậc \`complete\`, \`parsons\`, \`modify\` thì \`orion_stage { lab: "path/to/lab", stage: "w2", action: "run" }\`. Không bắt buộc, có thể bỏ qua.
1. **Dự đoán (Predict)**: \`orion_predict { lab: "path/to/lab", prediction: "Dự đoán 2/3 pass, test_max_steps chưa kịp xử lý" }\`
2. **Chạy kiểm thử (Run)**: \`orion_run { lab: "path/to/lab" }\`. Xem số lượng pass/fail và gợi ý Level 1. Ở 3 lần đầu thất bại, báo cáo nhắc bậc khởi động chưa xong tiếp theo (nếu có).
3. **Nâng cấp gợi ý (Hint)**: Nếu cần, gọi \`orion_hint { lab: "path/to/lab", check: "test_unknown_tool" }\` để nhận gợi ý Level 2, 3, hoặc 4. Check có \`trace\` sẽ kèm dòng \`Dò code với Mira: mira_record { lab, call }\` từ Level 3.
4. **Sửa bài và lặp lại**: Sửa tệp bài làm và lặp lại bước 1 và 2 cho đến khi đạt 100%.
5. **Xuất lỗi ôn tập (Export)**: Dùng \`orion_export { lab: "path/to/lab" }\` để lấy JSON nạp vào Sổ lỗi Polaris (\`polaris_errorlog_add\`) và Thẻ nhớ Vega (\`vega_add\`).
6. **Một hàng đợi ôn tập duy nhất (Vega inbox)**: \`orion_export { lab: "path/to/lab", to_vega: true }\` (CLI: \`orion export <lab> --to-vega [--hub <path>]\`) ghi thêm các thẻ ứng viên vào một tệp mới \`<hub>/.vega/inbox/orion-<YYYYMMDDTHHmmss>-<6 hex>.jsonl\` theo hợp đồng \`vega-card-inbox.v1\`: producer \`orion\`, key \`orion:<tên thư mục lab>:<check>\`, origin \`orion-attempt\` (path = thư mục lab, locator = check). Hub lấy theo thứ tự: tham số \`hub\`, biến môi trường \`ORION_HUB\`, \`POLARIS_HUB\`, rồi \`D:/02_Learning_Knowledge\`. Chỉ các lỗi khớp một check khai báo trong \`lab.json\` mới thành thẻ (cần concept và gợi ý để làm thẻ trung thực); lỗi nhập module ở lần chạy đầu, timeout và test phụ được liệt kê là "bỏ qua" chứ không bị lặng lẽ nuốt. Mỗi dòng được kiểm tra theo hợp đồng trước khi ghi; thư mục hub phải tồn tại; ghi nguyên tử (\`.tmp\` rồi đổi tên), không bao giờ ghi đè hay nối vào tệp inbox có sẵn. Tên tệp dùng giờ UTC. Orion không động vào \`cards.json\` hay \`reviews.jsonl\` của Vega; Vega tự kiểm tra, loại trùng theo key và lập lịch FSRS khi \`vega_sync\`.`,

  runners: `# Cấu hình Trình kiểm thử (Test Runners)

Orion hỗ trợ 3 trình kiểm thử cục bộ:

### 1. Pytest (\`language: "python"\`, \`runner: "pytest"\`)
- Thực thi: \`py -3.11 -m pytest\` trên Windows khi có sẵn, hoặc \`python -m pytest\` / \`python3 -m pytest\`.
- Tuỳ biến qua biến môi trường: \`$env:ORION_PYTHON = "path/to/python.exe"\`.
- Cờ bắt buộc:
  - \`-q -p no:cacheprovider\`
  - \`--junitxml=<temp-xml-outside-lab>\` (kết quả kiểm thử được bóc tách chính xác từ JUnit XML ngoài thư mục lab).
- Biến môi trường khi chạy:
  - \`PYTHONIOENCODING=utf-8\`
  - \`PYTHONDONTWRITEBYTECODE=1\` (ngăn sinh thư mục \`__pycache__\` vi hạt trên ổ đĩa exFAT).

### 2. Node Test (\`language: "node"\`, \`runner: "node"\`)
- Thực thi: \`node --test --test-reporter=tap\`.
- Bóc tách kết quả từ luồng TAP (Test Anything Protocol v13).

### 3. Command runner (\`runner: "command"\`)
- Thực thi lệnh tuỳ chỉnh khai báo trong \`tests.command\`.
- Đánh giá: Mã thoát (exit code 0 = pass) + trích xuất 40 dòng cuối cùng của đầu ra.

### Test của bậc khởi động
\`orion_stage { action: "run" }\` dùng đúng các trình chạy trên (cùng đường chạy mã với \`orion_run\`) với cấu hình \`tests\` của bậc. Với \`pytest\` và \`node\`, \`tests.path\` của bậc là bắt buộc để không gom nhầm test của bài chính.

### Quản lý Timeout an toàn
- Mặc định: 120 giây (tuỳ chỉnh qua \`tests.timeoutSec\`).
- Khi vượt quá thời gian, trên Windows toàn bộ cây tiến trình con được diệt triệt để bằng \`taskkill /PID <pid> /T /F\`.`,
};

export function getGuideTopic(topic?: string): string {
  if (!topic || !topic.trim()) {
    return `# Hướng dẫn sử dụng Orion MCP (Orion Guide)

Chọn một chủ đề để xem chi tiết:
- \`overview\`: Triết lý Orion, các nguyên tắc cốt lõi, hệ sinh thái học tập.
- \`ladder\`: Thang hỗ trợ 5 bậc từ AGENTS.md, quy tắc từ chối Level 5, và Bậc khởi động (PRIMM) trước bài chính.
- \`format\`: Định dạng tệp \`lab.json\` (kể cả \`warmup\` và \`trace\`), README.md, thư mục bài lab.
- \`hints\`: Cách soạn gợi ý bậc thang hiệu quả (Level 1..4) và liên kết Mira qua \`trace\`.
- \`workflows\`: Quy trình thực hành khởi động -> predict -> run -> hint -> export (kèm Vega inbox).
- \`runners\`: Cấu hình pytest, node test, command, và cơ chế diệt timeout.

*Ví dụ CLI:* \`node dist/orion.mjs guide ladder\`
*Ví dụ MCP:* \`orion_guide { topic: "ladder" }\``;
  }

  const t = topic.trim().toLowerCase() as GuideTopic;
  const doc = GUIDE_DOCS[t];
  if (doc) return doc;

  return `Chủ đề '${topic}' không tồn tại. Các chủ đề khả dụng: ${GUIDE_TOPICS.join(", ")}`;
}
