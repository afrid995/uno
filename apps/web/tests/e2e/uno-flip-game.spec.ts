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

  test('E2E: Host selects UNO Flip variant, plays Flip card to transition to Dark Side, verifies Dark Side UI on both screens, plays Flip card back to Light Side, and verifies page refresh', async () => {
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
    // Step 4: Verify transition to Game Board & Initial Light Side
    // -------------------------------------------------------------
    await expect(pageAlice).toHaveURL(`/game/${roomCode}`, { timeout: 15000 });
    await expect(pageBob).toHaveURL(`/game/${roomCode}`, { timeout: 15000 });

    await expect(pageAlice.locator('[data-testid="game-board"]')).toBeVisible();
    await expect(pageBob.locator('[data-testid="game-board"]')).toBeVisible();

    // Both players see LIGHT SIDE badge
    const aliceSideBadge = pageAlice.locator('[data-testid="active-side-badge"]');
    const bobSideBadge = pageBob.locator('[data-testid="active-side-badge"]');
    await expect(aliceSideBadge).toBeVisible();
    await expect(bobSideBadge).toBeVisible();
    await expect(aliceSideBadge).toContainText('LIGHT SIDE');
    await expect(bobSideBadge).toContainText('LIGHT SIDE');

    // Verify 7 cards dealt to each
    const aliceHand = pageAlice.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
    const bobHand = pageBob.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
    await expect(aliceHand).toHaveCount(7);
    await expect(bobHand).toHaveCount(7);

    // -------------------------------------------------------------
    // Step 5: Inject and Play Light Flip Card -> Flips to Dark Side
    // -------------------------------------------------------------
    const injectFlipRes = await fetch('http://localhost:4000/api/test/inject-flip-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode }),
    });
    expect(injectFlipRes.ok).toBe(true);

    // Determine which page currently has the turn
    const isAliceTurn = await pageAlice.locator('text=YOUR TURN').isVisible();
    const activePage = isAliceTurn ? pageAlice : pageBob;

    // Active player finds and clicks the injected Flip card
    const flipCard = activePage.locator('[data-testid="player-hand"] [data-card-value="flip"]').first();
    await expect(flipCard).toBeVisible({ timeout: 5000 });
    await flipCard.click();

    // Both players' screens must now transition to DARK SIDE!
    await expect(aliceSideBadge).toContainText('DARK SIDE', { timeout: 10000 });
    await expect(bobSideBadge).toContainText('DARK SIDE', { timeout: 10000 });

    // Verify cards in hand now expose DARK side
    await expect(pageAlice.locator('[data-testid="player-hand"] [data-card-side="DARK"]').first()).toBeVisible();
    await expect(pageBob.locator('[data-testid="player-hand"] [data-card-side="DARK"]').first()).toBeVisible();

    // -------------------------------------------------------------
    // Step 6: Inject and Play Dark Flip Card -> Flips Back to Light Side
    // -------------------------------------------------------------
    const injectDarkFlipRes = await fetch('http://localhost:4000/api/test/inject-flip-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode }),
    });
    expect(injectDarkFlipRes.ok).toBe(true);

    const isAliceDarkTurn = await pageAlice.locator('text=YOUR TURN').isVisible();
    const darkActivePage = isAliceDarkTurn ? pageAlice : pageBob;

    const darkFlipCard = darkActivePage.locator('[data-testid="player-hand"] [data-card-value="flip"]').first();
    await expect(darkFlipCard).toBeVisible({ timeout: 5000 });
    await darkFlipCard.click();

    // Both players' screens transition back to LIGHT SIDE!
    await expect(aliceSideBadge).toContainText('LIGHT SIDE', { timeout: 10000 });
    await expect(bobSideBadge).toContainText('LIGHT SIDE', { timeout: 10000 });

    // -------------------------------------------------------------
    // Step 7: Page refresh recovery
    // -------------------------------------------------------------
    await pageBob.reload();
    await expect(pageBob.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 15000 });
    await expect(pageBob.locator('[data-testid="active-side-badge"]')).toContainText('LIGHT SIDE');
    const bobRestoredCards = pageBob.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
    const count = await bobRestoredCards.count();
    expect(count).toBeGreaterThanOrEqual(6);
  });

  test('E2E: Starting Wild card prompts designated player for color, displays waiting banner to opponent, broadcasts color upon selection, and unblocks gameplay', async () => {
    // -------------------------------------------------------------
    // Step 1: Alice creates private room with UNO Flip variant
    // -------------------------------------------------------------
    await pageAlice.goto('/');
    await pageAlice.fill('#username-input', 'AliceWild');
    await pageAlice.click('button[type="submit"]');

    await expect(pageAlice).toHaveURL(/\/dashboard/);
    await pageAlice.click('[data-testid="create-room-btn"]');

    const flipVariantBtn = pageAlice.locator('[data-testid="variant-select-uno-flip"]');
    await expect(flipVariantBtn).toBeVisible();
    await flipVariantBtn.click();

    await pageAlice.click('[data-testid="confirm-create-room-btn"]');

    await expect(pageAlice).toHaveURL(/\/room\/[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}/);
    const roomCodeElement = pageAlice.locator('[data-testid="room-code-display"]');
    await expect(roomCodeElement).toBeVisible();
    const rawRoomCode = await roomCodeElement.textContent();
    const roomCode = rawRoomCode!.trim();

    // -------------------------------------------------------------
    // Step 2: Bob joins and readies, Alice starts match
    // -------------------------------------------------------------
    await pageBob.goto('/');
    await pageBob.fill('#username-input', 'BobWild');
    await pageBob.click('button[type="submit"]');

    await expect(pageBob).toHaveURL(/\/dashboard/);
    await pageBob.click('[data-testid="join-room-btn"]');
    await pageBob.fill('#room-code-input', roomCode);
    await pageBob.click('[data-testid="confirm-join-room-btn"]');

    await expect(pageBob).toHaveURL(`/room/${roomCode}`);
    await pageBob.click('[data-testid="ready-toggle-btn"]');

    const startButton = pageAlice.locator('[data-testid="start-game-btn"]');
    await expect(startButton).toBeEnabled();
    await startButton.click();

    await expect(pageAlice).toHaveURL(`/game/${roomCode}`, { timeout: 15000 });
    await expect(pageBob).toHaveURL(`/game/${roomCode}`, { timeout: 15000 });

    await expect(pageAlice.locator('[data-testid="game-board"]')).toBeVisible();
    await expect(pageBob.locator('[data-testid="game-board"]')).toBeVisible();

    // -------------------------------------------------------------
    // Step 3: Inject Starting Wild State
    // -------------------------------------------------------------
    const injectWildRes = await fetch('http://localhost:4000/api/test/inject-starting-wild', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomCode }),
    });
    expect(injectWildRes.ok).toBe(true);

    // Identify which player is designated chooser
    const aliceHasPicker = await pageAlice.locator('[data-testid="wild-color-green"]').isVisible();
    const designatedPage = aliceHasPicker ? pageAlice : pageBob;
    const waitingPage = aliceHasPicker ? pageBob : pageAlice;

    // Designated player sees Starting Wild color picker modal
    await expect(designatedPage.locator('text=Starting Wild Card')).toBeVisible();
    await expect(designatedPage.locator('[data-testid="wild-color-green"]')).toBeVisible();

    // Non-designated player sees waiting banner
    await expect(waitingPage.locator('[data-testid="starting-wild-waiting-banner"]')).toBeVisible();

    // -------------------------------------------------------------
    // Step 4: Designated player chooses Green
    // -------------------------------------------------------------
    await designatedPage.locator('[data-testid="wild-color-green"]').click();

    // Both players see active color update to Green on discard pile
    await expect(designatedPage.locator('[data-testid="discard-pile"]').getByText('Green')).toBeVisible({ timeout: 5000 });
    await expect(waitingPage.locator('[data-testid="discard-pile"]').getByText('Green')).toBeVisible({ timeout: 5000 });

    // Modal and waiting banner close
    await expect(designatedPage.locator('text=Starting Wild Card')).not.toBeVisible();
    await expect(waitingPage.locator('[data-testid="starting-wild-waiting-banner"]')).not.toBeVisible();
  });
});
