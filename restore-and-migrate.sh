#!/bin/bash

# Script สำหรับ restore database และรัน migration ใหม่

set -e  # หยุดทันทีเมื่อเจอ error

echo "================================"
echo "🔄 Restore & Re-migrate Script"
echo "================================"

# สี
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ตรวจสอบว่ามี backup folder หรือไม่
if [ ! -d "backup-before-migration" ]; then
    echo -e "${RED}❌ ไม่พบโฟลเดอร์ backup-before-migration${NC}"
    echo -e "${YELLOW}   กรุณาระบุชื่อ backup folder ที่ต้องการ restore${NC}"
    exit 1
fi

echo -e "\n${CYAN}📦 พบ backup folder: backup-before-migration${NC}"

# ถามยืนยัน
echo -e "\n${YELLOW}⚠️  คำเตือน: การ restore จะลบข้อมูลปัจจุบันทั้งหมด!${NC}"
read -p "ต้องการดำเนินการต่อหรือไม่? (yes/no): " answer

if [ "$answer" != "yes" ] && [ "$answer" != "y" ]; then
    echo -e "${YELLOW}❌ ยกเลิกการ restore${NC}"
    exit 0
fi

# อ่าน MONGODB_URI จาก .env
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ ไม่พบไฟล์ .env${NC}"
    exit 1
fi

export $(cat .env | grep MONGODB_URI | xargs)

if [ -z "$MONGODB_URI" ]; then
    echo -e "${RED}❌ ไม่พบ MONGODB_URI ใน .env${NC}"
    exit 1
fi

echo -e "\n${CYAN}📡 กำลัง restore database...${NC}"
mongorestore --uri="$MONGODB_URI" --drop ./backup-before-migration

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Restore สำเร็จ${NC}"
else
    echo -e "${RED}❌ Restore ล้มเหลว${NC}"
    exit 1
fi

echo -e "\n${CYAN}🔍 กำลังรัน migration (dry-run)...${NC}"
cd stock_system/backend
node migrate-fix-stock-batches.mjs --dry-run

echo -e "\n${YELLOW}ตรวจสอบผลลัพธ์ dry-run ข้างบน${NC}"
read -p "ต้องการรัน migration จริงหรือไม่? (yes/no): " migrate_answer

if [ "$migrate_answer" != "yes" ] && [ "$migrate_answer" != "y" ]; then
    echo -e "${YELLOW}❌ ยกเลิกการ migrate${NC}"
    exit 0
fi

echo -e "\n${CYAN}💾 กำลังรัน migration จริง...${NC}"
node migrate-fix-stock-batches.mjs --force

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}✅ Migration สำเร็จ!${NC}"
    echo -e "${CYAN}📄 ตรวจสอบ log file: stock_system/backend/migration-log-*.json${NC}"
else
    echo -e "${RED}❌ Migration ล้มเหลว${NC}"
    exit 1
fi

echo -e "\n================================"
echo -e "${GREEN}✅ เสร็จสิ้น${NC}"
echo -e "================================"
