[English](README.md) | Tiếng Việt

<p align="center"><img src="docs/banner.jpg" alt="Orion MCP — chòm sao Lạp Hộ và Tinh vân Lạp Hộ rực sáng" width="100%"></p>

# Orion MCP

*Được đặt tên theo chàng thợ săn: thực hành chính là săn tìm lỗi của chính mình.*

Orion là công cụ phòng thực hành (practice lab) trong hệ sinh thái học tập của người học: các bài tập thực hành được kiểm thử thực tế (pytest, node --test, hoặc lệnh tự định nghĩa), thang khởi động (PRIMM) tùy chọn trước bài chính, hệ thống gợi ý theo thang bậc thang (tutoring ladder) không bao giờ tiết lộ lời giải, cơ chế dự đoán trước khi chạy (predict-then-run), lưu vết lịch sử làm bài, liên kết từ gợi ý phản ví dụ sang vết chạy từng dòng của Mira, và xuất dữ liệu sang Sổ lỗi Polaris cùng Thẻ ghi nhớ Vega (kể cả hộp thư đến của Vega, để chỉ còn một hàng đợi ôn tập).

Được đặt tên theo chàng thợ săn chòm sao Lạp Hộ (Orion): thực hành chính là săn tìm lỗi của chính mình.

**Phiên bản 0.2.0** bổ sung thang khởi động (`orion_stage`), liên kết Mira (`trace`) và xuất thẻ vào hộp thư đến của Vega (`orion_export ... to_vega`).

---

## Hệ sinh thái

Toàn bộ dự án phát triển bởi DuongNAD:

