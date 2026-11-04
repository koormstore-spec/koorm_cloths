const nodemailer = require('nodemailer');
const { prepareOrderImages } = require('./orderEmailImages');

let cachedTransporter = null;

// Falls back to an Ethereal test inbox (preview URL logged to console) when no
// real SMTP credentials are configured, and to a console-only simulation if
// even that fails — so order placement never breaks for lack of email setup.
const createTransporter = async () => {
  if (cachedTransporter) return cachedTransporter;

  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    cachedTransporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    return cachedTransporter;
  }

  try {
    const testAccount = await nodemailer.createTestAccount();
    cachedTransporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
    console.warn('EMAIL_USER/EMAIL_PASS not set — using a temporary Ethereal test inbox for emails.');
    return cachedTransporter;
  } catch (err) {
    console.warn('Ethereal test account unavailable, falling back to console simulation:', err.message);
    cachedTransporter = {
      sendMail: async (mailOptions) => {
        console.log('--- EMAIL DISPATCH SIMULATION ---');
        console.log('To:', mailOptions.to);
        console.log('Subject:', mailOptions.subject);
        return { messageId: 'simulated-' + Date.now() };
      },
    };
    return cachedTransporter;
  }
};

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'koormstore@gmail.com';
const FROM_ADDRESS = process.env.EMAIL_USER ? `"Koorm Store" <${process.env.EMAIL_USER}>` : '"Koorm Store" <orders@koorm.com>';

const formatCurrency = (amount) => `₹${Number(amount).toLocaleString('en-IN')}`;

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

const itemsListHtml = (items) =>
  items
    .map(
      (item) => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #eee;">
          ${item.email_image ? `<img src="${escapeHtml(item.email_image)}" alt="${escapeHtml(item.product_name || item.name || 'Ordered shirt')}" width="72" height="96" style="display:block;width:72px;height:96px;object-fit:cover;border:0;border-radius:4px;margin-bottom:8px;" />` : ''}
          <strong>${escapeHtml(item.product_name || item.name)}</strong><br/>
          <span style="color:#666;font-size:12px;">Size: ${escapeHtml(item.size)}</span>
        </td>
        <td style="padding:10px;border-bottom:1px solid #eee;text-align:center;">${item.quantity}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(item.price)}</td>
        <td style="padding:10px;border-bottom:1px solid #eee;text-align:right;">${formatCurrency(item.price * item.quantity)}</td>
      </tr>`
    )
    .join('');

const emailShell = (headerSubtitle, bodyHtml) => `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
    <div style="background-color:#1a1a1a;color:#ffffff;padding:20px;text-align:center;">
      <h1 style="margin:0;font-size:24px;letter-spacing:2px;">KOORM</h1>
      <p style="margin:5px 0 0;color:#c8a97e;font-size:14px;">${headerSubtitle}</p>
    </div>
    <div style="padding:24px;background-color:#ffffff;">${bodyHtml}</div>
  </div>
`;

const addressBlockHtml = (order) => `
  <div style="background-color:#f9f9f9;padding:16px;border-radius:6px;margin:20px 0;">
    <h3 style="margin-top:0;font-size:14px;text-transform:uppercase;color:#666;">Delivery Address</h3>
    <p style="margin:4px 0;color:#333;"><strong>${order.shipping_name}</strong></p>
    <p style="margin:4px 0;color:#333;">${order.shipping_address_line1}${order.shipping_address_line2 ? `, ${order.shipping_address_line2}` : ''}</p>
    <p style="margin:4px 0;color:#333;">${order.shipping_city}, ${order.shipping_state} - ${order.shipping_pincode}</p>
    <p style="margin:4px 0;color:#333;">Phone: ${order.shipping_phone}</p>
    <p style="margin:4px 0;color:#333;">Email: ${order.customerEmail}</p>
  </div>
