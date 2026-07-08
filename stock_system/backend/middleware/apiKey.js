import crypto from 'crypto';

// อ่านรายการ API key ที่อนุญาตจาก env (คั่นด้วย comma รองรับหลาย partner)
const loadKeys = () =>
  (process.env.PUBLIC_API_KEYS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

// เทียบสองสตริงแบบ timing-safe — คืน false ทันทีถ้ายาวไม่เท่ากัน
// (การเทียบด้วย === ปกติจะ leak ความยาว prefix ที่ตรงผ่านเวลาที่ใช้)
const safeEqual = (a, b) => {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
};

// Middleware: บังคับให้ทุก request แนบ header X-API-Key ที่ถูกต้อง
export const requireApiKey = (req, res, next) => {
  const allowedKeys = loadKeys();

  // ถ้ายังไม่ตั้ง PUBLIC_API_KEYS เลย → ปฏิเสธทุก request (กัน default เปิดโล่ง)
  if (allowedKeys.length === 0) {
    return res.status(503).json({ error: 'Public API not configured' });
  }

  const provided = req.headers['x-api-key'];
  if (!provided) {
    return res.status(401).json({ error: 'API key required' });
  }

  const matched = allowedKeys.some((key) => safeEqual(provided, key));
  if (!matched) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  next();
};
