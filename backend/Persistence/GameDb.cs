using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace Backend;

public sealed class GameDb(DbContextOptions<GameDb> options) : DbContext(options)
{
    public DbSet<UserAccount> Users => Set<UserAccount>();
    public DbSet<GameSession> Sessions => Set<GameSession>();
    public DbSet<GamePlayer> Players => Set<GamePlayer>();
    public DbSet<GameNpc> Npcs => Set<GameNpc>();
    public DbSet<GameMessage> Messages => Set<GameMessage>();
    public DbSet<NpcConversationEvent> ConversationEvents => Set<NpcConversationEvent>();
    public DbSet<PairChoice> Choices => Set<PairChoice>();
    public DbSet<AvatarAsset> AvatarAssets => Set<AvatarAsset>();

    protected override void OnModelCreating(ModelBuilder model)
    {
        model.Entity<UserAccount>().HasKey(x => x.Id);
        model.Entity<UserAccount>().HasIndex(x => x.Login).IsUnique();
        model.Entity<GameSession>().HasKey(x => x.Id);
        model.Entity<GameSession>().HasIndex(x => x.RoomCode).IsUnique();
        model.Entity<GamePlayer>().HasKey(x => x.Id);
        model.Entity<GamePlayer>().HasIndex(x => new { x.SessionId, x.TokenHash }).IsUnique();
        model.Entity<GamePlayer>().HasIndex(x => new { x.SessionId, x.Name }).IsUnique();
        model.Entity<GameNpc>().HasKey(x => x.Id);
        model.Entity<GameNpc>().HasIndex(x => new { x.SessionId, x.Number }).IsUnique();
        model.Entity<GameMessage>().HasKey(x => x.Id);
        model.Entity<GameMessage>().HasIndex(x => new { x.SessionId, x.At });
        model.Entity<NpcConversationEvent>().HasKey(x => x.Id);
        model.Entity<NpcConversationEvent>().HasIndex(x => new { x.GameId, x.Sequence }).IsUnique();
        model.Entity<NpcConversationEvent>().HasIndex(x => x.SessionId);
        model.Entity<PairChoice>().HasKey(x => x.Id);
        model.Entity<PairChoice>().HasIndex(x => new { x.SessionId, x.PlayerId, x.Round }).IsUnique();
        model.Entity<AvatarAsset>().HasKey(x => x.Id);
        model.Entity<AvatarAsset>().HasIndex(x => new { x.Category, x.SortOrder });
    }
}

public sealed class GameDbFactory : IDesignTimeDbContextFactory<GameDb>
{
    public GameDb CreateDbContext(string[] args)
    {
        var options = new DbContextOptionsBuilder<GameDb>()
            .UseNpgsql(Environment.GetEnvironmentVariable("DATABASE_URL") ?? "Host=localhost;Database=game;Username=game;Password=design")
            .Options;
        return new GameDb(options);
    }
}
