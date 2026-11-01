using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class MultiLobbyMaps : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Players_TokenHash",
                table: "Players");

            migrationBuilder.AddColumn<string>(
                name: "MapId",
                table: "Sessions",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "RoomCode",
                table: "Sessions",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "IX_Sessions_RoomCode",
                table: "Sessions",
                column: "RoomCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Players_SessionId_TokenHash",
                table: "Players",
                columns: new[] { "SessionId", "TokenHash" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_Sessions_RoomCode",
                table: "Sessions");

            migrationBuilder.DropIndex(
                name: "IX_Players_SessionId_TokenHash",
                table: "Players");

            migrationBuilder.DropColumn(
                name: "MapId",
                table: "Sessions");

            migrationBuilder.DropColumn(
                name: "RoomCode",
                table: "Sessions");

            migrationBuilder.CreateIndex(
                name: "IX_Players_TokenHash",
                table: "Players",
                column: "TokenHash",
                unique: true);
        }
    }
}
