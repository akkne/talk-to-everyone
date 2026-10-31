using System.Text.Json;

namespace Backend;

public static class JsonData
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
    public static T Read<T>(string json) where T : new() => JsonSerializer.Deserialize<T>(json, Options) ?? new T();
    public static string Write<T>(T value) => JsonSerializer.Serialize(value, Options);
    public static long Now => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
}
