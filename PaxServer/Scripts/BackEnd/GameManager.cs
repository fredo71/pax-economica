using Microsoft.Extensions.Caching.Memory;

public class GameManager
{
    static readonly TimeSpan IdleLifetime = TimeSpan.FromMinutes(30);
    readonly MemoryCache games = new(new MemoryCacheOptions());

    public Guid CreateGame()
    {
        Guid token = Guid.NewGuid();
        Game game = new() { State = GameStateBuilder.Build() };
        MemoryCacheEntryOptions expiry = new() { SlidingExpiration = IdleLifetime };
        games.Set(token, game, expiry);
        return token;
    }

    // null once the game has gone unused for IdleLifetime; every find restarts that countdown
    public Game? FindGame(Guid token)
    {
        games.TryGetValue(token, out Game? game);
        return game;
    }

    // reading needs no lock: a tick builds a whole new state and swaps it in with one assignment
    public void RunTick(Game game)
    {
        lock (game.TickLock)
        {
            game.State = RunGame.RunTick(game.State);
        }
    }
}

public class Game
{
    public required GameState State;
    public readonly Lock TickLock = new();        // one tick at a time: two at once would both start from the same state, and one would be lost
}
