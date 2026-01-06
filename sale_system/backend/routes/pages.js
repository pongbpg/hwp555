import express from 'express';
import axios from 'axios';
import Page from '../models/Page.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

const FACEBOOK_GRAPH_API = 'https://graph.facebook.com/v18.0';

// ============= Helper Functions =============

/**
 * ตรวจสอบว่า page token มีผลใช้งานได้หรือไม่
 * @param {string} pageAccessToken - Token ที่ต้องตรวจสอบ
 * @param {string} pageId - Facebook Page ID
 * @returns {Promise<boolean>}
 */
const validatePageToken = async (pageAccessToken, pageId) => {
  try {
    const response = await axios.get(`${FACEBOOK_GRAPH_API}/${pageId}`, {
      params: {
        fields: 'name,picture',
        access_token: pageAccessToken
      }
    });
    return !!response.data.id;
  } catch (error) {
    console.error('Token validation error:', error.response?.data || error.message);
    return false;
  }
};

/**
 * ดึงข้อมูล page จาก Facebook
 */
const getPageInfo = async (pageAccessToken, pageId) => {
  try {
    const response = await axios.get(`${FACEBOOK_GRAPH_API}/${pageId}`, {
      params: {
        fields: 'name,picture.type(square)',
        access_token: pageAccessToken
      }
    });
    return {
      pageName: response.data.name,
      profilePicUrl: response.data.picture?.data?.url || null
    };
  } catch (error) {
    console.error('Error fetching page info:', error.message);
    return null;
  }
};

/**
 * Subscribe page ให้รับ webhook events
 */
const subscribePageWebhook = async (pageAccessToken, pageId, webhookUrl) => {
  try {
    const response = await axios.post(
      `${FACEBOOK_GRAPH_API}/${pageId}/subscribed_apps`,
      {},
      {
        params: {
          access_token: pageAccessToken,
          subscribed_fields: 'messages,messaging_postbacks,messaging_optins,message_reads'
        }
      }
    );
    return response.data.success;
  } catch (error) {
    console.error('Error subscribing webhook:', error.response?.data || error.message);
    return false;
  }
};

// ============= Routes =============

/**
 * GET /api/pages
 * ดึงรายการหน้า Facebook ที่เชื่อมต่อของ user นี้
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    // ดึงเพจที่เชื่อมกับ user นี้
    const pages = await Page.find({ createdBy: req.user._id })
      .select('-pageAccessToken') // ไม่ส่ง token
      .sort({ createdAt: -1 });

    res.json(pages);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/pages/:id
 * ดึงข้อมูล page เดียว
 */
