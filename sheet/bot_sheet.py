import os
import json
import time
import requests
import gspread
from threading import Thread
from flask import Flask, request, render_template_string
from dotenv import load_dotenv
from pymongo import MongoClient
from bson.objectid import ObjectId
from datetime import datetime

# Load .env từ thư mục hiện tại hoặc thư mục cha
# Ưu tiên file .env trong folder sheet/, nếu không có thì dùng file .env ở thư mục gốc
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)

# Thử load từ folder sheet trước
local_env = os.path.join(current_dir, '.env')
parent_env = os.path.join(parent_dir, '.env')

if os.path.exists(local_env):
    load_dotenv(local_env)
    print(f"📁 Loaded .env from: {local_env}")
elif os.path.exists(parent_env):
    load_dotenv(parent_env)
    print(f"📁 Loaded .env from: {parent_env}")
else:
    load_dotenv()  # Fallback to default
    print("⚠️ No .env file found, using environment variables")

# ================= CẤU HÌNH =================
app = Flask(__name__)

# Lấy biến môi trường
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_TOKEN")
SHEET_ID = os.environ.get("SHEET_ID")
BOT_PASSWORD = os.environ.get("BOT_PASSWORD")
SHEET_NAME = os.environ.get("SHEET_NAME", "product")  # Sheet chứa sản phẩm mới
USER_SHEET_NAME = os.environ.get("USER_SHEET_NAME", "users")
DB_URL = os.environ.get("DB_URL")  # MongoDB connection string

# Ưu tiên lấy biến SERVER_URL bạn vừa sửa, nếu không có thì lấy của Render
SERVER_URL = os.environ.get("SERVER_URL") or os.environ.get("RENDER_EXTERNAL_URL")

# ================= GIAO DIỆN GUI (HTML) =================
HTML_GUI = """
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>FansipanLab Bot Dashboard</title>
    <style>
        body { font-family: sans-serif; background-color: #121212; color: #fff; text-align: center; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; }
        .card { background: #1e1e1e; padding: 20px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #333; }
        h1 { color: #0088cc; }
        .btn { display: block; width: 100%; padding: 12px; margin: 10px 0; border-radius: 5px; text-decoration: none; color: white; font-weight: bold; }
        .btn-sheet { background: #0f9d58; }
        .btn-tele { background: #0088cc; }
        .status { color: #00c853; font-weight: bold; }
        .link-info { color: #888; font-size: 0.9em; word-break: break-all;}
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <h1>🤖 Bot FansipanLab</h1>
            <p>Trạng thái: <span class="status">● Đang chạy (Webhook)</span></p>
            <p class="link-info">Server URL: {{ server_url }}</p>
        </div>
        <div class="card">
            <a href="https://docs.google.com/spreadsheets/d/{{ sheet_id }}" target="_blank" class="btn btn-sheet">📊 Mở Google Sheet</a>
            <a href="https://t.me/noti_task_bot" target="_blank" class="btn btn-tele">💬 Chat với Bot</a>
        </div>
    </div>
</body>
</html>
"""

# ================= KẾT NỐI GOOGLE SHEET =================
def connect_sheet():
    try:
        json_creds = os.environ.get("GOOGLE_CREDENTIALS")
        if not json_creds: return None
        creds_dict = json.loads(json_creds)
        gc = gspread.service_account_from_dict(creds_dict)
        return gc.open_by_key(SHEET_ID)
    except Exception as e:
        print(f"❌ Sheet Error: {e}")
        return None

# ================= KẾT NỐI MONGODB =================
mongo_client = None
mongo_db = None

def connect_mongo():
    """Kết nối MongoDB và trả về database object"""
    global mongo_client, mongo_db
    if not DB_URL:
        return None
    try:
        if mongo_client is None:
            mongo_client = MongoClient(DB_URL)
            # Lấy tên database từ connection string
            mongo_db = mongo_client.get_default_database()
            print(f"✅ Đã kết nối MongoDB: {mongo_db.name}")
        return mongo_db
    except Exception as e:
        print(f"❌ MongoDB Error: {e}")
        return None

