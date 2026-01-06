import express from 'express';
import { handleIncomingMessage, sendMessage } from '../services/facebookService.js';

const router = express.Router();

// Webhook verification (GET)
router.get('/facebook', (req, res) => {
  const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Webhook events (POST)
router.post('/facebook', async (req, res) => {
  const body = req.body;

  if (body.object === 'page') {
    for (const entry of body.entry) {
      const messaging = entry.messaging[0];
      if (messaging && messaging.message) {
        try {
          const { customer, message } = await handleIncomingMessage(messaging);
          console.log(`Message from ${customer.facebookName}: ${message.content}`);
          
          // Auto-reply
          await sendMessage(messaging.sender.id, 'ขอบคุณที่ติดต่อ เราจะตอบกลับให้เร็วที่สุด');
        } catch (error) {
          console.error('Error processing message:', error);
        }
      }
    }
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

export default router;
