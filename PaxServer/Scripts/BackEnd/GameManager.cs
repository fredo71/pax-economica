public class GameManager
{

    GameState gameState;
    public GameManager()
    {
        gameState = GameStateBuilder.Build();
    }

    public GameState GetGameState()
    {
        return gameState;
    }
    
    public void SetGameState(GameState gameState)
    {
        this.gameState = gameState;
    }
}