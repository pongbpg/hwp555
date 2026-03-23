#!/bin/bash

# --- ตั้งค่า ---
# ใส่ URL จาก Railway (ห้ามลืมเปลี่ยนตรงนี้!)
MONGO_URI="mongodb://mongo:<PASSWORD>@containers-us-west-123.railway.app:5432/dbname"

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