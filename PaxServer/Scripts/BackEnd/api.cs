public static class Api
{
    public static void AddApi( WebApplication app)
    {
        app.MapPost("/api/game", CreateGame);
        app.MapGet("/api/game/{token:guid}", GetGameState);
        app.MapPost("/api/game/{token:guid}/tick", RunTick);
    }

    public static Guid CreateGame(GameManager gameManager)
    {
        return gameManager.CreateGame();
    }

    public static IResult GetGameState(Guid token, GameManager gameManager)
    {
        Game? game = gameManager.FindGame(token);
        if (game == null) return Results.NotFound();
        return Results.Ok(game.State);
    }

    public static IResult RunTick(Guid token, GameManager gameManager)
    {
        Game? game = gameManager.FindGame(token);
        if (game == null) return Results.NotFound();
        gameManager.RunTick(game);
        return Results.Ok();
    }
}
