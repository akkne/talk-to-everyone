/** <summary>Represents a selectable audio input device in the Escape menu.</summary> */
export interface AudioInputDeviceItem {
  readonly deviceId: string;
  readonly label: string;
}

/** <summary>Abstraction for enumerating and observing browser microphone devices.</summary> */
export interface IAudioDeviceCatalog {
  /** <summary>Lists available audio input devices, always including a default entry.</summary> */
  listAudioInputs(requestPermission?: boolean): Promise<AudioInputDeviceItem[]>;
}

/** <summary>Browser MediaDevices-backed catalog of audio input hardware.</summary> */
export class BrowserAudioDeviceCatalog implements IAudioDeviceCatalog {
  public static readonly DEFAULT_DEVICE: AudioInputDeviceItem = {
    deviceId: 'default',
    label: 'По умолчанию (системный микрофон)',
  };

  /** <summary>Queries navigator.mediaDevices for audioinput devices and normalizes labels.</summary> */
  public async listAudioInputs(requestPermission = false): Promise<AudioInputDeviceItem[]> {
    const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
    if (!mediaDevices || typeof mediaDevices.enumerateDevices !== 'function') {
      return [BrowserAudioDeviceCatalog.DEFAULT_DEVICE];
    }

    if (requestPermission && typeof mediaDevices.getUserMedia === 'function') {
      try {
        const stream = await mediaDevices.getUserMedia({ audio: true, video: false });
        stream.getTracks().forEach(track => track.stop());
      } catch {
        // Permission denied or no hardware present; fall back to unlabelled enumeration.
      }
    }

    try {
      const rawDevices = await mediaDevices.enumerateDevices();
      const inputs = rawDevices.filter(d => d.kind === 'audioinput');
      const result: AudioInputDeviceItem[] = [BrowserAudioDeviceCatalog.DEFAULT_DEVICE];
      let index = 1;
      for (const input of inputs) {
        const id = input.deviceId || `mic-${index}`;
        if (id === 'default' && result.length === 1) {
          if (input.label) {
            result[0] = { deviceId: 'default', label: `По умолчанию (${input.label})` };
          }
          continue;
        }
        if (result.some(existing => existing.deviceId === id)) {
          continue;
        }
        result.push({
          deviceId: id,
          label: input.label?.trim() || `Микрофон #${index}`,
        });
        index++;
      }
      return result;
    } catch {
      return [BrowserAudioDeviceCatalog.DEFAULT_DEVICE];
    }
  }
}
