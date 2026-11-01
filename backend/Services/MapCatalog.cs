using System.Text.Json;

namespace Backend;

public sealed record MapDefinition(string Id, string Name, string? SceneFile, bool Available);

public sealed class MapCatalog
{
    private readonly string root;
    private readonly IReadOnlyList<MapDefinition> maps;
    private readonly Dictionary<string, JsonElement> scenes = new(StringComparer.Ordinal);

    public MapCatalog(IHostEnvironment environment) : this(Path.Combine(environment.ContentRootPath, "Maps")) { }

    public MapCatalog(string directory)
    {
        root = Path.GetFullPath(directory);
        maps = JsonSerializer.Deserialize<List<MapDefinition>>(
            File.ReadAllText(Path.Combine(root, "catalog.json")),
            new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? throw new InvalidDataException("Empty map catalog");
        foreach (var map in maps.Where(m => m.Available))
        {
            if (string.IsNullOrWhiteSpace(map.SceneFile)) throw new InvalidDataException($"Missing scene for {map.Id}");
            var path = Path.GetFullPath(Path.Combine(root, map.SceneFile));
            if (!path.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.Ordinal)) throw new InvalidDataException("Invalid scene path");
            using var document = JsonDocument.Parse(File.ReadAllText(path));
            scenes.Add(map.Id, document.RootElement.Clone());
        }
    }

    public LocationScene Location(string sessionId, string mapId) => LocationScene.For(sessionId, Scene(mapId));
    public IReadOnlyList<MapDefinition> List() => maps;
    public MapDefinition? Find(string id) => maps.FirstOrDefault(m => m.Id == id);
    public JsonElement Scene(string id) => scenes.TryGetValue(id, out var scene) ? scene : scenes["hangar"];
}
