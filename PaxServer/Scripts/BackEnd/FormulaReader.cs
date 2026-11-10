using System.Globalization;

// reads a formula left to right and calculates as it goes, from the previous game state only.
// a problem is reported where it happens, and the formula then gives the default figure
public class FormulaReader
{
    const double DefaultFigure = 0;
    const double NearZero = 1e-9;                 // DIV_EPSILON (§2, §15): left to the scenario's scale
    const double LargestFigure = 1e12;            // MAX_VALUE (§2, §15)
    const string PreviousBase = "prev.base";
    const string PreviousEffective = "prev.effective";

    readonly string formula;
    readonly GameState prevGameState;
    readonly Value value;                         // the value being calculated: where names start from
    int position;                                 // the next character to read

    FormulaReader(GameState prevGameState, Value value)
    {
        formula = value.Formula;
        this.prevGameState = prevGameState;
        this.value = value;
    }

    public static double Evaluate(GameState prevGameState, Value value)
    {
        FormulaReader reader = new(prevGameState, value);
        double? figure = reader.ReadWholeFormula();
        return figure ?? DefaultFigure;
    }

    double? ReadWholeFormula()
    {
        double? figure = ReadSum();
        if (figure == null) return null;
        SkipSpaces();
        bool reachedEnd = position == formula.Length;
        return reachedEnd ? figure : ReportProblem("unexpected text after the end");
    }

    // a + b - c ...   left to right: (a + b) - c. stops at the first problem
    double? ReadSum()
    {
        double? total = ReadProduct();
        while (total != null)
        {
            SkipSpaces();
            if (TryRead('+'))
            {
                double? added = ReadProduct();
                total = Saturate(total + added);
            }
            else if (TryRead('-'))
            {
                double? subtracted = ReadProduct();
                total = Saturate(total - subtracted);
            }
            else return total;
        }
        return null;
    }

    // a * b / c ...   ReadSum asks for each piece through here, so * and / always happen first
    double? ReadProduct()
    {
        double? product = ReadFactor();
        while (product != null)
        {
            SkipSpaces();
            if (TryRead('*'))
            {
                double? multiplier = ReadFactor();
                product = Saturate(product * multiplier);
            }
            else if (TryRead('/'))
            {
                double? divisor = ReadFactor();
                product = Divide(product, divisor);
            }
            else return product;
        }
        return null;
    }

    // the smallest piece: a number, a name, a negated piece, or a whole sum in brackets
    double? ReadFactor()
    {
        SkipSpaces();
        bool reachedEnd = position == formula.Length;
        if (reachedEnd) return ReportProblem("the formula ends where a figure was expected");

        if (TryRead('-'))
        {
            double? negated = ReadFactor();
            return -negated;
        }

        if (TryRead('('))
        {
            double? inside = ReadSum();
            if (inside == null) return null;
            bool isClosed = TryRead(')');
            return isClosed ? inside : ReportProblem("missing )");
        }

        char next = formula[position];
        if (char.IsAsciiDigit(next)) return ReadNumber();
        if (char.IsAsciiLetter(next)) return FindFigure(ReadName());
        return ReportProblem($"unexpected '{next}'");
    }

    double? ReadNumber()
    {
        int start = position;
        while (position < formula.Length && IsNumberCharacter(formula[position])) position++;
        string numberText = formula[start..position];
        bool isNumber = double.TryParse(numberText, NumberStyles.Float, CultureInfo.InvariantCulture, out double number);
        return isNumber ? Saturate(number) : ReportProblem($"\"{numberText}\" is not a number");
    }

    string ReadName()
    {
        int start = position;
        while (position < formula.Length && IsNameCharacter(formula[position])) position++;
        return formula[start..position];
    }

    double? FindFigure(string name)
    {
        string path = ResolvePath(name);
        Value? found = prevGameState.FindValue(path);
        return found != null ? found.CalculatedValue : ReportProblem($"\"{name}\" names nothing (looked for {path})");
    }

    // §4: prev.effective equals prev.base until modifiers exist
    string ResolvePath(string name)
    {
        bool isOwnFigure = name == PreviousBase || name == PreviousEffective;
        if (isOwnFigure) return value.Path;

        bool isFullPath = name.Contains('.');
        if (isFullPath) return name;

        string institutionPath = value.Path[..value.Path.LastIndexOf('.')];
        return $"{institutionPath}.{name}";
    }

    // §2: nothing over nothing is 0, anything else over nothing saturates, keeping its sign
    static double? Divide(double? dividend, double? divisor)
    {
        if (dividend == null || divisor == null) return null;
        bool divisorIsZero = Math.Abs(divisor.Value) < NearZero;
        bool dividendIsZero = Math.Abs(dividend.Value) < NearZero;
        if (divisorIsZero && dividendIsZero) return 0;
        if (divisorIsZero) return Math.Sign(dividend.Value) * LargestFigure;
        return Saturate(dividend.Value / divisor.Value);
    }

    // capping every step keeps figures finite, which the CalculatedValue setter requires
    static double? Saturate(double? figure)
    {
        if (figure == null) return null;
        return Math.Clamp(figure.Value, -LargestFigure, LargestFigure);
    }

    // always returns null, so a failing step can return this directly
    double? ReportProblem(string reason)
    {
        Console.WriteLine($"{value.Path}: cannot read \"{formula}\" at {position}: {reason}");
        return null;
    }

    bool TryRead(char expected)
    {
        bool isExpected = position < formula.Length && formula[position] == expected;
        if (isExpected) position++;
        return isExpected;
    }

    void SkipSpaces()
    {
        while (position < formula.Length && char.IsWhiteSpace(formula[position])) position++;
    }

    static bool IsNumberCharacter(char character) => char.IsAsciiDigit(character) || character == '.';

    static bool IsNameCharacter(char character) => char.IsAsciiLetterOrDigit(character) || character == '_' || character == '.';
}
