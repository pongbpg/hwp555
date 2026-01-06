# Railway.app Deployment Guide - Sale System Backend

## 📋 ขั้นตอนการ Deploy

### 1️⃣ **สร้างบัญชี Railway.app**
```bash
# ไปที่ https://railway.app
# สร้างบัญชี GitHub หรือ Email
```

### 2️⃣ **สร้างโปรเจกต์ใหม่บน Railway**

1. ไปที่ [Railway Dashboard](https://railway.app/dashboard)
2. คลิก **"New Project"**
3. เลือก **"Deploy from GitHub"**
4. เชื่อมต่อ GitHub repository ของคุณ
5. เลือก repo: `HWP555`

### 3️⃣ **เพิ่ม Service สำหรับ Sale System Backend**

1. ในโปรเจกต์ Railway ให้คลิก **"New Service"**
2. เลือก **"Deploy from GitHub Repo"**
3. เลือก directory: `sale_system/backend`
4. คลิก **"Deploy"**

### 4️⃣ **ตั้งค่า Environment Variables**

ในหน้า Service ให้ไปที่ **Variables** แล้วเพิ่มตัวแปรดังนี้:

```env
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/sale_db

# Facebook OAuth
FACEBOOK_APP_ID=your_app_id
FACEBOOK_APP_SECRET=your_app_secret
FACEBOOK_REDIRECT_URI=https://your-railway-domain.railway.app/api/facebook/callback
FACEBOOK_WEBHOOK_VERIFY_TOKEN=your_random_token_here

# Node Environment
NODE_ENV=production

# Server
PORT=5002
HOST=0.0.0.0
```

### 5️⃣ **ได้ Domain URL จาก Railway**

1. ไปที่ Service settings
2. ดู **Domains** section
3. คัดลอก domain (เช่น: `sale-system-backend.railway.app`)
4. นี่คือ URL ของ backend

### 6️⃣ **อัพเดท Facebook App Settings**

ไปที่ [Facebook Developers](https://developers.facebook.com/apps) แล้วอัพเดท:

```
App Domains:
- sale-system-backend.railway.app
- sale-system-frontend.vercel.app (ถ้ามี)

Valid OAuth Redirect URIs:
- https://sale-system-backend.railway.app/api/facebook/callback

Privacy Policy URL:
- https://sale-system-backend.railway.app/privacy-policy.html

Terms of Service URL:
- https://sale-system-backend.railway.app/terms-of-service.html
```

### 7️⃣ **ตั้งค่า Webhook (Facebook)**

ในหน้า [Facebook Developers > Products > Messenger > Settings](https://developers.facebook.com) ให้ตั้งค่า:

```
Callback URL: https://sale-system-backend.railway.app/api/webhook/facebook
Verify Token: your_random_token_here (ต้องตรงกับ FACEBOOK_WEBHOOK_VERIFY_TOKEN)
```

### 8️⃣ **ตรวจสอบ Build Logs**

ใน Railway Dashboard ให้ไปที่ **Deployments** แล้วดู logs:

```
✅ Build successful
✅ Deployment successful
✅ Service running
```

### 9️⃣ **ทดสอบ Health Check**

```bash
curl https://sale-system-backend.railway.app/api/health
# ควรได้: {"status":"OK","timestamp":"..."}
```

## 🔐 ที่มาของตัวแปร

### MongoDB URI
```
# ได้จาก MongoDB Atlas
mongodb+srv://user:password@cluster-name.mongodb.net/database_name?retryWrites=true&w=majority
```

### Facebook App Credentials
1. ไปที่ [Facebook Developers](https://developers.facebook.com/apps)
2. เลือก App
3. ไปที่ **Settings > Basic**
4. คัดลอก **App ID** และ **App Secret**

### Random Token สำหรับ Webhook
```bash
# สร้าง random token
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 🚀 Update หลังจาก Deploy

ทุกครั้งที่ push code ไป GitHub:
1. Railway จะ **auto-detect** การเปลี่ยนแปลง
2. **Auto-build** และ **auto-deploy** อัตโนมัติ
3. ไม่ต้องทำอะไรเพิ่มเติม

## ❌ Troubleshooting

### Build Failed
```
❌ npm install ล้มเหลว
→ ตรวจสอบ package.json
→ ตรวจสอบ dependency ทั้งหมด

❌ Port นั้นต่าง
→ ตัวแปร PORT ต้องเป็น 5002
→ HOST ต้องเป็น 0.0.0.0
```

### Deployment Failed
```
❌ Missing environment variable
→ เพิ่มใน Railway Variables

❌ Cannot connect to MongoDB
→ ตรวจสอบ MONGODB_URI
→ Whitelist IP ใน MongoDB Atlas
```

### Facebook OAuth Not Working
```
❌ Invalid redirect URI
→ อัพเดท FACEBOOK_REDIRECT_URI
→ อัพเดท Facebook App Settings

❌ Cannot connect to webhook
→ ตรวจสอบ Callback URL
→ ตรวจสอบ Verify Token
```

## 📊 Monitor Logs

```bash
# ใน Railway Dashboard
Deployments > ชื่อ deployment > View Logs

# ดู real-time logs
tail -f logs
```

## 💡 Tips

- ✅ ทำการ test เก่า localhost ก่อน deploy
- ✅ ใช้ secrets manager สำหรับ sensitive data
- ✅ ตรวจสอบ logs บ่อยๆ
- ✅ ใช้ MongoDB Atlas free tier (512MB)
- ✅ Railway ให้ free tier ด้วย

## 🎯 Next Steps

หลังจาก backend deploy สำเร็จ:

1. Deploy Frontend ไปที่ **Vercel** หรือ **Railway** ด้วย
2. อัพเดท `VITE_SALE_API_BASE_URL` ให้ชี้ไปที่ Railway domain
3. ทดสอบ Facebook OAuth ใหม่จาก production

---

**สำเร็จ!** 🎉 ตอนนี้ Sale System Backend ใช้งานได้ online แล้ว
