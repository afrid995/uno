import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const screenshotDir = path.resolve('reports/screenshots/phase-4');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function run() {
  console.log('Launching browser to capture baseline screenshots...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Users\\Shaik Afrid\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe',
    headless: true
  });
  
  // 1. Desktop context (1440x900)
  const desktopCtx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await desktopCtx.newPage();

  // 1. Landing Page
  console.log('Capturing Landing Page (Desktop)...');
  await page.goto('http://localhost:5173/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(screenshotDir, 'before-landing-desktop.png') });

  // 2. Landing Page Mobile (390x844)
  console.log('Capturing Landing Page (Mobile)...');
  const mobileCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
  });
  const mobilePage = await mobileCtx.newPage();
  await mobilePage.goto('http://localhost:5173/');
  await mobilePage.waitForLoadState('networkidle');
  await mobilePage.screenshot({ path: path.join(screenshotDir, 'before-landing-mobile.png') });

  // 3. Guest Login & Dashboard
  console.log('Performing Guest Login...');
  const usernameInput = page.locator('#username-input');
  await usernameInput.waitFor({ state: 'visible', timeout: 5000 });
  await usernameInput.fill('AfridHost');
  const playBtn = page.getByRole('button', { name: /play now/i });
  await playBtn.click();

  // Dashboard Page
  console.log('Waiting for Dashboard...');
  const createRoomBtn = page.locator('[data-testid="create-room-btn"]');
  await createRoomBtn.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(500);
  console.log('Capturing Dashboard Page (Desktop)...');
  await page.screenshot({ path: path.join(screenshotDir, 'before-dashboard-desktop.png') });

  // 4. Create Room Modal
  console.log('Capturing Create Room Modal...');
  await createRoomBtn.click();
  await page.waitForSelector('text=Select Game Variant');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(screenshotDir, 'before-create-room-modal.png') });

  // Close create room modal via Escape key
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 5. Join Room Modal
  console.log('Capturing Join Room Modal...');
  const joinRoomBtn = page.locator('[data-testid="join-room-btn"]');
  if (await joinRoomBtn.isVisible()) {
    await joinRoomBtn.click();
    await page.waitForSelector('text=Join Private Room');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(screenshotDir, 'before-join-room-modal.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // 6. Create Room to enter Lobby
  console.log('Creating room to enter Lobby...');
  await createRoomBtn.click();
  await page.waitForSelector('text=Select Game Variant');
  const submitCreateBtn = page.getByRole('button', { name: /create room/i });
  await submitCreateBtn.click();

  // Wait for Lobby
  await page.waitForSelector('text=Room Code', { timeout: 10000 });
  await page.waitForTimeout(1000);
  console.log('Capturing Lobby Page (Desktop)...');
  await page.screenshot({ path: path.join(screenshotDir, 'before-lobby-desktop.png') });

  // 7. Capture Lobby Mobile
  const url = page.url();
  console.log('Capturing Lobby Page (Mobile) on URL:', url);
  await mobilePage.goto(url);
  await mobilePage.waitForLoadState('networkidle');
  await mobilePage.waitForTimeout(1000);
  await mobilePage.screenshot({ path: path.join(screenshotDir, 'before-lobby-mobile.png') });

  console.log('Baseline screenshot capture completed.');
  await browser.close();
}

run().catch(err => {
  console.error('Error during baseline capture:', err);
  process.exit(1);
});
