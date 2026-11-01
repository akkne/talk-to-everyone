import { create } from 'zustand';
import { BrowserAudioDeviceCatalog, type AudioInputDeviceItem, type IAudioDeviceCatalog } from '../audio/AudioDeviceCatalog';

/** <summary>Supported microphone activation modes: continuous ('always') or push-to-talk ('ptt') on key G.</summary> */
export type VoiceActivationMode = 'always' | 'ptt';

/** <summary>Immutable snapshot of user microphone preferences configured in the Escape menu.</summary> */
export interface MicrophoneSettings {
  readonly deviceId: string;
  readonly volume: number;
  readonly mode: VoiceActivationMode;
}

/** <summary>Validation and normalization rules for microphone configuration.</summary> */
export class VoiceSettingsPolicy {
  public static readonly MIN_VOLUME = 0;
  public static readonly MAX_VOLUME = 200;
  public static readonly DEFAULT_VOLUME = 100;
  public static readonly DEFAULT_DEVICE_ID = 'default';
  public static readonly DEFAULT_MODE: VoiceActivationMode = 'always';
  public static readonly PTT_KEY_CODE = 'KeyG';
  public static readonly PTT_KEY_LABEL = 'G';
  public static readonly STORAGE_KEY = 'tte.voice.settings.v1';

  /** <summary>Clamps microphone volume percentage to [0, 200].</summary> */
  public static clampVolume(volume: number): number {
    if (!Number.isFinite(volume)) {
      return VoiceSettingsPolicy.DEFAULT_VOLUME;
    }
    return Math.round(Math.max(VoiceSettingsPolicy.MIN_VOLUME, Math.min(VoiceSettingsPolicy.MAX_VOLUME, volume)));
  }

  /** <summary>Normalizes activation mode to 'always' or 'ptt'.</summary> */
  public static normalizeMode(mode: unknown): VoiceActivationMode {
    return mode === 'ptt' ? 'ptt' : 'always';
  }

  /** <summary>Normalizes device identifier, falling back to 'default'.</summary> */
  public static normalizeDeviceId(deviceId: unknown): string {
    return typeof deviceId === 'string' && deviceId.trim().length > 0
      ? deviceId.trim()
      : VoiceSettingsPolicy.DEFAULT_DEVICE_ID;
  }

  /** <summary>Converts percentage volume [0..200] to linear Web Audio gain [0..2].</summary> */
  public static volumeToGain(volume: number): number {
    return VoiceSettingsPolicy.clampVolume(volume) / 100;
  }
}

interface VoiceSettingsState extends MicrophoneSettings {
  readonly devices: AudioInputDeviceItem[];
  readonly pushToTalkPressed: boolean;
}

function loadStoredSettings(): MicrophoneSettings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(VoiceSettingsPolicy.STORAGE_KEY) : null;
    if (!raw) {
      return {
        deviceId: VoiceSettingsPolicy.DEFAULT_DEVICE_ID,
        volume: VoiceSettingsPolicy.DEFAULT_VOLUME,
        mode: VoiceSettingsPolicy.DEFAULT_MODE,
      };
    }
    const parsed = JSON.parse(raw) as Partial<MicrophoneSettings>;
    return {
      deviceId: VoiceSettingsPolicy.normalizeDeviceId(parsed.deviceId),
      volume: VoiceSettingsPolicy.clampVolume(parsed.volume ?? VoiceSettingsPolicy.DEFAULT_VOLUME),
      mode: VoiceSettingsPolicy.normalizeMode(parsed.mode),
    };
  } catch {
    return {
      deviceId: VoiceSettingsPolicy.DEFAULT_DEVICE_ID,
      volume: VoiceSettingsPolicy.DEFAULT_VOLUME,
      mode: VoiceSettingsPolicy.DEFAULT_MODE,
    };
  }
}

function persistSettings(settings: MicrophoneSettings): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(VoiceSettingsPolicy.STORAGE_KEY, JSON.stringify(settings));
    }
  } catch {
    // Ignore storage quota or sandbox restrictions.
  }
}

const defaultCatalog: IAudioDeviceCatalog = new BrowserAudioDeviceCatalog();

function initialState(): VoiceSettingsState {
  const stored = loadStoredSettings();
  return {
    ...stored,
    devices: [BrowserAudioDeviceCatalog.DEFAULT_DEVICE],
    pushToTalkPressed: false,
  };
}

/** <summary>Reactive store for microphone settings (device, volume, always-on / PTT on G).</summary> */
export const useVoiceSettingsStore = create<VoiceSettingsState>(() => initialState());

/** <summary>Updates the selected microphone input device ID.</summary> */
export function setMicrophoneDevice(deviceId: string): void {
  const normalized = VoiceSettingsPolicy.normalizeDeviceId(deviceId);
  useVoiceSettingsStore.setState(state => {
    const next: MicrophoneSettings = { deviceId: normalized, volume: state.volume, mode: state.mode };
    persistSettings(next);
    return { deviceId: normalized };
  });
}

/** <summary>Updates the microphone gain volume percentage (0..200).</summary> */
export function setMicrophoneVolume(volume: number): void {
  const clamped = VoiceSettingsPolicy.clampVolume(volume);
  useVoiceSettingsStore.setState(state => {
    const next: MicrophoneSettings = { deviceId: state.deviceId, volume: clamped, mode: state.mode };
    persistSettings(next);
    return { volume: clamped };
  });
}

/** <summary>Switches between continuous ('always') and push-to-talk ('ptt' on key G) modes.</summary> */
export function setMicrophoneMode(mode: VoiceActivationMode): void {
  const normalized = VoiceSettingsPolicy.normalizeMode(mode);
  useVoiceSettingsStore.setState(state => {
    const next: MicrophoneSettings = { deviceId: state.deviceId, volume: state.volume, mode: normalized };
    persistSettings(next);
    return { mode: normalized, pushToTalkPressed: false };
  });
}

/** <summary>Updates whether the Push-to-Talk key (G) is currently held down.</summary> */
export function setPushToTalkPressed(pressed: boolean): void {
  useVoiceSettingsStore.setState({ pushToTalkPressed: Boolean(pressed) });
}

/** <summary>Refreshes the available audio input devices from the browser catalog.</summary> */
export async function refreshMicrophoneDevices(
  requestPermission = false,
  catalog: IAudioDeviceCatalog = defaultCatalog
): Promise<AudioInputDeviceItem[]> {
  const devices = await catalog.listAudioInputs(requestPermission);
  useVoiceSettingsStore.setState(state => {
    const exists = devices.some(d => d.deviceId === state.deviceId);
    const nextDeviceId = exists ? state.deviceId : VoiceSettingsPolicy.DEFAULT_DEVICE_ID;
    return { devices, deviceId: nextDeviceId };
  });
  return devices;
}

/** <summary>Resets microphone settings to defaults (used in tests and session resets).</summary> */
export function resetVoiceSettings(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(VoiceSettingsPolicy.STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
  useVoiceSettingsStore.setState(initialState(), true);
}
