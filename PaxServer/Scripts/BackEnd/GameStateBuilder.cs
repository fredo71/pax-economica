using System.Text.Json;

public static class GameStateBuilder
{
    // relative to the folder the server runs from (the project folder under dotnet run)
    const string SampleGameStatePath = "wwwroot/europe.json";
    const string MapFilePath = "wwwroot/provinces.geojson";

    // throws if a file is missing or not valid JSON, or the provinces do not match the map: the server has nothing to serve without it
    public static GameState Build()
    {
        string gameStateJson = File.ReadAllText(SampleGameStatePath);
        GameState? gameState = JsonSerializer.Deserialize<GameState>(gameStateJson, GameState.WebNames);
        if (gameState == null) throw new InvalidDataException($"{SampleGameStatePath} holds null, not a game state");
        ConfirmOutlinesMatch(gameState);
        return gameState;
    }

    // throws naming the first province without an outline, or the first outline without a province
    static void ConfirmOutlinesMatch(GameState gameState)
    {
        HashSet<string> outlineIds = ReadOutlineIds(MapFilePath);

        foreach (string provinceId in gameState.Provinces.Keys)
        {
            if (!outlineIds.Contains(provinceId)) throw new InvalidDataException($"province {provinceId} of {SampleGameStatePath} has no outline in {MapFilePath}");
        }

        foreach (string outlineId in outlineIds)
        {
            if (!gameState.Provinces.ContainsKey(outlineId)) throw new InvalidDataException($"outline {outlineId} of {MapFilePath} has no province in {SampleGameStatePath}");
        }
    }

    static HashSet<string> ReadOutlineIds(string mapFilePath)
    {
        using JsonDocument map = JsonDocument.Parse(File.ReadAllText(mapFilePath));
        HashSet<string> outlineIds = [];
        foreach (JsonElement feature in map.RootElement.GetProperty("features").EnumerateArray())
        {
            string outlineId = feature.GetProperty("properties").GetProperty("id").GetString()!;
            outlineIds.Add(outlineId);
        }
        return outlineIds;
    }

}
