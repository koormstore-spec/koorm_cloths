const fs = require('node:fs/promises');
const path = require('node:path');
const { existsSync } = require('node:fs');

// The client sits beside the server, either flat (client/) or nested (client/client/).
const DEFAULT_IMAGE_ROOTS = [
  path.join(__dirname, '../../client/public/images'),
  path.join(__dirname, '../../../client/client/public/images'),
];
const defaultImageRoot = () => DEFAULT_IMAGE_ROOTS.find((root) => existsSync(root)) || DEFAULT_IMAGE_ROOTS[0];

const IMAGE_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
const isWithin = (root, file) => {
  const relative = path.relative(root, file);
  return relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

const publicImageUrl = source => {
  try {
    const url = new URL(source, process.env.EMAIL_ASSET_BASE_URL || 'https://koormcollection.com');
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
};

const resolveImage = async (source, index) => {
  if (typeof source !== 'string' || !source.trim()) return {};
  source = source.trim();
  // Remote product photos remain links; never fetch arbitrary URLs on the server.
  if (/^https?:\/\//i.test(source)) return { src: publicImageUrl(source) };
  if (!source.startsWith('/images/')) return {};

  let imagePath;
  try { imagePath = decodeURIComponent(source.split(/[?#]/)[0]).slice('/images/'.length); }
  catch { return {}; }
  if (imagePath.includes('\\') || imagePath.includes('\0')) return {};
  const contentType = IMAGE_TYPES[path.extname(imagePath).toLowerCase()];
  if (!contentType) return {};
  const root = path.resolve(process.env.EMAIL_IMAGE_ROOT || defaultImageRoot());
  const file = path.resolve(root, imagePath);
  if (!isWithin(root, file)) return {};

  try {
    const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(file)]);
    if (!isWithin(realRoot, realFile)) return {};
    const content = await fs.readFile(realFile);
    const cid = `shirt-${index + 1}@koormcollection.com`;
    return {
      src: `cid:${cid}`,
      attachment: { filename: `shirt-${index + 1}${path.extname(imagePath).toLowerCase()}`, content, contentType, contentDisposition: 'inline', cid },
    };
  } catch {
    // A missing catalogue file must not prevent the order notification.
    return { src: publicImageUrl(source) };
  }
};

const prepareOrderImages = async order => {
  const images = new Map();
  const items = await Promise.all((order.items || []).map(async (item, index) => {
    if (!images.has(item.product_image)) images.set(item.product_image, resolveImage(item.product_image, index));
    const image = await images.get(item.product_image);
    return { ...item, email_image: image.src || '' };
  }));
  const resolved = await Promise.all(images.values());
  return { order: { ...order, items }, attachments: resolved.flatMap(image => image.attachment ? [image.attachment] : []) };
};

module.exports = { prepareOrderImages };
