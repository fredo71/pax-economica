using System.Text.Json;
using System.Text.Json.Serialization;
using static GameStateChecks;

// the game document, read from wwwroot/europe.json and sent to the page as it is by GET /api/game.
// every constructor is what the deserializer calls: its parameter names are the property names, and each
// property's JSON key is its own name unless [JsonPropertyName] says otherwise
public class GameState
{
    public int Turn { get; private set; }
    [JsonPropertyName("Actor")]
    public Dictionary<string, Actor> Actors { get; }                        // keyed by actor tag
    public Dictionary<string, Province> Provinces { get; }                  // keyed by province id
    public World World { get; }

    [JsonConstructor]
    public GameState(int turn, Dictionary<string, Actor> actors, Dictionary<string, Province> provinces, World world)
    {
        Require(IsNotNegative(turn), $"turn cannot be negative, not {turn}");
        Turn = turn;
        Actors = actors;
        Provinces = provinces;
        World = world;
        CheckActorTags();
        CheckProvinceOwners();
        AssignPaths();
    }

    // the first part of every path, as a formula writes it ("world.technology.tech")
    const string ActorsPathRoot = "actors";
    const string ProvincesPathRoot = "provinces";
    const string WorldPathRoot = "world";

    // a value is built before its holder, so only the game state, which sees the whole tree, can tell it where it sits
    void AssignPaths()
    {
        foreach ((string actorTag, Actor actor) in Actors)
        {
            AssignPaths($"{ActorsPathRoot}.{actorTag}", actor.Institutions);
        }

        foreach ((string provinceId, Province province) in Provinces)
        {
            AssignPaths($"{ProvincesPathRoot}.{provinceId}", province.Institutions);
        }

        AssignPaths(WorldPathRoot, World.Institutions);
    }

    static void AssignPaths(string holderPath, Dictionary<string, Institution> institutions)
    {
        foreach ((string institutionName, Institution institution) in institutions)
        {
            foreach ((string valueName, Value value) in institution.Values)
            {
                value.Path = $"{holderPath}.{institutionName}.{valueName}";
            }
        }
    }

    // "provinces.ad_06.institution_economy_province.gdp". null when any step is missing
    public Value? FindValue(string path)
    {
        string[] steps = path.Split('.');
        if (steps.Length < 2) return null;
        string root = steps[0];

        switch (root)
        {
            case WorldPathRoot:
                return World.FindValue(steps[1..]);
            case ActorsPathRoot:
                Actor? actor = Actors.GetValueOrDefault(steps[1]);
                return actor?.FindValue(steps[2..]);
            case ProvincesPathRoot:
                Province? province = Provinces.GetValueOrDefault(steps[1]);
                return province?.FindValue(steps[2..]);
            default:
                return null;
        }
    }

    void CheckActorTags()
    {
        foreach (string actorTag in Actors.Keys)
        {
            Require(IsActorTag(actorTag), $"actor tag must be {ActorTagLength} lowercase letters, not \"{actorTag}\"");
        }
    }

    void CheckProvinceOwners()
    {
        foreach ((string provinceId, Province province) in Provinces)
        {
            bool ownerExists = Actors.ContainsKey(province.Owner);
            Require(ownerExists, $"province {provinceId} is owned by {province.Owner}, which is not an actor");
        }
    }

    // camelCase names, matched without regard to case: the same settings ASP.NET uses to send it to the page
    public static readonly JsonSerializerOptions WebNames = new(JsonSerializerDefaults.Web);

    // nothing is shared with the original; the copy goes through every constructor check again
    public GameState Copy()
    {
        string gameStateJson = JsonSerializer.Serialize(this, WebNames);
        return JsonSerializer.Deserialize<GameState>(gameStateJson, WebNames)!;
    }

    public void AdvanceTurn()
    {
        Turn++;
    }

    // every value of every actor, then of every province, then of the world, each in order of its key so the order never varies
    public List<Value> GetValues()
    {
        List<Value> values = [];

        foreach (string actorTag in Actors.Keys.Order(StringComparer.Ordinal))
        {
            AddValues(Actors[actorTag].Institutions, values);
        }

        foreach (string provinceId in Provinces.Keys.Order(StringComparer.Ordinal))
        {
            AddValues(Provinces[provinceId].Institutions, values);
        }

        AddValues(World.Institutions, values);
        return values;
    }

