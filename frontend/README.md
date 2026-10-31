# Фронтенд

React/Three.js-клиент. Запуск: `npm ci && npm run dev`. Требуется работающий бэкенд и токен из `GAME_TOKENS`; `BACKEND_URL` в `.env` задаёт адрес для Vite proxy. Состав и правила загружаются из `GET /api/game-info`, состояние игры — из SignalR API v2. Тестовая сцена движения находится только в `tests/fixtures` и не попадает в сборку. [Схема интеграции](../docs/integration.md).
