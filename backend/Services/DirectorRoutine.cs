using System.Text.Json;
using System.Text.Json.Nodes;

namespace Backend;

public sealed record DirectorStep(double AtMs, Vec3 Position, double Yaw, bool Seated, double LaptopOpen, string Action);
public sealed record DirectorRun(long TriggeredAt, long StartedAt, string Speech, string? FoodId, double TakeAtMs, double FinishedMs, List<DirectorStep> Steps);

/// <summary>Session-owned routine. Advance only under GameGate; food is taken at the pickup, never reserved at the trigger.</summary>
public sealed class DirectorRoutine
{
    public DirectorRun? Run { get; private set; }
    private long lastTick;
    private bool wasPaused;
    private bool picked;
    private static readonly JsonSerializerOptions web = new(JsonSerializerDefaults.Web);

    public bool Tick(LocationScene scene, IEnumerable<GamePlayer> players, long now, bool paused)
    {
        var actor = scene.Items("ambientNPCs").FirstOrDefault(n => (string?)n!["type"] == "human-director");
        if (actor == null) return false;
        var changed = false;
        if (paused && Run != null && lastTick > 0)
            Run = Run with { StartedAt = Run.StartedAt + now - lastTick };
        changed = wasPaused && !paused;
        lastTick = now; wasPaused = paused;
        if (paused) { Publish(scene); return false; }
        var home = LocationScene.Point(actor["position"]!);
        if (Run == null || now - Run.StartedAt >= Math.Max(30_000, Run.FinishedMs))
        {
            var player = players.FirstOrDefault(p => {
                var pose = JsonData.Read<PoseData>(p.PoseJson);
                return p.Connected && Math.Abs(pose.Position.Y - home.Y) <= 1 &&
                    Math.Sqrt(Math.Pow(pose.Position.X - home.X, 2) + Math.Pow(pose.Position.Z - home.Z, 2)) <= 2 && scene.CanReach(pose.Position, home);
            });
            if (player != null)
            {
                var food = scene.Items("foods").FirstOrDefault(f => (bool?)f!["eaten"] != true);
                var x = food == null ? 15.1 : LocationScene.N(food["position"]!, "x");
                var steps = new List<DirectorStep>();
                double t = 0;
                void Add(Vec3 p, double yaw, bool seated, double open, string action, double delay) {
                    t += delay; steps.Add(new(t, p, yaw, seated, open, action));
                }
                Add(home, 0, true, 1, "close", 0);
                Add(home, 0, false, 0, "stand", 900);
                Add(home, -Math.PI / 2, false, 0, "walk", 900);
                var route = new[] { new Vec3(12.5, 0, home.Z), new Vec3(12.5, 0, 9.5), new Vec3(x, 0, 9.5) };
                var previous = home;
                foreach (var p in route) {
                    var yaw = Math.Atan2(p.X - previous.X, p.Z - previous.Z);
                    // Set the facing direction at the start of each leg.
                    steps[^1] = steps[^1] with { Yaw = yaw };
                    Add(p, yaw, false, 0, "walk", Distance(previous, p) / 1.6 * 1000); previous = p;
                }
                steps[^1] = steps[^1] with { Yaw = 0, Action = "take" };
                var takeAt = t + 650;
                Add(previous, 0, false, 0, "return", 1200);
                foreach (var p in new[] { route[1], route[0], home }) {
                    var yaw = Math.Atan2(p.X - previous.X, p.Z - previous.Z);
                    steps[^1] = steps[^1] with { Yaw = yaw };
                    Add(p, yaw, false, 0, "return", Distance(previous, p) / 1.6 * 1000); previous = p;
                }
                steps[^1] = steps[^1] with { Yaw = 0, Seated = true, Action = "sit" };
                Add(home, 0, true, 0, "open", 900);
                Add(home, 0, true, 1, "work", 900);
                Run = new(now, now, $"{player.Name}, вы мешаете мне работать. Отойдите, пожалуйста.", (string?)food?["id"], takeAt, t, steps);
                picked = false; changed = true;
            }
        }
        if (Run != null && !picked && now - Run.StartedAt >= Run.TakeAtMs)
        {
            var target = scene.Items("foods").FirstOrDefault(f => (string?)f!["id"] == Run.FoodId && (bool?)f["eaten"] != true);
            // A judge may have eaten the target while the director was walking.
            // Take another serving only if it is within arm's reach of this pickup position.
            var point = Sample(Run, Run.TakeAtMs).Position;
            target ??= scene.Items("foods").FirstOrDefault(f => (bool?)f!["eaten"] != true && Distance(point, LocationScene.Point(f["position"]!)) <= 1.25);
            if (target != null) target["eaten"] = true;
            Run = Run with { FoodId = (string?)target?["id"] };
            picked = true; changed = true;
        }
        Publish(scene);
        return changed;
    }

    private void Publish(LocationScene scene) {
        if (Run != null) scene.Data["directorRun"] = JsonSerializer.SerializeToNode(Run, web);
    }
    private static double Distance(Vec3 a, Vec3 b) => Math.Sqrt(Math.Pow(a.X-b.X,2) + Math.Pow(a.Z-b.Z,2));
    public static DirectorStep Sample(DirectorRun run, double elapsed) {
        var previousStep = run.Steps[0];
        foreach (var to in run.Steps.Skip(1)) {
            if (elapsed < to.AtMs) {
                var t = Math.Clamp((elapsed-previousStep.AtMs)/(to.AtMs-previousStep.AtMs),0,1);
                return previousStep with { Position = new(previousStep.Position.X+(to.Position.X-previousStep.Position.X)*t, previousStep.Position.Y, previousStep.Position.Z+(to.Position.Z-previousStep.Position.Z)*t) };
            }
            previousStep = to;
        }
        return previousStep;
    }
}
