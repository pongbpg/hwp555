#!/bin/bash

# --- ตั้งค่า ---
# ใส่ URL จาก Railway (ห้ามลืมเปลี่ยนตรงนี้!)
MONGO_URI="mongodb://mongo:YOUR_PASSWORD@roundhouse.proxy.rlwy.net:54321"

# โฟลเดอร์ที่จะเก็บไฟล์ backup
BACKUP_DIR="/root/mongo-backups"

# ตั้งชื่อไฟล์ตามวันที่ เวลา (เช่น db-2023-10-25_1400.gz)
DATE_VAL=$(date +"%Y-%m-%d_%H%M")
FILENAME="$BACKUP_DIR/db-$DATE_VAL.gz"

# --- เริ่มทำงาน ---
# 1. สร้างโฟลเดอร์ถ้ายังไม่มี
mkdir -p $BACKUP_DIR

# 2. ทำการ Dump ข้อมูล (บีบอัดเป็น Gzip)
echo "Starting backup to $FILENAME..."
mongodump --uri="$MONGO_URI" --gzip --archive="$FILENAME"


# 3. ลบไฟล์ที่เก่ากว่า 7 วันทิ้ง (ป้องกัน Disk เต็ม)
find $BACKUP_DIR -type f -name "*.gz" -mtime +7 -delete

echo "Backup finished and old files cleaned."


##### crontab on ubuntu
crontab -e

# เลื่อนลงไปบรรทัดล่างสุด แล้วเพิ่มบรรทัดนี้:
0 3 * * * /root/backup-mongo.sh >> /root/backup.log 2>&1




# รูปแบบคำสั่ง
mongorestore --uri="MONGO_URI_ของ_RAILWAY" --gzip --archive="/root/mongo-backups/ชื่อไฟล์.gz" --drop


mongodump --uri="mongodb://mongo:KTlBvUhGjEidMDEKLAzevAVCOATaiNsU@gondola.proxy.rlwy.net:33948/" --gzip --archive="db-2026-03-26_2010.gz"
mongodump --uri="mongodb://localhost:27017/test" --gzip --archive="db-2026-03-26_2010z.gz"
mongorestore --uri="mongodb://localhost:27017/test" --gzip --archive="db-2026-03-26_2010.gz" --drop
mongorestore --uri="mongodb://mongo:KTlBvUhGjEidMDEKLAzevAVCOATaiNsU@gondola.proxy.rlwy.net:33948/" --gzip --archive="db-2026-03-26_2010z.gz" --drop