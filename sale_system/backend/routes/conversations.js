import express from 'express';
import Conversation from '../models/Conversation.js';
import Message from '../models/Message.js';
import Page from '../models/Page.js';
import { authenticateToken, authorizeRoles } from '../middleware/auth.js';
import { sendAndSaveMessage } from '../services/facebookService.js';

const router = express.Router();

// ============= Conversations Routes =============

/**
 * GET /api/conversations?pageId=...&status=open|closed
 * ดึงรายการ conversations สำหรับ page
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { pageId, status = 'open', limit = 20, skip = 0 } = req.query;

    if (!pageId) {
      return res.status(400).json({ error: 'pageId is required' });
    }

    // Find page
    const page = await Page.findById(pageId);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Build query
    const query = { pageId };
    if (status === 'open') {
      query.isOpen = true;
    } else if (status === 'closed') {
      query.isOpen = false;
    }

    // Fetch conversations
    const [conversations, total] = await Promise.all([
      Conversation.find(query)
        .populate('customerId', 'name facebookName email phone')
        .populate('assignedTo', 'firstName lastName')
        .sort({ lastMessageAt: -1 })
        .skip(Number(skip))
        .limit(Number(limit))
        .lean(),
      Conversation.countDocuments(query)
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      conversations,
      total,
      page: Math.floor(Number(skip) / limit) + 1,
      limit: Number(limit),
      totalPages
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/conversations/:conversationId
 * ดึงรายละเอียด conversation
 */
router.get('/:conversationId', authenticateToken, async (req, res) => {
  try {
    const conversation = await Conversation.findById(req.params.conversationId)
      .populate('customerId', 'name facebookName email phone address')
      .populate('pageId', 'pageId pageName')
      .populate('assignedTo', 'firstName lastName email')
      .lean();

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json(conversation);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/conversations/:conversationId
 * อัปเดต conversation (close, assign, add tags)
 */
router.patch('/:conversationId', authenticateToken, async (req, res) => {
  try {
    const { isOpen, assignedTo, tags, notes } = req.body;
    const conversation = await Conversation.findById(req.params.conversationId);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    if (isOpen !== undefined) {
      conversation.isOpen = isOpen;
      if (!isOpen && !conversation.closedAt) {
        conversation.closedAt = new Date();
      }
    }

    if (assignedTo !== undefined) {
      conversation.assignedTo = assignedTo;
    }

    if (tags !== undefined) {
      conversation.tags = tags;
    }

    await conversation.save();
    res.json({ message: 'Conversation updated', conversation });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= Messages Routes =============

/**
 * GET /api/conversations/:conversationId/messages?limit=50&skip=0
 * ดึงข้อความจาก conversation
 */
router.get('/:conversationId/messages', authenticateToken, async (req, res) => {
  try {
    const { limit = 50, skip = 0 } = req.query;

    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Mark conversation as read
    conversation.unreadCount = 0;
    await conversation.save();

    // Fetch messages (older to newer)
    const [messages, total] = await Promise.all([
      Message.find({ conversationId: req.params.conversationId })
        .select('-__v')
        .sort({ createdAt: 1 })
        .skip(Number(skip))
        .limit(Number(limit))
        .lean(),
      Message.countDocuments({ conversationId: req.params.conversationId })
    ]);

    res.json({
      messages,
      total,
      hasMore: Number(skip) + Number(limit) < total
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/conversations/:conversationId/messages
 * ส่งข้อความใหม่
 */
router.post('/:conversationId/messages', authenticateToken, async (req, res) => {
  try {
    const { content, pageId } = req.body;

    if (!content || !pageId) {
      return res.status(400).json({ error: 'content and pageId are required' });
    }

    // Get conversation
    const conversation = await Conversation.findById(req.params.conversationId)
      .populate('customerId');

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get page
    const page = await Page.findOne({ pageId });
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Send to Facebook
    const customer = conversation.customerId;
    const message = await sendAndSaveMessage(
      conversation.facebookParticipantId,
      content,
      pageId,
      req.params.conversationId,
      req.user._id
    );

    // Emit Socket.io event for real-time delivery
    const io = req.app.get('io');
    if (io) {
      io.to(`conversation:${req.params.conversationId}`).emit('message-sent', {
        message: {
          _id: message._id,
          sender: message.sender,
          senderName: message.senderName,
          content: message.content,
          messageType: message.messageType,
          status: message.status,
          createdAt: message.createdAt
        }
      });
    }

    res.status(201).json({
      message: 'Message sent successfully',
      data: message
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/conversations/:conversationId/messages/:messageId
 * อัปเดต message status
 */
router.patch('/:conversationId/messages/:messageId', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body; // 'read', 'delivered'

    const message = await Message.findByIdAndUpdate(
      req.params.messageId,
      { status, isRead: status === 'read' },
      { new: true }
    );

    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Emit Socket.io event
    const io = req.app.get('io');
    if (io) {
      io.to(`conversation:${req.params.conversationId}`).emit('message-status-changed', {
        messageId: message._id,
        status: message.status
      });
    }

    res.json({ message: 'Message status updated', data: message });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============= Search & Statistics =============

/**
 * GET /api/conversations/search?q=...&pageId=...
 * ค้นหา conversations ตามชื่อลูกค้า
 */
router.get('/search/:query', authenticateToken, async (req, res) => {
  try {
    const { query } = req.params;
    const { pageId, limit = 10 } = req.query;

    const matchQuery = {
      $or: [
        { customerName: { $regex: query, $options: 'i' } },
        { 'customerId.name': { $regex: query, $options: 'i' } }
      ]
    };

    if (pageId) {
      matchQuery.pageId = pageId;
    }

    const results = await Conversation.find(matchQuery)
      .populate('customerId', 'name email phone')
      .limit(Number(limit))
      .lean();

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/conversations/stats/:pageId
 * สถิติ conversations สำหรับ page
 */
router.get('/stats/:pageId', authenticateToken, async (req, res) => {
  try {
    const pageId = req.params.pageId;

    const page = await Page.findById(pageId);
    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const stats = await Conversation.aggregate([
      { $match: { pageId: page._id } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          open: {
            $sum: { $cond: ['$isOpen', 1, 0] }
          },
          closed: {
            $sum: { $cond: ['$isOpen', 0, 1] }
          },
          unreadTotal: { $sum: '$unreadCount' },
          avgMessagesPerConv: { $avg: '$messageCount' }
        }
      }
    ]);

    res.json(stats[0] || {
      total: 0,
      open: 0,
      closed: 0,
      unreadTotal: 0,
      avgMessagesPerConv: 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
