using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace Backend;

public sealed record InteractionRequest(string RequestId, string Id, string? Action = null);

public sealed partial class GameHub
{
    public async Task Interact(InteractionRequest request)
    {
        await gate.Lock.WaitAsync();
        try
        {
            var me = await Authorized();
            if (me == null) return;
            if (request == null || !ValidRequestId(request.RequestId)) throw new HubException("Некорректный запрос.");
            if (Seen(me, "Interact", request.RequestId)) return;

            var location = await Location(me);
            var pose = JsonData.Read<PoseData>(me.PoseJson);
            if (pose.Mode != "walking") throw new HubException("Сначала встаньте.");

            var interaction = location.Items("interactiveObjects").FirstOrDefault(item => (string?)item!["id"] == request.Id);
            var door = location.Items("doors").FirstOrDefault(item => (string?)item!["id"] == request.Id);
            var food = location.Items("foods").FirstOrDefault(item => (string?)item!["id"] == request.Id);
            if (interaction == null && door == null && food == null) throw new HubException("Предмет не найден.");

            var trigger = interaction?["interactionTrigger"] ?? door?["center"] ?? food!["position"];
            var point = LocationScene.Point(trigger!);
            var radius = interaction == null ? 2 : LocationScene.N(trigger!, "radius");
            if (Math.Abs(pose.Position.Y) > .35 ||
                Math.Sqrt(Math.Pow(pose.Position.X - point.X, 2) + Math.Pow(pose.Position.Z - point.Z, 2)) > radius ||
                !location.CanReach(pose.Position, point))
                throw new HubException("Подойдите ближе к предмету.");

            string message;
            if (interaction != null)
            {
                var actions = interaction["actions"]!.AsArray();
                var action = request.Action ?? (string?)actions[0];
                if (action == null || !actions.Any(item => (string?)item == action)) throw new HubException("Действие недоступно.");
                if (action == "jiggle_handle")
                {
                    var entrance = location.Items("doors").First(item => (string?)item!["id"] == (string?)interaction["targetId"])!;
                    var session = await db.Sessions.SingleAsync(s => s.Id == me.SessionId);
                    if (session.Phase == "playing") message = "Охранник не выпускает во время раунда.";
                    else
                    {
                        var open = (bool)entrance["open"]!;
                        if (open && (await db.Players.Where(p => p.Connected && p.SessionId == me.SessionId).ToListAsync())
                            .Any(p => LocationScene.Hits(JsonData.Read<PoseData>(p.PoseJson).Position, entrance)))
                            throw new HubException("Проём занят. Отойдите от двери.");
                        entrance["open"] = !open;
                        message = open ? "Дверь закрыта." : "Дверь открыта.";
                    }
                }
                else message = ApplyLoftAction(location, action);
            }
            else if (door != null)
            {
                if(LocationScene.DoorMoving(door))throw new HubException("Дождитесь остановки двери.");
                bool open=(bool)door["open"]!;
                var travel=LocationScene.DoorBounds(door,true);
                if((await db.Players.Where(p=>p.Connected && p.SessionId==me.SessionId).ToListAsync()).Any(p=>LocationScene.Hits(JsonData.Read<PoseData>(p.PoseJson).Position,travel)))throw new HubException("Проём занят. Отойдите от двери.");
                door["transition"]=new System.Text.Json.Nodes.JsonObject { ["startedAt"]=JsonData.Now, ["from"]=open?1:0, ["to"]=open?0:1 };
                door["open"]=!open;message=open?"Дверь закрывается":"Дверь открывается";
            }
            else
            {
                if ((bool?)food!["eaten"] == true) throw new HubException("Этот предмет уже съеден.");
                food!["eaten"] = true;
                message = $"Вы съели: {(string?)food["label"]}";
            }

            Remember(me, "Interact", request.RequestId);
            await db.SaveChangesAsync();
            await Clients.Group(me.SessionId).SendAsync("LocationState", new
            {
                doors = location.Items("doors"), foods = location.Items("foods"),
                activeLightingPreset = (string?)location.Data["activeLightingPreset"],
                fanOn = (bool?)location.Data["fanOn"], musicTrack = (string?)location.Data["musicTrack"]
            });
            await Clients.Caller.SendAsync("InteractionFeedback", new { message, action = request.Action });
        }
        finally { gate.Lock.Release(); }
    }

    private static string ApplyLoftAction(LocationScene location, string action)
    {
        var data = location.Data;
        switch (action)
        {
            case "peek_porthole": return "За иллюминатором пустой коридор.";
            case "knock_loudly": return "Вы громко постучали. Марк взглянул на дверь.";
            case "order_cold_brew": return "Марк подал колд брю.";
            case "order_tonic": return "Марк подал тоник.";
            case "order_cider": return "Марк подал сидр.";
            case "ring_bell": return "Колокольчик звякнул. Марк обратил на вас внимание.";
            case "toggle_factory_mood":
                data["activeLightingPreset"] = (string?)data["activeLightingPreset"] == "techno-loft" ? "edison-warm-default" : "techno-loft";
                return "Освещение переключено.";
            case "toggle_overhead_fan":
                data["fanOn"] = !(bool?)data["fanOn"]!;
                return (bool)data["fanOn"]! ? "Вентилятор включён." : "Вентилятор выключен.";
            case "change_track_lofi": data["musicTrack"] = "lofi"; return "Включён лоу фай.";
            case "change_track_triphop": data["musicTrack"] = "triphop"; return "Включён трип хоп.";
            case "change_track_industrial": data["musicTrack"] = "industrial"; return "Включён индастриал.";
            case "mute": data["musicTrack"] = "mute"; return "Проигрыватель выключен.";
            case "spin_rods": return "Вы прокрутили штанги кикера.";
            case "read_private_notes": return "Личные заметки доступны на доске расследования.";
            case "leave_note": return "Откройте доску расследования, чтобы записать заметку.";
            case "kick_machine": return "Автомат сердито загудел.";
            case "buy_soda": return "Автомат выдал банку газировки.";
            default: throw new HubException("Действие недоступно.");
        }
    }
}