def monitor_mongodb(recipients):
    """Quét MongoDB tìm đơn hàng mới chưa thông báo và gửi Telegram"""
    db = connect_mongo()
    if not db:
        return
    
    try:
        # Tìm đơn hàng chưa thông báo, populate thông tin user và product
        pipeline = [
            {"$match": {"notified": {"$ne": True}}},
            {"$lookup": {
                "from": "users",
                "localField": "user",
                "foreignField": "_id",
                "as": "user_info"
            }},
            {"$lookup": {
                "from": "products",
                "localField": "product",
                "foreignField": "_id",
                "as": "product_info"
            }}
        ]
        
        orders = list(db.orders.aggregate(pipeline))
        
        if orders:
            print(f"🛒 Tìm thấy {len(orders)} đơn hàng mới chưa thông báo")
        
        for order in orders:
            user_info = order.get("user_info", [{}])[0] if order.get("user_info") else {}
            product_info = order.get("product_info", [{}])[0] if order.get("product_info") else {}
            
            # Format thời gian
            created_at = order.get("createdAt", datetime.now())
            if isinstance(created_at, datetime):
                time_str = created_at.strftime("%d/%m/%Y %H:%M:%S")
            else:
                time_str = str(created_at)
            
            # Format giá tiền
            price = order.get("totalPrice", 0)
            price_str = f"{price:,.0f}".replace(",", ".")
            
            msg = f"🛒 *ĐƠN HÀNG MỚI!*\n"
            msg += f"━━━━━━━━━━\n"
            msg += f"👤 *User:* {user_info.get('username', 'N/A')}\n"
            msg += f"📦 *Sản phẩm:* {product_info.get('name', 'N/A')}\n"
            msg += f"💰 *Giá:* {price_str} VND\n"
            msg += f"🕐 *Thời gian:* {time_str}\n"
            
            # Gửi cho tất cả subscribers trong Sheet "users"
            sent_count = 0
            for uid in recipients:
                send_telegram(uid, msg)
                sent_count += 1
            
            # Đánh dấu đã thông báo
            db.orders.update_one(
                {"_id": order["_id"]},
                {"$set": {"notified": True}}
            )
            print(f"✅ Đã thông báo đơn hàng {order['_id']} đến {sent_count} người")
            
    except Exception as e:
        print(f"⚠️ Lỗi quét MongoDB: {e}")

def send_telegram(chat_id, message):
    try:
        url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage"
        payload = {"chat_id": chat_id, "text": message, "parse_mode": "Markdown"}
        requests.post(url, json=payload)
    except Exception as e:
        print(f"❌ Send Error: {e}")

# ================= TỰ ĐỘNG CÀI ĐẶT WEBHOOK =================
def set_webhook_auto():
    if not SERVER_URL or not TELEGRAM_TOKEN:
        print("❌ Thiếu SERVER_URL hoặc TELEGRAM_TOKEN, bỏ qua set webhook.")
        return
    
    webhook_url = f"{SERVER_URL}/{TELEGRAM_TOKEN}"
    api_url = f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/setWebhook?url={webhook_url}"
    
    try:
        response = requests.get(api_url)
        if response.status_code == 200:
            print(f"✅ Đã set webhook thành công tới: {webhook_url}")
        else:
            print(f"❌ Lỗi set webhook: {response.text}")
    except Exception as e:
        print(f"❌ Lỗi kết nối Telegram: {e}")

# ================= BACKGROUND TASK (QUÉT SHEET + MONGODB) =================
def get_valid_rows(sheet):
    try:
        return [row for row in sheet.get_all_values() if any(cell.strip() for cell in row)]
    except: return []

def get_recipients_from_sheet():
    """Lấy danh sách Chat ID từ sheet users"""
    try:
        sh = connect_sheet()
        if not sh:
            return []
        sheet_users = sh.worksheet(USER_SHEET_NAME)
        users = sheet_users.get_all_values()
        # Bỏ qua header "Chat ID"
        recipients = [r[0] for r in users if r and r[0] and r[0] != "Chat ID"]
        return recipients
    except Exception as e:
        print(f"⚠️ Lỗi lấy recipients: {e}")
        return []

