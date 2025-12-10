# 🚀 HƯỚNG DẪN DEPLOY TRÊN RENDER

## Tổng quan

Hệ thống này giờ chỉ sử dụng **Node.js** duy nhất (không cần Python), giúp việc deploy đơn giản hơn nhiều.

---

## 1. Chuẩn bị trước khi deploy

### 1.1. Kiểm tra file cần thiết

```
demo/
├── server.js              # Server chính
├── package.json           # Dependencies
├── .env                   # Biến môi trường (KHÔNG push lên git)
├── models/                # MongoDB models
├── routes/                # Express routes
├── services/              # Google Sheets & Notification services
│   ├── googleSheet.js
│   └── notification.js
└── views/                 # EJS templates
```

### 1.2. Kiểm tra package.json

Đảm bảo có đầy đủ dependencies:
- `google-spreadsheet` - Kết nối Google Sheets
- `google-auth-library` - Xác thực Google API
- `axios` - HTTP client
- `node-cron` - Background jobs

---

## 2. Deploy trên Render

### 2.1. Tạo Web Service mới

1. Đăng nhập [render.com](https://render.com)
2. Click **New → Web Service**
3. Kết nối với GitHub repository của bạn

### 2.2. Cấu hình Build & Start Commands

| Field | Value |
|-------|-------|
| **Name** | `fansipanlab-bot` (hoặc tên bạn muốn) |
| **Region** | Singapore (gần Việt Nam) |
| **Branch** | `main` |
| **Root Directory** | (để trống nếu code ở root) |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |

### 2.3. Cấu hình Environment Variables

Vào **Environment → Add Environment Variable**, thêm các biến sau:

| Key | Value | Mô tả |
|-----|-------|-------|
| `DB_URL` | `mongodb+srv://...` | MongoDB connection string |
| `TELEGRAM_TOKEN` | `8327568345:AAF...` | Token từ BotFather |
| `SESSION_SECRET` | `your_secret_key` | Secret cho session |
| `SHEET_ID` | `1NekRL7Mcx...` | ID của Google Sheet |
| `SHEET_NAME` | `product` | Tên sheet chứa sản phẩm |
| `USER_SHEET_NAME` | `users` | Tên sheet chứa users |
| `BOT_PASSWORD` | `fansipan2024` | Password để đăng ký bot |
| `GOOGLE_CREDENTIALS` | `{"type":"service_account",...}` | JSON credentials (1 dòng) |

⚠️ **Quan trọng**: `GOOGLE_CREDENTIALS` phải là JSON 1 dòng, copy nguyên nội dung file credentials.json.

### 2.4. Auto-Deploy

Render sẽ tự động:
1. Detect Node.js runtime
2. Chạy `npm install` để cài dependencies
3. Chạy `npm start` để khởi động server

---

## 3. Sau khi deploy thành công

### 3.1. Lấy Server URL

Render sẽ cung cấp URL dạng: `https://fansipanlab-bot.onrender.com`

### 3.2. Thêm biến SERVER_URL (Quan trọng!)

Quay lại **Environment Variables**, thêm:

| Key | Value |
|-----|-------|
| `SERVER_URL` | `https://fansipanlab-bot.onrender.com` |

Sau đó click **Manual Deploy → Deploy latest commit** để áp dụng.

### 3.3. Kiểm tra webhook

Truy cập: `https://your-app.onrender.com/telegram/health`

Nếu thấy `{"status":"ok","telegram":"configured"}` là thành công!

---

## 4. Kiểm tra hoạt động

### 4.1. Test Telegram Bot

1. Mở Telegram, tìm bot của bạn
2. Gửi `/start` - Bot sẽ yêu cầu đăng ký
3. Gửi `/login fansipan2024` - Đăng ký thành công
4. Tạo đơn hàng mới trên web → Nhận thông báo Telegram

### 4.2. Test Google Sheet

1. Thêm sản phẩm mới vào sheet `product`
2. Chờ 5 giây → Nhận thông báo Telegram về sản phẩm mới

### 4.3. Xem logs

Trên Render Dashboard → **Logs** để xem console output:

```
✅ Đã kết nối MongoDB thành công!
✅ Đã kết nối Google Sheet: FansipanLab
🚀 KHỞI ĐỘNG BOT THÔNG BÁO (Node.js)
✅ Đã set webhook thành công
✅ Background jobs đã khởi động (quét mỗi 5 giây)
```

---

## 5. Troubleshooting

### Lỗi 1: "Cannot find module 'google-spreadsheet'"

**Nguyên nhân**: Dependencies chưa được cài đặt đúng.

**Giải pháp**: Kiểm tra `package.json` có đầy đủ dependencies và chạy lại deploy.

### Lỗi 2: "Không kết nối được Google Sheet"

**Nguyên nhân**: `GOOGLE_CREDENTIALS` không đúng format.

**Giải pháp**: 
- Copy nguyên nội dung file `credentials.json`
- Paste vào biến môi trường (1 dòng)
- Không thêm dấu ngoặc kép bao ngoài

### Lỗi 3: "Webhook không hoạt động"

**Nguyên nhân**: `SERVER_URL` chưa được set.

**Giải pháp**: 
- Thêm biến `SERVER_URL` với giá trị URL của Render
- Redeploy để áp dụng

### Lỗi 4: Bot không nhận được thông báo

**Nguyên nhân**: Chưa đăng ký trong sheet `users`.

**Giải pháp**:
- Gửi `/login password` cho bot
- Hoặc thêm Chat ID vào sheet `users` thủ công

---

## 6. Cấu trúc Google Sheet

### Sheet `users` (danh sách subscribers)

| Chat ID | Name | Type |
|---------|------|------|
| 123456789 | Duyệt | User |
| -987654321 | Group ABC | Group |

### Sheet `product` (danh sách sản phẩm)

| Dấu thời gian | Tên sản phẩm | Giá tiền |
|---------------|--------------|----------|
| 10/12/2025 14:30:00 | Áo thun | 150000 |
| 10/12/2025 15:00:00 | Quần jean | 350000 |

**Lưu ý**: Cột giá tiền chỉ nhập số (không có dấu chấm, phẩy hay đơn vị tiền).

---

## 7. Lưu ý quan trọng

1. **Free tier Render**: Server sẽ sleep sau 15 phút không hoạt động. Khi có request mới, mất 30-60 giây để khởi động lại.

2. **Giải pháp sleep**: Dùng [UptimeRobot](https://uptimerobot.com) để ping server mỗi 10 phút, giữ server luôn active.

3. **Background jobs**: Chạy mỗi 5 giây, quét MongoDB và Google Sheet để gửi thông báo.

4. **Webhook**: Tự động được set khi server khởi động. Không cần cấu hình thủ công.

---

## Tóm tắt Commands

| Mục đích | Command |
|----------|---------|
| Build | `npm install` |
| Start | `npm start` |
| Dev (local) | `npm run dev` |

Chúc bạn deploy thành công! 🎉
