/**
 * Google Sheets Integration Service
 * Thay thế hoàn toàn logic Python gspread bằng Node.js
 */

const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

// Biến môi trường
const SHEET_ID = process.env.SHEET_ID;
const SHEET_NAME = process.env.SHEET_NAME || 'product';
const USER_SHEET_NAME = process.env.USER_SHEET_NAME || 'users';

let doc = null;

/**
 * Khởi tạo kết nối Google Sheets
 */
async function connectSheet() {
    if (doc) return doc;
    
    try {
        // Lấy credentials từ biến môi trường
        const credsJson = process.env.GOOGLE_CREDENTIALS;
        if (!credsJson) {
            console.log('⚠️ Không có GOOGLE_CREDENTIALS, bỏ qua Google Sheets');
            return null;
        }
        
        const creds = JSON.parse(credsJson);
        
        // Tạo JWT auth
        const serviceAccountAuth = new JWT({
            email: creds.client_email,
            key: creds.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets']
        });
        
        // Kết nối spreadsheet
        doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        
        console.log(`✅ Đã kết nối Google Sheet: ${doc.title}`);
        return doc;
    } catch (err) {
        console.error('❌ Lỗi kết nối Google Sheet:', err.message);
        return null;
    }
}

/**
 * Lấy danh sách Chat ID từ sheet users
 * @returns {Promise<Array<{chatId: string, name: string, type: string}>>}
 */
async function getRecipientsFromSheet() {
    try {
        const doc = await connectSheet();
        if (!doc) return [];
        
        const sheet = doc.sheetsByTitle[USER_SHEET_NAME];
        if (!sheet) {
            console.log(`⚠️ Không tìm thấy sheet "${USER_SHEET_NAME}"`);
            return [];
        }
        
        const rows = await sheet.getRows();
        const recipients = [];
        
        for (const row of rows) {
            const chatId = row.get('Chat ID') || row._rawData[0];
            if (chatId && chatId !== 'Chat ID') {
                recipients.push({
                    chatId: chatId.toString(),
                    name: row.get('Name') || row._rawData[1] || 'Unknown',
                    type: row.get('Type') || row._rawData[2] || 'User'
                });
            }
        }
        
        return recipients;
    } catch (err) {
        console.error('⚠️ Lỗi lấy recipients từ Sheet:', err.message);
        return [];
    }
}

/**
 * Thêm user mới vào sheet users
 * @param {string} chatId 
 * @param {string} name 
 * @param {string} type - 'User' hoặc 'Group'
 */
async function addUserToSheet(chatId, name, type = 'User') {
    try {
        const doc = await connectSheet();
        if (!doc) return false;
        
        const sheet = doc.sheetsByTitle[USER_SHEET_NAME];
        if (!sheet) {
            console.log(`⚠️ Không tìm thấy sheet "${USER_SHEET_NAME}"`);
            return false;
        }
        
        // Kiểm tra đã tồn tại chưa
        const rows = await sheet.getRows();
        const exists = rows.some(row => {
            const id = row.get('Chat ID') || row._rawData[0];
            return id && id.toString() === chatId.toString();
        });
        
        if (exists) {
            return false; // Đã tồn tại
        }
        
        // Thêm row mới
        await sheet.addRow({
            'Chat ID': chatId.toString(),
            'Name': name,
            'Type': type
        });
        
        console.log(`✅ Đã thêm ${type}: ${name} (${chatId}) vào Sheet`);
        return true;
    } catch (err) {
        console.error('⚠️ Lỗi thêm user vào Sheet:', err.message);
        return false;
    }
}

/**
 * Kiểm tra user đã đăng ký chưa
 * @param {string} chatId 
 */
async function isUserRegistered(chatId) {
    try {
        const doc = await connectSheet();
        if (!doc) return false;
        
        const sheet = doc.sheetsByTitle[USER_SHEET_NAME];
        if (!sheet) return false;
        
        const rows = await sheet.getRows();
        return rows.some(row => {
            const id = row.get('Chat ID') || row._rawData[0];
            return id && id.toString() === chatId.toString();
        });
    } catch (err) {
        console.error('⚠️ Lỗi kiểm tra user:', err.message);
        return false;
    }
}

/**
 * Lấy danh sách sản phẩm từ sheet product
 * Cấu trúc sheet: Dấu thời gian | Tên sản phẩm | Giá tiền
 * @returns {Promise<Array>}
 */
async function getProductsFromSheet() {
    try {
        const doc = await connectSheet();
        if (!doc) return [];
        
        const sheet = doc.sheetsByTitle[SHEET_NAME];
        if (!sheet) {
            console.log(`⚠️ Không tìm thấy sheet "${SHEET_NAME}"`);
            return [];
        }
        
        // Đảm bảo load đầy đủ header rows
        await sheet.loadHeaderRow();
        console.log(`📋 Sheet headers: ${sheet.headerValues.join(', ')}`);
        
        const rows = await sheet.getRows();
        const products = [];
        
        console.log(`📊 Đọc được ${rows.length} dòng từ Sheet "${SHEET_NAME}"`);
        
        for (const row of rows) {
            // Cấu trúc: Cột 0 = Dấu thời gian, Cột 1 = Tên sản phẩm, Cột 2 = Giá tiền
            const timestamp = row._rawData[0] || '';
            const name = row._rawData[1] || '';
            const priceRaw = row._rawData[2] || '0';
            
            // Parse giá (chỉ lấy số)
            const price = parseInt(priceRaw.toString().replace(/\D/g, '')) || 0;
            
            console.log(`  - Row ${row.rowNumber}: name="${name}", price=${price}`);
            
            if (name && name.trim()) {
                products.push({
                    timestamp: timestamp.toString().trim(),
                    name: name.toString().trim(),
                    price,
                    rowIndex: row.rowNumber
                });
            }
        }
        
        console.log(`✅ Tổng cộng ${products.length} sản phẩm hợp lệ`);
        return products;
    } catch (err) {
        console.error('⚠️ Lỗi lấy products từ Sheet:', err.message);
        return [];
    }
}

/**
 * Đếm số dòng hợp lệ trong sheet product
 */
async function getProductRowCount() {
    try {
        const doc = await connectSheet();
        if (!doc) return 0;
        
        const sheet = doc.sheetsByTitle[SHEET_NAME];
        if (!sheet) return 0;
        
        const rows = await sheet.getRows();
        return rows.length;
    } catch (err) {
        console.error('⚠️ Lỗi đếm rows:', err.message);
        return 0;
    }
}

module.exports = {
    connectSheet,
    getRecipientsFromSheet,
    addUserToSheet,
    isUserRegistered,
    getProductsFromSheet,
    getProductRowCount
};
