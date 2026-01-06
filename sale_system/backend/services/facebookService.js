import axios from 'axios';
import Customer from '../models/Customer.js';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import Page from '../models/Page.js';

const FACEBOOK_GRAPH_API = 'https://graph.facebook.com/v18.0';

// ============= Multi-Page Helper Functions =============

/**
 * ดึง page access token ที่ decrypt
 */
export async function getPageAccessToken(pageId) {
  try {
    const page = await Page.findOne({ pageId });
    if (!page) {
      throw new Error(`Page ${pageId} not found in database`);
    }
    return page.decryptedAccessToken;
  } catch (error) {
    console.error('Error getting page access token:', error.message);
    throw error;
  }
}

/**
 * ดึง page object จาก pageId
 */
export async function getPageInfo(pageId) {
  try {
    const page = await Page.findOne({ pageId });
    if (!page) return null;
    return page;
  } catch (error) {
    console.error('Error getting page info:', error);
    return null;
  }
}

// ============= Message Handling =============

/**
 * Handle incoming message จาก Facebook Webhook
 * @param {object} messaging - Messaging event จาก webhook
 * @param {string} pageId - Facebook Page ID
 * @returns {Promise<{customer, message, conversation}>}
 */
export async function handleIncomingMessage(messaging, pageId) {
  try {
    const senderId = messaging.sender.id;
    const messageData = messaging.message;
    
    // Get page info
    const page = await getPageInfo(pageId);
    if (!page) {
      throw new Error(`Page ${pageId} not found`);
    }

    // Get or create customer
    let customer = await Customer.findOne({ facebookId: senderId });
    
    if (!customer) {
      const pageAccessToken = await getPageAccessToken(pageId);
      const userInfo = await getFacebookUserInfo(senderId, pageAccessToken);
      customer = new Customer({
        facebookId: senderId,
        facebookName: userInfo.name,
        facebookProfileUrl: `https://facebook.com/${senderId}`,
        name: userInfo.name
      });
      await customer.save();
    }

    // Get or create conversation
    let conversation = await Conversation.findOne({
      pageId: page._id,
      customerId: customer._id,
      facebookConversationId: messaging.sender.id
    });

    if (!conversation) {
      conversation = new Conversation({
        pageId: page._id,
        customerId: customer._id,
        facebookConversationId: messaging.sender.id,
        facebookParticipantId: senderId,
        customerName: customer.name || customer.facebookName,
        customerProfilePicUrl: customer.profilePicUrl,
        participantFacebookIds: [senderId],
        isOpen: true
      });
    }
    
    // Update conversation's last message info
    conversation.lastMessage = messageData.text || '[Attachment]';
    conversation.lastMessageType = messageData.attachments ? 'attachment' : 'text';
    conversation.lastMessageAt = new Date();
    conversation.unreadCount = (conversation.unreadCount || 0) + 1;
    
    await conversation.save();

    // Save message
    const message = new Message({
      conversationId: conversation._id,
      pageId: page._id,
      facebookMessageId: messageData.mid,
      customerId: customer._id,
      sender: 'customer',
      senderName: customer.name || customer.facebookName,
      senderFacebookId: senderId,
      content: messageData.text || '',
      messageType: messageData.attachments ? 'attachment' : 'text',
      status: 'delivered',
      attachments: messageData.attachments ? messageData.attachments.map(att => ({
        type: att.type,
        url: att.payload?.url || ''
      })) : []
    });
    
    await message.save();

    // Update conversation message count
    conversation.messageCount = (conversation.messageCount || 0) + 1;
    await conversation.save();

    return { customer, message, conversation };
  } catch (error) {
    console.error('Error handling incoming message:', error);
    throw error;
  }
}

// ============= Sending Messages =============

/**
 * ส่ง message ไปยัง Facebook Messenger
 * @param {string} recipientId - Facebook User ID
 * @param {string} messageText - Text content
 * @param {string} pageId - Facebook Page ID
 */
export async function sendMessage(recipientId, messageText, pageId) {
  try {
    const pageAccessToken = await getPageAccessToken(pageId);
    
    const response = await axios.post(
      `${FACEBOOK_GRAPH_API}/${pageId}/messages`,
      {
        recipient: { id: recipientId },
        message: { text: messageText }
      },
      { params: { access_token: pageAccessToken } }
    );
    return response.data;
  } catch (error) {
    console.error('Error sending Facebook message:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * ส่ง message พร้อมอัปเดต message record ในระบบ
 */
export async function sendAndSaveMessage(recipientId, messageText, pageId, conversationId, userId) {
  try {
    // Send to Facebook
    const fbResponse = await sendMessage(recipientId, messageText, pageId);

    // Get page info
    const page = await getPageInfo(pageId);

    // Save to DB
    const message = new Message({
      conversationId,
      pageId: page._id,
      facebookMessageId: fbResponse.message_id,
      sender: 'admin',
      senderName: 'Admin', // Can be updated with actual user name
      content: messageText,
      messageType: 'text',
      status: 'sent'
    });

    await message.save();

    // Update conversation
    const conversation = await Conversation.findById(conversationId);
    if (conversation) {
      conversation.lastMessage = messageText;
      conversation.lastMessageType = 'text';
      conversation.lastMessageAt = new Date();
      conversation.messageCount = (conversation.messageCount || 0) + 1;
      await conversation.save();
    }

    return message;
  } catch (error) {
    console.error('Error sending and saving message:', error);
    throw error;
  }
}

// ============= User Info =============

/**
 * ดึงข้อมูล Facebook user
 * @param {string} userId - Facebook User ID
 * @param {string} pageAccessToken - Page access token
 */
export async function getFacebookUserInfo(userId, pageAccessToken) {
  try {
    const response = await axios.get(
      `${FACEBOOK_GRAPH_API}/${userId}`,
      {
        params: {
          fields: 'first_name,last_name,profile_pic,email',
          access_token: pageAccessToken
        }
      }
    );
    return {
      name: `${response.data.first_name || ''} ${response.data.last_name || ''}`.trim() || 'User',
      email: response.data.email,
      profilePicUrl: response.data.profile_pic
    };
  } catch (error) {
    console.error('Error getting Facebook user info:', error);
    return { name: 'Unknown User', email: null };
  }
}

// ============= Order Status Notifications =============

export async function sendOrderStatus(recipientId, order, pageId) {
  const message = `
📦 สถานะคำสั่งซื้อ #${order.orderId}
สถานะ: ${getStatusThaiName(order.status)}
จำนวนเงิน: ฿${order.totalAmount.toFixed(2)}
  `;
  return sendMessage(recipientId, message, pageId);
}

// ============= Utilities =============

function getStatusThaiName(status) {
  const statusMap = {
    'pending': 'รอการยืนยัน',
    'confirmed': 'ยืนยันแล้ว',
    'packed': 'รวมสินค้าแล้ว',
    'shipped': 'จัดส่งแล้ว',
    'delivered': 'ส่งถึงแล้ว',
    'cancelled': 'ยกเลิก'
  };
  return statusMap[status] || status;
}
