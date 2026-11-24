import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const screenshotDir = path.resolve('reports/screenshots/phase-4');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

async function run() {
  console.log('Launching browser to capture AFTER screenshots...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Users\\Shaik Afrid\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe',
    headless: true
  });

  // 1. Desktop context (1440x900)
  const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await desktopCtx.newPage();

  // 1. Landing Page
  console.log('Capturing Landing Page (Desktop)...');
  await page.goto('http://localhost:5173/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: path.join(screenshotDir, 'after-landing-desktop.png') });

  // 2. Landing Page Mobile (390x844)
  console.log('Capturing Landing Page (Mobile)...');
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mobilePage = await mobileCtx.newPage();
  await mobilePage.goto('http://localhost:5173/');
  await mobilePage.waitForLoadState('networkidle');
  await mobilePage.screenshot({ path: path.join(screenshotDir, 'after-landing-mobile.png') });

  // 3. Guest Login & Dashboard
  console.log('Performing Guest Login...');
  const usernameInput = page.locator('#username-input');
  await usernameInput.waitFor({ state: 'visible' });
  await usernameInput.fill('AfridHost');
  const playBtn = page.getByRole('button', { name: /play now/i });
  await playBtn.click();

  // Dashboard Page
  console.log('Waiting for Dashboard...');
  const createRoomBtn = page.locator('[data-testid="create-room-btn"]');
  await createRoomBtn.waitFor({ state: 'visible', timeout: 10000 });
  await page.waitForTimeout(400);
  console.log('Capturing Dashboard Page (Desktop)...');
  await page.screenshot({ path: path.join(screenshotDir, 'after-dashboard-desktop.png') });

  // 4. Create Room Modal (with sticky footer visible)
  console.log('Capturing Create Room Modal with sticky action footer...');
  await createRoomBtn.click();
  await page.waitForSelector('text=Select Game Variant');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(screenshotDir, 'after-create-room-modal.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  // 5. Join Room Modal (testing URL paste support)
  console.log('Capturing Join Room Modal with URL paste extraction...');
  const joinRoomBtn = page.locator('[data-testid="join-room-btn"]');
  if (await joinRoomBtn.isVisible()) {
    await joinRoomBtn.click();
    await page.waitForSelector('text=Join Private Room');
    const roomInput = page.locator('#room-code-input');
    await roomInput.fill('http://localhost:5173/join/7X8K2M');
    await page.waitForTimeout(300);
    console.log('Input value after URL paste:', await roomInput.inputValue());
    await page.screenshot({ path: path.join(screenshotDir, 'after-join-room-modal.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
  }

  // 6. Create Room to enter Lobby
  console.log('Creating room to enter Lobby...');
  await createRoomBtn.click();
  await page.waitForSelector('text=Select Game Variant');
  const confirmCreateBtn = page.locator('[data-testid="confirm-create-room-btn"]');
  await confirmCreateBtn.click();

  // Wait for Lobby
  await page.waitForURL(/\/room\/[A-Z0-9]+/, { timeout: 15000 });
  const lobbyUrl = page.url();
  await page.waitForSelector('text=Room Code', { timeout: 10000 });
  await page.waitForTimeout(800);
  console.log('Capturing Lobby Page (Desktop)...');
  await page.screenshot({ path: path.join(screenshotDir, 'after-lobby-desktop.png') });

  // 7. Lobby Page Mobile (with sticky action bar)
  console.log('Capturing Lobby Page (Mobile) with sticky controls bar...');
  await mobilePage.goto(lobbyUrl);
  await mobilePage.waitForLoadState('networkidle');
  await mobilePage.waitForTimeout(800);
  await mobilePage.screenshot({ path: path.join(screenshotDir, 'after-lobby-mobile.png') });

  // 8. Multiplayer Game Session
  console.log('Launching Guest player to enter match...');
  const guestCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const guestPage = await guestCtx.newPage();
  await guestPage.goto('http://localhost:5173/');
  await guestPage.waitForSelector('#username-input');
  await guestPage.fill('#username-input', 'Challenger');
  await guestPage.click('button:has-text("Play Now")');

  // Navigate guest to lobby
  await guestPage.waitForSelector('[data-testid="create-room-btn"]');
  await guestPage.goto(lobbyUrl);

  // Both in lobby
  await guestPage.waitForSelector('text=Room Code', { timeout: 10000 });
  const readyBtn = guestPage.locator('[data-testid="ready-toggle-btn"]');
  await readyBtn.waitFor({ state: 'visible' });
  await readyBtn.click();
  console.log('Challenger readied up.');

  // Host starts game
  const startBtn = page.locator('[data-testid="start-game-btn"]');
  await startBtn.waitFor({ state: 'visible' });
  await page.waitForTimeout(800);
  await startBtn.click();
  console.log('Host started game match.');

  // Wait for Game Table
  await page.waitForURL(/\/game\/[A-Z0-9]+/, { timeout: 20000 });
  const gameUrl = page.url();
  console.log('Game navigated to:', gameUrl);
  await page.waitForTimeout(2000);

  // Capture Desktop Game Table
  console.log('Capturing Desktop Game Table...');
  await page.screenshot({ path: path.join(screenshotDir, 'after-gameplay-desktop.png') });

  // Open Chat Panel on Desktop
  const chatToggle = page.locator('[data-testid="chat-toggle-btn"], button:has(svg.lucide-message-square)').first();
  if (await chatToggle.isVisible()) {
    await chatToggle.click();
    await page.waitForTimeout(500);
    console.log('Capturing Chat Panel Open with Escape key listener...');
    await page.screenshot({ path: path.join(screenshotDir, 'after-gameplay-chat.png') });
  }

  // Mobile viewport of Game Table
  await mobilePage.goto(gameUrl);
  await mobilePage.waitForTimeout(2000);
  console.log('Capturing Mobile Game Table...');
  await mobilePage.screenshot({ path: path.join(screenshotDir, 'after-gameplay-mobile.png') });

  await browser.close();
  console.log('All AFTER screenshots captured successfully.');
}

run().catch(err => {
  console.error('Error during AFTER capture:', err);
  process.exit(1);
});
