# API игры: целевой контракт v2

Статус: **спецификация для реализации**, не описание работающего сервера. Сейчас `backend/` без кода, а фронт использует v1 (`frontend/src/shared/{contract,types}.ts`): нет координат, ходьбы, кресел и правильной геометрии студии. Обе стороны должны перейти на v2 вместе.

Стык сервисов и порядок миграции: [интеграция v2](../../docs/integration.md).

## Транспорт и общие правила

- Один SignalR hub `/hubs/game`, WebSocket; JSON в `camelCase`. Персональные непрозрачные токены для демо задаются серверу через env (один токен ведущего, отдельный токен каждому судье) и передаются игрокам вне hub; токен в `Auth`, никогда в URL. Токен определяет `playerId` и роль, `name` — только отображаемое имя. Первый вызов после каждого подключения — `Auth`. До `AuthOk` + `StateSnapshot` остальные команды запрещены.
- Одна сессия; `playerId` постоянен при переподключении. После reconnect клиент повторяет `Auth`, заменяет локальное состояние полным `StateSnapshot`; потерянные команды не переотправляет автоматически. Hub `invoke` подтверждает доставку, игровые результаты приходят событиями.
- `NpcId`, `PlayerId`, `SeatId` — непрозрачные строки; номера NPC 1–10 — отдельное поле `number`. Время — Unix UTC, миллисекунды. Углы — радианы. Позиции — метры, ось Y вверх; X вправо, Z к зрителю, передняя стенка по −Z. `yaw=0` смотрит по −Z, положительный yaw — поворот вправо; `pitch>0` — взгляд вверх.
- Сервер владеет раундами, счётом, позами игроков, коллизиями и занятостью кресел. Клиент рисует сцену по `SceneSpec`, локально предсказывает ходьбу и исправляет её по серверному `PlayersTick`. Все изменения сессии сохраняются в PostgreSQL.

## Общие DTO

| Тип | Поля |
| --- | --- |
| `Vec3` | `{x:number,y:number,z:number}` |
| `Pose` | `{position:Vec3,yaw:number,pitch:number,mode:"walking"\|"seated",seatId:string\|null,seq:number}`; `position` — основание модели игрока; камера на высоте 1.65 м при ходьбе и 1.15 м при посадке |
| `Player` | `{id,name,connected,pose}`; `id` — `PlayerId` |
| `NpcMeta` | `{id,number,color,anchorId}`; `color` не раскрывает роль |
| `Round` | `{n,phase,endsAt,choiceEndsAt}`; `phase:"presentation"\|"gossip"\|"blindspots"\|"interrogation"\|"choice"\|"reveal"`, `choiceEndsAt:null` вне окна выбора; в `choice` `n` — завершённый раунд, `endsAt=choiceEndsAt` |
| `Board` | `{pairs:[NpcId,NpcId][],liars:NpcId[],locks:{[pairKey]:roundNumber},notes:{[npcId]:string},submitted:{[roundNumber]:[NpcId,NpcId]\|null}}`; персональная доска, `pairKey` = два id в лексикографическом порядке через `:` |
| `QuestionState` | `{remaining:number,askedTo:NpcId[],pending:boolean}`; персональный лимит |
| `ChatLine` | `{id,npc:NpcId,text,inReplyTo:string\|null,emotion:string\|null,at:number}` |
| `SceneSpec` | `{version:string,room:Room,npcStands:Anchor[],playerSeats:SeatSpec[],spawnPoints:Vec3[]}`; один и тот же `version` у всех клиентов |
| `Room` | `{width,depth,height,platforms:Box[],ramps:Ramp[],obstacles:Box[],walls:Box[]}`; `Box={id,center:Vec3,size:Vec3}`, `Ramp={id,from:Vec3,to:Vec3,width:number}` |
| `Anchor` | `{id,position:Vec3,yaw:number,level:0\|1}`; ровно 10 NPC: 5 на нижнем, 5 на верхнем ярусе, верхний ряд смещён |
| `SeatSpec` / `Seat` | `SeatSpec={id,position:Vec3,yaw:number,exit:Vec3}`; `Seat={id,occupiedBy:PlayerId\|null}`. Только кресла жюри, полукругом; кресла NPC не входят |

`SceneSpec` задаёт пол, потолок, четыре стены, двухъярусную трибуну, наклонные проходы, кресла и маленькие столы жюри, проходы и препятствия. Фронт строит геометрию из примитивов по этим данным; сервер использует те же объёмы для проверки движения. Коллизия игрока — вертикальная капсула радиусом 0.3 м и высотой 1.8 м; скорость ходьбы ≤2.5 м/с, без прыжка. По рампе Y берётся из её плоскости; на другую высоту можно попасть только по рампе. `version` меняется при правке размеров или координат. Секретные роли, связи, промпты и shared lore в `SceneSpec`/`NpcMeta`/`ChunkData` не попадают.

