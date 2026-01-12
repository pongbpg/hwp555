#!/usr/bin/env node

import axios from 'axios';

const API_BASE = 'http://localhost:5001/api';
const TOKEN = process.env.AUTH_TOKEN || '';

const api = axios.create({
  baseURL: API_BASE,
  headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}
});

const log = (label, data) => {
  console.log(`\n${label}:`);
  console.log(JSON.stringify(data, null, 2));
};

async function main() {
  try {
    if (!TOKEN) {
      console.log('⚠️  No AUTH_TOKEN provided. Set it with: export AUTH_TOKEN="your-token"');
      console.log('Getting latest movements without auth...\n');
    }

    // Get recent movements
    const response = await api.get('/movements?limit=20&page=1');
    const movements = response.data.movements || [];

    if (movements.length === 0) {
      console.log('❌ No movements found');
      return;
    }

    console.log(`\n📊 Analyzing ${movements.length} recent movements...\n`);

    let totalErrors = 0;
    let checkedCount = 0;

    // Group by SKU
    const byType = {};
    movements.forEach(mov => {
      if (!byType[mov.movementType]) byType[mov.movementType] = [];
      byType[mov.movementType].push(mov);
    });

    // Check calculations
    for (const type of Object.keys(byType)) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Movement Type: ${type.toUpperCase()}`);
      console.log(`${'='.repeat(60)}`);

      for (const mov of byType[type].slice(0, 5)) {
        const calculated = mov.previousStock + mov.quantity;
        const isCorrect = Math.abs(calculated - mov.newStock) < 0.01;
        
        checkedCount++;
        
        if (!isCorrect) {
          totalErrors++;
          console.log(`\n❌ ERROR: ${mov.sku}`);
          console.log(`   Previous: ${mov.previousStock}`);
          console.log(`   Quantity: ${mov.quantity}`);
          console.log(`   Expected: ${calculated}`);
          console.log(`   Actual:   ${mov.newStock}`);
          console.log(`   Diff:     ${mov.newStock - calculated}`);
        } else {
          console.log(`\n✅ OK: ${mov.sku}`);
          console.log(`   ${mov.previousStock} ${mov.quantity > 0 ? '+' : ''}${mov.quantity} = ${mov.newStock}`);
        }
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`\n📈 Summary:`);
    console.log(`   Checked: ${checkedCount}`);
    console.log(`   Errors:  ${totalErrors}`);
    console.log(`   Rate:    ${((checkedCount - totalErrors) / checkedCount * 100).toFixed(1)}% correct`);

    if (totalErrors === 0) {
      console.log(`\n✨ All movements are correct!`);
    } else {
      console.log(`\n⚠️  Found ${totalErrors} calculation errors`);
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data?.error || error.message);
    process.exit(1);
  }
}

main();
