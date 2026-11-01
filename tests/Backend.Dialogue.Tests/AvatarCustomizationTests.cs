using System.Text.Json;
using Backend;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Backend.Dialogue.Tests;

public sealed class AvatarCustomizationTests
{
    private static readonly JsonSerializerOptions CamelCaseOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase
    };

    private static GameDb CreateInMemoryDb(string name)
    {
        var services = new ServiceCollection();
        services.AddDbContext<GameDb>(o => o.UseInMemoryDatabase(name));
        var sp = services.BuildServiceProvider();
        var db = sp.GetRequiredService<GameDb>();
        db.Database.EnsureCreated();
        return db;
    }

    [Fact]
    public async Task EnsureAvatarAssetsSeedsRequiredCategories()
    {
        var db = CreateInMemoryDb(Guid.NewGuid().ToString());
        await GameSeed.EnsureAvatarAssetsAsync(db);

        var assets = await db.AvatarAssets.ToListAsync();
        Assert.NotEmpty(assets);

        var categories = assets.Select(a => a.Category).Distinct().ToHashSet();
        Assert.Contains("bodyColor", categories);
        Assert.Contains("hairStyle", categories);
        Assert.Contains("hairColor", categories);
        Assert.Contains("eyes", categories);
        Assert.Contains("mouth", categories);
        Assert.Contains("skinTone", categories);
        Assert.Contains("accessory", categories);

        // Verify multiple options in each category
        Assert.True(assets.Count(a => a.Category == "bodyColor") >= 5);
        Assert.True(assets.Count(a => a.Category == "hairStyle") >= 5);
        Assert.True(assets.Count(a => a.Category == "eyes") >= 4);
        Assert.True(assets.Count(a => a.Category == "mouth") >= 4);
    }

    [Fact]
    public void PlayerViewIncludesCustomAvatarData()
    {
        var customAvatar = new AvatarData
        {
            BodyColor = "#ef4444",
            HairStyle = "spiky",
            HairColor = "#2563eb",
            Eyes = "visor",
            Mouth = "grin",
            SkinTone = "#c78f6c",
            Accessory = "headphones"
        };

        var player = new GamePlayer
        {
            Id = "player-123",
            Name = "Тестер",
            Connected = true,
            AvatarJson = JsonData.Write(customAvatar),
            PoseJson = JsonData.Write(new PoseData())
        };

        var view = GameLogic.PlayerView(player);
        var json = JsonSerializer.Serialize(view, CamelCaseOptions);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.Equal("player-123", root.GetProperty("id").GetString());
        Assert.Equal("Тестер", root.GetProperty("name").GetString());
        var avatarElem = root.GetProperty("avatar");
        Assert.Equal("#ef4444", avatarElem.GetProperty("bodyColor").GetString());
        Assert.Equal("spiky", avatarElem.GetProperty("hairStyle").GetString());
        Assert.Equal("#2563eb", avatarElem.GetProperty("hairColor").GetString());
        Assert.Equal("visor", avatarElem.GetProperty("eyes").GetString());
        Assert.Equal("grin", avatarElem.GetProperty("mouth").GetString());
        Assert.Equal("#c78f6c", avatarElem.GetProperty("skinTone").GetString());
        Assert.Equal("headphones", avatarElem.GetProperty("accessory").GetString());
    }

    [Fact]
    public void LobbyViewIncludesPlayerAvatars()
    {
        var customAvatar = new AvatarData
        {
            BodyColor = "#10b981",
            HairStyle = "bun",
            HairColor = "#6a4937",
            Eyes = "wide",
            Mouth = "smile"
        };

        var players = new List<GamePlayer>
        {
            new()
            {
                Id = "leader-1",
                Name = "Ведущий",
                Connected = true,
                Role = "leader",
                AvatarJson = JsonData.Write(customAvatar)
            }
        };

        var session = new GameSession
        {
            Id = "sess-1",
            RoomCode = "1234",
            Phase = "lobby"
        };

        var lobbyObj = GameLogic.Lobby(players, session);
        var json = JsonSerializer.Serialize(lobbyObj, CamelCaseOptions);
        using var doc = JsonDocument.Parse(json);
        var playersArr = doc.RootElement.GetProperty("players");
        Assert.Equal(1, playersArr.GetArrayLength());

        var firstPlayer = playersArr[0];
        Assert.Equal("Ведущий", firstPlayer.GetProperty("name").GetString());
        Assert.Equal("#10b981", firstPlayer.GetProperty("avatar").GetProperty("bodyColor").GetString());
        Assert.Equal("bun", firstPlayer.GetProperty("avatar").GetProperty("hairStyle").GetString());
    }
}
