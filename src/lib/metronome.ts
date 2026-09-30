export interface MetronomeEvent {
  time: number;
  accent: boolean;
  beatLabel: string;
}

export class Metronome {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: number | null = null;
  private index = 0;
  private events: MetronomeEvent[] = [];
  private baseAudioTime = 0;
  private baseScoreTime = 0;
  onTick?: (index: number, performanceTime: number) => void;
  onEnd?: () => void;
  enabled = true;

  private ensureContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.context.destination);
    }
    return this.context;
  }

  private click(time: number, accent: boolean): void {
    if (!this.enabled || !this.context || !this.master) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = accent ? 'square' : 'sine';
    oscillator.frequency.value = accent ? 1320 : 880;
    gain.gain.setValueAtTime(accent ? 0.9 : 0.45, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.045);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(time);
    oscillator.stop(time + 0.05);
  }

  load(events: MetronomeEvent[]): void {
    this.stopScheduler();
    this.events = events;
    this.index = 0;
  }

  async start(fromTimeSeconds = 0): Promise<void> {
    const context = this.ensureContext();
    await context.resume();
    this.index = this.events.findIndex((event) => event.time >= fromTimeSeconds - 1e-6);
    if (this.index < 0) {
      this.onEnd?.();
      return;
    }

    this.baseScoreTime = this.events[this.index]!.time;
    this.baseAudioTime = context.currentTime + 0.08;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  private schedule(): void {
    if (!this.context) return;
    const horizon = this.context.currentTime + 0.16;
    while (this.index < this.events.length) {
      const current = this.events[this.index]!;
      const audioTime = this.baseAudioTime + current.time - this.baseScoreTime;
      if (audioTime > horizon) break;
      this.click(audioTime, current.accent);
      const eventIndex = this.index;
      window.setTimeout(
        () => this.onTick?.(eventIndex, current.time),
        Math.max(0, (audioTime - this.context.currentTime) * 1000 - 1)
      );
      this.index += 1;
    }

    const last = this.events.at(-1);
    if (last && this.index >= this.events.length && this.context.currentTime > this.baseAudioTime + last.time - this.baseScoreTime + 0.08) {
      this.stopScheduler();
      this.onEnd?.();
    }
  }

  private stopScheduler(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  stop(): void {
    this.stopScheduler();
    this.index = 0;
    this.baseAudioTime = 0;
    this.baseScoreTime = 0;
  }

  get running(): boolean {
    return this.timer !== null;
  }
}
