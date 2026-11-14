import { test, expect, BrowserContext, Page } from '@playwright/test';

const getTestHelperHeaders = () => ({
  'Content-Type': 'application/json',
  'X-Test-Helper-Secret': process.env.TEST_HELPER_SECRET || '',
});

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

    // Both players see initial side badge (LIGHT SIDE unless opening card was a Flip card per Mattel GDR44)
    const aliceSideBadge = pageAlice.locator('[data-testid="active-side-badge"]');
    const bobSideBadge = pageBob.locator('[data-testid="active-side-badge"]');
    await expect(aliceSideBadge).toBeVisible();
    await expect(bobSideBadge).toBeVisible();

    const initialSideText = (await aliceSideBadge.textContent()) || '';
    const isInitiallyLight = initialSideText.includes('LIGHT SIDE');
    const firstFlippedSide = isInitiallyLight ? 'DARK SIDE' : 'LIGHT SIDE';
    const firstFlippedCardSide = isInitiallyLight ? 'DARK' : 'LIGHT';
    const secondFlippedSide = isInitiallyLight ? 'LIGHT SIDE' : 'DARK SIDE';

    // Verify initial cards dealt (at least 7 cards per player; 8 if victim of opening Draw One)
    const aliceHand = pageAlice.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
    const bobHand = pageBob.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
    expect(await aliceHand.count()).toBeGreaterThanOrEqual(7);
    expect(await bobHand.count()).toBeGreaterThanOrEqual(7);

    // If the opening card was a Starting Wild card, the designated player chooses starting color to unblock play
    for (const page of [pageAlice, pageBob]) {
      const startingWildModal = page.locator('text=Starting Wild Card');
      if (await startingWildModal.isVisible({ timeout: 1000 }).catch(() => false)) {
        await page.locator('[data-testid="wild-color-blue"]').click();
        await expect(startingWildModal).not.toBeVisible({ timeout: 5000 });
        break;
      }
    }

    // -------------------------------------------------------------
    // Step 5: Inject and Play Flip Card -> Flips to opposite Side
    // -------------------------------------------------------------
    const injectFlipRes = await fetch('http://localhost:4000/api/test/inject-flip-card', {
      method: 'POST',
      headers: getTestHelperHeaders(),
      body: JSON.stringify({ roomCode }),
    });
    expect(injectFlipRes.ok).toBe(true);

    // Assert server-side invariant integrity (112 cards strictly conserved)
    const verifyRes1 = await fetch(`http://localhost:4000/api/test/verify-invariants/${roomCode}`, {
      headers: getTestHelperHeaders(),
    });
    expect(verifyRes1.ok).toBe(true);
    const verifyData1 = await verifyRes1.json();
    expect(verifyData1.valid).toBe(true);
    expect(verifyData1.totalCards).toBe(112);

    // Determine which page currently has the turn
    const isAliceTurn = await pageAlice.locator('text=YOUR TURN').isVisible();
    const activePage = isAliceTurn ? pageAlice : pageBob;

    // Active player finds and clicks the injected Flip card
    const flipCard = activePage.locator('[data-testid="player-hand"] [data-card-value="flip"]').first();
    await expect(flipCard).toBeVisible({ timeout: 5000 });
    await flipCard.click();

    // Both players' screens must now transition to the flipped side!
    await expect(aliceSideBadge).toContainText(firstFlippedSide, { timeout: 10000 });
    await expect(bobSideBadge).toContainText(firstFlippedSide, { timeout: 10000 });

    // Verify cards in hand now expose the flipped side
    await expect(pageAlice.locator(`[data-testid="player-hand"] [data-card-side="${firstFlippedCardSide}"]`).first()).toBeVisible();
    await expect(pageBob.locator(`[data-testid="player-hand"] [data-card-side="${firstFlippedCardSide}"]`).first()).toBeVisible();

    // -------------------------------------------------------------
    // Step 6: Inject and Play second Flip Card -> Flips back to initial Side
    // -------------------------------------------------------------
    const injectDarkFlipRes = await fetch('http://localhost:4000/api/test/inject-flip-card', {
      method: 'POST',
      headers: getTestHelperHeaders(),
      body: JSON.stringify({ roomCode }),
    });
    expect(injectDarkFlipRes.ok).toBe(true);

    // Assert server-side invariant integrity (112 cards strictly conserved)
    const verifyRes2 = await fetch(`http://localhost:4000/api/test/verify-invariants/${roomCode}`, {
      headers: getTestHelperHeaders(),
    });
    expect(verifyRes2.ok).toBe(true);
    const verifyData2 = await verifyRes2.json();
    expect(verifyData2.valid).toBe(true);
    expect(verifyData2.totalCards).toBe(112);

    const isAliceDarkTurn = await pageAlice.locator('text=YOUR TURN').isVisible();
    const darkActivePage = isAliceDarkTurn ? pageAlice : pageBob;

    const darkFlipCard = darkActivePage.locator('[data-testid="player-hand"] [data-card-value="flip"]').first();
    await expect(darkFlipCard).toBeVisible({ timeout: 5000 });
    await darkFlipCard.click();

    // Both players' screens transition back to second side!
    await expect(aliceSideBadge).toContainText(secondFlippedSide, { timeout: 10000 });
    await expect(bobSideBadge).toContainText(secondFlippedSide, { timeout: 10000 });

    // -------------------------------------------------------------
    // Step 7: Page refresh recovery
    // -------------------------------------------------------------
    await pageBob.reload();
    await expect(pageBob.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 15000 });
    await expect(pageBob.locator('[data-testid="active-side-badge"]')).toContainText(secondFlippedSide);
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
      headers: getTestHelperHeaders(),
      body: JSON.stringify({ roomCode }),
    });
    expect(injectWildRes.ok).toBe(true);

    // Assert server-side invariant integrity (112 cards strictly conserved)
    const verifyWildRes = await fetch(`http://localhost:4000/api/test/verify-invariants/${roomCode}`, {
      headers: getTestHelperHeaders(),
    });
    expect(verifyWildRes.ok).toBe(true);
    const verifyWildData = await verifyWildRes.json();
    expect(verifyWildData.valid).toBe(true);
    expect(verifyWildData.totalCards).toBe(112);

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
