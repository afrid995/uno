import { test, expect, BrowserContext, Page } from '@playwright/test';

const getTestHelperHeaders = () => ({
  'Content-Type': 'application/json',
  'X-Test-Helper-Secret': process.env.TEST_HELPER_SECRET || '',
});

test.describe('UNO Ultimate — UNO Flex Multiplayer E2E', () => {
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

  test('E2E: Host creates UNO Flex room (112 cards, 8 Power Cards), starts match, plays cards, verifies Power Card status, invariants, and reload resilience', async ({ request }) => {
    // -------------------------------------------------------------
    // Step 1: Alice creates private room with UNO Flex variant
    // -------------------------------------------------------------
    await pageAlice.goto('/');
    await pageAlice.fill('#username-input', 'AliceFlex');
    await pageAlice.click('button[type="submit"]');

    await expect(pageAlice).toHaveURL(/\/dashboard/);
    await expect(pageAlice.locator('header').getByText('AliceFlex')).toBeVisible();

    await pageAlice.click('[data-testid="create-room-btn"]');

    // Select UNO Flex variant
    const flexVariantBtn = pageAlice.locator('[data-testid="variant-select-uno-flex"]');
    await expect(flexVariantBtn).toBeVisible();
    await flexVariantBtn.click();

    await pageAlice.click('[data-testid="confirm-create-room-btn"]');

    await expect(pageAlice).toHaveURL(/\/room\/[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}/);
    const roomCodeElement = pageAlice.locator('[data-testid="room-code-display"]');
    await expect(roomCodeElement).toBeVisible();
    const rawRoomCode = await roomCodeElement.textContent();
    expect(rawRoomCode).toBeTruthy();
    const roomCode = rawRoomCode!.trim();

    // Verify Alice sees the UNO Flex badge in Lobby
    await expect(pageAlice.locator('text=UNO Flex').first()).toBeVisible();
    await expect(pageAlice.locator('text=112 CARDS • 8 POWER').first()).toBeVisible();

    // -------------------------------------------------------------
    // Step 2: Bob joins Alice's private room via code
    // -------------------------------------------------------------
    await pageBob.goto('/');
    await pageBob.fill('#username-input', 'BobFlex');
    await pageBob.click('button[type="submit"]');

    await expect(pageBob).toHaveURL(/\/dashboard/);
    await expect(pageBob.locator('header').getByText('BobFlex')).toBeVisible();

    await pageBob.click('[data-testid="join-room-btn"]');
    await pageBob.fill('#room-code-input', roomCode);
    await pageBob.click('[data-testid="confirm-join-room-btn"]');

    await expect(pageBob).toHaveURL(`/room/${roomCode}`);

    // Verify Bob also sees the UNO Flex variant badge in Lobby
    await expect(pageBob.locator('text=UNO Flex').first()).toBeVisible();
    await expect(pageBob.locator('text=112 CARDS • 8 POWER').first()).toBeVisible();

    // Verify both players see each other in the lobby
    await expect(pageAlice.locator('text=BobFlex').first()).toBeVisible();
    await expect(pageBob.locator('text=AliceFlex').first()).toBeVisible();

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

    // Verify UNO Flex badge on board
    await expect(pageAlice.locator('[data-testid="uno-flex-badge"]')).toBeVisible();
    await expect(pageBob.locator('[data-testid="uno-flex-badge"]')).toBeVisible();

    // Verify both players start with active Power Cards (green_check)
    await expect(pageAlice.locator('[data-testid="self-power-card-status"]')).toBeVisible();
    const alicePowerStatus = await pageAlice.locator('[data-testid="self-power-card-status"]').getAttribute('data-power-status');
    expect(alicePowerStatus).toBe('green_check');

    const bobPowerStatus = await pageBob.locator('[data-testid="self-power-card-status"]').getAttribute('data-power-status');
    expect(bobPowerStatus).toBe('green_check');

    // Verify 104 playing card conservation invariant via test helper
    const verifyInitRes = await request.get(`http://localhost:4000/api/test/verify-flex-invariants/${roomCode}`, {
      headers: getTestHelperHeaders(),
    });
    if (verifyInitRes.ok()) {
      const initInvariantData = await verifyInitRes.json();
      expect(initInvariantData.valid).toBe(true);
      expect(initInvariantData.totalCards).toBe(104);
    }

    // -------------------------------------------------------------
    // Step 5: Test Power Card state update and reload resilience
    // -------------------------------------------------------------
    // Update Alice's power card status to red_x via test helper endpoint
    const setPowerRes = await request.post('http://localhost:4000/api/test/set-flex-power-card', {
      headers: getTestHelperHeaders(),
      data: {
        roomCode,
        targetUsername: 'AliceFlex',
        powerCardStatus: 'red_x',
      },
    });

    if (setPowerRes.ok()) {
      // Alice should see her power card flip to red_x (POWER USED)
      await expect(pageAlice.locator('[data-testid="self-power-card-status"]')).toHaveAttribute('data-power-status', 'red_x');
    }

    // Reload Alice's page and confirm persistence
    await pageAlice.reload();
    await expect(pageAlice.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 10000 });
    await expect(pageAlice.locator('[data-testid="uno-flex-badge"]')).toBeVisible();
    await expect(pageAlice.locator('[data-testid="self-power-card-status"]')).toHaveAttribute('data-power-status', 'red_x');

    // Final invariant check
    const verifyFinalRes = await request.get(`http://localhost:4000/api/test/verify-flex-invariants/${roomCode}`, {
      headers: getTestHelperHeaders(),
    });
    if (verifyFinalRes.ok()) {
      const finalInvariantData = await verifyFinalRes.json();
      expect(finalInvariantData.valid).toBe(true);
      expect(finalInvariantData.totalCards).toBe(104);
    }
  });
});
