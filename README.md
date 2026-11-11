# EHS Environment V2 — Firebase Hosting + Firestore + AI

## Chức năng
Dashboard rác/nước/vật tư; lọc thời gian và đối chiếu kỳ; bảng tài chính; sơ đồ nhà máy minh họa; nhập Excel chuẩn; AI đọc ảnh qua Cloud Function Gemini; duyệt trước khi ghi; xuất Excel/PDF (in)/PowerPoint; Auth và phân quyền.

## Triển khai
1. Tạo Firebase project (bật Billing nếu dùng Cloud Functions/AI). Bật Authentication > Google, Firestore, Storage và Hosting.
2. Cài Node.js 22 và Firebase CLI: `npm install -g firebase-tools`.
3. `firebase login` và `firebase use --add` trong thư mục này.
4. Firebase Console > Project settings > Your apps > Web app: sao chép cấu hình vào `public/firebase-config.js`, thay `null` bằng object config. Đây là config công khai, không phải secret.
5. `cd functions && npm install && cd ..`
6. `firebase functions:secrets:set GEMINI_API_KEY` (nhập khóa Gemini API, KHÔNG đưa vào client).
7. `firebase deploy --only firestore:rules,firestore:indexes,storage,functions,hosting`.
8. Đăng nhập Google một lần, lấy UID từ Firebase Authentication, vào Firestore tạo tài liệu `members/{UID}` với trường `role: "admin"` (bootstrap thủ công qua Firebase Console). Chỉ sau đó app mới tải dữ liệu riêng.
9. Tạo tài khoản editor/viewer bằng Firebase Auth rồi tạo `members/{UID}` với `role` tương ứng trong Console. Không cho người dùng tự cấp quyền.

## Lưu ý
- Chưa deploy vì chưa có quyền truy cập dự án Firebase của bạn.
- Dữ liệu từ các tệp Excel được đưa vào `public/sample-data.json` CHỈ để demo khi chưa cấu hình Firebase. **Không được deploy file này nếu chứa dữ liệu nội bộ nhạy cảm**: xóa file hoặc thay bằng dữ liệu giả trước khi triển khai công khai. Trong chế độ Firebase, ứng dụng không tải file demo.
- Nhập Excel tự động hiện chỉ nhận cấu trúc chuẩn Ngày/Loại/Tên/Số lượng/Đơn vị. Các workbook gốc đa dạng phải thêm bộ ánh xạ tương ứng trước khi nhập toàn bộ.
- Chi phí trên m³ và kg chỉ có ý nghĩa khi tách chi phí đúng loại. Dữ liệu tài chính hiện chưa ánh xạ từ workbook gốc.
- Nhập AI tạo `reviews` chờ duyệt; phải phê duyệt trong Quản trị để ghi `records`.
- Chỉ số vật tư nhập/xuất cộng khác đơn vị chỉ mang tính số dòng giao dịch, không phải tồn kho chuẩn; cần quy đổi và quản lý theo mã hàng.
- Cloud tải tối đa 5000 bản ghi/lần; cần phân trang, chỉ mục và tổng hợp theo tháng để mở rộng quy mô lớn.
- Đối với sản xuất, nên bổ sung: nhật ký sửa/xóa phía server, import idempotent chống trùng, kiểm tra ảnh và mã độc, rate limiting, kiểm thử Firestore rules, sao lưu định kỳ, phân quyền theo nhà máy, bản đồ thực và báo cáo PDF phía server.

## GitHub Actions - automatic Hosting deployment

**Never reuse `topkey-badminton`** for this EHS project. Create a separate Firebase project and GitHub repository.

