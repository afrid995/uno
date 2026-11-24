import { chromium } from '@playwright/test';

async function run() {
  console.log('Running accessibility snapshot audit...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Users\\Shaik Afrid\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe',
    headless: true
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/');
  await page.waitForLoadState('networkidle');

  const snapshot = await page.accessibility.snapshot();
  console.log('Landing Page accessibility snapshot root role:', snapshot?.role, 'children count:', snapshot?.children?.length);

  // Check form input labels
  const usernameLabel = await page.locator('label[for="username-input"]').innerText();
  console.log('Username label associated:', usernameLabel);

  // Check button roles
  const playButton = page.locator('button[type="submit"]');
  console.log('Play button role:', await playButton.getAttribute('type'), 'text:', (await playButton.innerText()).trim());

  await browser.close();
  console.log('Accessibility snapshot audit complete.');
}

run().catch(console.error);
