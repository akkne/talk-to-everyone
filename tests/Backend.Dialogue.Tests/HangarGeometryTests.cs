using Backend;
using Xunit;
namespace Backend.Dialogue.Tests;
public sealed class HangarGeometryTests
{
    [Fact]
    public void ServerAcceptsJsonRampAndPlatformHeights()
    {
        foreach(var x in new[]{-9d,9d})
        {
            Assert.True(LocationScene.CanTravel(new Vec3(x,0,-4),new Vec3(x,.9,-8.5)));
            Assert.True(LocationScene.CanTravel(new Vec3(x,.9,-8.5),new Vec3(x,0,-4)));
        }
        Assert.True(LocationScene.ValidHeight(new Vec3(0,.9,-9)));
        Assert.False(LocationScene.ValidHeight(new Vec3(0,0,-9)));
        Assert.False(LocationScene.CanTravel(new Vec3(0,0,-7),new Vec3(0,.9,-9)));
    }
    [Fact]
    public void ServerUsesExpandedBoundsAndEquipmentPartitions()
    {
        Assert.False(LocationScene.SolidAt(new Vec3(9.5,0,7.2)));
        Assert.False(LocationScene.SolidAt(new Vec3(12.5,0,7.2)));
        Assert.True(LocationScene.SolidAt(new Vec3(11,0,5)));
        Assert.True(LocationScene.SolidAt(new Vec3(20,0,0)));
        Assert.False(LocationScene.CanReach(new Vec3(10,0,5),new Vec3(12,1,5)));
        Assert.True(LocationScene.CanReach(new Vec3(9.5,0,7.2),new Vec3(11,1.55,7.2)));
        for(int i=0;i<8;i++)Assert.False(LocationScene.SolidAt(LocationScene.Spawn(i)));
    }
}
