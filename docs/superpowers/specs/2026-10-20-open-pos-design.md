# Open POS — Tài liệu thiết kế (Design Document)

> **Phiên bản:** 0.3 · **Ngày:** 2026-10-20 · **Trạng thái:** Draft — chờ review lần 3
> **Thay đổi 0.2 → 0.3:** tách `M6` thành `M6a`/`M6b`/`M6c`; làm rõ **phân quyền theo branch** (chỉ `owner`/`admin` xem toàn hệ thống); thêm **guest user tạm thời** (tạo khi khách đặt món thành công); hạ mức Risk #16.
> **Thay đổi 0.1 → 0.2:** bổ sung **multi-branch** vào v1, thêm **VietQR** (R9), mặc định `requireWaiterApproval = BẬT`, không làm e-invoice ở v1.
> **Loại dự án:** Architectural (new project, greenfield)
> **Ước lượng:** ~16–19 tuần cho 1 developer full-time (±1–2 tuần; xem §9)

---

## 0. Tóm tắt (Executive Summary)

Open POS là phần mềm bán hàng (Point of Sale) chạy **local trên PC**, phục vụ nhà hàng, quán cafe, quán ăn (phở, cơm, bún...). Điểm khác biệt cốt lõi:

1. **Type Registry** — người dùng tự định nghĩa *data type* mới ngay trong app, không cần sửa code.
2. **Order engine** đa loại hình (dine-in, takeaway) với modifier/combo.
3. **Tách/gộp bàn linh hoạt** (split/merge theo món, chia đều, theo ghế).
4. **Database NoSQL chạy local** (PouchDB + PouchDB-server), offline-first.
5. **Staff mobile** (`/staff/...`, login PIN, giới hạn theo bàn được giao).
6. **QR order** cho khách tại bàn, có tùy chọn *require waiter approval* (**mặc định BẬT**).
7. **Multi-branch** — một hệ thống quản lý nhiều chi nhánh: mỗi chi nhánh một hub local riêng, dữ liệu tách theo `branchId`, tổng hợp lên cloud.
8. **VietQR** — hiển thị mã QR chuyển khoản ngay trên màn hình bill khi khách (hoặc nhân viên trên điện thoại) chọn phương thức thanh toán chuyển khoản.
9. **Phân quyền theo chi nhánh** — chỉ `owner`/`admin` được xem dữ liệu toàn hệ thống; mọi role khác chỉ thấy chi nhánh được phân; `guest` là **user tạm thời** sinh ra khi khách đặt món thành công, tự hết hiệu lực khi đóng phiên bàn.

Kiến trúc: **Vue 3 + TypeScript + Vite** trong **Tauri 2 (Rust shell)**, dữ liệu **PouchDB** (IndexedDB) trên mỗi máy, đồng bộ qua **PouchDB-server** (hub LAN), và **axum HTTP server** phục vụ web app cho điện thoại trong LAN.

> ⚠️ **Cảnh báo độ lớn dự án:** v1 bao gồm **4 miền nghiệp vụ lớn** (catalog, order/table, inventory, reporting), **cộng thêm một metadata engine** và **multi-branch**. Đây là dự án lớn cho một developer. Xem §9 để biết lộ trình và §10 để biết rủi ro.

---

## 1. Mục tiêu & Phạm vi

### 1.1 Mục tiêu

| # | Mục tiêu | Tiêu chí thành công |
|---|----------|---------------------|
| G1 | Bán hàng nhanh, ít thao tác, thân thiện màn hình cảm ứng | Tạo & thanh toán 1 bill ≤ 5 thao tác |
| G2 | Người dùng tự mở rộng mô hình dữ liệu | Tạo type mới + dùng ngay được, **không cần deploy lại** |
| G3 | Quản lý bàn linh hoạt | Split/merge/transfer không mất hoặc trùng món |
| G4 | Chạy độc lập, không cần internet | Offline 100%; mất mạng không mất order |
| G5 | Nhiều điểm chạm: cashier, staff mobile, khách QR, bếp KDS | Cùng một codebase, nhiều route/mode |
| G6 | Dữ liệu bền vững, có backup | Sync + backup/restore, không mất dữ liệu |

### 1.2 Trong phạm vi v1 (In scope)

- Dine-in + Takeaway (cốt lõi)
- Menu + tùy chỉnh: size/variant, topping/modifier group, combo
- Quản lý bàn: floor plan, session, split/merge/transfer
- Inventory: recipe/BOM, trừ kho tự động, kiểm kê, hao hụt
- Báo cáo doanh thu + ca làm việc (shift) + đối soát tiền mặt
- Staff mobile + PIN, QR order + waiter approval
- KDS realtime
- Sync LAN + sync cloud (offline-first)
- **Multi-branch** — một hệ thống quản lý nhiều chi nhánh; mỗi chi nhánh một hub local riêng, dữ liệu tách theo `branchId`, tổng hợp lên cloud
- **VietQR** — mã QR chuyển khoản hiển thị trên màn hình bill khi chọn phương thức thanh toán chuyển khoản
- In bill ra **PDF** (chừa interface cho ESC/POS)
- Song ngữ **vi + en**

### 1.3 Ngoài phạm vi v1 (Out of scope — backlog)

