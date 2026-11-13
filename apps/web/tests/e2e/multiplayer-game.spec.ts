import { test, expect, BrowserContext, Page } from '@playwright/test';

test.describe('UNO Ultimate — Playable Classic Multiplayer E2E', () => {
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

  test('E2E: Full 2-player match lifecycle — Lobby, Countdown, 7-Card Deal, Real-time Turn & Disconnect Recovery', async () => {
    // -------------------------------------------------------------
    // Step 1: Alice creates a private room
    // -------------------------------------------------------------
    await pageAlice.goto('/');
    await pageAlice.fill('#username-input', 'Alice');
    await pageAlice.click('button[type="submit"]');

    await expect(pageAlice).toHaveURL(/\/dashboard/);
    await expect(pageAlice.locator('header').getByText('Alice')).toBeVisible();

    await pageAlice.click('[data-testid="create-room-btn"]');
    await pageAlice.click('[data-testid="confirm-create-room-btn"]');

    await expect(pageAlice).toHaveURL(/\/room\/[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}/);
    const roomCodeElement = pageAlice.locator('[data-testid="room-code-display"]');
    await expect(roomCodeElement).toBeVisible();
    const rawRoomCode = await roomCodeElement.textContent();
    expect(rawRoomCode).toBeTruthy();
    const roomCode = rawRoomCode!.trim();

    // -------------------------------------------------------------
    // Step 2: Bob joins Alice's private room via code
    // -------------------------------------------------------------
    await pageBob.goto('/');
    await pageBob.fill('#username-input', 'Bob');
    await pageBob.click('button[type="submit"]');

    await expect(pageBob).toHaveURL(/\/dashboard/);
    await expect(pageBob.locator('header').getByText('Bob')).toBeVisible();

    await pageBob.click('[data-testid="join-room-btn"]');
    await pageBob.fill('#room-code-input', roomCode);
    await pageBob.click('[data-testid="confirm-join-room-btn"]');

    await expect(pageBob).toHaveURL(`/room/${roomCode}`);

    // Verify both players see each other in the lobby
    await expect(pageAlice.locator('text=Bob').first()).toBeVisible();
    await expect(pageBob.locator('text=Alice').first()).toBeVisible();

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
    // Step 4: Verify countdown banner & automatic transition to Game Page
    // -------------------------------------------------------------
    const countdownBanner = pageAlice.locator('[data-testid="starting-countdown-banner"]');
    await expect(countdownBanner).toBeVisible();

    // Wait for game start navigation on both screens
    await expect(pageAlice).toHaveURL(`/game/${roomCode}`, { timeout: 15000 });
    await expect(pageBob).toHaveURL(`/game/${roomCode}`, { timeout: 15000 });

    // Verify Game Board renders on both screens
    await expect(pageAlice.locator('[data-testid="game-board"]')).toBeVisible();
    await expect(pageBob.locator('[data-testid="game-board"]')).toBeVisible();

    // Verify 7 cards dealt to both players per official Mattel 42001 rules
    const aliceHandCards = pageAlice.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
    const bobHandCards = pageBob.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
    await expect(aliceHandCards).toHaveCount(7);
    await expect(bobHandCards).toHaveCount(7);

    // Verify Discard Pile and Draw Pile are rendered
    await expect(pageAlice.locator('[data-testid="discard-pile"]')).toBeVisible();
    await expect(pageAlice.locator('[data-testid="draw-pile-btn"]')).toBeVisible();
    await expect(pageAlice.locator('[data-testid="uno-button"]')).toBeVisible();

    // -------------------------------------------------------------
    // Step 5: Turn-taking and real-time discard pile synchronization
    // -------------------------------------------------------------
    const isAliceTurn = await pageAlice.locator('text=YOUR TURN').isVisible();
    const activePage = isAliceTurn ? pageAlice : pageBob;
    const waitingPage = isAliceTurn ? pageBob : pageAlice;

    // Active player either plays a playable card or draws from draw pile
    const playableCards = activePage.locator('[data-testid="player-hand"] [data-is-playable="true"]');
    const playableCount = await playableCards.count();

    if (playableCount > 0) {
      // Play the first playable card
      const firstPlayable = playableCards.first();
      const cardValue = await firstPlayable.getAttribute('data-card-value');
      const isWild = cardValue === 'wild' || cardValue === 'wild_draw_four';

      await firstPlayable.click();

      if (isWild) {
        // Choose color from wild color picker
        const redChoice = activePage.locator('[data-testid="wild-color-red"]');
        if (await redChoice.isVisible()) {
          await redChoice.click();
        }
      }

      // Hand decreases by 1
      const activeHand = activePage.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
      await expect(activeHand).toHaveCount(6, { timeout: 5000 });
    } else {
      // Draw a card
      await activePage.locator('[data-testid="draw-pile-btn"]').click();
      // Hand now has 8 cards
      const activeHand = activePage.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
      await expect(activeHand).toHaveCount(8, { timeout: 5000 });

      // If Pass Turn button appears, pass turn
      const passBtn = activePage.locator('button:has-text("Pass Turn")');
      if (await passBtn.isVisible()) {
        await passBtn.click();
      }
    }

    // Verify game state reflects across both screens
    await expect(waitingPage.locator('[data-testid="game-board"]')).toBeVisible();

    // -------------------------------------------------------------
    // Step 6: Server reconnection & state restoration during active match
    // -------------------------------------------------------------
    // Bob reloads his browser (simulating network disconnect / refresh)
    await pageBob.reload();

    // Bob re-authenticates and recovers game state automatically
    await expect(pageBob.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 15000 });
    const bobRestoredCards = pageBob.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
    // Bob still has his cards (not 0 or lost)
    const count = await bobRestoredCards.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });

  test('E2E: Direct invitation link join flow', async () => {
    // Alice creates a room
    await pageAlice.goto('/');
    await pageAlice.fill('#username-input', 'HostAlice');
    await pageAlice.click('button[type="submit"]');
    await expect(pageAlice).toHaveURL(/\/dashboard/);

    await pageAlice.click('[data-testid="create-room-btn"]');
    await pageAlice.click('[data-testid="confirm-create-room-btn"]');

    await expect(pageAlice).toHaveURL(/\/room\/[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}/);
    const roomCodeElement = pageAlice.locator('[data-testid="room-code-display"]');
    const roomCode = (await roomCodeElement.textContent())!.trim();

    // Bob joins directly using the invitation URL /join/:roomCode
    await pageBob.goto(`/join/${roomCode}`);
    // On the invite page, Bob is prompted for username
    await pageBob.fill('#invite-username', 'InviteBob');
    await pageBob.click('button[type="submit"]');

    // Bob lands directly in Alice's room lobby
    await expect(pageBob).toHaveURL(`/room/${roomCode}`);
    await expect(pageBob.locator('text=HostAlice').first()).toBeVisible();
    await expect(pageAlice.locator('text=InviteBob').first()).toBeVisible();
  });
});
