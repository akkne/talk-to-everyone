import type { Vec3 } from '../shared/types';

/** <summary>3D orientation vectors (forward, up, right) for the Web Audio API listener.</summary> */
export interface ListenerBasis {
  readonly forward: Vec3;
  readonly up: Vec3;
  readonly right: Vec3;
}

/** <summary>Computed directional spatial audio parameters for a speaking judge relative to the listener.</summary> */
export interface SpatialSpeakerAudioMetrics {
  /** <summary>Euclidean distance in meters between listener and speaker.</summary> */
  readonly distance: number;
  /** <summary>Stereo pan in [-1, 1], where -1 is full left ear and +1 is full right ear.</summary> */
  readonly pan: number;
  /** <summary>Distance-attenuated gain multiplier in [0, 1].</summary> */
  readonly distanceGain: number;
  /** <summary>Speaker position in listener-local coordinates (x: right, y: up, z: front).</summary> */
  readonly localPosition: Vec3;
  /** <summary>World-space position of the speaker's mouth/head.</summary> */
  readonly worldHeadPosition: Vec3;
}

/** <summary>Pure mathematical model for 3D positional voice audio in the studio coordinate system.</summary> */
export class SpatialAudioMath {
  public static readonly STANDING_HEAD_HEIGHT = 1.65;
  public static readonly SEATED_HEAD_HEIGHT = 1.2;
  public static readonly REF_DISTANCE = 1.6;
  public static readonly MAX_DISTANCE = 20.0;
  public static readonly ROLLOFF_FACTOR = 1.15;

  /** <summary>Computes the orthonormal right-handed listener basis matching CameraController's (-pitch, -yaw, 0, 'YXZ') rotation.</summary> */
  public static computeListenerBasis(yaw: number, pitch: number): ListenerBasis {
    const cosYaw = Math.cos(yaw);
    const sinYaw = Math.sin(yaw);
    const cosPitch = Math.cos(pitch);
    const sinPitch = Math.sin(pitch);

    return {
      forward: {
        x: sinYaw * cosPitch,
        y: -sinPitch,
        z: -cosYaw * cosPitch,
      },
      up: {
        x: sinYaw * sinPitch,
        y: cosPitch,
        z: -cosYaw * sinPitch,
      },
      right: {
        x: cosYaw,
        y: 0,
        z: sinYaw,
      },
    };
  }

  /** <summary>Computes stereo pan, distance attenuation, and local coordinates for a speaker relative to the listener.</summary> */
  public static computeSpeakerMetrics(
    listener: { position: Vec3; yaw: number; pitch: number; seated?: boolean; jumpOffset?: number },
    speaker: { position: Vec3; seated?: boolean; jumpOffset?: number }
  ): SpatialSpeakerAudioMetrics {
    const listenerHeadY =
      listener.position.y +
      (listener.seated ? SpatialAudioMath.SEATED_HEAD_HEIGHT : SpatialAudioMath.STANDING_HEAD_HEIGHT) +
      (listener.jumpOffset ?? 0);

    const speakerHeadY =
      speaker.position.y +
      (speaker.seated ? SpatialAudioMath.SEATED_HEAD_HEIGHT : SpatialAudioMath.STANDING_HEAD_HEIGHT) +
      (speaker.jumpOffset ?? 0);

    const worldHeadPosition: Vec3 = {
      x: speaker.position.x,
      y: speakerHeadY,
      z: speaker.position.z,
    };

    const dx = worldHeadPosition.x - listener.position.x;
    const dy = worldHeadPosition.y - listenerHeadY;
    const dz = worldHeadPosition.z - listener.position.z;
    const distance = Math.hypot(dx, dy, dz);

    const basis = SpatialAudioMath.computeListenerBasis(listener.yaw, listener.pitch);
    const localRight = dx * basis.right.x + dy * basis.right.y + dz * basis.right.z;
    const localUp = dx * basis.up.x + dy * basis.up.y + dz * basis.up.z;
    const localFront = dx * basis.forward.x + dy * basis.forward.y + dz * basis.forward.z;

    const horizontalDistance = Math.hypot(localRight, localFront);
    const rawPan = horizontalDistance > 1e-4 ? localRight / horizontalDistance : 0;
    const pan = Math.max(-1, Math.min(1, rawPan));

    const distanceGain = SpatialAudioMath.computeDistanceGain(distance);

    return {
      distance,
      pan,
      distanceGain,
      localPosition: { x: localRight, y: localUp, z: localFront },
      worldHeadPosition,
    };
  }

  /** <summary>Computes inverse-distance attenuation clamped to [0, 1].</summary> */
  public static computeDistanceGain(distance: number): number {
    if (!Number.isFinite(distance) || distance <= SpatialAudioMath.REF_DISTANCE) {
      return 1;
    }
    if (distance >= SpatialAudioMath.MAX_DISTANCE) {
      return 0.05;
    }
    const denominator =
      SpatialAudioMath.REF_DISTANCE +
      SpatialAudioMath.ROLLOFF_FACTOR * (distance - SpatialAudioMath.REF_DISTANCE);
    const gain = SpatialAudioMath.REF_DISTANCE / denominator;
    return Math.max(0.05, Math.min(1, gain));
  }

  /** <summary>Computes Root-Mean-Square (RMS) amplitude from time-domain float audio samples.</summary> */
  public static computeRmsAmplitude(samples: ArrayLike<number>): number {
    const length = samples.length;
    if (length === 0) {
      return 0;
    }
    let sumSquares = 0;
    for (let i = 0; i < length; i++) {
      const s = samples[i];
      sumSquares += s * s;
    }
    return Math.sqrt(sumSquares / length);
  }
}
