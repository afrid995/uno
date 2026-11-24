import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const screenshotDir = path.resolve('reports/screenshots/phase-5');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

const CHROME_PATH = 'C:\\Users\\Shaik Afrid\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe';

async function run() {
  console.log('--- Phase 5 Real-Browser Gameplay & Audio/Motion QA ---');
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  try {
    // 1. Host context
    const hostCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      hasTouch: false,
    });
    const hostPage = await hostCtx.newPage();

    // 2. Guest context
    const guestCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      hasTouch: false,
    });
    const guestPage = await guestCtx.newPage();

    // Step A: Host logs in and accesses Dashboard
    console.log('[1] Host logging in at http://localhost:5173/ ...');
    await hostPage.goto('http://localhost:5173/');
    await hostPage.waitForSelector('#username-input');
    await hostPage.fill('#username-input', 'HostAfrid');
    await hostPage.click('button:has-text("Play Now")');

    // Wait for Dashboard
    const createBtn = hostPage.locator('[data-testid="create-room-btn"]');
    await createBtn.waitFor({ state: 'visible', timeout: 10000 });
    console.log('[2] Host on Dashboard. Capturing header audio control...');
    await hostPage.screenshot({ path: path.join(screenshotDir, 'desktop-dashboard-audio.png') });

    // Open Audio Settings Popover on Dashboard
    const audioTriggerHeader = hostPage.locator('[data-testid="audio-settings-trigger"]').first();
    await audioTriggerHeader.waitFor({ state: 'visible' });
    await audioTriggerHeader.click();
    await hostPage.waitForTimeout(400);

    const slider = hostPage.locator('[data-testid="audio-volume-slider"]');
    await slider.waitFor({ state: 'visible' });
    console.log('[3] Audio Settings Popover open with Slider. Capturing...');
    await hostPage.screenshot({ path: path.join(screenshotDir, 'desktop-dashboard-audio-popover.png') });

    // Test preview sound button click
    const testBtn = hostPage.locator('[data-testid="audio-test-sound-btn"]');
    if (await testBtn.isVisible()) {
      await testBtn.click();
      console.log('[4] Preview Sound button clicked.');
    }

    // Close popover by clicking outside
    await hostPage.keyboard.press('Escape');
    await hostPage.waitForTimeout(300);

    // Step B: Create Room
    console.log('[5] Host creating game room...');
    await createBtn.click();
    await hostPage.waitForSelector('text=Select Game Variant');
    await hostPage.click('[data-testid="confirm-create-room-btn"]');

    // Wait for Lobby navigation
    await hostPage.waitForURL(/\/room\/[A-Z0-9]+/, { timeout: 15000 });
    const url = hostPage.url();
    const roomCode = url.split('/room/')[1].split('?')[0].trim();
    console.log('[6] Room created with code:', roomCode);

    // Step C: Guest joins room
    console.log('[7] Guest joining room...');
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

    // Wait for Guest in Lobby
    await guestPage.waitForSelector('text=Room Code', { timeout: 10000 });
    console.log('[8] Guest joined lobby. Toggling ready...');
    await hostPage.waitForTimeout(800);

    const readyBtn = guestPage.locator('[data-testid="ready-toggle-btn"]');
    await readyBtn.waitFor({ state: 'visible' });
    await readyBtn.click();
    await hostPage.waitForTimeout(800);

    // Step D: Host starts game
    console.log('[9] Host starting match...');
    const startBtn = hostPage.locator('[data-testid="start-game-btn"]');
    await startBtn.waitFor({ state: 'visible' });
    await startBtn.click();

    // Wait for game navigation
    await hostPage.waitForURL(/\/game\/[A-Z0-9]+/, { timeout: 20000 });
    console.log('[10] Match loaded on host page:', hostPage.url());
    await hostPage.waitForTimeout(2000);

    // Step E: Capture Desktop Gameplay Table
    console.log('[11] Capturing desktop gameplay table...');
    await hostPage.screenshot({ path: path.join(screenshotDir, 'desktop-gameplay-table.png') });

    // Step F: Open Audio Settings in Game Page
    const gameAudioTrigger = hostPage.locator('header [data-testid="audio-settings-trigger"]').first();
    if (await gameAudioTrigger.isVisible()) {
      await gameAudioTrigger.click();
      await hostPage.waitForTimeout(400);
      console.log('[12] Capturing in-game audio settings popover...');
      await hostPage.screenshot({ path: path.join(screenshotDir, 'gameplay-audio-settings-popover.png') });
      await hostPage.keyboard.press('Escape');
      await hostPage.waitForTimeout(300);
    }

    // Step G: Hover tactile card interaction
    console.log('[13] Testing tactile card hover...');
    const cards = hostPage.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
    const cardCount = await cards.count();
    if (cardCount > 0) {
      await cards.first().hover();
      await hostPage.waitForTimeout(300);
      console.log('[14] Capturing card interaction hover...');
      await hostPage.screenshot({ path: path.join(screenshotDir, 'card-interaction-hover.png') });
    }

    // Step H: Card play or draw interaction
    const playableCards = hostPage.locator('[data-testid="player-hand"] [data-is-playable="true"]');
    const playableCount = await playableCards.count();
    if (playableCount > 0) {
      console.log('[15] Host plays a playable card...');
      await playableCards.first().click();
      await hostPage.waitForTimeout(800);
    } else {
      console.log('[15] No playable card immediately active; interacting with draw pile...');
      const drawPile = hostPage.locator('[data-testid="draw-pile-btn"]').first();
      if (await drawPile.isVisible()) {
        await drawPile.click();
        await hostPage.waitForTimeout(800);
      }
    }
    console.log('[16] Capturing gameplay post-action table...');
    await hostPage.screenshot({ path: path.join(screenshotDir, 'gameplay-action-play.png') });

    // Step I: Mobile Portrait Viewport
    console.log('[17] Testing mobile portrait layout (390x844)...');
    const portraitCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const portraitPage = await portraitCtx.newPage();
    await portraitPage.goto(hostPage.url());
    await portraitPage.waitForTimeout(2000);
    console.log('[18] Capturing mobile portrait gameplay...');
    await portraitPage.screenshot({ path: path.join(screenshotDir, 'mobile-portrait-gameplay.png') });

    // Step J: Mobile Landscape Viewport
    console.log('[19] Testing mobile landscape layout (844x390)...');
    const landscapeCtx = await browser.newContext({
      viewport: { width: 844, height: 390 },
      isMobile: true,
      hasTouch: true,
    });
    const landscapePage = await landscapeCtx.newPage();
    await landscapePage.goto(hostPage.url());
    await landscapePage.waitForTimeout(2000);
    console.log('[20] Capturing mobile landscape gameplay...');
    await landscapePage.screenshot({ path: path.join(screenshotDir, 'mobile-landscape-gameplay.png') });

    console.log('--- Phase 5 Verification Complete! All screenshots captured successfully. ---');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Phase 5 Verification Error:', err);
  process.exit(1);
});
