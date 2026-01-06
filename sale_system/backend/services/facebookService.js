import axios from 'axios';
import Customer from '../models/Customer.js';
import Message from '../models/Message.js';

const FACEBOOK_GRAPH_API = 'https://graph.facebook.com/v18.0';
const PAGE_ID = process.env.FACEBOOK_PAGE_ID;
const ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;

export async function handleIncomingMessage(messaging) {
  try {
    const senderId = messaging.sender.id;
    const messageData = messaging.message;
    
    // Get or create customer
    let customer = await Customer.findOne({ facebookId: senderId });
    
    if (!customer) {
      const userInfo = await getFacebookUserInfo(senderId);
      customer = new Customer({
        facebookId: senderId,
        facebookName: userInfo.name,
        facebookProfileUrl: `https://facebook.com/${senderId}`
      });
      await customer.save();
    }
    
    // Save message
    const message = new Message({
      facebookMessageId: messaging.message.mid,
      facebookConversationId: messaging.sender.id,
      customerId: customer._id,
      senderType: 'customer',
      content: messageData.text || '',
      messageType: messageData.attachments ? 'image' : 'text'
    });
    
    await message.save();
    
    return { customer, message };
  } catch (error) {
    console.error('Error handling incoming message:', error);
    throw error;
  }
}

export async function sendMessage(recipientId, messageText) {
  try {
    const response = await axios.post(
      `${FACEBOOK_GRAPH_API}/${PAGE_ID}/messages`,
      {
        recipient: { id: recipientId },
        message: { text: messageText }
      },
      { params: { access_token: ACCESS_TOKEN } }
    );
    return response.data;
  } catch (error) {
    console.error('Error sending Facebook message:', error);
    throw error;
  }
}

export async function getFacebookUserInfo(userId) {
  try {
    const response = await axios.get(
      `${FACEBOOK_GRAPH_API}/${userId}`,
      { params: { access_token: ACCESS_TOKEN } }
    );
    return response.data;
  } catch (error) {
    console.error('Error getting Facebook user info:', error);
    return { name: 'Unknown User' };
  }
}

export async function sendOrderStatus(recipientId, order) {
  const message = `
📦 สถานะคำสั่งซื้อ #${order.orderId}
สถานะ: ${getStatusThaiName(order.status)}
จำนวนเงิน: ฿${order.totalAmount.toFixed(2)}
  `;
  return sendMessage(recipientId, message);
}

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
