# HWP555 - HR & Stock Management Systems

## 📋 โครงสร้างโปรเจกต์

โปรเจกต์นี้ประกอบด้วย 2 ระบบหลัก:
- **HR System** - ระบบจัดการทรัพยากรบุคคล (พนักงาน, เช็คชื่อ, KPI, เงินเดือน)
- **Stock System** - ระบบจัดการสินค้าคงคลัง (สินค้า, คำสั่งซื้อ, สถิติ)

## 🚀 วิธีการรัน

### ติดตั้ง Dependencies ทั้งหมด (ครั้งแรกเท่านั้น)

```bash
npm run install:all
```

### รันทั้งหมดพร้อมกัน (Backend + Frontend ทั้ง 2 ระบบ)

```bash
npm run dev
```

คำสั่งนี้จะรัน:
- HR Backend → http://localhost:5000
- HR Frontend → http://localhost:3000
- Stock Backend → http://localhost:5001
- Stock Frontend → http://localhost:5173

### รันแค่ Backend หรือ Frontend

```bash
# รันเฉพาะ Backend ทั้ง 2 ตัว
npm run dev:backend

# รันเฉพาะ Frontend ทั้ง 2 ตัว
npm run dev:frontend
```

### รันแยกระบบ

```bash
# HR System
npm run hr:backend
npm run hr:frontend

# Stock System
npm run stock:backend
npm run stock:frontend
```

## ⚙️ การตั้งค่า Environment Variables

### 1. คัดลอกไฟล์ตัวอย่าง

```bash
cp .env.example .env
```

### 2. แก้ไขไฟล์ `.env` (อยู่ที่ root)

```bash
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/database_name
JWT_SECRET=your_strong_secret_key_here

# Ports
HR_PORT=5000
STOCK_PORT=5001
```

**สำคัญ:** แทนที่ `<db_password>` ด้วยรหัสผ่านจริงของคุณ

## 🗂️ โครงสร้างไฟล์

```
HWP555/
├── .env                      # ⚠️ ไฟล์ config (ไม่ push ขึ้น git)
├── .env.example              # ✅ ตัวอย่างสำหรับ commit
├── .gitignore                # ไฟล์ที่ต้อง ignore
├── package.json              # Scripts สำหรับรันทั้งหมด
├── README.md                 # เอกสารนี้
│
├── hr_system/
│   ├── backend/
│   │   ├── server.js         # HR API Server (Port 5000)
│   │   ├── models/           # Employee, Attendance, KPI, Salary
│   │   ├── routes/           # API routes
│   │   └── package.json
│   └── frontend/
│       ├── src/              # React App
│       └── package.json
│
└── stock_system/
    ├── backend/
    │   ├── server.js         # Stock API Server (Port 5001)
    │   ├── models/           # Product, InventoryOrder
    │   ├── routes/           # API routes
    │   └── package.json
    └── frontend/
        ├── src/              # React + Vite App
        └── package.json
```

## 🔧 คำสั่งอื่นๆ

```bash
# Build สำหรับ Production
npm run build

# Build แยกระบบ
npm run build:hr
npm run build:stock
```

## 📦 Technologies

### Backend
- Node.js + Express
- MongoDB + Mongoose
- JWT Authentication
- bcrypt

### Frontend
- React
- Axios
- TailwindCSS (HR)
- Vite (Stock)

## 🔐 Security

- ไฟล์ `.env` ถูก ignore ใน git แล้ว
- ห้าม commit รหัสผ่านหรือ secret keys
- ใช้ `.env.example` เป็นเทมเพลตเท่านั้น

## 🐛 Troubleshooting

### Port ถูกใช้งานอยู่แล้ว

```bash
# ดู process ที่ใช้ port
lsof -i :5000
lsof -i :5001

# ปิด process
kill -9 <PID>
```

### ไม่สามารถเชื่อมต่อ MongoDB

- ตรวจสอบ `MONGODB_URI` ใน `.env`
- ตรวจสอบ IP whitelist ใน MongoDB Atlas
- ตรวจสอบรหัสผ่าน database

## 📝 License

ISC
