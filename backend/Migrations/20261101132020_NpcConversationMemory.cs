using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class NpcConversationMemory : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "GameId",
                table: "Sessions",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<long>(
                name: "NextDialogueSequence",
                table: "Sessions",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.Sql("UPDATE \"Sessions\" SET \"GameId\" = \"Id\" WHERE \"GameId\" = '';");

            migrationBuilder.CreateTable(
                name: "ConversationEvents",
                columns: table => new
                {
                    Id = table.Column<string>(type: "text", nullable: false),
                    SessionId = table.Column<string>(type: "text", nullable: false),
                    GameId = table.Column<string>(type: "text", nullable: false),
                    Sequence = table.Column<long>(type: "bigint", nullable: false),
                    Round = table.Column<int>(type: "integer", nullable: false),
                    Phase = table.Column<string>(type: "text", nullable: false),
                    IsQuestion = table.Column<bool>(type: "boolean", nullable: false),
                    SpeakerNpcId = table.Column<string>(type: "text", nullable: true),
                    TargetNpcId = table.Column<string>(type: "text", nullable: true),
                    PlayerId = table.Column<string>(type: "text", nullable: true),
                    Text = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<long>(type: "bigint", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConversationEvents", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ConversationEvents_GameId_Sequence",
                table: "ConversationEvents",
                columns: new[] { "GameId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ConversationEvents_SessionId",
                table: "ConversationEvents",
                column: "SessionId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ConversationEvents");

            migrationBuilder.DropColumn(
                name: "GameId",
                table: "Sessions");

            migrationBuilder.DropColumn(
                name: "NextDialogueSequence",
                table: "Sessions");
        }
    }
}
