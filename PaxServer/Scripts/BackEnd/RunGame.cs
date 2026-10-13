public static class RunGame
{
    public static GameState RunTick(GameState prevGameState)
    {
        GameState nextGameState = prevGameState.Copy();
        List<Value> valuesToFill = nextGameState.GetValues();
        return nextGameState;

    }

    public static void CalculateValue(GameState prevGameState, Value value)
    {

    }
    
}