def save_product_to_mongodb(product_data):
    """Lưu sản phẩm mới từ Sheet vào MongoDB"""
    db = connect_mongo()
    if not db:
        return None
    
    try:
        # Tạo document product
        product = {
            "name": product_data.get("name", "Sản phẩm không tên"),
            "price": int(product_data.get("price", 0)),
            "description": product_data.get("description", ""),
            "image": product_data.get("image", "📦"),
            "createdAt": datetime.now(),
            "fromSheet": True  # Đánh dấu sản phẩm từ Sheet
        }
        
        result = db.products.insert_one(product)
        print(f"✅ Đã lưu sản phẩm vào MongoDB: {product['name']} (ID: {result.inserted_id})")
        return result.inserted_id
    except Exception as e:
        print(f"⚠️ Lỗi lưu product vào MongoDB: {e}")
        return None

def monitor_all():
    """Quét Google Sheet (product) và MongoDB (orders) để gửi thông báo"""
    print("👀 Đang giám sát Sheet (product) + MongoDB (orders)...")
    # Đợi 10s cho server khởi động ổn định
    time.sleep(10)
    
    # Khởi tạo kết nối
    sh = connect_sheet()
    last_rows_count = 0
    
    if sh:
        try:
            sheet_product = sh.worksheet(SHEET_NAME)
            last_rows_count = len(get_valid_rows(sheet_product))
            print(f"📊 Sheet '{SHEET_NAME}' - Dữ liệu ban đầu: {last_rows_count} dòng.")
        except Exception as e:
            print(f"⚠️ Lỗi đọc sheet ban đầu: {e}")
    
    # Kiểm tra kết nối MongoDB
    if DB_URL:
        db = connect_mongo()
        if db:
            # Đếm số đơn hàng chưa thông báo ban đầu
            pending_count = db.orders.count_documents({"notified": {"$ne": True}})
            print(f"📊 MongoDB - Đơn hàng chờ thông báo: {pending_count}")
    else:
        print("⚠️ Không có DB_URL, bỏ qua quét MongoDB")

    while True:
        try:
            # Lấy danh sách recipients từ Sheet "users"
            recipients = get_recipients_from_sheet()
            
            if recipients:
                # ========== 1. QUÉT MONGODB (Đơn hàng mới) ==========
                if DB_URL:
                    monitor_mongodb(recipients)
                
                # ========== 2. QUÉT GOOGLE SHEET (Sản phẩm mới) ==========
                sh = connect_sheet()
                if sh:
                    sheet_product = sh.worksheet(SHEET_NAME)
                    new_data = get_valid_rows(sheet_product)
                    new_rows_count = len(new_data)

                    if new_rows_count > last_rows_count:
                        print(f"🔥 Có {new_rows_count - last_rows_count} sản phẩm mới từ Sheet!")
                        
                        # Lấy headers từ dòng đầu tiên
                        headers = new_data[0] if new_data else []
                        
                        for i in range(last_rows_count, new_rows_count):
                            row = new_data[i]
                            
                            # Parse dữ liệu sản phẩm từ row
                            product_data = {}
                            for idx, cell in enumerate(row):
                                if idx < len(headers):
                                    header_lower = headers[idx].lower().strip()
                                    # Map các header phổ biến
                                    if header_lower in ["name", "tên", "tên sản phẩm", "ten san pham", "product name"]:
                                        product_data["name"] = cell.strip()
                                    elif header_lower in ["price", "giá", "gia", "giá tiền"]:
                                        # Loại bỏ ký tự không phải số
                                        price_str = ''.join(filter(str.isdigit, cell))
                                        product_data["price"] = int(price_str) if price_str else 0
                                    elif header_lower in ["description", "mô tả", "mo ta", "chi tiết"]:
                                        product_data["description"] = cell.strip()
                                    elif header_lower in ["image", "hình", "hinh", "ảnh", "emoji"]:
                                        product_data["image"] = cell.strip() if cell.strip() else "📦"
                            
                            # Nếu không parse được tên, dùng cột đầu tiên
                            if "name" not in product_data and row:
                                product_data["name"] = row[0].strip() if row[0] else f"Sản phẩm {i+1}"
                            
                            # Lưu vào MongoDB
                            product_id = save_product_to_mongodb(product_data)
                            
                            # Tạo message thông báo
                            price = product_data.get("price", 0)
                            price_str = f"{price:,.0f}".replace(",", ".") if price else "Liên hệ"
                            
                            msg = f"📦 *SẢN PHẨM MỚI!*\n━━━━━━━━━━\n"
                            msg += f"🏷️ *Tên:* {product_data.get('name', 'N/A')}\n"
                            msg += f"💰 *Giá:* {price_str} VND\n"
                            if product_data.get("description"):
                                msg += f"📝 *Mô tả:* {product_data.get('description')}\n"
                            msg += f"🕐 *Thời gian:* {datetime.now().strftime('%d/%m/%Y %H:%M:%S')}\n"
                            
                            if product_id:
                                msg += f"\n✅ Đã thêm vào hệ thống!"
                            
                            # Gửi thông báo đến tất cả subscribers
                            for uid in recipients:
                                send_telegram(uid, msg)
                            print(f"✅ Đã gửi thông báo sản phẩm '{product_data.get('name')}' đến {len(recipients)} người")
                        
                        last_rows_count = new_rows_count
            else:
                pass  # Không có recipients, bỏ qua
                
        except Exception as e:
            print(f"⚠️ Lỗi trong vòng lặp monitor: {e}")
        
        # Nghỉ 5 giây trước khi quét tiếp
        time.sleep(5)

