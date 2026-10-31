# Бэкенд

Игровой API находится в `Backend.csproj`. Папки по назначению: `Domain/` — модели, `Persistence/` — EF Core, `Realtime/` — SignalR, `Services/` — игровые правила и LLM, `Migrations/` — схема БД. Отдельный проект `TalkToEveryone.Api/` содержит прототип интеграции Ollama; он пока не подключён к игровому SignalR API.

Нужны .NET 10 и PostgreSQL. Пример запуска:

```bash
export DATABASE_URL='Host=localhost;Database=game;Username=game;Password=...'
export GAME_TOKENS='leader:<токен-от-16-символов>,judge:<другой-токен-от-16-символов>'
export GAME_ORIGINS='http://localhost:5173'
dotnet run --project backend/Backend.csproj
```

Сервер применяет миграции при запуске. Проверки: `/health`, `/health/db`, авторизованный `/health/ollama`. Hub: `/hubs/game`. Docker Compose запускает Ollama и скачивает модель автоматически. При ручном запуске задайте `OLLAMA_BASE_URL` и `OLLAMA_MODEL` либо используйте локальную Ollama на `localhost:11434` с моделью `qwen2.5:3b-instruct`. Для облачной модели задайте `LLM_ENDPOINT` (полный URL OpenAI-compatible chat completions), `LLM_MODEL`, `LLM_API_KEY`. Если модель недоступна, вопрос возвращает `QuestionFailed`, а реплики раунда не подменяются шаблонным текстом. Длительность раунда и окна выбора: `GAME_ROUND_SECONDS`, `GAME_CHOICE_SECONDS`.

[Контракт](docs/backend.md) · [Роадмап](docs/roadmap.md)


### База участников JSON

Файл `Data/bots_database_v2.json` содержит переданные 20 пар и 40 актёров. Для собственной базы укажите `GAME_NPC_DATABASE` — абсолютный путь к JSON в том же формате. Файл читается при создании состава и при старте матча; сервер выбирает 3 целые пары и 4 актёра без повторов, перемешивает места и подставляет выбранную цель в шаблон каждого актёра. Секретные роли, истории и промпты остаются на сервере.

Для добавления NPC дополните массив `pairs` объектом с `pair_id`, `shared_lore` (`meeting`, `secret_fact`, `material_link`, `inside_meme`) и `bot_1`/`bot_2` (`id`, `name`, `role`, `vibe`, `system_prompt`); либо `actors` объектом с `actor_id` и `bot` (`id`, `name`, `role`, `archetype`, `defense_strategy`, `prompt_template`). Идентификаторы ботов должны быть уникальны во всей базе. В шаблоне актёра используется `[ИМЯ_ЦЕЛИ]`. Счётчики `total_pairs` и `total_actors` информационные: состав определяется по массивам. При неверном JSON или нехватке участников старт завершается ошибкой до изменения состава.

Миграция `TeamVoting` добавляет сохранение голосования и выбывших участников. Она применяется при обычном запуске API. Существующий матч сохраняет свой состав; JSON используется для нового матча.
