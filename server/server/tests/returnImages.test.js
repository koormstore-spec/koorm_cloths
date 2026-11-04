const { validateReturnImages } = require('../utils/returnImages');
const photo = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';

it('allows size issues without photos', () => {
  expect(validateReturnImages(undefined, 'Size or fit issue')).toEqual([]);
});

it.each([
  [null], ['not an array'], [[photo, photo, photo, photo]],
  [['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=']],
  [['data:image/png;base64,SGVsbG8=']],
  [['https://example.com/photo.jpg']],
  [[photo.replace('image/png', 'image/jpeg')]],
  [[`data:image/png;base64,${Buffer.alloc(2 * 1024 * 1024 + 1).toString('base64')}`]],
])('rejects invalid, spoofed, excessive or oversized photo uploads (case %#)', images => {
  expect(() => validateReturnImages(images, 'Damaged or defective')).toThrow();
});

it('decodes valid photos to binary for storage', () => {
  expect(validateReturnImages([photo], 'Damaged or defective')).toEqual([{ contentType: 'image/png', data: Buffer.from(photo.split(',')[1], 'base64') }]);
});