# ================= ROUTE TRANG CHỦ =================
@app.route('/')
def index():
    return render_template_string(HTML_GUI, sheet_id=SHEET_ID, password=BOT_PASSWORD, server_url=SERVER_URL)

# ================= WEBHOOK (TELEGRAM GỌI VÀO) =================
@app.route(f'/{TELEGRAM_TOKEN}', methods=['POST'])
def respond():
    update = request.get_json()
    if update and "message" in update:
        msg = update["message"]
        chat_id = msg["chat"]["id"]
        chat_type = msg["chat"]["type"]
        text = msg.get("text", "").strip()
        name = msg["chat"].get("title") if "title" in msg["chat"] else msg["from"].get("first_name", "User")
        
        sh = connect_sheet()
        if sh:
            try:
                sheet_users = sh.worksheet(USER_SHEET_NAME)
                ids = sheet_users.col_values(1)
                
                if chat_type in ["group", "supergroup"]:
                    if str(chat_id) not in ids:
                        sheet_users.append_row([str(chat_id), name, "Group"])
                        send_telegram(chat_id, "✅ Group đã được đăng ký nhận thông báo!")
                        print(f"✅ Group mới đăng ký: {name} ({chat_id})")
                
                elif chat_type == "private":
                    if text == f"/login {BOT_PASSWORD}":
                        if str(chat_id) not in ids:
                            sheet_users.append_row([str(chat_id), name, "User"])
                            send_telegram(chat_id, "✅ Đăng ký thành công! Bạn sẽ nhận được thông báo khi có đơn hàng mới hoặc task mới.")
                            print(f"✅ User mới đăng ký: {name} ({chat_id})")
                        else:
                            send_telegram(chat_id, "⚠️ Bạn đã đăng ký rồi.")
                    elif text.startswith("/start"):
                        if str(chat_id) not in ids:
                            send_telegram(chat_id, f"🔒 Bot riêng tư.\n\nVui lòng đăng ký bằng lệnh:\n`/login {BOT_PASSWORD}`")
                        else:
                            send_telegram(chat_id, "👋 Bạn đang online và đã đăng ký nhận thông báo.")
            except Exception as e:
                print(f"Lỗi xử lý tin nhắn: {e}")
    return "OK", 200

# ================= CHẠY SERVER (QUAN TRỌNG) =================
if __name__ == "__main__":
    print("="*50)
    print("🚀 KHỞI ĐỘNG BOT THÔNG BÁO")
    print("="*50)
    print(f"📊 Sheet ID: {SHEET_ID}")
    print(f"🔗 MongoDB: {'Có' if DB_URL else 'Không'}")
    print(f"🤖 Telegram Bot: {'Có' if TELEGRAM_TOKEN else 'Không'}")
    print("="*50)
    
    # 1. Chạy luồng quét Google Sheet + MongoDB
    thread = Thread(target=monitor_all)
    thread.daemon = True  # Tắt thread khi app tắt
    thread.start()

    # 2. Tự động Set Webhook cho Telegram
    set_webhook_auto()

    # 3. Chạy Flask Server trên port của Render
    port = int(os.environ.get("PORT", 10000))
    print(f"\n🌐 Server đang chạy tại port {port}")
    app.run(host='0.0.0.0', port=port)