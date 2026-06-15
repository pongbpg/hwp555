# เอกสารโปรเจกต์ HWP555

รวมเอกสารวิเคราะห์/แก้บั๊ก/คู่มือ ที่เดิมกระจัดกระจายอยู่ที่ root folder
จัดกลุ่มและตั้งชื่อใหม่ตามเนื้องานจริง

## 🩹 การแก้บั๊ก (fix-)

| ไฟล์ | เนื้อหา |
|------|---------|
| [fix-order-cancellation-logic.md](fix-order-cancellation-logic.md) | แก้ logic การยกเลิก Order ที่ผิดพลาด 3 ประเภท |
| [fix-backend-cost-calculation-on-cancel.md](fix-backend-cost-calculation-on-cancel.md) | ให้ backend คำนวณต้นทุนจาก batch อัตโนมัติ (ตอนยกเลิกขายแล้ว unitCost = 0) |
| [fix-movements-before-after-quantity.md](fix-movements-before-after-quantity.md) | แก้ยอดก่อน/หลัง (previousStock/newStock) ในหน้า Movements |
| [fix-movements-from-cancelled-orders.md](fix-movements-from-cancelled-orders.md) | แก้ movements จาก order ที่ยกเลิกแล้วยังแสดงอยู่ |
| [fix-previousstock-exclude-incoming.md](fix-previousstock-exclude-incoming.md) | แก้ previousStock ที่รวม incoming (ของสั่งที่ยังไม่รับ) เข้าไปผิด |
| [fix-stock-alert-line-insights-mismatch.md](fix-stock-alert-line-insights-mismatch.md) | แก้ยอดแจ้งเตือนไม่ตรงกันระหว่าง LINE กับ Insights |
| [fix-stock-inconsistency-movement-vs-dashboard.md](fix-stock-inconsistency-movement-vs-dashboard.md) | แก้สต็อกไม่ตรงกันระหว่าง Movement กับ Dashboard/Insights |

## 📘 คู่มือ (guide-)

| ไฟล์ | เนื้อหา |
|------|---------|
| [guide-migration-stock-batches.md](guide-migration-stock-batches.md) | คู่มือ migration ระบบ stock batches (ใช้ซ้ำได้) |
| [guide-sku-naming-formula.md](guide-sku-naming-formula.md) | สูตรการตั้งชื่อรหัสสินค้า (SKU) — convention ที่ใช้ทุกครั้งที่เพิ่มสินค้า |

## 📝 แผน (plan-)

| ไฟล์ | เนื้อหา |
|------|---------|
| [plan-fix-preorder-stock-drift.md](plan-fix-preorder-stock-drift.md) | runbook วิเคราะห์/ซ่อมสต็อกเพี้ยนจาก preorder + chain-gap detection (scan-drift.mjs, fix-injected-stock.mjs) |

---

> หมายเหตุ:
> - `README.md` หลักของโปรเจกต์ยังอยู่ที่ root ตามธรรมเนียม
> - ลบเอกสารที่ไม่จำเป็นแล้วออก 3 ไฟล์ (2026-06-08): คู่มือ deploy Railway (ย้ายไป deploy บน NAS แล้ว),
>   สคริปต์ backup MongoDB เดิม (แทนด้วย `backup-mongo-nas.sh` + ระบบ backup&restore ใหม่),
>   และ summary การทำสูตร SKU (ซ้ำกับ guide-sku-naming-formula.md)
