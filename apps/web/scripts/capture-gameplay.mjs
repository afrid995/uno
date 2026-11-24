import { chromium } from '@playwright/test';
import path from 'path';

const screenshotDir = path.resolve('reports/screenshots/phase-4');

async function run() {
  console.log('Launching 2 browser contexts for multiplayer gameplay capture...');
  const browser = await chromium.launch({
    executablePath: 'C:\\Users\\Shaik Afrid\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe',
    headless: true
  });

  // Host context
  const hostCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const hostPage = await hostCtx.newPage();

  // Guest context
  const guestCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const guestPage = await guestCtx.newPage();

  // 1. Host logs in
  await hostPage.goto('http://localhost:5173/');
  await hostPage.waitForSelector('#username-input');
  await hostPage.fill('#username-input', 'HostAfrid');
  await hostPage.click('button:has-text("Play Now")');

  // Wait for Dashboard
  const createBtn = hostPage.locator('[data-testid="create-room-btn"]');
  await createBtn.waitFor({ state: 'visible' });
  await createBtn.click();

  // Create room
  await hostPage.waitForSelector('text=Select Game Variant');
  await hostPage.click('[data-testid="confirm-create-room-btn"]');

  // Wait for navigation to /room/:roomCode
  await hostPage.waitForURL(/\/room\/[A-Z0-9]+/, { timeout: 15000 });
  const url = hostPage.url();
  const roomCode = url.split('/room/')[1].split('?')[0].trim();
  console.log('Room created with code:', roomCode);

  // 2. Guest logs in and joins room
  await guestPage.goto('http://localhost:5173/');
  await guestPage.waitForSelector('#username-input');
  await guestPage.fill('#username-input', 'GuestPlayer');
  await guestPage.click('button:has-text("Play Now")');

  const joinBtn = guestPage.locator('[data-testid="join-room-btn"]');
  await joinBtn.waitFor({ state: 'visible' });
  await joinBtn.click();

  await guestPage.waitForSelector('#room-code-input');
  await guestPage.fill('#room-code-input', roomCode);
  await guestPage.click('[data-testid="confirm-join-room-btn"]');

  // Wait for both to be in lobby
  await guestPage.waitForSelector('text=Room Code', { timeout: 10000 });
  console.log('Guest joined lobby.');
  await hostPage.waitForTimeout(1000);

  // 3. Guest toggles Ready
  const readyBtn = guestPage.locator('[data-testid="ready-toggle-btn"]');
  await readyBtn.waitFor({ state: 'visible' });
  await readyBtn.click();
  console.log('Guest marked ready.');
  await hostPage.waitForTimeout(1000);

  // 4. Host starts game
  const startBtn = hostPage.locator('[data-testid="start-game-btn"]');
  await startBtn.waitFor({ state: 'visible' });
  await startBtn.click();
  console.log('Host started game.');

  // Wait for game navigation
  await hostPage.waitForURL(/\/game\/[A-Z0-9]+/, { timeout: 20000 });
  console.log('Navigated to game page:', hostPage.url());
  await hostPage.waitForTimeout(2000);

  // Capture Desktop Game Table
  console.log('Capturing Desktop Game Table...');
  await hostPage.screenshot({ path: path.join(screenshotDir, 'before-gameplay-desktop.png') });

  // Open Chat Panel on Host
  const chatToggle = hostPage.locator('[data-testid="chat-toggle-btn"], button:has(svg.lucide-message-square), button:has(svg.lucide-message-circle)').first();
  if (await chatToggle.isVisible()) {
    await chatToggle.click();
    await hostPage.waitForTimeout(600);
    console.log('Capturing Chat Panel Open...');
    await hostPage.screenshot({ path: path.join(screenshotDir, 'before-gameplay-chat.png') });
  }

  // Mobile viewport capture of game board
  const mobileCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mobilePage = await mobileCtx.newPage();
  await mobilePage.goto(hostPage.url());
  await mobilePage.waitForTimeout(1500);
  console.log('Capturing Mobile Game Table...');
  await mobilePage.screenshot({ path: path.join(screenshotDir, 'before-gameplay-mobile.png') });

  await browser.close();
  console.log('Multiplayer gameplay baseline captured successfully.');
}

run().catch(err => {
  console.error('Error during gameplay capture:', err);
  process.exit(1);
});
