import { EMOTION_LEAD_MS, SPEECH_FADE_MS, type NpcEmotion } from '../shared/dialogue';

const smooth = (n: number) => { const t = Math.max(0, Math.min(1, n)); return t * t * (3 - 2 * t); };

/** Time-based poses stay identical at different frame rates; all offsets return to rest. */
export function expressionPose(emotion: NpcEmotion, age: number, duration: number) {
  const weight = age < 0 ? 0 : smooth(age / 180) * smooth((duration - age) / SPEECH_FADE_MS);
  const t = Math.max(0, age) / 1000;
  const talking = age >= EMOTION_LEAD_MS;
  const beat = Math.sin(t * 5.5);
  let leftX = -0.45 + beat * 0.2, rightX = -0.55 - beat * 0.25;
  let leftZ = -0.3, rightZ = 0.35, headX = Math.sin(t * 3) * 0.05, headZ = 0, lean = 0, sway = 0, brow = 0;
  switch (emotion) {
    case 'happy':
      leftX = -0.75 + beat * 0.25; rightX = -0.8 - beat * 0.25;
      leftZ = -0.95; rightZ = 0.95; headZ = Math.sin(t * 3) * 0.1; sway = Math.sin(t * 4) * 0.04; brow = 0.08;
      break;
    case 'angry':
      leftX = -1.1 + beat * 0.16; rightX = -1.25 - beat * 0.2;
      leftZ = -0.55; rightZ = 0.55; headX = 0.12 + beat * 0.07; lean = 0.1; brow = -0.35;
      break;
    case 'sad':
      leftX = -0.12; rightX = -0.2 + beat * 0.05; leftZ = -0.08; rightZ = 0.12;
      headX = 0.3; headZ = -0.1; lean = 0.08; brow = 0.3;
      break;
    case 'surprised':
      leftX = -2.15 + beat * 0.08; rightX = -2.15 - beat * 0.08;
      leftZ = -0.35; rightZ = 0.35; headX = -0.18; lean = -0.08; brow = 0.12;
      break;
  }
  return {
    weight, leftX: leftX * weight, rightX: rightX * weight, leftZ: leftZ * weight, rightZ: rightZ * weight,
    headX: headX * weight, headZ: headZ * weight, lean: lean * weight, sway: sway * weight, brow: brow * weight,
    mouthOpen: (talking ? 0.5 + Math.sin(t * 18) * 0.5 : emotion === 'surprised' ? 0.7 : 0) * weight,
  };
}
