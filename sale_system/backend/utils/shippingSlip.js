export function generateShippingSlipHTML(order) {
  const date = new Date(order.createdAt).toLocaleDateString('th-TH');
  
  const itemsHTML = order.items.map(item => `
    <tr>
      <td>${item.sku}</td>
      <td>${item.name}</td>
      <td style="text-align: center;">${item.quantity}</td>
      <td style="text-align: right;">฿${item.price.toFixed(2)}</td>
      <td style="text-align: right;">฿${item.total.toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .container { max-width: 800px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
        .section { margin-bottom: 20px; }
        .section-title { font-weight: bold; font-size: 14px; margin-bottom: 10px; background: #f0f0f0; padding: 5px; }
        table { width: 100%; border-collapse: collapse; }
        th, td { padding: 8px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f9f9f9; font-weight: bold; }
        .text-right { text-align: right; }
        .totals { float: right; width: 300px; margin-top: 20px; }
        .barcode { text-align: center; font-size: 24px; margin: 20px 0; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h2>ใบปะหน้า - SHIPPING SLIP</h2>
          <p>Order ID: ${order.orderId}</p>
          <p>วันที่: ${date}</p>
        </div>

        <div class="section">
          <div class="section-title">ข้อมูลผู้รับ / RECIPIENT INFO</div>
          <p><strong>${order.customerName}</strong></p>
          <p>เบอร์โทร: ${order.customerPhone}</p>
          <p>${order.shippingAddress}</p>
          <p>${order.shippingCity} ${order.shippingProvince} ${order.shippingPostalCode}</p>
        </div>

        <div class="section">
          <div class="section-title">รายการสินค้า / ORDER ITEMS</div>
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>ชื่อสินค้า</th>
                <th style="text-align: center;">จำนวน</th>
                <th style="text-align: right;">ราคา/หน่วย</th>
                <th style="text-align: right;">รวม</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHTML}
            </tbody>
          </table>
        </div>

        <div class="totals">
          <table>
            <tr>
              <td><strong>รวมยอด:</strong></td>
              <td class="text-right">฿${order.subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td><strong>ค่าจัดส่ง:</strong></td>
              <td class="text-right">฿${order.shippingFee.toFixed(2)}</td>
            </tr>
            <tr style="border-top: 2px solid #333; border-bottom: 2px solid #333;">
              <td><strong>รวมทั้งสิ้น:</strong></td>
              <td class="text-right"><strong>฿${order.totalAmount.toFixed(2)}</strong></td>
            </tr>
          </table>
        </div>

        <div class="barcode">${order.orderId}</div>

        <div style="margin-top: 40px; border-top: 1px solid #ddd; padding-top: 10px; font-size: 12px;">
          <p>สถานะการชำระเงิน: ${order.paymentStatus}</p>
          <p>หมายเหตุ: ${order.notes || '-'}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}

export function generateInvoiceHTML(order) {
  const date = new Date(order.createdAt).toLocaleDateString('th-TH');
  
  const itemsHTML = order.items.map(item => `
    <tr>
      <td>${item.sku}</td>
      <td>${item.name}</td>
      <td style="text-align: center;">${item.quantity}</td>
      <td style="text-align: right;">฿${item.price.toFixed(2)}</td>
      <td style="text-align: right;">฿${item.total.toFixed(2)}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .container { max-width: 900px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #333; padding-bottom: 20px; }
        .header h1 { margin: 0; font-size: 28px; }
        .header p { margin: 5px 0; }
        .content { margin-bottom: 30px; }
        .section { margin-bottom: 25px; }
        .section-title { font-weight: bold; font-size: 13px; background: #f0f0f0; padding: 8px; }
        .two-column { display: flex; gap: 40px; }
        .column { flex: 1; }
        .column p { margin: 3px 0; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background: #f9f9f9; font-weight: bold; }
        .amount-column { text-align: right; }
        .totals { float: right; width: 350px; }
        .total-row { border-top: 2px solid #333; border-bottom: 2px solid #333; font-weight: bold; }
        .footer { margin-top: 40px; border-top: 1px solid #ddd; padding-top: 20px; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>ใบแจ้งหนี้/ใบเสร็จรับเงิน</h1>
          <p>INVOICE / RECEIPT</p>
        </div>

        <div class="content">
          <div class="section">
            <div class="section-title">ข้อมูลใบแจ้งหนี้</div>
            <div class="two-column">
              <div class="column">
                <p><strong>เลขที่ใบแจ้งหนี้:</strong> ${order.orderId}</p>
                <p><strong>วันที่:</strong> ${date}</p>
                <p><strong>สถานะ:</strong> ${order.status}</p>
              </div>
              <div class="column">
                <p><strong>สถานะชำระเงิน:</strong> ${order.paymentStatus}</p>
                <p><strong>วิธีชำระเงิน:</strong> ${order.paymentMethod || '-'}</p>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">ข้อมูลลูกค้า</div>
            <div class="two-column">
              <div class="column">
                <p><strong>ชื่อ:</strong> ${order.customerName}</p>
                <p><strong>เบอร์โทร:</strong> ${order.customerPhone}</p>
                <p><strong>อีเมล:</strong> ${order.customerEmail || '-'}</p>
              </div>
              <div class="column">
                <p><strong>ที่อยู่:</strong> ${order.shippingAddress}</p>
                <p>${order.shippingCity} ${order.shippingProvince} ${order.shippingPostalCode}</p>
              </div>
            </div>
          </div>

          <div class="section">
            <div class="section-title">รายการสินค้า</div>
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>ชื่อสินค้า</th>
                  <th class="amount-column">จำนวน</th>
                  <th class="amount-column">ราคา/หน่วย</th>
                  <th class="amount-column">รวม</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHTML}
              </tbody>
            </table>
          </div>

          <div class="totals">
            <table>
              <tr>
                <td>ราคาสินค้า:</td>
                <td class="amount-column">฿${order.subtotal.toFixed(2)}</td>
              </tr>
              <tr>
                <td>ค่าจัดส่ง:</td>
                <td class="amount-column">฿${order.shippingFee.toFixed(2)}</td>
              </tr>
              <tr>
                <td>ส่วนลด:</td>
                <td class="amount-column">-฿${order.discountAmount.toFixed(2)}</td>
              </tr>
              <tr>
                <td>ภาษีอากร:</td>
                <td class="amount-column">฿${order.taxAmount.toFixed(2)}</td>
              </tr>
              <tr class="total-row">
                <td>รวมทั้งสิ้น:</td>
                <td class="amount-column">฿${order.totalAmount.toFixed(2)}</td>
              </tr>
            </table>
          </div>

          <div class="footer" style="clear: both;">
            <p><strong>หมายเหตุ:</strong> ${order.notes || '-'}</p>
            <p style="margin-top: 20px; font-size: 11px; color: #666;">
              เอกสารนี้ออกโดยระบบจำหน่าย บันทึกไว้เพื่อการตรวจสอบหรือสอบสวน
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;
}
