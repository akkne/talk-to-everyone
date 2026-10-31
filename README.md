# Угадай друзей

Браузерная игра: 10 NPC, три настоящие пары, четыре актёра. React/Three.js — `frontend/`, игровой ASP.NET Core/SignalR/PostgreSQL API — `backend/Backend.csproj`.

- [Запуск бэкенда](backend/README.md)
- [Контракт фронта и бэка](backend/docs/backend.md)
- [Роадмап бэкенда](backend/docs/roadmap.md)
- [Текущая интеграция](docs/integration.md)
- [Прототип Ollama](backend/docs/ollama-integration.md) — отдельный проект `backend/TalkToEveryone.Api/`; игровой SignalR API запускается через Docker Compose.

Фронтенд подключён к контракту SignalR v2. Схема обмена и запуск описаны в [документации интеграции](docs/integration.md).

## Запуск через Docker Compose с HTTPS

1. Скопируйте `.env.example` в `.env`. Замените пароль PostgreSQL и оба токена `GAME_TOKENS` на уникальные значения не короче 16 символов.
2. Для публичного сервера задайте `CADDY_DOMAIN` равным DNS имени, указывающему на сервер, и откройте входящие порты 80 и 443. Для локального запуска оставьте `localhost`.
3. Запустите `docker compose up --build -d` и откройте `https://localhost` или `https://<CADDY_DOMAIN>`. Токены из `.env` введите в форме входа.

Caddy обслуживает собранный фронтенд и проксирует `/api/*`, `/hubs/*`, `/health` и `/health/db` на игровой API, включая WebSocket. HTTP перенаправляется на HTTPS. Сертификаты и ключи Caddy сохраняются в томе `caddy_data`. Для `localhost` Caddy выдаёт сертификат собственного центра сертификации: браузер предупредит о недоверенном сертификате, пока корневой сертификат из тома (`/data/caddy/pki/authorities/local/root.crt`) не добавлен в хранилище доверенных сертификатов клиента. Для публичного DNS имени Caddy получает сертификат автоматически.

PostgreSQL и игровой API доступны только внутри сети Compose. Опциональный сервер Ollama запускается командой `docker compose --profile ollama up -d`; игровой API сейчас использует отдельный OpenAI совместимый endpoint из `LLM_ENDPOINT`, `LLM_MODEL` и `LLM_API_KEY`, а не Ollama напрямую. Без этих переменных игра запускается, но вопросы NPC возвращают ошибку.
