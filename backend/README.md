# Бэкенд

Один ASP.NET Core-проект без модулей по фичам. Папки по назначению: `Domain/` — модели, `Persistence/` — EF Core, `Realtime/` — SignalR, `Services/` — игровые правила и LLM, `Migrations/` — схема БД.

Нужны .NET 10 и PostgreSQL. Пример запуска:

```bash
export DATABASE_URL='Host=localhost;Database=game;Username=game;Password=...'
export GAME_TOKENS='leader:<токен-от-16-символов>,judge:<другой-токен-от-16-символов>'
export GAME_ORIGINS='http://localhost:5173'
dotnet run --project backend/Backend.csproj
```

Сервер применяет миграции при запуске. Проверки: `/health`, `/health/db`. Hub: `/hubs/game`. Для облачной модели задайте `LLM_ENDPOINT` (полный URL OpenAI-compatible chat completions), `LLM_MODEL`, `LLM_API_KEY`; без них NPC дают тестовый ответ. Длительность раунда и окна выбора: `GAME_ROUND_SECONDS`, `GAME_CHOICE_SECONDS`.

[Контракт](docs/backend.md) · [Роадмап](docs/roadmap.md)
