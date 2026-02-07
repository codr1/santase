import { expect, type Page } from "@playwright/test";

export const baseUrl = "http://localhost:3001";

export const createRoom = async (page: Page): Promise<string> => {
  await page.goto(baseUrl);
  await page.getByRole("button", { name: "Create Room" }).click();
  await expect(page).toHaveURL(/\/rooms\/[A-Z0-9]+\/lobby$/);

  const pathname = new URL(page.url()).pathname;
  const pathMatch = pathname.match(/^\/rooms\/([A-Z0-9]+)\/lobby$/);
  if (!pathMatch) {
    throw new Error(`Expected lobby URL with room code, got ${pathname}`);
  }

  return pathMatch[1];
};

export const joinRoom = async (page: Page, roomCode: string): Promise<void> => {
  await page.goto(`${baseUrl}/join`);
  await page.getByLabel(/Room Code/i).fill(roomCode);
  await page.getByRole("button", { name: "Join Room" }).click();
  await expect(page).toHaveURL(new RegExp(`/rooms/${roomCode}$`));
};
