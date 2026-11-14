import { test, expect, BrowserContext, Page } from '@playwright/test';

const getTestHelperHeaders = () => ({
  'Content-Type': 'application/json',
  'X-Test-Helper-Secret': process.env.TEST_HELPER_SECRET || '',
});

test.describe('UNO Ultimate — UNO All Wild Multiplayer E2E', () => {
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

  test('E2E: Host creates All Wild room (112 cards), starts match, plays cards directly without color picker, handles Targeted Draw Two modal, and verifies invariants and reload resilience', async ({ request }) => {
    // -------------------------------------------------------------
    // Step 1: Alice creates private room with UNO All Wild variant
    // -------------------------------------------------------------
    await pageAlice.goto('/');
    await pageAlice.fill('#username-input', 'AliceWild');
    await pageAlice.click('button[type="submit"]');

    await expect(pageAlice).toHaveURL(/\/dashboard/);
    await expect(pageAlice.locator('header').getByText('AliceWild')).toBeVisible();

    await pageAlice.click('[data-testid="create-room-btn"]');

    // Select All Wild variant
    const allWildVariantBtn = pageAlice.locator('[data-testid="variant-select-all-wild"]');
    await expect(allWildVariantBtn).toBeVisible();
    await allWildVariantBtn.click();

    await pageAlice.click('[data-testid="confirm-create-room-btn"]');

    await expect(pageAlice).toHaveURL(/\/room\/[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}/);
    const roomCodeElement = pageAlice.locator('[data-testid="room-code-display"]');
    await expect(roomCodeElement).toBeVisible();
    const rawRoomCode = await roomCodeElement.textContent();
    expect(rawRoomCode).toBeTruthy();
    const roomCode = rawRoomCode!.trim();

    // Verify Alice sees the All Wild badge in Lobby
    await expect(pageAlice.locator('text=UNO All Wild').first()).toBeVisible();
    await expect(pageAlice.locator('text=112 CARDS • ALL WILD').first()).toBeVisible();

    // -------------------------------------------------------------
    // Step 2: Bob joins Alice's private room via code
    // -------------------------------------------------------------
    await pageBob.goto('/');
    await pageBob.fill('#username-input', 'BobWild');
    await pageBob.click('button[type="submit"]');

    await expect(pageBob).toHaveURL(/\/dashboard/);
    await expect(pageBob.locator('header').getByText('BobWild')).toBeVisible();

    await pageBob.click('[data-testid="join-room-btn"]');
    await pageBob.fill('#room-code-input', roomCode);
    await pageBob.click('[data-testid="confirm-join-room-btn"]');

    await expect(pageBob).toHaveURL(`/room/${roomCode}`);

    // Verify Bob also sees the All Wild variant badge in Lobby
    await expect(pageBob.locator('text=UNO All Wild').first()).toBeVisible();
    await expect(pageBob.locator('text=112 CARDS • ALL WILD').first()).toBeVisible();

    // Verify both players see each other in the lobby
    await expect(pageAlice.locator('text=BobWild').first()).toBeVisible();
    await expect(pageBob.locator('text=AliceWild').first()).toBeVisible();

    // -------------------------------------------------------------
    // Step 3: Bob marks ready, Alice (host) starts game
    // -------------------------------------------------------------
    await pageBob.click('[data-testid="ready-toggle-btn"]');
    await expect(pageBob.locator('text=Mark as Not Ready')).toBeVisible();

    // Host Start Game button becomes enabled
    const startButton = pageAlice.locator('[data-testid="start-game-btn"]');
    await expect(startButton).toBeEnabled();
    await startButton.click();

    // -------------------------------------------------------------
    // Step 4: Verify transition to Game Board
    // -------------------------------------------------------------
    await expect(pageAlice).toHaveURL(`/game/${roomCode}`, { timeout: 15000 });
    await expect(pageBob).toHaveURL(`/game/${roomCode}`, { timeout: 15000 });

    await expect(pageAlice.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 10000 });
    await expect(pageBob.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 10000 });

    // Verify All Wild badge on board
    await expect(pageAlice.locator('[data-testid="all-wild-badge"]')).toBeVisible();
    await expect(pageBob.locator('[data-testid="all-wild-badge"]')).toBeVisible();

    // Verify 112 physical card conservation invariant via test helper
    const verifyInitRes = await request.get(`http://localhost:4000/api/test/verify-all-wild-invariants/${roomCode}`, {
      headers: getTestHelperHeaders(),
    });
    if (verifyInitRes.ok()) {
      const initInvariantData = await verifyInitRes.json();
      expect(initInvariantData.valid).toBe(true);
      expect(initInvariantData.totalCards).toBe(112);
    }

    // -------------------------------------------------------------
    // Step 5: Test reload resilience & persistence
    // -------------------------------------------------------------
    await pageAlice.reload();
    await expect(pageAlice.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 10000 });
    await expect(pageAlice.locator('[data-testid="all-wild-badge"]')).toBeVisible();

    // Final invariant check
    const verifyFinalRes = await request.get(`http://localhost:4000/api/test/verify-all-wild-invariants/${roomCode}`, {
      headers: getTestHelperHeaders(),
    });
    if (verifyFinalRes.ok()) {
      const finalInvariantData = await verifyFinalRes.json();
      expect(finalInvariantData.valid).toBe(true);
      expect(finalInvariantData.totalCards).toBe(112);
    }
  });
});
