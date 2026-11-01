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
2. При запуске через Docker откройте `https://localhost`; при ручном запуске без Caddy — `http://localhost:5173`. Зарегистрируйтесь или войдите в аккаунт и нажмите **«Создать лобби (Хост)»**.
3. При запуске через Docker в лобби появится HTTPS-ссылка с адресом из `CADDY_DOMAIN` и **Код комнаты** (`1234` по умолчанию).

### У друзей (клиентов в Radmin VPN / Hamachi)

1. Подключитесь к одной сети Radmin VPN или Hamachi с хостом.
2. При запуске хоста через Docker откройте его HTTPS-ссылку из лобби; при ручном запуске без Caddy — `http://<IP_ХОСТА_В_RADMIN_ИЛИ_HAMACHI>:5173`.
3. Зарегистрируйтесь или войдите по логину и паролю, введите код комнаты (`1234`) и нажмите **«Присоединиться к команде»**.
4. Когда все зашли в комнату, хост нажимает **«Начать игру»**.

## Запуск через Docker Compose с HTTPS (Caddy)

1. Скопируйте `.env.example` в `.env`. Задайте `CADDY_DOMAIN` равным LAN/VPN IP компьютера-хоста (например, `172.16.219.96`) или его DNS-имени. При необходимости задайте `POSTGRES_PASSWORD` и `JWT_SECRET`.
2. Запустите `docker compose up --build -d`, дождитесь загрузки модели и откройте `https://localhost` на хосте. Друзьям отправьте HTTPS-ссылку из лобби или `https://<CADDY_DOMAIN>`. Если IP хоста изменится, обновите `.env` и перезапустите Caddy и бэкенд. Проверить наличие модели можно в лобби или через авторизованный `/health/ollama`.
3. Конфигурация [Caddy](frontend/Caddyfile) включается в Docker образ при сборке и проксирует `/api/*`, `/hubs/*`, `/health` и `/health/db` на игровой API, включая WebSocket.
4. Caddy выпускает сертификат своей локальной CA. На каждом компьютере игрока добавьте её корневой сертификат в доверенные корневые центры; получить файл можно командой `docker cp talk-to-everyone-caddy-1:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt`. Передавайте только `root.crt`, никогда не передавайте `root.key`. Если нужен публично доверенный сертификат для DNS-имени, замените `tls internal` в Caddyfile на автоматическую выдачу и обеспечьте доступность портов 80/443 извне.
