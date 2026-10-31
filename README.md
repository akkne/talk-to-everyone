# Угадай друзей

Браузерная игра: 10 NPC, три настоящие пары, четыре актёра. React/Three.js — `frontend/`, игровой ASP.NET Core/SignalR/PostgreSQL API — `backend/Backend.csproj`.

- [Запуск бэкенда](backend/README.md)
- [Контракт фронта и бэка](backend/docs/backend.md)
- [Роадмап бэкенда](backend/docs/roadmap.md)
- [Текущая интеграция](docs/integration.md)
- [Прототип Ollama](backend/docs/ollama-integration.md) — отдельный проект `backend/TalkToEveryone.Api/`; текущий `docker-compose.yml` запускает его, а не игровой SignalR API.

Фронтенд подключён к контракту SignalR v2. Схема обмена и запуск описаны в [документации интеграции](docs/integration.md).
