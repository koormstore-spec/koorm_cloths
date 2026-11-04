const mockSendMail = jest.fn().mockResolvedValue({ messageId: 'test-id' });

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => ({ sendMail: mockSendMail })),
  getTestMessageUrl: undefined,
}));

const {
  sendOrderConfirmationToCustomer,
  sendOrderNotificationToAdmin,
  sendOrderCancellationToAdmin,
  sendCancellationRequestToAdmin,
  sendOrderStatusUpdateToCustomer,
  sendWelcomeEmail,
  sendVerificationCodeEmail,
  sendReturnRequestToAdmin,
  sendReturnUpdateToCustomer,
} = require('../utils/email');

const sampleOrder = {
  id: 42,
  customerEmail: 'jane@example.com',
  customerName: 'Jane',
  order_number: 'KRM123456',
  items: [{ product_name: 'Linen Shirt', size: 'M', quantity: 1, price: 1899 }],
  items_total: 1899,
  shipping_fee: 0,
  total_amount: 1899,
  shipping_name: 'Jane',
  shipping_phone: '9998887777',
  shipping_address_line1: '1 Main St',
  shipping_city: 'Pune',
  shipping_state: 'Maharashtra',
  shipping_pincode: '411001',
};

describe('return and exchange notifications', () => {
  it.each(['return', 'exchange'])('notifies the admin about a pending %s with escaped customer details', async requestType => {
    await sendReturnRequestToAdmin({ ...sampleOrder, request_type: requestType, reason: 'Size or fit issue', exchange_details: requestType === 'exchange' ? '<Size L>' : null });
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe(process.env.ADMIN_EMAIL);
    expect(mail.subject).toBe(`${requestType === 'exchange' ? 'Exchange' : 'Return'} requested - KRM123456`);
    expect(mail.html).toContain('awaiting approval');
    if (requestType === 'exchange') expect(mail.html).toContain('&lt;Size L&gt;');
  });

  it('tells an exchange customer their replacement is being arranged without promising a refund', async () => {
    await sendReturnUpdateToCustomer({ ...sampleOrder, request_type: 'exchange', status: 'received', admin_note: 'Size L confirmed' });
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe(sampleOrder.customerEmail);
    expect(mail.subject).toBe('Exchange update for order KRM123456');
    expect(mail.html).toContain('arranging your replacement');
    expect(mail.html).toContain('Size L confirmed');
    expect(mail.html).not.toContain('processing your refund');
  });
});

describe('sendOrderConfirmationToCustomer', () => {
  it('emails the customer, cc-ing the admin, with the order number in the subject', async () => {
    await sendOrderConfirmationToCustomer(sampleOrder);

    expect(mockSendMail).toHaveBeenCalledTimes(1);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe('jane@example.com');
    expect(mail.cc).toBe(process.env.ADMIN_EMAIL);
    expect(mail.subject).toContain('KRM123456');
    expect(mail.html).toContain('Jane');
    expect(mail.html).toContain('Linen Shirt');
    expect(mail.html).toContain(`href="${process.env.CLIENT_URL}/orders/42"`);
    expect(mail.html).toContain('View or Cancel Order');
    expect(mail.html).toContain(`href="${process.env.CLIENT_URL}/orders/42#returns"`);
    expect(mail.html).toContain('Return or Exchange');
    expect(mail.html).toContain('within 30 days after delivery and require admin approval');
    expect(mail.html).toContain(`href="${process.env.CLIENT_URL}"`);
    expect(mail.html).toContain('Back to Website');
  });
});

describe('sendOrderNotificationToAdmin', () => {
  it('emails the admin about the new order', async () => {
    await sendOrderNotificationToAdmin(sampleOrder);

    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe(process.env.ADMIN_EMAIL);
    expect(mail.subject).toContain('KRM123456');
    expect(mail.subject).toContain(sampleOrder.shipping_name);
  });

  it('embeds each ordered shirt photo in the admin email with its matching item details', async () => {
    await sendOrderNotificationToAdmin({ ...sampleOrder, items: [
      { product_name: 'Sand Beige Linen Shirt', product_image: '/images/collection-26/sand-beige-linen-shirt/1.jpg', size: 'M', quantity: 1, price: 1899 },
      { product_name: 'Dark Navy Cotton Shirt', product_image: '/images/collection-26/dark-navy-cotton-shirt/1.jpg', size: 'L', quantity: 2, price: 1999 },
    ] });

    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe(process.env.ADMIN_EMAIL);
    expect(mail.attachments).toHaveLength(2);
    for (const attachment of mail.attachments) {
      expect(mail.html).toContain(`src="cid:${attachment.cid}"`);
      expect(attachment.contentDisposition).toBe('inline');
      expect(attachment.contentType).toBe('image/jpeg');
      expect(Buffer.isBuffer(attachment.content)).toBe(true);
      expect(attachment.content.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    }
    expect(mail.html).toContain('alt="Sand Beige Linen Shirt"');
    expect(mail.html).toContain('alt="Dark Navy Cotton Shirt"');
    expect(mail.html).toContain('Size: M');
    expect(mail.html).toContain('Size: L');
    expect(mail.html).not.toContain('localhost');
  });

  it('includes embedded photos in the customer confirmation copied to Koorm too', async () => {
    await sendOrderConfirmationToCustomer({ ...sampleOrder, items: [
      { ...sampleOrder.items[0], product_image: '/images/collection-26/sand-beige-linen-shirt/1.jpg' },
    ] });

    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe(sampleOrder.customerEmail);
    expect(mail.cc).toBe(process.env.ADMIN_EMAIL);
    expect(mail.attachments).toHaveLength(1);
    expect(mail.html).toContain(`src="cid:${mail.attachments[0].cid}"`);
  });

  it('still sends all order details when photos are missing and escapes item HTML', async () => {
    const result = await sendOrderNotificationToAdmin({ ...sampleOrder, items: [
      { ...sampleOrder.items[0], product_name: 'Cotton & Linen <shirt>', product_image: '/images/missing-order-shirt.jpg' },
      { ...sampleOrder.items[0], product_name: 'No photo shirt' },
    ] });

    expect(result.sent).toBe(true);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.attachments).toEqual([]);
    expect(mail.html).toContain('https://koormcollection.com/images/missing-order-shirt.jpg');
    expect(mail.html).toContain('Cotton &amp; Linen &lt;shirt&gt;');
    expect(mail.html).toContain('No photo shirt');
    expect(mail.html).toContain('Total Payable');
  });
});

