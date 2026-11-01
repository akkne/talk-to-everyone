using System.Text.Json;
using Backend;
using Xunit;
namespace Backend.Dialogue.Tests;
public sealed class SceneSeatsTests
{
    [Fact]
    public void SceneAndOccupancyUseAllEightJsonSeats()
    {
        var scene = new MapCatalog(Path.Combine(AppContext.BaseDirectory, "Maps")).Scene("hangar");
        var seats = scene.GetProperty("playerSeats").EnumerateArray().ToArray();
        var occupancy = JsonSerializer.SerializeToElement(GameLogic.Seats(Array.Empty<GamePlayer>(), new LocationScene(scene)));
        Assert.Equal(8, seats.Length);
        Assert.Equal(8, occupancy.GetArrayLength());
        for(var i=0;i<seats.Length;i++) {
            Assert.Equal($"seat-{i+1}",seats[i].GetProperty("id").GetString());
            Assert.Equal($"seat-{i+1}",occupancy[i].GetProperty("id").GetString());
        }
        Assert.Equal(-seats[0].GetProperty("position").GetProperty("x").GetDouble(), seats[7].GetProperty("position").GetProperty("x").GetDouble());
    }

    [Fact]
    public void LoftMapHasWalkableSpawnsAndCompatibleDoorAndInteractions()
    {
        var scene = new MapCatalog(Path.Combine(AppContext.BaseDirectory, "Maps")).Scene("club");
        var location = new LocationScene(scene);
        Assert.Equal(8, location.Items("spawnPoints").Count);
        Assert.Equal(8, location.Seats.Count);
        foreach (var spawn in location.Items("spawnPoints"))
            Assert.False(location.SolidAt(LocationScene.Point(spawn!)));
        foreach (var seat in location.Seats)
        {
            Assert.False(location.SolidAt(LocationScene.Point(seat!["exit"]!)));
            Assert.InRange(LocationScene.N(seat, "yaw"), -Math.PI / 2, Math.PI / 2);
        }
        var door = location.Items("doors").Single()!;
        Assert.NotNull(door["center"]);
        Assert.False((bool)door["open"]!);
        Assert.True(location.SolidAt(new Vec3(0, 0, 9.7)));
        door["open"] = true;
        Assert.False(location.SolidAt(new Vec3(0, 0, 9.7)));
        foreach (var item in location.Items("interactiveObjects"))
            Assert.NotEmpty(item!["actions"]!.AsArray());
    }
}
