import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

const screenshotDir = path.resolve('reports/screenshots/phase-7');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

const CHROME_PATH = 'C:\\Users\\Shaik Afrid\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe';

async function run() {
  console.log('=== Phase 7 Final Visual Craftsmanship & Cross-Viewport QA ===');
  const browser = await chromium.launch({
    executablePath: CHROME_PATH,
    headless: true,
  });

  try {
    // -------------------------------------------------------------------------
    // Step 1: Capture Clean Landing Page (Desktop 1440x900)
    // -------------------------------------------------------------------------
    console.log('[1] Capturing Landing Page hero...');
    const landingCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const landingPage = await landingCtx.newPage();
    await landingPage.goto('http://localhost:5173/');
    await landingPage.waitForSelector('#username-input');
    await landingPage.waitForTimeout(500);
    await landingPage.screenshot({ path: path.join(screenshotDir, 'landing-page-hero.png') });
    await landingCtx.close();

    // -------------------------------------------------------------------------
    // Step 2: Host Context for Dashboard, Room Creation & Joining Modals
    // -------------------------------------------------------------------------
    console.log('[2] Host logging in at http://localhost:5173/ ...');
    const hostCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const hostPage = await hostCtx.newPage();
    await hostPage.goto('http://localhost:5173/');
    await hostPage.waitForSelector('#username-input');
    await hostPage.fill('#username-input', 'GrandMaster');
    await hostPage.click('button:has-text("Play Now")');

    // Wait for Dashboard
    const createBtn = hostPage.locator('[data-testid="create-room-btn"]');
    await createBtn.waitFor({ state: 'visible', timeout: 10000 });
    console.log('[3] Capturing Dashboard Game Lounge...');
    await hostPage.screenshot({ path: path.join(screenshotDir, 'dashboard-game-lounge.png') });

    // Open Audio Settings with Haptics Toggle
    console.log('[4] Opening Audio & Haptics Popover...');
    const audioTrigger = hostPage.locator('[data-testid="audio-settings-trigger"]').first();
    await audioTrigger.click();
    await hostPage.waitForSelector('[data-testid="audio-settings-popover"]');
    await hostPage.waitForTimeout(400);
    await hostPage.screenshot({ path: path.join(screenshotDir, 'audio-haptics-popover.png') });
    await hostPage.keyboard.press('Escape');
    await hostPage.waitForTimeout(300);

    // Open Create Room Modal
    console.log('[5] Opening Create Room Modal with Variants...');
    await createBtn.click();
    await hostPage.waitForSelector('text=Select Game Variant');
    await hostPage.waitForTimeout(400);
    await hostPage.screenshot({ path: path.join(screenshotDir, 'create-room-variants.png') });
    await hostPage.keyboard.press('Escape');
    await hostPage.waitForTimeout(300);

    // Open Join Room Modal
    console.log('[6] Opening Join Room Modal...');
    const joinBtn = hostPage.locator('[data-testid="join-room-btn"]');
    await joinBtn.click();
    await hostPage.waitForSelector('#room-code-input');
    await hostPage.waitForTimeout(400);
    await hostPage.screenshot({ path: path.join(screenshotDir, 'join-room-dialog.png') });
    await hostPage.keyboard.press('Escape');
    await hostPage.waitForTimeout(300);

    // -------------------------------------------------------------------------
    // Step 3: Match Session 1 — Classic UNO across Responsive Viewports
    // -------------------------------------------------------------------------
    console.log('[7] Creating Classic UNO room...');
    await createBtn.click();
    await hostPage.waitForSelector('[data-testid="confirm-create-room-btn"]');
    await hostPage.click('[data-testid="confirm-create-room-btn"]');

    // Wait for Lobby navigation
    await hostPage.waitForURL(/\/room\/[A-Z0-9]+/, { timeout: 15000 });
    const url = hostPage.url();
    const classicRoomCode = url.split('/room/')[1].split('?')[0].trim();
    console.log('[8] Classic UNO Room Code:', classicRoomCode);

    // Guest joins room
    const guestCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const guestPage = await guestCtx.newPage();
    await guestPage.goto('http://localhost:5173/');
    await guestPage.waitForSelector('#username-input');
    await guestPage.fill('#username-input', 'ChallengerOne');
    await guestPage.click('button:has-text("Play Now")');

    const guestJoinBtn = guestPage.locator('[data-testid="join-room-btn"]');
    await guestJoinBtn.waitFor({ state: 'visible' });
    await guestJoinBtn.click();
    await guestPage.waitForSelector('#room-code-input');
    await guestPage.fill('#room-code-input', classicRoomCode);
    await guestPage.click('[data-testid="confirm-join-room-btn"]');

    // Guest ready toggle
    await guestPage.waitForSelector('[data-testid="ready-toggle-btn"]', { timeout: 10000 });
    await guestPage.click('[data-testid="ready-toggle-btn"]');
    await hostPage.waitForTimeout(800);

    // Capture Lobby Room Roster
    console.log('[9] Capturing Lobby Room Roster...');
    await hostPage.screenshot({ path: path.join(screenshotDir, 'lobby-room-roster.png') });

    // Host starts match
    console.log('[10] Host starting Classic match...');
    const startBtn = hostPage.locator('[data-testid="start-game-btn"]');
    await startBtn.waitFor({ state: 'visible' });
    await startBtn.click();

    // Wait for Game navigation
    await hostPage.waitForURL(/\/game\/[A-Z0-9]+/, { timeout: 20000 });
    console.log('[11] Match loaded on host page:', hostPage.url());
    await hostPage.waitForTimeout(2000);

    // Desktop Game Table Screenshot (1440x900)
    console.log('[12] Capturing Desktop Game Table (1440x900)...');
    await hostPage.screenshot({ path: path.join(screenshotDir, 'desktop-game-table.png') });

    // Mobile Portrait Game Table Screenshot (390x844)
    console.log('[13] Capturing Mobile Portrait Table (390x844)...');
    await hostPage.setViewportSize({ width: 390, height: 844 });
    await hostPage.waitForTimeout(1000);
    await hostPage.screenshot({ path: path.join(screenshotDir, 'mobile-portrait-table.png') });

    // Mobile Landscape Game Table Screenshot (844x390)
    console.log('[14] Capturing Mobile Landscape Table (844x390)...');
    await hostPage.setViewportSize({ width: 844, height: 390 });
    await hostPage.waitForTimeout(1000);
    await hostPage.screenshot({ path: path.join(screenshotDir, 'mobile-landscape-table.png') });

    // Tablet Game Table Screenshot (768x1024)
    console.log('[15] Capturing Tablet Game Table (768x1024)...');
    await hostPage.setViewportSize({ width: 768, height: 1024 });
    await hostPage.waitForTimeout(1000);
    await hostPage.screenshot({ path: path.join(screenshotDir, 'mobile-tablet-table.png') });

    await hostCtx.close();
    await guestCtx.close();

    // -------------------------------------------------------------------------
    // Step 4: Variant Verification — UNO All Wild!
    // -------------------------------------------------------------------------
    console.log('[16] Testing UNO All Wild! variant match...');
    const wildHostCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const wildHostPage = await wildHostCtx.newPage();
    await wildHostPage.goto('http://localhost:5173/');
    await wildHostPage.waitForSelector('#username-input');
    await wildHostPage.fill('#username-input', 'WildHost');
    await wildHostPage.click('button:has-text("Play Now")');

    const wildCreateBtn = wildHostPage.locator('[data-testid="create-room-btn"]');
    await wildCreateBtn.waitFor({ state: 'visible' });
    await wildCreateBtn.click();
    await wildHostPage.waitForSelector('[data-testid="variant-select-all-wild"]');
    await wildHostPage.click('[data-testid="variant-select-all-wild"]');
    await wildHostPage.click('[data-testid="confirm-create-room-btn"]');

    await wildHostPage.waitForURL(/\/room\/[A-Z0-9]+/, { timeout: 15000 });
    const wildRoomCode = wildHostPage.url().split('/room/')[1].split('?')[0].trim();

    const wildGuestCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const wildGuestPage = await wildGuestCtx.newPage();
    await wildGuestPage.goto('http://localhost:5173/');
    await wildGuestPage.waitForSelector('#username-input');
    await wildGuestPage.fill('#username-input', 'WildGuest');
    await wildGuestPage.click('button:has-text("Play Now")');

    const wildJoinBtn = wildGuestPage.locator('[data-testid="join-room-btn"]');
    await wildJoinBtn.waitFor({ state: 'visible' });
    await wildJoinBtn.click();
    await wildGuestPage.waitForSelector('#room-code-input');
    await wildGuestPage.fill('#room-code-input', wildRoomCode);
    await wildGuestPage.click('[data-testid="confirm-join-room-btn"]');

    await wildGuestPage.waitForSelector('[data-testid="ready-toggle-btn"]', { timeout: 10000 });
    await wildGuestPage.click('[data-testid="ready-toggle-btn"]');
    await wildHostPage.waitForTimeout(800);

    const wildStartBtn = wildHostPage.locator('[data-testid="start-game-btn"]');
    await wildStartBtn.waitFor({ state: 'visible' });
    await wildStartBtn.click();

    await wildHostPage.waitForURL(/\/game\/[A-Z0-9]+/, { timeout: 20000 });
    await wildHostPage.waitForTimeout(2000);
    console.log('[17] Capturing UNO All Wild! Table...');
    await wildHostPage.screenshot({ path: path.join(screenshotDir, 'variant-all-wild.png') });

    await wildHostCtx.close();
    await wildGuestCtx.close();

    // -------------------------------------------------------------------------
    // Step 5: Variant Verification — UNO Flip!
    // -------------------------------------------------------------------------
    console.log('[18] Testing UNO Flip! variant match...');
    const flipHostCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const flipHostPage = await flipHostCtx.newPage();
    await flipHostPage.goto('http://localhost:5173/');
    await flipHostPage.waitForSelector('#username-input');
    await flipHostPage.fill('#username-input', 'FlipHost');
    await flipHostPage.click('button:has-text("Play Now")');

    const flipCreateBtn = flipHostPage.locator('[data-testid="create-room-btn"]');
    await flipCreateBtn.waitFor({ state: 'visible' });
    await flipCreateBtn.click();
    await flipHostPage.waitForSelector('[data-testid="variant-select-uno-flip"]');
    await flipHostPage.click('[data-testid="variant-select-uno-flip"]');
    await flipHostPage.click('[data-testid="confirm-create-room-btn"]');

    await flipHostPage.waitForURL(/\/room\/[A-Z0-9]+/, { timeout: 15000 });
    const flipRoomCode = flipHostPage.url().split('/room/')[1].split('?')[0].trim();

    const flipGuestCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const flipGuestPage = await flipGuestCtx.newPage();
    await flipGuestPage.goto('http://localhost:5173/');
    await flipGuestPage.waitForSelector('#username-input');
    await flipGuestPage.fill('#username-input', 'FlipGuest');
    await flipGuestPage.click('button:has-text("Play Now")');

    const flipJoinBtn = flipGuestPage.locator('[data-testid="join-room-btn"]');
    await flipJoinBtn.waitFor({ state: 'visible' });
    await flipJoinBtn.click();
    await flipGuestPage.waitForSelector('#room-code-input');
    await flipGuestPage.fill('#room-code-input', flipRoomCode);
    await flipGuestPage.click('[data-testid="confirm-join-room-btn"]');

    await flipGuestPage.waitForSelector('[data-testid="ready-toggle-btn"]', { timeout: 10000 });
    await flipGuestPage.click('[data-testid="ready-toggle-btn"]');
    await flipHostPage.waitForTimeout(800);

    const flipStartBtn = flipHostPage.locator('[data-testid="start-game-btn"]');
    await flipStartBtn.waitFor({ state: 'visible' });
    await flipStartBtn.click();

    await flipHostPage.waitForURL(/\/game\/[A-Z0-9]+/, { timeout: 20000 });
    await flipHostPage.waitForTimeout(2000);
    console.log('[19] Capturing UNO Flip! Table...');
    await flipHostPage.screenshot({ path: path.join(screenshotDir, 'variant-uno-flip.png') });

    await flipHostCtx.close();
    await flipGuestCtx.close();

    console.log('=== Phase 7 Verification Complete! All screenshots captured successfully. ===');
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error('Phase 7 Verification Error:', err);
  process.exit(1);
});
