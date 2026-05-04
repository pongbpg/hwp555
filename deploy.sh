#!/bin/bash
# ============================================================
# deploy.sh — Build local แล้ว deploy ไปรันบน NAS
# ============================================================
# ต้องการ: Docker Desktop (local), SSH เปิดอยู่บน NAS
# วิธีใช้:
#   ./deploy.sh          → build + deploy
#   ./deploy.sh logs     → ดู logs
#   ./deploy.sh down     → หยุด stack
#   ./deploy.sh status   → ดูสถานะ containers
# ============================================================

set -e

# โหลดค่าจาก .env (ถ้ามี)
[ -f ".env" ] && set -a && source .env && set +a

# ── Config ────────────────────────────────────────────────
NAS_HOST="${NAS_HOST:-192.168.1.155}"
NAS_USER="${NAS_USER:-tawatchaiw}"
NAS_SSH_PORT="${NAS_SSH_PORT:-22}"
CONTEXT_NAME="nas-hwp555"
STACK_DIR="/volume1/docker/hwp555"   # path บน NAS ที่เก็บ source / env
# ─────────────────────────────────────────────────────────

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

# ── 1. ตรวจสอบ Docker context ────────────────────────────
setup_context() {
  if docker context inspect "${CONTEXT_NAME}" &>/dev/null; then
    info "Docker context '${CONTEXT_NAME}' มีอยู่แล้ว"
  else
    info "สร้าง Docker context สำหรับ NAS (SSH)..."
    docker context create "${CONTEXT_NAME}" \
      --docker "host=ssh://${NAS_USER}@${NAS_HOST}:${NAS_SSH_PORT}"
    info "Context '${CONTEXT_NAME}' สร้างเสร็จ"
  fi
}

# ── 2. ส่ง .env ไปวางบน NAS (ถ้ามี) ─────────────────────
sync_env() {
  if [ -f ".env" ]; then
    info "ส่ง .env ไปที่ NAS:${STACK_DIR}/.env ..."
    ssh -p "${NAS_SSH_PORT}" "${NAS_USER}@${NAS_HOST}" "mkdir -p ${STACK_DIR}"
    scp -P "${NAS_SSH_PORT}" .env "${NAS_USER}@${NAS_HOST}:${STACK_DIR}/.env"
  else
    warn "ไม่พบ .env ในโปรเจกต์ (ข้ามขั้นตอน sync)"
  fi
}

# ── 3. Build & Deploy ────────────────────────────────────
deploy() {
  info "Building images และ deploy ไปที่ NAS (${NAS_HOST})..."
  docker --context "${CONTEXT_NAME}" compose -f docker-compose.yml -f docker-compose.nas.yml up --build -d
  info "Deploy สำเร็จ! ✓"
  echo ""
  info "สถานะ containers บน NAS:"
  docker --context "${CONTEXT_NAME}" compose ps
  echo ""
  info "เปิด Portainer เพื่อดู stack: https://${NAS_HOST}:9443"
}

# ── Sub-commands ─────────────────────────────────────────
COMPOSE_FILES="-f docker-compose.yml -f docker-compose.nas.yml"
BACKUP_DIR="${STACK_DIR}/backups"
MONGO_CONTAINER="hwp555-mongodb"

cmd_logs()   { docker --context "${CONTEXT_NAME}" compose ${COMPOSE_FILES} logs -f; }
cmd_down()   { docker --context "${CONTEXT_NAME}" compose ${COMPOSE_FILES} down; info "Stack หยุดแล้ว"; }
cmd_status() { docker --context "${CONTEXT_NAME}" compose ${COMPOSE_FILES} ps; }
cmd_pull()   { docker --context "${CONTEXT_NAME}" compose ${COMPOSE_FILES} pull; }

cmd_backup() {
  info "สั่ง backup ทันทีบน NAS..."
  MONGO_USER="${MONGO_ROOT_USERNAME:-root}"
  MONGO_PASS="${MONGO_ROOT_PASSWORD:-password}"
  DATE_VAL=$(date +"%Y-%m-%d_%H%M")
  OUTFILE="${BACKUP_DIR}/db-${DATE_VAL}.gz"
  ssh -p "${NAS_SSH_PORT}" "${NAS_USER}@${NAS_HOST}" \
    "mkdir -p '${BACKUP_DIR}' && \
     docker exec ${MONGO_CONTAINER} mongodump \
       --uri='mongodb://${MONGO_USER}:${MONGO_PASS}@localhost:27017/?authSource=admin' \
       --gzip --archive \
     > '${OUTFILE}' \
     && echo 'Backup สำเร็จ: ${OUTFILE}' \
     || echo 'Backup ล้มเหลว!'"
}

