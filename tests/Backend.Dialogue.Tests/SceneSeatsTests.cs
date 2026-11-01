using System.Text.Json;
using Backend;
using Xunit;
namespace Backend.Dialogue.Tests;
public sealed class SceneSeatsTests
{
    [Fact]
    public void SceneSeparatesFourJuryChairsFromSofaSeating()
    {
        var scene = new MapCatalog(Path.Combine(AppContext.BaseDirectory, "Maps")).Scene("hangar");
        var seats = scene.GetProperty("playerSeats").EnumerateArray().ToArray();
        var occupancy = JsonSerializer.SerializeToElement(GameLogic.Seats(Array.Empty<GamePlayer>(), new LocationScene(scene)));
        Assert.Equal(4, seats.Length);
        Assert.Equal(7, occupancy.GetArrayLength());
        for(var i=0;i<seats.Length;i++) {
            Assert.Equal($"seat-{i+1}",seats[i].GetProperty("id").GetString());
            Assert.Equal($"seat-{i+1}",occupancy[i].GetProperty("id").GetString());
        }
        Assert.Equal(-seats[0].GetProperty("position").GetProperty("x").GetDouble(), seats[3].GetProperty("position").GetProperty("x").GetDouble());
    }
}