    static void AddValues(Dictionary<string, Institution> institutions, List<Value> values)
    {
        foreach (string institutionName in institutions.Keys.Order(StringComparer.Ordinal))
        {
            Dictionary<string, Value> institutionValues = institutions[institutionName].Values;
            foreach (string valueName in institutionValues.Keys.Order(StringComparer.Ordinal))
            {
                values.Add(institutionValues[valueName]);
            }
        }
    }
}

public class Actor
{
    public string Name { get; }
    public string Colour { get; }
    [JsonPropertyName("Institution")]
    public Dictionary<string, Institution> Institutions { get; }           // keyed by institution name

    [JsonConstructor]
    public Actor(string name, string colour, Dictionary<string, Institution>? institutions = null)
    {
        Require(IsNonEmpty(name), "an actor has no name");
        Require(IsColour(colour), $"colour of actor {name} must look like #b426cf, not \"{colour}\"");
        Name = name;
        Colour = colour;
        Institutions = institutions ?? [];
    }

    // steps start at an institution name ("institution_economy_province.gdp"). null when any step is missing
    public Value? FindValue(string[] steps)
    {
        if (steps.Length == 0) return null;
        Institution? institution = Institutions.GetValueOrDefault(steps[0]);
        return institution?.FindValue(steps[1..]);
    }
}

public class Province
{
    public string Name { get; }
    public string Owner { get; }                                            // a key into Actors
    [JsonPropertyName("Institution")]
    public Dictionary<string, Institution> Institutions { get; }           // keyed by institution name

    [JsonConstructor]
    public Province(string name, string owner, Dictionary<string, Institution>? institutions = null)
    {
        Require(IsNonEmpty(name), "a province has no name");
        Require(IsActorTag(owner), $"owner of province {name} must be {ActorTagLength} lowercase letters, not \"{owner}\"");
        Name = name;
        Owner = owner;
        Institutions = institutions ?? [];
    }

    // steps start at an institution name ("institution_economy_province.gdp"). null when any step is missing
    public Value? FindValue(string[] steps)
    {
        if (steps.Length == 0) return null;
        Institution? institution = Institutions.GetValueOrDefault(steps[0]);
        return institution?.FindValue(steps[1..]);
    }
}

public class World
{
    [JsonPropertyName("Institution")]
    public Dictionary<string, Institution> Institutions { get; }           // keyed by institution name

    [JsonConstructor]
    public World(Dictionary<string, Institution>? institutions = null)
    {
        Institutions = institutions ?? [];
    }

    // steps start at an institution name ("technology.tech"). null when any step is missing
    public Value? FindValue(string[] steps)
    {
        if (steps.Length == 0) return null;
        Institution? institution = Institutions.GetValueOrDefault(steps[0]);
        return institution?.FindValue(steps[1..]);
    }
}

public class Institution
{
    public string DisplayName { get; }                                      // "Economy"
    public Dictionary<string, Value> Values { get; }                        // keyed by value name ("gdp")

    [JsonConstructor]
    public Institution(string displayName, Dictionary<string, Value> values)
    {
        Require(IsNonEmpty(displayName), "an institution has no display name");
        DisplayName = displayName;
        Values = values;
    }

    // the one remaining step is a value name ("gdp"). null when it is missing or more steps follow
    public Value? FindValue(string[] steps)
    {
        bool isOneStep = steps.Length == 1;
        return isOneStep ? Values.GetValueOrDefault(steps[0]) : null;
    }
}

public class Value
{
    public string DisplayName { get; }                                      // "GDP"
    public string Type { get; }                                             // "float"
    public string Formula { get; }                                          // evaluated every tick: "0.5", "prev.base + growth*prev.base"
    [JsonPropertyName("calculated_value")]
    public double CalculatedValue
    {
        get;
        internal set
        {
            Require(IsFiniteFigure(value), $"calculated value of {DisplayName} must be a finite number");
            field = value;
        }
    }
    public string Unit { get; }                                             // " M$"
    public string Description { get; }
    [JsonIgnore]
    public string Path { get; internal set; } = "";                         // "provinces.ad_06.institution_economy_province.gdp", set by GameState

    [JsonConstructor]
    public Value(string displayName, string type, string formula, double calculatedValue, string unit = "", string description = "")
    {
        Require(IsNonEmpty(displayName), "a value has no display name");
        Require(IsNonEmpty(type), $"value {displayName} has no type");
        Require(IsNonEmpty(formula), $"value {displayName} has no formula");
        DisplayName = displayName;
        Type = type;
        Formula = formula;
        CalculatedValue = calculatedValue;
        Unit = unit;
        Description = description;
    }
}