1. Create an empty GitHub repository, for example `rolthchildpham-wq/EHS-Environment-Management` (private recommended). Push this directory to its `main` branch. This package excludes `public/sample-data.json` because it contains internal workbook-derived data.
2. Create a new Firebase project, register a Web app, enable Hosting, and fill in the **public** Firebase Web app configuration in `public/firebase-config.js` (an object rather than `null`).
3. Create a Google Cloud service account for the **new EHS project only**, grant the minimum Firebase Hosting deployment permissions needed (typically Firebase Hosting Admin and Service Account User where applicable), and create its JSON key. Prefer short-lived Workload Identity Federation for mature production deployments; this starter uses a repository secret.
4. In GitHub repository Settings > Secrets and variables > Actions, add repository **variable** `FIREBASE_PROJECT_ID` with the new project ID and repository **secret** `FIREBASE_SERVICE_ACCOUNT` with the full JSON key. Never commit the JSON key or paste it into chat.
5. Push to `main` or run Actions > Deploy EHS to Firebase Hosting > Run workflow. The workflow deploys **Hosting only** and never automatically deploys Firestore rules, Storage rules or Functions.
6. First-time backend setup (Auth, Firestore, Storage, Functions and Gemini secret) requires a separate authenticated administrator deployment as described above. The web app cannot access live data until these are configured.

### Security notes
- `public/sample-data.json` is deliberately excluded from the deployment bundle. Keep internal records in Firestore with appropriate security rules; do not ship the sample file.
- `firebase.json` contains an `/api/**` rewrite to the `api` Cloud Function; that endpoint will fail until Functions is deployed separately.
- Do not create a public GitHub repository if source code or internal operational logic is confidential.
- No automatic PR preview is enabled in this starter because a secure preview workflow requires separate environment-specific secrets and permissions. Production auto-deployment from `main` is configured.

## Spark mode (2026-11-11)

The **web dashboard now runs without Cloud Functions or Blaze**. Hosted on Firebase Hosting; Firebase Authentication (Google) and Firestore are used for data. AI OCR is deliberately **disabled**; no client-side Gemini API key is used.

**Photo evidence:** an editor transcribes one row from an image, saves a `reviews/{id}` document with status `pending`. Only an administrator may change it to `approved` or `rejected`. Security Rules restrict changes to the status and audit fields. Approved rows are included in charts and reports directly from `reviews` rather than duplicated into `records`. Images are previewed locally and **not uploaded**.

