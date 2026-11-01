using System.Text.Json.Nodes;
using Backend;
using Xunit;

namespace Backend.Dialogue.Tests;

public sealed class DirectorRoutineTests
{
    private static LocationScene Scene() => new(new MapCatalog(Path.Combine(AppContext.BaseDirectory, "Maps")).Scene("hangar"));
    private static GamePlayer Player() => new() { Name = "Артём", Connected = true,
        PoseJson = JsonData.Write(new PoseData { Position = new Vec3(12.5, 0, 6), Mode = "walking" }) };

    [Fact]
    public void RoutineClosesWalksTakesExactlyOneServingAndReturnsToWork() {
        var scene = Scene(); var npc = scene.Director; var players = new[] { Player() };
        Assert.True(npc.Tick(scene, players, 1000, false));
        var run = npc.Run!;
        Assert.Contains("Артём", run.Speech);
        Assert.Empty(scene.Items("foods").Where(f => (bool?)f!["eaten"] == true));
        Assert.Equal(new[] { "close", "stand", "walk", "take", "return", "sit", "open", "work" }, run.Steps.Select(s => s.Action).Distinct());
        Assert.True(npc.Tick(scene, players, 1000 + (long)Math.Ceiling(run.TakeAtMs), false));
        Assert.Single(scene.Items("foods").Where(f => (bool?)f!["eaten"] == true));
        npc.Tick(scene, players, 1000 + (long)Math.Ceiling(run.FinishedMs), false);
        var end = DirectorRoutine.Sample(npc.Run!, run.FinishedMs + 1);
        Assert.True(end.Seated); Assert.Equal(1, end.LaptopOpen); Assert.Equal("work", end.Action);
        Assert.Equal(run.Steps[0].Position, end.Position);
        Assert.False(npc.Tick(scene, players, 30_999, false));
        Assert.True(npc.Tick(scene, players, 31_000, false));
    }

    [Fact]
    public void PickupHandlesPlayerEatingTargetAndEmptyTableWithoutDuplicates() {
        var scene = Scene(); var npc = scene.Director; var players = new[] { Player() };
        npc.Tick(scene, players, 1000, false);
        scene.Items("foods")[0]!["eaten"] = true;
        npc.Tick(scene, players, 1000 + (long)Math.Ceiling(npc.Run!.TakeAtMs), false);
        Assert.Equal(2, scene.Items("foods").Count(f => (bool?)f!["eaten"] == true));
        npc.Tick(scene, players, 1000 + (long)npc.Run.FinishedMs + 100, false);
        Assert.Equal(2, scene.Items("foods").Count(f => (bool?)f!["eaten"] == true));
        foreach (var food in scene.Items("foods")) food!["eaten"] = true;
        npc.Tick(scene, players, 31_000, false);
        npc.Tick(scene, players, 31_000 + (long)Math.Ceiling(npc.Run!.TakeAtMs), false);
        Assert.Null(npc.Run.FoodId);
    }

    [Fact]
    public void PauseDoesNotConsumeFoodOrRestartRoutineAndPathsAvoidFurniture() {
        var scene = Scene(); var npc = scene.Director; var players = new[] { Player() };
        npc.Tick(scene, players, 1000, false);
        var run = npc.Run!;
        npc.Tick(scene, players, 2000, true);
        npc.Tick(scene, players, 62_000, true);
        Assert.Empty(scene.Items("foods").Where(f => (bool?)f!["eaten"] == true));
        npc.Tick(scene, players, 62_200, false);
        Assert.Equal(run.TriggeredAt, npc.Run!.TriggeredAt);
        Assert.Empty(scene.Items("foods").Where(f => (bool?)f!["eaten"] == true));
        var geometry = Scene();
        var obstacles = geometry.Data["room"]!["obstacles"]!.AsArray();
        obstacles.Remove(obstacles.Single(o => (string?)o!["id"] == "npc-equipment-director"));
        for (var i = 1; i < run.Steps.Count; i++)
            Assert.True(geometry.CanTravel(run.Steps[i-1].Position, run.Steps[i].Position), $"Blocked leg {i}");
        Assert.NotNull(scene.Data["directorRun"]);
    }
}
