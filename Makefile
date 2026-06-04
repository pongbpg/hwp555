# ============================================================================
#  HWP555 — Deploy & operate the Docker stack on the NAS over SSH
#
#  ตั้งค่าใน .env :  NAS_HOST=<ip>  NAS_USER=<user>  NAS_PATH=<source dir>
#                   BACKUP_DIR=<backup dir นอก NAS_PATH>
#  ใช้งาน        :  make            -> แสดงรายการคำสั่งทั้งหมด
#                   make deploy     -> sync ซอร์ส + build + start บน NAS
#
#  *** ใช้ tar-over-ssh ไม่ใช่ rsync *** (rsync บน Ugreen NAS setuid root แล้ว fail)
# ============================================================================

SHELL := /bin/bash

# ---- อ่านค่าจาก .env (เฉพาะที่ต้องใช้ — ไม่ include ทั้งไฟล์เพื่อเลี่ยง parse error) ----
NAS_HOST     := $(shell grep -E '^NAS_HOST=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'\''' )
NAS_USER     := $(shell grep -E '^NAS_USER=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'\''' )
NAS_PATH     := $(shell grep -E '^NAS_PATH=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'\''' )
NAS_SSH_PORT := $(shell grep -E '^NAS_SSH_PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'\''' )
# BACKUP_DIR ต้องอยู่ "นอก" REMOTE_DIR — ไม่งั้น staging swap ลบทิ้งทุก deploy (ดู nas-docker-deploy ข้อ 10)
BACKUP_DIR   := $(shell grep -E '^BACKUP_DIR=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'\''' )
MONGO_USER   := $(shell grep -E '^MONGO_ROOT_USERNAME=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'\''' )
MONGO_PASS   := $(shell grep -E '^MONGO_ROOT_PASSWORD=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'\''' )

# โฟลเดอร์ปลายทางบน NAS (override ได้: make deploy REMOTE_DIR=/volume1/docker/hwp555)
REMOTE_DIR ?= $(if $(NAS_PATH),$(NAS_PATH),/home/$(NAS_USER)/hwp555)
# parent dir + basename — ใช้ลบ .old/.new ผ่าน docker (root) กัน permission denied
REMOTE_PARENT := $(patsubst %/,%,$(dir $(REMOTE_DIR)))
REMOTE_BASE   := $(notdir $(REMOTE_DIR))

# ค่า default ของ Mongo (override ใน .env ได้)
MONGO_USER := $(if $(MONGO_USER),$(MONGO_USER),root)
MONGO_PASS := $(if $(MONGO_PASS),$(MONGO_PASS),password)
MONGO_CONTAINER := hwp555-mongodb
# container ที่ทำ backup — mount /backups (=BACKUP_DIR) ไว้ และรันเป็น root
# จึงเขียน/อ่านไฟล์ backup ที่ Docker สร้าง dir เป็น root ได้ (user ssh เขียนไม่ได้)
BACKUP_CONTAINER := hwp555-mongo-backup

# ชื่อ compose project — ใช้ -p คงที่ให้ network/volume เป็นชื่อเดิมเสมอ
# pin -f docker-compose.yml ชัดเจน — บน NAS มี docker-compose.yaml (สำหรับ GUI) อยู่ด้วย
# ไม่งั้น docker compose จะ warn "Found multiple config files" ทุกคำสั่ง
PROJECT  ?= hwp555
COMPOSE  := docker compose -p $(PROJECT) -f docker-compose.yml

# SSH (รองรับพอร์ตกำหนดเองผ่าน NAS_SSH_PORT)
SSH_PORT := $(if $(NAS_SSH_PORT),$(NAS_SSH_PORT),22)
SSH      := ssh -p $(SSH_PORT) $(NAS_USER)@$(NAS_HOST)
SSH_TTY  := ssh -t -p $(SSH_PORT) $(NAS_USER)@$(NAS_HOST)

# service ที่จะ target สำหรับ logs/restart (ว่าง = ทุก service) เช่น: make logs SERVICE=stock-backend
SERVICE  ?=

# รัน docker compose บน NAS ในโฟลเดอร์ปลายทาง
define REMOTE
$(SSH) 'cd $(REMOTE_DIR) && $(COMPOSE) $(1)'
endef
define REMOTE_TTY
$(SSH_TTY) 'cd $(REMOTE_DIR) && $(COMPOSE) $(1)'
endef

# ===== ไฟล์/โฟลเดอร์ที่ไม่ sync ขึ้น NAS =====
TAR_EXCLUDES := \
	--exclude='./.git' \
	--exclude='node_modules' \
	--exclude='dist' \
	--exclude='build' \
	--exclude='.next' \
	--exclude='out' \
	--exclude='coverage' \
	--exclude='*.log' \
	--exclude='*.DS_Store' \
	--exclude='._*'

.DEFAULT_GOAL := help
.PHONY: help check-env deploy sync build up rebuild start stop restart \
        shutdown down status ps logs backup restore restore-list ssh prune

# ----------------------------------------------------------------------------
help: ## แสดงคำสั่งทั้งหมด
	@echo ""
	@echo "  HWP555 — NAS Docker control  (NAS: $(NAS_USER)@$(NAS_HOST):$(REMOTE_DIR))"
	@echo "  ─────────────────────────────────────────────────────────────"
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN{FS=":.*## "}{printf "  \033[1m%-13s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  ตัวอย่าง:  make deploy                    (sync + build + start)"
	@echo "            make logs SERVICE=stock-backend  (ดู log เฉพาะ service)"
	@echo "            make restart SERVICE=cloudflared"
	@echo ""

check-env: ## ตรวจว่ามี NAS_HOST / NAS_USER ใน .env แล้ว
	@if [ -z "$(NAS_HOST)" ] || [ -z "$(NAS_USER)" ]; then \
		echo "✗ ไม่พบ NAS_HOST หรือ NAS_USER ใน .env"; \
		echo "  เพิ่มบรรทัด:  NAS_HOST=192.168.x.x   และ   NAS_USER=<user>"; \
		exit 1; \
	fi
	@echo "✓ NAS = $(NAS_USER)@$(NAS_HOST):$(SSH_PORT)  →  $(REMOTE_DIR)"

# ----------------------------------------------------------------------------
deploy: check-env sync ## ⭐ Deploy เต็มรูปแบบ: sync ซอร์ส + build + start บน NAS
	@echo "▶ building & starting stack บน NAS ..."
	@$(call REMOTE_TTY,up -d --build)
	@echo "✓ deploy เสร็จแล้ว — เช็คสถานะด้วย: make status"

sync: check-env ## คัดลอกซอร์ส (รวม .env) ขึ้น NAS ด้วย tar-over-ssh (staging swap)
	@echo "▶ syncing → $(NAS_USER)@$(NAS_HOST):$(REMOTE_DIR)"
	@# ล้าง staging เก่าผ่าน docker (root) — เผื่อมีไฟล์ root-owned ค้าง
	@$(SSH) 'docker run --rm -v "$(REMOTE_PARENT)":/w alpine rm -rf "/w/$(REMOTE_BASE).new" "/w/$(REMOTE_BASE).old" >/dev/null 2>&1; mkdir -p "$(REMOTE_DIR).new"'
	@COPYFILE_DISABLE=1 tar czf - $(TAR_EXCLUDES) . | $(SSH) 'tar xzf - -C "$(REMOTE_DIR).new"'
	@$(SSH) 'set -e; if [ -d "$(REMOTE_DIR)" ]; then mv "$(REMOTE_DIR)" "$(REMOTE_DIR).old"; fi; mv "$(REMOTE_DIR).new" "$(REMOTE_DIR)"'
	@$(SSH) 'docker run --rm -v "$(REMOTE_PARENT)":/w alpine rm -rf "/w/$(REMOTE_BASE).old" >/dev/null 2>&1 || true'
	@# NAS Container Manager/Portainer มองหา docker-compose.yaml (.yaml) — swap ลบทิ้งทุกครั้ง
	@# จึงสร้างสดหลัง swap จาก .yml ต้นฉบับ (repo เก็บ .yml ไฟล์เดียว, .yaml ไม่มีวันหาย)
	@$(SSH) 'cp "$(REMOTE_DIR)/docker-compose.yml" "$(REMOTE_DIR)/docker-compose.yaml"'
	@echo "✓ sync เสร็จ"

build: check-env ## build images บน NAS (ไม่ start)
	@$(call REMOTE_TTY,build)

up: check-env ## สร้าง + start containers (ไม่ rebuild)
	@$(call REMOTE,up -d)
	@echo "✓ ทุก service กำลังทำงาน"

rebuild: check-env ## rebuild + start (เหมือน deploy แต่ไม่ sync ใหม่)
	@$(call REMOTE_TTY,up -d --build)

start: check-env ## start containers ที่ถูก stop ไว้
	@$(call REMOTE,start $(SERVICE))

stop: check-env ## stop containers (คงไว้ ไม่ลบ — start กลับได้)
	@$(call REMOTE,stop $(SERVICE))

restart: check-env ## restart containers (เพิ่ม SERVICE=... เพื่อเจาะ)
	@$(call REMOTE,restart $(SERVICE))

shutdown: check-env ## หยุด + ลบ containers (ข้อมูลใน volume ยังอยู่)
	@$(call REMOTE,down)
	@echo "✓ stack ถูกปิดแล้ว (volume ยังอยู่)"

down: shutdown ## alias ของ shutdown

status: check-env ## ดูสถานะ containers
	@$(call REMOTE,ps)

ps: status ## alias ของ status

logs: check-env ## ดู log แบบ follow (เพิ่ม SERVICE=stock-backend เพื่อเจาะ)
	@$(call REMOTE_TTY,logs -f --tail=100 $(SERVICE))

# ----------------------------------------------------------------------------
# *** Backup/Restore MongoDB — BACKUP_DIR ต้องอยู่ "นอก" REMOTE_DIR (ตั้งใน .env) ***
backup: check-env ## backup MongoDB ทันที → $(BACKUP_DIR)
	@if [ -z "$(BACKUP_DIR)" ]; then echo "✗ ตั้ง BACKUP_DIR ใน .env ก่อน (path นอก NAS_PATH)"; exit 1; fi
	@echo "▶ backup MongoDB → $(BACKUP_DIR) ..."
	@# เขียนผ่าน backup container (root) — mongodump --archive=PATH เขียนไฟล์เองใน /backups
	@$(SSH) 'D=$$(date +%Y-%m-%d_%H%M); docker exec $(BACKUP_CONTAINER) mongodump \
		--uri="mongodb://$(MONGO_USER):$(MONGO_PASS)@mongodb:27017/?authSource=admin" \
		--gzip --archive=/backups/db-$$D.gz \
		&& echo "✓ backup เสร็จ → db-$$D.gz" || echo "✗ backup ล้มเหลว"'

restore-list: check-env ## ดูรายการ backup ทั้งหมดบน NAS
	@$(SSH) 'ls -1ht "$(BACKUP_DIR)"/db-*.gz 2>/dev/null | while read f; do echo "  $$f  ($$(du -sh "$$f" | cut -f1))"; done' || echo "  (ไม่พบไฟล์ backup)"

restore: check-env ## restore MongoDB จาก backup ล่าสุด (หรือ make restore FILE=ชื่อไฟล์)
	@FILE="$(FILE)"; \
	if [ -z "$$FILE" ]; then FILE=$$($(SSH) 'ls -1t "$(BACKUP_DIR)"/db-*.gz 2>/dev/null | head -1'); fi; \
	if [ -z "$$FILE" ]; then echo "✗ ไม่พบไฟล์ backup ใน $(BACKUP_DIR)"; exit 1; fi; \
	BASE=$$(basename "$$FILE"); \
	echo "⚠ การ restore จะ OVERWRITE ข้อมูลทั้งหมดใน MongoDB!"; echo "  ไฟล์: $$BASE"; \
	read -p "  พิมพ์ 'yes' เพื่อยืนยัน: " c; [ "$$c" = "yes" ] || { echo "ยกเลิก"; exit 0; }; \
	$(SSH) "docker exec $(BACKUP_CONTAINER) mongorestore \
		--uri='mongodb://$(MONGO_USER):$(MONGO_PASS)@mongodb:27017/?authSource=admin' \
		--gzip --archive=/backups/$$BASE --drop" \
	&& echo "✓ restore เสร็จ" || echo "✗ restore ล้มเหลว"

ssh: check-env ## เปิด SSH session ไปที่ NAS (เข้าโฟลเดอร์โปรเจกต์)
	@$(SSH_TTY) 'cd $(REMOTE_DIR); exec $$SHELL -l'

prune: check-env ## ลบ image/build cache เก่าบน NAS (กันดิสก์เต็ม)
	@$(SSH) 'docker image prune -f && docker builder prune -f'
	@echo "✓ ล้าง image/cache เก่าแล้ว"
