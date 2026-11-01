import { VoiceSettingsPolicy, type VoiceActivationMode } from '../store/voiceSettingsStore';

/** <summary>Input state for evaluating whether the local microphone should transmit voice audio.</summary> */
export interface VoiceTransmissionGateInput {
  readonly mode: VoiceActivationMode;
  readonly volume: number;
  readonly pttPressed: boolean;
  readonly voiceActivityDetected: boolean;
}

/** <summary>Evaluates Push-to-Talk (key G) events and microphone transmission activation rules.</summary> */
export class PushToTalkController {
  public static readonly VAD_RMS_THRESHOLD = 0.016;

  /** <summary>Returns true if a keyboard event corresponds to the Push-to-Talk key (G) outside text inputs.</summary> */
  public static isPushToTalkKeyEvent(event: {
    code?: string;
    key?: string;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    target?: unknown;
  }): boolean {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }

    const target = event.target as { tagName?: string; isContentEditable?: boolean } | null | undefined;
    if (target) {
      if (target.isContentEditable) {
        return false;
      }
      const tag = target.tagName?.toUpperCase();
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return false;
      }
    }

    if (event.code === VoiceSettingsPolicy.PTT_KEY_CODE) {
      return true;
    }
    const lowerKey = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    return lowerKey === 'g' || lowerKey === 'п';
  }

  /** <summary>Determines whether the local judge is actively transmitting speech based on mode, volume, PTT, and VAD.</summary> */
  public static shouldTransmitVoice(input: VoiceTransmissionGateInput): boolean {
    if (VoiceSettingsPolicy.clampVolume(input.volume) <= 0) {
      return false;
    }

    if (input.mode === 'ptt') {
      return Boolean(input.pttPressed);
    }

    return Boolean(input.voiceActivityDetected);
  }
}
