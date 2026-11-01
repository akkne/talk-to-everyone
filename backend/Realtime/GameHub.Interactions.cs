using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
namespace Backend;
public sealed record InteractionRequest(string RequestId, string Id);
public sealed partial class GameHub
{
    public async Task Interact(InteractionRequest request)
    {
        await gate.Lock.WaitAsync();
        try
        {
            var me=await Authorized();if(me==null)return;
            var location=await Location(me);
            if(!ValidRequestId(request.RequestId))throw new HubException("Некорректный запрос.");
            if(Seen(me,"Interact",request.RequestId))return;
            var pose=JsonData.Read<PoseData>(me.PoseJson);
            if(pose.Mode!="walking")throw new HubException("Сначала встаньте.");
            var door=location.Items("doors").FirstOrDefault(d=>(string?)d!["id"]==request.Id);
            var food=location.Items("foods").FirstOrDefault(f=>(string?)f!["id"]==request.Id);
            var item=door??food;if(item==null)throw new HubException("Предмет не найден.");
            var point=LocationScene.Point(item[door!=null?"center":"position"]!);
            if(Math.Abs(pose.Position.Y)> .25 || Math.Sqrt(Math.Pow(pose.Position.X-point.X,2)+Math.Pow(pose.Position.Z-point.Z,2))>2 || !location.CanReach(pose.Position,point))throw new HubException("Подойдите ближе к предмету.");
            string message;
            if(door!=null)
            {
                bool open=(bool)door["open"]!;
                if(open && (await db.Players.Where(p=>p.Connected && p.SessionId==me.SessionId).ToListAsync()).Any(p=>LocationScene.Hits(JsonData.Read<PoseData>(p.PoseJson).Position,door)))throw new HubException("Проём занят. Отойдите от двери.");
                door["open"]=!open;message=open?"Дверь закрыта":"Дверь открыта";
            }
            else
            {
                if((bool?)food!["eaten"]==true)throw new HubException("Этот предмет уже съеден.");
                food!["eaten"]=true;message=$"Вы съели: {(string?)food["label"]}";
            }
            Remember(me,"Interact",request.RequestId);await db.SaveChangesAsync();
            await Clients.Group(me.SessionId).SendAsync("LocationState",new {doors=location.Items("doors"),foods=location.Items("foods")});
            await Clients.Caller.SendAsync("InteractionFeedback",new {message});
        }
        finally{gate.Lock.Release();}
    }
}
