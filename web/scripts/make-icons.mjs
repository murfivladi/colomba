// Растеризация иконок PWA из SVG (нужен Playwright с Chromium).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
const maskable = svg.replace('rx="14"', 'rx="0"').replace('<path', '<g transform="translate(6.4 6.4) scale(0.8)"><path').replace('</svg>', '</g></svg>');
const badge = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M12 40 C18 24 34 22 42 28 L50 20 L48 32 C54 40 46 52 32 50 C22 50 15 46 12 40 Z" fill="#fff"/></svg>`;
const jobs = [['icon-192.png', svg, 192], ['icon-512.png', svg, 512], ['icon-maskable-512.png', maskable, 512], ['apple-touch-icon.png', maskable, 180], ['badge.png', badge, 96]];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, s, size] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${s.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: path.join(dir, name), omitBackground: true });
  console.log(name);
}
await browser.close();
