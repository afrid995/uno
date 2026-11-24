import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const CHROME_PATH = 'C:\\Users\\Shaik Afrid\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe';
const svgPath = path.resolve('apps/web/public/card-icon.svg');
const svgContent = fs.readFileSync(svgPath, 'utf8');

async function generate() {
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  try {
    const targets = [
      { size: 180, name: 'apple-touch-icon.png' },
      { size: 192, name: 'icon-192.png' },
      { size: 512, name: 'icon-512.png' },
    ];

    for (const target of targets) {
      const page = await browser.newPage({
        viewport: { width: target.size, height: target.size },
      });

      const html = `<!DOCTYPE html>
<html>
<head>
<style>
  html, body {
    margin: 0;
    padding: 0;
    width: ${target.size}px;
    height: ${target.size}px;
    overflow: hidden;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  svg {
    width: ${target.size}px;
    height: ${target.size}px;
  }
</style>
</head>
<body>
${svgContent}
</body>
</html>`;

      await page.setContent(html);
      const outPath = path.resolve('apps/web/public', target.name);
      await page.screenshot({ path: outPath, omitBackground: true });
      console.log(`Generated ${target.name} (${target.size}x${target.size})`);
    }
  } finally {
    await browser.close();
  }
}

generate().catch(console.error);
