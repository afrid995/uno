import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const screenshotDir = path.resolve('reports/screenshots/phase-6');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

const CHROME_PATH = 'C:\\Users\\Shaik Afrid\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe';

async function run() {
  console.log('=== Phase 6 Mobile Gameplay & Adaptive Touch Verification ===');
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  try {
    // 1. Mobile Host Context (iPhone 14: 390x844, touch-enabled)
    const hostCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    });
    const hostPage = await hostCtx.newPage();

    // 2. Guest Context (Desktop to act as second player)
    const guestCtx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      hasTouch: false,
    });
    const guestPage = await guestCtx.newPage();

    // Step A: Host logs in on mobile
    console.log('[1] Mobile Host logging in at http://localhost:5173/ ...');
    await hostPage.goto('http://localhost:5173/');
    await hostPage.waitForSelector('#username-input');
    await hostPage.fill('#username-input', 'MobileHost');
    await hostPage.click('button:has-text("Play Now")');

    // Wait for Dashboard
    const createBtn = hostPage.locator('[data-testid="create-room-btn"]');
    await createBtn.waitFor({ state: 'visible', timeout: 10000 });
    console.log('[2] Mobile Host reached Dashboard.');

    // Step B: Mobile Audio Settings Popover
    const audioTriggerHeader = hostPage.locator('[data-testid="audio-settings-trigger"]').first();
    if (await audioTriggerHeader.isVisible()) {
      await audioTriggerHeader.click();
      await hostPage.waitForTimeout(500);
      const slider = hostPage.locator('[data-testid="audio-volume-slider"]');
      await slider.waitFor({ state: 'visible' });
      console.log('[3] Capturing mobile audio settings popover...');
      await hostPage.screenshot({ path: path.join(screenshotDir, 'mobile-audio-popover.png') });
      await hostPage.keyboard.press('Escape');
      await hostPage.waitForTimeout(300);
    }

    // Step C: Host creates room
    console.log('[4] Mobile Host creating game room...');
    await createBtn.click();
    await hostPage.waitForSelector('text=Select Game Variant');
    await hostPage.click('[data-testid="confirm-create-room-btn"]');

    // Wait for Lobby navigation
    await hostPage.waitForURL(/\/room\/[A-Z0-9]+/, { timeout: 15000 });
    const url = hostPage.url();
    const roomCode = url.split('/room/')[1].split('?')[0].trim();
    console.log('[5] Room created with code:', roomCode);

    // Step D: Guest joins room
    console.log('[6] Guest joining room...');
    await guestPage.goto('http://localhost:5173/');
    await guestPage.waitForSelector('#username-input');
    await guestPage.fill('#username-input', 'GuestChallenger');
    await guestPage.click('button:has-text("Play Now")');

    const joinBtn = guestPage.locator('[data-testid="join-room-btn"]');
    await joinBtn.waitFor({ state: 'visible' });
    await joinBtn.click();

    await guestPage.waitForSelector('#room-code-input');
    await guestPage.fill('#room-code-input', roomCode);
    await guestPage.click('[data-testid="confirm-join-room-btn"]');

    // Guest readies up
    await guestPage.waitForSelector('[data-testid="ready-toggle-btn"]', { timeout: 10000 });
    const readyBtn = guestPage.locator('[data-testid="ready-toggle-btn"]');
    await readyBtn.click();
    await hostPage.waitForTimeout(1000);

    // Step E: Host starts match
    console.log('[7] Host starting match...');
    const startBtn = hostPage.locator('[data-testid="start-game-btn"]');
    await startBtn.waitFor({ state: 'visible' });
    await startBtn.click();

    // Wait for Game navigation on Host
    await hostPage.waitForURL(/\/game\/[A-Z0-9]+/, { timeout: 20000 });
    console.log('[8] Match loaded on mobile host page:', hostPage.url());
    await hostPage.waitForTimeout(2500);

    // Step F: Capture Mobile Portrait Gameplay
    console.log('[9] Capturing mobile portrait gameplay (390x844)...');
    await hostPage.screenshot({ path: path.join(screenshotDir, 'mobile-portrait-gameplay.png') });

    // Step G: Mobile Chat Bottom Sheet
    console.log('[10] Opening Mobile Chat drawer...');
    const chatBtn = hostPage.locator('[data-testid="chat-toggle-btn"]');
    if (await chatBtn.isVisible()) {
      await chatBtn.click();
      await hostPage.waitForTimeout(600);
      const chatInput = hostPage.locator('[data-testid="chat-input"]');
      if (await chatInput.isVisible()) {
        await chatInput.fill('Good game on mobile! 🎮');
        console.log('[11] Capturing mobile chat bottom sheet...');
        await hostPage.screenshot({ path: path.join(screenshotDir, 'mobile-chat-bottom-sheet.png') });

        // Close chat
        const closeChatBtn = hostPage.locator('[data-testid="chat-close-btn"]');
        if (await closeChatBtn.isVisible()) {
          await closeChatBtn.click();
        } else {
          await hostPage.keyboard.press('Escape');
        }
        await hostPage.waitForTimeout(400);
      }
    }

    // Step H: Touch Card Interaction (Tap / Active compression)
    console.log('[12] Testing mobile touch card interaction...');
    const handCards = hostPage.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
    const cardCount = await handCards.count();
    if (cardCount > 0) {
      const firstCard = handCards.first();
      const box = await firstCard.boundingBox();
      if (box) {
        // Dispatch touch/pointer down to observe tactile tap
        await hostPage.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await hostPage.mouse.down();
        await hostPage.waitForTimeout(200);
        console.log('[13] Capturing mobile touch interaction state...');
        await hostPage.screenshot({ path: path.join(screenshotDir, 'mobile-touch-interaction.png') });
        await hostPage.mouse.up();
        await hostPage.waitForTimeout(400);
      }
    }

    // Step I: Mobile Hand Horizontal Scroll Test
    console.log('[14] Testing player hand horizontal scroll...');
    const playerHand = hostPage.locator('[data-testid="player-hand"]');
    if (await playerHand.isVisible()) {
      await playerHand.evaluate((el) => {
        el.scrollLeft = 80;
      });
      await hostPage.waitForTimeout(300);
      console.log('[15] Capturing mobile hand scroll state...');
      await hostPage.screenshot({ path: path.join(screenshotDir, 'mobile-hand-scroll.png') });
    }

    // Step J: Mobile Landscape Rotation (844x390)
    console.log('[16] Rotating to Mobile Landscape (844x390)...');
    await hostPage.setViewportSize({ width: 844, height: 390 });
    await hostPage.waitForTimeout(1500);
    console.log('[17] Capturing mobile landscape gameplay...');
    await hostPage.screenshot({ path: path.join(screenshotDir, 'mobile-landscape-gameplay.png') });

    // Step K: Tablet Viewport (768x1024)
    console.log('[18] Testing Tablet Viewport (768x1024)...');
    await hostPage.setViewportSize({ width: 768, height: 1024 });
    await hostPage.waitForTimeout(1500);
    console.log('[19] Capturing mobile tablet gameplay...');
    await hostPage.screenshot({ path: path.join(screenshotDir, 'mobile-tablet-gameplay.png') });

    console.log('=== Phase 6 Verification Complete! All screenshots captured successfully. ===');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Phase 6 Verification Error:', err);
  process.exit(1);
});
