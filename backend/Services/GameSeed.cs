using Microsoft.EntityFrameworkCore;

namespace Backend;

public static class GameSeed
{
    public static async Task EnsureAsync(GameDb db)
    {
        // A server restart drops every live connection; abandoned rooms must not reappear.
        foreach (var sessionId in await db.Sessions.Select(s => s.Id).ToListAsync())
            await LobbyDirectory.Delete(db, sessionId);

        await EnsureAvatarAssetsAsync(db);
    }

    public static async Task EnsureAvatarAssetsAsync(GameDb db)
    {
        if (await db.AvatarAssets.AnyAsync()) return;

        var defaultAssets = new List<AvatarAsset>
        {
            // Body Colors
            new() { Id = "body_yellow", Category = "bodyColor", Name = "Классический горчичный", Value = "#dfbf63", SortOrder = 1 },
            new() { Id = "body_blue", Category = "bodyColor", Name = "Неоновый синий", Value = "#3b82f6", SortOrder = 2 },
            new() { Id = "body_emerald", Category = "bodyColor", Name = "Изумрудный зелёный", Value = "#10b981", SortOrder = 3 },
            new() { Id = "body_crimson", Category = "bodyColor", Name = "Алый рубиновый", Value = "#ef4444", SortOrder = 4 },
            new() { Id = "body_purple", Category = "bodyColor", Name = "Фиолетовый индиго", Value = "#8b5cf6", SortOrder = 5 },
            new() { Id = "body_orange", Category = "bodyColor", Name = "Мандариновый оранжевый", Value = "#f97316", SortOrder = 6 },
            new() { Id = "body_pink", Category = "bodyColor", Name = "Неоновый розовый", Value = "#ec4899", SortOrder = 7 },
            new() { Id = "body_cyan", Category = "bodyColor", Name = "Кибер-бирюзовый", Value = "#06b6d4", SortOrder = 8 },
            new() { Id = "body_graphite", Category = "bodyColor", Name = "Тёмный графит", Value = "#334155", SortOrder = 9 },
            new() { Id = "body_white", Category = "bodyColor", Name = "Белоснежный", Value = "#f1f5f9", SortOrder = 10 },

            // Hairstyles
            new() { Id = "hair_short", Category = "hairStyle", Name = "Короткая классика", Value = "short", SortOrder = 1 },
            new() { Id = "hair_spiky", Category = "hairStyle", Name = "Ирокез / Взъерошенные", Value = "spiky", SortOrder = 2 },
            new() { Id = "hair_bob", Category = "hairStyle", Name = "Каре / Удлинённая", Value = "bob", SortOrder = 3 },
            new() { Id = "hair_bun", Category = "hairStyle", Name = "Пучок / Топ-кнот", Value = "bun", SortOrder = 4 },
            new() { Id = "hair_afro", Category = "hairStyle", Name = "Пышная / Афро", Value = "afro", SortOrder = 5 },
            new() { Id = "hair_bald", Category = "hairStyle", Name = "Без волос", Value = "bald", SortOrder = 6 },

            // Hair Colors
            new() { Id = "haircol_dark", Category = "hairColor", Name = "Тёмный брюнет", Value = "#241f25", SortOrder = 1 },
            new() { Id = "haircol_brown", Category = "hairColor", Name = "Каштановый", Value = "#6a4937", SortOrder = 2 },
            new() { Id = "haircol_blonde", Category = "hairColor", Name = "Светлый блонд", Value = "#e2ba7d", SortOrder = 3 },
            new() { Id = "haircol_ginger", Category = "hairColor", Name = "Огненно-рыжий", Value = "#b84c24", SortOrder = 4 },
            new() { Id = "haircol_blue", Category = "hairColor", Name = "Электро-синий", Value = "#2563eb", SortOrder = 5 },
            new() { Id = "haircol_pink", Category = "hairColor", Name = "Ярко-розовый", Value = "#ec4899", SortOrder = 6 },
            new() { Id = "haircol_purple", Category = "hairColor", Name = "Лавандовый", Value = "#8b5cf6", SortOrder = 7 },

            // Eyes
            new() { Id = "eyes_dots", Category = "eyes", Name = "Точки (Классика)", Value = "dots", SortOrder = 1 },
            new() { Id = "eyes_wide", Category = "eyes", Name = "Большие выразительные", Value = "wide", SortOrder = 2 },
            new() { Id = "eyes_focused", Category = "eyes", Name = "Прищур / Внимательные", Value = "focused", SortOrder = 3 },
            new() { Id = "eyes_wink", Category = "eyes", Name = "Подмигивание", Value = "wink", SortOrder = 4 },
            new() { Id = "eyes_visor", Category = "eyes", Name = "Кибер-визор", Value = "visor", SortOrder = 5 },

            // Mouths
            new() { Id = "mouth_smile", Category = "mouth", Name = "Приветливая улыбка", Value = "smile", SortOrder = 1 },
            new() { Id = "mouth_neutral", Category = "mouth", Name = "Сдержанная линия", Value = "neutral", SortOrder = 2 },
            new() { Id = "mouth_grin", Category = "mouth", Name = "Широкий оскал", Value = "grin", SortOrder = 3 },
            new() { Id = "mouth_surprised", Category = "mouth", Name = "Удивление (круглый)", Value = "surprised", SortOrder = 4 },
            new() { Id = "mouth_smirk", Category = "mouth", Name = "Хитрая ухмылка", Value = "smirk", SortOrder = 5 },

            // Skin Tones
            new() { Id = "skin_light", Category = "skinTone", Name = "Светлый тёплый", Value = "#e9bd9e", SortOrder = 1 },
            new() { Id = "skin_olive", Category = "skinTone", Name = "Смуглый оливковый", Value = "#c78f6c", SortOrder = 2 },
            new() { Id = "skin_fair", Category = "skinTone", Name = "Фарфоровый", Value = "#f0cfb4", SortOrder = 3 },
            new() { Id = "skin_bronze", Category = "skinTone", Name = "Глубокий бронзовый", Value = "#ad7659", SortOrder = 4 },
            new() { Id = "skin_peach", Category = "skinTone", Name = "Золотистый персик", Value = "#dca984", SortOrder = 5 },

            // Accessories
            new() { Id = "acc_none", Category = "accessory", Name = "Без аксессуара", Value = "none", SortOrder = 1 },
            new() { Id = "acc_headphones", Category = "accessory", Name = "Студийные наушники", Value = "headphones", SortOrder = 2 },
            new() { Id = "acc_glasses", Category = "accessory", Name = "Очки в оправе", Value = "glasses", SortOrder = 3 },
            new() { Id = "acc_cap", Category = "accessory", Name = "Кепка", Value = "cap", SortOrder = 4 },
            new() { Id = "acc_beanie", Category = "accessory", Name = "Шапка-бини", Value = "beanie", SortOrder = 5 }
        };

        db.AvatarAssets.AddRange(defaultAssets);
        await db.SaveChangesAsync();
    }
}