describe('sendOrderCancellationToAdmin', () => {
  it('notifies admin of a request with a review link and pending-approval wording', async () => {
    await sendCancellationRequestToAdmin(sampleOrder);
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe(process.env.ADMIN_EMAIL);
    expect(mail.subject).toBe('Cancellation approval required - KRM123456');
    expect(mail.html).toContain('The order is not cancelled yet.');
    expect(mail.html).toContain(`${process.env.CLIENT_URL}/admin/orders?search=KRM123456`);
  });

  it('emails the admin that the order was cancelled', async () => {
    await sendOrderCancellationToAdmin(sampleOrder);

    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe(process.env.ADMIN_EMAIL);
    expect(mail.subject).toContain('Cancelled');
    expect(mail.subject).toContain('KRM123456');
    expect(mail.html).toContain('cancelled by the customer');
  });
});

describe('sendOrderStatusUpdateToCustomer', () => {
  it('links delivered customers to their return and exchange options', async () => {
    await sendOrderStatusUpdateToCustomer({ ...sampleOrder, status: 'delivered' });
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.html).toContain('within 30 days of delivery');
    expect(mail.html).toContain('Both require admin approval');
    expect(mail.html).toContain(`href="${process.env.CLIENT_URL}/orders/42#returns"`);
    expect(mail.html).toContain('Request a Return or Exchange');
  });
  it('emails the customer with the new status in the subject and body', async () => {
    await sendOrderStatusUpdateToCustomer({ ...sampleOrder, status: 'shipped' });

    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe('jane@example.com');
    expect(mail.subject).toContain('shipped');
    expect(mail.html).toContain('on its way');
  });

  it('renders without an items table when items are not supplied', async () => {
    await sendOrderStatusUpdateToCustomer({ ...sampleOrder, items: undefined, status: 'delivered' });

    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.html).not.toContain('<table');
  });
});

describe('sendWelcomeEmail', () => {
  it('emails the new user with a link back to the shop', async () => {
    await sendWelcomeEmail({ name: 'Jane', email: 'jane@example.com' });

    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe('jane@example.com');
    expect(mail.subject).toContain('Welcome');
    expect(mail.html).toContain('/shop');
  });
});

describe('return and exchange emails', () => {
  it.each(['return', 'exchange'])('notifies admin and links to review a %s', async request_type => {
    await sendReturnRequestToAdmin({ ...sampleOrder, request_type, reason: 'Size or fit issue', exchange_details: request_type === 'exchange' ? 'Size L & blue' : null });
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe(process.env.ADMIN_EMAIL);
    expect(mail.html).toContain('awaiting approval');
    expect(mail.html).toContain(`href="${process.env.CLIENT_URL}/admin/returns"`);
    if (request_type === 'exchange') expect(mail.html).toContain('Size L &amp; blue');
  });

  it.each(['return', 'exchange'])('emails the customer after a %s is approved', async request_type => {
    await sendReturnUpdateToCustomer({ ...sampleOrder, request_type, status: 'approved', admin_note: 'Pickup tomorrow' });
    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe(sampleOrder.customerEmail);
    expect(mail.html).toContain(`Your ${request_type} has been approved`);
    expect(mail.html).toContain('Pickup tomorrow');
  });
});

describe('sendVerificationCodeEmail', () => {
  it('emails the code to the user, with the code visible in both subject and body', async () => {
    await sendVerificationCodeEmail({ name: 'Jane', email: 'jane@example.com', code: '482913' });

    const mail = mockSendMail.mock.calls[0][0];
    expect(mail.to).toBe('jane@example.com');
    expect(mail.subject).toContain('482913');
    expect(mail.html).toContain('482913');
    expect(mail.html).toContain('10 minutes');
  });
});
