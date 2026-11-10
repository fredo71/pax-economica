public static class RunGame
{
    public static GameState RunTick(GameState prevGameState)
    {
        GameState nextGameState = prevGameState.Copy();
        List<Value> valuesToFill = nextGameState.GetValues();
        foreach (Value value in valuesToFill)
        {
            value.CalculatedValue = CalculateValue(prevGameState, value);
        }
        nextGameState.AdvanceTurn();
        return nextGameState;
    }

    // reads only prevGameState, so the order values are filled in never matters (§1)
    public static double CalculateValue(GameState prevGameState, Value value)
    {
        return FormulaReader.Evaluate(prevGameState, value);
    }
}
