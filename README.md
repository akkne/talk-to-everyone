# Угадай друзей (LAN Multiplayer — Radmin VPN / Hamachi + Ollama / HTTPS Docker)

Браузерная мультиплеерная игра социальной дедукции: 10 ИИ-участников на трибуне (3 настоящие пары друзей и 4 актёра-самозванца) и команда живых судей (до 8 игроков в комнате).

- [Запуск бэкенда](backend/README.md)
- [Контракт фронта и бэка](backend/docs/backend.md)
- [Роадмап бэкенда](backend/docs/roadmap.md)
- [Текущая интеграция](docs/integration.md)
- [Прототип Ollama](backend/docs/ollama-integration.md)
- [Эмоции NPC, этапы реализации и тесты](docs/npc-emotions.md)

Фронтенд подключён к контракту SignalR v2. Схема обмена и запуск описаны в [документации интеграции](docs/integration.md).

## Как запустить игру по LAN (Radmin VPN / Hamachi)

### На компьютере-хосте

1. Запустите [`start-host.bat`](start-host.bat) (или выполните `docker compose up --build` в папке проекта). Docker Compose запустит Ollama и скачает модель `qwen2.5:3b-instruct` при первом запуске; дождитесь окончания загрузки.
   - Если запускаете вручную без Docker:
     - Запустите Ollama и скачайте модель: `ollama pull qwen2.5:3b-instruct`.
     - Терминал 1 (Backend): `cd backend && dotnet run --project Backend.csproj` (слушает `0.0.0.0:5000`, подключается к `http://localhost:11434`).
     - Терминал 2 (Frontend): `cd frontend && npm install && npm run dev -- --host 0.0.0.0` (слушает `0.0.0.0:5173` и проксирует `/hubs`, `/api`, `/health` на бэкенд).
2. Откройте в браузере `http://localhost:5173` (или `https://localhost` при запуске через Caddy), зарегистрируйтесь или войдите в аккаунт и нажмите **«Создать лобби (Хост)»**.
3. В открывшемся лобби вы увидите готовые ссылки для друзей (`Radmin VPN: http://26.x.x.x:5173` / `Hamachi: http://25.x.x.x:5173`) и **Код комнаты** (`1234` по умолчанию).

### У друзей (клиентов в Radmin VPN / Hamachi)

1. Подключитесь к одной сети Radmin VPN или Hamachi с хостом.
2. Откройте в браузере ссылку хоста: `http://<IP_ХОСТА_В_RADMIN_ИЛИ_HAMACHI>:5173`.
3. Зарегистрируйтесь или войдите по логину и паролю, введите код комнаты (`1234`) и нажмите **«Присоединиться к команде»**.
4. Когда все зашли в комнату, хост нажимает **«Начать игру»**.

## Запуск через Docker Compose с HTTPS (Caddy)

1. Скопируйте `.env.example` в `.env`. При необходимости задайте `POSTGRES_PASSWORD`, `JWT_SECRET` и `CADDY_DOMAIN`.
2. Запустите `docker compose up --build -d`, дождитесь загрузки модели и откройте `https://localhost` (через Caddy) или `http://localhost:5173` (dev-сервер Vite для LAN). Проверить наличие модели можно в лобби или через авторизованный `/health/ollama`.
3. Конфигурация [Caddy](frontend/Caddyfile) включается в Docker образ при сборке и проксирует `/api/*`, `/hubs/*`, `/health` и `/health/db` на игровой API, включая WebSocket.
