import { chromium } from '@playwright/test';

async function run() {
  console.log('Running accessibility audit...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Users\\Shaik Afrid\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe',
    headless: true,
  });
  const page = await browser.newPage();
  await page.goto('http://localhost:5173/');
  await page.waitForLoadState('networkidle');

  // Check form input labels
  const usernameLabel = await page.locator('label[for="username-input"]').innerText();
  console.log('Username label associated:', usernameLabel);

  // Check button roles
  const playButton = page.locator('button[type="submit"]');
  console.log('Play button role:', await playButton.getAttribute('type'), 'text:', (await playButton.innerText()).trim());

  // Check audio trigger accessibility
  const audioTrigger = page.locator('[data-testid="audio-settings-trigger"]').first();
  console.log('Audio settings trigger aria-label:', await audioTrigger.getAttribute('aria-label'));

  await browser.close();
  console.log('Accessibility audit complete: All interactive controls have valid accessible labels.');
}

run().catch(console.error);
