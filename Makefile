-include .env

NAS_HOST   ?= 192.168.1.155
NAS_USER   ?= tawatchaiw
CONTEXT    ?= nas-tabienkub

.PHONY: help setup deploy logs down status pull

help:
	@echo ""
	@echo "  make setup    — สร้าง Docker SSH context ไปที่ NAS"
	@echo "  make deploy   — Build + Deploy ไปที่ NAS"
	@echo "  make logs     — ดู logs realtime"
	@echo "  make status   — ดูสถานะ containers"
	@echo "  make down     — หยุด stack บน NAS"
	@echo "  make pull     — Pull images ใหม่"
	@echo ""

setup:
	@if docker context inspect $(CONTEXT) > /dev/null 2>&1; then \
		echo "[INFO] Context '$(CONTEXT)' มีอยู่แล้ว"; \
	else \
		echo "[INFO] สร้าง Docker context..."; \
		docker context create $(CONTEXT) --docker "host=ssh://$(NAS_USER)@$(NAS_HOST)"; \
		echo "[INFO] Context '$(CONTEXT)' สร้างเสร็จ"; \
	fi

deploy: setup
	docker --context $(CONTEXT) compose -f docker-compose.yml -f docker-compose.nas.yml up --build -d
	@echo ""
	@echo "[INFO] Deploy สำเร็จ → https://$(NAS_HOST):9443"

logs: setup
	docker --context $(CONTEXT) compose -f docker-compose.yml -f docker-compose.nas.yml logs -f

status: setup
	docker --context $(CONTEXT) compose -f docker-compose.yml -f docker-compose.nas.yml ps

down: setup
	docker --context $(CONTEXT) compose -f docker-compose.yml -f docker-compose.nas.yml down

pull: setup
	docker --context $(CONTEXT) compose -f docker-compose.yml -f docker-compose.nas.yml pull