router.get('/:id', authenticateToken, authorizeRoles('owner', 'admin'), async (req, res) => {
  try {
    const page = await Page.findById(req.params.id).select('-pageAccessToken');
    if (!page) return res.status(404).json({ error: 'Page not found' });
    res.json(page);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/pages
 * เพิ่มหน้า Facebook ใหม่
 * Body: {
 *   pageId: "123456789",
 *   pageAccessToken: "EAABU...",
 *   webhookVerifyToken: "my_token_123"
 * }
 */
router.post('/', authenticateToken, authorizeRoles('owner', 'admin'), async (req, res) => {
  try {
    const { pageId, pageAccessToken, webhookVerifyToken } = req.body;

    // Validate required fields
    if (!pageId || !pageAccessToken || !webhookVerifyToken) {
      return res.status(400).json({
        error: 'pageId, pageAccessToken, and webhookVerifyToken are required'
      });
    }

    // Check if page already exists
    const existingPage = await Page.findOne({ pageId });
    if (existingPage) {
      return res.status(400).json({ error: 'Page already connected' });
    }

    // Validate token with Facebook
    const isValid = await validatePageToken(pageAccessToken, pageId);
    if (!isValid) {
      return res.status(400).json({
        error: 'Invalid page access token or page ID'
      });
    }

    // Get page info from Facebook
    const pageInfo = await getPageInfo(pageAccessToken, pageId);
    if (!pageInfo) {
      return res.status(400).json({
        error: 'Failed to fetch page information from Facebook'
      });
    }

    // Create page document
    const page = new Page({
      pageId,
      pageAccessToken, // Will be encrypted by setter
      webhookVerifyToken,
      pageName: pageInfo.pageName,
      profilePicUrl: pageInfo.profilePicUrl,
      createdBy: req.user._id
    });

    await page.save();

    // Try to subscribe webhook (optional - won't fail if error)
    const webhookUrl = process.env.WEBHOOK_URL || 'http://localhost:5002/api/facebook';
    subscribePageWebhook(pageAccessToken, pageId, webhookUrl).catch(err => {
      console.warn('Webhook subscription optional error:', err.message);
    });

    res.status(201).json({
      message: 'Page connected successfully',
      page: {
        _id: page._id,
        pageId: page.pageId,
        pageName: page.pageName,
        status: page.status,
        createdAt: page.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/pages/:id
 * อัปเดตสถานะหรือข้อมูล page
 * Body: {
 *   status: "active" | "inactive",
 *   pageName?: "New Name",
 *   webhookVerifyToken?: "new_token"
 * }
 */
router.patch('/:id', authenticateToken, async (req, res) => {
  try {
    const { status, pageName, webhookVerifyToken } = req.body;
    const page = await Page.findById(req.params.id);

    if (!page) return res.status(404).json({ error: 'Page not found' });
    
    // ตรวจสอบว่า user นี้เป็น owner ของ page
    if (String(page.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ error: 'You do not have permission to edit this page' });
    }

    // Update allowed fields
    if (status && ['active', 'inactive'].includes(status)) {
      page.status = status;
    }
    if (pageName) {
      page.pageName = pageName;
    }
    if (webhookVerifyToken) {
      page.webhookVerifyToken = webhookVerifyToken;
    }

    await page.save();

    res.json({
      message: 'Page updated successfully',
      page: {
        _id: page._id,
        pageId: page.pageId,
        pageName: page.pageName,
        status: page.status,
        updatedAt: page.updatedAt
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/pages/:id
 * ลบการเชื่อมต่อ page
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const page = await Page.findById(req.params.id);
    
    if (!page) return res.status(404).json({ error: 'Page not found' });
    
    // ตรวจสอบว่า user นี้เป็น owner ของ page
    if (String(page.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ error: 'You do not have permission to delete this page' });
    }
    
    await Page.findByIdAndDelete(req.params.id);

    res.json({
      message: 'Page disconnected successfully',
      pageId: page.pageId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/pages/:id/webhook-status
 * ตรวจสอบสถานะ webhook subscription
 */
router.get('/:id/webhook-status', authenticateToken, authorizeRoles('owner', 'admin'), async (req, res) => {
  try {
    const page = await Page.findById(req.params.id);
    if (!page) return res.status(404).json({ error: 'Page not found' });

    const decryptedToken = page.decryptedAccessToken;
    if (!decryptedToken) {
      return res.status(400).json({ error: 'Cannot decrypt page token' });
    }

    // Check webhook subscription status
    try {
      const response = await axios.get(
        `${FACEBOOK_GRAPH_API}/${page.pageId}/subscribed_apps`,
        {
          params: {
            access_token: decryptedToken
          }
        }
      );

      const isSubscribed = response.data.data?.length > 0;

      res.json({
        pageId: page.pageId,
        pageName: page.pageName,
        webhookSubscribed: isSubscribed,
        lastSyncAt: page.lastSyncAt,
        status: page.status
      });
    } catch (fbError) {
      res.json({
        pageId: page.pageId,
        pageName: page.pageName,
        webhookSubscribed: false,
        error: fbError.response?.data?.error?.message || fbError.message,
        status: page.status
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/pages/:id/subscribe-webhook
 * ลองอัปเดต webhook subscription
 */
router.post('/:id/subscribe-webhook', authenticateToken, authorizeRoles('owner', 'admin'), async (req, res) => {
  try {
    const page = await Page.findById(req.params.id);
    if (!page) return res.status(404).json({ error: 'Page not found' });

    const decryptedToken = page.decryptedAccessToken;
    if (!decryptedToken) {
      return res.status(400).json({ error: 'Cannot decrypt page token' });
    }

    const webhookUrl = process.env.WEBHOOK_URL || 'http://localhost:5002/api/facebook';
    const success = await subscribePageWebhook(decryptedToken, page.pageId, webhookUrl);

    if (success) {
      page.lastSyncAt = new Date();
      await page.save();
      res.json({ message: 'Webhook subscription successful' });
    } else {
      res.status(400).json({ error: 'Failed to subscribe webhook' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
