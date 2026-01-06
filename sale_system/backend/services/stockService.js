import axios from 'axios';

const STOCK_API_URL = process.env.STOCK_SYSTEM_API_URL || 'http://localhost:5000/api';

export async function getProductInventory(productId) {
  try {
    const response = await axios.get(`${STOCK_API_URL}/inventory/${productId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching inventory from stock system:', error);
    throw error;
  }
}

export async function getProductBySkU(sku) {
  try {
    const response = await axios.get(`${STOCK_API_URL}/products/sku/${sku}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching product from stock system:', error);
    throw error;
  }
}

export async function createInventoryOrder(orderData) {
  try {
    const response = await axios.post(`${STOCK_API_URL}/inventory-orders`, {
      orderId: orderData.orderId,
      items: orderData.items.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        batchId: item.batchId
      })),
      notes: `Sale Order #${orderData.orderId}`
    });
    return response.data;
  } catch (error) {
    console.error('Error creating inventory order:', error);
    throw error;
  }
}

export async function checkStockAvailability(items) {
  try {
    const availability = await Promise.all(
      items.map(async (item) => {
        const inventory = await getProductInventory(item.productId);
        return {
          productId: item.productId,
          requestedQty: item.quantity,
          availableQty: inventory.totalQuantity,
          isAvailable: inventory.totalQuantity >= item.quantity
        };
      })
    );
    return availability;
  } catch (error) {
    console.error('Error checking stock availability:', error);
    throw error;
  }
}