`;

const paidOnline = (order) => order.payment_method === 'ONLINE';

const orderSummaryTableHtml = (order) => `
  <h3 style="font-size:14px;text-transform:uppercase;color:#666;margin-top:24px;">Order Summary</h3>
  <table style="width:100%;border-collapse:collapse;margin-top:10px;">
    <thead>
      <tr style="background-color:#f1f1f1;text-align:left;">
        <th style="padding:10px;">Item</th>
        <th style="padding:10px;text-align:center;">Qty</th>
        <th style="padding:10px;text-align:right;">Price</th>
        <th style="padding:10px;text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>${itemsListHtml(order.items)}</tbody>
  </table>
  <div style="margin-top:20px;text-align:right;">
    <p style="margin:4px 0;">Subtotal: <strong>${formatCurrency(order.items_total)}</strong></p>
    ${Number(order.discount_amount) > 0 ? `<p style="margin:4px 0;color:#166534;">Coupon ${order.coupon_code ? `(${order.coupon_code})` : ''}: <strong>-${formatCurrency(order.discount_amount)}</strong></p>` : ''}
    <p style="margin:4px 0;">Shipping: <strong>${Number(order.shipping_fee) === 0 ? 'FREE' : formatCurrency(order.shipping_fee)}</strong></p>
    <h2 style="margin:10px 0 0;color:#1a1a1a;">${paidOnline(order) ? 'Total Paid' : 'Total Payable'}: ${formatCurrency(order.total_amount)}</h2>
    <p style="margin:4px 0;color:#166534;font-weight:bold;">Payment Method: ${paidOnline(order) ? 'Paid online' : 'Cash on Delivery (COD)'}</p>
  </div>
