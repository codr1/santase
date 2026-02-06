// Playwright runs in Node, not Bun; guard so `bun test` doesn't load Playwright.
const isBun = typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";

if (!isBun) {
  const { expect, test } = await import("@playwright/test");
  const baseUrl = "http://localhost:3001";

  const createRoom = async (page: any): Promise<string> => {
    await page.goto(baseUrl);
    await page.getByRole("button", { name: "Create Room" }).click();
    await expect(page).toHaveURL(/\/rooms\/[A-Z0-9]+\/lobby$/);

    const pathname = new URL(page.url()).pathname;
    const pathMatch = pathname.match(/^\/rooms\/([A-Z0-9]+)\/lobby$/);
    expect(pathMatch).not.toBeNull();
    return pathMatch ? pathMatch[1] : "";
  };

  const joinRoom = async (page: any, roomCode: string): Promise<void> => {
    await page.goto(`${baseUrl}/join`);
    await page.getByLabel(/Room Code/i).fill(roomCode);
    await page.getByRole("button", { name: "Join Room" }).click();
    await expect(page).toHaveURL(new RegExp(`/rooms/${roomCode}$`));
  };

  const waitForBothPlayersOnGamePage = async (
    hostPage: any,
    guestPage: any,
    roomCode: string,
  ): Promise<void> => {
    await Promise.all([
      hostPage.waitForURL(new RegExp(`/rooms/${roomCode}/game$`)),
      guestPage.waitForURL(new RegExp(`/rooms/${roomCode}/game$`)),
      joinRoom(guestPage, roomCode),
    ]);
  };

  const extractInitialState = async (page: any): Promise<any> => {
    const html = await page.content();
    const match = html.match(
      /const initialState = (\{[\s\S]*?\});\s*const initialMatchOver =/,
    );
    expect(match).not.toBeNull();
    return JSON.parse(match ? match[1] : "{}");
  };

  const getViewerIndex = (viewerState: any): 0 | 1 => {
    const playerHands = viewerState?.game?.playerHands;
    if (Array.isArray(playerHands?.[0])) {
      return 0;
    }
    return 1;
  };

  const dispatchGameState = async (page: any, state: any): Promise<void> => {
    await page.evaluate((payload: unknown) => {
      document.body.dispatchEvent(
        new CustomEvent("htmx:sseMessage", {
          detail: {
            type: "game-state",
            data: JSON.stringify(payload),
          },
        }),
      );
    }, state);
  };

  test("shows match-over overlay on game page for normal match end and return-home works", async ({
    browser,
  }: {
    browser: any;
  }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();

    try {
      const hostPage = await hostContext.newPage();
      const roomCode = await createRoom(hostPage);
      const guestPage = await guestContext.newPage();
      await waitForBothPlayersOnGamePage(hostPage, guestPage, roomCode);

      const initialState = await extractInitialState(hostPage);
      const viewerIndex = getViewerIndex(initialState);
      const opponentIndex = viewerIndex === 0 ? 1 : 0;
      const matchScores: [number, number] = [0, 0];
      matchScores[viewerIndex] = 11;
      matchScores[opponentIndex] = 8;

      const roundScores: [number, number] = [12, 18];
      roundScores[viewerIndex] = 72;
      roundScores[opponentIndex] = 33;

      const normalMatchOverState = {
        ...initialState,
        matchScores,
        game: {
          ...initialState.game,
          currentTrick: null,
          roundScores,
          roundResult: {
            winner: viewerIndex,
            gamePoints: 2,
            reason: "declared_66",
          },
        },
      };

      await dispatchGameState(hostPage, normalMatchOverState);

      const overlay = hostPage.locator("[data-match-over-overlay]");
      await expect(overlay).toBeVisible();
      await expect(hostPage.locator("[data-match-winner]")).toContainText("You won the match!");
      await expect(hostPage.locator("[data-final-score-you]")).toHaveText("11");
      await expect(hostPage.locator("[data-final-score-opponent]")).toHaveText("8");
      await expect(hostPage.locator("[data-last-round-winner]")).toContainText("You");
      await expect(hostPage.locator("[data-last-round-reason]")).toContainText("Declared 66");
      await expect(hostPage).toHaveURL(new RegExp(`/rooms/${roomCode}/game$`));

      await Promise.all([
        hostPage.waitForURL(`${baseUrl}/`),
        hostPage.locator("[data-return-home-link]").click(),
      ]);
    } finally {
      await hostContext.close();
      await guestContext.close();
    }
  });

  test("forfeit overlay messaging persists on direct /game and new match resets board", async ({
    browser,
  }: {
    browser: any;
  }) => {
    test.setTimeout(120_000);

    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    let guestPage: any = null;

    try {
      const hostPage = await hostContext.newPage();
      const roomCode = await createRoom(hostPage);
      guestPage = await guestContext.newPage();
      await waitForBothPlayersOnGamePage(hostPage, guestPage, roomCode);

      await guestPage.close();

      await expect(hostPage.locator("[data-match-winner]")).toContainText("Victory by forfeit", {
        timeout: 40_000,
      });
      await expect(hostPage.locator("[data-last-round-reason]")).toContainText("Forfeit", {
        timeout: 40_000,
      });
      await expect(hostPage.locator("[data-match-over-overlay]")).toBeVisible();

      await hostPage.goto(`${baseUrl}/rooms/${roomCode}/game`);
      await expect(hostPage).toHaveURL(new RegExp(`/rooms/${roomCode}/game$`));
      await expect(hostPage.locator("[data-match-over-overlay]")).toBeVisible();
      await expect(hostPage.locator("[data-match-winner]")).toContainText("Victory by forfeit", {
        timeout: 10_000,
      });

      const spectatorContext = await browser.newContext();
      try {
        const spectatorPage = await spectatorContext.newPage();
        await spectatorPage.goto(`${baseUrl}/rooms/${roomCode}/game`);
        await expect(spectatorPage.locator("[data-match-over-overlay]")).toBeVisible();
        await expect(spectatorPage.locator("[data-match-winner]")).toContainText("Defeat by forfeit", {
          timeout: 10_000,
        });
      } finally {
        await spectatorContext.close();
      }

      await hostPage.getByRole("button", { name: "New Match" }).click();
      await expect(hostPage.locator("[data-match-over-overlay]")).toBeHidden();
      await expect(hostPage.locator("[data-player-match-score]")).toHaveText("0");
      await expect(hostPage.locator("[data-opponent-match-score]")).toHaveText("0");
      await expect(hostPage.locator("[data-player-card]")).toHaveCount(6);
    } finally {
      if (guestPage && !guestPage.isClosed()) {
        await guestPage.close();
      }
      await guestContext.close();
      await hostContext.close();
    }
  });
}
