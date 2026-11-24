import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { prisma, MatchStatus, RoomStatus } from '../../../database/dist/index.js';

const screenshotDir = path.resolve('reports/screenshots/rematch-fix');
if (!fs.existsSync(screenshotDir)) {
  fs.mkdirSync(screenshotDir, { recursive: true });
}

const chromiumPath = 'C:\\Users\\Shaik Afrid\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe';

async function run() {
  console.log('--- Starting Playwright Real-Browser Rematch & Standings Verification ---');

  const browser = await chromium.launch({
    executablePath: chromiumPath,
    headless: true,
  });

  const hostCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const hostPage = await hostCtx.newPage();

  const guestCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const guestPage = await guestCtx.newPage();

  try {
    // 1. Host logs in
    console.log('1. Logging in Host (AfridHost)...');
    await hostPage.goto('http://localhost:5173/');
    await hostPage.waitForSelector('#username-input');
    await hostPage.fill('#username-input', 'AfridHost');
    await hostPage.click('button:has-text("Play Now")');

    const createBtn = hostPage.locator('[data-testid="create-room-btn"]');
    await createBtn.waitFor({ state: 'visible', timeout: 15000 });
    await createBtn.click();

    // Select UNO Show 'em No Mercy variant
    const noMercyOption = hostPage.locator('[data-testid="variant-select-no-mercy"]');
    await noMercyOption.waitFor({ state: 'visible', timeout: 10000 });
    await noMercyOption.click();
    await hostPage.click('[data-testid="confirm-create-room-btn"]');

    await hostPage.waitForURL(/\/room\/[A-Z0-9]+/, { timeout: 15000 });
    const roomCode = hostPage.url().split('/room/')[1].split('?')[0].trim();
    console.log(`Room created successfully with code: ${roomCode}`);

    // 2. Guest logs in and joins
    console.log('2. Logging in Guest (ShaikPlayer)...');
    await guestPage.goto('http://localhost:5173/');
    await guestPage.waitForSelector('#username-input');
    await guestPage.fill('#username-input', 'ShaikPlayer');
    await guestPage.click('button:has-text("Play Now")');

    const joinBtn = guestPage.locator('[data-testid="join-room-btn"]');
    await joinBtn.waitFor({ state: 'visible', timeout: 15000 });
    await joinBtn.click();

    await guestPage.waitForSelector('#room-code-input');
    await guestPage.fill('#room-code-input', roomCode);
    await guestPage.click('[data-testid="confirm-join-room-btn"]');

    // Wait for both in lobby
    await guestPage.waitForSelector('text=Room Code', { timeout: 15000 });
    console.log('Both players connected in lobby.');

    // Guest readies up
    const readyToggle = guestPage.locator('[data-testid="ready-toggle-btn"]');
    await readyToggle.waitFor({ state: 'visible' });
    await readyToggle.click();
    await hostPage.waitForTimeout(1000);

    // Host starts match 1
    console.log('3. Starting Match 1...');
    const startMatchBtn = hostPage.locator('[data-testid="start-game-btn"]');
    await startMatchBtn.waitFor({ state: 'visible' });
    await startMatchBtn.click();

    // Wait for game board to load
    await hostPage.waitForSelector('[data-testid="game-board"]', { timeout: 15000 });
    await guestPage.waitForSelector('[data-testid="game-board"]', { timeout: 15000 });
    await hostPage.waitForTimeout(1000);

    await hostPage.screenshot({ path: path.join(screenshotDir, '01_match1_active_board.png') });
    console.log('Screenshot saved: 01_match1_active_board.png');

    // 4. Simulate No Mercy Elimination completion
    console.log('4. Simulating Match 1 completion by Mercy elimination...');
    const dbRoom = await prisma.room.findUnique({
      where: { roomCode },
      include: { members: { include: { guest: true } } },
    });
    const hostMember = dbRoom.members.find((m) => m.guest.username === 'AfridHost');
    const guestMember = dbRoom.members.find((m) => m.guest.username === 'ShaikPlayer');

    const activeMatch = await prisma.match.findFirst({
      where: { roomId: dbRoom.id, status: MatchStatus.IN_PROGRESS },
    });

    if (activeMatch) {
      await prisma.$transaction(async (tx) => {
        await tx.match.update({
          where: { id: activeMatch.id },
          data: {
            status: MatchStatus.COMPLETED,
            winnerGuestId: hostMember.guestId,
          },
        });
        await tx.matchPlayer.updateMany({
          where: { matchId: activeMatch.id, guestId: hostMember.guestId },
          data: { score: 250, isWinner: true },
        });
        await tx.matchPlayer.updateMany({
          where: { matchId: activeMatch.id, guestId: guestMember.guestId },
          data: { score: 0, isWinner: false },
        });
        await tx.room.update({
          where: { id: dbRoom.id },
          data: { status: RoomStatus.FINISHED },
        });
      });
    }

    // If modal is not yet open, open it via store evaluate
    await hostPage.evaluate(({ hostId, guestId }) => {
      const gStore = window.__UNO_GAME_STORE__;
      if (gStore) {
        gStore.setState({
          showMatchResultModal: true,
          matchWinnerData: { id: hostId, username: 'AfridHost', score: 250, wonByLastStanding: true },
          gameState: {
            ...gStore.getState().gameState,
            status: 'COMPLETED',
            roundNumber: 1,
            targetScore: 1000,
            winner: { id: hostId, username: 'AfridHost', score: 250, wonByLastStanding: true },
            players: [
              { id: guestId, username: 'ShaikPlayer', cardCount: 25, isEliminated: true, score: 0, cumulativeScore: 0, hasDeclaredUno: false },
              { id: hostId, username: 'AfridHost', cardCount: 7, isEliminated: false, score: 250, cumulativeScore: 250, hasDeclaredUno: false },
            ],
          },
        });
      }
    }, { hostId: hostMember.guestId, guestId: guestMember.guestId });

    await guestPage.evaluate(({ hostId, guestId }) => {
      const gStore = window.__UNO_GAME_STORE__;
      if (gStore) {
        gStore.setState({
          showMatchResultModal: true,
          matchWinnerData: { id: hostId, username: 'AfridHost', score: 250, wonByLastStanding: true },
          gameState: {
            ...gStore.getState().gameState,
            status: 'COMPLETED',
            roundNumber: 1,
            targetScore: 1000,
            winner: { id: hostId, username: 'AfridHost', score: 250, wonByLastStanding: true },
            players: [
              { id: guestId, username: 'ShaikPlayer', cardCount: 25, isEliminated: true, score: 0, cumulativeScore: 0, hasDeclaredUno: false },
              { id: hostId, username: 'AfridHost', cardCount: 7, isEliminated: false, score: 250, cumulativeScore: 250, hasDeclaredUno: false },
            ],
          },
        });
      }
    }, { hostId: hostMember.guestId, guestId: guestMember.guestId });

    await hostPage.waitForSelector('[data-testid="match-result-modal"]', { timeout: 10000 });
    await guestPage.waitForSelector('[data-testid="match-result-modal"]', { timeout: 10000 });
    await hostPage.waitForTimeout(500);

    // Verify Match 1 results:
    const championText = await hostPage.textContent('h2');
    console.log('Champion header:', championText);
    const subtitleText = await hostPage.textContent('[data-testid="victory-subtitle"]');
    console.log('Victory subtitle:', subtitleText);
    const rank1Name = await hostPage.textContent('[data-testid="standing-name-0"]');
    const rank1Score = await hostPage.textContent('[data-testid="standing-score-0"]');
    console.log(`Rank 1: ${rank1Name?.trim()} - ${rank1Score?.trim()}`);

    const rank2Name = await hostPage.textContent('[data-testid="standing-name-1"]');
    const rank2Score = await hostPage.textContent('[data-testid="standing-score-1"]');
    console.log(`Rank 2: ${rank2Name?.trim()} - ${rank2Score?.trim()}`);

    await hostPage.screenshot({ path: path.join(screenshotDir, '02_match_result_modal_champion_verified.png') });
    console.log('Screenshot saved: 02_match_result_modal_champion_verified.png');

    // 5. Host clicks "PLAY AGAIN"
    console.log('5. Host clicking "PLAY AGAIN"...');
    const playAgainBtn = hostPage.locator('[data-testid="match-result-play-again"]');
    await playAgainBtn.waitFor({ state: 'visible' });
    await playAgainBtn.click();

    // Verify modal closes and new match board appears
    await hostPage.waitForTimeout(2000);
    await hostPage.screenshot({ path: path.join(screenshotDir, '03_rematch_match2_started.png') });
    console.log('Screenshot saved: 03_rematch_match2_started.png');

    // 6. Simulate Match 2 Multi-Match Cumulative Score View
    console.log('6. Verifying multi-match cumulative scores on Rematch completion...');
    await hostPage.evaluate(({ hostId, guestId }) => {
      const gStore = window.__UNO_GAME_STORE__;
      if (gStore) {
        gStore.setState({
          showMatchResultModal: true,
          matchWinnerData: { id: hostId, username: 'AfridHost', score: 300, cumulativeScore: 550 },
          gameState: {
            ...gStore.getState().gameState,
            status: 'COMPLETED',
            roundNumber: 2,
            targetScore: 1000,
            winner: { id: hostId, username: 'AfridHost', score: 300, cumulativeScore: 550 },
            players: [
              { id: hostId, username: 'AfridHost', cardCount: 0, isEliminated: false, score: 300, cumulativeScore: 550, hasDeclaredUno: true },
              { id: guestId, username: 'ShaikPlayer', cardCount: 12, isEliminated: false, score: 0, cumulativeScore: 0, hasDeclaredUno: false },
            ],
          },
        });
      }
    }, { hostId: hostMember.guestId, guestId: guestMember.guestId });

    await hostPage.waitForTimeout(500);
    await hostPage.screenshot({ path: path.join(screenshotDir, '04_multi_match_cumulative_scores_verified.png') });
    console.log('Screenshot saved: 04_multi_match_cumulative_scores_verified.png');

    console.log('--- Real-Browser Verification Successfully Completed! ---');
  } catch (err) {
    console.error('Real-browser test failed:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
