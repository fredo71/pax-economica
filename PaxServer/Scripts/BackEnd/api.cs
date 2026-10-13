public static class Api
{
    public static void AddApi( WebApplication app)
    {
        app.MapGet("/api/game", GetGameState);
        app.MapPost("/api/game", RunTick);
    }

    public static GameState GetGameState(GameManager gameManager)
    {
        return gameManager.GetGameState();
    }

    public static void RunTick(GameManager gameManager)
    {
        GameState gameState = gameManager.GetGameState();
        GameState newGameState = RunGame.RunTick(gameState);
        gameManager.SetGameState(newGameState);

    }
    

}