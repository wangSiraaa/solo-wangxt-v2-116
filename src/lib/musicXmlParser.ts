import type {
  Diagnostic,
  EndingRange,
  NavigationKind,
  NavigationMark,
  ParsedMeasure,
  ParsedScore,
  PathEvent,
  PathStep,
  RawEnding,
  BeatEvent,
  TempoEvent
} from '../types/score';

interface PartMeasureRaw {
  index: number;
  numberAttr: string;
  implicit: boolean;
  divisions: number;
  beats: number;
  beatType: number;
  durationQuarters: number;
  forwardRepeat: boolean;
  backwardRepeat: boolean;
  repeatTimes: number | null;
  rawEndings: RawEnding[];
  localTempoEvents: TempoEvent[];
}

interface RepeatRegion {
  id: number;
  forward: number;
  backward: number;
  times: number;
}

const ITALIAN_TEMPO: Record<string, number> = {
  grave: 40,
  lento: 52,
  largo: 56,
  larghetto: 63,
  adagio: 72,
  andante: 80,
  andantino: 84,
  moderato: 108,
  allegretto: 112,
  allegro: 120,
  vivace: 138,
  vivo: 140,
  presto: 168,
  prestissimo: 188
};

const GRADUAL_TEMPO = ['ritardando', 'rit.', 'rit', 'rallentando', 'rall.', 'rall', 'ritenuto', 'riten.', 'accelerando', 'accel.', 'accel', 'stringendo', 'allargando'];
const NAVIGATION_LOOKALKE = /\b(D\.?\s*C\.?|D\.?\s*S\.?|dal\s+segno|da\s+capo|al\s+fine|al\s+coda|to\s+coda|fine|segno|coda)\b/i;

function localName(node: Element | Node): string {
  const name = node instanceof Element ? node.tagName : node.nodeName;
  return name.includes(':') ? name.split(':').pop() ?? name : name;
}

function children(element: Element, name?: string): Element[] {
  return Array.from(element.children).filter((child) => !name || localName(child) === name);
}

function firstChild(element: Element, name: string): Element | undefined {
  return children(element, name)[0];
}

function textOf(element: Element | undefined): string {
  return element?.textContent?.trim() ?? '';
}

