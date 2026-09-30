export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  severity: Severity;
  code: string;
  measureIndex?: number;
  measureLabel?: string;
  partId?: string;
  message: string;
}

export interface TempoEvent {
  atQuarter: number;
  measureIndex: number;
  bpm: number;
  beatUnit?: number;
  label: string;
}

export interface ParsedMeasure {
  index: number;
  number: string;
  numberNumeric: number;
  implicit: boolean;
  divisions: number;
  beats: number;
  beatType: number;
  durationQuarters: number;
  nominalQuarters: number;
  isPickup: boolean;
  forwardRepeat: boolean;
  backwardRepeat: boolean;
  repeatTimes: number | null;
  endingRanges: EndingRange[];
  activeEndingNumbers: number[];
  tempoEvents: TempoEvent[];
}

export interface EndingRange {
  start: number;
  end: number;
  numbers: number[];
  open: boolean;
}

export interface RawEnding {
  measureIndex: number;
  boundary: 'start' | 'end';
  numbers: number[];
  type: string;
}

export type NavigationKind =
  | 'segno'
  | 'coda'
  | 'fine'
  | 'dacapo'
  | 'dalsegno'
  | 'tocoda'
  | 'toCodaSymbol'
  | 'alCoda'
  | 'alFine'
  | 'unknown';

export interface NavigationMark {
  kind: NavigationKind;
  measureIndex: number;
  atQuarter: number;
  boundary: 'measure-start' | 'measure-end' | 'within-measure';
  text: string;
}

export interface PathStep {
  occurrence: number;
  measureIndex: number;
  measureLabel: string;
  pass: number;
  startQuarter: number;
  durationQuarters: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  endingNumber?: number;
  events: PathEvent[];
}

export type PathEventType =
  | 'enter'
  | 'volta-skip'
  | 'back-repeat'
  | 'word-jump'
  | 'coda-jump'
  | 'fine-stop'
  | 'end';

export interface PathEvent {
  type: PathEventType;
  fromMeasure?: number;
  toMeasure?: number;
  pass?: number;
  label: string;
}

export interface BeatEvent {
  stepOccurrence: number;
  measureIndex: number;
  atQuarterInMeasure: number;
  globalQuarter: number;
  time: number;
  bpm: number;
  accent: boolean;
  beatLabel: string;
}

export interface ParsedScore {
  title: string;
  parts: { id: string; name: string }[];
  measures: ParsedMeasure[];
  markers: NavigationMark[];
  diagnostics: Diagnostic[];
  hasUnsupportedNavigation: boolean;
  path: PathStep[];
  events: BeatEvent[];
  totalDurationSeconds: number;
}

export interface RehearsalMarkPayload {
  id: string;
  measureIndex: number;
  occurrence: number;
  label: string;
  note: string;
  createdAt: number;
}

export interface StoredProject {
  id: string;
  title: string;
  xml: string;
  marks: RehearsalMarkPayload[];
  updatedAt: number;
}
