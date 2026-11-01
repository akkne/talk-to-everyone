using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class MigrateGameTablesToRedis : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Choices");

            migrationBuilder.DropTable(
                name: "ConversationEvents");

            migrationBuilder.DropTable(
                name: "Messages");

            migrationBuilder.DropTable(
                name: "Npcs");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Choices",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    A = table.Column<string>(type: "text", nullable: true),
                    B = table.Column<string>(type: "text", nullable: true),
                    PlayerId = table.Column<string>(type: "text", nullable: false),
                    Round = table.Column<int>(type: "integer", nullable: false),
                    SessionId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Choices", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ConversationEvents",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<long>(type: "bigint", nullable: false),
                    GameId = table.Column<string>(type: "text", nullable: false),
                    IsQuestion = table.Column<bool>(type: "boolean", nullable: false),
                    Phase = table.Column<string>(type: "text", nullable: false),
                    PlayerId = table.Column<string>(type: "text", nullable: true),
                    Round = table.Column<int>(type: "integer", nullable: false),
                    Sequence = table.Column<long>(type: "bigint", nullable: false),
                    SessionId = table.Column<string>(type: "text", nullable: false),
                    SpeakerNpcId = table.Column<string>(type: "text", nullable: true),
                    TargetNpcId = table.Column<string>(type: "text", nullable: true),
                    Text = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConversationEvents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Messages",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    At = table.Column<long>(type: "bigint", nullable: false),
                    Emotion = table.Column<string>(type: "text", nullable: true),
                    InReplyTo = table.Column<string>(type: "text", nullable: true),
                    IsQuestion = table.Column<bool>(type: "boolean", nullable: false),
                    NpcId = table.Column<string>(type: "text", nullable: false),
                    PlayerId = table.Column<string>(type: "text", nullable: false),
                    SessionId = table.Column<string>(type: "text", nullable: false),
                    Text = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Messages", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Npcs",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    Color = table.Column<string>(type: "text", nullable: false),
                    Lore = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Number = table.Column<int>(type: "integer", nullable: false),
                    Persona = table.Column<string>(type: "text", nullable: false),
                    RelatedNumber = table.Column<int>(type: "integer", nullable: false),
                    Role = table.Column<string>(type: "text", nullable: false),
                    SessionId = table.Column<string>(type: "text", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Npcs", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Choices_SessionId_PlayerId_Round",
                table: "Choices",
                columns: new[] { "SessionId", "PlayerId", "Round" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConversationEvents_GameId_Sequence",
                table: "ConversationEvents",
                columns: new[] { "GameId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConversationEvents_SessionId",
                table: "ConversationEvents",
                column: "SessionId");

            migrationBuilder.CreateIndex(
                name: "IX_Messages_SessionId_At",
                table: "Messages",
                columns: new[] { "SessionId", "At" });

            migrationBuilder.CreateIndex(
                name: "IX_Npcs_SessionId_Number",
                table: "Npcs",
                columns: new[] { "SessionId", "Number" },
                unique: true);
        }
    }
}
