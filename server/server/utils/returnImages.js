const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const invalid = message => Object.assign(new Error(message), { statusCode: 400 });

function validateReturnImages(value, reason) {
  const images = value === undefined ? [] : value;
  if (!Array.isArray(images) || images.length > MAX_IMAGES) throw invalid('Upload up to 3 clothing photos.');
  if (reason === 'Damaged or defective' && images.length === 0) {
    throw invalid('Upload at least one photo showing the damaged or defective clothing.');
  }
  return images.map(image => {
    if (typeof image !== 'string' || image.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 50) {
      throw invalid('Each photo must be a JPG, PNG or WebP image no larger than 2 MB.');
    }
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
    if (!match) throw invalid('Upload only JPG, PNG or WebP photos.');
    const [, contentType, encoded] = match;
    const data = Buffer.from(encoded, 'base64');
    if (data.length > MAX_IMAGE_BYTES || data.toString('base64') !== encoded) throw invalid('Invalid photo or photo larger than 2 MB.');
    const valid = contentType === 'image/jpeg'
      ? data.length >= 4 && data.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) && data.subarray(-2).equals(Buffer.from([0xff, 0xd9]))
      : contentType === 'image/png'
        ? data.length >= 24 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && data.toString('ascii', 12, 16) === 'IHDR'
        : data.length >= 20 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
    if (!valid) throw invalid('The photo content does not match its image format. Choose a JPG, PNG or WebP photo.');
    return { contentType, data };
  });
}

module.exports = { validateReturnImages };
