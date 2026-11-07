// the calls the page makes to the server's game endpoint. what comes back is checked by validateFiles, not here
const gameStateUrl = "api/game";

export async function fetchGameState(): Promise<unknown> {
  const response = await fetch(gameStateUrl);
  if (!response.ok) throw new Error(`${gameStateUrl}: ${response.status}`);
  return response.json();
}
