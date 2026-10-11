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
- **Polaris**: Course architect, roadmaps, facts, and spaced-review error log.
- **Aurora Slides**: Keynote-grade lessons, notebook pages, memory palaces, and interactive quizzes.
- **SmartDrive-OS**: SSD storage governance, indexing, and fast learning search.
- **Constellation**: MCP ecosystem registration, health checks, and contracts.
- **Vega**: Adaptive spaced repetition memory engine (FSRS).
- **Orion** (this server): Hands-on exercises checked by real tests, predict-then-run, tutoring ladder hints (never the solution), and attempt history.

## Core Principles
1. **Never the solution**: Orion never writes solution code. Starter files only contain docstrings, imports, and TODOs/NotImplementedError. Hints escalate from Level 1 to 4; Level 5 (full code) is never provided by Orion.
2. **Real checks**: Tests run locally using real runners (pytest for Python, node --test for Node, or declared commands), time-boxed, parsed from structured JUnit XML or TAP output.
3. **Predict first**: \`orion_predict\` records the mental model before execution; \`orion_run\` reports the gap between prediction and actual outcome.
4. **Local & clean**: Exactly one \`lab.json\` and one append-only \`orion-attempts.jsonl\` per lab. Never scans \`D:\` recursively.
5. **Toolchain discipline**: TypeScript, single esbuild bundle (\`dist/orion.mjs\`), zero runtime dependencies, external toolchain.`,

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
- Khi đã nhận Level 4, yêu cầu gợi ý tiếp theo sẽ bị từ chối kèm thông báo giải thích.`,

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

## Quy tắc an toàn (Safety Invariants)
- \`lab.json\` không bao giờ có trường \`solution\` hay \`solutions\`. Lệnh \`orion_new_lab\` sẽ từ chối scaffold nếu phát hiện từ khoá này.
- Khi scaffold, tệp bài làm (\`entry\`) nếu đã tồn tại thì tuyệt đối không bị ghi đè.`,

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
- **Level 4**: Chữ ký hoặc khung sườn mã giả, chỉ giải quyết cú pháp khi tư duy đã đúng.`,

  workflows: `# Quy trình thực hành chuẩn với Orion MCP (Workflow)

\`\`\`mermaid
flowchart TD
    A["1. Đọc README & Xác định mục tiêu DoD"] --> B["2. orion_predict { lab, prediction }"]
    B --> C["3. orion_run { lab }"]
    C --> D{"100% Tests Pass?"}
    D -- "Có (All Pass)" --> E["4. DoD Completed! orion_status"]
    E --> F["5. orion_export -> Polaris & Vega"]
    D -- "Không (Failed)" --> G["Đọc Level 1 Hint trong báo cáo"]
    G --> H{"Tự sửa được không?"}
    H -- "Có" --> I["Sửa code trong entry file"]
    I --> B
    H -- "Không (Bị kẹt)" --> K["orion_hint { lab, check } (Leo lên L2 -> L3 -> L4)"]
    K --> I
\`\`\`

## Các bước thao tác:
1. **Dự đoán (Predict)**: \`orion_predict { lab: "path/to/lab", prediction: "Dự đoán 2/3 pass, test_max_steps chưa kịp xử lý" }\`
2. **Chạy kiểm thử (Run)**: \`orion_run { lab: "path/to/lab" }\`. Xem số lượng pass/fail và gợi ý Level 1.
3. **Nâng cấp gợi ý (Hint)**: Nếu cần, gọi \`orion_hint { lab: "path/to/lab", check: "test_unknown_tool" }\` để nhận gợi ý Level 2, 3, hoặc 4.
4. **Sửa bài và lặp lại**: Sửa tệp bài làm và lặp lại bước 1 và 2 cho đến khi đạt 100%.
5. **Xuất lỗi ôn tập (Export)**: Dùng \`orion_export { lab: "path/to/lab" }\` để lấy JSON nạp vào Sổ lỗi Polaris (\`polaris_errorlog_add\`) và Thẻ nhớ Vega (\`vega_add\`).`,

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

### Quản lý Timeout an toàn
- Mặc định: 120 giây (tuỳ chỉnh qua \`tests.timeoutSec\`).
- Khi vượt quá thời gian, trên Windows toàn bộ cây tiến trình con được diệt triệt để bằng \`taskkill /PID <pid> /T /F\`.`,
};

export function getGuideTopic(topic?: string): string {
  if (!topic || !topic.trim()) {
    return `# Hướng dẫn sử dụng Orion MCP (Orion Guide)

Chọn một chủ đề để xem chi tiết:
- \`overview\`: Triết lý Orion, nguyên tắc 5 không, hệ sinh thái học tập.
- \`ladder\`: Thang hỗ trợ 5 bậc từ AGENTS.md và quy tắc từ chối Level 5.
- \`format\`: Định dạng tệp \`lab.json\`, README.md, thư mục bài lab.
- \`hints\`: Cách soạn gợi ý bậc thang hiệu quả (Level 1..4).
- \`workflows\`: Quy trình thực hành predict -> run -> hint -> export.
- \`runners\`: Cấu hình pytest, node test, command, và cơ chế diệt timeout.

*Ví dụ CLI:* \`node dist/orion.mjs guide ladder\`
*Ví dụ MCP:* \`orion_guide { topic: "ladder" }\``;
  }

  const t = topic.trim().toLowerCase() as GuideTopic;
  const doc = GUIDE_DOCS[t];
  if (doc) return doc;

  return `Chủ đề '${topic}' không tồn tại. Các chủ đề khả dụng: ${GUIDE_TOPICS.join(", ")}`;
}