function num(value: string | null | undefined, fallback: number): number {
  if (value === null || value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function compactText(value: string): string {
  return normalizeSpaces(value).toLowerCase().replace(/\s+/g, '');
}

function diag(
  list: Diagnostic[],
  severity: Diagnostic['severity'],
  code: string,
  message: string,
  ctx: { measureIndex?: number; measureLabel?: string; partId?: string } = {}
): void {
  list.push({ severity, code, message, ...ctx });
}

function parseNumberList(value: string): number[] {
  return value
    .split(/[\s,]+/)
    .map((part) => Number(part.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function boundaryFromLocation(location: string | null): 'left' | 'right' {
  return location === 'left' ? 'left' : 'right';
}

function matchesInstruction(text: string, type: 'ds' | 'dc' | 'alFine' | 'alCoda' | 'toCoda' | 'fine'): boolean {
  const patterns: Record<typeof type, RegExp> = {
    ds: /(^|[^a-z])d\s*[.\s]?\s*s\s*\.?([^a-z]|$)|dal\s*[.\s]?\s*segno/i,
    dc: /(^|[^a-z])d\s*[.\s]?\s*c\s*\.?([^a-z]|$)|da\s*[.\s]?\s*capo/i,
    alFine: /al\s*[.\s]?\s*fine/i,
    alCoda: /al(?:la)?\s*[.\s]?\s*coda/i,
    toCoda: /to\s*[.\s]?\s*coda/i,
    fine: /(^|[^a-z])fine\s*\.?([^a-z]|$)/i
  };
  return patterns[type].test(text);
}

function parseNavigationText(rawText: string, measureIndex: number, atQuarter: number, duration: number): { marks: Omit<NavigationMark, 'measureIndex' | 'atQuarter'>[]; bpmText?: { value: number; beatUnit: number; label: string } } {
  const text = normalizeSpaces(rawText);
  const compact = compactText(text);
  const marks: Omit<NavigationMark, 'measureIndex' | 'atQuarter'>[] = [];
  const boundary: NavigationMark['boundary'] = atQuarter <= 1e-6 ? 'measure-start' : atQuarter + 1e-6 >= duration ? 'measure-end' : 'within-measure';
  const add = (kind: NavigationKind): void => {
    marks.push({ kind, boundary, text });
  };

  if (matchesInstruction(text, 'toCoda')) add('tocoda');
  if (matchesInstruction(text, 'alCoda')) add('alCoda');
  if (matchesInstruction(text, 'alFine')) add('alFine');
  if (matchesInstruction(text, 'ds')) add('dalsegno');
  if (matchesInstruction(text, 'dc')) add('dacapo');
  if (matchesInstruction(text, 'fine') && !matchesInstruction(text, 'alFine')) add('fine');

  const number = text.match(/(?:=\s*?|^)(\d{2,3})(?:\s*bpm)?$/i) ?? text.match(/([♩♪𝅘𝅥𝅮]|[A-Ga-g])\s*=\s*(\d{2,3})/);
  let bpmText: { value: number; beatUnit: number; label: string } | undefined;
  if (number) {
    const value = Number(number[1] ?? number[2]);
    if (Number.isFinite(value)) bpmText = { value, beatUnit: /♪|𝅘𝅥𝅮/.test(text) ? 2 : 4, label: text };
  }
  for (const [word, value] of Object.entries(ITALIAN_TEMPO)) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(text)) {
      bpmText = { value, beatUnit: 4, label: text };
      break;
    }
  }
  if (compact === 'atempo' || /\ba tempo\b/i.test(text)) {
    bpmText = { value: Number.NaN, beatUnit: 4, label: text };
  }
  if (compact === 'tempoprimo' || /\btempo primo\b/i.test(text)) {
    bpmText = { value: Number.NaN, beatUnit: 4, label: text };
  }
  if (!marks.length && !bpmText && GRADUAL_TEMPO.some((word) => new RegExp(`\\b${word.replace('.', '\\.?')}\\b`, 'i').test(text))) {
    return { marks: [{ kind: 'unknown', boundary, text }] };
  }
  if (!marks.length && !bpmText && NAVIGATION_LOOKALKE.test(text)) {
    return { marks: [{ kind: 'unknown', boundary, text }] };
  }
  return { marks, bpmText };
}

function parseMeasure(
  measure: Element,
  index: number,
  partId: string,
  diagnostics: Diagnostic[],
  partState: { divisions: number; beats: number; beatType: number }
): PartMeasureRaw {
  const numberAttr = measure.getAttribute('number') ?? String(index + 1);
  const implicit = measure.getAttribute('implicit') === 'yes';
  let divisions = partState.divisions;
  let beats = partState.beats;
  let beatType = partState.beatType;
  let position = 0;
  let maxPosition = 0;
  let forwardRepeat = false;
  let backwardRepeat = false;
  let repeatTimes: number | null = null;
  const rawEndings: RawEnding[] = [];
  const localTempoEvents: TempoEvent[] = [];
  const previousNumericBpms: number[] = [];
  let firstNumericBpm: number | undefined;

  for (const child of children(measure)) {
    const name = localName(child);
    const knownMeasureChildren = new Set(['attributes', 'note', 'forward', 'backup', 'barline', 'direction', 'print', 'sound']);
    if (!knownMeasureChildren.has(name)) {
      diag(diagnostics, 'error', 'UNSUPPORTED_MEASURE_ELEMENT', `不支持的小节级符号 <${name}>，不会静默忽略。`, { measureIndex: index, measureLabel: numberAttr, partId });
    }
    if (name === 'attributes') {
      const xmlDivisions = firstChild(child, 'divisions');
      if (xmlDivisions) divisions = Math.max(1, num(textOf(xmlDivisions), divisions));
      const time = firstChild(child, 'time');
      if (time) {
        beats = Math.max(1, num(textOf(firstChild(time, 'beats')), beats));
        beatType = Math.max(1, num(textOf(firstChild(time, 'beat-type')), beatType));
      }
    } else if (name === 'note') {
      const durationNode = firstChild(child, 'duration');
      const isChord = Boolean(firstChild(child, 'chord'));
      const isGrace = child.getAttribute('attack') !== null || Boolean(firstChild(child, 'grace'));
      if (durationNode && !isChord && !isGrace) {
        const noteDuration = Math.max(0, num(textOf(durationNode), 0)) / divisions;
        position += noteDuration;
        maxPosition = Math.max(maxPosition, position);
      }
    } else if (name === 'forward') {
      const durationNode = firstChild(child, 'duration');
      position += Math.max(0, num(textOf(durationNode), 0)) / divisions;
      maxPosition = Math.max(maxPosition, position);
    } else if (name === 'backup') {
      const durationNode = firstChild(child, 'duration');
      position = Math.max(0, position - Math.max(0, num(textOf(durationNode), 0)) / divisions);
    } else if (name === 'barline') {
      for (const repeat of children(child, 'repeat')) {
        const direction = repeat.getAttribute('direction');
        if (direction === 'forward') forwardRepeat = true;
        if (direction === 'backward') {
          backwardRepeat = true;
          const timesValue = repeat.getAttribute('times');
          if (timesValue !== null) repeatTimes = Math.max(1, Math.round(num(timesValue, 2)));
        }
      }
      for (const ending of children(child, 'ending')) {
        const type = ending.getAttribute('type') ?? '';
        const numbers = parseNumberList(ending.getAttribute('number') ?? '1');
        if (type === 'start') rawEndings.push({ measureIndex: index, boundary: 'start', numbers, type });
        if (type === 'stop' || type === 'discontinue') rawEndings.push({ measureIndex: index, boundary: 'end', numbers, type });
        if (!['start', 'stop', 'discontinue'].includes(type)) {
          diag(diagnostics, 'error', 'UNKNOWN_ENDING_TYPE', `不支持的跳房类型“${type}”。`, { measureIndex: index, measureLabel: numberAttr, partId });
        }
      }
      const knownBarlineChildren = new Set(['repeat', 'ending', 'fermata', 'wavy-line', 'segno', 'coda']);
      for (const barlineChild of children(child)) {
        if (!knownBarlineChildren.has(localName(barlineChild))) {
          diag(diagnostics, 'error', 'UNSUPPORTED_BARLINE_SYMBOL', `不支持的小节线符号 <${localName(barlineChild)}>，不会静默忽略。`, { measureIndex: index, measureLabel: numberAttr, partId });
        }
      }
    } else if (name === 'sound') {
      const soundBoundary = position <= 1e-6 ? 'measure-start' : 'measure-end';
      addSoundMarkers(child, index, position, soundBoundary, numberAttr, partId, diagnostics);
      const tempoAttr = child.getAttribute('tempo');
      if (tempoAttr !== null) {
        const bpm = num(tempoAttr, Number.NaN);
        if (Number.isFinite(bpm)) {
          const quarterBpm = bpm;
          localTempoEvents.push({ atQuarter: position, measureIndex: index, bpm: quarterBpm, beatUnit: 4, label: `♩ = ${Math.round(quarterBpm)}` });
        }
      }
    } else if (name === 'direction') {
      const atStart = position <= 1e-6;
      const directionTypes = children(child, 'direction-type');
      let text = '';
      let metronomeBpm: number | undefined;
      let beatUnit = 4;
      let hasKnownDirectionType = false;
      let hasUnknownDirectionType = false;

      for (const directionType of directionTypes) {
        for (const inner of children(directionType)) {
          const innerName = localName(inner);
          if (innerName === 'words') {
            hasKnownDirectionType = true;
            text = text ? `${text} ${textOf(inner)}` : textOf(inner);
          } else if (innerName === 'metronome') {
            hasKnownDirectionType = true;
            const unitNode = firstChild(inner, 'beat-unit');
            const dots = children(inner, 'beat-dot').length;
            beatUnit = Math.max(1, num(textOf(unitNode), 4));
            if (dots > 0) beatUnit = beatUnit * 2 / 3;
            metronomeBpm = num(textOf(firstChild(inner, 'per-minute')), Number.NaN);
          } else if (['segno', 'coda', 'rehearsal', 'dynamics', 'wedge', 'pedal', 'octave-shift', 'harp-pedals', 'dashes', 'bracket', 'eyeglasses', 'string-mute', 'scordatura', 'image', 'principal-voice', 'accordion-registration', 'staff-divide'].includes(innerName)) {
            hasKnownDirectionType = true;
            if (innerName === 'segno') {
              const boundary = atStart ? 'measure-start' : 'measure-end';
              attachMarker(diagnostics, { kind: 'segno', measureIndex: index, atQuarter: position, boundary, text: '𝄋 Segno' }, numberAttr, partId);
            }
            if (innerName === 'coda') {
              const boundary = atStart ? 'measure-start' : 'measure-end';
              attachMarker(diagnostics, { kind: 'coda', measureIndex: index, atQuarter: position, boundary, text: '𝄌 Coda' }, numberAttr, partId);
            }
          } else if (innerName !== 'offset' && innerName !== 'footnote' && innerName !== 'level') {
            hasUnknownDirectionType = true;
          }
        }
      }

      if (hasUnknownDirectionType) {
        diag(diagnostics, 'error', 'UNSUPPORTED_DIRECTION_TYPE', `发现无法用于构造演奏路径的 direction-type：${directionTypes.map((d) => Array.from(d.children).map(localName).join(', ')).join('; ')}`, { measureIndex: index, measureLabel: numberAttr, partId });
      }

      const parsedText = text ? parseNavigationText(text, index, position, maxPosition) : undefined;
      for (const mark of parsedText?.marks ?? []) {
        if (mark.kind === 'unknown') {
          diag(diagnostics, 'error', 'UNSUPPORTED_NAVIGATION_TEXT', `不支持或无法闭合的导航文字“${mark.text}”，不会静默按页后顺序处理。`, { measureIndex: index, measureLabel: numberAttr, partId });
        } else {
          attachMarker(diagnostics, { ...mark, measureIndex: index, atQuarter: position }, numberAttr, partId);
        }
      }

      const sound = firstChild(child, 'sound');
      if (sound) {
        const soundBoundary = atStart ? 'measure-start' : 'measure-end';
        addSoundMarkers(sound, index, position, soundBoundary, numberAttr, partId, diagnostics);
        const tempoAttr = sound.getAttribute('tempo');
        if (tempoAttr !== null) {
          const bpm = num(tempoAttr, Number.NaN);
          if (Number.isFinite(bpm)) {
            metronomeBpm = bpm;
            beatUnit = 4;
            text ||= `♩ = ${Math.round(bpm)}`;
          }
        }
      }

      let bpm = metronomeBpm ?? parsedText?.bpmText?.value;
      const unit = metronomeBpm ? beatUnit : parsedText?.bpmText?.beatUnit ?? 4;
      if (text && bpm === undefined && parsedText?.bpmText) bpm = parsedText.bpmText.value;
      if (Number.isNaN(bpm)) {
        if (compactText(text) === 'atempo' && previousNumericBpms.length) bpm = previousNumericBpms.at(-1);
        if (compactText(text) === 'tempoprimo' && firstNumericBpm !== undefined) bpm = firstNumericBpm;
      }
      if (bpm !== undefined && Number.isFinite(bpm)) {
        const quarterBpm = Number(bpm) * 4 / unit;
        localTempoEvents.push({ atQuarter: position, measureIndex: index, bpm: quarterBpm, beatUnit: unit, label: text || `♩ = ${Math.round(quarterBpm)}` });
        previousNumericBpms.push(quarterBpm);
        firstNumericBpm ??= quarterBpm;
      } else if (text && GRADUAL_TEMPO.some((word) => new RegExp(`\\b${word.replace('.', '\\.?')}\\b`, 'i').test(text))) {
        diag(diagnostics, 'warning', 'GRADUAL_TEMPO_APPROXIMATED', `渐变速度“${text}”未给终点速度；节拍参考按当前速度等速计算，请添加明确 BPM 分段。`, { measureIndex: index, measureLabel: numberAttr, partId });
      }
      if (!hasKnownDirectionType && !sound && !hasUnknownDirectionType) {
        // Empty <direction> carries no playback semantics.
      }
    }
  }

  partState.divisions = Math.max(1, divisions);
  partState.beats = beats;
  partState.beatType = beatType;

  const nominalQuarters = (4 * beats) / beatType;
  return {
    index,
    numberAttr,
    implicit,
    divisions: Math.max(1, divisions),
    beats,
    beatType,
    durationQuarters: maxPosition || nominalQuarters,
    forwardRepeat,
    backwardRepeat,
    repeatTimes,
    rawEndings,
    localTempoEvents
  };
}

function attachMarker(diagnostics: Diagnostic[], mark: NavigationMark, measureLabel: string, partId: string): void {
  if (mark.boundary === 'within-measure') {
    diag(diagnostics, 'error', 'MID_MEASURE_NAVIGATION_UNSUPPORTED', `导航记号“${mark.text}”位于小节中间；当前演奏路径构造器只支持整小节边界跳转。`, { measureIndex: mark.measureIndex, measureLabel, partId });
    return;
  }
  if (mark.kind === 'dacapo' || mark.kind === 'dalsegno' || mark.kind === 'tocoda') {
    mark.boundary = 'measure-end';
  }
  markersGlobal.push(mark);
}

let markersGlobal: NavigationMark[] = [];

function addSoundMarkers(sound: Element, measureIndex: number, atQuarter: number, boundary: NavigationMark['boundary'], measureLabel: string, partId: string, diagnostics: Diagnostic[]): void {
  const supported = new Set(['tempo', 'fine', 'segno', 'coda', 'da-capo', 'dal-segno', 'to-coda']);
  for (const attr of Array.from(sound.attributes)) {
    if (!supported.has(attr.name)) {
      diag(diagnostics, 'error', 'UNSUPPORTED_SOUND_ATTRIBUTE', `不认识的 <sound> 播放属性“${attr.name}”，无法保证演奏路径正确。`, { measureIndex, measureLabel, partId });
    }
  }
  const add = (kind: NavigationKind, text: string): void => attachMarker(diagnostics, { kind, measureIndex, atQuarter, boundary, text }, measureLabel, partId);
  if (sound.hasAttribute('segno')) add('segno', 'Segno');
  if (sound.hasAttribute('coda')) add('coda', 'Coda');
  if (sound.hasAttribute('fine')) add('fine', 'Fine');
  if (sound.hasAttribute('da-capo')) add('dacapo', 'D.C.');
  if (sound.hasAttribute('dal-segno')) add('dalsegno', 'D.S.');
  if (sound.hasAttribute('to-coda')) add('tocoda', 'To Coda');
}

function resolveEndings(raw: RawEnding[], measureCount: number, diagnostics: Diagnostic[]): EndingRange[] {
  const ranges: EndingRange[] = [];
  const open = new Map<string, EndingRange>();

  for (const mark of raw.sort((a, b) => a.measureIndex - b.measureIndex || (a.boundary === b.boundary ? 0 : a.boundary === 'start' ? -1 : 1))) {
    const key = mark.numbers.join(',');
    if (mark.boundary === 'start') {
      if (open.has(key)) {
        diag(diagnostics, 'error', 'OVERLAPPING_VOLTA', `跳房 ${key} 在上一个结束标记前再次开始。`, { measureIndex: mark.measureIndex });
      }
      const range: EndingRange = { start: mark.measureIndex, end: measureCount - 1, numbers: mark.numbers, open: true };
      open.set(key, range);
      ranges.push(range);
    } else {
      const range = Array.from(open.values()).find((candidate) => candidate.numbers.join(',') === key) ?? ranges.filter((r) => r.open).at(-1);
      if (!range) {
        diag(diagnostics, 'error', 'UNMATCHED_VOLTA_END', `跳房 ${key} 有结束标记但找不到开始标记。`, { measureIndex: mark.measureIndex });
        continue;
      }
      range.end = mark.measureIndex;
      range.open = false;
      open.delete(range.numbers.join(','));
    }
  }

  for (const range of ranges) {
    if (range.end < range.start) {
      diag(diagnostics, 'error', 'EMPTY_VOLTA', `跳房 ${range.numbers.join(',')} 不包含任何小节。`, { measureIndex: range.start });
    }
  }
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i]!;
      const b = ranges[j]!;
      if (a.start <= b.end && b.start <= a.end) {
        diag(diagnostics, 'error', 'OVERLAPPING_VOLTA', `跳房 ${a.numbers.join(',')} 与 ${b.numbers.join(',')} 的小节范围重叠。`, { measureIndex: b.start });
      }
    }
  }
  return ranges.sort((a, b) => a.start - b.start || a.end - b.end);
}

