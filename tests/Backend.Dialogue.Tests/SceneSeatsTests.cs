using System.Text.Json;
using Backend;
using Xunit;

namespace Backend.Dialogue.Tests;

public sealed class SceneSeatsTests
{
    [Fact]
    public void SceneAndOccupancyExposeExactlyFourCenteredSeats()
    {
        var scene = JsonSerializer.SerializeToElement(GameLogic.Scene, JsonData.Options);
        var seats = scene.GetProperty("playerSeats").EnumerateArray().ToArray();
        var occupancy = JsonSerializer.SerializeToElement(GameLogic.Seats(Array.Empty<GamePlayer>()));
        Assert.Equal(4, seats.Length);
        Assert.Equal(4, occupancy.GetArrayLength());
        for (var i = 0; i < seats.Length; i++)
        {
            Assert.Equal($"seat-{i + 1}", seats[i].GetProperty("id").GetString());
            Assert.Equal($"seat-{i + 1}", occupancy[i].GetProperty("id").GetString());
            Assert.Equal(GameLogic.SeatX(i + 1), seats[i].GetProperty("position").GetProperty("x").GetDouble());
        }
        Assert.Equal(-GameLogic.SeatX(1), GameLogic.SeatX(4));
    }
}
