import { test, expect, BrowserContext, Page } from '@playwright/test';

test.describe('UNO Ultimate — UNO Flip Multiplayer E2E', () => {
  let contextAlice: BrowserContext;
  let contextBob: BrowserContext;
  let pageAlice: Page;
  let pageBob: Page;

  test.beforeEach(async ({ browser }) => {
    // Two isolated browser contexts with separate cookies, local storage & session state
    contextAlice = await browser.newContext();
    contextBob = await browser.newContext();
    pageAlice = await contextAlice.newPage();
    pageBob = await contextBob.newPage();
  });

  test.afterEach(async () => {
    await contextAlice.close();
    await contextBob.close();
  });

  test('E2E: Host selects UNO Flip variant, both players see variant in lobby, 7 cards dealt, side badge active, and state recovered on refresh', async () => {
    // -------------------------------------------------------------
    // Step 1: Alice creates private room with UNO Flip variant
    // -------------------------------------------------------------
    await pageAlice.goto('/');
    await pageAlice.fill('#username-input', 'AliceFlip');
    await pageAlice.click('button[type="submit"]');

    await expect(pageAlice).toHaveURL(/\/dashboard/);
    await expect(pageAlice.locator('header').getByText('AliceFlip')).toBeVisible();

    await pageAlice.click('[data-testid="create-room-btn"]');

    // Select UNO Flip variant button
    const flipVariantBtn = pageAlice.locator('[data-testid="variant-select-uno-flip"]');
    await expect(flipVariantBtn).toBeVisible();
    await flipVariantBtn.click();

    await pageAlice.click('[data-testid="confirm-create-room-btn"]');

    await expect(pageAlice).toHaveURL(/\/room\/[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}/);
    const roomCodeElement = pageAlice.locator('[data-testid="room-code-display"]');
    await expect(roomCodeElement).toBeVisible();
    const rawRoomCode = await roomCodeElement.textContent();
    expect(rawRoomCode).toBeTruthy();
    const roomCode = rawRoomCode!.trim();

    // Verify Alice sees the UNO Flip badge in Lobby
    await expect(pageAlice.locator('text=UNO Flip!').first()).toBeVisible();
    await expect(pageAlice.locator('text=112 DUAL-SIDED CARDS').first()).toBeVisible();

    // -------------------------------------------------------------
    // Step 2: Bob joins Alice's private room via code
    // -------------------------------------------------------------
    await pageBob.goto('/');
    await pageBob.fill('#username-input', 'BobFlip');
    await pageBob.click('button[type="submit"]');

    await expect(pageBob).toHaveURL(/\/dashboard/);
    await expect(pageBob.locator('header').getByText('BobFlip')).toBeVisible();

    await pageBob.click('[data-testid="join-room-btn"]');
    await pageBob.fill('#room-code-input', roomCode);
    await pageBob.click('[data-testid="confirm-join-room-btn"]');

    await expect(pageBob).toHaveURL(`/room/${roomCode}`);

    // Verify Bob also sees the UNO Flip variant badge in Lobby
    await expect(pageBob.locator('text=UNO Flip!').first()).toBeVisible();
    await expect(pageBob.locator('text=112 DUAL-SIDED CARDS').first()).toBeVisible();

    // Verify both players see each other in the lobby
    await expect(pageAlice.locator('text=BobFlip').first()).toBeVisible();
    await expect(pageBob.locator('text=AliceFlip').first()).toBeVisible();

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
    // Step 4: Verify countdown banner & transition to Game Board
    // -------------------------------------------------------------
    const countdownBanner = pageAlice.locator('[data-testid="starting-countdown-banner"]');
    await expect(countdownBanner).toBeVisible();

    // Wait for game start navigation on both screens
    await expect(pageAlice).toHaveURL(`/game/${roomCode}`, { timeout: 15000 });
    await expect(pageBob).toHaveURL(`/game/${roomCode}`, { timeout: 15000 });

    // Verify Game Board renders on both screens
    await expect(pageAlice.locator('[data-testid="game-board"]')).toBeVisible();
    await expect(pageBob.locator('[data-testid="game-board"]')).toBeVisible();

    // Verify UNO Flip Active Side Badge is visible on game board (initially LIGHT SIDE)
    const aliceSideBadge = pageAlice.locator('[data-testid="active-side-badge"]');
    const bobSideBadge = pageBob.locator('[data-testid="active-side-badge"]');
    await expect(aliceSideBadge).toBeVisible();
    await expect(bobSideBadge).toBeVisible();
    await expect(aliceSideBadge).toContainText('LIGHT SIDE');
    await expect(bobSideBadge).toContainText('LIGHT SIDE');

    // Verify 7 cards dealt to both players per official Mattel GDR44 rules
    const aliceHandCards = pageAlice.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
    const bobHandCards = pageBob.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
    await expect(aliceHandCards).toHaveCount(7);
    await expect(bobHandCards).toHaveCount(7);

    // Verify Discard Pile and Draw Pile are rendered
    await expect(pageAlice.locator('[data-testid="discard-pile"]')).toBeVisible();
    await expect(pageAlice.locator('[data-testid="draw-pile-btn"]')).toBeVisible();

    // -------------------------------------------------------------
    // Step 5: Turn-taking on Light Side
    // -------------------------------------------------------------
    const isAliceTurn = await pageAlice.locator('text=YOUR TURN').isVisible();
    const activePage = isAliceTurn ? pageAlice : pageBob;
    const waitingPage = isAliceTurn ? pageBob : pageAlice;

    const playableCards = activePage.locator('[data-testid="player-hand"] [data-is-playable="true"]');
    const playableCount = await playableCards.count();

    if (playableCount > 0) {
      const firstPlayable = playableCards.first();
      const cardValue = await firstPlayable.getAttribute('data-card-value');
      const isWild = cardValue === 'wild' || cardValue === 'wild_draw_two';

      await firstPlayable.click();

      if (isWild) {
        const redChoice = activePage.locator('[data-testid="wild-color-red"]');
        if (await redChoice.isVisible()) {
          await redChoice.click();
        }
      }

      const activeHand = activePage.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
      await expect(activeHand).toHaveCount(6, { timeout: 5000 });
    } else {
      await activePage.locator('[data-testid="draw-pile-btn"]').click();
      const activeHand = activePage.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
      await expect(activeHand).toHaveCount(8, { timeout: 5000 });

      const passBtn = activePage.locator('button:has-text("Pass Turn")');
      if (await passBtn.isVisible()) {
        await passBtn.click();
      }
    }

    await expect(waitingPage.locator('[data-testid="game-board"]')).toBeVisible();

    // -------------------------------------------------------------
    // Step 6: Server reconnection & state restoration
    // -------------------------------------------------------------
    await pageBob.reload();
    await expect(pageBob.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 15000 });
    const bobRestoredSide = pageBob.locator('[data-testid="active-side-badge"]');
    await expect(bobRestoredSide).toBeVisible();
    const bobRestoredCards = pageBob.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
    const count = await bobRestoredCards.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });
});
