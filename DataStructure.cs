using System.Dynamic;

public class EngineRoot
{
    RootNode node;
}

public abstract class Node
{
    public abstract Node Get(string Key);
    public abstract Node Add(string Key, Node node);
    public abstract Node Replace( string Key , Node node );
    public abstract bool IsIn( string Key );

}

public class ActorNode : Node
{
    Dictionary<String, Node> Nodes = new();

    public GetIndexBinder()
    {
        
    }
}

public class RootNode : Node
{
    Dictionary<String, Node> Nodes = new();
    public RootNode()
    {
        Nodes.Add("Actors", new ActorNode());
    }
}


