[English](README.md) | Tiếng Việt

# Orion MCP

Orion là công cụ phòng thực hành (practice lab) trong hệ sinh thái học tập của người học: các bài tập thực hành được kiểm thử thực tế (pytest, node --test, hoặc lệnh tự định nghĩa), hệ thống gợi ý theo thang bậc thang (tutoring ladder) không bao giờ tiết lộ lời giải, cơ chế dự đoán trước khi chạy (predict-then-run), lưu vết lịch sử làm bài, và xuất dữ liệu sang Sổ lỗi Polaris cùng Thẻ ghi nhớ Vega.

Được đặt tên theo chàng thợ săn chòm sao Lạp Hộ (Orion): thực hành chính là săn tìm lỗi của chính mình.

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
4. **Ít tệp, thuần cục bộ**: Mỗi lab chỉ gồm một tệp `lab.json` (định nghĩa) và một tệp `orion-attempts.jsonl` (lịch sử nối thêm); không gửi dữ liệu ra ngoài; không quét đệ quy ổ đĩa D:; không tạo `node_modules` trên ổ đĩa D: (định dạng exFAT).
5. **Kỷ luật công cụ (Toolchain discipline)**: Viết bằng TypeScript, đóng gói thành tệp duy nhất `dist/orion.mjs` qua esbuild, sử dụng toolchain ngoài qua biến `ORION_TOOLCHAIN`.

---

## Thang hỗ trợ 5 bậc (Tutoring Ladder)

Orion tuân thủ nghiêm ngặt thang hỗ trợ từ `AGENTS.md`:

| Cấp độ | Tên gọi | Mục đích | Hành vi của Orion |
|---|---|---|---|
| **Level 1** | Triệu chứng (Symptom) | Chỉ ra dòng lỗi hoặc trạng thái sai, không gợi ý cách sửa | Tự động trả về trong `orion_run` cho các test thất bại |
| **Level 2** | Câu hỏi định hướng | Ranh giới, bất biến (invariants), luồng dữ liệu | Nhận qua lệnh `orion_hint` |
| **Level 3** | Phản ví dụ tối thiểu | Phản ví dụ nhỏ nhất khi đã rõ nguyên nhân | Nhận qua lệnh `orion_hint` khi tiếp tục gặp khó khăn |
| **Level 4** | Mã giả / Chữ ký API | Chữ ký hàm, kiểu dữ liệu khi chỉ thiếu cú pháp | Cấp độ cao nhất mà Orion hỗ trợ |
| **Level 5** | Mã hoàn chỉnh (Full code) | Toàn bộ mã giải bài toán kèm giải thích bất biến | **Luôn từ chối bởi Orion** |

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

Thư mục một bài lab:
```
my_lab/
├── lab.json                 # Định nghĩa bài lab
├── README.md                # Hướng dẫn tiếng Việt (Mục tiêu, Yêu cầu, DoD)
├── tests/                   # Thư mục chứa các bài kiểm thử
│   └── test_react.py
├── my_react.py              # Tệp làm bài (chỉ tạo khi chưa tồn tại)
└── orion-attempts.jsonl     # Lịch sử các lần chạy và gợi ý đã dùng
```

---

## Công cụ MCP & Lệnh CLI

| Công cụ MCP | Lệnh CLI | Chức năng |
|---|---|---|
| `orion_guide {topic?}` | `orion guide [topic]` | Đọc tài liệu thang gợi ý, định dạng, cách viết hint, workflows |
| `orion_new_lab {dir, spec}` | `orion new <dir> <spec>` | Khởi tạo thư mục lab; từ chối solution; không ghi đè bài làm |
| `orion_predict {lab, prediction}` | `orion predict <lab> <text>` | Lưu dự đoán của người học trước khi chạy kiểm thử |
| `orion_run {lab}` | `orion run <lab>` | Chạy test, tính điểm lệch, trả về báo cáo gọn kèm hint Level 1 |
| `orion_hint {lab, check, level?}` | `orion hint <lab> <check> [l]` | Nhận gợi ý bậc tiếp theo (tối đa Level 4; từ chối Level 5) |
| `orion_status {lab}` | `orion status <lab>` | Xem số lần chạy, thời gian, gợi ý đã dùng, trạng thái DoD |
| `orion_stats {root?}` | `orion stats [root]` | Xem tỉ lệ first-pass, tổng số lần chạy, lỗi hay gặp toàn hệ thống |
| `orion_export {lab}` | `orion export <lab>` | Xuất lỗi sang Sổ lỗi Polaris và Thẻ ghi nhớ Vega |

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
