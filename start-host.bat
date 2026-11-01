@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Talk To Everyone — LAN Host (Radmin VPN / Hamachi + Ollama)

echo ========================================================
echo   УГАДАЙ ДРУЗЕЙ — ЗАПУСК ХОСТА (LAN / Radmin / Hamachi)
echo ========================================================
echo.

:: Разрешаем Ollama принимать локальные/докер запросы и удерживать модель в памяти
set OLLAMA_HOST=0.0.0.0:11434
set OLLAMA_KEEP_ALIVE=-1
set OLLAMA_NUM_PARALLEL=2

:: Открываем порты 5173 и 5000 в брандмауэре Windows (если запущено от Администратора)
netsh advfirewall firewall show rule name="TalkToEveryone-LAN" >nul 2>&1
if errorlevel 1 (
    netsh advfirewall firewall add rule name="TalkToEveryone-LAN" dir=in action=allow protocol=TCP localport=5173,5000 >nul 2>&1
)

echo Ваши IP-адреса в сети (отправьте друзьям адрес Radmin VPN 26.x.x.x или Hamachi 25.x.x.x):
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
    set ip=%%a
    set ip=!ip: =!
    echo   -^> http://!ip!:5173
)
echo.
echo Код комнаты создается автоматически после нажатия "Создать лобби".
echo Передайте друзьям код из лобби.
echo ========================================================
echo.

where dotnet >nul 2>&1
set HAS_DOTNET=%errorlevel%
where npm >nul 2>&1
set HAS_NPM=%errorlevel%
where docker >nul 2>&1
set HAS_DOCKER=%errorlevel%

if %HAS_DOTNET% equ 0 if %HAS_NPM% equ 0 (
    if %HAS_DOCKER% equ 0 (
        echo [0/2] Проверка/запуск баз данных PostgreSQL и Redis в Docker...
        docker compose up -d postgres redis
    )
    echo [1/2] Запуск игрового сервера Backend ^(порт 5000^)...
    set ASPNETCORE_URLS=http://0.0.0.0:5000
    set OLLAMA_BASE_URL=http://localhost:11434
    start "TalkToEveryone Backend" cmd /k "cd /d "%~dp0backend" && dotnet run --project Backend.csproj"

    echo [2/2] Запуск фронтенда Vite на 0.0.0.0:5173...
    start "TalkToEveryone Frontend" cmd /k "cd /d "%~dp0frontend" && npm install && npm run dev -- --host 0.0.0.0"
) else (
    if %HAS_DOCKER% equ 0 (
        echo Запуск всех сервисов ^(PostgreSQL + Redis + Backend + Frontend^) через Docker Compose...
        docker compose up --build
    ) else (
        echo [ОШИБКА] На этом компьютере не найдены ни Docker, ни .NET SDK / Node.js.
        echo Запускайте start-host.bat на компьютере-хосте, где установлены Docker или .NET 10 + Node.js + Ollama.
    )
)

pause