## Полный снимок и жизненный цикл

`StateSnapshot` после каждого `AuthOk`:

```ts
{sessionId:string, me:{id:string,role:"leader"|"judge"},
 phase:"lobby"|"playing"|"finished", round:Round|null,
 scene:SceneSpec, players:Player[], npcs:NpcMeta[], seats:Seat[],
 board:Board, questions:QuestionState, chat:ChatLine[],
 worldSizeBytes:number, score:{[playerId]:number},
 scoreboard:{id:string,score:number,title:string}[]|null,
 reveal:{trueFriends:[NpcId,NpcId][],actors:NpcId[]}|null}
```

`reveal` и `scoreboard` равны `null` до финала. `chat` нужен для позднего входа; клиент дедуплицирует по `id`. Сервер отправляет `StateSnapshot` и для лобби. `LobbyState {sessionId,players:{id,name,connected}[],leaderId,minPlayers,canStart,started}` — всем при входе/выходе. `StartGame` принимает только ведущего, если `canStart=true`; сервер рассылает `GameStarted {rounds:{n,phase,title,durationSec}[],npcs,sceneVersion}` и `RoundStarted Round`.

Раунды: 1 — визитки; 2 — истории; 3 — факты; 4 — допрос (по два вопроса двум разным NPC на игрока); 5 — вскрытие. **Окно подтверждения одной новой пары открывается после раундов 2, 3 и 4**: так получаются три пары; раунд 1 в сценарии прямо указан без выбора, раунд 5 — финал. Сервер рассылает `RoundEnded {n,choiceEndsAt}` (`null` без выбора), затем для этих окон `RoundStarted Round` с `phase="choice"` и тем же `n`; по закрытии окна рассылает `RoundStarted` следующего раунда. Истечение таймера на клиенте ничего не фиксирует. Меню вопросов видно постоянно, но отправка доступна лишь в раунде 4; черновик доски доступен в игре, `SubmitPair` — лишь в окне выбора. В окне можно отправить одну пару, ранее подтверждённые NPC недоступны; пропуск фиксируется пустым выбором и не создаёт пару. Финал: `GameEnded {reveal,scoreboard}` и `ScoreUpdate {players:{id,score,title}[]}`. Подсчёт и раскрытие — только на сервере.

Счёт: верная пара, подтверждённая после раунда 2/3/4, даёт 300/200/100; верный актёр-одиночка — 50; пара друг+актёр — −100, два актёра — −150. Счёт начисляется в финале. Указанный в `overall.md` «идеал 1000» противоречит этой арифметике: по перечисленным правилам максимум 800; для 1000 нужна отдельная награда, которой пока нет в контракте.

## Команды клиента → сервер и ответные события

Один JSON-аргумент на вызов, кроме `StartGame`. Ошибка валидации — событие с `code,message,requestId?`; сервер не меняет состояние. `requestId` уникален для мутирующей команды, повтор после потери ответа идемпотентен в пределах сессии; `StartGame` идемпотентен по состоянию сессии. `BoardSnapshot` и `BoardReject` возвращают `requestId`, чтобы клиент соотнёс результат с командой.

| Hub method | Аргумент | События и правило |
| --- | --- | --- |
| `Auth` | `{token,name}` | Только первым; `AuthOk {playerId,sessionId,role}` или `AuthErr {code,message}`, затем `StateSnapshot`, `LobbyState` |
| `StartGame` | без аргумента | `GameStarted`, `RoundStarted`; ведущий, сессия ещё не начата |
| `SendPose` | `{seq,position,yaw,pitch}` | До 10 Гц; сервер проверяет скорость, границы, стены, мебель, ярусы/рампы, возвращает принятую позу в `PlayersTick`; в режиме `seated` принимает только изменение взгляда |
| `SitDown` | `{requestId,seatId}` | Только ближайшее свободное кресло жюри в радиусе 1.5 м; `SeatState`, `PlayersTick` или `ActionReject` |
| `StandUp` | `{requestId}` | Освобождает кресло, ставит игрока в `Seat.exit`; `SeatState`, `PlayersTick` или `ActionReject` |
| `RequestChunk` | `{reqId,ids:NpcId[]}` | До 3 id; `ChunkData {reqId,npcs:{id,details,sizeBytes}[]}`. `details={displayName,photoColor,voiceHint}` — без lore/ролей |
| `ReleaseChunk` | `{ids:NpcId[]}` | Снимает интерес к деталям; клиент сразу удаляет кэш; отдельное событие не требуется |
| `PairNpcs` / `UnpairNpcs` | `{requestId,a,b}` | Личный черновик доски; `BoardSnapshot {board,requestId}` или `BoardReject` |
| `MarkLiar` / `UnmarkLiar` | `{requestId,npc}` | Личный черновик; максимум 4 одиночки, каждый NPC только в одном назначении |
| `SaveNote` | `{requestId,npc,text}` | Личная заметка до 200 символов; `BoardSnapshot` или `BoardReject` |
| `SubmitPair` | `{requestId,round,a,b}` или `{requestId,round,skip:true}` | Только в окне выбора; `a,b` уже составляют пару в черновике; `BoardSnapshot` и `PairSubmitted {round,pair:[a,b]\|null}` или `BoardReject`; один выбор на раунд, подтверждённая пара не редактируется |
| `AskQuestion` | `{requestId,targetNpc,text}` | Только раунд 4, до 300 символов; `QuestionOk {requestId,questions}`, затем `NpcThinking {npc,questionId}`, `NpcSay ChatLine` или `QuestionFailed {questionId,code,message,questions}`; отказ — `QuestionReject {requestId,code,message}` |
| `Ping` | `{t}` | `Pong {t,serverTime}` для RTT и поправки серверного времени |

