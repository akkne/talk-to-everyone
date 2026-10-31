using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable
namespace Backend.Migrations;
public partial class TeamVoting : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.AddColumn<string>(
        name: "VotingJson", table: "Sessions", type: "text", nullable: false, defaultValue: "{}");
    protected override void Down(MigrationBuilder migrationBuilder) => migrationBuilder.DropColumn(name: "VotingJson", table: "Sessions");
}
