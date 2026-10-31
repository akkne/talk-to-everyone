export const HUB = '/hubs/game';
export const C2S = { AUTH:'Auth', START_GAME:'StartGame', SEND_CAMERA:'SendCamera',
  REQUEST_CHUNK:'RequestChunk', RELEASE_CHUNK:'ReleaseChunk',
  PAIR_NPCS:'PairNpcs', UNPAIR_NPCS:'UnpairNpcs', MARK_LIAR:'MarkLiar',
  UNMARK_LIAR:'UnmarkLiar', LOCK_PAIR:'LockPair', SAVE_NOTE:'SaveNote',
  ASK_QUESTION:'AskQuestion', PING:'Ping' } as const;
export const S2C = { AUTH_OK:'AuthOk', AUTH_ERR:'AuthErr',
  LOBBY_STATE:'LobbyState', GAME_STARTED:'GameStarted',
  ROUND_STARTED:'RoundStarted', ROUND_ENDED:'RoundEnded', GAME_ENDED:'GameEnded',
  STATE_SNAPSHOT:'StateSnapshot', CHUNK_DATA:'ChunkData', PLAYERS_TICK:'PlayersTick',
  NPC_SAY:'NpcSay', NPC_REACTION:'NpcReaction',
  BOARD_SNAPSHOT:'BoardSnapshot', BOARD_REJECT:'BoardReject',
  QUESTION_OK:'QuestionOk', QUESTION_REJECT:'QuestionReject',
  SCORE_UPDATE:'ScoreUpdate', SERVER_ERROR:'ServerError', PONG:'Pong' } as const;
export const GAME = { NPC_COUNT:10, PAIR_SLOTS:3, LIAR_SLOTS:4,
  QUESTIONS_PER_JUDGE:2, LOCK_BONUS:{2:300,3:200,4:100,5:100} as Record<number,number>,
  PENALTY_FAMILY_BREAKER:-100, PENALTY_LIARS_CLUB:-150, NOTE_MAX_LEN:200,
  ROUNDS: [
    {n:1, phase:'presentation', title:'Визитка и красные флаги', durationSec:120},
    {n:2, phase:'gossip',       title:'История одного косяка',    durationSec:120},
    {n:3, phase:'blindspots',   title:'Слепые пятна',             durationSec:120},
    {n:4, phase:'interrogation',title:'Допрос',                   durationSec:180},
    {n:5, phase:'reveal',       title:'Вскрытие',                 durationSec:60},
  ] } as const;
export const NET = { CAMERA_HZ:10, PLAYERS_TICK_HZ:10, PING_INTERVAL_MS:15000,
  RECONNECT_DELAYS_MS:[0,1000,3000,5000], CHUNK_MAX_PER_REQUEST:3,
  CACHE_MAX_ITEMS:1, LLM_TIMEOUT_MS:8000 } as const;
