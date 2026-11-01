using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace Backend;

public sealed record RegisterRequest(string Login, string Password, string Name, AvatarData? Avatar = null);
public sealed record LoginRequest(string Login, string Password);

public sealed class JwtAuthService(IConfiguration config)
{
    private const string DefaultSecret = "talk-to-everyone-super-secret-jwt-key-2026-min-32-bytes";
    public const string Issuer = "talk-to-everyone";
    public const string Audience = "talk-to-everyone";

    public SymmetricSecurityKey SecurityKey
    {
        get
        {
            var raw = Environment.GetEnvironmentVariable("JWT_SECRET")
                ?? config["JWT_SECRET"]
                ?? config["Jwt:Secret"]
                ?? DefaultSecret;
            if (Encoding.UTF8.GetByteCount(raw) < 32)
            {
                raw = raw.PadRight(32, '_');
            }
            return new SymmetricSecurityKey(Encoding.UTF8.GetBytes(raw));
        }
    }

    public string CreateToken(UserAccount user)
    {
        var claims = new[]
        {
            new Claim(JwtRegisteredClaimNames.Sub, user.Id),
            new Claim(ClaimTypes.NameIdentifier, user.Id),
            new Claim(JwtRegisteredClaimNames.UniqueName, user.Login),
            new Claim(ClaimTypes.Name, user.Name),
            new Claim("name", user.Name),
            new Claim("login", user.Login)
        };

        var credentials = new SigningCredentials(SecurityKey, SecurityAlgorithms.HmacSha256);
        var token = new JwtSecurityToken(
            issuer: Issuer,
            audience: Audience,
            claims: claims,
            expires: DateTime.UtcNow.AddDays(7),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public static string HashPassword(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            iterations: 100_000,
            hashAlgorithm: HashAlgorithmName.SHA256,
            outputLength: 32);
        return $"{Convert.ToBase64String(salt)}:{Convert.ToBase64String(hash)}";
    }

    public static bool VerifyPassword(string password, string storedHash)
    {
        var parts = (storedHash ?? "").Split(':', 2);
        if (parts.Length != 2) return false;
        try
        {
            var salt = Convert.FromBase64String(parts[0]);
            var expected = Convert.FromBase64String(parts[1]);
            var actual = Rfc2898DeriveBytes.Pbkdf2(
                Encoding.UTF8.GetBytes(password),
                salt,
                iterations: 100_000,
                hashAlgorithm: HashAlgorithmName.SHA256,
                outputLength: expected.Length);
            return CryptographicOperations.FixedTimeEquals(actual, expected);
        }
        catch
        {
            return false;
        }
    }
}
