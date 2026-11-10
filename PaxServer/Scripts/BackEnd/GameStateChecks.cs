using System.Text.Json;

// the rules a game state's fields must obey, and the one place a broken rule is reported
public static class GameStateChecks
{
    public const int ActorTagLength = 3;
    const int ColourLength = 7;                                   // "#rrggbb"
    const char ColourPrefix = '#';

    // throws JsonException when the rule is broken: that is how a [JsonConstructor] makes the
    // deserializer refuse a bad document (LoadError: the document cannot be run)
    public static void Require(bool ruleHolds, string problem)
    {
        if (!ruleHolds) throw new JsonException(problem);
    }

    public static bool IsNonEmpty(string text)
    {
        return !string.IsNullOrWhiteSpace(text);
    }

    // the format only ("fra"): that the nation exists is checked by GameState
    public static bool IsActorTag(string text)
    {
        return text.Length == ActorTagLength && text.All(char.IsAsciiLetterLower);
    }

    // "#b426cf". Stricter than the page, which accepts any colour the browser can draw (names included)
    public static bool IsColour(string text)
    {
        bool hasPrefix = text.Length == ColourLength && text[0] == ColourPrefix;
        return hasPrefix && text.Skip(1).All(char.IsAsciiHexDigit);
    }

    public static bool IsNotNegative(int figure)
    {
        return figure >= 0;
    }

    // a figure that is not finite cannot be written back as JSON
    public static bool IsFiniteFigure(double figure)
    {
        return double.IsFinite(figure);
    }
}