function associateEnding(range: EndingRange, repeats: RepeatRegion[], diagnostics: Diagnostic[]): RepeatRegion | undefined {
  const candidates = repeats.filter((repeat) => repeat.forward <= range.start && repeat.backward >= range.start - 1);
  const chosen = candidates.sort((a, b) => b.backward - a.backward)[0];
  if (!chosen) {
    diag(diagnostics, 'error', 'VOLTA_WITHOUT_REPEAT', `跳房 ${range.numbers.join(',')}（书面小节 ${range.start + 1}–${range.end + 1}）找不到可闭合的后反复记号。`, { measureIndex: range.start });
  }
  return chosen;
}

function buildPath(measures: ParsedMeasure[], markers: NavigationMark[], diagnostics: Diagnostic[]): PathStep[] {
  const repeats: RepeatRegion[] = [];
  const forwardStack: number[] = [];
  measures.forEach((measure, index) => {
    if (measure.forwardRepeat) forwardStack.push(index);
    if (measure.backwardRepeat) {
      let forward = forwardStack.pop();
      while (forward !== undefined && forward > index) forward = forwardStack.pop();
      repeats.push({ id: repeats.length, forward: forward ?? 0, backward: index, times: measure.repeatTimes ?? 2 });
    }
  });

  const endingAssociations = new Map<EndingRange, RepeatRegion>();
  for (const range of Array.from(new Set(measures.flatMap((m) => m.endingRanges)))) {
    const associated = associateEnding(range, repeats, diagnostics);
    if (associated) endingAssociations.set(range, associated);
  }

  const segnos = markers.filter((m) => m.kind === 'segno');
  const codas = markers.filter((m) => m.kind === 'coda');
  const wordJumps = markers.filter((m) => m.kind === 'dacapo' || m.kind === 'dalsegno');
  const fines = markers.filter((m) => m.kind === 'fine');
  const toCodas = markers.filter((m) => m.kind === 'tocoda');
  if (segnos.length > 1) diag(diagnostics, 'warning', 'MULTIPLE_SEGNO', `检测到 ${segnos.length} 个 Segno；D.S. 将使用第一个。`);
  if (codas.length > 1) diag(diagnostics, 'warning', 'MULTIPLE_CODA', `检测到 ${codas.length} 个 Coda；跳转将使用第一个。`);
  for (const jump of wordJumps) {
    const isDs = jump.kind === 'dalsegno' || matchesInstruction(jump.text, 'ds');
    const alFine = markers.some((m) => m.measureIndex === jump.measureIndex && m.kind === 'alFine') || matchesInstruction(jump.text, 'alFine');
    const alCoda = markers.some((m) => m.measureIndex === jump.measureIndex && m.kind === 'alCoda') || matchesInstruction(jump.text, 'alCoda');
    if (isDs && !segnos.length) diag(diagnostics, 'error', 'DAL_SEGNO_WITHOUT_SEGNO', `D.S.（书面小节 ${jump.measureIndex + 1}）找不到 Segno。`);
    const isDc = jump.kind === 'dacapo' || (!isDs && matchesInstruction(jump.text, 'dc'));
    if (!isDs && !isDc) diag(diagnostics, 'error', 'UNKNOWN_WORD_RETURN', `无法识别的返始跳转“${jump.text}”。`, { measureIndex: jump.measureIndex });
    if ((isDs || isDc) && !alFine && !alCoda) {
      diag(diagnostics, 'error', 'WORD_RETURN_WITHOUT_TERMINATION', `“${jump.text}”没有 al Fine、al Coda 或等效终止目标。`, { measureIndex: jump.measureIndex });
    }
    if (alFine && !fines.length) diag(diagnostics, 'error', 'AL_FINE_WITHOUT_FINE', `“${jump.text}”找不到 Fine。`, { measureIndex: jump.measureIndex });
    if (alCoda) {
      if (!codas.length) diag(diagnostics, 'error', 'AL_CODA_WITHOUT_CODA', `“${jump.text}”找不到 Coda。`, { measureIndex: jump.measureIndex });
      if (!toCodas.length) diag(diagnostics, 'error', 'AL_CODA_WITHOUT_TO_CODA', `“${jump.text}”找不到 To Coda 分叉点。`, { measureIndex: jump.measureIndex });
    }
  }
  if (fines.length && !wordJumps.some((j) => {
    return markers.some((m) => m.measureIndex === j.measureIndex && m.kind === 'alFine') || matchesInstruction(j.text, 'alFine');
  })) {
    diag(diagnostics, 'info', 'FINE_WITHOUT_RETURN', 'Fine 没有配合 D.C./D.S. al Fine；首遍经过时不会停止。');
  }

  const hasFatal = diagnostics.some((d) => d.severity === 'error');
  if (hasFatal) return [];

  const steps: PathStep[] = [];
  const counters = new Map<number, number>();
  const consumedJumps = new Set<number>();
  let state = 0;
  let pass = 1;
  let repeatsActive = true;
  let fineArmed = false;
  let codaArmed = false;
  let guard = 0;

  const markersAt = (index: number, boundary: NavigationMark['boundary']): NavigationMark[] =>
    markers.filter((m) => m.measureIndex === index && m.boundary === boundary);

  while (state < measures.length) {
    if (++guard > 10_000) {
      diag(diagnostics, 'error', 'PATH_LIMIT', '演奏路径超过 10000 个小节，可能存在无限跳转。');
      return [];
    }
    const measure = measures[state]!;

    for (const marker of markersAt(state, 'measure-start')) {
      if (marker.kind === 'fine' && fineArmed) {
        steps.at(-1)?.events.push({ type: 'fine-stop', fromMeasure: state, label: `Fine：停在书面小节 ${state + 1} 前` });
        return finalize(steps);
      }
      if (marker.kind === 'tocoda' && codaArmed) {
        const target = codas[0]!;
        steps.at(-1)?.events.push({ type: 'coda-jump', fromMeasure: state, toMeasure: target.measureIndex, label: `To Coda：小节 ${state + 1} → Coda 小节 ${target.measureIndex + 1}` });
        state = target.measureIndex;
        codaArmed = false;
        continue;
      }
    }

    let endingNumber: number | undefined;
    const endingRange = measure.endingRanges[0];
    if (endingRange && repeatsActive) {
      const region = endingAssociations.get(endingRange);
      if (region) {
        const count = counters.get(region.id) ?? 1;
        if (!endingRange.numbers.includes(count)) {
          const jumpTo = endingRange.end + 1;
          steps.at(-1)?.events.push({ type: 'volta-skip', fromMeasure: state, toMeasure: jumpTo, pass, label: `第 ${count} 遍跳过跳房 ${endingRange.numbers.join('/')}：书面小节 ${state + 1} → ${jumpTo + 1}` });
          state = jumpTo;
          continue;
        }
        endingNumber = count;
      }
    }

    for (const repeat of repeats) {
      if (repeat.forward === state && repeatsActive && !counters.has(repeat.id)) counters.set(repeat.id, 1);
    }

    const events: PathEvent[] = [];
    if (steps.length === 0) events.push({ type: 'enter', toMeasure: state, pass, label: `开始：书面小节 ${state + 1}` });
    else {
      const previous = steps.at(-1)!;
      if (state !== previous.measureIndex + 1 || pass !== previous.pass) events.push({ type: 'enter', toMeasure: state, pass, label: `到达书面小节 ${state + 1}` });
    }

    const step: PathStep = {
      occurrence: steps.length + 1,
      measureIndex: state,
      measureLabel: measure.number,
      pass,
      startQuarter: 0,
      durationQuarters: measure.durationQuarters,
      startTimeSeconds: 0,
      endTimeSeconds: 0,
      endingNumber,
      events
    };
    steps.push(step);

    for (const marker of markersAt(state, 'measure-end')) {
      if (marker.kind === 'fine' && fineArmed) {
        events.push({ type: 'fine-stop', fromMeasure: state, label: `Fine：停在书面小节 ${state + 1} 末` });
        return finalize(steps);
      }
      if (marker.kind === 'tocoda' && codaArmed) {
        const target = codas[0]!;
        events.push({ type: 'coda-jump', fromMeasure: state, toMeasure: target.measureIndex, label: `To Coda：小节 ${state + 1} → Coda 小节 ${target.measureIndex + 1}` });
        state = target.measureIndex;
        codaArmed = false;
        continue;
      }
      if ((marker.kind === 'dacapo' || marker.kind === 'dalsegno') && !consumedJumps.has(markers.indexOf(marker))) {
        const isDs = marker.kind === 'dalsegno' || matchesInstruction(marker.text, 'ds');
        const isDc = marker.kind === 'dacapo' || (!isDs && matchesInstruction(marker.text, 'dc'));
        const alFine = markers.some((m) => m.measureIndex === marker.measureIndex && m.kind === 'alFine') || matchesInstruction(marker.text, 'alFine');
        const alCoda = markers.some((m) => m.measureIndex === marker.measureIndex && m.kind === 'alCoda') || matchesInstruction(marker.text, 'alCoda');
        const target = isDs ? segnos[0]!.measureIndex : 0;
        events.push({ type: 'word-jump', fromMeasure: state, toMeasure: target, pass: pass + 1, label: `${marker.text}：书面小节 ${state + 1} → ${target + 1}` });
        consumedJumps.add(markers.indexOf(marker));
        repeatsActive = false;
        counters.clear();
        fineArmed = alFine;
        codaArmed = alCoda;
        state = target;
        pass += 1;
        continue;
      }
    }

    if (measure.backwardRepeat && repeatsActive) {
      const repeat = repeats.filter((r) => r.backward === state).sort((a, b) => b.forward - a.forward)[0]!;
      const count = counters.get(repeat.id) ?? 1;
      if (count < repeat.times) {
        counters.set(repeat.id, count + 1);
        events.push({ type: 'back-repeat', fromMeasure: state, toMeasure: repeat.forward, pass: count + 1, label: `后反复：第 ${count} 遍结束，回到书面小节 ${repeat.forward + 1}（第 ${count + 1} 遍）` });
        state = repeat.forward;
        continue;
      }
      counters.delete(repeat.id);
    }

    state += 1;
  }

  steps.at(-1)?.events.push({ type: 'end', label: '演奏路径结束' });
  return finalize(steps);
}

