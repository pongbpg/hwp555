# HR Management System

ระบบจัดการทรัพยากรมนุษย์สำหรับองค์กรขนาด 10-20 คน

## ฟีเจอร์หลัก

- **จัดการพนักงาน** - เพิ่ม แก้ไข ลบ และดูข้อมูลพนักงาน
- **การขาด/ลา/มาสาย** - บันทึกการมาทำงาน ลา และมาสายของพนักงาน
- **KPI Scores** - ประเมินผลงานพนักงานด้วยหลายตัวชี้วัด
- **จัดการเงินเดือน** - คำนวณและติดตามการจ่ายเงินเดือน

## โครงสร้าง

```
hr_system/
├── backend/          # Node.js + Express API Server
│   ├── models/       # Database schemas
│   ├── routes/       # API endpoints
│   ├── server.js     # Main server file
│   └── package.json
├── frontend/         # React Web Application
│   ├── src/
│   │   ├── pages/    # Page components
│   │   ├── App.jsx
│   │   └── api.js    # API client
│   └── package.json
└── README.md
```

## เริ่มต้นใช้งาน

### Backend Setup

1. ติดตั้ง Node.js dependencies:
```bash
cd backend
npm install
```

2. สร้างไฟล์ .env:
```bash
cp .env.example .env
```

3. ตรวจสอบว่า MongoDB กำลังทำงาน (หรือแก้ไข MONGODB_URI ใน .env)

4. รัน server:
```bash
npm run dev
```

Server จะรัน at `http://localhost:5000`

### Frontend Setup

1. ติดตั้ง dependencies:
```bash
cd frontend
npm install
```

2. สร้างไฟล์ .env:
```bash
cp .env.example .env
```

3. รัน development server:
```bash
npm start
```

Application จะเปิดที่ `http://localhost:3000`

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Register

### Employees
- `GET /api/employees` - Get all employees
- `GET /api/employees/:id` - Get employee by ID
- `POST /api/employees` - Create employee
- `PUT /api/employees/:id` - Update employee
- `DELETE /api/employees/:id` - Delete employee

### Attendance
- `GET /api/attendance` - Get all attendance records
- `GET /api/attendance/employee/:id` - Get by employee
- `POST /api/attendance` - Create record
- `PUT /api/attendance/:id` - Update record
- `DELETE /api/attendance/:id` - Delete record

### KPI
- `GET /api/kpi` - Get all KPI records
- `GET /api/kpi/employee/:id` - Get by employee
- `POST /api/kpi` - Create KPI record
- `PUT /api/kpi/:id` - Update KPI record
- `DELETE /api/kpi/:id` - Delete KPI record

### Salary
- `GET /api/salary` - Get all salary records
- `GET /api/salary/employee/:id` - Get by employee
- `POST /api/salary` - Create salary record
- `PUT /api/salary/:id` - Update salary record
- `DELETE /api/salary/:id` - Delete salary record

## Technologies Used

### Backend
- Node.js
- Express.js
- MongoDB + Mongoose
- JWT for authentication
- bcryptjs for password hashing

### Frontend
- React 18
- React Router v6
- Axios for API calls
- Tailwind CSS for styling
- Recharts for data visualization (optional)

## Database Models

### Employee
- firstName, lastName
- email (unique)
- phone
- position
- department
- salary
- hireDate
- status (active/inactive/on-leave)
- password

### Attendance
- employeeId
- date
- status (present/absent/late/leave)
- checkInTime
- checkOutTime
- leaveType
- notes

### KPI
- employeeId
- month, year
- score (0-100)
- metrics (productivity, quality, teamwork, punctuality)
- comments
- evaluatedBy

### Salary
- employeeId
- month, year
- baseSalary
- bonus
- allowance
- deductions
- grossSalary
- netSalary
- status (pending/approved/paid)
- notes

## การใช้งานทั่วไป

1. **เข้าสู่ระบบ** - ใช้ email และ password
2. **เพิ่มพนักงาน** - ไปที่ Employees และเพิ่มข้อมูลพนักงานใหม่
3. **บันทึกการขาด/ลา** - ไปที่ Attendance และบันทึกการมาทำงาน
4. **ประเมิน KPI** - ไปที่ KPI และประเมินผลงานพนักงาน
5. **จัดการเงินเดือน** - ไปที่ Salary และคำนวณเงินเดือน

## Notes
- ระบบใช้ JWT tokens เก็บไว้ใน localStorage
- Passwords ได้รับการเข้ารหัสด้วย bcryptjs
- CORS enabled สำหรับการเชื่อมต่อระหว่าง frontend และ backend
