public class GameManager
{

    GameState gameState;
    readonly Lock tickLock = new();               // one tick at a time: two at once would both start from the same state, and one would be lost

    public GameManager()
    {
        gameState = GameStateBuilder.Build();
    }

    public GameState GetGameState()
    {
        return gameState;
    }
    
    // reading needs no lock: a tick builds a whole new state and swaps it in with one assignment
    public void RunTick()
    {
        lock (tickLock)
        {
            gameState = RunGame.RunTick(gameState);
        }
    }
}