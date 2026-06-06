import { loadEnv } from '../utils/loadEnv.js';
loadEnv('../../..');
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import StockMovement from '../models/StockMovement.js';

let uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/hwp555';
if (!/authSource=/.test(uri)) uri += (uri.includes('?') ? '&' : '?') + 'authSource=admin';

await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
console.log('connected\n');

const products = await Product.find();
let affected = 0;
const results = [];
for (const product of products) {
  for (const v of product.variants || []) {
    const movs = await StockMovement.find({ variantId: v._id }).sort({ createdAt: 1 }).lean();
    if (movs.length === 0) continue;
    // CHAIN-GAP: sum of mismatches between consecutive movements (prev[i] != new[i-1]).
    // This isolates the buggy-receive injection and is immune to cancellations
    // (cancel reverses batches without a counter-movement, so it does NOT create an in-chain gap).
    let injected = 0;
    const gaps = [];
    for (let i = 1; i < movs.length; i++) {
      const gap = (movs[i].previousStock || 0) - (movs[i - 1].newStock || 0);
      if (gap !== 0) {
        injected += gap;
        gaps.push({ at: movs[i].createdAt, gap, afterType: movs[i - 1].movementType, afterRef: movs[i - 1].reference });
      }
    }
    if (injected === 0) continue;
    const batchSum = (v.batches || []).reduce((s, b) => s + (b.quantity || 0), 0);
    const correct = batchSum - injected;
    affected++;
    results.push({ sku: v.sku, batchSum, injected, correct, gaps });
    console.log(`SKU ${v.sku}: batchSum=${batchSum} injectedError=${injected>0?'+':''}${injected} => correctStock=${correct}`);
    for (const g of gaps) {
      console.log(`    gap ${g.gap>0?'+':''}${g.gap} after ${g.afterType} ${g.afterRef||''} @${new Date(g.at).toISOString().slice(0,16)}`);
    }
  }
}
console.log(`\nTotal variants with injected error: ${affected}`);
await mongoose.disconnect();