- Loyalty / tích điểm / membership
- Voucher & coupon engine nâng cao
- Đặt bàn trước (reservation), danh sách chờ
- Tích hợp kênh giao hàng (GrabFood, ShopeeFood)
- Self-order kiosk
- Multi-tenant (nhiều tenant độc lập chia sẻ hạ tầng) — **khác** multi-branch; multi-branch đã nằm trong v1
- Hoá đơn điện tử / tích hợp thuế — xác nhận **chưa cần** ở v1 (xem §11 #4)
- Tự động xác nhận thanh toán qua API/webhook ngân hàng — v1 chỉ **hiển thị VietQR + xác nhận thủ công**
- Màn hình phụ cho khách (customer display)
- Máy in nhiệt ESC/POS + ngăn kéo tiền (chỉ chừa interface)

### 1.4 Vai trò người dùng (Roles)

**Quy tắc phạm vi dữ liệu (branch scope) — nguyên tắc cốt lõi:**

- **`owner` / `admin` là role duy nhất xem được dữ liệu toàn hệ thống** (mọi chi nhánh), gồm báo cáo liên chi nhánh và quản lý branch.
- **Mọi role khác chỉ thấy dữ liệu của chi nhánh được phân** (`user.branchIds[]`) — đây là yêu cầu thiết kế, được enforce ở tầng server, không chỉ là quy ước vận hành.
- **`guest` chỉ thấy bàn/phiên/bill của chính mình** trong đúng chi nhánh đã sinh ra guest đó.

| Role | Mô tả | Điểm chạm | Phạm vi dữ liệu | Vòng đời |
|------|-------|-----------|-----------------|----------|
| `owner` / `admin` | Toàn quyền, cấu hình, type designer, báo cáo | Desktop | **Toàn hệ thống** | Thường trực |
| `manager` | Duyệt void/discount, xem báo cáo, quản lý ca | Desktop | Branch được phân | Thường trực |
| `cashier` | Order, thanh toán, in bill | Desktop | Branch được phân | Thường trực |
| `waiter` | Order tại bàn được giao, duyệt QR order | Staff mobile | Branch + chỉ bàn được giao trong ca | Thường trực |
| `kitchen` | Xem & xử lý ticket trên KDS | KDS | Branch được phân | Thường trực |
| `guest` | Xem menu, tự order tại bàn qua QR, xem bill của mình | Trình duyệt điện thoại | **1 bàn / 1 phiên trong 1 branch** | **Tạm thời — sinh ra khi đặt món thành công, hết hiệu lực khi đóng phiên** |

---

## 2. Yêu cầu cốt lõi (Core Requirements)

### R1 — Mở rộng data type vô hạn (Unlimited User-Defined Types)

Người dùng (admin) có thể tạo/sửa type **tại runtime**:

- **Field extension trên type có sẵn:** thêm field tuỳ chỉnh vào `Product`, `Order`, `Table`, `Customer` (ví dụ: "Độ cay", "Thời gian chế biến", "Dị ứng").
- **Entity type mới:** định nghĩa type hoàn toàn mới (ví dụ `Supplier`, `Ingredient`, `Voucher`) với field, list view, và form tự sinh.

**Kiểu dữ liệu (data types) hỗ trợ ở v1:** `text`, `textarea`, `number`, `decimal`, `money`, `boolean`, `date`, `datetime`, `select`, `multiselect`, `reference` (trỏ tới type khác), `image`, `color`, `formula` (field tính toán).

**Cơ chế:**
- **Type Registry** lưu định nghĩa type trong collection `meta_types`.
- **Dynamic form renderer** sinh UI từ định nghĩa type (Vue component + field-type registry).
- **Validation engine** + **formula interpreter** (AST interpreter an toàn, **không dùng `eval`**).
- **Schema versioning:** mỗi type có `version`; document lưu `schemaVersion`; migration lazy khi đọc + migration nền.
- **Reserved keys:** field tuỳ chỉnh không được bắt đầu bằng `_` hoặc trùng tên field hệ thống.

**Ràng buộc v1 (YAGNI):** entity type mới chỉ hỗ trợ **generic CRUD** (tên + field + list view). Không hỗ trợ custom workflow, custom permission, custom report cho type mới.

### R2 — Order cho nhiều loại hình kinh doanh

- **Loại đơn:** `dine_in`, `takeaway` (v1). Delivery để sau.
- **Vòng đời đơn:** `draft → placed → confirmed → preparing → ready → served → paid → closed`, nhánh `voided` / `refunded`.
- **Line item:** sản phẩm + variant (size) + modifier (topping, ít đá, ít đường) + note + giá tại thời điểm bán (**snapshot giá**, không tham chiếu động).
- **Modifier group:** có `min_select` / `max_select`, có thể bắt buộc, có thể ảnh hưởng giá.
- **Combo / set menu:** nhóm nhiều item con, có giá riêng.
- **Kênh order:** `pos`, `staff_mobile`, `qr_customer` — lưu trên từng đơn để truy vết & báo cáo.
- **Hold/Park:** tạm lưu bill, mở lại sau.
- **Quick keys:** món bán chạy / yêu thích để thao tác 1 chạm.

### R3 — Tách/gộp bàn linh hoạt

**Khái niệm:** *Table Session* (phiên bàn) là trung tâm — khách ngồi vào bàn → mở session. Một session có thể gắn nhiều bàn; một session có thể có nhiều bill.

**Split:**
- Theo món (chọn từng món vào từng bill)
- Chia đều (chia số tiền)
- Theo ghế / theo số khách

**Merge:**
- Gộp bàn (nhiều bàn vào 1 session) — *ghép bàn*
- Gộp bill (nhiều bill trong session thành 1)
- Chuyển bàn (transfer), chuyển món giữa bàn/session

**Bất biến (invariants) — kiểm bằng property test:**
- Tổng tiền các bill sau khi split = tổng tiền bill gốc (± 0).
- Không có món nào bị tính 2 lần hoặc mất.
- Làm tròn xác định (**largest remainder method**) → không thất lạc đồng nào.
- Merge rồi split lại phải khôi phục được phân bổ ban đầu.

### R4 — Database NoSQL chạy local PC

- **PouchDB** (IndexedDB) trên mỗi máy — nguồn dữ liệu cục bộ, hoạt động offline.
- **PouchDB-server** (sidecar, LevelDB) trên PC server — hub đồng bộ trong LAN.
- Không yêu cầu cài đặt service ngoài (đã đóng gói kèm app).
- **Cloud CouchDB** (tuỳ chọn) — backup & xem từ xa.
- Không dùng SQL. Không dùng MongoDB/SQLite.

### R5 — Staff mobile (`/staff/...`) với PIN login

- Route `/staff/*` phục vụ qua LAN, dùng trên điện thoại/tablet của nhân viên.
- **Login PIN** (4–6 số) → server verify bằng **Argon2id** (Rust), trả về session token ngắn hạn.
- **Giới hạn theo bàn được giao:** nhân viên chỉ thấy session/bàn thuộc `table_assignments` của mình trong ca hiện tại.
- Waiter có thể: order món, gửi bếp, chuyển bàn (nếu được phép), xem bill, yêu cầu thanh toán.
- Có lockout sau N lần sai PIN + audit log.

### R6 — QR order + "require waiter approval"

- Mỗi bàn có QR → `http://<lan-ip>:<port>/order?t=<QR_TOKEN>`.
- Khách xem menu, thêm món, gửi order.
- **Setting `requireWaiterApproval`** (theo branch / theo bàn) — **mặc định BẬT**:
  - `true` (mặc định): order ở trạng thái `pending_approval`, waiter nhận thông báo realtime → approve / sửa / từ chối.
  - `false`: order vào thẳng bếp — dùng cho quán tin khách hoặc muốn phục vụ nhanh hơn.
- QR token: **HMAC-signed**, chứa `branchId` + `tableId` + `expiresAt`, xoay theo session hoặc theo ngày.
- Khách chỉ thấy menu + bill của bàn mình. Không truy cập dữ liệu bàn khác.

**Vòng đời guest user (tạm thời):**

Khách **không** cần đăng ký tài khoản. Danh tính được sinh ra tự động khi order đầu tiên thành công:

| Bước | Việc xảy ra | Danh tính |
|------|-------------|-----------|
| 1. Quét QR | Mở `/order?t=<QR_TOKEN>` | **Ẩn danh** — chỉ có table token, chưa có user |
| 2. Xem menu | Đọc menu của branch | Ẩn danh |
| 3. Gửi order | Order được validate server-side và **ghi nhận thành công** | **→ Sinh `user` guest tạm thời** gắn `branchId` + `sessionId` + `tableId`, cấp token riêng cho khách |
| 4. Dùng tiếp | Xem bill, gọi thêm món, yêu cầu thanh toán | Guest token |
| 5. Đóng phiên bàn | Bill `paid`/`closed` → session đóng | Guest token **hết hiệu lực ngay** |
| 6. Lưu trữ | Bản ghi guest + order giữ lại để báo cáo/truy vết | Purge sau **30 ngày** (mặc định, cấu hình được) |

- Guest **không** đăng nhập bằng PIN/password; **không** có role nhân viên; chỉ có 3 quyền: đọc menu của branch, tạo order cho bàn của mình, đọc bill/phiên của mình.
- Guest **không** liệt kê được bàn khác, không đọc dữ liệu chi nhánh khác, không vào bất kỳ màn hình quản trị nào.
- Nếu order bị từ chối hoàn toàn và phiên không còn order nào → guest user hết hiệu lực cùng phiên đó. Purge định kỳ dọn các guest "mồ côi" (tạo nhưng chưa từng có order hợp lệ).

### R7 — Tính năng bổ sung (từ brainstorm)

**Must-have trong v1** (chi phí thấp, giá trị cao):

| # | Tính năng | Giá trị |
|---|-----------|---------|
| F1 | Floor plan editor (khu vực + bàn, kéo thả) | Nền tảng cho split/merge, nhận diện thị giác |
| F2 | Discount / surcharge / service charge | Bắt buộc cho vận hành thực tế |
| F3 | Split payment (nhiều hình thức cho 1 bill) | Rất phổ biến ở VN |
| F4 | Shift open/close + đối soát tiền mặt | Kiểm soát thất thoát |
| F5 | KDS ticket aging (timer, đổi màu theo thời gian) | Kiểm soát tốc độ bếp |
| F6 | Bump / recall ticket trên KDS | Xử lý sai sót |
| F7 | "86'd" — đánh dấu tạm hết món | Tránh nhận món không làm được |
| F8 | Item note nhanh (preset note) | Giảm thao tác gõ |
| F9 | Audit log (ai làm gì, lý do void) | Truy vết & chống gian lận |
| F10 | Backup/restore thủ công + tự động | An toàn dữ liệu |
| F11 | Waste tracking (huỷ hàng có lý do) | Chống thất thoát kho |
| F12 | Barcode/QR scanner cho thêm món nhanh | Tận dụng phần cứng đã chọn |
| F13 | Chỉ báo trạng thái sync (pending/error) | Minh bạch với người dùng |
| F14 | Tìm kiếm món nhanh (fuzzy search) | Tốc độ order |

**Backlog** (để sau v1): loyalty, voucher engine, reservation, delivery integration, kiosk, customer display, e-invoice, cổng thanh toán tự động (auto-confirm qua bank API), voice order.

### R8 — Multi-branch (nhiều chi nhánh)

Một hệ thống quản lý **nhiều chi nhánh** (cửa hàng) trên cùng một tài khoản:

- **Mỗi chi nhánh một hub local riêng** (PouchDB-server + axum) đặt tại chi nhánh đó — vẫn hoạt động đầy đủ khi mất mạng internet.
- Mọi document nghiệp vụ mang `branchId`; dữ liệu được **tách theo branch** ở mọi truy vấn, báo cáo và phân quyền.
- **Cloud CouchDB là tầng tổng hợp**: mỗi hub replicate filtered theo `branchId` → dữ liệu toàn hệ thống gom về một chỗ để xem báo cáo liên chi nhánh.
- **Phân quyền theo branch**: user được gán 1 hoặc nhiều branch (`branchIds[]`); `owner` xem được tất cả.
- **Catalog (menu, giá) dùng chung ở mức tập đoàn, có thể override theo branch** — xem §4.7.
- Số chứng từ mang tiền tố chi nhánh để không trùng: `{branchCode}-{terminalCode}-{YYYYMMDD}-{seq}`.
- Tồn kho **riêng theo từng chi nhánh** (không cộng gộp).

**Ràng buộc v1 (YAGNI):** không có điều chuyển kho liên chi nhánh, không có bảng giá theo vùng, không multi-currency. Mọi branch dùng cùng đơn vị tiền tệ.

### R9 — VietQR (thanh toán chuyển khoản)

Hiển thị **mã QR chuyển khoản** ngay trên màn hình bill khi thanh toán bằng chuyển khoản:

- **Hai điểm vào:**
  1. **Khách tự bấm thanh toán** trên điện thoại (QR order) → chọn "Chuyển khoản" → hiện mã VietQR của bill.
  2. **Nhân viên bấm thanh toán** trên điện thoại (staff mobile) → chọn "Chuyển khoản" → hiện mã VietQR để đưa khách quét.
- **Sinh mã theo chuẩn VietQR (EMVCo / NAPAS)**: `bank BIN + số tài khoản + số tiền + nội dung chuyển khoản`.
- **Nội dung chuyển khoản** = mã đối chiếu duy nhất, ví dụ `POS{branchCode}{billSeq}` — dùng để nhân viên đối soát.
- **Tài khoản nhận tiền cấu hình theo branch** — collection `bank_accounts` (§4.2).
- **Số tiền điền sẵn** = số tiền còn lại của bill (đúng cả khi khách đã thanh toán một phần).
- **Xác nhận thanh toán là thủ công ở v1**: khách chuyển xong, nhân viên bấm "Đã nhận tiền" → ghi `payments` với `method = bank_transfer` + `ref` = mã đối chiếu.
- **Không gọi API ngân hàng** ở v1 — không webhook, không auto-confirm (§1.3, §11 #5).
- Mã QR render **offline**: dựng chuỗi EMVCo rồi vẽ ảnh QR tại chỗ, không cần internet.

---

## 3. Kiến trúc hệ thống (Architecture)

### 3.1 Sơ đồ kiến trúc (Text diagram)

```
                            ┌──────────────────────────────────────────────────────────┐
                            │  SERVER PC  (hub LAN + POS terminal)                     │
                            │                                                          │
   ┌────────────────────────┴──────────────────────────────────────────────────────┐   │
   │  Tauri App (Rust)                                                             │   │
   │                                                                               │   │
   │   ┌───────────────────────┐   IPC (invoke)   ┌─────────────────────────────┐  │   │
   │   │  WebView (WebView2)   │ ◄──────────────► │  Rust Core                  │  │   │
   │   │  ─────────────────    │                  │  ─────────────────────────  │  │   │
   │   │  Vue 3 SPA            │                  │  axum HTTP server (:8080)   │  │   │
   │   │   ├ POS terminal mode │                  │   ├ REST /api/*             │  │   │
   │   │   ├ /order  (QR)      │                  │   ├ WS   /ws  (realtime)    │  │   │
   │   │   ├ /staff/*          │                  │   ├ static assets (SPA)     │  │   │
   │   │   └ /kds              │                  │  auth: Argon2id, HMAC token │  │   │
   │   │  PouchDB (IndexedDB)  │                  │  device: scanner, printer   │  │   │
   │   └───────────┬───────────┘                  └──────────────┬──────────────┘  │   │
   │               │                                             │                 │   │
   └───────────────┼─────────────────────────────────────────────┼─────────────────┘   │
                   │  replicate (HTTP/CouchDB API)                │  supervise          │
                   ▼                                              ▼                     │
        ┌─────────────────────┐                          ┌──────────────────────────┐   │
        │  PouchDB local      │                          │  PouchDB-server sidecar  │   │
        │  (IndexedDB)        │                          │  (LevelDB)   :5984       │   │
        └─────────────────────┘                          └────────────┬─────────────┘   │
                                                                      │                 │
                                                                      │ _changes feed   │
                                                                      ▼                 │
                                                          ┌───────────────────────┐     │
                                                          │  WS broadcast hub     │     │
                                                          └───────────────────────┘     │
                                                                                        │
   ═══════════════════════════════ Wi-Fi LAN ═══════════════════════════════════════════

   ┌───────────────────────┐   HTTP + WS        ┌───────────────────────┐
   │  Phone / Tablet       │ ◄─────────────────►│  axum :8080           │
   │  ├ /order?t=QR_TOKEN  │   (qua LAN)        │  (phục vụ SPA + API)  │
   │  ├ /staff/login       │                    └───────────────────────┘
   │  └ /kds               │
   └───────────────────────┘

   ┌───────────────────────┐   replicate        ┌───────────────────────┐
   │  Terminal PC #2       │ ◄─────────────────►│  PouchDB-server (hub) │
   │  Tauri + PouchDB      │   (CouchDB API)    └───────────┬───────────┘
   └───────────────────────┘                                │
                                                            │ filtered replication
                                                            ▼
                                                ┌───────────────────────┐
                                                │  Cloud CouchDB        │
                                                │  (backup / remote)    │
                                                └───────────────────────┘
```

**Multi-branch topology (R8):**

```
   ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
   │ BRANCH: Hà Nội   │   │ BRANCH: Đà Nẵng  │   │ BRANCH: Sài Gòn  │
   │ ───────────────  │   │ ───────────────  │   │ ───────────────  │
   │ Hub local        │   │ Hub local        │   │ Hub local        │
   │ (Tauri + axum    │   │ (Tauri + axum    │   │ (Tauri + axum    │
   │  + PouchDB-svr)  │   │  + PouchDB-svr)  │   │  + PouchDB-svr)  │
   │ ├ POS terminal   │   │ ├ POS terminal   │   │ ├ POS terminal   │
   │ ├ KDS            │   │ └ KDS            │   │ ├ KDS            │
   │ └ staff phones   │   │                  │   │ └ staff phones   │
   └────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘
            │      filtered replication theo branchId      │
            └───────────────────┬──────────────────────────┘
                                ▼
                     ┌──────────────────────┐
                     │  Cloud CouchDB       │
                     │ ──────────────────   │
                     │ · tổng hợp toàn hệ   │
                     │ · báo cáo liên       │
                     │   chi nhánh          │
                     │ · backup tập trung   │
                     └──────────────────────┘
```

- Mỗi branch là một **đơn vị vận hành độc lập** — mất internet vẫn bán hàng bình thường.
- Cloud chỉ là **tầng tổng hợp & backup**, không nằm trên đường đi của giao dịch.
- Thêm branch mới: cài app tại chi nhánh đó, đăng ký `branchId`; hub tự replicate dữ liệu dùng chung (catalog, users) và tách dữ liệu riêng (bill, kho).

### 3.2 Tech stack & lý do chọn

| Layer | Công nghệ | Lý do |
|-------|-----------|-------|
| UI | Vue 3 + TypeScript + Vite | Nhẹ, reactive tốt cho POS; hệ sinh thái quen thuộc |
| Desktop shell | Tauri 2 (Rust) | Nhẹ (~10MB), khởi động nhanh, truy cập được device & filesystem |
| Local DB | PouchDB (IndexedDB) | **Schemaless** → phù hợp với user-defined types; có sẵn replication |
| Sync hub | PouchDB-server (sidecar, LevelDB) | Tương thích CouchDB API; đóng gói kèm app, không cần cài ngoài |
| LAN server | axum (Rust) | Phục vụ SPA + REST + WebSocket; hiệu năng tốt, an toàn bộ nhớ |
| Cloud sync | Cloud CouchDB | Replication sẵn có; filtered replication theo `branchId` — gom dữ liệu multi-branch về một chỗ |
| State | Pinia | Chuẩn cho Vue 3 |
| Routing | Vue Router | Hỗ trợ route `/order`, `/staff`, `/kds` |
| i18n | vue-i18n | vi + en |
| VietQR | Bộ dựng payload EMVCo/NAPAS + QR renderer offline (tự viết) | Sinh mã & vẽ QR ngay trên thiết bị, không phụ thuộc API ngân hàng |
| Validation | Type Registry engine (tự viết) + Zod cho core | Field tuỳ chỉnh cần engine động; Zod cho schema hệ thống |
| Testing | Vitest, fast-check, Playwright, cargo test | Xem §8 |

**Vì sao PouchDB phù hợp với "data type vô hạn":** PouchDB không có schema cứng. Type mới = document mới với `type` khác. Không cần migration DDL, không cần rebuild index. Đây là lý do kiến trúc quan trọng nhất cho R1.

### 3.3 Ranh giới module — Frontend (Vue 3 + TS)

```
src/
├── app/                     Bootstrap, router, i18n, theme, error boundary
├── core/
│   ├── db/                  PouchDB instance factory, repositories, change feeds
│   ├── sync/                Sync orchestration, conflict queue, sync status
│   ├── auth/                Session, roles, permission checks
│   ├── branch/              Ngữ cảnh chi nhánh, scoping dữ liệu, chuyển chi nhánh
│   ├── qr/                  Dựng payload VietQR (EMVCo/NAPAS) + render QR offline
│   ├── types/               Type Registry read-model, field-type registry,
│   │                        validation engine, formula interpreter
│   ├── money/               Money type (integer đồng), rounding, formatting
│   └── events/              Domain event bus
├── domain/                  PURE TypeScript — không import Vue, không import PouchDB
│   ├── order/               Order lifecycle, cart math
│   ├── table/               Session, split/merge/transfer algorithms
│   ├── pricing/             Discount, surcharge, combo, service charge
│   └── inventory/           Recipe/BOM, stock math
├── platform/                Tauri invoke wrapper + web fallback (phát hiện Tauri vs browser)
├── features/
│   ├── pos-terminal/        Màn hình thu ngân
│   ├── floor-plan/          Sơ đồ bàn + editor kéo thả
│   ├── order-entry/         Cart, modifier, hold/park, split/merge UI
│   ├── kds/                 Kitchen Display (timer, bump/recall)
│   ├── qr-order/            Khách tự order
│   ├── qr-payment/          Màn hình & luồng thanh toán VietQR
│   ├── branches/            Quản lý & chuyển chi nhánh
│   ├── staff-mobile/        PIN login, bàn được giao, order nhanh
│   ├── catalog-admin/       CRUD menu/category/product/modifier/combo
│   ├── type-designer/       Trình tạo type & field tuỳ chỉnh
│   ├── inventory/           Kho, recipe, kiểm kê, hao hụt
│   ├── reports/             Doanh thu, ca, export
│   └── settings/            Cấu hình branch, feature flags, thiết bị
└── shared/                  UI components (dumb), composables, utils
```

**Nguyên tắc ranh giới:**

| Module | Trách nhiệm | Phụ thuộc |
|--------|-------------|-----------|
| `domain/*` | Logic nghiệp vụ thuần, dễ test | **Không phụ thuộc gì** (pure TS) |
| `core/*` | Hạ tầng (db, sync, auth, types) | `domain`, thư viện ngoài |
| `features/*` | UI theo nghiệp vụ | `core`, `shared` |
| `platform` | Cầu nối tới Rust | Tauri API |
| `shared` | Component không nghiệp vụ | — |

> **Quy tắc:** `domain/` **không được** import Vue hay PouchDB. Điều này giữ logic split/merge/pricing có thể test bằng Vitest thuần và property test.

### 3.4 Ranh giới module — Rust side (Tauri)

```
src-tauri/src/
├── main.rs                  Tauri builder, window setup, plugin registration
├── config/                  App dirs, settings persistence, LAN IP discovery
├── hub/                     Vòng đời PouchDB-server sidecar: spawn, port, health, restart
├── auth/                    Argon2id PIN hashing, HMAC token sign/verify, rate limiting
├── server/
│   ├── mod.rs               axum app assembly
│   ├── static_assets.rs     Phục vụ SPA build (nhúng bằng include_dir hoặc đọc từ disk)
│   ├── ws.rs                WebSocket hub — broadcast domain events
│   ├── middleware/          auth, rate limit, request logging, CORS
│   └── routes/
│       ├── order.rs         POST /api/order — QR order: validate token, approval flow, sinh guest user + cấp guest token
│       ├── staff_auth.rs    POST /api/staff/login — PIN → token
│       ├── menu.rs          GET  /api/menu — read-only cho QR
│       ├── kds.rs           GET/POST /api/kds/* — ticket state
│       ├── tables.rs        GET/POST /api/tables/* — assignment scoping
│       ├── payments.rs      POST /api/payments/* — ghi nhận thanh toán, xác nhận VietQR thủ công
│       ├── branches.rs      GET  /api/branches/* — danh sách chi nhánh, tài khoản nhận tiền
│       └── health.rs        GET /api/health
├── device/
│   ├── scanner.rs           ScannerAdapter — HID keyboard / serial
│   └── printer.rs           PrinterAdapter trait — PdfPrinter (v1), EscPosPrinter (reserved)
├── ipc/                     #[tauri::command] cho SPA → Rust (get LAN URL, print, scanner events)
└── storage/                 Truy cập CouchDB API của hub qua reqwest
```

**Điểm then chốt:** axum server là **API layer trên hub**, không tự lưu dữ liệu. Nó validate token, enforce rule (ví dụ: `requireWaiterApproval`, table scoping), rồi ghi vào PouchDB-server qua CouchDB API. Hub replication sẽ lan truyền dữ liệu tới mọi terminal.

### 3.5 Luồng dữ liệu (Data flow)

**A. Order từ QR của khách:**

```
Guest phone
  │  POST /api/order  (QR_TOKEN, items)
  ▼
axum (Rust)
  │  1. Verify HMAC token → branchId + tableId
  │  2. Resolve open session cho bàn
  │  3. Validate items (tồn tại, còn bán, giá)
  │  4. Nếu requireWaiterApproval → status = pending_approval
  │  5. Ghi order event + materialized bill vào hub
  ▼
PouchDB-server (hub)
  │  _changes feed
  ▼
Terminals (PouchDB local)  ──►  SPA reactive query  ──►  UI cập nhật
  │
  └──►  WS broadcast  ──►  KDS + Staff mobile
```

**B. Order từ POS terminal:**

```
Cashier SPA
  │  Ghi trực tiếp vào PouchDB local (offline-first)
  ▼
PouchDB local
  │  continuous replication
  ▼
PouchDB-server (hub)  ──►  _changes  ──►  WS  ──►  KDS / staff / other terminals
```

**C. Cloud backup:**

```
PouchDB-server (hub)
  │  filtered replication (theo branchId)
  ▼
Cloud CouchDB
```

### 3.6 Realtime & sync

- **WS hub** trong axum subscribe vào `_changes` feed của PouchDB-server → broadcast cho mọi client đang kết nối (KDS, staff mobile, terminal).
- **Terminal** dùng PouchDB continuous replication (offline-first, tự phục hồi sau mất mạng).
- **Phone** không dùng PouchDB — chỉ REST + WS (không cần cache phức tạp).
- **Fallback:** nếu WS mất, client refetch qua REST.

---

## 4. Mô hình dữ liệu (Data Model)

### 4.1 Type Registry (R1)

**Collection `meta_types`** — mỗi document là 1 type definition:

```jsonc
{
  "_id": "type:product",
  "kind": "builtin_ext",          // "builtin_ext" | "entity"
  "baseType": "product",          // null nếu là entity mới
  "name": { "vi": "Sản phẩm", "en": "Product" },
  "version": 3,
  "fields": [
    {
      "key": "spicy_level",       // không bắt đầu bằng "_"
      "label": { "vi": "Độ cay", "en": "Spicy level" },
      "dataType": "select",
      "required": false,
      "default": "none",
      "options": [
        { "value": "none",  "label": { "vi": "Không cay", "en": "None" } },
        { "value": "mild",  "label": { "vi": "Ít cay",   "en": "Mild" } }
      ],
      "indexed": true,            // admin chủ động bật index
      "ui": { "widget": "radio", "group": "basic" }
    }
  ],
  "listView": ["name", "price", "spicy_level"],
  "createdAt": "…", "updatedAt": "…"
}
```

**Field-type registry** (frontend + Rust đều biết): mỗi `dataType` ánh xạ tới
`{ validator, formatter, defaultWidget, widgetOptions, formulaSupport }`.

**Formula field** — ví dụ `"cost = price * 0.6"`:
- Parse thành AST, whitelist toán tử + hàm (`sum`, `avg`, `round`, `if`).
- Interpreter tự viết — **không `eval`**, không truy cập global scope.
- Tính lại khi dependency thay đổi; kết quả không lưu cứng vào document (tránh lệch dữ liệu).

**Schema migration:**
- Document lưu `schemaVersion`.
- **Lazy migration:** khi đọc document có `schemaVersion < type.version` → chạy transform chain → ghi lại.
- **Background migration:** job chạy nền cho toàn collection, có tiến độ.
- Transform được định nghĩa dạng khai báo (rename, add default, map value) — không phải code tuỳ ý trong v1.

### 4.2 Danh sách collections

Mỗi collection = 1 PouchDB database riêng (ánh xạ 1-1 với PouchDB-server).

| Collection | Nội dung | Sync tới terminal | Sync cloud |
|------------|----------|-------------------|------------|
| `branches` | Chi nhánh (multi-branch): mã, tên, địa chỉ, timezone | ✅ | ✅ |
| `meta_types` | Type Registry | ✅ | ✅ |
| `meta_settings` | Feature flags, cấu hình branch | ✅ | ✅ |
| `users` | Tài khoản nhân viên (PIN hash, role, `branchIds[]`) + **guest user tạm thời** (không PIN, có TTL) | ✅ | ✅ |
| `auth_sessions` | Phiên đăng nhập (staff + guest) | ✅ | ❌ |
| `table_assignments` | Waiter ↔ bàn theo ca | ✅ | ✅ |
| `areas` | Khu vực | ✅ | ✅ |
| `tables` | Bàn + layout | ✅ | ✅ |
| `catalog_categories` | Danh mục | ✅ | ✅ |
| `catalog_products` | Sản phẩm + variant + custom fields | ✅ | ✅ |
| `catalog_modifier_groups` | Nhóm topping/modifier | ✅ | ✅ |
| `catalog_combos` | Combo / set menu | ✅ | ✅ |
| `price_lists` | Bảng giá | ✅ | ✅ |
| `sessions` | Table session (dine-in) | ✅ | ✅ |
| `bills` | Bill + line items (materialized) | ✅ | ✅ |
| `order_events` | **Append-only** event log | ✅ | ✅ |
| `payments` | Thanh toán (append-only) | ✅ | ✅ |
| `bank_accounts` | Tài khoản nhận tiền theo branch — phục vụ sinh mã VietQR | ✅ | ✅ |
| `shifts` | Ca làm việc, đối soát | ✅ | ✅ |
| `inventory_items` | Tồn kho | ✅ | ✅ |
| `inventory_recipes` | Recipe / BOM | ✅ | ✅ |
| `inventory_movements` | **Append-only** xuất/nhập kho | ✅ | ✅ |
| `suppliers` / `purchase_orders` | Nhà cung cấp / nhập hàng (nhẹ) | ✅ | ✅ |
| `audit_log` | **Append-only** nhật ký thao tác | ✅ | ✅ |
| `devices` | Terminal / printer đã đăng ký | ✅ | ❌ |

### 4.3 Event sourcing cho order (quyết định kiến trúc then chốt)

**Vấn đề:** Trong môi trường offline-first nhiều terminal, hai máy có thể sửa cùng một bill → conflict khó giải quyết nếu chỉ lưu state.

**Giải pháp:** Order dùng **event sourcing**.

- `order_events` là **append-only**, mỗi event có `_id` duy nhất (UUID) → hai máy không bao giờ tạo cùng event id → **merge = union**, không conflict.
- `bills` là **materialized view** (state hiện tại), được dựng lại **deterministic** từ events.
- Nếu phát hiện lệch state → replay events để sửa.

**Event types:**
`SESSION_OPENED`, `SESSION_CLOSED`, `TABLE_JOINED`, `TABLE_TRANSFERRED`,
`LINE_ADDED`, `LINE_VOIDED`, `LINE_MOVED`, `LINE_QTY_CHANGED`,
`DISCOUNT_APPLIED`, `SURCHARGE_APPLIED`,
`BILL_SPLIT`, `BILL_MERGED`, `BILL_CLOSED`,
`PAYMENT_REQUESTED`, `PAYMENT_ADDED`, `PAYMENT_VOIDED`,
`ORDER_PENDING_APPROVAL`, `ORDER_APPROVED`, `ORDER_REJECTED`.

Mỗi event: `{ _id, type, billId, sessionId, actorId, deviceId, payload, createdAt, schemaVersion }`.

### 4.4 Table Session & Split/Merge

```jsonc
// sessions
{
  "_id": "session:<uuid>",
  "branchId": "branch:main",
  "tableIds": ["table:01", "table:02"],   // >1 khi ghép bàn
  "guestCount": 4,
  "seatMap": [ { "seat": 1, "label": "A" }, … ],  // optional, cho split theo ghế
  "status": "open",                        // open | closed | merged
  "openedAt": "…", "openedBy": "user:…",
  "mergedFrom": ["session:<uuid>"],        // truy vết
  "splitFrom": null,
  "billIds": ["bill:<uuid>", "bill:<uuid>"]
}
```

```jsonc
// bills
{
  "_id": "bill:<uuid>",
  "sessionId": "session:<uuid>",
  "channel": "qr_customer",               // pos | staff_mobile | qr_customer
  "status": "pending_approval",           // draft | pending_approval | placed | … | paid
  "lines": [
    {
      "lineId": "…",
      "productId": "product:…",
      "nameSnapshot": { "vi": "Phở bò", "en": "Beef noodle" },
      "unitPriceSnapshot": 65000,          // VND, integer
      "qty": 2,
      "variantId": "…",
      "modifiers": [ { "groupId": "…", "optionId": "…", "priceDelta": 5000 } ],
      "note": "ít hành",
      "seat": 1
    }
  ],
  "discounts": [ { "type": "percent", "value": 10, "reason": "…", "approvedBy": "…" } ],
  "surcharges": [ { "type": "service_charge", "value": 5 } ],
  "subtotal": 130000, "total": 130000,
  "createdAt": "…", "updatedAt": "…"
}
```

**Thuật toán split/merge** (trong `domain/table/`, pure TS):

| Thao tác | Mô tả | Ghi chú |
|----------|-------|---------|
| `splitByItems` | Chọn line → bill mới | Copy line, xoá khỏi bill gốc |
| `splitEvenly` | Chia `total` cho N | Largest remainder → tổng khớp tuyệt đối |
| `splitBySeat` | Gom theo `line.seat` | Yêu cầu `seatMap` |
| `mergeBills` | Nhiều bill → 1 | Cộng line, dedupe discount theo rule |
| `mergeSessions` | Nhiều session → 1 | Union `tableIds` |
| `transferTable` | Session → bàn khác | Giữ nguyên bill |
| `moveLines` | Chuyển line giữa bill | Dùng cho "khách đổi bàn" |

### 4.5 Inventory

- `inventory_items` — nguyên liệu, đơn vị, tồn hiện tại, định mức tối thiểu.
- `inventory_recipes` — BOM: `productId` → `[{ ingredientId, qty, unit }]`.
- `inventory_movements` — **append-only**: `purchase`, `sale_deduction`, `waste`, `adjust`, `stocktake`.
- **Tồn kho = materialized từ movements** (cùng triết lý event sourcing → tránh conflict).
- Trừ kho tự động khi bill chuyển sang `paid`.
- Kiểm kê (stocktake) tạo `adjust` movement với chênh lệch.

### 4.6 Shift & Payment

- `shifts` — `{ _id, userId, deviceId, openingCash, closingCash, countedCash, variance, openedAt, closedAt }`.
- Đối soát: `variance = countedCash − (openingCash + cashSales − cashRefunds)`.
- `payments` — append-only: `{ billId, method, amount, tendered, change, ref, createdAt }`.
- Methods v1: `cash`, `bank_transfer` (VietQR + xác nhận thủ công), `card`, `other`.

**Luồng VietQR (R9):**

```
[Khách bấm "Thanh toán" trên /order]   hoặc   [Nhân viên bấm "Thanh toán" trên /staff]
                     │
                     ▼
         Chọn phương thức: "Chuyển khoản"
                     │
                     ▼
  Sinh mã VietQR từ: bank BIN + số tài khoản + số tiền còn lại + nội dung "POS{branchCode}{billSeq}"
                     │
                     ▼
         Hiển thị QR full-screen trên thiết bị
                     │
         ┌───────────┴────────────┐
         ▼                        ▼
   Khách quét QR             Khách chuyển khoản
   bằng app ngân hàng        (số tiền đã điền sẵn)
         │                        │
         └───────────┬────────────┘
                     ▼
   Nhân viên kiểm tra tiền về → bấm "Đã nhận tiền"
                     │
                     ▼
   Ghi `payments` { method: "bank_transfer", amount, ref: "POS{branchCode}{billSeq}" }
                     │
                     ▼
               Bill → `paid` / `closed`
```

- QR sinh **offline**: dựng chuỗi EMVCo tại chỗ rồi vẽ ảnh QR, không cần internet, không gọi API.
- `ref` = mã đối chiếu, xuất hiện trong báo cáo để khớp với sao kê ngân hàng.
- Bill thanh toán một phần: QR hiển thị **số tiền còn lại**, không phải tổng bill.
- Không auto-confirm ở v1 — không webhook, không polling API ngân hàng (§1.3).
- **Khách bấm "Thanh toán" → sinh event `PAYMENT_REQUESTED`** → nhân viên nhận thông báo realtime trên POS/staff mobile, biết bàn nào đang chờ xác nhận tiền về. Tránh tình huống khách đã chuyển khoản mà nhân viên không biết (Risk #20).
- **Tài khoản nhận tiền lấy từ `bank_accounts` của branch đang hoạt động** — đổi chi nhánh là đổi tài khoản nhận tiền, không cần sửa code.

### 4.7 Catalog dùng chung & override theo branch (R8)

Với multi-branch, catalog chia 2 tầng:

| Tầng | Nội dung | Ai sửa |
|------|----------|--------|
| **Global catalog** | Category, product, modifier group, combo, đơn vị, thuế | `owner` |
| **Branch override** | Giá bán riêng, bật/tắt bán (86'd), thứ tự hiển thị | `manager` của branch đó |

```jsonc
// catalog_products (global) — định nghĩa món
{ "_id": "product:pho-bo", "branchId": null, "name": { "vi": "Phở bò" }, "basePrice": 65000 }

// product_branch_overrides — chỉ lưu phần khác biệt so với global
{
  "_id": "override:branch:hq|product:pho-bo",
  "branchId": "branch:hq",
  "productId": "product:pho-bo",
  "price": 69000,             // null = dùng giá global
  "available": true,          // false = 86'd ở riêng branch này
  "sortOrder": 12,
  "updatedAt": "…"
}
```

**Thứ tự resolve giá (cao → thấp):** `branch_override.price` → `price_list` đang áp cho branch → `product.basePrice` (global).

**Vì sao override thay vì copy món cho từng branch:** copy khiến mỗi lần sửa món phải sửa N nơi và dễ lệch dữ liệu; override chỉ lưu phần khác biệt nên sửa món gốc tự động áp cho mọi branch chưa override — đồng thời tránh conflict khi nhiều branch sửa cùng lúc.

---

## 5. Offline-first & Sync

### 5.1 Mô hình sync

| Thành phần | Cơ chế |
|------------|--------|
| Terminal ↔ hub | PouchDB continuous replication (2 chiều) |
| Phone ↔ axum server | REST + WS (không cache; không dùng PouchDB) |
| Hub ↔ cloud | Filtered replication theo `branchId` |
| Conflict detection | PouchDB revision tree + `_conflicts` |

### 5.2 Conflict resolution

| Loại dữ liệu | Chiến lược |
|--------------|-----------|
| `order_events`, `payments`, `audit_log`, `inventory_movements` | **Không conflict** — append-only, id duy nhất |
| `bills`, `sessions` | Rebuild từ events → deterministic |
| `catalog_*`, `tables`, `areas`, `meta_*` | **Last-write-wins** với tiebreak `(updatedAt, deviceId)` |
| `inventory_items` (tồn) | Materialized từ movements → không conflict |
| `users`, `auth_sessions` | LWW + cảnh báo admin |

**Conflict queue:** mọi conflict không tự giải quyết được → ghi vào hàng đợi → hiện badge cho admin xử lý thủ công (chọn bản giữ lại).

### 5.3 Order numbering khi offline (R8)

- Định dạng: `{branchCode}-{terminalCode}-{YYYYMMDD}-{seq}` — ví dụ `HQ-T01-20261020-0042`.
- `branchCode` chống trùng giữa các chi nhánh; `terminalCode` chống trùng giữa các thiết bị trong cùng branch → không trùng số kể cả khi offline hoàn toàn.
- `seq` là bộ đếm cục bộ trên từng thiết bị, reset theo ngày.
- **Phân biệt hai loại mã định danh:**

| Mã | Mục đích | Định dạng | Ghi chú |
|----|----------|-----------|---------|
| **Số bill** | Người dùng đọc, in trên bill | `HQ-T01-20261020-0042` | Có dấu gạch, dễ đọc |
| **`ref` thanh toán** | Nội dung chuyển khoản VietQR (R9) | `POS{HQ}{0042}` | **Không dấu, không ký tự đặc biệt** — an toàn cho app ngân hàng |

- Số hoá đơn chính thức (nếu cần về sau) cấp phát tại hub — v1 **không** làm e-invoice (open question #4 đã chốt: chưa cần).

### 5.4 Cloud sync & multi-branch aggregation (R8)

**Mô hình:** Cloud CouchDB là **tầng tổng hợp**, mỗi hub local là một **đơn vị vận hành độc lập**.

- **Hub → Cloud:** mỗi hub replicate **filtered theo `branchId`** lên Cloud CouchDB. Nhiều hub cùng ghi vào một cloud nhưng **không giẫm chân nhau** vì `_id` luôn mang tiền tố branch và dữ liệu giao dịch là append-only.
- **Cloud → Hub:** replicate **một chiều có chọn lọc** — chỉ dữ liệu dùng chung toàn hệ thống (`branches`, `catalog_*` global, `users`, `meta_types`). Dữ liệu giao dịch của chi nhánh khác **không** kéo về hub để tránh phình dữ liệu local.
- **Chống vòng lặp replication:** dùng `filter` + `_id` prefix theo branch để một hub không replicate ngược lại chính dữ liệu nó vừa đẩy lên.
- **Báo cáo liên chi nhánh** chạy trên cloud (hoặc trên hub với dữ liệu tổng hợp nếu có quyền `owner`).
- **Bảo mật trên cloud:** dùng CouchDB security document + filtered replication để branch A **không** đọc được dữ liệu branch B.
- **Có thể tắt hoàn toàn** (chế độ local-only, không cần cloud) — vẫn bán hàng bình thường.
- Không hai chiều cho dữ liệu nhạy cảm (`auth_sessions`, `devices`).

**Mã hoá `_id` theo branch (chống trùng & thuận lợi filter):**

| Loại doc | Định dạng `_id` | Ví dụ |
|----------|-----------------|-------|
| Doc thuộc branch | `{branchCode}:{entity}:{uuid}` | `hq:bill:9f3c…` |
| Doc dùng chung | `global:{entity}:{key}` | `global:product:pho-bo` |
| Doc cá nhân theo thiết bị | `{branchCode}:{deviceId}:{entity}:{uuid}` | `hq:T01:shift:…` |

> Với doc dùng chung, giá riêng của từng branch lưu ở `product_branch_overrides` (§4.7) — giữ catalog global sạch, tránh conflict giữa các branch.

---

## 6. Bảo mật (Security)

### 6.1 Roles & Permissions

**Nguyên tắc phạm vi dữ liệu — yêu cầu thiết kế bắt buộc:**

1. **Chỉ `owner`/`admin` xem được dữ liệu toàn hệ thống** (mọi chi nhánh): báo cáo liên chi nhánh, so sánh branch, quản lý branch.
2. **Mọi role khác bị giới hạn trong branch được phân** (`user.branchIds[]`). Không có màn hình nào cho phép xem lẫn dữ liệu giữa các chi nhánh.
3. **`guest` chỉ truy cập đúng 1 bàn / 1 phiên / 1 bill của mình** trong branch đã sinh ra guest đó.
4. **Enforce ở tầng server (axum), không ở client:** `branchId` lấy từ **token đã ký**, không bao giờ tin `branchId` do client gửi. Đây là điểm chống rò rỉ dữ liệu chính (Risk #16).

Ma trận quyền nhân viên:

| Hành động | owner | manager | cashier | waiter | kitchen | Phạm vi |
|-----------|:-----:|:-------:|:-------:|:------:|:-------:|---------|
| Tạo/sửa type | ✅ | ❌ | ❌ | ❌ | ❌ | Global |
| Quản lý chi nhánh (thêm/sửa branch) | ✅ | ❌ | ❌ | ❌ | ❌ | Global |
| **Xem dữ liệu toàn hệ thống** (mọi branch) | ✅ | ❌ | ❌ | ❌ | ❌ | **Toàn hệ thống** |
| Sửa menu (catalog global) | ✅ | ❌ | ❌ | ❌ | ❌ | Global |
| Override giá / 86'd món | ✅ | ✅ | ❌ | ❌ | ❌ | Branch của mình |
| Order | ✅ | ✅ | ✅ | ✅ | ❌ | Branch của mình |
| Void / refund | ✅ | ✅ | ❌ | ❌ | ❌ | Branch của mình |
| Discount | ✅ | ✅ | giới hạn % | ❌ | ❌ | Branch của mình |
| Duyệt QR order | ✅ | ✅ | ✅ | ✅ | ❌ | Branch của mình |
| Cấu hình VietQR / tài khoản nhận tiền | ✅ | ✅ | ❌ | ❌ | ❌ | Branch của mình |
| Xem báo cáo doanh thu | ✅ | ✅ | ❌ | ❌ | ❌ | Branch của mình |
| Mở/đóng ca | ✅ | ✅ | ✅ | ❌ | ❌ | Branch + thiết bị |

Quyền của **`guest`** (tách riêng vì không phải nhân viên):

| Hành động | guest |
|-----------|:-----:|
| Đọc menu của branch | ✅ |
| Tạo order cho bàn của mình | ✅ |
| Đọc bill / phiên / trạng thái order của mình | ✅ |
| Yêu cầu thanh toán, xem mã VietQR của bill mình | ✅ |
| Liệt kê bàn khác, đọc dữ liệu branch khác | ❌ |
| Bất kỳ màn hình quản trị nào (menu, kho, báo cáo, type) | ❌ |

**Quy tắc scoping chi tiết:**

- Mỗi user nhân viên có `branchIds: string[]`. `owner`/`admin` ngầm định có **tất cả** branch.
- **Mọi truy vấn dữ liệu nghiệp vụ phải lọc theo branch đang chọn** — không có màn hình nào xem lẫn dữ liệu giữa các branch, trừ màn hình dành riêng cho `owner`/`admin`.
- **Waiter** bị giới hạn thêm một tầng nữa: chỉ thấy bàn trong `table_assignments` của mình trong ca hiện tại.
- **Cashier** thấy toàn bộ bàn trong branch đang mở ca.
- Đổi branch = chọn branch khác trong session; token mang `branchId` đang hoạt động.
- **Guest token mang `branchId` + `sessionId` + `tableId`** — hết hiệu lực ngay khi phiên bàn đóng; không gia hạn.

### 6.2 PIN & Token

- PIN hash bằng **Argon2id** (Rust, `argon2` crate) — không lưu plaintext, không hash ở client.
- Rate limit + lockout: 5 lần sai → khoá 5 phút, ghi `audit_log`.
- Session token: **HMAC-signed**, TTL ngắn (ví dụ 12h = 1 ca), gắn `userId` + `role` + `deviceId`.
- Không dùng JWT library nặng — token ký HMAC đủ cho LAN.

### 6.3 QR token & LAN

- QR token = `HMAC-SHA256(secret, branchId|tableId|expiresAt)` + `expiresAt` + `tableId`.
- Token xoay theo session hoặc theo ngày (cấu hình).
- axum validate token + kiểm tra session của bàn còn `open`.
- **Token phải khớp branch của hub đang chạy** — QR của chi nhánh A mang sang mạng chi nhánh B sẽ bị từ chối. Mỗi branch có `secret` riêng (hoặc hub kiểm tra `branchId` trong token với branch của chính nó).
- **Bill/bàn trong token phải thuộc đúng branch** — chống tấn công dùng token hợp lệ của branch này để đọc dữ liệu branch khác.
- **Chưa có HTTPS trong v1** → khuyến nghị dùng Wi-Fi riêng/VLAN cho nhân viên và khách. Xem Risk #6.
- Giới hạn: khách chỉ đọc menu + bill của bàn mình; không liệt kê được bàn khác.
- Rate limit theo IP cho `/api/order`.

### 6.4 Audit log

Ghi lại: đăng nhập (thành công/thất bại), void, refund, discount, sửa giá, sửa type, đóng ca, approve/reject QR order.
Mỗi bản ghi: `{ actorId, role, action, targetType, targetId, before, after, reason, deviceId, createdAt }`.

---

## 7. In ấn & thiết bị (Printing & Devices)

### 7.1 In bill (v1 = PDF)

- Template HTML (Handlebars/Vue SSR) → render → xuất PDF → in qua OS print dialog.
- `PrinterAdapter` trait trong Rust:

```rust
pub trait PrinterAdapter: Send + Sync {
    fn print_bill(&self, bill: &BillDoc) -> Result<PrintResult>;
    fn print_kitchen_ticket(&self, ticket: &TicketDoc) -> Result<PrintResult>;
}
```

- `PdfPrinter` — implement cho v1.
- `EscPosPrinter` — **reserved**, implement ở v2 (USB/serial/LAN).
- Bill đã in lưu lại dưới dạng doc để in lại (reprint) và audit.

### 7.2 Scanner

- `ScannerAdapter` — hỗ trợ 2 chế độ:
  - **HID keyboard wedge** (phổ biến nhất): scanner "gõ" như bàn phím → bắt ở SPA.
  - **Serial/USB-serial**: đọc ở Rust → đẩy qua IPC event.
- Dùng cho: thêm món nhanh theo barcode, quét QR voucher, quét QR bàn khi setup.

### 7.3 KDS

- Chạy dạng web page (`/kds`) trên tablet/màn hình bếp — hoặc cửa sổ Tauri riêng.
- Nhận cập nhật qua WS.
- Hiển thị ticket theo station (bếp / bar / cold), có timer đổi màu (xanh → vàng → đỏ).
- Bump (xong) / recall (gọi lại).

---

## 8. Testing Strategy

| Loại | Công cụ | Phạm vi |
|------|---------|---------|
| **Unit** | Vitest | Money math, pricing, validation engine, formula interpreter, order lifecycle, **dựng payload VietQR (EMVCo)** |
| **Property-based** | fast-check | Split/merge invariants, rounding (largest remainder), cart totals, tổng tiền bảo toàn |
| **Integration** | Vitest + PouchDB memory adapter + PouchDB-server thật | Replication 2 chiều, conflict scenarios, offline→online, event replay, **cách ly dữ liệu giữa các branch** |
| **Rust** | `cargo test` | axum routes, token sign/verify, Argon2, rate limit, hub supervision, **branch scoping enforcement** |
| **E2E** | Playwright | QR order flow, staff PIN login + table scoping, KDS bump/recall, split/merge UI, **luồng VietQR (hiện mã → xác nhận)** |
| **Manual / QA** | Checklist | LAN setup, Wi-Fi, scanner HID/serial, PDF print, multi-device sync, **quét VietQR bằng app ngân hàng thật** |

**Test đặc biệt quan trọng:**
1. **Split/merge property tests** — bất biến tổng tiền. Đây là nơi dễ sai nhất.
2. **Sync conflict simulation** — 2 terminal offline cùng sửa → merge đúng.
3. **Event replay determinism** — rebuild bill từ events phải cho cùng kết quả trên mọi máy.
4. **QR token expiry & abuse** — token hết hạn, token của bàn khác, replay attack.
5. **Cross-branch isolation** ✚ — user của branch A không đọc/ghi được dữ liệu branch B (Risk #16). Test ở cả axum API và filtered replication.
6. **VietQR payload validity** ✚ — sinh đúng chuẩn EMVCo/NAPAS; test bằng cách **quét thử bằng app ngân hàng thật** (không chỉ unit test); kiểm tra `ref` không dấu, đúng độ dài, số tiền khớp bill.
7. **Branch override resolution** ✚ — giá hiển thị đúng theo thứ tự `override → price_list → basePrice` (Risk #18).

---

## 9. Milestones (M0–M5, M6a–M6c)

> ⚠️ **Ước lượng ~16–19 tuần** cho 1 developer full-time (±1–2 tuần). Tăng so với bản 0.2 vì **M6 được tách và ước lượng lại sát thực tế** (bản cũ gộp multi-branch + inventory + reports + hardening vào 3–3.5 tuần — quá lạc quan). Đây là **dự án lớn**: v1 gộp 4 miền nghiệp vụ + 1 metadata engine + multi-branch + LAN server + sync.
>
> **M6 đã được tách thành 3 phần nhỏ** (M6a / M6b / M6c) — tách để **nghiệm thu và bàn giao độc lập**, không phải để cắt bớt. Cả ba phần vẫn thuộc v1. Xem §9.1 để biết điểm dừng an toàn nếu cần ra mắt sớm.

| M | Tên | Nội dung chính | Ước lượng |
|---|-----|----------------|-----------|
| **M0** | Foundation & Skeleton | Scaffold Vue 3 + TS + Vite + Tauri 2; PouchDB adapter layer; đóng gói PouchDB-server sidecar; axum skeleton + static assets; CI; Vitest setup; i18n vi/en; design tokens; money type; **branch context + `branchId` xuyên suốt schema** | 2 tuần |
| **M1** | Type Registry & Dynamic Forms | Type Registry engine; field-type registry; dynamic form/table renderer; validation engine; formula interpreter; schema versioning + migration; **Type Designer UI** | 2–2.5 tuần |
| **M2** | Catalog & Menu | Category, product, variant (size), modifier group (topping), combo; price list; ảnh; barcode; import/export CSV; **catalog global + `product_branch_overrides`** | 2–2.5 tuần |
| **M3** | Order Engine & POS Terminal | Floor plan (areas/tables); table session; order entry; modifier; hold/park; order lifecycle; discount/surcharge/service charge; payment (cash + split payment); **VietQR (R9)**; bill PDF | 2.5–3 tuần |
| **M4** | Split / Merge / Transfer | Split by item / evenly / by seat; merge tables; merge bills; transfer table; move lines; property tests cho invariants | 1.5–2 tuần |
| **M5** | Staff Mobile, QR Order & KDS | axum LAN server + WS hub; PIN login (Argon2); table assignment scoping; QR token issuance; customer order flow; `requireWaiterApproval` (mặc định BẬT); KDS (timer, bump/recall) | 2–2.5 tuần |
| **M6a** | **Multi-branch & Cloud** | Branch management UI + chuyển chi nhánh; **enforce phân quyền branch** (chỉ `owner`/`admin` xem toàn hệ thống — §6.1); UI `product_branch_overrides`; **filtered replication theo `branchId`**; cloud aggregation; **báo cáo liên chi nhánh** | 2 tuần |
| **M6b** | **Inventory** | Recipe/BOM + trừ kho tự động khi bill `paid`; kiểm kê (stocktake); waste tracking; suppliers/PO (nhẹ); `inventory_movements` + tồn kho materialized | 2 tuần |
| **M6c** | **Shifts, Reports & Hardening** | Shift open/close + đối soát tiền mặt; báo cáo doanh thu; export Excel/PDF; audit log; backup/restore; **job purge guest user hết hạn**; installer/package; performance tuning | 2 tuần |

**Thứ tự phụ thuộc:**

```
M0 ──► M1 ──► M2 ──► M3 ──► M4
                      │
                      └──► M5 ──┬──► M6a ──┐
                                │          ├──► M6c
                                └──► M6b ──┘
```

- M0 là **nền tảng** — branch context phải có ngay từ đầu vì `branchId` xuyên suốt mọi doc.
- M1 là **nền tảng** — M2/M3 phụ thuộc vào Type Registry.
- M4 phụ thuộc M3 (cần session + bill).
- M5 có thể song song một phần với M4 (axum server độc lập).
- **M6a và M6b độc lập với nhau** → có thể làm song song, hoặc đổi thứ tự tùy nhu cầu kinh doanh (mở chi nhánh mới trước hay kiểm soát kho trước).
- **M6c làm cuối** — là tầng hardening, cần M6a + M6b xong mới đóng gói / backup / báo cáo tổng hợp đầy đủ được.
- Mỗi phần trong nhóm M6 **nghiệm thu độc lập** — cuối mỗi phần đều có demo chạy thật.

**Ghi chú multi-branch & VietQR:**

- **VietQR nằm ở M3** vì là một phần của luồng payment — không cần chờ tới nhóm M6. Khối lượng nhỏ (dựng payload EMVCo + render QR).
- **Multi-branch là M6a** nhưng **`branchId` phải có từ M0**. Nếu để tới M6a mới thêm `branchId`, phải migrate lại toàn bộ dữ liệu — tốn công hơn nhiều so với mang sẵn từ đầu (Risk #17).
- **Cần mở chi nhánh thứ 2 sớm?** → chuyển M6a lên ngay sau M4, trước M5. M5 (QR/KDS) và M6b (kho) làm sau vẫn được, vì `branchId` đã có sẵn từ M0 nên không phải migrate.

### 9.1 Các mốc bàn giao (delivery checkpoints)

Sau mỗi milestone là một sản phẩm **chạy thật được**, không phải demo giả:

| Sau | Bàn giao được gì | Dùng được cho |
|-----|------------------|---------------|
| **M0** | Skeleton chạy, **2 terminal sync được với nhau** | Kiểm chứng rủi ro kỹ thuật lớn nhất của dự án |
| **M1** | Type Designer + dynamic form | Kiểm chứng "data type vô hạn" (R1) |
| **M2** | Catalog & menu đầy đủ (global + override) | Nhập menu thật của quán |
| **M3** | Order tại bàn, split payment, **VietQR**, bill PDF | **Bán hàng thật được trên 1 máy** |
| **M4** | Tách / gộp / chuyển bàn | Vận hành quán đông khách, khách trả riêng |
| **M5** | Staff mobile + QR order + KDS | **Vận hành đa điểm chạm trong 1 chi nhánh** |
| **M6a** | Multi-branch + cloud + phân quyền branch | **Mở chi nhánh thứ 2, owner xem toàn hệ thống** |
| **M6b** | Inventory | Kiểm soát kho, chống thất thoát nguyên liệu |
| **M6c** | Shifts + báo cáo + hardening | **Phát hành chính thức v1.0** |

> **Điểm dừng an toàn nếu cần ra mắt sớm:**
> - **Sau M5** (~tuần 12–14): đủ bán hàng đa điểm chạm trong 1 chi nhánh, chưa có multi-branch/kho/báo cáo.
> - **Sau M6a** (~tuần 14–16): đủ vận hành nhiều chi nhánh và owner xem toàn hệ thống, chưa có kiểm soát kho và ca.

---

## 10. Rủi ro (Risks)

> Danh sách giữ nguyên các rủi ro đã xác định trước đó. Các rủi ro **bổ sung trong lần review này** được đánh dấu ✚.

| # | Rủi ro | Mức độ | Ảnh hưởng | Giảm thiểu |
|---|--------|:------:|-----------|------------|
| 1 | **Sync conflict** — nhiều terminal offline cùng sửa dữ liệu | Cao | Dữ liệu sai, bill lệch tiền | Event sourcing cho order/kho/payment (append-only); LWW + conflict queue cho catalog; integration test mô phỏng 2 terminal |
| 2 | **PouchDB-server performance** — catalog lớn, nhiều doc, `_changes` feed phình to | Trung bình | UI chậm, sync chậm | Chỉ sync collection cần thiết; index có kiểm soát (`indexed` flag); compaction định kỳ; benchmark sớm ở M0 |
| 3 | **Scope creep** — v1 quá lớn (4 miền + metadata engine + multi-branch + LAN server) | **Cao** | Trễ hạn, không hoàn thành | Giữ YAGNI; **M6 đã tách thành M6a/M6b/M6c** (§9) để nghiệm thu độc lập; §9.1 có điểm dừng an toàn nếu cần ra mắt sớm; mỗi M có demo chạy thật |
| 4 | **Tauri/WebView platform variance** — WebView2 (Windows) vs WebKitGTK (Linux); IndexedDB quirks | Trung bình | Bug chỉ xuất hiện trên 1 số máy | Chốt Windows-first cho v1; test matrix hạn chế; tránh API WebView không ổn định |
| 5 | **Printer/ESC/POS trì hoãn** — v1 chỉ PDF, có thể không đủ cho quán thật | Trung bình | Khách phải mua máy in thường hoặc chờ v2 | Chừa `PrinterAdapter` trait; xác nhận sớm với người dùng thật; có thể ưu tiên ESC/POS sớm nếu cần |
| 6 | **LAN security** — phục vụ web app qua Wi-Fi, chưa có HTTPS | Trung bình | Lộ token, người ngoài order | HMAC token có TTL; rate limit; khuyến nghị VLAN riêng; lộ trình thêm HTTPS |
| 7 | **Money rounding** — chia bill, discount % trên VND (không có phần thập phân) | Trung bình | Sai 1–2 đồng, khách phàn nàn | Integer đồng; largest remainder; property test bất biến tổng tiền |
| 8 | **Staff PIN security** — PIN yếu, dùng chung thiết bị | Trung bình | Mạo danh, gian lận | Argon2id; lockout; audit log; PIN 4–6 số + quy định đổi định kỳ |
| 9 | **Order numbering khi offline** — trùng số giữa các terminal | Thấp | Trùng số hoá đơn | Prefix theo `terminalCode`; cấp số chính thức tại hub |
| 10 | **Data loss / backup** — dữ liệu local-only, máy hỏng | **Cao** | Mất toàn bộ dữ liệu | Cloud sync; backup định kỳ; export thủ công; hướng dẫn restore |
| 11 | ✚ **Schema migration trên type do người dùng tạo** — thay đổi type phá vỡ dữ liệu hiện có | Trung bình | Dữ liệu hỏng sau khi sửa type | Schema versioning; lazy + background migration; transform khai báo (không code tuỳ ý); preview trước khi áp dụng |
| 12 | ✚ **Index explosion** từ field tuỳ chỉnh — admin bật `indexed` cho nhiều field | Thấp | Chậm, tốn dung lượng | Giới hạn số index/type; cảnh báo trong Type Designer |
| 13 | ✚ **Validation phía client có thể bị bỏ qua** — QR order gửi từ trình duyệt khách | Trung bình | Order rác, giá sai | axum validate lại phía server (giá, tồn tại, tồn kho); không tin client |
| 14 | ✚ **Phụ thuộc sidecar Node/PouchDB-server** — tiến trình con chết, cổng bị chiếm | Trung bình | App không sync được | Health check + auto-restart; port allocation động; fallback chế độ local-only |
| 15 | ✚ **Scanner HID vs serial variance** — model khác nhau hành xử khác nhau | Thấp | Không quét được | Hỗ trợ cả 2 adapter; test với ≥2 model phổ biến |
| 16 | ✚ **Multi-branch data isolation** — branch A đọc được dữ liệu branch B | **Thấp** | Rò rỉ dữ liệu giữa chi nhánh | **Đã xử lý ở tầng thiết kế** (§6.1): chỉ `owner`/`admin` xem toàn hệ thống; mọi role khác bị giới hạn trong `branchIds[]`; guest chỉ thấy bàn/phiên của mình. Enforce `branchId` từ **token đã ký** ở axum (không tin client); CouchDB security doc + filtered replication; test cross-branch access |
| 17 | ✚ **Thêm `branchId` muộn** — nếu không mang từ M0, phải migrate lại toàn bộ dữ liệu | Trung bình | Tốn công lớn, rủi ro hỏng dữ liệu | Đưa `branchId` vào schema ngay từ **M0**; default `branch:main` cho dữ liệu cũ |
| 18 | ✚ **Branch override phình to** — nhiều branch override nhiều field → khó truy vết giá thực tế | Trung bình | Nhân viên đọc sai giá, khách phàn nàn | Resolve giá theo thứ tự rõ ràng (§4.7); hiển thị nguồn giá trong UI; giới hạn số field override |
| 19 | ✚ **VietQR sai nội dung chuyển khoản** — `ref` không khớp sao kê → khó đối soát | Trung bình | Không khớp được tiền về, mất thời gian đối soát | Format `ref` cố định + validate độ dài/không dấu; xuất `ref` trong báo cáo; preview QR trước khi hiển thị |
| 20 | ✚ **VietQR thủ công — khách chuyển mà nhân viên không thấy tiền** | Trung bình | Nhân viên bấm "Đã nhận" khi tiền chưa về → thất thoát | Bắt buộc nhân viên xác nhận trên app ngân hàng; ghi `ref` vào payment; đối soát cuối ca với sao kê |
| 21 | ✚ **Guest user tồn đọng / lạm dụng** — guest "mồ côi", hoặc spam tạo guest qua order rác | Thấp | `users` phình dần, dữ liệu rác | Guest chỉ sinh khi order **hợp lệ** (có table token + validate server-side); guest token hết hiệu lực ngay khi đóng phiên; **job purge sau 30 ngày** (nằm ở M6c); rate limit theo IP cho `/api/order` |

---

## 11. Câu hỏi mở (Open Questions 1–7)

> **Trạng thái: tất cả 7 câu hỏi đã được giải quyết** trong phiên làm việc 2026-10-20.

| # | Câu hỏi | Trạng thái | Quyết định |
|---|---------|-----------|-----------|
| **1** | **Hub choice** — PouchDB-server vs CouchDB vs Rust-native? | ✅ **Bundle PouchDB-server** | Không cần cài service ngoài; sync protocol đã được chứng minh; chấp nhận ~45MB Node sidecar |
| **2** | **Multi-branch** trong v1? | ✅ **CÓ — làm multi-branch trong v1** | Mỗi chi nhánh một hub local; `branchId` xuyên suốt schema; catalog global + override theo branch; cloud là tầng tổng hợp. **Bắt buộc `branchId` có từ M0** (Risk #17). Multi-tenant (nhiều tenant độc lập) vẫn ngoài phạm vi |
| **3** | **Printer** — máy in nhiệt ESC/POS trong v1? | ✅ **PDF trước** | `PrinterAdapter` trait chừa sẵn cho ESC/POS ở v2 |
| **4** | **E-invoice / hoá đơn điện tử** (tích hợp thuế VN)? | ✅ **CHƯA CẦN ở v1** | Xác nhận không làm e-invoice. Order numbering vẫn dùng prefix branch+terminal để sẵn sàng nâng cấp sau |
| **5** | **Payment** — chỉ tiền mặt hay tích hợp bank/e-wallet? | ✅ **VietQR + xác nhận thủ công** | Hiện mã VietQR trên màn hình bill khi chọn chuyển khoản (khách hoặc nhân viên). **Không** gọi API ngân hàng, không webhook, không auto-confirm. Momo/ZaloPay: ngoài phạm vi v1 |
| **6** | **QR approval** — `requireWaiterApproval` mặc định bật hay tắt? | ✅ **MẶC ĐỊNH BẬT** | Cấu hình được theo branch/bàn; mặc định BẬT để kiểm soát order từ khách |
| **7** | **Language** — chỉ tiếng Việt hay vi + en? | ✅ **vi + en** | Dùng vue-i18n; en hữu ích cho khách du lịch và dev |

---

## 12. Hành động tiếp theo (Next Steps)

1. ✅ **Đã chốt toàn bộ 7 câu hỏi mở** (§11) — không còn quyết định nào treo.
2. ✅ **Đã chốt scope v1** — multi-branch **trong** v1; e-invoice **ngoài**; VietQR **trong**; `requireWaiterApproval` mặc định BẬT.
3. ✅ **Đã tách M6** thành **M6a** (multi-branch & cloud), **M6b** (inventory), **M6c** (shifts / reports / hardening) — mỗi phần 2 tuần, nghiệm thu độc lập. Kèm bảng mốc bàn giao ở §9.1.
4. ✅ **Đã chốt mô hình phân quyền** — chỉ `owner`/`admin` xem dữ liệu toàn hệ thống; mọi role khác giới hạn theo `branchIds[]`; **guest là user tạm thời** sinh ra khi khách đặt món thành công (§1.4, §2 R6, §6.1).
5. ⏳ **Xác nhận lần cuối** — đọc lại §3.1 (kiến trúc), §4.7 (branch override), §6.1 (phân quyền), §9 + §9.1 (lộ trình), **và §13 (bổ sung sau brainstorm)** và cho biết cần điều chỉnh gì.
6. ⏳ **Sau khi approve** → chuyển sang `writing-plans` skill để tạo implementation plan chi tiết cho từng milestone.
7. ⏳ **Khởi tạo git repo** và commit tài liệu này làm baseline (`git init` chưa được thực hiện).

### 12.1 Gợi ý bước đi thực tế (đề xuất)

Hai rủi ro kỹ thuật lớn nhất của dự án là **(a) sync giữa nhiều terminal** và **(b) metadata engine cho type tuỳ biến**. Nên làm hai thứ đó trước để phát hiện vấn đề sớm thay vì tuần 15:

- **Bước 1 (M0, ~2 tuần):** skeleton + PouchDB + hub + axum; chứng minh **2 terminal sync được với nhau**.
- **Bước 2 (M1 + một phần M2, ~2 tuần):** Type Registry + dynamic form + CRUD sản phẩm — chứng minh **"data type vô hạn"**.
- **Bước 3 (M3, ~3 tuần):** order tại bàn + VietQR + bill PDF → **demo bán được thật** (khoảng tuần 7).

Sau đó thứ tự phụ thuộc vào **nhu cầu kinh doanh thực tế**, không nhất thiết theo số thứ tự milestone:

| Nếu bạn cần… | Làm tiếp |
|--------------|----------|
| Quán đông khách, khách trả riêng từng người | **M4** — tách / gộp / chuyển bàn |
| Khách tự gọi món tại bàn, bếp xem màn hình | **M5** — staff mobile + QR order + KDS |
| Sắp mở chi nhánh thứ 2 | **M6a** — multi-branch + cloud (có thể đưa lên trước M5) |
| Kiểm soát nguyên liệu, chống thất thoát | **M6b** — inventory |
| Chốt sổ ca, báo cáo, phát hành chính thức | **M6c** — shifts + reports + hardening |

---

## 13. Bổ sung thiết kế sau brainstorm (v0.4 — chờ review)

> Mục này tập hợp các lỗ hổng thiết kế phát hiện khi rà soát lại spec theo tình huống vận hành thực tế của quán phở / cơm / cafe có **bếp và quầy nước tách biệt**. Sau khi approve, nội dung sẽ được hợp nhất vào §4 / §5 / §7 tương ứng (không tạo thêm nguồn sự thật mới).

### 13.1 Station routing — chia ticket theo bếp / bar / cold

**Vấn đề.** §7.3 mô tả KDS "hiển thị ticket theo station" nhưng toàn bộ spec **không có mô hình dữ liệu nào cho station**. Với quán có bếp và quầy nước tách biệt (cafe: đồ uống ra bar, bánh ra bếp; phở: bếp chính + quầy nước), KDS không biết ticket nào thuộc màn hình nào, và `PrinterAdapter` (§7.1) không biết in phiếu chế biến đi đâu. Đây là lỗ hổng chặn M5.

**Thiết kế.**

```jsonc
// stations — theo branch
{
  "_id": "station:branch:hq|bar",
  "branchId": "branch:hq",
  "code": "bar",
  "name": { "vi": "Quầy nước", "en": "Bar" },
  "printerId": "device:printer-bar",
  "active": true
}
```

- `catalog_categories.stationId` — station mặc định cho cả danh mục (vd: danh mục "Đồ uống" → bar).
- `catalog_products.stationId` — override cho từng món (vd: "Trà đá" luôn ra bar dù nằm trong danh mục khác).
- **Snapshot vào order line** ngay lúc `LINE_ADDED`: `line.stationId`, cùng cách xử lý với `unitPriceSnapshot`. Nếu chỉ resolve tại thời điểm in thì việc sửa station của món về sau sẽ làm sai lệch ticket đã in — snapshot là bắt buộc để giữ tính append-only của event log (§4.3).
- **Thứ tự resolve:** `product.stationId` → `category.stationId` → station `default` của branch.
- KDS `/kds?station=bar` chỉ hiển thị ticket có **ít nhất 1 line** thuộc station đó; bump/recall thao tác **theo từng line**, không bump cả bill — vì một bill có thể vừa có món bếp vừa có món bar, và bếp xong trước quầy nước là chuyện thường.
- `PrinterAdapter` và KDS **chia sẻ cùng một mô hình station** — một nguồn sự thật, hai consumer.

### 13.2 Ảnh sản phẩm — chiến lược lưu trữ & sync

**Vấn đề.** `image` là một dataType hợp lệ (§4.1) và M2 có nhắc "ảnh", nhưng spec không nói ảnh **lưu ở đâu** và **sync thế nào**. PouchDB replicate attachment theo document, nên nếu nhét ảnh trực tiếp vào `catalog_products` thì mỗi tablet phải tải toàn bộ ảnh menu về IndexedDB. Với menu 150 món × ảnh 200KB ≈ 30MB thì tạm được, nhưng ảnh gốc 2–5MB/ảnh sẽ vỡ quota WebView2 và làm chậm sync lần đầu.

**Thiết kế — hai tầng.**

| Loại | Lưu ở đâu | Có replicate? |
|------|-----------|---------------|
| **Thumbnail** (≤ 200KB, đã resize ngay trên client) | PouchDB attachment trên doc `product_image` | ✅ có — PouchDB **dedupe theo digest**, ảnh dùng chung giữa nhiều doc chỉ lưu một bản |
| **Ảnh gốc / file lớn** (> 200KB) | File trên hub (thư mục static của PouchDB-server, hoặc route `/media/:digest`) | ❌ không — terminal tải lazy qua HTTP khi thực sự cần |

- Doc ảnh tách riêng khỏi `catalog_products`, để **filtered replication** có thể bỏ qua collection ảnh trên các terminal chỉ chạy KDS.
- `catalog_products.imageRef` lưu **digest**; URL resolve = `hubUrl + "/media/" + digest`.
- Client **bắt buộc resize + nén trước khi lưu** (canvas / `createImageBitmap`), giới hạn kích thước cấu hình được theo branch.
- Ngoài phạm vi v1: CDN, image-transform server-side, nhiều phiên bản ảnh theo kích thước.

### 13.3 Event log — partition & compaction

**Vấn đề.** §4.3 lưu **một doc cho một event**. Quán phở trung bình ~200 bill/ngày × ~8 event ≈ 1.600 event/ngày ≈ 580k doc/năm cho **mỗi** terminal. `_changes` feed và payload replication phình theo cấp số đó. Risk #2 chỉ ghi "compaction định kỳ" mà chưa có thiết kế cụ thể — và đây là loại chi phí retrofit đắt (cùng họ với Risk #17), nên phải chốt từ M0/M3 thay vì phát hiện ở tuần 15.

**Thiết kế.**

1. **Partition theo session.** Gom toàn bộ event của một `table_session` vào **một** doc `session_events:{sessionId}`, với mảng `events[]`; mỗi phần tử vẫn giữ `eventId` UUID riêng.
   - Merge = **union theo `eventId`**, giữ nguyên tính conflict-free của event sourcing (không có conflict thật để giải quyết — §4.3 vẫn đúng).
   - Một doc/session thay vì ~8 doc/session → **giảm ~8× số doc**, `_changes` và replication nhẹ hơn tương ứng.
2. **Compaction khi session đóng.** Khi `session.status = closed` **và** bill đã `paid` **và** hub đã ack → thay `events[]` bằng `snapshot` (state cuối cùng), đồng thời giữ event thô trong **cửa sổ audit N ngày** (mặc định 30).
   - Hết cửa sổ: event thô bị xoá khỏi terminal; **hub giữ bản đầy đủ** để phục vụ audit/report (hoặc cloud sau này).
3. **Ràng buộc.** `bills` vẫn là **materialized view** dựng lại được từ `session_events` — replay vẫn deterministic, đây là điều kiện để compaction an toàn.
4. `audit_log` và `inventory_movements` áp dụng cùng chiến lược, partition theo **ca (shift)** và theo **ngày**.

### 13.4 Combo có lựa chọn (set menu)

**Vấn đề.** §2 R2 định nghĩa combo là "nhóm nhiều item con, có giá riêng" nhưng không có mô hình cho **chọn 1 trong N** — vd "Cơm phần + chọn 1 trong 3 món chính + chọn 1 trong 4 loại nước". Thiếu mô hình này thì không làm được set menu thực tế.

**Thiết kế.**

```jsonc
// catalog_combos
{
  "_id": "combo:com-trua",
  "name": { "vi": "Cơm trưa" },
  "basePrice": 55000,
  "comboGroups": [
    {
      "key": "main",
      "label": { "vi": "Món chính" },
      "minSelect": 1,
      "maxSelect": 1,
      "options": [
        { "optionId": "opt:pho", "productId": "product:pho-bo", "priceDelta": 0 },
        { "optionId": "opt:com", "productId": "product:com-ga", "priceDelta": 5000 }
      ]
    },
    {
      "key": "drink",
      "label": { "vi": "Nước" },
      "minSelect": 1,
      "maxSelect": 1,
      "options": [
        { "optionId": "opt:tra", "productId": "product:tra-da", "priceDelta": 0 }
      ]
    }
  ]
}
```

- **Bill line** giữ `comboSelections: [{ groupKey, optionIds[] }]` cùng `comboPriceDelta`.
- Giá line = `combo.basePrice + Σ priceDelta`.
- **Materialize thành child lines** (`parentLineId`) ngay khi gửi bếp/bar, để KDS và việc trừ kho hoạt động đúng cho **từng món con**. Kết hợp §13.1: món chính ra bếp, nước ra bar — cùng một combo, hai station khác nhau.
- Validation `minSelect ≤ |optionIds| ≤ maxSelect` enforce ở **cả** client **lẫn** axum server (Risk #13).

### 13.5 Thuế / VAT trên bill

**Vấn đề.** Bill (§4.6) có `discounts`, `surcharges`, `total` nhưng **không có tax**. Chữ "thuế" chỉ xuất hiện ở danh sách thuộc tính thuộc global catalog (§4.7). Cần phân biệt rõ: §11 #4 defer **e-invoice** (tích hợp hoá đơn điện tử với cơ quan thuế), không phải việc **thu** VAT. Đa số quán VN niêm yết giá đã gồm VAT, nhưng báo cáo doanh thu vẫn cần tách phần VAT ra.

**Thiết kế.**

```jsonc
// meta_settings.tax_rates — global hoặc theo branch
[ { "rateId": "vat10", "label": { "vi": "VAT 10%" }, "rate": 10 } ]

// bill
{
  "taxMode": "inclusive",  // inclusive: giá đã gồm | exclusive: cộng thêm
  "taxLines": [ { "rateId": "vat10", "base": 130000, "amount": 11818 } ]
}
```

- `catalog_products.taxRateId` — mặc định theo danh mục.
- `inclusive`: `amount = round(total − total/(1+rate/100))`. **Không** đổi `total` khách phải trả; chỉ tách ra để báo cáo.
- `exclusive`: `total = subtotal + tax`.
- Mặc định `inclusive` → không thay đổi trải nghiệm bán hàng hiện có; bật `exclusive` theo branch khi cần.
- Rounding dùng largest-remainder như money math hiện có (Risk #7).

### 13.6 Điểm cần xác nhận thêm

| # | Điểm mở | Đề xuất |
|---|---------|---------|
| A | **Time-based pricing (giờ vàng / happy hour).** `price_lists` có trong schema nhưng chưa có mô hình khung giờ. | Thêm `price_list.windows: [{ days, from, to }]`; bước resolve chèn giữa override và `basePrice`. Cần xác nhận làm ở v1 hay đẩy sang M6c. |
| B | **Bàn giao ca giữa waiter (handover).** `table_assignments` có nhưng chưa có luồng chuyển bàn giữa nhân viên. | Thêm event `TABLE_HANDOVER`; giữ lịch sử phục vụ để tính tip / doanh số theo waiter. |
| C | **Giới hạn dung lượng local.** IndexedDB / WebView2 quota chưa được đo. | Đo dung lượng thật ngay ở M0 acceptance; cảnh báo khi vượt 70%. |

---

*Hết tài liệu.*
