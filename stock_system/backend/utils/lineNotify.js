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
 * ส่ง Flex Message สำหรับแจ้งเตือนสต็อกต่ำ
 * @param {Array} alerts - รายการแจ้งเตือน
 * @param {string} userId - LINE User ID หรือ Group ID
 * @returns {Promise<object>}
 */
export const sendStockAlertFlexMessage = async (alerts, userId = null) => {
  if (!alerts || alerts.length === 0) {
    return { success: false, error: 'No alerts to send' };
  }

  // สร้าง bubble สำหรับแต่ละรายการ (จำกัด 5 รายการแรก)
  const bubbles = alerts.slice(0, 5).map((alert) => ({
    type: 'bubble',
    size: 'kilo',
    header: {
      type: 'box',
      layout: 'vertical',
      backgroundColor: alert.stockStatus === 'out-of-stock' ? '#FF4444' : '#FFA500',
      paddingAll: '10px',
      contents: [
        {
          type: 'text',
          text: alert.stockStatus === 'out-of-stock' ? '🚨 สินค้าหมด' : '⚠️ สินค้าใกล้หมด',
          color: '#FFFFFF',
          weight: 'bold',
          size: 'sm',
        },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      paddingAll: '12px',
      contents: [
        {
          type: 'text',
          text: alert.productName,
          weight: 'bold',
          size: 'md',
          wrap: true,
        },
        {
          type: 'text',
          text: `SKU: ${alert.sku}`,
          size: 'sm',
          color: '#888888',
        },
        {
          type: 'separator',
          margin: 'md',
        },
        {
          type: 'box',
          layout: 'horizontal',
          margin: 'md',
          contents: [
            {
              type: 'text',
              text: 'คงเหลือ',
              size: 'sm',
              color: '#555555',
              flex: 1,
            },
            {
              type: 'text',
              text: `${alert.currentStock} ชิ้น`,
              size: 'sm',
              weight: 'bold',
              color: alert.currentStock <= 0 ? '#FF0000' : '#FF6600',
              align: 'end',
            },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'text',
              text: 'จุดสั่งซื้อ',
              size: 'sm',
              color: '#555555',
              flex: 1,
            },
            {
              type: 'text',
              text: `${alert.reorderPoint} ชิ้น`,
              size: 'sm',
              align: 'end',
            },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'text',
              text: 'ขายเฉลี่ย/วัน',
              size: 'sm',
              color: '#555555',
              flex: 1,
            },
            {
              type: 'text',
              text: `${alert.avgDailySales.toFixed(1)} ชิ้น`,
              size: 'sm',
              align: 'end',
            },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'text',
              text: 'สต็อกเพียงพอ',
              size: 'sm',
              color: '#555555',
              flex: 1,
            },
            {
              type: 'text',
              text: `~${alert.daysOfStock} วัน`,
              size: 'sm',
              weight: 'bold',
              color: alert.daysOfStock <= 3 ? '#FF0000' : '#FF6600',
              align: 'end',
            },
          ],
        },
        {
          type: 'box',
          layout: 'horizontal',
          contents: [
            {
              type: 'text',
              text: 'แนะนำสั่งซื้อ',
              size: 'sm',
              color: '#555555',
              flex: 1,
            },
            {
              type: 'text',
              text: `${alert.suggestedOrder} ชิ้น`,
              size: 'sm',
              weight: 'bold',
              color: '#0066CC',
              align: 'end',
            },
          ],
        },
      ],
    },
  }));

  const flexMessage = {
    type: 'flex',
    altText: `🔔 แจ้งเตือนสินค้าใกล้หมด ${alerts.length} รายการ`,
    contents: bubbles.length === 1 ? bubbles[0] : {
      type: 'carousel',
      contents: bubbles,
    },
  };

  return sendLineMessage(userId, [flexMessage]);
};

/**
 * ส่งข้อความแจ้งเตือนสต็อกต่ำแบบ Text
 * @param {Array} alerts - รายการแจ้งเตือน
 * @param {string} userId - LINE User ID หรือ Group ID
 * @returns {Promise<object>}
 */
export const sendStockAlertText = async (alerts, userId = null) => {
  if (!alerts || alerts.length === 0) {
    return { success: false, error: 'No alerts to send' };
  }

  const now = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  let message = `🔔 แจ้งเตือนสินค้าใกล้หมด\n📅 ${now}\n`;
  message += '━━━━━━━━━━━━━━━━\n';

  for (const alert of alerts.slice(0, 10)) {
    const icon = alert.stockStatus === 'out-of-stock' ? '🚨' : '⚠️';
    message += `\n${icon} ${alert.productName}\n`;
    message += `   SKU: ${alert.sku}\n`;
    message += `   คงเหลือ: ${alert.currentStock} ชิ้น\n`;
    message += `   ขายเฉลี่ย/วัน: ${alert.avgDailySales.toFixed(1)}\n`;
    message += `   สต็อกเพียงพอ: ~${alert.daysOfStock} วัน\n`;
    message += `   แนะนำสั่งซื้อ: ${alert.suggestedOrder} ชิ้น\n`;
  }

  if (alerts.length > 10) {
    message += `\n... และอีก ${alerts.length - 10} รายการ`;
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