`PlayersTick {players:Player[],serverTime}` и `SeatState {seats:Seat[]}` рассылаются всем; `PlayersTick` до 10 Гц, включая собственную принятую позу. Сервер отклоняет старый `seq`, недопустимые координаты и телепортацию; клиент при расхождении возвращается к принятой позе. После reconnect следующий `SendPose.seq` больше `pose.seq` своего игрока из `StateSnapshot.players`. Угол при ходьбе не ограничен по горизонтали; при посадке сервер и фронт ограничивают yaw относительно `SeatSpec.yaw` до ±120°, pitch до ±60°. В режиме `seated` `SendPose` может менять только yaw/pitch, позицию задаёт сервер. `E` вызывает `SitDown`/`StandUp`, `WASD` работает только при ходьбе, `Esc` освобождает мышь. При вводе текста или открытом UI фронт не двигает игрока и не вращает камеру. При разрыве связи кресло удерживается за игроком на время восстановления сессии; при окончательном выходе освобождается.

`NpcSay` и `NpcReaction {npc,reaction,emotion}` рассылаются всем, реплика целиком после ответа LLM; `NpcThinking` включает «Думает…», `NpcSay`/`QuestionFailed` выключают. `questionId=requestId`, `ChatLine.inReplyTo=questionId`; `QuestionOk` резервирует попытку, при `QuestionFailed` сервер возвращает её в `questions`, если раунд ещё идёт. Сервер хранит вопросы/ответы и контекст NPC, не отправляет скрытые причины реакций. Для автоматических реплик раундов `inReplyTo=null`. `QuestionState` и персональный `Board` возвращаются в снимке после reconnect.

## Ошибки, лимиты и совместимость

`AuthErr`: `INVALID_TOKEN`, `NAME_TAKEN`, `SESSION_FULL`. `ActionReject {op,code,message,requestId?,seq?}`: `INVALID_POSE`, `COLLISION`, `TOO_FAR`, `SEAT_TAKEN`, `WRONG_MODE`. `BoardReject`: `INVALID`, `NO_FREE_SLOT`, `LOCKED`, `WRONG_PHASE`, `ALREADY_SUBMITTED`. `QuestionReject`: `LIMIT`, `SAME_NPC`, `EMPTY`, `WRONG_PHASE`; `QuestionFailed`: `LLM_TIMEOUT`, `LLM_ERROR`. Общий `ServerError`: `BAD_PAYLOAD`, `AUTH_REQUIRED`, `RATE_LIMIT`, `INTERNAL`. Сообщения для UI — по-русски; код стабилен для логики.

Клиент держит не больше одного `Chunk` и не больше 10% от `worldSizeBytes` одновременно; `reqId` защищает от устаревшего ответа. `worldSizeBytes` — сумма публичных деталей всех 10 NPC, не размер сценической геометрии. Если один chunk превышает бюджет, его не кэшируют. Позиции, `SceneSpec`, номера и цвета NPC к этому лимиту не относятся.

**Изменения относительно фронта v1:** заменить `SendCamera` на `SendPose`; добавить `SceneSpec`, `Pose`, `SeatState`, `SitDown`, `StandUp`, `SubmitPair`, `QuestionState` и историю в снимок; убрать публичные `loreChunks`; `NpcMeta.index` (0–9) заменить на `number` (1–10). Текущие фиксированная камера, круглый стол и NPC на одной дуге не соответствуют этой схеме. `LockPair` как отдельная команда больше не нужен: раунд фиксации определяется успешным `SubmitPair` на сервере. Прежний `frontend/PLAN.md` описывает v1 и не задаёт контракт v2.
