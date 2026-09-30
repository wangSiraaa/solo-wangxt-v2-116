import type { PathStep, WrittenMeasure } from '../score/types'

export interface BeatEvent {
  id: string
  stepIndex: number
  measureIndex: number
  occurrence: number
  beat: number
  totalBeats: number
  time: number
  accent: boolean
}

export interface BeatPosition {
  stepIndex: number
  event: BeatEvent
  progress: number
}

function beatDurationSeconds(measure: WrittenMeasure, bpm: number): number {
  const denominator = measure.timeSignature?.denominator ?? 4
  return (60 / bpm) * (4 / denominator)
}

export function buildBeatEvents(steps: PathStep[], measures: WrittenMeasure[]): BeatEvent[] {
  const events: BeatEvent[] = []
  for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
    const step = steps[stepIndex]
    const measure = measures[step.measureIndex]
    const beatUnit = beatDurationSeconds(measure, step.bpm)
    const denominator = measure.timeSignature?.denominator ?? 4
    const totalBeats = Math.max(1, Math.round(measure.durationQuarters / (4 / denominator)))
    for (let beat = 0; beat < totalBeats; beat += 1) {
      events.push({
        id: `${stepIndex}-${beat}`,
        stepIndex,
        measureIndex: step.measureIndex,
        occurrence: step.occurrence,
        beat,
        totalBeats,
        time: step.startSeconds + beat * beatUnit,
        accent: beat === 0,
      })
    }
  }
  return events
}

export class Metronome {
  private context: AudioContext | null = null
  private timer: number | null = null
  private startedAtContextTime = 0
  private startedAtScoreTime = 0
  private nextBeatIndex = 0
  private events: BeatEvent[] = []
  private running = false
  private readonly lookaheadSeconds = 0.08
  private readonly scheduleAheadSeconds = 0.28
  private readonly onBeat?: (event: BeatEvent) => void

  constructor(onBeat?: (event: BeatEvent) => void) {
    this.onBeat = onBeat
  }

  get isRunning(): boolean {
    return this.running
  }

  async start(events: BeatEvent[], scoreTime = 0): Promise<void> {
    this.stopSoundOnly()
    this.events = events
    const context = new AudioContext()
    this.context = context
    await context.resume()

    const firstIndex = events.findIndex((event) => event.time >= scoreTime - 0.001)
    this.nextBeatIndex = firstIndex < 0 ? events.length : firstIndex
    this.startedAtScoreTime = scoreTime
    this.startedAtContextTime = context.currentTime + 0.1
    this.running = true
    this.pump()
  }

  stop(): void {
    this.stopSoundOnly()
  }

  get currentTime(): number {
    if (!this.context || !this.running) return this.startedAtScoreTime
    return this.startedAtScoreTime + (this.context.currentTime - this.startedAtContextTime)
  }

  positionAt(scoreTime: number): BeatPosition | null {
    if (!this.events.length) return null
    let current = this.events[0]
    let index = 0
    for (let i = 0; i < this.events.length; i += 1) {
      if (this.events[i].time <= scoreTime + 0.001) {
        current = this.events[i]
        index = i
      } else {
        break
      }
    }
    const next = this.events[index + 1]
    const duration = next ? next.time - current.time : 0.5
    const progress = duration > 0 ? Math.min(1, Math.max(0, (scoreTime - current.time) / duration)) : 0
    return { stepIndex: current.stepIndex, event: current, progress }
  }

  private pump = (): void => {
    if (!this.running || !this.context) return
    while (
      this.nextBeatIndex < this.events.length &&
      this.scoreTimeToContextTime(this.events[this.nextBeatIndex].time) < this.context.currentTime + this.scheduleAheadSeconds
    ) {
      const event = this.events[this.nextBeatIndex]
      const when = Math.max(this.context.currentTime + 0.01, this.scoreTimeToContextTime(event.time))
      this.scheduleClick(when, event.accent)
      const delay = Math.max(0, (when - this.context.currentTime) * 1000)
      window.setTimeout(() => this.onBeat?.(event), delay)
      this.nextBeatIndex += 1
    }
    this.timer = window.setTimeout(this.pump, this.lookaheadSeconds * 1000)
  }

  private scoreTimeToContextTime(scoreTime: number): number {
    return this.startedAtContextTime + (scoreTime - this.startedAtScoreTime)
  }

  private scheduleClick(when: number, accent: boolean): void {
    if (!this.context) return
    const context = this.context
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = accent ? 'sine' : 'triangle'
    oscillator.frequency.value = accent ? 1320 : 880
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(accent ? 0.35 : 0.2, when + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.07)
    oscillator.connect(gain).connect(context.destination)
    oscillator.start(when)
    oscillator.stop(when + 0.08)
  }

  private stopSoundOnly(): void {
    this.running = false
    if (this.timer !== null) {
      window.clearTimeout(this.timer)
      this.timer = null
    }
    if (this.context) {
      void this.context.close()
      this.context = null
    }
  }
}
