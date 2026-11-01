using Backend;
using Xunit;

namespace Backend.Dialogue.Tests;

public sealed class ClubFoodTests
{
    [Fact]
    public void ClubKeepsOnlyMarkAndRestocksFoodAfterThreeSeconds()
    {
        var maps = new MapCatalog(Path.Combine(AppContext.BaseDirectory, "Maps"));
        var first = new LocationScene(maps.Scene("club"));
        var second = new LocationScene(maps.Scene("club"));
        Assert.Equal("bartender-mark", (string?)Assert.Single(first.Items("functionalNPCs"))!["id"]);
        Assert.Empty(first.Items("ambientNPCs"));
        Assert.DoesNotContain(first.Items("interactiveObjects"), item => (string?)item!["targetId"] == "bar-counter");

        var food = Assert.Single(first.Items("foods"))!;
        var counter = first.Items("objects").Single(item => (string?)item!["id"] == "bar-counter")!;
        var position = LocationScene.Point(food["position"]!);
        var center = LocationScene.Point(counter["position"]!);
        var size = LocationScene.Point(counter["size"]!);
        Assert.InRange(position.X, center.X - size.X / 2, center.X + size.X / 2);
        Assert.InRange(position.Z, center.Z - size.Z / 2, center.Z + size.Z / 2);
        Assert.True(position.Y > size.Y);
        Assert.True(first.CanReach(new Vec3(-7.4, 0, position.Z), position));

        first.ConsumeFood(food, 1000);
        Assert.True((bool)food["eaten"]!);
        Assert.Equal(4000, (long)food["restockAt"]!);
        Assert.False(first.RestockFood(3999));
        Assert.True((bool)food["eaten"]!);
        Assert.True(first.RestockFood(4000));
        Assert.False((bool)food["eaten"]!);
        Assert.Null(food["restockAt"]);
        Assert.False(first.RestockFood(4001));
        first.ConsumeFood(food, 5000);
        Assert.Equal(8000, (long)food["restockAt"]!);
        Assert.True(first.RestockFood(8000));
        Assert.False((bool)food["eaten"]!);
        Assert.False((bool?)second.Items("foods")[0]!["eaten"] == true);
    }

    [Fact]
    public void HangarFoodRemainsConsumed()
    {
        var maps = new MapCatalog(Path.Combine(AppContext.BaseDirectory, "Maps"));
        var location = new LocationScene(maps.Scene("hangar"));
        var food = location.Items("foods")[0]!;
        location.ConsumeFood(food, 1000);
        Assert.False(location.RestockFood(10000));
        Assert.True((bool)food["eaten"]!);
    }
}
