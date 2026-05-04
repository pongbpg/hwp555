#!/bin/bash
# =============================================================================
# backup-mongo-nas.sh
# Script สำรอง: สำหรับรันบน NAS host โดยตรง (ไม่ต้องใช้ Docker service)
#
# ใช้กับ Synology Task Scheduler:
#   1. Control Panel → Task Scheduler → Create → Scheduled Task → User-defined script
#   2. ตั้งเวลา: ทุกวัน 03:00 น.
#   3. ใส่ script path: /volume1/docker/hwp555/backup-mongo-nas.sh
#   4. อย่าลืม chmod +x ไฟล์นี้ก่อน
#
# หรือใช้ crontab บน Linux NAS:
#   0 3 * * * /volume1/docker/hwp555/backup-mongo-nas.sh >> /volume1/docker/hwp555/backups/backup.log 2>&1
# =============================================================================

# --- ตั้งค่า ---
MONGO_CONTAINER="hwp555-mongodb"
MONGO_USER="${MONGO_ROOT_USERNAME:-root}"
MONGO_PASS="${MONGO_ROOT_PASSWORD:-password}"

BACKUP_DIR="/volume1/docker/hwp555/backups"
KEEP_DAYS=7

# --- เริ่มทำงาน ---
DATE_VAL=$(date +"%Y-%m-%d_%H%M")
FILENAME="$BACKUP_DIR/db-$DATE_VAL.gz"

echo "[$(date)] ===== HWP555 MongoDB Backup ====="
mkdir -p "$BACKUP_DIR"

# ตรวจสอบว่า container กำลังทำงานอยู่
if ! docker inspect -f '{{.State.Running}}' "$MONGO_CONTAINER" 2>/dev/null | grep -q "true"; then
  echo "[$(date)] ERROR: Container '$MONGO_CONTAINER' ไม่ได้กำลังทำงาน!"
  exit 1
fi

# ทำ backup ผ่าน docker exec
echo "[$(date)] กำลัง backup → $FILENAME"
docker exec "$MONGO_CONTAINER" mongodump \
  --uri="mongodb://$MONGO_USER:$MONGO_PASS@localhost:27017/?authSource=admin" \
  --gzip \
  --archive \
  > "$FILENAME"

if [ $? -eq 0 ]; then
  SIZE=$(du -sh "$FILENAME" | cut -f1)
  echo "[$(date)] Backup สำเร็จ: $FILENAME ($SIZE)"
else
  echo "[$(date)] ERROR: Backup ล้มเหลว!"
  rm -f "$FILENAME"
  exit 1
fi

# ลบ backup เก่ากว่า $KEEP_DAYS วัน
echo "[$(date)] ลบ backup เก่ากว่า $KEEP_DAYS วัน..."
find "$BACKUP_DIR" -name "db-*.gz" -mtime +$KEEP_DAYS -delete

echo "[$(date)] เสร็จสิ้น"
echo "======================================="
