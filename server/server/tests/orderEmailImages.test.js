jest.mock('node:fs/promises', () => ({ realpath: jest.fn(), readFile: jest.fn() }));

const fs = require('node:fs/promises');
const path = require('node:path');
const { prepareOrderImages } = require('../utils/orderEmailImages');
const originalRoot = process.env.EMAIL_IMAGE_ROOT;
const originalBase = process.env.EMAIL_ASSET_BASE_URL;
const root = path.resolve(__dirname, 'fixtures', 'images');
const photo = '/images/collection-26/sand-beige-linen-shirt/1.jpg';
const orderWith = (...images) => ({ items: images.map(product_image => ({ product_image, product_name: 'Shirt', size: 'M', quantity: 1, price: 1899 })) });

beforeEach(() => {
  process.env.EMAIL_IMAGE_ROOT = root;
  process.env.EMAIL_ASSET_BASE_URL = 'https://store.example';
  fs.realpath.mockImplementation(async file => file);
  fs.readFile.mockResolvedValue(Buffer.from('shirt-photo'));
});

afterAll(() => {
  if (originalRoot === undefined) delete process.env.EMAIL_IMAGE_ROOT;
  else process.env.EMAIL_IMAGE_ROOT = originalRoot;
  if (originalBase === undefined) delete process.env.EMAIL_ASSET_BASE_URL;
  else process.env.EMAIL_ASSET_BASE_URL = originalBase;
});

it('embeds each distinct image once, even when the same shirt has multiple sizes', async () => {
  const original = orderWith(photo, photo, '/images/collection-26/dark-navy-cotton-shirt/1.jpg');
  original.items[1].size = 'L';
  const { order, attachments } = await prepareOrderImages(original);

  expect(attachments).toHaveLength(2);
  expect(fs.readFile).toHaveBeenCalledTimes(2);
  expect(order.items[0].email_image).toBe(order.items[1].email_image);
  expect(order.items[2].email_image).not.toBe(order.items[0].email_image);
  for (const item of order.items) expect(attachments.some(attachment => item.email_image === `cid:${attachment.cid}`)).toBe(true);
  expect(original.items[0]).not.toHaveProperty('email_image');
});

it('links external product images without reading files or fetching their URLs', async () => {
  const { order, attachments } = await prepareOrderImages(orderWith('https://cdn.example/shirt.jpg?color=blue&view=1'));
  expect(order.items[0].email_image).toBe('https://cdn.example/shirt.jpg?color=blue&view=1');
  expect(attachments).toEqual([]);
  expect(fs.readFile).not.toHaveBeenCalled();
  expect(fs.realpath).not.toHaveBeenCalled();
});

it('falls back to the public photo URL if local images cannot be read', async () => {
  fs.readFile.mockRejectedValueOnce(new Error('missing file'));
  const { order, attachments } = await prepareOrderImages(orderWith(photo));
  expect(order.items[0].email_image).toBe(`https://store.example${photo}`);
  expect(attachments).toEqual([]);
});

it.each([undefined, '', 'javascript:alert(1)', 'file:///private.jpg', '//private/shirt.jpg', '/images/../private.jpg', '/images/%2e%2e/private.jpg', '/images/..%5cprivate.jpg', '/images/%00.jpg', '/images/secret.txt', 'https://user:password@example.com/shirt.jpg'])('ignores unsafe or missing image source %s', async source => {
  const { order, attachments } = await prepareOrderImages(orderWith(source));
  expect(order.items[0].email_image).toBe('');
  expect(attachments).toEqual([]);
  expect(fs.readFile).not.toHaveBeenCalled();
});

it('does not attach a symlink that resolves outside the catalogue images directory', async () => {
  fs.realpath.mockImplementation(async file => file === root ? root : path.resolve(root, '..', 'private.jpg'));
  const { order, attachments } = await prepareOrderImages(orderWith(photo));
  expect(order.items[0].email_image).toBe('');
  expect(attachments).toEqual([]);
  expect(fs.readFile).not.toHaveBeenCalled();
});
