import express from 'express';
import axios from 'axios';
import Page from '../models/Page.js';
import Employee from '../models/Employee.js';
import { handleIncomingMessage, sendMessage } from '../services/facebookService.js';
import { authenticateToken } from '../middleware/auth.js';
import crypto from 'crypto';

const router = express.Router();

/**
 * GET /api/webhook/facebook
 * Facebook Webhook Verification
 * Query params: hub.mode, hub.verify_token, hub.challenge, page
 * ต้อง handle จาก multiple pages ด้วย dynamic verify token
 */
router.get('/facebook', async (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const pageId = req.query.page; // Optional: specify which page

  // ถ้าระบุ pageId ให้ verify กับ page นั้น
  if (pageId) {
    try {
      const page = await Page.findOne({ pageId });
      if (!page) {
        return res.status(403).json({ error: 'Page not found' });
      }

      if (mode === 'subscribe' && token === page.webhookVerifyToken) {
        console.log(`✅ Webhook verified for page: ${page.pageName} (${pageId})`);
        return res.status(200).send(challenge);
      } else {
        return res.status(403).json({ error: 'Invalid token or mode' });
      }
    } catch (error) {
      console.error('Error verifying webhook:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // Fallback: ใช้ env token (backward compatibility)
  const VERIFY_TOKEN = process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN;
  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verified with environment token');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

/**
 * POST /api/webhook/facebook
 * Receive Facebook Webhook Events
 * Query params: page (optional: specify page ID for routing)
 */
router.post('/facebook', async (req, res) => {
  const body = req.body;
  const io = req.app.get('io'); // Get Socket.io instance

  if (body.object === 'page') {
    for (const entry of body.entry) {
      // ดึง pageId จาก entry (Facebook ส่งมาด้วย)
      const pageId = entry.id;

      // ดึง page จาก DB
      let page;
      try {
        page = await Page.findOne({ pageId });
        if (!page) {
          console.warn(`⚠️  Page ${pageId} not found in database`);
          continue; // Skip this entry
        }
      } catch (error) {
        console.error('Error finding page:', error);
        continue;
      }

      // Process all messaging events in this entry
      if (entry.messaging && Array.isArray(entry.messaging)) {
        for (const messaging of entry.messaging) {
          if (messaging.message) {
            try {
              // Handle incoming message
              const { customer, message, conversation } = await handleIncomingMessage(messaging, pageId);

              console.log(
                `📨 Message from ${customer.name || customer.facebookName} ` +
                `on page "${page.pageName}": ${message.content || '[Attachment]'}`
              );

              // ✅ Emit Socket.io event ให้ real-time update
              if (io) {
                io.to(`page:${page._id}`).emit('message-received', {
                  conversationId: conversation._id,
                  pageId: page._id,
                  message: {
                    _id: message._id,
                    sender: message.sender,
                    senderName: message.senderName,
                    content: message.content,
                    messageType: message.messageType,
                    createdAt: message.createdAt
                  },
                  conversation: {
                    _id: conversation._id,
                    lastMessage: conversation.lastMessage,
                    lastMessageAt: conversation.lastMessageAt,
                    unreadCount: conversation.unreadCount
                  }
                });

                console.log(`✅ Socket.io emitted to page:${page._id}`);
              }

              // Auto-reply (optional)
              // await sendMessage(messaging.sender.id, 'ขอบคุณที่ติดต่อ เราจะตอบกลับให้เร็วที่สุด', pageId);
            } catch (error) {
              console.error(`❌ Error processing message from page ${pageId}:`, error);
            }
          }

          // Handle message delivery confirmation
          if (messaging.delivery) {
            const { mids } = messaging.delivery;
            console.log(`📬 Message delivery confirmed for ${mids?.length || 0} messages`);
          }

          // Handle message read receipt
          if (messaging.read) {
            console.log(`👁️  Message read by customer`);
          }
        }
      }
    }

    // ✅ Acknowledge receipt immediately
    res.status(200).send('EVENT_RECEIVED');
  } else {
    res.sendStatus(404);
  }
});

/**
 * Endpoint สำหรับ manual testing / admin send message
 * POST /api/webhook/send-test
 */
router.post('/send-test', async (req, res) => {
  try {
    const { recipientId, message, pageId } = req.body;

    if (!recipientId || !message || !pageId) {
      return res.status(400).json({
        error: 'recipientId, message, and pageId are required'
      });
    }

    const result = await sendMessage(recipientId, message, pageId);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= Facebook OAuth Routes =============

/**
 * GET /api/facebook/auth-url
 * ดึง URL สำหรับ redirect ไปยัง Facebook OAuth
 */
router.get('/auth-url', (req, res) => {
  const appId = process.env.FACEBOOK_APP_ID;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI;
  
  if (!appId || !redirectUri) {
    return res.status(400).json({ error: 'Facebook app credentials not configured' });
  }
  
  // State ใช้สำหรับ CSRF protection
  const state = crypto.randomBytes(32).toString('hex');
  
  // Save state ลง session หรือ DB (simplified: ใช้ client cookie)
  res.cookie('fb_oauth_state', state, { httpOnly: true, maxAge: 600000 });
  
  // ✅ Using minimal scopes that don't require app review
  // pages_manage_messaging and pages_read_engagement require Facebook app review
  // Using: pages_manage_metadata only (basic permission without review)
  const url = `https://www.facebook.com/v18.0/dialog/oauth?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=pages_manage_metadata&state=${state}`;
  
  res.json({ url });
});

/**
 * GET /api/facebook/callback
 * Facebook OAuth callback
 * Query params: code, state
 */
router.get('/callback', authenticateToken, async (req, res) => {
  try {
    const { code, state } = req.query;
    
    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state parameter' });
    }
    
    // Verify state from cookie
    const savedState = req.cookies.fb_oauth_state;
    if (state !== savedState) {
      return res.status(403).json({ error: 'Invalid state parameter' });
    }
    
    const appId = process.env.FACEBOOK_APP_ID;
    const appSecret = process.env.FACEBOOK_APP_SECRET;
    const redirectUri = process.env.FACEBOOK_REDIRECT_URI;
    
    // Exchange code for access token
    const tokenResponse = await axios.get('https://graph.facebook.com/v18.0/oauth/access_token', {
      params: {
        client_id: appId,
        client_secret: appSecret,
        redirect_uri: redirectUri,
        code
      }
    });
    
    const accessToken = tokenResponse.data.access_token;
    const facebookUserId = tokenResponse.data.user_id;
    
    // Get user info
    const userResponse = await axios.get('https://graph.facebook.com/me', {
      params: {
        fields: 'id,name,email',
        access_token: accessToken
      }
    });
    
    // Update user ด้วย Facebook info
    const employee = await Employee.findById(req.user._id);
    if (!employee) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    employee.facebookUserId = facebookUserId;
    employee.facebookAccessToken = accessToken;
    await employee.save();
    
    res.json({
      success: true,
      message: 'Facebook connected successfully',
      user: {
        _id: employee._id,
        firstName: employee.firstName,
        lastName: employee.lastName,
        facebookUserId
      }
    });
  } catch (error) {
    console.error('Facebook OAuth error:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/facebook/pages
 * ดึง Facebook pages ที่ user มีสิทธิ์
 */
router.get('/pages', authenticateToken, async (req, res) => {
  try {
    const employee = await Employee.findById(req.user._id);
    
    if (!employee || !employee.facebookAccessToken) {
      return res.status(400).json({ error: 'Facebook not connected. Please login first.' });
    }
    
    // Get pages from Facebook
    const pagesResponse = await axios.get('https://graph.facebook.com/me/accounts', {
      params: {
        fields: 'id,name,category,picture.width(100).height(100)',
        access_token: employee.facebookAccessToken
      }
    });
    
    const pages = pagesResponse.data.data.map(page => ({
      pageId: page.id,
      pageName: page.name,
      category: page.category,
      picture: page.picture?.data?.url
    }));
    
    res.json({ pages });
  } catch (error) {
    console.error('Error fetching Facebook pages:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/facebook/connect-page
 * เชื่อม Facebook page เข้าระบบ
 * Body: { pageId }
 */
router.post('/connect-page', authenticateToken, async (req, res) => {
  try {
    const { pageId } = req.body;
    
    if (!pageId) {
      return res.status(400).json({ error: 'pageId is required' });
    }
    
    const employee = await Employee.findById(req.user._id);
    
    if (!employee || !employee.facebookAccessToken) {
      return res.status(400).json({ error: 'Facebook not connected' });
    }
    
    // Get page access token
    const pageTokenResponse = await axios.get(`https://graph.facebook.com/${pageId}`, {
      params: {
        fields: 'id,name,access_token',
        access_token: employee.facebookAccessToken
      }
    });
    
    const pageAccessToken = pageTokenResponse.data.access_token;
    const pageName = pageTokenResponse.data.name;
    
    if (!pageAccessToken) {
      return res.status(400).json({ error: 'Failed to get page access token' });
    }
    
    // Generate webhook verify token
    const webhookVerifyToken = crypto.randomBytes(16).toString('hex');
    
    // Create Page document
    const page = new Page({
      pageId,
      pageName,
      pageAccessToken, // Will be encrypted
      webhookVerifyToken,
      createdBy: req.user._id
    });
    
    await page.save();
    
    // Update employee's facebookPages array
    if (!employee.facebookPages) {
      employee.facebookPages = [];
    }
    employee.facebookPages.push({
      pageId,
      pageName,
      pageAccessToken // Will be encrypted
    });
    await employee.save();
    
    res.status(201).json({
      message: 'Page connected successfully',
      page: {
        _id: page._id,
        pageId: page.pageId,
        pageName: page.pageName,
        status: page.status
      }
    });
  } catch (error) {
    console.error('Error connecting page:', error.response?.data || error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/facebook/disconnect
 * ยกเลิกการเชื่อม Facebook
 */
router.post('/disconnect', authenticateToken, async (req, res) => {
  try {
    const employee = await Employee.findById(req.user._id);
    
    if (!employee) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Remove Facebook data
    employee.facebookUserId = null;
    employee.facebookAccessToken = null;
    employee.facebookPages = [];
    await employee.save();
    
    res.json({ message: 'Facebook disconnected' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
