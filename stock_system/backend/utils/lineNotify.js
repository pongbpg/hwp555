/**
 * LINE Notification Utility
 * ใช้สำหรับส่งการแจ้งเตือนไปยัง LINE Notify หรือ LINE Messaging API
 */

import https from 'https';

/**
 * ส่งข้อความแจ้งเตือนผ่าน LINE Notify
 * @param {string} message - ข้อความที่ต้องการส่ง
 * @param {string} token - LINE Notify Access Token (ถ้าไม่ระบุจะใช้จาก env)
 * @returns {Promise<object>}
 */
export const sendLineNotify = async (message, token = null) => {
  const accessToken = token || process.env.LINE_NOTIFY_TOKEN;

  if (!accessToken) {
    console.warn('LINE_NOTIFY_TOKEN is not configured');
    return { success: false, error: 'LINE_NOTIFY_TOKEN not configured' };
  }

  const postData = `message=${encodeURIComponent(message)}`;

  const options = {
    hostname: 'notify-api.line.me',
    path: '/api/notify',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Bearer ${accessToken}`,
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (res.statusCode === 200) {
            console.log('✅ LINE Notify sent successfully');
            resolve({ success: true, response });
          } else {
            console.error('❌ LINE Notify failed:', response);
            resolve({ success: false, error: response.message || 'Unknown error' });
          }
        } catch (e) {
          resolve({ success: false, error: 'Failed to parse response' });
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ LINE Notify error:', error.message);
      resolve({ success: false, error: error.message });
    });

    req.write(postData);
    req.end();
  });
};

/**
 * ส่งข้อความผ่าน LINE Messaging API (Push Message)
 * สำหรับ LINE Official Account / Chatbot
 * @param {string} userId - LINE User ID หรือ Group ID
 * @param {object|string} message - ข้อความหรือ message object
 * @param {string} channelToken - Channel Access Token (ถ้าไม่ระบุจะใช้จาก env)
 * @returns {Promise<object>}
 */
export const sendLineMessage = async (userId, message, channelToken = null) => {
  const token = channelToken || process.env.LINE_CHANNEL_ACCESS_TOKEN;
  const targetId = userId || process.env.LINE_TARGET_ID;

  if (!token) {
    console.warn('LINE_CHANNEL_ACCESS_TOKEN is not configured');
    return { success: false, error: 'LINE_CHANNEL_ACCESS_TOKEN not configured' };
  }

  if (!targetId) {
    console.warn('LINE_TARGET_ID is not configured');
    return { success: false, error: 'LINE_TARGET_ID not configured' };
  }

  // สร้าง message object
  const messages = typeof message === 'string'
    ? [{ type: 'text', text: message }]
    : Array.isArray(message) ? message : [message];

  const postData = JSON.stringify({
    to: targetId,
    messages: messages,
  });

  const options = {
    hostname: 'api.line.me',
    path: '/v2/bot/message/push',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Content-Length': Buffer.byteLength(postData),
    },
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log('✅ LINE Message sent successfully');
          resolve({ success: true });
        } else {
          try {
            const response = JSON.parse(data);
            console.error('❌ LINE Message failed:', response);
            resolve({ success: false, error: response.message || 'Unknown error' });
          } catch (e) {
            console.error('❌ LINE Message failed:', data);
            resolve({ success: false, error: data || 'Unknown error' });
          }
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ LINE Message error:', error.message);
      resolve({ success: false, error: error.message });
    });

    req.write(postData);
    req.end();
  });
};

/**
 * จัดกลุ่ม alert ตามสินค้า (productId)
 * @param {Array} alerts
 * @returns {Array} [{ productName, leadTimeDays, bufferDays, minOrderQty, items: [...] }]
 */
const groupAlertsByProduct = (alerts) => {
  const groups = new Map();
  for (const a of alerts) {
    const key = String(a.productId);
    if (!groups.has(key)) {
      groups.set(key, {
        productName: a.productName,
        leadTimeDays: a.leadTimeDays || 0,
        bufferDays: a.bufferDays || 0,
        minOrderQty: a.minOrderQty || 0,
        items: [],
      });
    }
    groups.get(key).items.push(a);
  }
  return Array.from(groups.values());
};

const fmtNum = (n) => Number(n || 0).toLocaleString('th-TH');

// แสดงเฉพาะ 2 ส่วนท้ายของ SKU (Color-Size) — ตัด prefix สินค้าที่ซ้ำกันออก
// เช่น XSR-MOM-PG-N-2XL → N-2XL
const shortSku = (sku) => {
  const parts = String(sku || '').split('-');
  return parts.length > 2 ? parts.slice(-2).join('-') : String(sku || '');
};

/**
 * ส่ง Flex Message สำหรับแจ้งเตือนสต็อกต่ำ — 1 การ์ด = 1 กลุ่มสินค้า, list SKU ข้างในเป็นตาราง
 * @param {Array} alerts - รายการแจ้งเตือน
 * @param {string} userId - LINE User ID หรือ Group ID
 * @returns {Promise<object>}
 */
export const sendStockAlertFlexMessage = async (alerts, userId = null) => {
  if (!alerts || alerts.length === 0) {
    return { success: false, error: 'No alerts to send' };
  }

  const groups = groupAlertsByProduct(alerts);

  // 1 bubble ต่อ 1 กลุ่มสินค้า (carousel สูงสุด 12 ใบ)
  const bubbles = groups.slice(0, 12).map((g) => {
    const hasOut = g.items.some((i) => i.stockStatus === 'out-of-stock');
    const headerColor = hasOut ? '#FF4444' : '#FFA500';
    const headerLabel = hasOut ? '🚨 สินค้าหมด/ใกล้หมด' : '⚠️ สินค้าใกล้หมด';
    const period = g.leadTimeDays + g.bufferDays;
    const totalSuggested = g.items.reduce((s, i) => s + (i.suggestedOrder || 0), 0);

    // แถวหัวตาราง
    const tableHeader = {
      type: 'box',
      layout: 'horizontal',
      margin: 'md',
      contents: [
        { type: 'text', text: 'SKU', size: 'xs', color: '#999999', flex: 4 },
        { type: 'text', text: 'เหลือ', size: 'xs', color: '#999999', flex: 3, align: 'end' },
        { type: 'text', text: 'พอ', size: 'xs', color: '#999999', flex: 4, align: 'end' },
        { type: 'text', text: 'แนะนำสั่ง', size: 'xs', color: '#999999', flex: 4, align: 'end' },
      ],
    };

    // แถวข้อมูลแต่ละ SKU
    const rows = g.items.map((i) => ({
      type: 'box',
      layout: 'horizontal',
      contents: [
        { type: 'text', text: shortSku(i.sku), size: 'xs', color: '#333333', flex: 4, wrap: true },
        {
          type: 'text',
          text: fmtNum(i.availableStock),
          size: 'xs',
          color: i.stockStatus === 'out-of-stock' ? '#FF0000' : '#FF6600',
          flex: 3,
          align: 'end',
        },
        { type: 'text', text: `${i.daysOfStock} วัน`, size: 'xs', color: '#555555', flex: 4, align: 'end' },
        { type: 'text', text: fmtNum(i.suggestedOrder), size: 'xs', weight: 'bold', color: '#0066CC', flex: 4, align: 'end' },
      ],
    }));

    const summary = [
      { type: 'separator', margin: 'md' },
      {
        type: 'box',
        layout: 'horizontal',
        margin: 'sm',
        contents: [
          { type: 'text', text: 'รวมแนะนำสั่ง', size: 'sm', color: '#555555', flex: 1 },
          { type: 'text', text: `${fmtNum(totalSuggested)} ชิ้น`, size: 'sm', weight: 'bold', color: '#0066CC', align: 'end' },
        ],
      },
    ];
    if (g.minOrderQty > 0) {
      summary.push({ type: 'text', text: `📦 MOQ ขั้นต่ำ ${fmtNum(g.minOrderQty)} ชิ้น`, size: 'xs', color: '#999999', margin: 'sm' });
    }

    return {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: headerColor,
        paddingAll: '10px',
        spacing: 'xs',
        contents: [
          { type: 'text', text: headerLabel, color: '#FFFFFF', weight: 'bold', size: 'xs' },
          { type: 'text', text: `${g.productName} · ${g.items.length} SKU`, color: '#FFFFFF', weight: 'bold', size: 'md', wrap: true },
          { type: 'text', text: `Lead+Buffer: ${g.leadTimeDays}+${g.bufferDays} = ${period} วัน`, color: '#FFFFFF', size: 'xs' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingAll: '12px',
        contents: [tableHeader, { type: 'separator', margin: 'sm' }, ...rows, ...summary],
      },
    };
  });

  const flexMessage = {
    type: 'flex',
    altText: `🔔 แจ้งเตือนสินค้าใกล้หมด ${groups.length} กลุ่ม (${alerts.length} SKU)`,
    contents: bubbles.length === 1 ? bubbles[0] : { type: 'carousel', contents: bubbles },
  };

  return sendLineMessage(userId, [flexMessage]);
};

/**
 * ส่งข้อความแจ้งเตือนสต็อกต่ำแบบ Text (fallback) — group ตามสินค้าเช่นกัน
 * @param {Array} alerts - รายการแจ้งเตือน
 * @param {string} userId - LINE User ID หรือ Group ID
 * @returns {Promise<object>}
 */
export const sendStockAlertText = async (alerts, userId = null) => {
  if (!alerts || alerts.length === 0) {
    return { success: false, error: 'No alerts to send' };
  }

  const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  const groups = groupAlertsByProduct(alerts);

  let message = `🔔 แจ้งเตือนสินค้าใกล้หมด\n📅 ${now}\n`;
  message += '━━━━━━━━━━━━━━━━\n';

  for (const g of groups.slice(0, 15)) {
    const hasOut = g.items.some((i) => i.stockStatus === 'out-of-stock');
    const period = g.leadTimeDays + g.bufferDays;
    const totalSuggested = g.items.reduce((s, i) => s + (i.suggestedOrder || 0), 0);

    message += `\n${hasOut ? '🚨' : '⚠️'} ${g.productName} · ${g.items.length} SKU\n`;
    message += `Lead+Buffer: ${g.leadTimeDays}+${g.bufferDays} = ${period} วัน\n`;
    for (const i of g.items) {
      const dot = i.stockStatus === 'out-of-stock' ? '🔴' : '🟠';
      message += `  ${dot} ${shortSku(i.sku)}\n`;
      message += `     เหลือ ${fmtNum(i.availableStock)}   ·   พอ ${i.daysOfStock} วัน   ·   แนะนำสั่ง ${fmtNum(i.suggestedOrder)}\n`;
    }
    message += `  รวมแนะนำสั่ง ${fmtNum(totalSuggested)} ชิ้น`;
    if (g.minOrderQty > 0) message += ` (MOQ ${fmtNum(g.minOrderQty)})`;
    message += '\n';
  }

  if (groups.length > 15) {
    message += `\n... และอีก ${groups.length - 15} กลุ่ม`;
  }

  // ลองใช้ LINE Messaging API ก่อน ถ้าไม่ได้ ใช้ LINE Notify
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (token) {
    return sendLineMessage(userId, message);
  } else {
    return sendLineNotify('\n' + message);
  }
};

export default {
  sendLineNotify,
  sendLineMessage,
  sendStockAlertFlexMessage,
  sendStockAlertText,
};
