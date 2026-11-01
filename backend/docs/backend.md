# Контракт API v2

Один SignalR hub `/hubs/game`, WebSocket, JSON `camelCase`. Первый вызов каждого соединения — `Auth {token,name}`. `token` — случайный код лобби от 1111 до 9999; JWT авторизует пользователя. После `AuthOk {playerId,sessionId,role}` сервер отправляет полный `StateSnapshot`; до него команды запрещены. При reconnect клиент повторяет `Auth` и заменяет локальное состояние снимком. Время — UTC Unix ms, углы — радианы, координаты — метры (Y вверх). ID — строки, номера NPC — 1–10.

## Снимок

`StateSnapshot = {sessionId,me:{id,role},phase,round,rounds,gameInfo,scene,players,npcs,seats,board,questions,chat,worldSizeBytes,score,scoreboard,reveal,teamScore,voting}`. В лобби `round=null`; до финала `scoreboard` и `reveal` равны `null`. `round={n,phase,endsAt,choiceEndsAt}`; `rounds` содержит серверные названия и длительности этапов. `npcs` содержит `{id,number,name,color,anchorId,appearance}`; имя и `appearance={style,accessory,hair,skin}` — публичные данные персонажа, без роли и связей. `board={pairs,liars,locks,notes,submitted}` и `questions={remaining,askedTo,pending}` персональные. `chat` содержит серверные `{id,npc,text,inReplyTo,emotion,at}`. Роли, связи и легенды не выдаются до финала.

`scene={version,room,npcStands,playerSeats,spawnPoints}`. `players` содержит `{id,name,connected,pose}`; `pose={position,yaw,pitch,mode,seatId,seq,jumpOffset}`. `seats={id,occupiedBy}[]`. Клиент строит сцену по `scene` и отображает только подтверждённые сервером изменения.

`Space` запускает одиночный прыжок с подъёмом до 0,823 м за 0,686 с и мягким приземлением. `position` остаётся точкой на поверхности навигации; `jumpOffset` — отдельная высота анимации камеры и модели, поэтому прыжок сохраняет проверки коллизий и не позволяет обходить мебель или края платформ. Сервер принимает конечный `jumpOffset` от 0 до 0,83 м, сидя — только 0, и передаёт его в `PlayersTick`. Если поле отсутствует, используется 0 для совместимости со старыми клиентами. Анимация модели включает подъём рук, поджатие ног и смягчение приземления. Удержание пробела не повторяет прыжок; сидя и при открытом интерфейсе новые прыжки отключены.

`POST /api/lobbies` создаёт лобби, `GET /api/lobbies` возвращает активные комнаты, `GET /api/maps` — файловый каталог карт. Лобби удаляется после выхода последнего игрока; не занятые комнаты очищаются через 30 секунд. `SelectMap "hangar" | "club"` доступен ведущему до старта. Club выбирается, но пока не запускается. Геометрия Hangar хранится в `Maps/hangar.json`, сведения о картах — в `Maps/catalog.json`.

Публичный `GET /api/game-info` возвращает тот же `gameInfo`, что и снимок: численность состава, раунды, лимиты вопросов и заметок, очки за выбор пары.

## Команды и события

| Клиент → сервер | Ответ сервера |
| --- | --- |
| `Auth {token,name}` | `AuthOk` → `StateSnapshot` → `LobbyState` или `AuthErr` |
| `StartGame` без аргумента, только ведущий | `GameStarted`, `RoundStarted` |
| `SkipRound {requestId}`, только ведущий во время игры | Текущий таймер завершается; `RoundStarted` обновляет срок, затем штатный переход раунда или голосования |
| `SendPose {seq,position,yaw,pitch,jumpOffset?}` | `PlayersTick {players,serverTime}` или `ActionReject` |
| `SitDown {requestId,seatId}`, `StandUp {requestId}` | `SeatState`, `PlayersTick` или `ActionReject` |
| `RequestChunk {reqId,ids}`, `ReleaseChunk {ids}` | `ChunkData {reqId,npcs:[{id,details,sizeBytes}]}`; детали публичные |
| `PairNpcs`, `UnpairNpcs` с `{requestId,a,b}`; `MarkLiar`, `UnmarkLiar` с `{requestId,npc}`; `SaveNote {requestId,npc,text}` | Личный `BoardSnapshot {board,requestId}` или `BoardReject` |
| `SubmitPair {requestId,round,stage,a,b}` | `VotingState` или `BoardReject` |
| `AskQuestion {requestId,targetNpc,text}` | `QuestionOk` → `NpcThinking` → `QuestionState` и `NpcSay` или `QuestionFailed`; отказ — `QuestionReject` |
| `Ping {t}` | `Pong {t,serverTime}` |

После ответа `QuestionState {questions}` сбрасывает `pending` у автора вопроса. Сервер ведёт раунды 1–5, после 2/4/5 открывает общее голосование `choice`, затем выдаёт `GameEnded {reveal,scoreboard,npcs}` и `ScoreUpdate`. В `GameEnded` и финальном `StateSnapshot` список `npcs` содержит также выбывших участников, чтобы показать все роли и пары; до финала они скрыты. Вопросы разрешены только в раунде 4: два разным NPC, до 300 символов. Заметка — до 200 символов, три пары и четыре актёра на доске. Детали NPC не содержат секретов; клиент держит максимум один chunk и 10% `worldSizeBytes`.

Ошибки содержат стабильные `code` и русское `message`. `requestId` связывает команду с ответом; повтор успешной команды обрабатывается без повторного изменения. Точные коллизии мебели ещё не завершены; см. [роадмап](roadmap.md).


## Общее голосование и выбывание

`VotingState={round,stage,candidates,eligible,submitted,received,total,endsAt}` персонализирован: чужие голоса не раскрываются. В первом туре доступны все неупорядоченные пары активных NPC. Каждый подключённый к началу голосования судья получает один голос; новый участник ждёт следующего голосования, переподключившийся сохраняет право голоса и свой ответ. Текущий список жюри фиксируется до конца обоих туров.

Когда все проголосовали либо истёк `GAME_CHOICE_SECONDS`, совпавший выбор принимается. Если предложены разные пары, начинается ровно один повторный тур (`stage=2`) только с этими парами. Во втором туре выигрывает большинство; при равенстве случайно выбирается одна из пар с максимальным числом голосов. Если голосов нет, случайно выбирается пара из доступных в текущем туре. Пропуска голоса отдельной командой нет; отсутствие ответа учитывается по таймеру.

`SubmitPair` проверяет раунд, тур, дедлайн, право голоса и наличие пары среди кандидатов. Повторная доставка с тем же `requestId` возвращает актуальное `VotingState`, повторный голос с новым ID отклоняется.

`NpcsRemoved={ids,teamScore}` удаляет обоих NPC у всех клиентов. Сервер очищает их сообщения, вопросы, заметки, пары, метки и старые выборы из всех личных досок. Удалённые NPC недоступны для новых вопросов, заметок, деталей и голосования; запоздавшие ответы LLM не возвращают их в чат. Снимок при переподключении содержит только оставшихся участников и текущее голосование.

Общие очки: настоящая пара +300/+200/+100 после раундов 2/4/5; друг + актёр −100; два актёра −150; два друга из разных пар 0. Личные пометки об актёрах не меняют счёт. `teamScore` — единый счёт; `score`/`ScoreUpdate` сохраняют совместимость, всем игрокам выдают одинаковое значение. Итоговое раскрытие показывает только оставшихся NPC.
