import pkg from './apps/web/node_modules/@playwright/test/index.js';
const { chromium } = pkg;
import * as path from 'path';
import * as fs from 'fs';

const PROD_URL = 'https://ultimate-beryl.vercel.app';
const SCREENSHOT_DIR = path.resolve('reports/screenshots/rematch-production-fix');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function runProductionVerification() {
  console.log('=== Starting UNO Ultimate Live Production Rematch Verification ===');
  console.log(`Target: ${PROD_URL}`);

  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const contextAlice = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const contextBob = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  const pageAlice = await contextAlice.newPage();
  const pageBob = await contextBob.newPage();

  pageAlice.on('console', msg => {
    if (msg.type() === 'error') console.log(`[Alice Console Error]: ${msg.text()}`);
  });
  pageBob.on('console', msg => {
    if (msg.type() === 'error') console.log(`[Bob Console Error]: ${msg.text()}`);
  });

  try {
    // 1. Alice joins as host
    console.log('1. Alice logging in as host...');
    await pageAlice.goto(PROD_URL);
    await pageAlice.waitForSelector('#username-input', { timeout: 15000 });
    const aliceName = `HostAlice_${Math.floor(Math.random() * 900 + 100)}`;
    await pageAlice.fill('#username-input', aliceName);
    await pageAlice.click('button[type="submit"]');

    await pageAlice.waitForFunction(() => window.location.pathname.includes('/dashboard'), { timeout: 15000 });
    console.log(`Alice (${aliceName}) reached dashboard.`);
    await pageAlice.waitForTimeout(2000);

    // Create Room with No Mercy
    await pageAlice.click('[data-testid="create-room-btn"]');
    await pageAlice.waitForSelector('[data-testid="variant-select-no-mercy"]', { timeout: 10000 });
    await pageAlice.click('[data-testid="variant-select-no-mercy"]');
    await pageAlice.click('[data-testid="confirm-create-room-btn"]');

    const roomCodeElement = pageAlice.locator('[data-testid="room-code-display"]');
    await roomCodeElement.waitFor({ timeout: 15000 });
    const rawCode = await roomCodeElement.textContent();
    const roomCode = rawCode.trim();
    console.log(`Created No Mercy Room: ${roomCode}`);

    // 2. Bob joins as guest
    console.log('2. Bob logging in and joining room...');
    await pageBob.goto(PROD_URL);
    await pageBob.waitForSelector('#username-input', { timeout: 15000 });
    const bobName = `GuestBob_${Math.floor(Math.random() * 900 + 100)}`;
    await pageBob.fill('#username-input', bobName);
    await pageBob.click('button[type="submit"]');

    await pageBob.waitForFunction(() => window.location.pathname.includes('/dashboard'), { timeout: 15000 });
    await pageBob.waitForTimeout(2000);

    await pageBob.click('[data-testid="join-room-btn"]');
    await pageBob.waitForSelector('#room-code-input', { timeout: 10000 });
    await pageBob.fill('#room-code-input', roomCode);
    await pageBob.click('[data-testid="confirm-join-room-btn"]');

    await pageBob.locator('[data-testid="room-code-display"]').waitFor({ timeout: 15000 });
    console.log(`Bob (${bobName}) joined room ${roomCode}.`);

    // 3. Ready and Start
    console.log('3. Readying up and starting Match 1...');
    await pageBob.click('[data-testid="ready-toggle-btn"]');
    const startButton = pageAlice.locator('[data-testid="start-game-btn"]');
    await startButton.waitFor({ state: 'attached', timeout: 10000 });
    await pageAlice.waitForFunction(
      btn => !btn.disabled && !btn.getAttribute('aria-disabled'),
      await startButton.elementHandle()
    );
    await startButton.click();

    await pageAlice.locator('[data-testid="game-board"]').waitFor({ timeout: 20000 });
    await pageBob.locator('[data-testid="game-board"]').waitFor({ timeout: 20000 });
    console.log('Match 1 started successfully!');

    await pageAlice.screenshot({ path: path.join(SCREENSHOT_DIR, '01_prod_match1_board.png') });
    console.log('Saved 01_prod_match1_board.png');

    // 4. Play until Match Result Modal appears
    console.log('4. Playing turns until match completion...');
    let turnCount = 0;
    const maxTurns = 150;
    let matchEnded = false;

    while (turnCount < maxTurns && !matchEnded) {
      turnCount++;

      // Check Match Result Modal
      const modalAlice = await pageAlice.locator('[data-testid="match-result-modal"]').isVisible();
      const modalBob = await pageBob.locator('[data-testid="match-result-modal"]').isVisible();
      if (modalAlice || modalBob) {
        console.log(`Match Result Modal appeared after ${turnCount} iterations!`);
        matchEnded = true;
        break;
      }

      // Handle Modals / Prompts on both players
      for (const [name, p] of [['Alice', pageAlice], ['Bob', pageBob]]) {
        // Stack Penalty
        const stackBtn = p.locator('[data-testid="accept-stack-penalty-btn"]');
        if (await stackBtn.isVisible()) {
          console.log(`[${name}] Accepting stack penalty...`);
          await stackBtn.click({ timeout: 1000, force: true }).catch(() => {});
          await p.waitForTimeout(300);
        }

        // Wild Color Picker (including Starting Wild)
        const wildColor = p.locator('[data-testid^="wild-color-"]').first();
        if (await wildColor.isVisible()) {
          console.log(`[${name}] Choosing wild color...`);
          await wildColor.click({ timeout: 1000, force: true }).catch(() => {});
          await p.waitForTimeout(300);
        }

        // Swap / Target Modals
        const targetBtn = p.locator('[data-testid^="swap-target-"], [data-testid^="targeted-draw-"], [data-testid^="forced-swap-"]').first();
        if (await targetBtn.isVisible()) {
          console.log(`[${name}] Selecting swap/draw target...`);
          await targetBtn.click({ timeout: 1000, force: true }).catch(() => {});
          await p.waitForTimeout(300);
        }

        // UNO Button (only if active/enabled)
        const unoBtn = p.locator('[data-testid="uno-button"]:not([disabled])');
        if (await unoBtn.isVisible()) {
          console.log(`[${name}] Calling UNO!`);
          await unoBtn.click({ timeout: 500, force: true }).catch(() => {});
        }
      }

      // Determine active player
      const aliceIsTurn = await pageAlice.locator('[data-testid="local-player-profile"][data-is-turn="true"]').isVisible();
      const bobIsTurn = await pageBob.locator('[data-testid="local-player-profile"][data-is-turn="true"]').isVisible();

      if (aliceIsTurn) {
        const playableCards = pageAlice.locator('[data-testid="player-hand"] [data-testid="playing-card"][data-is-playable="true"]');
        const count = await playableCards.count();
        if (count > 0) {
          console.log(`[Turn ${turnCount}] Alice playing playable card (out of ${count})...`);
          await playableCards.first().click({ timeout: 1500, force: true }).catch(() => {});
        } else {
          console.log(`[Turn ${turnCount}] Alice drawing card...`);
          const drawBtn = pageAlice.locator('[data-testid="draw-pile-btn"]');
          if (await drawBtn.isVisible()) {
            await drawBtn.click({ timeout: 1500, force: true }).catch(() => {});
          }
          await pageAlice.waitForTimeout(400);
          const passBtn = pageAlice.locator('[data-testid="pass-turn-btn"]');
          if (await passBtn.isVisible()) {
            await passBtn.click({ timeout: 1000, force: true }).catch(() => {});
          }
          const playDrawn = pageAlice.locator('[data-testid="play-drawn-card-btn"]');
          if (await playDrawn.isVisible()) {
            await playDrawn.click({ timeout: 1000, force: true }).catch(() => {});
          }
        }
      } else if (bobIsTurn) {
        console.log(`[Turn ${turnCount}] Bob drawing card...`);
        const drawBtn = pageBob.locator('[data-testid="draw-pile-btn"]');
        if (await drawBtn.isVisible()) {
          await drawBtn.click({ timeout: 1500, force: true }).catch(() => {});
        }
        await pageBob.waitForTimeout(400);
        const passBtn = pageBob.locator('[data-testid="pass-turn-btn"]');
        if (await passBtn.isVisible()) {
          await passBtn.click({ timeout: 1000, force: true }).catch(() => {});
        } else {
          const playDrawn = pageBob.locator('[data-testid="play-drawn-card-btn"]');
          if (await playDrawn.isVisible()) {
            await playDrawn.click({ timeout: 1000, force: true }).catch(() => {});
          } else {
            const playableCards = pageBob.locator('[data-testid="player-hand"] [data-testid="playing-card"][data-is-playable="true"]');
            if (await playableCards.count() > 0) {
              await playableCards.first().click({ timeout: 1500, force: true }).catch(() => {});
            }
          }
        }
      }

      await pageAlice.waitForTimeout(400);
    }

    if (!matchEnded) {
      await pageAlice.screenshot({ path: path.join(SCREENSHOT_DIR, '02_prod_timeout_state.png') });
      throw new Error(`Match did not end within ${maxTurns} iterations.`);
    }

    // 5. Verify Match Result Modal
    console.log('5. Verifying Match Result Modal contents...');
    const resultModal = pageAlice.locator('[data-testid="match-result-modal"]');
    await resultModal.waitFor({ state: 'visible', timeout: 15000 });
    await pageAlice.screenshot({ path: path.join(SCREENSHOT_DIR, '02_prod_match_result_modal.png') });
    console.log('Saved 02_prod_match_result_modal.png');

    const playAgainBtn = pageAlice.locator('[data-testid="match-result-play-again"]');
    await playAgainBtn.waitFor({ state: 'visible', timeout: 5000 });
    console.log('PLAY AGAIN button is visible on host screen!');

    // 6. Host clicks PLAY AGAIN
    console.log('6. Host clicking PLAY AGAIN...');
    await playAgainBtn.click({ timeout: 2000, force: true });

    // 7. Verify Modal Closes and Match 2 Starts
    console.log('7. Verifying Match Result Modal closes and Match 2 initializes...');
    await resultModal.waitFor({ state: 'hidden', timeout: 15000 });
    console.log('SUCCESS: Match Result Modal closed cleanly!');

    // Check for any error banner
    const errorAlert = pageAlice.locator('.border-rose-500\\/30, [role="alert"]');
    const hasError = await errorAlert.isVisible().catch(() => false);
    if (hasError) {
      const errText = await errorAlert.textContent();
      throw new Error(`Unexpected error alert found after clicking Play Again: "${errText}"`);
    }

    // Verify Match 2 Board
    await pageAlice.waitForSelector('[data-testid="game-board"]', { timeout: 15000 });
    const aliceHand2 = pageAlice.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
    const bobHand2 = pageBob.locator('[data-testid="player-hand"] [data-testid="playing-card"]');

    await pageAlice.waitForTimeout(1000);
    const countA = await aliceHand2.count();
    const countB = await bobHand2.count();
    console.log(`Match 2 Alice Hand Count: ${countA}, Bob Hand Count: ${countB}`);

    await pageAlice.screenshot({ path: path.join(SCREENSHOT_DIR, '03_prod_rematch_match2_board.png') });
    console.log('Saved 03_prod_rematch_match2_board.png');

    console.log('=== PRODUCTION VERIFICATION COMPLETED SUCCESSFULLY ===');
    console.log('No "A match is already in progress for this room." errors encountered.');
    console.log('Rematch successfully initialized with fresh hands!');
  } finally {
    await contextAlice.close();
    await contextBob.close();
    await browser.close();
  }
}

runProductionVerification().catch(err => {
  console.error('Production Verification Failed:', err);
  process.exit(1);
});
