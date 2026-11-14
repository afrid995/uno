import { test, expect, BrowserContext, Page } from '@playwright/test';

const getTestHelperHeaders = () => ({
  'Content-Type': 'application/json',
  'X-Test-Helper-Secret': process.env.TEST_HELPER_SECRET || '',
});

test.describe("UNO Ultimate — UNO Show 'em No Mercy Multiplayer E2E", () => {
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

  test('E2E: Host creates No Mercy room (168 cards, max 6), plays Draw card with Stacking resolution, performs 7s hand swap, triggers 25-card Mercy Rule elimination, and recovers on reload', async () => {
    // -------------------------------------------------------------
    // Step 1: Alice creates private room with UNO Show 'em No Mercy variant
    // -------------------------------------------------------------
    await pageAlice.goto('/');
    await pageAlice.fill('#username-input', 'AliceMercy');
    await pageAlice.click('button[type="submit"]');

    await expect(pageAlice).toHaveURL(/\/dashboard/);
    await expect(pageAlice.locator('header').getByText('AliceMercy')).toBeVisible();

    await pageAlice.click('[data-testid="create-room-btn"]');

    // Select No Mercy variant
    const mercyVariantBtn = pageAlice.locator('[data-testid="variant-select-no-mercy"]');
    await expect(mercyVariantBtn).toBeVisible();
    await mercyVariantBtn.click();

    await pageAlice.click('[data-testid="confirm-create-room-btn"]');

    await expect(pageAlice).toHaveURL(/\/room\/[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}/);
    const roomCodeElement = pageAlice.locator('[data-testid="room-code-display"]');
    await expect(roomCodeElement).toBeVisible();
    const rawRoomCode = await roomCodeElement.textContent();
    expect(rawRoomCode).toBeTruthy();
    const roomCode = rawRoomCode!.trim();

    // Verify Alice sees the No Mercy badge in Lobby
    await expect(pageAlice.locator("text=UNO Show 'em No Mercy").first()).toBeVisible();
    await expect(pageAlice.locator('text=168 CARDS • MAX 6').first()).toBeVisible();

    // -------------------------------------------------------------
    // Step 2: Bob joins Alice's private room via code
    // -------------------------------------------------------------
    await pageBob.goto('/');
    await pageBob.fill('#username-input', 'BobMercy');
    await pageBob.click('button[type="submit"]');

    await expect(pageBob).toHaveURL(/\/dashboard/);
    await expect(pageBob.locator('header').getByText('BobMercy')).toBeVisible();

    await pageBob.click('[data-testid="join-room-btn"]');
    await pageBob.fill('#room-code-input', roomCode);
    await pageBob.click('[data-testid="confirm-join-room-btn"]');

    await expect(pageBob).toHaveURL(`/room/${roomCode}`);

    // Verify Bob also sees the No Mercy variant badge in Lobby
    await expect(pageBob.locator("text=UNO Show 'em No Mercy").first()).toBeVisible();
    await expect(pageBob.locator('text=168 CARDS • MAX 6').first()).toBeVisible();

    // Verify both players see each other in the lobby
    await expect(pageAlice.locator('text=BobMercy').first()).toBeVisible();
    await expect(pageBob.locator('text=AliceMercy').first()).toBeVisible();

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
    // Step 4: Verify transition to Game Board & 168-card Invariants
    // -------------------------------------------------------------
    await expect(pageAlice).toHaveURL(`/game/${roomCode}`, { timeout: 15000 });
    await expect(pageBob).toHaveURL(`/game/${roomCode}`, { timeout: 15000 });

    await expect(pageAlice.locator('[data-testid="game-board"]')).toBeVisible();
    await expect(pageBob.locator('[data-testid="game-board"]')).toBeVisible();

    // Verify both players start with 7 cards in hand
    const aliceCards = pageAlice.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
    const bobCards = pageBob.locator('[data-testid="player-hand"] [data-testid="playing-card"]');
    expect(await aliceCards.count()).toBe(7);
    expect(await bobCards.count()).toBe(7);

    // Verify 168 physical cards conservation via server invariant endpoint
    const verifyInitRes = await fetch(`http://localhost:4000/api/test/verify-no-mercy-invariants/${roomCode}`, {
      headers: getTestHelperHeaders(),
    });
    expect(verifyInitRes.ok).toBe(true);
    const verifyInitData = await verifyInitRes.json();
    expect(verifyInitData.valid).toBe(true);
    expect(verifyInitData.totalCards).toBe(168);

    // -------------------------------------------------------------
    // Step 5: Stacking Resolution over WebSocket & Invariants
    // -------------------------------------------------------------
    // Determine initial active player and targeted opponent
    const isAliceTurn = await pageAlice.locator('text=YOUR TURN').isVisible();
    const player1 = isAliceTurn ? pageAlice : pageBob;
    const player2 = isAliceTurn ? pageBob : pageAlice;
    const p1Username = isAliceTurn ? 'AliceMercy' : 'BobMercy';
    const p2Username = isAliceTurn ? 'BobMercy' : 'AliceMercy';

    // Inject a Draw Two into player 1's hand
    const injectD2Res = await fetch('http://localhost:4000/api/test/inject-no-mercy-card', {
      method: 'POST',
      headers: getTestHelperHeaders(),
      body: JSON.stringify({ roomCode, targetUsername: p1Username, cardValue: 'draw_two' }),
    });
    expect(injectD2Res.ok).toBe(true);

    // Player 1 plays Draw Two targeting Player 2
    const d2Card = player1.locator('[data-testid="player-hand"] [data-card-value="draw_two"]').first();
    await expect(d2Card).toBeVisible({ timeout: 5000 });
    await expect(d2Card).toHaveAttribute('data-is-playable', 'true', { timeout: 5000 });
    await d2Card.click();

    // Player 2 sees the Stack Penalty banner (+2 CARDS)
    const penaltyBanner = player2.locator('[data-testid="accept-stack-penalty-btn"]');
    await expect(penaltyBanner).toBeVisible({ timeout: 10000 });

    // Player 2 accepts penalty (+2 cards, forfeits turn per Mattel HWV18)
    const p2HandBefore = await player2.locator('[data-testid="player-hand"] [data-testid="playing-card"]').count();
    await penaltyBanner.click();

    // Banner disappears, and Player 2 draws 2 cards
    await expect(penaltyBanner).not.toBeVisible({ timeout: 5000 });
    const p2HandAfter = await player2.locator('[data-testid="player-hand"] [data-testid="playing-card"]').count();
    expect(p2HandAfter).toBe(p2HandBefore + 2);

    // Verify 168 physical cards conservation
    const verifyStackRes = await fetch(`http://localhost:4000/api/test/verify-no-mercy-invariants/${roomCode}`, {
      headers: getTestHelperHeaders(),
    });
    expect(verifyStackRes.ok).toBe(true);
    const verifyStackData = await verifyStackRes.json();
    expect(verifyStackData.valid).toBe(true);
    expect(verifyStackData.totalCards).toBe(168);

    // -------------------------------------------------------------
    // Step 6: 7's Mandatory Hand Swap
    // -------------------------------------------------------------
    // Turn returns to Player 1 after Player 2's penalty forfeit
    await expect(player1.locator('text=YOUR TURN')).toBeVisible({ timeout: 10000 });

    // Inject a 7 into Player 1's hand
    const inject7Res = await fetch('http://localhost:4000/api/test/inject-no-mercy-card', {
      method: 'POST',
      headers: getTestHelperHeaders(),
      body: JSON.stringify({ roomCode, targetUsername: p1Username, cardValue: '7' }),
    });
    expect(inject7Res.ok).toBe(true);

    const sevenCard = player1.locator('[data-testid="player-hand"] [data-card-value="7"]').first();
    await expect(sevenCard).toBeVisible({ timeout: 10000 });
    await expect(sevenCard).toHaveAttribute('data-is-playable', 'true', { timeout: 10000 });
    await sevenCard.click();

    // 7's Hand Swap Modal appears for Player 1
    await expect(player1.locator('text=7 Played — Swap Hands!')).toBeVisible({ timeout: 10000 });

    // Player 1 clicks Player 2 to swap hands
    const swapBtn = player1.locator('[data-testid^="swap-target-"]').first();
    await expect(swapBtn).toBeVisible();
    await swapBtn.click();

    // Modal closes
    await expect(player1.locator('text=7 Played — Swap Hands!')).not.toBeVisible({ timeout: 5000 });

    // Verify 168 physical cards conservation
    const verifySwapRes = await fetch(`http://localhost:4000/api/test/verify-no-mercy-invariants/${roomCode}`, {
      headers: getTestHelperHeaders(),
    });
    expect(verifySwapRes.ok).toBe(true);
    const verifySwapData = await verifySwapRes.json();
    expect(verifySwapData.valid).toBe(true);
    expect(verifySwapData.totalCards).toBe(168);

    // -------------------------------------------------------------
    // Step 7: Mercy Rule Elimination (Hand >= 25 Cards)
    // -------------------------------------------------------------
    // Turn passes to Player 2 after Player 1's turn
    await expect(player2.locator('text=YOUR TURN')).toBeVisible({ timeout: 10000 });

    // Set Player 1's hand size to 24 cards
    const setHandRes = await fetch('http://localhost:4000/api/test/set-no-mercy-hand-size', {
      method: 'POST',
      headers: getTestHelperHeaders(),
      body: JSON.stringify({ roomCode, targetUsername: p1Username, targetCount: 24 }),
    });
    expect(setHandRes.ok).toBe(true);

    // Player 2 plays Draw Two targeting Player 1 (24 + 2 = 26 >= 25 -> elimination!)
    const injectP2D2 = await fetch('http://localhost:4000/api/test/inject-no-mercy-card', {
      method: 'POST',
      headers: getTestHelperHeaders(),
      body: JSON.stringify({ roomCode, targetUsername: p2Username, cardValue: 'draw_two' }),
    });
    expect(injectP2D2.ok).toBe(true);

    const p2D2 = player2.locator('[data-testid="player-hand"] [data-card-value="draw_two"]').first();
    await expect(p2D2).toBeVisible({ timeout: 10000 });
    await expect(p2D2).toHaveAttribute('data-is-playable', 'true', { timeout: 10000 });
    await p2D2.click();

    // Player 1 sees stack attack banner and accepts penalty
    const p1Accept = player1.locator('[data-testid="accept-stack-penalty-btn"]');
    await expect(p1Accept).toBeVisible({ timeout: 10000 });
    await p1Accept.click();

    // Player 1's screen displays Mercy Rule elimination banner!
    await expect(player1.locator('[data-testid="eliminated-player-banner"]')).toBeVisible({ timeout: 10000 });

    // Player 2's screen displays Player 1's ELIMINATED status badge in their seat
    await expect(player2.locator('[data-testid="player-seat"][data-is-eliminated="true"]')).toBeVisible({ timeout: 10000 });

    // -------------------------------------------------------------
    // Step 8: Page reload recovery
    // -------------------------------------------------------------
    await player2.reload();
    await expect(player2.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 15000 });
  });
});
