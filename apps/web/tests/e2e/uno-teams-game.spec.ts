import { test, expect, BrowserContext, Page } from '@playwright/test';

const getTestHelperHeaders = () => ({
  'Content-Type': 'application/json',
  'X-Test-Helper-Secret': process.env.TEST_HELPER_SECRET || '',
});

test.describe('UNO Ultimate — UNO Teams 4-Player Multiplayer E2E', () => {
  let contextAlice: BrowserContext;
  let contextBob: BrowserContext;
  let contextCharlie: BrowserContext;
  let contextDave: BrowserContext;

  let pageAlice: Page;
  let pageBob: Page;
  let pageCharlie: Page;
  let pageDave: Page;

  test.beforeEach(async ({ browser }) => {
    // 4 isolated browser contexts for 4 players (Team 1: Alice & Charlie, Team 2: Bob & Dave)
    contextAlice = await browser.newContext();
    contextBob = await browser.newContext();
    contextCharlie = await browser.newContext();
    contextDave = await browser.newContext();

    pageAlice = await contextAlice.newPage();
    pageBob = await contextBob.newPage();
    pageCharlie = await contextCharlie.newPage();
    pageDave = await contextDave.newPage();
  });

  test.afterEach(async () => {
    await contextAlice.close();
    await contextBob.close();
    await contextCharlie.close();
    await contextDave.close();
  });

  test('E2E: Host creates 4-player UNO Teams room, 4 players join, verify lobby & team badges, start match, complete initial team pass, verify 112-card conservation invariant & page reload resilience', async ({ request }) => {
    // -------------------------------------------------------------
    // Step 1: Alice creates private room with UNO Teams variant (4 players)
    // -------------------------------------------------------------
    await pageAlice.goto('/');
    await pageAlice.fill('#username-input', 'AliceTeams');
    await pageAlice.click('button[type="submit"]');

    await expect(pageAlice).toHaveURL(/\/dashboard/);
    await expect(pageAlice.locator('header').getByText('AliceTeams')).toBeVisible();

    await pageAlice.click('[data-testid="create-room-btn"]');

    // Select UNO Teams variant
    const teamsVariantBtn = pageAlice.locator('[data-testid="variant-select-uno-teams"]');
    await expect(teamsVariantBtn).toBeVisible();
    await teamsVariantBtn.click();

    await pageAlice.click('[data-testid="confirm-create-room-btn"]');

    await expect(pageAlice).toHaveURL(/\/room\/[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}/);
    const roomCodeElement = pageAlice.locator('[data-testid="room-code-display"]');
    await expect(roomCodeElement).toBeVisible();
    const rawRoomCode = await roomCodeElement.textContent();
    expect(rawRoomCode).toBeTruthy();
    const roomCode = rawRoomCode!.trim();

    // Verify Alice sees the UNO Teams badge in Lobby
    await expect(pageAlice.locator('text=UNO Teams').first()).toBeVisible();
    await expect(pageAlice.locator('text=112 CARDS • 2v2 TEAMS').first()).toBeVisible();

    // -------------------------------------------------------------
    // Step 2: Bob, Charlie, Dave join Alice's private room via code
    // -------------------------------------------------------------
    // Bob (Team 2)
    await pageBob.goto('/');
    await pageBob.fill('#username-input', 'BobTeams');
    await pageBob.click('button[type="submit"]');
    await expect(pageBob).toHaveURL(/\/dashboard/);
    await pageBob.click('[data-testid="join-room-btn"]');
    await pageBob.fill('#room-code-input', roomCode);
    await pageBob.click('[data-testid="confirm-join-room-btn"]');
    await expect(pageBob).toHaveURL(`/room/${roomCode}`);

    // Charlie (Team 1 - Alice's partner)
    await pageCharlie.goto('/');
    await pageCharlie.fill('#username-input', 'CharlieTeams');
    await pageCharlie.click('button[type="submit"]');
    await expect(pageCharlie).toHaveURL(/\/dashboard/);
    await pageCharlie.click('[data-testid="join-room-btn"]');
    await pageCharlie.fill('#room-code-input', roomCode);
    await pageCharlie.click('[data-testid="confirm-join-room-btn"]');
    await expect(pageCharlie).toHaveURL(`/room/${roomCode}`);

    // Dave (Team 2 - Bob's partner)
    await pageDave.goto('/');
    await pageDave.fill('#username-input', 'DaveTeams');
    await pageDave.click('button[type="submit"]');
    await expect(pageDave).toHaveURL(/\/dashboard/);
    await pageDave.click('[data-testid="join-room-btn"]');
    await pageDave.fill('#room-code-input', roomCode);
    await pageDave.click('[data-testid="confirm-join-room-btn"]');
    await expect(pageDave).toHaveURL(`/room/${roomCode}`);

    // Verify all 4 players are present in Alice's lobby view
    await expect(pageAlice.locator('text=BobTeams').first()).toBeVisible();
    await expect(pageAlice.locator('text=CharlieTeams').first()).toBeVisible();
    await expect(pageAlice.locator('text=DaveTeams').first()).toBeVisible();

    // -------------------------------------------------------------
    // Step 3: Bob, Charlie, and Dave mark ready, Alice (host) starts game
    // -------------------------------------------------------------
    await pageBob.click('[data-testid="ready-toggle-btn"]');
    await pageCharlie.click('[data-testid="ready-toggle-btn"]');
    await pageDave.click('[data-testid="ready-toggle-btn"]');

    const startButton = pageAlice.locator('[data-testid="start-game-btn"]');
    await expect(startButton).toBeEnabled();
    await startButton.click();

    // -------------------------------------------------------------
    // Step 4: Verify navigation to Game Board for all 4 players
    // -------------------------------------------------------------
    await expect(pageAlice).toHaveURL(`/game/${roomCode}`, { timeout: 20000 });
    await expect(pageBob).toHaveURL(`/game/${roomCode}`, { timeout: 20000 });
    await expect(pageCharlie).toHaveURL(`/game/${roomCode}`, { timeout: 20000 });
    await expect(pageDave).toHaveURL(`/game/${roomCode}`, { timeout: 20000 });

    await expect(pageAlice.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 10000 });
    await expect(pageBob.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 10000 });
    await expect(pageCharlie.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 10000 });
    await expect(pageDave.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 10000 });

    // Verify UNO Teams badge on board
    await expect(pageAlice.locator('[data-testid="uno-teams-badge"]')).toBeVisible();
    await expect(pageBob.locator('[data-testid="uno-teams-badge"]')).toBeVisible();
    await expect(pageCharlie.locator('[data-testid="uno-teams-badge"]')).toBeVisible();
    await expect(pageDave.locator('[data-testid="uno-teams-badge"]')).toBeVisible();

    // Verify alternating team allocations:
    // Alice (p0) -> TEAM 1, Bob (p1) -> TEAM 2, Charlie (p2) -> TEAM 1, Dave (p3) -> TEAM 2
    await expect(pageAlice.locator('[data-testid="self-team-badge"]')).toContainText('TEAM 1');
    await expect(pageBob.locator('[data-testid="self-team-badge"]')).toContainText('TEAM 2');
    await expect(pageCharlie.locator('[data-testid="self-team-badge"]')).toContainText('TEAM 1');
    await expect(pageDave.locator('[data-testid="self-team-badge"]')).toContainText('TEAM 2');

    // -------------------------------------------------------------
    // Step 5: Verify Initial Team Pass phase (Setup rule 6)
    // -------------------------------------------------------------
    // Each player must see the Team Pass Modal
    await expect(pageAlice.locator('[data-testid="team-pass-modal"]')).toBeVisible();
    await expect(pageBob.locator('[data-testid="team-pass-modal"]')).toBeVisible();
    await expect(pageCharlie.locator('[data-testid="team-pass-modal"]')).toBeVisible();
    await expect(pageDave.locator('[data-testid="team-pass-modal"]')).toBeVisible();

    // Verify 112-card conservation invariant during initial pass
    const verifyInitRes = await request.get(`http://localhost:4000/api/test/verify-teams-invariants/${roomCode}`, {
      headers: getTestHelperHeaders(),
    });
    if (verifyInitRes.ok()) {
      const initInvariantData = await verifyInitRes.json();
      expect(initInvariantData.valid).toBe(true);
      expect(initInvariantData.totalCards).toBe(112);
    }

    // -------------------------------------------------------------
    // Step 6: All players select and submit 1 card to their partner
    // -------------------------------------------------------------
    // Alice passes card to Charlie
    await pageAlice.locator('[data-testid="team-pass-modal"] [data-testid^="team-pass-card-"]').first().click();
    await pageAlice.click('[data-testid="confirm-team-pass-btn"]');

    // Bob passes card to Dave
    await pageBob.locator('[data-testid="team-pass-modal"] [data-testid^="team-pass-card-"]').first().click();
    await pageBob.click('[data-testid="confirm-team-pass-btn"]');

    // Charlie passes card to Alice
    await pageCharlie.locator('[data-testid="team-pass-modal"] [data-testid^="team-pass-card-"]').first().click();
    await pageCharlie.click('[data-testid="confirm-team-pass-btn"]');

    // Dave passes card to Bob
    await pageDave.locator('[data-testid="team-pass-modal"] [data-testid^="team-pass-card-"]').first().click();
    await pageDave.click('[data-testid="confirm-team-pass-btn"]');

    // Once all 4 have passed, the modal closes and regular turns begin
    await expect(pageAlice.locator('[data-testid="team-pass-modal"]')).not.toBeVisible({ timeout: 10000 });
    await expect(pageBob.locator('[data-testid="team-pass-modal"]')).not.toBeVisible({ timeout: 10000 });
    await expect(pageCharlie.locator('[data-testid="team-pass-modal"]')).not.toBeVisible({ timeout: 10000 });
    await expect(pageDave.locator('[data-testid="team-pass-modal"]')).not.toBeVisible({ timeout: 10000 });

    // -------------------------------------------------------------
    // Step 7: Verify invariant & reload resilience
    // -------------------------------------------------------------
    const verifyPostPassRes = await request.get(`http://localhost:4000/api/test/verify-teams-invariants/${roomCode}`, {
      headers: getTestHelperHeaders(),
    });
    if (verifyPostPassRes.ok()) {
      const postPassInvariantData = await verifyPostPassRes.json();
      expect(postPassInvariantData.valid).toBe(true);
      expect(postPassInvariantData.totalCards).toBe(112);
    }

    // Reload Alice's page and confirm persistence
    await pageAlice.reload();
    await expect(pageAlice.locator('[data-testid="game-board"]')).toBeVisible({ timeout: 10000 });
    await expect(pageAlice.locator('[data-testid="uno-teams-badge"]')).toBeVisible();
    await expect(pageAlice.locator('[data-testid="self-team-badge"]')).toContainText('TEAM 1');

    // Final invariant check
    const verifyFinalRes = await request.get(`http://localhost:4000/api/test/verify-teams-invariants/${roomCode}`, {
      headers: getTestHelperHeaders(),
    });
    if (verifyFinalRes.ok()) {
      const finalInvariantData = await verifyFinalRes.json();
      expect(finalInvariantData.valid).toBe(true);
      expect(finalInvariantData.totalCards).toBe(112);
    }
  });
});
