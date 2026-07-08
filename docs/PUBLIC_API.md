# Public Stock API

API สำหรับให้ระบบภายนอก (partner / B2B) อ่าน catalog สินค้าจาก stock_system

> **หลักประกันความลับ:** API นี้ **ไม่มีวันส่งออก** ราคาต้นทุน (`cost`), ซัพพลายเออร์
> (`supplier`), ข้อมูล batch, ยอดจอง (`committed`), ของกำลังเข้า (`incoming`) หรือข้อมูลผู้แก้ไข
> ทุก response ถูกประกอบขึ้นจาก **whitelist** ของฟิลด์ที่อนุญาตเท่านั้น

---

## Base URL

```
https://stock-api.storewerk.com/api/public/v1
```

(ภายในเครือข่าย/ตอน dev: `http://<host>:3002/api/public/v1`)

## Authentication

ทุก request ต้องแนบ header:

```
X-API-Key: <your-api-key>
```

- คีย์ถูกตั้งใน env `PUBLIC_API_KEYS` (คั่นหลายคีย์ด้วย comma รองรับหลาย partner)
- gen คีย์ใหม่: `openssl rand -hex 32`

| สถานการณ์ | HTTP status | body |
|---|---|---|
| ไม่แนบ `X-API-Key` | `401` | `{ "error": "API key required" }` |
| คีย์ไม่ถูกต้อง | `403` | `{ "error": "Invalid API key" }` |
| ยังไม่ตั้ง `PUBLIC_API_KEYS` บน server | `503` | `{ "error": "Public API not configured" }` |
| ยิงถี่เกิน limit | `429` | `{ "error": "Too many requests" }` |

**Rate limit:** 60 requests / นาที / API key

---

## Endpoints

### `GET /products`
รายการสินค้า (เฉพาะที่ `status = active` เท่านั้น)

| Query | ค่าเริ่มต้น | คำอธิบาย |
|---|---|---|
| `q` | – | ค้นหาจากชื่อ / SKU / แบรนด์ / tag |
| `category` | – | กรองตามหมวดหมู่ (ตรงตัว) |
| `page` | `1` | หน้าที่ต้องการ |
| `limit` | `20` | จำนวนต่อหน้า (สูงสุด `100`) |
| `fields` | ทั้งหมด | เลือกฟิลด์ที่จะรับ (ดูหัวข้อ Field selection) |

**ตัวอย่าง**

```bash
curl -H "X-API-Key: $KEY" \
  "https://stock-api.storewerk.com/api/public/v1/products?q=เสื้อ&limit=10"
```

```json
{
  "data": [
    {
      "id": "665...",
      "name": "เสื้อยืดคอกลม",
      "sku": "TS-001",
      "description": "ผ้าฝ้าย 100%",
      "category": "เสื้อผ้า",
      "brand": "StoreWerk",
      "unit": "ตัว",
      "tags": ["cotton", "unisex"],
      "status": "active",
      "variants": [
        {
          "id": "665...",
          "name": "สีดำ / M",
          "sku": "TS-001-BLK-M",
          "barcode": "8850000000001",
          "model": "",
          "attributes": { "color": "ดำ", "size": "M" },
          "price": 290,
          "status": "active",
          "stockOnHand": 42,
          "inStock": true,
          "stockStatus": "in-stock"
        }
      ]
    }
  ],
  "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
}
```

### `GET /products/:id`
สินค้ารายตัวจาก product id — คืน `404` ถ้าไม่พบ / id ไม่ถูกต้อง / ไม่ใช่ active
รูปแบบ response: `{ "data": { ...product } }`

### `GET /products/sku/:sku`
หาสินค้าจาก SKU (จับได้ทั้ง SKU ระดับ product และระดับ variant) — คืน `404` ถ้าไม่พบ
รูปแบบ response: `{ "data": { ...product } }`

---

## Field selection (`?fields=`)

ส่งรายชื่อฟิลด์คั่นด้วย comma เพื่อรับเฉพาะที่ต้องการ เช่น `?fields=name,price,stock`
ฟิลด์นอกรายการที่อนุญาตจะถูก **เมินเงียบ** (ไม่ error, ไม่หลุดข้อมูล)

> `id` (ระดับ product/variant) และ array `variants` ติดมาเสมอเพื่อใช้อ้างอิง

**ฟิลด์ระดับ product:** `name`, `sku`, `description`, `category`, `brand`, `unit`, `tags`, `status`

> `category` และ `brand` ส่งออกเป็น **ชื่อ** (แปลงจาก id ภายในให้อัตโนมัติ) เช่น `"ชุดกระชับสัดส่วน"`, `"XSARA"`

**ฟิลด์ระดับ variant:** `name`, `sku`, `barcode`, `model`, `attributes`, `price`, `status`,
`stockOnHand`, `inStock`, `stockStatus`

**ชื่อย่อ (alias):**

| alias | ขยายเป็น |
|---|---|
| `price` | `price` |
| `stock` | `stockOnHand`, `inStock`, `stockStatus` |

`stockStatus` มีค่า: `out-of-stock` · `low-stock` · `warning` · `in-stock`

**ตัวอย่าง** — รับแค่ชื่อ ราคา และสถานะสต็อก:

```bash
curl -H "X-API-Key: $KEY" \
  "https://stock-api.storewerk.com/api/public/v1/products?fields=name,price,stock"
```

---

## ฟิลด์ที่ไม่ถูกส่งออกเด็ดขาด

`cost` · `variant.cost` · `batches` (ทั้งก้อน) · `supplier` · `consumptionOrder` ·
`committed` · `incoming` · `reorderPoint` · `reorderQty` · `createdBy` · `updatedBy`
