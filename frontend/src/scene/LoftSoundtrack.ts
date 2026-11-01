/** Small generated loops for the loft's vinyl player; starts only after a user key press. */
export class LoftSoundtrack {
  private context: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private track = 'mute';
  private beat = 0;
  private readonly unlock = () => {
    if (this.context) return;
    this.context = new AudioContext();
    void this.context.resume();
    this.start();
  };

  constructor() { window.addEventListener('keydown', this.unlock); }

  setTrack(track: string) {
    if (track === this.track) return;
    this.track = track;
    this.beat = 0;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (track !== 'mute' && this.context) this.start();
  }

  private start() {
    if (!this.context || this.timer || this.track === 'mute') return;
    this.timer = setInterval(() => this.playBeat(), 300);
    this.playBeat();
  }

  private tone(frequency: number, duration: number, level: number, shape: OscillatorType) {
    const context = this.context;
    if (!context || context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const volume = context.createGain();
    oscillator.type = shape;
    oscillator.frequency.value = frequency;
    volume.gain.setValueAtTime(.0001, context.currentTime);
    volume.gain.exponentialRampToValueAtTime(level, context.currentTime + .025);
    volume.gain.exponentialRampToValueAtTime(.0001, context.currentTime + duration);
    oscillator.connect(volume).connect(context.destination);
    oscillator.start(); oscillator.stop(context.currentTime + duration + .02);
    oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
  }

  private playBeat() {
    const step = this.beat++ % 16;
    if (this.track === 'lofi') {
      const bass = [110, 0, 0, 0, 130.81, 0, 0, 0, 98, 0, 0, 0, 116.54, 0, 0, 0][step];
      if (bass) { this.tone(bass, .55, .015, 'sine'); this.tone(bass * 2, .8, .004, 'triangle'); }
      if (step % 4 === 2) this.tone(392, .12, .003, 'triangle');
    } else if (this.track === 'triphop') {
      if (step % 4 === 0) this.tone([82.41, 87.31, 73.42, 98][step / 4], .35, .018, 'triangle');
      if (step % 4 === 2) this.tone(180, .07, .004, 'sine');
      if (step % 8 === 7) this.tone(440, .13, .0025, 'sine');
    } else if (this.track === 'industrial') {
      if (step % 2 === 0) this.tone(step % 4 === 0 ? 73.42 : 82.41, .18, .012, 'sawtooth');
      if (step % 4 === 2) this.tone(220, .05, .005, 'square');
    }
  }

  dispose() {
    window.removeEventListener('keydown', this.unlock);
    if (this.timer) clearInterval(this.timer);
    void this.context?.close();
  }
}
