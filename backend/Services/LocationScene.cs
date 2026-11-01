using System.Text.Json.Nodes;
using System.Text.Json;
using System.Collections.Concurrent;
namespace Backend;

/// <summary>The JSON document owns geometry and shared interaction state. Access under GameGate.</summary>
public sealed class LocationScene
{
    private static readonly ConcurrentDictionary<string, LocationScene> locations = new();
    public static LocationScene For(string sessionId, JsonElement source) => locations.GetOrAdd(sessionId, _ => new LocationScene(source));
    public static void Drop(string sessionId) => locations.TryRemove(sessionId, out _);
    public LocationScene(JsonElement source) { Data = JsonNode.Parse(source.GetRawText())!.AsObject(); }
    public JsonObject Data { get; }

    public JsonArray Seats => Data["playerSeats"]!.AsArray();
    public JsonArray Items(string key) => (Data[key] ??= new JsonArray()).AsArray();
    public static Vec3 Point(JsonNode n) => new(N(n,"x"), N(n,"y"), N(n,"z"));
    public static double N(JsonNode n, string key) => n[key]!.GetValue<double>();
    public JsonNode Seat(string id) => Seats.First(n => (string?)n!["id"] == id)!;
    public Vec3 Spawn(int index) => Point(Items("spawnPoints")[index % Items("spawnPoints").Count]!);
    public static bool Hits(Vec3 p, JsonNode box)
    {
        var c = Point(box["center"]!); var s = Point(box["size"]!);
        var dx = Math.Max(Math.Abs(p.X-c.X)-s.X/2, 0); var dz = Math.Max(Math.Abs(p.Z-c.Z)-s.Z/2, 0);
        return p.Y < c.Y+s.Y/2-.01 && p.Y+1.8 > c.Y-s.Y/2 && dx*dx+dz*dz < .09-1e-8;
    }
    public bool SolidAt(Vec3 p)
    {
        var room = Data["room"]!;
        if (Math.Abs(p.X) > N(room,"width")/2-.3 || Math.Abs(p.Z) > N(room,"depth")/2-.3) return true;
        foreach (var key in new[]{"walls","obstacles"})
            if (room[key]!.AsArray().Any(b => Hits(p,b!))) return true;
        if (Items("objects").Any(o => o!["collider"] is JsonNode b && Hits(p,b))) return true;
        if (Items("doors").Any(d => !(bool)d!["open"]! && Hits(p,d))) return true;
        return false;
    }
    public bool ValidHeight(Vec3 p)
    {
        var room = Data["room"]!;
        foreach (var r in room["ramps"]!.AsArray())
        {
            var a=Point(r!["from"]!); var b=Point(r["to"]!); var dx=b.X-a.X; var dz=b.Z-a.Z; var len=Math.Sqrt(dx*dx+dz*dz);
            var t=((p.X-a.X)*dx+(p.Z-a.Z)*dz)/(len*len);
            var side=Math.Abs((p.X-a.X)*dz-(p.Z-a.Z)*dx)/len;
            if(t>=-.02 && t<=1.02 && side<=N(r,"width")/2+.01 && Math.Abs(p.Y-(a.Y+Math.Clamp(t,0,1)*(b.Y-a.Y)))<.12) return true;
        }
        foreach(var b in room["platforms"]!.AsArray())
        {
            var c=Point(b!["center"]!);var s=Point(b["size"]!);
            if(Math.Abs(p.X-c.X)<=s.X/2 && Math.Abs(p.Z-c.Z)<=s.Z/2) return Math.Abs(p.Y-c.Y-s.Y/2)<.12;
        }
        return Math.Abs(p.Y)<.12;
    }
    public bool CanTravel(Vec3 a, Vec3 b)
    {
        int count=Math.Max(1,(int)Math.Ceiling(Math.Sqrt(Math.Pow(b.X-a.X,2)+Math.Pow(b.Z-a.Z,2))/.04));
        for(int i=1;i<=count;i++) {var t=(double)i/count;var p=new Vec3(a.X+(b.X-a.X)*t,a.Y+(b.Y-a.Y)*t,a.Z+(b.Z-a.Z)*t);if(SolidAt(p)||!ValidHeight(p))return false;}
        return true;
    }
    public bool CanReach(Vec3 a, Vec3 b)
    {
        int count=Math.Max(1,(int)(Math.Sqrt(Math.Pow(b.X-a.X,2)+Math.Pow(b.Z-a.Z,2))/.08));
        for(int i=1;i<count;i++)
        {
            var t=(double)i/count;var p=new Vec3(a.X+(b.X-a.X)*t, a.Y, a.Z+(b.Z-a.Z)*t);
            if(Data["room"]!["walls"]!.AsArray().Any(w=>Hits(p,w!)))return false;
        }
        return true;
    }
}
