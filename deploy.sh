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
cmd_logs()   { docker --context "${CONTEXT_NAME}" compose ${COMPOSE_FILES} logs -f; }
cmd_down()   { docker --context "${CONTEXT_NAME}" compose ${COMPOSE_FILES} down; info "Stack หยุดแล้ว"; }
cmd_status() { docker --context "${CONTEXT_NAME}" compose ${COMPOSE_FILES} ps; }
cmd_pull()   { docker --context "${CONTEXT_NAME}" compose ${COMPOSE_FILES} pull; }

# ── Main ─────────────────────────────────────────────────
case "${1:-deploy}" in
  deploy|"")
    setup_context
    sync_env
    deploy
    ;;
  logs)    setup_context; cmd_logs ;;
  down)    setup_context; cmd_down ;;
  status)  setup_context; cmd_status ;;
  pull)    setup_context; cmd_pull ;;
  context) setup_context ;;
  *)
    echo "Usage: $0 [deploy|logs|down|status|pull|context]"
    exit 1
    ;;
esac
