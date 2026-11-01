using Backend;
using Xunit;
namespace Backend.Dialogue.Tests;
public sealed class HangarGeometryTests
{
    private static LocationScene Load() => new(new MapCatalog(Path.Combine(AppContext.BaseDirectory, "Maps")).Scene("hangar"));
    [Fact]
    public void ServerAcceptsJsonRampAndPlatformHeights()
    {
        var location=Load();
        foreach(var x in new[]{-9d,9d})
        {
            Assert.True(location.CanTravel(new Vec3(x,0,-4),new Vec3(x,.9,-8.5)));
            Assert.True(location.CanTravel(new Vec3(x,.9,-8.5),new Vec3(x,0,-4)));
        }
        Assert.True(location.ValidHeight(new Vec3(0,.9,-9)));
        Assert.False(location.ValidHeight(new Vec3(0,0,-9)));
        Assert.False(location.CanTravel(new Vec3(0,0,-7),new Vec3(0,.9,-9)));
    }
    [Fact]
    public void ServerUsesExpandedBoundsAndEquipmentPartitions()
    {
        var location=Load();
        Assert.False(location.SolidAt(new Vec3(9.5,0,7.2)));
        Assert.False(location.SolidAt(new Vec3(12.5,0,7.2)));
        Assert.True(location.SolidAt(new Vec3(11,0,5)));
        Assert.True(location.SolidAt(new Vec3(20,0,0)));
        Assert.False(location.CanReach(new Vec3(10,0,5),new Vec3(12,1,5)));
        Assert.True(location.CanReach(new Vec3(9.5,0,7.2),new Vec3(11,1.55,7.2)));
        for(int i=0;i<8;i++)Assert.False(location.SolidAt(location.Spawn(i)));
    }
    [Fact]
    public void MapCatalogClonesConfigAndIsolatesLobbyInteractions()
    {
        var maps=new MapCatalog(Path.Combine(AppContext.BaseDirectory,"Maps"));
        var a=Guid.NewGuid().ToString();var b=Guid.NewGuid().ToString();
        try {
            var first=maps.Location(a,"hangar");var second=maps.Location(b,"hangar");
            first.Items("doors")[0]!["open"]=true;first.Items("foods")[0]!["eaten"]=true;
            Assert.Same(first,maps.Location(a,"hangar"));
            Assert.False((bool)second.Items("doors")[0]!["open"]!);
            Assert.NotEqual(true,(bool?)second.Items("foods")[0]!["eaten"]);
            Assert.False(maps.Scene("hangar").GetProperty("doors")[0].GetProperty("open").GetBoolean());
            LocationScene.Drop(a);
            Assert.False((bool)maps.Location(a,"hangar").Items("doors")[0]!["open"]!);
        } finally {LocationScene.Drop(a);LocationScene.Drop(b);}
    }
}
