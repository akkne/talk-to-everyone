# Контракт API v2

Один SignalR hub `/hubs/game`, WebSocket, JSON `camelCase`. Первый вызов каждого соединения — `Auth {token,name}`. Токен задаётся серверу через `GAME_TOKENS`, не передаётся в URL. После `AuthOk {playerId,sessionId,role}` сервер отправляет полный `StateSnapshot`; до него команды запрещены. При reconnect клиент повторяет `Auth` и заменяет локальное состояние снимком. Время — UTC Unix ms, углы — радианы, координаты — метры (Y вверх). ID — строки, номера NPC — 1–10.

## Снимок

`StateSnapshot = {sessionId,me:{id,role},phase,round,rounds,scene,players,npcs,seats,board,questions,chat,worldSizeBytes,score,scoreboard,reveal}`. В лобби `round=null`; до финала `scoreboard` и `reveal` равны `null`. `round={n,phase,endsAt,choiceEndsAt}`; `rounds` содержит серверные названия и длительности этапов. `npcs` содержит только `{id,number,color,anchorId}`. `board={pairs,liars,locks,notes,submitted}` и `questions={remaining,askedTo,pending}` персональные. `chat` содержит серверные `{id,npc,text,inReplyTo,emotion,at}`. Роли, связи и легенды не выдаются до финала.

`scene={version,room,npcStands,playerSeats,spawnPoints}`. `players` содержит `{id,name,connected,pose}`; `pose={position,yaw,pitch,mode,seatId,seq}`. `seats={id,occupiedBy}[]`. Клиент строит сцену по `scene` и отображает только подтверждённые сервером изменения.

## Команды и события

| Клиент → сервер | Ответ сервера |
| --- | --- |
| `Auth {token,name}` | `AuthOk` → `StateSnapshot` → `LobbyState` или `AuthErr` |
| `StartGame` без аргумента, только ведущий | `GameStarted`, `RoundStarted` |
| `SendPose {seq,position,yaw,pitch}` | `PlayersTick {players,serverTime}` или `ActionReject` |
| `SitDown {requestId,seatId}`, `StandUp {requestId}` | `SeatState`, `PlayersTick` или `ActionReject` |
| `RequestChunk {reqId,ids}`, `ReleaseChunk {ids}` | `ChunkData {reqId,npcs:[{id,details,sizeBytes}]}`; детали публичные |
| `PairNpcs`, `UnpairNpcs` с `{requestId,a,b}`; `MarkLiar`, `UnmarkLiar` с `{requestId,npc}`; `SaveNote {requestId,npc,text}` | Личный `BoardSnapshot {board,requestId}` или `BoardReject` |
| `SubmitPair {requestId,round,a,b}` либо `{requestId,round,skip:true}` | `BoardSnapshot`, `PairSubmitted` или `BoardReject` |
| `AskQuestion {requestId,targetNpc,text}` | `QuestionOk` → `NpcThinking` → `QuestionState` и `NpcSay` или `QuestionFailed`; отказ — `QuestionReject` |
| `Ping {t}` | `Pong {t,serverTime}` |

После ответа `QuestionState {questions}` сбрасывает `pending` у автора вопроса. Сервер сам ведёт раунды 1–4, после 2/3/4 открывает окно `choice` для одной пары, затем выдаёт `GameEnded {reveal,scoreboard}` и `ScoreUpdate`. Вопросы разрешены только в раунде 4: два разным NPC, до 300 символов. Заметка — до 200 символов, три пары и четыре актёра на доске. Детали NPC не содержат секретов; клиент держит максимум один chunk и 10% `worldSizeBytes`.

Ошибки содержат стабильные `code` и русское `message`. `requestId` связывает команду с ответом; повтор успешной команды обрабатывается без повторного изменения. Точные коллизии мебели ещё не завершены; см. [роадмап](roadmap.md).