function finalize(steps: PathStep[]): PathStep[] {
  let quarter = 0;
  for (const step of steps) {
    step.startQuarter = quarter;
    quarter += step.durationQuarters;
  }
  return steps;
}

function buildBeatEvents(steps: PathStep[], measures: ParsedMeasure[]): { beats: BeatEvent[]; total: number } {
  const allTempoEvents: (TempoEvent & { globalQuarter: number })[] = [];
  for (const step of steps) {
    for (const event of measures[step.measureIndex]!.tempoEvents) {
      allTempoEvents.push({ ...event, globalQuarter: step.startQuarter + event.atQuarter });
    }
  }
  allTempoEvents.sort((a, b) => a.globalQuarter - b.globalQuarter || a.measureIndex - b.measureIndex);

  const boundaries = [
    ...allTempoEvents.map((event) => event.globalQuarter),
    ...steps.map((step) => step.startQuarter + step.durationQuarters)
  ].sort((a, b) => a - b);
  const intervals: { start: number; end: number; bpm: number }[] = [];
  let defaultBpm = 90;
  let tempoIndex = 0;
  for (const boundary of boundaries) {
    const start = intervals.at(-1)?.end ?? 0;
    while (tempoIndex < allTempoEvents.length && allTempoEvents[tempoIndex]!.globalQuarter <= boundary + 1e-6) {
      defaultBpm = allTempoEvents[tempoIndex]!.bpm;
      tempoIndex += 1;
    }
    if (boundary > start + 1e-6) intervals.push({ start, end: boundary, bpm: defaultBpm });
  }

  let elapsed = 0;
  let intervalIndex = 0;
  const beats: BeatEvent[] = [];
  const timeAt = (globalQuarter: number): number => {
    let result = elapsed;
    while (intervalIndex < intervals.length && intervals[intervalIndex]!.end <= globalQuarter + 1e-6) {
      const interval = intervals[intervalIndex]!;
      result += (interval.end - interval.start) * 60 / interval.bpm;
      intervalIndex += 1;
      elapsed = result;
    }
    const current = intervals[intervalIndex];
    if (current) result += Math.max(0, globalQuarter - current.start) * 60 / current.bpm;
    return result;
  };

  const bpmAt = (globalQuarter: number): number => {
    let active = 90;
    for (const event of allTempoEvents) {
      if (event.globalQuarter <= globalQuarter + 1e-6) active = event.bpm;
      else break;
    }
    return active;
  };

  for (const step of steps) {
    const measure = measures[step.measureIndex]!;
    const grid = 4 / measure.beatType;
    const clickPositions: number[] = [];
    for (let q = 0; q + 1e-6 < measure.durationQuarters; q += grid) clickPositions.push(q);

    step.startTimeSeconds = timeAt(step.startQuarter);
    for (const click of clickPositions) {
      const globalClick = step.startQuarter + click;
      const beatNumber = Math.round(click / grid) + 1;
      beats.push({
        stepOccurrence: step.occurrence,
        measureIndex: step.measureIndex,
        atQuarterInMeasure: click,
        globalQuarter: globalClick,
        time: timeAt(globalClick),
        bpm: bpmAt(globalClick),
        accent: beatNumber === 1,
        beatLabel: `${measure.number}.${beatNumber}`
      });
    }
    step.endTimeSeconds = timeAt(step.startQuarter + step.durationQuarters);
    elapsed = step.endTimeSeconds;
  }
  return { beats, total: elapsed };
}

