/**
 * LINE Webhook Routes
 * สำหรับรับ event จาก LINE และตอบกลับ ID
 */

import express from 'express';
import https from 'https';

const router = express.Router();

/**
 * ส่ง Reply Message กลับไปยัง LINE
 */
const replyMessage = (replyToken, messages) => {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.error('LINE_CHANNEL_ACCESS_TOKEN not configured');
    return Promise.resolve({ success: false });
  }

  const postData = JSON.stringify({
    replyToken,
    messages: Array.isArray(messages) ? messages : [messages],
  });

  const options = {
    hostname: 'api.line.me',
    path: '/v2/bot/message/reply',
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
          console.log('✅ LINE Reply sent successfully');
          resolve({ success: true });
        } else {
          console.error('❌ LINE Reply failed:', data);
          resolve({ success: false, error: data });
        }
      });
    });

    req.on('error', (error) => {
      console.error('❌ LINE Reply error:', error.message);
      resolve({ success: false, error: error.message });
    });

    req.write(postData);
    req.end();
  });
};

/**
 * Webhook endpoint สำหรับรับ event จาก LINE
 */
router.post('/webhook', async (req, res) => {
  // ตอบกลับ LINE ทันทีเพื่อไม่ให้ timeout
  res.status(200).json({ status: 'ok' });

  const events = req.body.events || [];

  for (const event of events) {
    console.log('=== LINE Event ===');
    console.log('Event Type:', event.type);

    // แสดง Source ID ใน console
    if (event.source) {
      console.log('Source Type:', event.source.type);

      if (event.source.type === 'user') {
        console.log('👤 User ID:', event.source.userId);
      } else if (event.source.type === 'group') {
        console.log('👥 Group ID:', event.source.groupId);
        console.log('👤 User ID:', event.source.userId);
      } else if (event.source.type === 'room') {
        console.log('🏠 Room ID:', event.source.roomId);
        console.log('👤 User ID:', event.source.userId);
      }
    }

    // ถ้าเป็น message event
    if (event.type === 'message' && event.message?.type === 'text') {
      const text = event.message.text.toLowerCase().trim();
      console.log('Message:', event.message.text);

      // ตอบกลับ ID เมื่อพิมพ์คำสั่งที่กำหนด
      if (['id', 'myid', 'groupid', 'userid', 'ไอดี'].includes(text)) {
        let replyText = '';

        if (event.source.type === 'user') {
          replyText = `👤 User ID:\n${event.source.userId}\n\n📋 คัดลอก ID นี้ไปใส่ใน .env ที่ LINE_TARGET_ID`;
        } else if (event.source.type === 'group') {
          replyText = `👥 Group ID:\n${event.source.groupId}\n\n👤 Your User ID:\n${event.source.userId}\n\n📋 คัดลอก Group ID ไปใส่ใน .env ที่ LINE_TARGET_ID`;
        } else if (event.source.type === 'room') {
          replyText = `🏠 Room ID:\n${event.source.roomId}\n\n👤 Your User ID:\n${event.source.userId}\n\n📋 คัดลอก Room ID ไปใส่ใน .env ที่ LINE_TARGET_ID`;
        }

        await replyMessage(event.replyToken, {
          type: 'text',
          text: replyText,
        });
      }

      // ตอบกลับคำสั่ง help
      if (['help', 'ช่วย', '?'].includes(text)) {
        await replyMessage(event.replyToken, {
          type: 'text',
          text: `📚 คำสั่งที่ใช้ได้:\n\n• id - แสดง User/Group ID\n• help - แสดงคำสั่งทั้งหมด\n\n🔔 Bot นี้จะแจ้งเตือนเมื่อสินค้าใกล้หมดสต็อก`,
        });
      }
    }

    // ถ้า Bot ถูกเชิญเข้ากลุ่ม
    if (event.type === 'join') {
      console.log('🎉 Bot joined a group/room');
      
      let welcomeText = '🎉 สวัสดีครับ! ผมคือ Stock Alert Bot\n\n';
      welcomeText += '📦 ผมจะแจ้งเตือนเมื่อสินค้าใกล้หมดสต็อก\n\n';
      welcomeText += '💡 พิมพ์ "id" เพื่อดู Group ID สำหรับตั้งค่า';

      if (event.source.type === 'group') {
        console.log('👥 Joined Group ID:', event.source.groupId);
        welcomeText += `\n\n👥 Group ID: ${event.source.groupId}`;
      } else if (event.source.type === 'room') {
        console.log('🏠 Joined Room ID:', event.source.roomId);
        welcomeText += `\n\n🏠 Room ID: ${event.source.roomId}`;
      }

      await replyMessage(event.replyToken, {
        type: 'text',
        text: welcomeText,
      });
    }

    console.log('==================\n');
  }
});

/**
 * Verify webhook URL (GET request from LINE)
 */
router.get('/webhook', (req, res) => {
  res.status(200).send('Webhook is active');
});

/**
 * ทดสอบส่งข้อความ
 */
router.post('/test-notify', async (req, res) => {
  const { sendStockAlertText } = await import('../services/stockAlertService.js');
  
  // ส่งข้อความทดสอบ
  const testAlerts = [
    {
      productName: 'ทดสอบสินค้า',
      sku: 'TEST-001',
      currentStock: 5,
      reorderPoint: 10,
      avgDailySales: 2.5,
      daysOfStock: 2,
      suggestedOrder: 50,
      stockStatus: 'low-stock',
    },
  ];

  try {
    const result = await sendStockAlertText(testAlerts);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
