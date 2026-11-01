/** <summary>Machine-readable activity codes synchronized between client and server.</summary> */
export type ParticipantActivityCode =
  | 'offline'
  | 'lobby'
  | 'escape_menu'
  | 'voting'
  | 'asking_question'
  | 'board'
  | 'listening'
  | 'seated'
  | 'walking'
  | 'reveal';

/** <summary>Input state used to classify what the local participant is currently doing.</summary> */
export interface PlayerActivityContext {
  readonly phase: 'lobby' | 'playing' | 'reveal';
  readonly escapeOpen: boolean;
  readonly votingOpen: boolean;
  readonly questionOpen: boolean;
  readonly questionPending?: boolean;
  readonly boardOpen: boolean;
  readonly npcSpeaking: boolean;
  readonly poseMode: 'walking' | 'seated';
}

/** <summary>Resolves participant activity codes and localized descriptions for the host panel.</summary> */
export class PlayerActivityClassifier {
  /** <summary>Determines the highest-priority activity code for the given UI and gameplay context.</summary> */
  public static resolveCode(ctx: PlayerActivityContext): ParticipantActivityCode {
    if (ctx.escapeOpen) {
      return 'escape_menu';
    }
    if (ctx.phase === 'lobby') {
      return 'lobby';
    }
    if (ctx.phase === 'reveal') {
      return 'reveal';
    }
    if (ctx.votingOpen) {
      return 'voting';
    }
    if (ctx.questionOpen || ctx.questionPending) {
      return 'asking_question';
    }
    if (ctx.boardOpen) {
      return 'board';
    }
    if (ctx.npcSpeaking) {
      return 'listening';
    }
    return ctx.poseMode === 'seated' ? 'seated' : 'walking';
  }

  /** <summary>Formats a localized Russian description of a participant's current action.</summary> */
  public static describe(code: ParticipantActivityCode, poseMode: 'walking' | 'seated' = 'walking'): string {
    switch (code) {
      case 'offline':
        return 'Нет связи';
      case 'lobby':
        return 'Ожидает в лобби';
      case 'escape_menu':
        return 'Смотрит в меню';
      case 'voting':
        return 'Выбирает пару';
      case 'asking_question':
        return 'Задает вопрос';
      case 'board':
        return 'Изучает доску';
      case 'listening':
        return poseMode === 'seated' ? 'Сидит и слушает участника' : 'Слушает участника';
      case 'seated':
        return 'Сидит в кресле';
      case 'walking':
        return 'Ходит по студии';
      case 'reveal':
        return 'Смотрит итоги';
      default:
        return 'В студии';
    }
  }
}