export function parseMusicXml(xmlText: string): ParsedScore {
  markersGlobal = [];
  const diagnostics: Diagnostic[] = [];
  const document = new DOMParser().parseFromString(xmlText, 'application/xml');
  const parseError = document.querySelector('parsererror');
  if (parseError) {
    return { title: 'XML 解析失败', parts: [], measures: [], markers: [], diagnostics: [{ severity: 'error', code: 'INVALID_XML', message: parseError.textContent ?? 'XML 格式无效' }], hasUnsupportedNavigation: true, path: [], events: [], totalDurationSeconds: 0 };
  }
  const root = document.documentElement;
  if (localName(root) !== 'score-partwise') {
    return {
      title: '不支持的谱例',
      parts: [],
      measures: [],
      markers: [],
      diagnostics: [{ severity: 'error', code: 'UNSUPPORTED_ROOT', message: `当前只支持 partwise MusicXML；根元素为 <${localName(root)}>，不会按未知格式猜测。` }],
      hasUnsupportedNavigation: true,
      path: [],
      events: [],
      totalDurationSeconds: 0
    };
  }

  const work = firstChild(root, 'work');
  const title = textOf(work ? firstChild(work, 'work-title') : undefined) || textOf(children(root, 'movement-title')[0]) || '未命名工程';
  const parts: ParsedScore['parts'] = [];
  const knownRootChildren = new Set(['work', 'work-number', 'movement-number', 'movement-title', 'identification', 'defaults', 'credit', 'part-list', 'part']);
  for (const rootChild of children(root)) {
    if (!knownRootChildren.has(localName(rootChild))) {
      diag(diagnostics, 'warning', 'IGNORED_ROOT_ELEMENT', `发现根级元素 <${localName(rootChild)}>；演奏路径不会使用它，但导出时会保留原始 XML。`);
    }
  }

  const partList = firstChild(root, 'part-list');
  if (!partList) {
    diag(diagnostics, 'error', 'MISSING_PART_LIST', 'MusicXML 缺少 <part-list>。');
  }
  for (const scorePart of partList ? children(partList, 'score-part') : []) {
    const id = scorePart.getAttribute('id') ?? `P${parts.length + 1}`;
    const name = textOf(firstChild(scorePart, 'part-name')) || id;
    parts.push({ id, name });
  }

  const partElements = children(root, 'part');
  if (partElements.length !== parts.length) {
    diag(diagnostics, 'warning', 'PART_LIST_MISMATCH', `part-list 中有 ${parts.length} 个声部，XML 中有 ${partElements.length} 个 <part>。`);
  }
  const rawByPart = partElements.map((partElement, partIndex) => {
    const partId = partElement.getAttribute('id') ?? parts[partIndex]?.id ?? `P${partIndex + 1}`;
    const partState = { divisions: 1, beats: 4, beatType: 4 };
    return children(partElement, 'measure').map((measure, index) => parseMeasure(measure, index, partId, diagnostics, partState));
  });

  const measureCount = Math.max(...rawByPart.map((part) => part.length), 0);
  if (!measureCount) diag(diagnostics, 'error', 'NO_MEASURES', '乐谱中没有任何小节。');
  for (let i = 0; i < rawByPart.length; i++) {
    if (rawByPart[i]!.length !== measureCount) diag(diagnostics, 'error', 'PART_MEASURE_COUNT_MISMATCH', `声部 ${parts[i]?.id ?? i} 有 ${rawByPart[i]!.length} 小节；所有声部必须共有同一批小节。`, { partId: parts[i]?.id });
  }

  const allRawEndings = rawByPart.flat();
  const endingRanges = resolveEndings(
    Array.from(new Map(
      allRawEndings.flatMap((m) => m.rawEndings).map((ending) => [
        `${ending.measureIndex}:${ending.boundary}:${ending.type}:${ending.numbers.join('.')}`,
        ending
      ])
    ).values()),
    measureCount,
    diagnostics
  );
  const measures: ParsedMeasure[] = [];
  const tempoByMeasure = new Map<number, TempoEvent[]>();
  for (const partMeasures of rawByPart) {
    for (const raw of partMeasures) {
      const existing = tempoByMeasure.get(raw.index) ?? [];
      for (const event of raw.localTempoEvents) {
        if (!existing.some((candidate) => Math.abs(candidate.atQuarter - event.atQuarter) < 1e-6 && Math.abs(candidate.bpm - event.bpm) < 1e-6)) existing.push(event);
      }
      tempoByMeasure.set(raw.index, existing);
    }
  }

  for (let index = 0; index < measureCount; index++) {
    const representative = rawByPart[0]?.[index];
    if (!representative) continue;
    const nominal = (4 * representative.beats) / representative.beatType;
    let duration = representative.durationQuarters;
    for (let p = 1; p < rawByPart.length; p++) {
      const candidate = rawByPart[p]?.[index]?.durationQuarters;
      if (candidate !== undefined && Math.abs(candidate - duration) > 1e-6) {
        diag(diagnostics, 'warning', 'PART_DURATION_MISMATCH', `书面小节 ${representative.numberAttr} 各声部记谱时长不同（${duration} 与 ${candidate} 个四分音符）；时长计算采用最长声部。`, { measureIndex: index, measureLabel: representative.numberAttr });
        duration = Math.max(duration, candidate);
      }
    }
    const tempoEvents = (tempoByMeasure.get(index) ?? []).sort((a, b) => a.atQuarter - b.atQuarter);
    if (tempoEvents.length > 1) diag(diagnostics, 'info', 'TEMPO_CHANGE_WITHIN_MEASURE', `书面小节 ${representative.numberAttr} 含小节内速度变化，已按变化点分段计时。`, { measureIndex: index, measureLabel: representative.numberAttr });
    const ranges = endingRanges.filter((range) => range.start <= index && index <= range.end);
    const forward = rawByPart.some((part) => part[index]?.forwardRepeat);
    const backwardValues = rawByPart
      .map((part) => part[index]?.backwardRepeat ? part[index]?.repeatTimes ?? 2 : null)
      .filter((value): value is number => value !== null);
    if (backwardValues.some((value) => value !== backwardValues[0])) {
      diag(diagnostics, 'warning', 'REPEAT_TIMES_MISMATCH', `书面小节 ${representative.numberAttr} 各声部的后反复次数不一致；采用最大次数。`, { measureIndex: index, measureLabel: representative.numberAttr });
    }
    measures.push({
      index,
      number: representative.numberAttr,
      numberNumeric: num(representative.numberAttr, index + 1),
      implicit: representative.implicit,
      divisions: representative.divisions,
      beats: representative.beats,
      beatType: representative.beatType,
      durationQuarters: duration || nominal,
      nominalQuarters: nominal,
      isPickup: index === 0 && representative.implicit && duration < nominal,
      forwardRepeat: forward,
      backwardRepeat: backwardValues.length > 0,
      repeatTimes: backwardValues.length ? Math.max(...backwardValues) : null,
      endingRanges: ranges,
      activeEndingNumbers: ranges.flatMap((r) => r.numbers),
      tempoEvents
    });
  }

  const markers = Array.from(new Map(
    markersGlobal.map((marker) => [`${marker.kind}:${marker.measureIndex}:${marker.atQuarter}:${marker.boundary}:${marker.text}`, marker])
  ).values());
  if (!markers.some((m) => m.kind === 'segno')) {
    // no-op, diagnostics are generated only when a D.S. actually requires it.
  }
  const path = buildPath(measures, markers, diagnostics);
  const beatResult = path.length ? buildBeatEvents(path, measures) : { beats: [], total: 0 };
  for (const step of path) step.pass = Math.max(step.pass, 1);
  if (!measures.some((m) => m.tempoEvents.length)) diag(diagnostics, 'info', 'DEFAULT_TEMPO', '乐谱未给速度；节拍参考默认 ♩=90。');

  return {
    title,
    parts,
    measures,
    markers,
    diagnostics,
    hasUnsupportedNavigation: diagnostics.some((d) => d.severity === 'error'),
    path,
    events: beatResult.beats,
    totalDurationSeconds: beatResult.total
  };
}

export type { ParsedMeasure, PathStep, PathEvent, BeatEvent };