`;

const sendMail = async (mailOptions) => {
  try {
    const transporter = await createTransporter();
    const info = await transporter.sendMail({ from: FROM_ADDRESS, ...mailOptions });
    if (nodemailer.getTestMessageUrl) {
      const previewUrl = nodemailer.getTestMessageUrl(info);
      if (previewUrl) console.log('Email preview URL:', previewUrl);
    }
    return { sent: true };
  } catch (err) {
    console.error('Failed to send email:', err.message);
    return { sent: false, error: err.message };
  }
};

const sendOrderConfirmationToCustomer = async (order) => {
  const { order: illustratedOrder, attachments } = await prepareOrderImages(order);
  const websiteUrl = (process.env.CLIENT_URL || 'https://koormcollection.com').replace(/\/+$/, '');
  const orderUrl = order.id ? `${websiteUrl}/orders/${encodeURIComponent(order.id)}` : `${websiteUrl}/profile`;
  const body = `
    <h2 style="color:#333;margin-top:0;">Thank you for your order, ${order.customerName}!</h2>
    <p style="color:#555;">We have received your order <strong>${order.order_number}</strong> and are preparing it for delivery.</p>
    <div style="margin:24px 0;text-align:center;">
      <a href="${escapeHtml(orderUrl)}" style="display:inline-block;background-color:#1a1a1a;color:#ffffff;padding:14px 24px;border-radius:4px;text-decoration:none;font-size:14px;font-weight:bold;">View or Cancel Order</a>
      <p style="margin:12px 0;font-size:13px;color:#666;">Sign in with the email used for this order to view its status or request cancellation before it ships. Cancellation requires admin approval.</p>
      <a href="${escapeHtml(order.id ? `${orderUrl}#returns` : orderUrl)}" style="display:inline-block;background-color:#ffffff;color:#1a1a1a;padding:14px 24px;border:1px solid #1a1a1a;border-radius:4px;text-decoration:none;font-size:14px;font-weight:bold;">Return or Exchange</a>
      <p style="margin:12px 0;font-size:13px;color:#666;">Returns and exchanges are available within 30 days after delivery and require admin approval. Sign in with the email used for this order, then choose your request.</p>
      <a href="${escapeHtml(websiteUrl)}" style="color:#555;font-size:14px;text-decoration:underline;">Back to Website</a>
    </div>
    ${addressBlockHtml(order)}
    ${orderSummaryTableHtml(illustratedOrder)}
    <div style="margin-top:30px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#888;text-align:center;">
      <p>${paidOnline(order) ? 'Your online payment has been received. Nothing more is due on delivery.' : 'This is a Cash on Delivery (COD) order. Please keep the exact amount ready upon delivery.'}</p>
      <p>If you have any questions, reply to this email or contact support@koorm.com.</p>
    </div>
  `;

  return sendMail({
    to: order.customerEmail,
    cc: ADMIN_EMAIL,
    subject: `Order Confirmation ${order.order_number} - KOORM Store`,
    html: emailShell(paidOnline(order) ? 'Order Confirmation (Paid Online)' : 'Order Confirmation (Cash on Delivery)', body),
    attachments,
  });
};

const sendOrderNotificationToAdmin = async (order) => {
  const { order: illustratedOrder, attachments } = await prepareOrderImages(order);
  const body = `
    <h2 style="color:#333;margin-top:0;">🔔 New Order Received!</h2>
    <p style="color:#555;">Order <strong>${order.order_number}</strong> has been placed successfully.</p>
    ${addressBlockHtml(order)}
    ${orderSummaryTableHtml(illustratedOrder)}
    <div style="margin-top:30px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#888;text-align:center;">
      <p>KOORM Admin Notification System</p>
    </div>
  `;

  return sendMail({
    to: ADMIN_EMAIL,
    subject: `🔔 New Order Received ${order.order_number} - Deliver to ${order.shipping_name}`,
    html: emailShell('Admin Order Notification', body),
    attachments,
  });
};

const sendCancellationRequestToAdmin = async (order) => {
  const websiteUrl = (process.env.CLIENT_URL || 'https://koormcollection.com').replace(/\/+$/, '');
  const reviewUrl = `${websiteUrl}/admin/orders?search=${encodeURIComponent(order.order_number)}`;
  const body = `
    <h2 style="color:#333;margin-top:0;">Cancellation approval required</h2>
    <p style="color:#555;">${escapeHtml(order.customerName)} (${escapeHtml(order.customerEmail)}) requested cancellation of order <strong>${escapeHtml(order.order_number)}</strong>.</p>
    <p style="color:#555;">Please hold packing and shipping. The order is not cancelled yet. Approve the request in Customer orders to cancel it, return the items to stock, and start any online payment refund.</p>
    <p style="color:#555;">Order total: <strong>${formatCurrency(order.total_amount)}</strong></p>
    <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background-color:#1a1a1a;color:#ffffff;padding:14px 24px;border-radius:4px;text-decoration:none;font-size:14px;">Review Cancellation Request</a>
  `;
  return sendMail({
    to: ADMIN_EMAIL,
    subject: `Cancellation approval required - ${order.order_number}`,
    html: emailShell('Cancellation Request', body),
  });
};

const sendOrderCancellationToAdmin = async (order) => {
  const body = `
    <h2 style="color:#333;margin-top:0;">❌ Order Cancelled</h2>
    <p style="color:#555;">Order <strong>${order.order_number}</strong> was just cancelled by the customer. Please stop any packing or shipping in progress.</p>
    <p style="color:#555;">Customer: <strong>${order.customerName}</strong> (${order.customerEmail})</p>
    ${order.items && order.items.length ? `
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <thead>
          <tr style="background-color:#f1f1f1;text-align:left;">
            <th style="padding:10px;">Item</th>
            <th style="padding:10px;text-align:center;">Qty</th>
            <th style="padding:10px;text-align:right;">Price</th>
            <th style="padding:10px;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${itemsListHtml(order.items)}</tbody>
      </table>` : ''}
    <p style="margin-top:12px;font-weight:bold;">Order total: ${formatCurrency(order.total_amount)}</p>
    <p style="color:#555;">Was being shipped to: ${order.shipping_name}, ${order.shipping_city}, ${order.shipping_state} - ${order.shipping_pincode}</p>
    <div style="margin-top:30px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#888;text-align:center;">
      <p>KOORM Admin Notification System</p>
    </div>
  `;

  return sendMail({
    to: ADMIN_EMAIL,
    subject: `❌ Order Cancelled - ${order.order_number}`,
    html: emailShell('Order Cancellation Notice', body),
  });
};

const STATUS_MESSAGES = {
  placed: 'Your order has been placed.',
  processing: 'Your order is being prepared for shipment.',
  shipped: 'Your order is on its way!',
  delivered: 'Your order has been delivered. We hope you love it!',
  cancelled: 'Your order has been cancelled.',
};

const sendOrderStatusUpdateToCustomer = async (order) => {
  const websiteUrl = (process.env.CLIENT_URL || 'https://koormcollection.com').replace(/\/+$/, '');
  const orderUrl = order.id ? `${websiteUrl}/orders/${encodeURIComponent(order.id)}` : `${websiteUrl}/profile`;
  const statusMessage = STATUS_MESSAGES[order.status] || `Your order status is now: ${order.status}.`;
  const body = `
    <h2 style="color:#333;margin-top:0;">Hi ${order.customerName}, your order status has been updated</h2>
    ${order.status === 'delivered' ? `<p style="color:#555;">You can request a return or exchange within 30 days of delivery. Both require admin approval.</p><p><a href="${escapeHtml(order.id ? `${orderUrl}#returns` : orderUrl)}" style="display:inline-block;background-color:#1a1a1a;color:#ffffff;padding:14px 24px;border-radius:4px;text-decoration:none;font-size:14px;">Request a Return or Exchange</a></p>` : ''}
    <p style="color:#555;">Order <strong>${order.order_number}</strong></p>
    <p style="background:#f9f9f9;padding:14px 18px;border-radius:6px;font-weight:bold;text-transform:capitalize;color:#166534;">
      Status: ${order.status} — ${statusMessage}
    </p>
    ${order.items && order.items.length ? `
      <table style="width:100%;border-collapse:collapse;margin-top:16px;">
        <thead>
          <tr style="background-color:#f1f1f1;text-align:left;">
            <th style="padding:10px;">Item</th>
            <th style="padding:10px;text-align:center;">Qty</th>
            <th style="padding:10px;text-align:right;">Price</th>
            <th style="padding:10px;text-align:right;">Total</th>
          </tr>
        </thead>
        <tbody>${itemsListHtml(order.items)}</tbody>
      </table>` : ''}
    <p style="margin-top:12px;">Order total (${paidOnline(order) ? 'Paid online' : 'Pay on Delivery'}): <strong>${formatCurrency(order.total_amount)}</strong></p>
    ${Number(order.refund_amount) > 0 ? `<p style="color:#166534;">A refund of <strong>${formatCurrency(order.refund_amount)}</strong> has been started to your original payment method. It usually reaches you in 5–7 working days.</p>` : ''}
    <p style="color:#555;">Shipping to: ${order.shipping_name}, ${order.shipping_city}, ${order.shipping_state} - ${order.shipping_pincode}</p>
    <div style="margin-top:30px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#888;text-align:center;">
      <p>KOORM — Thoughtfully designed clothing for everyday living.</p>
    </div>
  `;

  return sendMail({
    to: order.customerEmail,
    subject: `Order Update - ${order.order_number} is now ${order.status}`,
    html: emailShell('Order Status Update', body),
  });
};

const sendRefundInitiatedToCustomer = async (refund) => {
  const toOriginalPayment = refund.method === 'razorpay';
  const howItArrives = toOriginalPayment
    ? 'We have refunded this amount to your original payment method. Banks usually take 5–7 working days to show it in your account.'
    : `We have sent this amount to you directly${refund.reference ? ` (reference: ${escapeHtml(refund.reference)})` : ''}.`;
  const body = `
    <h2 style="color:#333;margin-top:0;">Hi ${escapeHtml(refund.customerName)}, your refund is on its way</h2>
    <p style="color:#555;">Order <strong>${escapeHtml(refund.order_number)}</strong></p>
    <p style="background:#f9f9f9;padding:14px 18px;border-radius:6px;font-weight:bold;color:#166534;">Refund: ${formatCurrency(refund.amount)}</p>
    <p style="color:#555;">${howItArrives}</p>
    ${refund.reason ? `<p style="color:#555;">Reason: ${escapeHtml(refund.reason)}</p>` : ''}
    <div style="margin-top:30px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#888;text-align:center;">
      <p>KOORM — Thoughtfully designed clothing for everyday living.</p>
    </div>
  `;
  return sendMail({
    to: refund.customerEmail,
    subject: `Refund of ${formatCurrency(refund.amount)} for order ${refund.order_number}`,
    html: emailShell('Refund Update', body),
  });
};

const RETURN_MESSAGES = {
  requested: 'We have received your return request and will review it shortly.',
  approved: 'Your return has been approved. Please pack the items; we will arrange the pickup.',
  rejected: 'We are unable to accept this return.',
  received: 'We have received your returned items and are processing your refund.',
  refunded: 'Your return is complete and your refund has been issued.',
};

const sendReturnUpdateToCustomer = async (request) => {
  const type = request.request_type === 'exchange' ? 'Exchange' : 'Return';
  const messages = type === 'Exchange' ? {
    requested: 'We have received your exchange request. It is awaiting admin approval.',
    approved: 'Your exchange has been approved. Please pack the items; we will arrange the pickup.',
    rejected: 'We are unable to accept this exchange.',
    received: 'We have received your items and are arranging your replacement.',
    exchanged: 'Your exchange is complete.',
  } : RETURN_MESSAGES;
  const body = `
    <h2 style="color:#333;margin-top:0;">Hi ${escapeHtml(request.customerName)}, an update on your ${type.toLowerCase()}</h2>
    <p style="color:#555;">Order <strong>${escapeHtml(request.order_number)}</strong></p>
    <p style="background:#f9f9f9;padding:14px 18px;border-radius:6px;font-weight:bold;color:#166534;">${messages[request.status] || `${type} status: ${escapeHtml(request.status)}`}</p>
    ${request.admin_note ? `<p style="color:#555;">Note from Koorm: ${escapeHtml(request.admin_note)}</p>` : ''}
    <div style="margin-top:30px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#888;text-align:center;">
      <p>KOORM — Thoughtfully designed clothing for everyday living.</p>
    </div>
  `;
  return sendMail({
    to: request.customerEmail,
    subject: `${type} update for order ${request.order_number}`,
    html: emailShell(`${type} Update`, body),
  });
};

const sendReturnRequestToAdmin = async (request) => {
  const type = request.request_type === 'exchange' ? 'Exchange' : 'Return';
  const reviewUrl = `${(process.env.CLIENT_URL || 'https://koormcollection.com').replace(/\/+$/, '')}/admin/returns`;
  const body = `
    <h2 style="color:#333;margin-top:0;">New ${type.toLowerCase()} request awaiting approval</h2>
    <p style="color:#555;">Order <strong>${escapeHtml(request.order_number)}</strong> from ${escapeHtml(request.customerName)} (${escapeHtml(request.customerEmail)})</p>
    <p style="color:#555;">Reason: <strong>${escapeHtml(request.reason)}</strong></p>
    ${request.note ? `<p style="color:#555;">Customer note: ${escapeHtml(request.note)}</p>` : ''}
    ${request.exchange_details ? `<p style="color:#555;">Requested replacement: ${escapeHtml(request.exchange_details)}</p>` : ''}
    ${request.image_count ? `<p style="color:#555;">${Number(request.image_count)} clothing photo(s) attached to the request. Open the admin review page to view them.</p>` : ''}
    <p style="color:#555;">Review and approve or decline it in the admin panel under Returns &amp; exchanges.</p>
    <a href="${escapeHtml(reviewUrl)}" style="display:inline-block;background-color:#1a1a1a;color:#ffffff;padding:14px 24px;border-radius:4px;text-decoration:none;font-size:14px;">Review ${type} Request</a>
  `;
  return sendMail({
    to: ADMIN_EMAIL,
    subject: `${type} requested - ${request.order_number}`,
    html: emailShell(`${type} Request`, body),
  });
};

const sendWelcomeEmail = async (user) => {
  const body = `
    <h2 style="color:#333;margin-top:0;">Welcome to Koorm, ${user.name}!</h2>
    <p style="color:#555;">Your account has been created successfully with <strong>${user.email}</strong>.</p>
    <p style="color:#555;">Thoughtfully designed everyday clothing — premium fabrics, honest pricing, and the choice to pay online or with cash on delivery.</p>
    <div style="text-align:center;margin:28px 0;">
      <a href="${process.env.NODE_ENV === 'production' ? 'https://koormcollection.com' : 'http://localhost:5173'}/shop" 
         style="background-color:#1a1a1a;color:#ffffff;padding:12px 28px;text-decoration:none;border-radius:4px;display:inline-block;letter-spacing:1px;text-transform:uppercase;font-size:13px;">
        Start Shopping
      </a>
    </div>
    <div style="margin-top:30px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#888;text-align:center;">
      <p>If you didn't create this account, please ignore this email or contact support@koorm.com.</p>
    </div>
  `;

  return sendMail({
    to: user.email,
    subject: 'Welcome to Koorm — Your account is ready',
    html: emailShell('Account Created', body),
  });
};

const sendVerificationCodeEmail = async (user) => {
  const body = `
    <h2 style="color:#333;margin-top:0;">Verify your email, ${user.name}</h2>
    <p style="color:#555;">Use the code below to verify <strong>${user.email}</strong> and finish setting up your Koorm account.</p>
    <div style="text-align:center;margin:28px 0;">
      <span style="display:inline-block;background-color:#f9f9f9;border:1px dashed #ccc;border-radius:6px;padding:16px 32px;font-size:32px;font-weight:bold;letter-spacing:8px;color:#1a1a1a;">
        ${user.code}
      </span>
    </div>
    <p style="color:#555;font-size:13px;text-align:center;">This code expires in 10 minutes.</p>
    <div style="margin-top:30px;padding-top:20px;border-top:1px solid #eee;font-size:12px;color:#888;text-align:center;">
      <p>If you didn't create a Koorm account, you can safely ignore this email.</p>
    </div>
  `;

  return sendMail({
    to: user.email,
    subject: `${user.code} is your Koorm verification code`,
    html: emailShell('Verify Your Email', body),
  });
};

// admin.purpose is 'reset' for a forgotten password, otherwise first-time setup.
const sendAdminVerificationCodeEmail = async (admin) => {
  const isReset = admin.purpose === 'reset';
  const body = `
    <h2 style="color:#333;margin-top:0;">${isReset ? 'Reset your Koorm admin password' : 'Set up your Koorm admin account'}</h2>
    <p style="color:#555;">Use this code to verify <strong>${admin.email}</strong> and ${isReset ? 'choose a new admin password' : 'create your admin password'}.</p>
    <div style="text-align:center;margin:28px 0;">
      <span style="display:inline-block;background-color:#f9f9f9;border:1px dashed #ccc;border-radius:6px;padding:16px 32px;font-size:32px;font-weight:bold;letter-spacing:8px;color:#1a1a1a;">${admin.code}</span>
    </div>
    <p style="color:#555;font-size:13px;text-align:center;">This code expires in 10 minutes.</p>
  `;

  return sendMail({
    to: admin.email,
    subject: `${admin.code} is your Koorm admin verification code`,
    html: emailShell(isReset ? 'Admin Password Reset' : 'Admin Account Setup', body),
  });
};

module.exports = {
  sendOrderConfirmationToCustomer,
  sendOrderNotificationToAdmin,
  sendOrderCancellationToAdmin,
  sendCancellationRequestToAdmin,
  sendOrderStatusUpdateToCustomer,
  sendWelcomeEmail,
  sendVerificationCodeEmail,
  sendAdminVerificationCodeEmail,
  sendRefundInitiatedToCustomer,
  sendReturnUpdateToCustomer,
  sendReturnRequestToAdmin,
};