cmd_restore() {
  MONGO_USER="${MONGO_ROOT_USERNAME:-root}"
  MONGO_PASS="${MONGO_ROOT_PASSWORD:-password}"
  SELECTED_FILE="${2:-}"

  if [ -n "${SELECTED_FILE}" ]; then
    # ── กรณีระบุชื่อไฟล์มาโดยตรง ──────────────────────────
    # รองรับทั้ง: ชื่อไฟล์สั้น (db-2026-05-04_0300.gz) หรือ full path
    if [[ "${SELECTED_FILE}" != /* ]]; then
      SELECTED_FILE="${BACKUP_DIR}/${SELECTED_FILE}"
    fi
    # ตรวจสอบว่าไฟล์มีอยู่บน NAS
    ssh -p "${NAS_SSH_PORT}" "${NAS_USER}@${NAS_HOST}" \
      "test -f '${SELECTED_FILE}'" \
      || error "ไม่พบไฟล์: ${SELECTED_FILE} บน NAS"
    TARGET_FILE="${SELECTED_FILE}"
  else
    # ── กรณีไม่ระบุ → แสดง list ให้เลือก ─────────────────
    info "กำลังดึงรายการ backup จาก NAS (${BACKUP_DIR})..."
    FILES=$(ssh -p "${NAS_SSH_PORT}" "${NAS_USER}@${NAS_HOST}" \
      "ls -1t '${BACKUP_DIR}'/db-*.gz 2>/dev/null")

    if [ -z "${FILES}" ]; then
      error "ไม่พบไฟล์ backup ใน ${BACKUP_DIR} บน NAS"
    fi

    echo ""
    echo "  รายการ backup ที่มี:"
    echo "  ─────────────────────────────────────────"
    i=1
    declare -a FILE_LIST
    while IFS= read -r f; do
      SIZE=$(ssh -p "${NAS_SSH_PORT}" "${NAS_USER}@${NAS_HOST}" \
        "du -sh '${f}' 2>/dev/null | cut -f1")
      printf "  [%2d] %-40s %s\n" "$i" "$(basename ${f})" "(${SIZE})"
      FILE_LIST[$i]="${f}"
      ((i++))
    done <<< "${FILES}"
    echo "  ─────────────────────────────────────────"
    echo ""
    echo -n "  เลือกหมายเลข (กด Enter เพื่อใช้ล่าสุด [1]): "
    read -r CHOICE
    CHOICE="${CHOICE:-1}"

    if ! [[ "${CHOICE}" =~ ^[0-9]+$ ]] || [ "${CHOICE}" -lt 1 ] || [ "${CHOICE}" -ge "${i}" ]; then
      error "หมายเลขไม่ถูกต้อง: ${CHOICE}"
    fi
    TARGET_FILE="${FILE_LIST[${CHOICE}]}"
  fi

  echo ""
  warn "จะ restore จากไฟล์: $(basename ${TARGET_FILE})"
  warn "⚠️  ข้อมูลปัจจุบันใน MongoDB จะถูกแทนที่ด้วยข้อมูลจาก backup!"
  echo -n "พิมพ์ 'yes' เพื่อยืนยัน: "
  read -r CONFIRM
  if [ "${CONFIRM}" != "yes" ]; then
    warn "ยกเลิกการ restore"
    return 0
  fi

  info "กำลัง restore จาก ${TARGET_FILE} ..."
  ssh -p "${NAS_SSH_PORT}" "${NAS_USER}@${NAS_HOST}" \
    "cat '${TARGET_FILE}' | docker exec -i ${MONGO_CONTAINER} mongorestore \
       --uri='mongodb://${MONGO_USER}:${MONGO_PASS}@localhost:27017/?authSource=admin' \
       --gzip --archive --drop \
     && echo 'Restore สำเร็จ!' \
     || echo 'Restore ล้มเหลว!'"
  info "Restore เสร็จสิ้น ✓"
}

cmd_list_backups() {
  info "รายการ backup บน NAS (${BACKUP_DIR}):"
  ssh -p "${NAS_SSH_PORT}" "${NAS_USER}@${NAS_HOST}" \
    "ls -lht '${BACKUP_DIR}'/db-*.gz 2>/dev/null || echo 'ไม่พบไฟล์ backup'"
}

# ── Main ─────────────────────────────────────────────────
case "${1:-deploy}" in
  deploy|"")
    setup_context
    sync_env
    deploy
    ;;
  logs)         setup_context; cmd_logs ;;
  down)         setup_context; cmd_down ;;
  status)       setup_context; cmd_status ;;
  pull)         setup_context; cmd_pull ;;
  context)      setup_context ;;
  backup)       setup_context; cmd_backup ;;
  restore)      setup_context; cmd_restore "$@" ;;
  backups)      setup_context; cmd_list_backups ;;
  *)
    echo "Usage: $0 [deploy|logs|down|status|pull|context|backup|restore|backups]"
    echo ""
    echo "  deploy   — build & deploy ไปที่ NAS"
    echo "  logs     — ดู logs ทุก service"
    echo "  down     — หยุด stack"
    echo "  status   — ดูสถานะ containers"
    echo "  backup   — สั่ง backup ทันทีบน NAS"
    echo "  restore  — restore จาก backup ล่าสุด หรือระบุชื่อไฟล์ได้ เช่น: restore db-2026-05-04_0300.gz"
    echo "  backups  — ดูรายการ backup ทั้งหมดบน NAS"
    exit 1
    ;;
esac