| Dự án | Vai trò | Kho lưu trữ (Repository) |
| :--- | :--- | :--- |
| **Polaris** | Kiến trúc sư lộ trình & giáo trình học | [polaris-mcp](https://github.com/DuongNAD/polaris-mcp) |
| **Aurora Slides** | Động cơ bài giảng, sổ tay & trắc nghiệm | [aurora-slides-mcp](https://github.com/DuongNAD/aurora-slides-mcp) |
| **SmartDrive-OS** | Quản trị SSD & tìm kiếm tài liệu học | [smart-drive-os](https://github.com/DuongNAD/smart-drive-os) |
| **Constellation** | Đăng ký & kiểm chuẩn hợp đồng MCP | [constellation-mcp](https://github.com/DuongNAD/constellation-mcp) |
| **Vega** | Động cơ ghi nhớ giãn cách tương thích (FSRS) | [vega-mcp](https://github.com/DuongNAD/vega-mcp) |
| **Orion** | Phòng thực hành, kiểm thử thực tế & thang gợi ý | [orion-mcp](https://github.com/DuongNAD/orion-mcp) |

---

## Vì sao cần Orion?

Phương pháp học tập của người học là lý thuyết -> neo nhớ -> trang vở -> thực hành -> hồi tưởng, và các lộ trình học luôn định nghĩa bài thực hành kèm Tiêu chuẩn hoàn thành (Definition of Done - DoD).

Trước đây, chưa có công cụ nào chạy các kiểm thử này trực tiếp tại máy cục bộ, đưa ra gợi ý nâng bậc mà không lộ đáp án, hoặc lưu giữ lịch sử các lần chạy. Orion hiện thực hóa thang hỗ trợ người học theo quy tắc `D:/02_Learning_Knowledge/AGENTS.md` thành một máy chủ MCP và CLI độc lập.

---

## 5 Nguyên tắc cốt lõi

1. **Không bao giờ đưa lời giải**: Các bài lab cung cấp bài kiểm thử, README tiếng Việt, và tệp khởi đầu chỉ chứa docstrings cùng `# TODO` hoặc `raise NotImplementedError`. Gợi ý leo bậc từng cấp một; Level 5 (toàn bộ mã giải) không bao giờ được tạo ra bởi Orion (chỉ do agent quyết định khi người học yêu cầu tường minh).
2. **Kiểm thử thực tế**: Chạy cục bộ bằng công cụ thật của người học (`pytest` cho Python, `node --test` cho JavaScript/TypeScript, hoặc lệnh khai báo trong `lab.json`), giới hạn thời gian (time-box), phân tích kết quả từ định dạng chuẩn (JUnit XML / TAP).
3. **Dự đoán trước (Predict first)**: Lệnh `orion_predict` lưu lại dự đoán của người học trước khi chạy; `orion_run` báo cáo điểm lệch (gap) giữa dự đoán và thực tế để củng cố mental model.
4. **Ít tệp, thuần cục bộ**: Mỗi lab gồm một tệp `lab.json` (định nghĩa), một tệp `orion-attempts.jsonl` (lịch sử nối thêm) và các tệp bậc, tệp test được nêu trong `lab.json`; không gửi dữ liệu ra ngoài, trừ một tệp mới trong hộp thư đến Vega khi được yêu cầu; không quét đệ quy ổ đĩa D:; không tạo `node_modules` trên ổ đĩa D: (định dạng exFAT).
5. **Kỷ luật công cụ (Toolchain discipline)**: Viết bằng TypeScript, đóng gói thành tệp duy nhất `dist/orion.mjs` qua esbuild, sử dụng toolchain ngoài qua biến `ORION_TOOLCHAIN`.
6. **Khởi động trước khi làm (PRIMM)**: một lab có thể có 0-4 bậc khởi động xây trên một bài **đẳng cấu** (isomorphic), không bao giờ là lời giải của chính bài lab; bài chính là bậc "làm" cuối cùng; thang khởi động không bao giờ chặn người học.
7. **Một hàng đợi ôn tập**: thẻ ứng viên được đưa vào hộp thư đến của Vega (`orion_export ... to_vega`); chỉ Vega lập lịch ôn tập.

---

## Thang hỗ trợ 5 bậc (Tutoring Ladder)

Orion tuân thủ nghiêm ngặt thang hỗ trợ từ `AGENTS.md`:

| Cấp độ | Tên gọi | Mục đích | Hành vi của Orion |
|---|---|---|---|
| **Level 1** | Triệu chứng (Symptom) | Chỉ ra dòng lỗi hoặc trạng thái sai, không gợi ý cách sửa | Tự động trả về trong `orion_run` cho các test thất bại |
| **Level 2** | Câu hỏi định hướng | Ranh giới, bất biến (invariants), luồng dữ liệu | Nhận qua lệnh `orion_hint` |
| **Level 3** | Phản ví dụ tối thiểu | Phản ví dụ nhỏ nhất khi đã rõ nguyên nhân | Nhận qua lệnh `orion_hint` khi tiếp tục gặp khó khăn; check có `trace` được kèm liên kết Mira |
| **Level 4** | Mã giả / Chữ ký API | Chữ ký hàm, kiểu dữ liệu khi chỉ thiếu cú pháp | Cấp độ cao nhất mà Orion hỗ trợ |
| **Level 5** | Mã hoàn chỉnh (Full code) | Toàn bộ mã giải bài toán kèm giải thích bất biến | **Luôn từ chối bởi Orion** |

### Liên kết Mira cho phản ví dụ

Một check có thể khai báo `trace`: một biểu thức gọi hàm Python trên một dòng, tái hiện phản ví dụ tối thiểu. Khi `orion_hint` trả về Level 3 hoặc 4 cho check này, phần cuối kết quả có dòng chuyển sang Mira, MCP anh em ghi lại vết chạy thật từng dòng của chính tệp bài làm của người học:

```
Dò code với Mira: mira_record { lab: "<thư mục lab>", call: "<trace>" }
```

Level 1 và 2, cũng như check không có `trace`, không có dòng này.

---

## Bậc khởi động (PRIMM)

Trước bài chính, một lab có thể khai báo `warmup`: 0-4 bậc đi từ nhiều hỗ trợ đến ít hỗ trợ. Bài chính (tệp `entry` và `tests`) là bậc **làm** (make) cuối cùng. Thang này tùy chọn: `orion_run` chỉ nhắc bậc chưa xong tiếp theo khi bài chính thất bại ở lần chạy 1-3.

**Bằng chứng** (ngắn):
- Người mới được lợi từ hỗ trợ cao và bị thiệt khi chỉ nhận gợi ý để tự giải bài (phân tích tổng hợp về hiệu ứng đảo ngược chuyên môn; Tetzlaff và cộng sự, 2025, [doi:10.1016/j.learninstruc.2025.102142](https://doi.org/10.1016/j.learninstruc.2025.102142)).
- Ví dụ mẫu rồi giảm dần các bước đã làm sẵn cho kết quả chuyển giao gần và xa (Atkinson, Renkl và Merrill, 2003, [doi:10.1037/0022-0663.95.4.774](https://doi.org/10.1037/0022-0663.95.4.774)).
- Bài Parsons làm nhanh hơn mà việc học tương đương (Ericson, Margulieux và Rick, 2017, [doi:10.1145/3141880.3141895](https://doi.org/10.1145/3141880.3141895)).
- PRIMM = Predict, Run, Investigate, Modify, Make (Sentance, Waite và Kallia, 2019, [doi:10.1080/08993408.2019.1608781](https://doi.org/10.1080/08993408.2019.1608781)).

| Loại bậc (`kind`) | PRIMM | Người học làm gì | `tests` |
|---|---|---|---|
| `example` | Predict, Run, Investigate | Đọc ví dụ mẫu, dự đoán, chạy thử (trình phát Mira `player` nếu có), rồi `orion_stage ... "done"` | tùy chọn |
| `complete` | Modify (giảm dần các bước làm sẵn) | Điền các chỗ trống TODO của một lời giải đẳng cấu | bắt buộc |
| `parsons` | Modify (giảm dần các bước làm sẵn) | Sắp xếp lại các dòng bị xáo trộn | bắt buộc |
| `modify` | Modify | Sửa một chương trình đẳng cấu đang chạy đúng để thỏa yêu cầu mới | bắt buộc |
| Bài chính | Make | Viết tệp `entry` đến khi `orion_run` đạt | `tests` |

Mỗi bậc: `{ id, kind, title, file, tests?, player?, note? }`, trong đó `tests` là `{ runner, path?, command?, timeoutSec? }`.

**Quy tắc: đẳng cấu, không bao giờ là lời giải của chính bài lab.** Tài liệu khởi động có cùng cấu trúc lời giải với bài chính nhưng khác bề mặt bài toán (với lab vòng lặp agent: một máy tính REPL nhỏ có ngân sách bước). Orion không tự viết mã: `orion_new_lab` chỉ ghi tệp bậc từ nội dung có trong spec (`warmupFiles`, chỉ dùng khi scaffold, không lưu vào `lab.json`) hoặc khung TODO chỉ có chú thích, với test mặc định chủ ý thất bại. Những gì được kiểm tra tự động: bậc không dùng lại tệp `entry` hay đường dẫn test của bài chính, test của bậc có đường dẫn riêng (khi đó bài chính phải khai báo `tests.path`), `id` duy nhất, đường dẫn nằm trong thư mục lab, và nội dung `warmupFiles` không được import tệp `entry`.

```json
{
  "entry": "my_react.py",
  "tests": { "runner": "pytest", "path": "tests/test_react.py" },
  "warmup": [
    { "id": "w1", "kind": "example", "title": "Ví dụ mẫu: máy tính REPL có ngân sách bước", "file": "warmup/w1_calc_repl_example.py" },
    { "id": "w2", "kind": "complete", "title": "Điền chỗ trống: vòng lặp REPL", "file": "warmup/w2_calc_repl_complete.py",
      "tests": { "runner": "pytest", "path": "warmup/test_w2_calc_repl.py" } }
  ]
}
```

`orion_stage { lab, stage, action }`: `run` chạy test của bậc bằng cùng trình chạy (dòng lịch sử có trường `stage`, đánh số theo từng bậc, không tính vào bài chính), `done` đánh dấu bậc `example` là đã xem, `status` xem trạng thái từng bậc (bỏ `stage` để xem cả thang). `orion_status` hiển thị thang (Khởi động -> Làm chính).

---

## Cấu trúc bài thực hành (`lab.json`)

```json
{
  "title": "Vòng lặp ReAct Agent",
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
    "Vòng lặp ngắt chính xác khi chạm max_steps",
    "Trả về observation lỗi khi gặp unknown tool",
    "Dừng ngay khi gặp Final Answer"
  ],
  "checks": {
    "test_max_steps": {
      "concept": "loop-termination",
      "trace": "run_agent('q', max_steps=3)",
      "hints": [
        "Vòng lặp không dừng khi số bước vượt quá max_steps.",
        "Điều kiện dừng (loop invariant) của vòng lặp while là gì?",
        "counter = 0; while counter < max_steps: counter += 1",
        "def check_limit(steps: int, max_steps: int) -> bool: ..."
      ]
    }
  }
}
```

Tùy chọn: `warmup` (xem Bậc khởi động) và `checks.<tên>.trace` (xem Liên kết Mira). `orion_new_lab` còn nhận văn bản chỉ dùng khi scaffold, được ghi ra tệp và không bao giờ lưu vào `lab.json`: `readme`, `testsContent` (tệp test chính), `warmupFiles` (`{ "<đường dẫn tương đối>": "<nội dung>" }` cho tệp bậc và test của bậc).

Thư mục một bài lab:
```
my_lab/
├── lab.json                 # Định nghĩa bài lab
├── README.md                # Hướng dẫn tiếng Việt (Mục tiêu, Yêu cầu, DoD)
├── tests/                   # Thư mục chứa các bài kiểm thử
│   └── test_react.py
├── warmup/                  # Tùy chọn: các bậc khởi động (tài liệu đẳng cấu và test của chúng)
├── my_react.py              # Tệp làm bài (chỉ tạo khi chưa tồn tại)
└── orion-attempts.jsonl     # Lịch sử các lần chạy, gợi ý đã dùng, sự kiện của bậc
```

---

## Công cụ MCP & Lệnh CLI

| Công cụ MCP | Lệnh CLI | Chức năng |
|---|---|---|
| `orion_guide {topic?}` | `orion guide [topic]` | Đọc tài liệu thang gợi ý, bậc khởi động, định dạng, cách viết hint, workflows |
| `orion_new_lab {dir, spec}` | `orion new <dir> <spec>` | Khởi tạo thư mục lab (và tệp bậc khởi động); từ chối solution; không ghi đè tệp có sẵn |
| `orion_predict {lab, prediction}` | `orion predict <lab> <text>` | Lưu dự đoán của người học trước lần chạy kế tiếp |
| `orion_run {lab}` | `orion run <lab>` | Chạy test, tính điểm lệch, trả về báo cáo gọn kèm hint Level 1 (và bậc khởi động tiếp theo khi thất bại sớm) |
| `orion_hint {lab, check, level?}` | `orion hint <lab> <check> [l]` | Nhận gợi ý bậc tiếp theo (tối đa Level 4; từ chối Level 5); từ Level 3 kèm liên kết Mira nếu check có `trace` |
| `orion_stage {lab, stage?, action}` | `orion stage <lab> [stage] [run\|done\|status]` | Thang khởi động: chạy test của bậc, đánh dấu bậc ví dụ đã xem, hoặc xem trạng thái bậc |
| `orion_status {lab}` | `orion status <lab>` | Xem số lần chạy, thời gian, gợi ý đã dùng, thang (Khởi động -> Làm chính), trạng thái DoD |
| `orion_stats {root?}` | `orion stats [root]` | Xem tỉ lệ first-pass, tổng số lần chạy, lỗi hay gặp toàn hệ thống |
| `orion_export {lab, to_vega?, hub?}` | `orion export <lab> [--to-vega] [--hub <path>]` | Xuất lỗi sang Sổ lỗi Polaris và Thẻ ghi nhớ Vega; `to_vega` còn ghi tệp hộp thư đến của Vega |

---

## Hộp thư đến của Vega

Một hàng đợi ôn tập thích ứng duy nhất: Orion không bao giờ ghi `cards.json` hay `reviews.jsonl` của Vega. `orion_export { lab, to_vega: true }` (CLI `orion export <lab> --to-vega [--hub <path>]`) ghi các thẻ ứng viên thành **một tệp mới** `<hub>/.vega/inbox/orion-<YYYYMMDDTHHmmss>-<6 hex>.jsonl` (giờ UTC), theo hợp đồng `vega-card-inbox.v1`:

- mỗi dòng một đối tượng JSON: `v: 1`, `t`, `producer: "orion"`, `key: "orion:<tên thư mục lab>:<check>"`, `subject`, `deck`, `kind: "basic"`, `front`, `back`, `hint`, `origin: { kind: "orion-attempt", path: <thư mục lab>, locator: <check> }`, `tags`, `reason`;
- mỗi dòng được kiểm tra theo hợp đồng trước khi ghi (trường lạ, tiền tố key, ngày giờ, giới hạn độ dài, không emoji); văn bản dài được cắt theo giới hạn, key không bao giờ bị sửa;
- ghi nguyên tử (`<tên>.jsonl.tmp` rồi đổi tên); không bao giờ nối vào hay ghi đè tệp inbox có sẵn; Vega loại trùng theo `key` khi `vega_sync`;
- hub lấy theo thứ tự: tham số `hub`, biến `ORION_HUB`, biến `POLARIS_HUB`, rồi `D:/02_Learning_Knowledge`; thư mục hub phải đã tồn tại;
- chỉ các lỗi khớp một check khai báo trong `lab.json` mới thành thẻ (thẻ cần concept và gợi ý của check). Lỗi nhập module ở lần chạy đầu, timeout và test phụ được liệt kê là bỏ qua; payload JSON `vegaCards` vẫn liệt kê mọi ứng viên.

---

## Biến môi trường

| Biến | Công dụng |
|---|---|
| `ORION_TOOLCHAIN` | Thư mục toolchain để build và test (dự phòng: `VEGA_TOOLCHAIN`, `POLARIS_TOOLCHAIN`, rồi toolchain Aurora) |
| `ORION_PYTHON` | Lệnh Python chạy pytest (mặc định `py -3.11` trên Windows, `python3` ở nơi khác) |
| `ORION_HUB`, `POLARIS_HUB` | Thư mục gốc hub cho hộp thư đến Vega (sau tham số `hub`; mặc định `D:/02_Learning_Knowledge`) |

---

## Quản lý Trình chạy & An toàn

- **Pytest**: Chạy bằng `py -3.11 -m pytest` trên Windows (tuỳ chỉnh qua `ORION_PYTHON`), kèm cờ `-q -p no:cacheprovider --junitxml=<tệp-tạm-ngoài-lab>`, `PYTHONIOENCODING=utf-8`, và `PYTHONDONTWRITEBYTECODE=1` (ngăn sinh thư mục rác `__pycache__` trên exFAT).
- **Node Test**: Chạy bằng `node --test --test-reporter=tap` kèm bóc tách chuẩn TAP v13.
- **Command**: Chạy lệnh tuỳ biến, đánh giá mã thoát và 40 dòng cuối của đầu ra.
- **Diệt tiến trình quá hạn (Timeout)**: Mặc định 120s; diệt triệt để toàn bộ cây tiến trình con trên Windows bằng `taskkill /PID <pid> /T /F`.

---

## Xây dựng & Kiểm thử

```powershell
$env:ORION_TOOLCHAIN = "C:\Users\Admin\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Local\aurora-slides\toolchain"
node scripts/build.mjs --check
node scripts/e2e.mjs
```

---

## Bản quyền

Giấy phép MIT (c) 2026 DuongNAD