**Database rules are not yet confirmed deployed.** Open [Cloud Firestore > Rules](https://console.firebase.google.com/project/ehs-environment-management/firestore/rules), paste the entire current [firestore.rules](https://github.com/rolthchildpham-wq/EHS-Environment-Management/blob/main/firestore.rules), then click **Publish** using the Firebase project owner account. This is necessary if the GitHub service account still lacks Service Usage / Firestore Rules deployment permissions (last observed HTTP 403).

**First user:** enable Google sign-in in Firebase Authentication, sign in to the website once, and manually create `members/<your-authentication-uid>` with `role: "admin"` from the Firestore Console. Do not make public self-registration for admins.

**GitHub Actions:** changes to `public/**` automatically deploy Hosting on `main` after JavaScript syntax validation. Firestore rules have a **separate manual** Actions workflow and are never automatically loosened by a UI update. The optional Cloud Functions source under `functions/` is historical only and is not deployed in Spark mode.

**Current limits:** imports expect normalized Excel headers; the dashboard fetches at most 5,000 direct rows and 1,000 review rows per refresh; there is no actual AI OCR, file upload to Storage, or server-side PDF generator. Auth and rules must be activated for multiuser use. Spark remains subject to Firebase quotas.

## Quản lý thành viên trên Spark

Đã bổ sung thẻ **Quản trị → Quản lý nhân viên** (chỉ hiển thị với role `admin`). Quản trị viên nhập email Google, chọn `editor` mặc định, `viewer` hoặc `admin`, điều chỉnh quyền, khóa/mở quyền và xem nhật ký. Người được mời vào website, đăng nhập Google bằng **đúng email đã mời**, hệ thống tạo `members/{uid}` tự động. Không tạo mật khẩu Firebase cho người khác.

Firestore collections: `invites/{email}`, `members/{uid}`, `member_audit/{auditId}`. Các thay đổi bởi admin được ghi đồng thời bằng write batch, `member_audit` chỉ tạo mới, không thể sửa/xóa qua client. Firestore Rules không cho người bị vô hiệu hóa tiếp tục đọc/ghi records, reviews và quản trị. Admin không thể tự vô hiệu hóa hoặc đổi vai trò chính mình.

**Bắt buộc trước khi sử dụng:** chủ dự án vào Firebase Console → Firestore → Rules, dán nguyên văn file `firestore.rules` mới nhất và chọn **Publish**. GitHub Hosting Action chỉ triển khai giao diện, không triển khai Rules. Bản deploy Rules qua service account hiện từng gặp lỗi quyền API 403 nên cần kiểm tra Publish thực tế.

Nếu chưa có admin đầu tiên, hãy tạo thủ công `members/{UID}` trong Firestore Console, field `role: 'admin'`. Kích hoạt Google Authentication trong Firebase Console. Sau khi publish rules, test lần lượt: invite → đăng nhập bằng email mời → đổi quyền → khóa quyền → kiểm tra Firestore từ client bị chặn → mở lại quyền. Nếu quản trị viên được tạo thủ công không có trường `active`, hệ thống coi là hoạt động theo mặc định.


## Nhập Excel EHS thực tế (2026-11-11)

Giao diện **Nhập liệu & Excel → Nhập tay & nhập Excel theo cấu trúc gốc** nhận các sheet sau mà không yêu cầu đổi tên cột:

- `A.1 Xử lý rác thải`: ngày, tên tiếng Việt/Trung, lượng rác kg.
- `A.2 Xử lý nước thải`: ngày, chỉ số đồng hồ xử lý/xả hiện tại và trước đó, m³ xử lý và m³ xả thực tế; không cộng tổng chỉ số tích lũy.
- `入库`, `出库`: mã hàng, quy cách, đơn vị, số lượng, nhân viên, đơn giá và giá trị nhập.
- `收发存`: tồn đầu kỳ 2025 từ cột F, tính tồn cuối theo mã và đơn vị.
- `A.3 Chi Phí Nước Thải`: toàn bộ chi phí chi tiết theo tháng (hóa chất, điện, nước, bùn...). Sheet `A.3 Phụ Biểu` chỉ dùng để đối chiếu khi có sheet chính, không cộng hai lần.
- `A.TK Rác_XLNT ...`, `Bảng thu chi hàng tháng`, `RÁC NH_CN&SH`, `PL _廢品`: tổng hợp tham chiếu và số liệu tài chính; các bảng lũy kế/đối chiếu không cộng trùng với A.1.

Nhập từng dòng bằng biểu mẫu nghiệp vụ cũng hỗ trợ đầy đủ khi không có Excel. Excel được đọc **trong trình duyệt**, xem trước 100 dòng/trang, sửa ngày, số lượng, mã, số tiền và trường chi tiết trước khi lưu. Dữ liệu gốc ghi vào `operations/{id}`; lô ghi tối đa 250 dòng, các lần nhập trùng cùng file/sheet/dòng sẽ bị bỏ qua. Bản ghi nghiệp vụ không được cập nhật hoặc xóa trực tiếp bởi client theo Rules. Cần thiết kế bút toán điều chỉnh cho quy trình sửa số liệu sau khi đã lưu.

Báo cáo: thống kê theo tháng, năm, chi phí/m³, chi phí/kg, doanh thu phế liệu, tồn kho, tham chiếu nguyên bản, xuất Excel nhiều sheet và in PDF từ trình duyệt. Các chỉ số chỉ chính xác trong phạm vi dữ liệu đã nhập; năm trên sheet báo cáo tổng hợp phải chọn thủ công trước khi đọc file.

**Quan trọng:** Chủ Firebase Project phải vào Firestore → Rules, xuất bản lại [file `firestore.rules`](firestore.rules) mới nhất để cấp quyền `operations`; GitHub Actions hiện chỉ triển khai Hosting do service account từng thiếu quyền triển khai Rules. Giới hạn tải hiện tại 5.000 bản ghi nghiệp vụ/mỗi lượt, chưa có phân trang toàn bộ lịch sử nhiều năm. Chưa nhận dạng AI chữ viết tay trên bản Spark; ảnh được nhập thủ công và duyệt riêng.
