// the calls the page makes to the server's game endpoint. what comes back is checked by validateFiles, not here
const gamesUrl = "api/game";
const notFoundStatus = 404;

export async function createGame(): Promise<string> {
  const response: Response = await fetch(gamesUrl, { method: "POST" });
  if (!response.ok) throw new Error(`${gamesUrl}: ${response.status}`);
  const token: unknown = await response.json();
  if (typeof token !== "string") throw new Error(`${gamesUrl}: the token sent back is not a string`);
  return token;
}

// null if the game has expired
export async function fetchGameState(token: string): Promise<unknown> {
  const gameUrl = `${gamesUrl}/${token}`;
  const response: Response = await fetch(gameUrl);
  const gameHasExpired = response.status === notFoundStatus;
  if (gameHasExpired) return null;
  if (!response.ok) throw new Error(`${gameUrl}: ${response.status}`);
  return response.json();
}

// false if the game has expired
export async function runTick(token: string): Promise<boolean> {
  const tickUrl = `${gamesUrl}/${token}/tick`;
  const response: Response = await fetch(tickUrl, { method: "POST" });
  const gameHasExpired = response.status === notFoundStatus;
  if (gameHasExpired) return false;
  if (!response.ok) throw new Error(`${tickUrl}: ${response.status}`);
  return true;
}
