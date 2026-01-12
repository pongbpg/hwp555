#!/usr/bin/env node
/**
 * Template สำหรับ scripts ใหม่
 * ใช้ helper loadEnv เพื่อหา .env จากรูท
 */

import { loadEnv } from '../utils/loadEnv.js';

// ✅ อ่าน .env จาก root directory โดยอัตโนมัติ
loadEnv('../../..');

// ตัวอย่าง
console.log('MONGODB_URI:', process.env.MONGODB_URI);
console.log('JWT_SECRET:', process.env.JWT_SECRET ? '✅ (set)' : '❌ (not set)');
