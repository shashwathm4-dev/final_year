// One-off script: builds PWA icons from public/favicon.svg onto the app's dark background.
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('public/icons', { recursive: true });

for (const size of [192, 512]) {
  const glyph = await sharp('public/favicon.svg', { density: 384 })
    .resize(Math.round(size * 0.65), Math.round(size * 0.65), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  await sharp({ create: { width: size, height: size, channels: 4, background: '#0a0e1a' } })
    .composite([{ input: glyph, gravity: 'centre' }])
    .png()
    .toFile(`public/icons/icon-${size}.png`);
}
console.log('Icons written to public/icons');
