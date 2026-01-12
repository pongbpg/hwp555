/**
 * Helper เพื่ออ่าน .env จาก root directory ของ project
 * ใช้ได้เฉพาะ Development เท่านั้น
 * 
 * ตอน Production: ใช้ environment variables ที่ set ไว้แล้ว (ไม่ต้อง load .env)
 * 
 * วิธีใช้:
 * import { loadEnv } from './loadEnv.js';
 * loadEnv();  // หรือ loadEnv('../../..');
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

export function loadEnv(relativePathToRoot = '../..') {
  // ✅ ใช้เฉพาะ development
  const isDev = process.env.NODE_ENV !== 'production';
  
  if (!isDev) {
    // Production: ข้ามการ load .env file
    console.log('ℹ️  Production mode - skipping .env file loading');
    return { parsed: {} };
  }
  
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const rootDir = path.resolve(__dirname, relativePathToRoot);
  
  const result = dotenv.config({ 
    path: path.join(rootDir, '.env') 
  });
  
  if (result.error && result.error.code !== 'ENOENT') {
    console.warn('⚠️  Warning: Could not load .env file from', path.join(rootDir, '.env'));
  }
  
  return result;
}

export default loadEnv;
