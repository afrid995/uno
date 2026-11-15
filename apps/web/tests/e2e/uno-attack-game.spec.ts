import { test, expect, BrowserContext, Page } from '@playwright/test';

const getTestHelperHeaders = () => ({
  'Content-Type': 'application/json',
  'X-Test-Helper-Secret': process.env.TEST_HELPER_SECRET || '',
});

test.describe('UNO Ultimate — UNO Attack Multiplayer E2E', () => {
  let contextAlice: BrowserContext;
  let contextBob: BrowserContext;
  let pageAlice: Page;
  let pageBob: Page;

  test.beforeEach(async ({ browser }) => {
    contextAlice = await browser.newContext();
    contextBob = await browser.newContext();
    pageAlice = await contextAlice.newPage();
    pageBob = await contextBob.newPage();
  });

  test.afterEach(async () => {
    await contextAlice.close();
    await contextBob.close();
  });

  test('E2E: Host creates UNO Attack room (112 cards), launches match, interacts with Virtual Launcher, validates 112-card conservation invariant, and executes round victory', async ({ request }) => {
    // -------------------------------------------------------------
    // Step 1: Alice creates private room with UNO Attack variant
    // -------------------------------------------------------------
    await pageAlice.goto('/');
    await pageAlice.fill('#username-input', 'AliceAttack');
    await pageAlice.click('button[type="submit"]');

    await expect(pageAlice).toHaveURL(/\/dashboard/);
    await expect(pageAlice.locator('header').getByText('AliceAttack')).toBeVisible();

    await pageAlice.click('[data-testid="create-room-btn"]');

    // Select UNO Attack variant
    const attackVariantBtn = pageAlice.locator('[data-testid="variant-select-uno-attack"]');
    await expect(attackVariantBtn).toBeVisible();
    await attackVariantBtn.click();

    await pageAlice.click('[data-testid="confirm-create-room-btn"]');

    await expect(pageAlice).toHaveURL(/\/room\/[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}/);
    const roomCodeElement = pageAlice.locator('[data-testid="room-code-display"]');
    await expect(roomCodeElement).toBeVisible();
    const rawRoomCode = await roomCodeElement.textContent();
    expect(rawRoomCode).toBeTruthy();
    const roomCode = rawRoomCode!.trim();

    // Verify Alice sees the UNO Attack badge in Lobby
    await expect(pageAlice.locator('text=UNO Attack').first()).toBeVisible();
    await expect(pageAlice.locator('text=112 CARDS • LAUNCHER').first()).toBeVisible();

    // -------------------------------------------------------------
    // Step 2: Bob joins Alice's private room via code
    // -------------------------------------------------------------
    await pageBob.goto('/');
    await pageBob.fill('#username-input', 'BobAttack');
    await pageBob.click('button[type="submit"]');

    await expect(pageBob).toHaveURL(/\/dashboard/);
    await expect(pageBob.locator('header').getByText('BobAttack')).toBeVisible();

    await pageBob.click('[data-testid="join-room-btn"]');
    await pageBob.fill('#room-code-input', roomCode);
    await pageBob.click('[data-testid="confirm-join-room-btn"]');

    await expect(pageBob).toHaveURL(`/room/${roomCode}`);

    // Verify Bob also sees the UNO Attack variant badge in Lobby
    await expect(pageBob.locator('text=UNO Attack').first()).toBeVisible();
    await expect(pageBob.locator('text=112 CARDS • LAUNCHER').first()).toBeVisible();

    // Verify both players see each other in the lobby
    await expect(pageAlice.locator('text=BobAttack').first()).toBeVisible();
    await expect(pageBob.locator('text=AliceAttack').first()).toBeVisible();

    // -------------------------------------------------------------
    // Step 3: Bob marks ready, Alice (host) starts game
    // -------------------------------------------------------------
    await pageBob.click('[data-testid="ready-toggle-btn"]');
    await expect(pageBob.locator('text=Mark as Not Ready')).toBeVisible();

    const startButton = pageAlice.locator('[data-testid="start-game-btn"]');
    await expect(startButton).toBeEnabled();
    await startButton.click();

    // -------------------------------------------------------------
    // Step 4: Verify transition to Game Board with Virtual Launcher
    // -------------------------------------------------------------
    await expect(pageAlice).toHaveURL(`/game/${roomCode}`, { timeout: 15000 });
    await expect(pageBob).toHaveURL(`/game/${roomCode}`, { timeout: 15000 });

    await expect(pageAlice.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 10000 });
    await expect(pageBob.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 10000 });

    // Verify UNO Attack badge on board
    await expect(pageAlice.locator('[data-testid="uno-attack-badge"]')).toBeVisible();
    await expect(pageBob.locator('[data-testid="uno-attack-badge"]')).toBeVisible();

    // Verify Virtual Launcher component is mounted in table center
    await expect(pageAlice.locator('[data-testid="attack-launcher"]')).toBeVisible();
    await expect(pageBob.locator('[data-testid="attack-launcher"]')).toBeVisible();

    // Verify 112 physical card conservation invariant via test helper
    const verifyInitRes = await request.get(`http://localhost:4000/api/test/verify-attack-invariants/${roomCode}`, {
      headers: getTestHelperHeaders(),
    });
    expect(verifyInitRes.ok()).toBe(true);
    const initInvariantData = await verifyInitRes.json();
    expect(initInvariantData.valid).toBe(true);
    expect(initInvariantData.totalCards).toBe(112);

    // -------------------------------------------------------------
    // Step 5: Test Launcher Press Mechanic
    // -------------------------------------------------------------
    // Set launcher override to dispense 0 cards
    const setOverrideRes = await request.post('http://localhost:4000/api/test/set-attack-launcher-override', {
      headers: getTestHelperHeaders(),
      data: { count: 0 },
    });
    expect(setOverrideRes.ok()).toBe(true);

    // Wait for either Alice or Bob to receive initial turn
    await Promise.race([
      pageAlice.locator('[data-testid="your-turn-badge"]').waitFor({ state: 'visible', timeout: 10000 }),
      pageBob.locator('[data-testid="your-turn-badge"]').waitFor({ state: 'visible', timeout: 10000 }),
    ]);

    const isAliceTurn = await pageAlice.locator('[data-testid="your-turn-badge"]').isVisible();
    const activePage = isAliceTurn ? pageAlice : pageBob;
    const inactivePage = isAliceTurn ? pageBob : pageAlice;

    // If starting card is a starting wild, select starting color to continue
    const startingWildPicker = activePage.locator('[data-testid="wild-color-red"]');
    if (await startingWildPicker.isVisible({ timeout: 1500 }).catch(() => false)) {
      await startingWildPicker.click();
    }

    // Active player presses the launcher
    const launcherBtn = activePage.locator('[data-testid="launcher-press-button"]');
    await expect(launcherBtn).toBeEnabled({ timeout: 10000 });
    await launcherBtn.click();

    // Check ejection animation displays safe status (0 cards dispensed)
    await expect(activePage.locator('[data-testid="launcher-ejection-animation"]')).toBeVisible({ timeout: 5000 });
    await expect(activePage.locator('text=SAFE! (0 Cards)')).toBeVisible({ timeout: 5000 });

    // In UNO Attack, pressing the launcher ends turn, so turn switches to the other player
    await expect(inactivePage.locator('[data-testid="your-turn-badge"]')).toBeVisible({ timeout: 10000 });

    // Reset launcher override to random
    await request.post('http://localhost:4000/api/test/set-attack-launcher-override', {
      headers: getTestHelperHeaders(),
      data: { count: null },
    });

    // -------------------------------------------------------------
    // Step 6: Test Deterministic Round Victory Setup
    // -------------------------------------------------------------
    const setupRoundRes = await request.post('http://localhost:4000/api/test/setup-attack-round-end', {
      headers: getTestHelperHeaders(),
      data: { roomCode },
    });
    expect(setupRoundRes.ok()).toBe(true);
    const roundSetupData = await setupRoundRes.json();
    const winnerId = roundSetupData.data.winnerId;

    // Check which page is the winner
    const winnerPage = pageAlice; // Alice was host / player 0
    await expect(winnerPage.locator('[data-testid="your-turn-badge"]')).toBeVisible({ timeout: 10000 });

    // Winner has 1 card in hand, clicks to play it and win
    const playableCard = winnerPage.locator('[data-testid="player-hand"] [data-testid="playing-card"]').first();
    await expect(playableCard).toBeVisible({ timeout: 10000 });
    await playableCard.click();

    // Round Result Modal appears on both screens
    await expect(pageAlice.locator('[data-testid="round-result-modal"]')).toBeVisible({ timeout: 10000 });
    await expect(pageBob.locator('[data-testid="round-result-modal"]')).toBeVisible({ timeout: 10000 });

    // -------------------------------------------------------------
    // Step 7: Test reload resilience & persistence
    // -------------------------------------------------------------
    await pageAlice.reload();
    await expect(pageAlice.locator('[data-testid="round-result-modal"]')).toBeVisible({ timeout: 10000 });

    // Final invariant check: exactly 112 cards conserved
    const verifyFinalRes = await request.get(`http://localhost:4000/api/test/verify-attack-invariants/${roomCode}`, {
      headers: getTestHelperHeaders(),
    });
    expect(verifyFinalRes.ok()).toBe(true);
    const finalInvariantData = await verifyFinalRes.json();
    expect(finalInvariantData.valid).toBe(true);
    expect(finalInvariantData.totalCards).toBe(112);
  });
});
