import type {
  BuiltPath,
  EndingInfo,
  JumpKind,
  NavMarker,
  NavType,
  ParseWarning,
  PathStep,
  RepeatInfo,
  TempoEvent,
  TimeSignature,
  WrittenMeasure,
} from './types'

function child(element: Element | null, tag: string): Element | null {
  return element ? Array.from(element.children).find((node) => node.tagName === tag) ?? null : null
}

function children(element: Element, tag: string): Element[] {
  return Array.from(element.children).filter((node) => node.tagName === tag)
}

function textOf(element: Element | null, tag: string): string {
  return child(element, tag)?.textContent?.trim() ?? ''
}

function intAttr(element: Element, name: string, fallback: number): number {
  const raw = element.getAttribute(name)
  const value = raw === null ? NaN : Number.parseInt(raw, 10)
  return Number.isFinite(value) ? value : fallback
}

function numericText(element: Element | null, fallback: number): number {
  const value = Number.parseFloat(element?.textContent ?? '')
  return Number.isFinite(value) ? value : fallback
}

function addWarning(
  list: ParseWarning[],
  level: ParseWarning['level'],
  code: ParseWarning['code'],
  message: string,
  measureNumber?: number,
  xmlPath?: string,
): void {
  list.push({ level, code, message, measureNumber, xmlPath })
}

function endingNumbers(raw: string | null): number[] {
  if (!raw) return [1]
  return raw
    .split(/[\s,]+/)
    .map((part) => Number.parseInt(part, 10))
    .filter((value) => Number.isFinite(value))
}

function normalizeNavText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[．。]/g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

interface NavTextMatch {
  type: NavType
  alFine?: boolean
  alCoda?: boolean
  matched: string
}

function classifyNavText(text: string): NavTextMatch | null {
  const normalized = normalizeNavText(text)
  const patterns: Array<NavTextMatch & { test: RegExp }> = [
    {
      type: 'dacapo',
      alFine: true,
      matched: 'D.C. al Fine',
      test: /\bd\.?\s*c\.?\s*al\s*fine\b|da\s+capo\s+al\s*fine|返始(至|到)?(fine|终止|结束)/,
    },
    {
      type: 'dacapo',
      alCoda: true,
      matched: 'D.C. al Coda',
      test: /\bd\.?\s*c\.?\s*al\s*coda\b|da\s+capo\s*al\s*coda|返始(至|到)?(coda|尾声)/,
    },
    {
      type: 'dalsegno',
      alFine: true,
      matched: 'D.S. al Fine',
      test: /\bd\.?\s*s\.?\s*al\s*fine\b|dal\s*segno\s*al\s*fine|从记号(反复)?(至|到)?(fine|终止|结束)/,
    },
    {
      type: 'dalsegno',
      alCoda: true,
      matched: 'D.S. al Coda',
      test: /\bd\.?\s*s\.?\s*al\s*coda\b|dal\s*segno\s*al\s*coda|从记号(反复)?(至|到)?(coda|尾声)/,
    },
    { type: 'dacapo', matched: 'D.C.', test: /(^|[^a-z])d\.?\s*c\.?([^a-z]|$)|da\s+capo|返始/ },
    { type: 'dalsegno', matched: 'D.S.', test: /(^|[^a-z])d\.?\s*s\.?([^a-z]|$)|dal\s*segno|从记号(反复)?/ },
    { type: 'tocoda', matched: 'To Coda', test: /to\s*coda|jump\s*to\s*coda|跳(至|到|往)?(coda|尾声)/ },
    { type: 'fine', matched: 'Fine', test: /(^|[^a-z])fine([^a-z]|$)|终止|结束(?!线)/ },
    { type: 'coda', matched: 'Coda', test: /(^|[^a-z])coda([^a-z]|$)|尾声/ },
    { type: 'segno', matched: 'Segno', test: /(^|[^a-z])segno([^a-z]|$)|记号(处)?/ },
  ]

  for (const item of patterns) {
    if (item.test.test(normalized)) {
      const { type, matched, alFine, alCoda } = item
      return { type, matched, alFine, alCoda }
    }
  }
  return null
}

function parseMarkers(measure: Element, measureNumber: number, warnings: ParseWarning[]): NavMarker[] {
  const markers: NavMarker[] = []

  for (const direction of children(measure, 'direction')) {
    for (const words of direction.querySelectorAll('words')) {
      const raw = words.textContent ?? ''
      const match = classifyNavText(raw)
      if (match) {
        markers.push({
          type: match.type,
          measureIndex: -1,
          text: match.matched,
          alFine: match.alFine,
          alCoda: match.alCoda,
          consumed: false,
        })
      } else if (/coda|segno|fine|capo|反复|跳|返始|记号|尾声|终止/.test(normalizeNavText(raw))) {
        addWarning(
          warnings,
          'warning',
          'unsupported-jump-word',
          `第 ${measureNumber} 小节发现跳转相关文字“${raw.trim()}”，但它不是本版本明确支持的标准记号，路径不会猜测其含义。`,
          measureNumber,
        )
      }
    }
  }

  for (const sound of Array.from(measure.querySelectorAll('sound'))) {
    if (sound.getAttribute('segno')) {
      markers.push({ type: 'segno', measureIndex: -1, text: 'Segno', consumed: false })
    }
    if (sound.getAttribute('coda')) {
      markers.push({ type: 'coda', measureIndex: -1, text: 'Coda', consumed: false })
    }
  }

  return markers
}

function parseBarlines(measure: Element, measureNumber: number, warnings: ParseWarning[]): {
  repeats: RepeatInfo[]
  endings: EndingInfo[]
} {
  const repeats: RepeatInfo[] = []
  const endings: EndingInfo[] = []

  for (const barline of children(measure, 'barline')) {
    const location = (barline.getAttribute('location') ?? 'right') as RepeatInfo['location']
    const repeatEl = child(barline, 'repeat')
    if (repeatEl) {
      const direction = repeatEl.getAttribute('direction')
      if (direction === 'forward' || direction === 'backward') {
        repeats.push({ location, direction, times: Math.max(1, intAttr(repeatEl, 'times', 1)) })
      } else {
        addWarning(warnings, 'warning', 'unknown', `第 ${measureNumber} 小节 repeat direction="${direction ?? ''}" 无法识别。`, measureNumber)
      }
    }

    for (const endingEl of children(barline, 'ending')) {
      const type = endingEl.getAttribute('type')
      if (type === 'start' || type === 'stop' || type === 'discontinue') {
        endings.push({ location, type, numbers: endingNumbers(endingEl.getAttribute('number')) })
      } else {
        addWarning(warnings, 'warning', 'orphan-ending', `第 ${measureNumber} 小节跳房类型 "${type ?? ''}" 无法识别。`, measureNumber)
      }
    }
  }

  return { repeats, endings }
}

interface PartMeasureInfo {
  partId: string
  partName: string
  elements: Element[]
}

interface DurationInfo {
  quarters: number
  voiceCount: number
  hasMultipleVoices: boolean
  voiceIds: string[]
  noteCount: number
}

function measureDuration(measure: Element, declaredDenominator: number | null, fallbackDivisions: number): DurationInfo {
  const voices = new Map<string, { end: number; count: number }>()
  const divisionsEl = measure.querySelector('attributes > divisions')
  const parsedDivisions = Number.parseFloat(divisionsEl?.textContent ?? '')
  const divisions = Number.isFinite(parsedDivisions) && parsedDivisions > 0 ? parsedDivisions : fallbackDivisions

  for (const noteEl of children(measure, 'note')) {
    if (noteEl.getAttribute('print-spacing') === 'no') continue
    const voice = textOf(noteEl, 'voice') || '1'
    const current = voices.get(voice) ?? { end: 0, count: 0 }
    const backup = child(noteEl, 'backup')
    const forward = child(noteEl, 'forward')
    const duration = numericText(child(noteEl, 'duration'), 0)

    if (backup) {
      current.end = Math.max(0, current.end - numericText(child(backup, 'duration'), 0))
    } else if (forward) {
      current.end += numericText(child(forward, 'duration'), 0)
    } else if (duration > 0) {
      current.end += duration
      current.count += 1
    }
    voices.set(voice, current)
  }

  const fallbackQuarters = declaredDenominator ? 4 / declaredDenominator : 1
  const maxDivisions = Math.max(0, ...Array.from(voices.values()).map((voice) => voice.end))
  const noteCount = Array.from(voices.values()).reduce((sum, voice) => sum + voice.count, 0)
  return {
    quarters: maxDivisions > 0 ? maxDivisions / divisions : fallbackQuarters,
    voiceCount: voices.size || 1,
    hasMultipleVoices: voices.size > 1,
    voiceIds: [...voices.keys()],
    noteCount,
  }
}

function parseTime(measure: Element): TimeSignature | null {
  const attributes = child(measure, 'attributes')
  const time = attributes ? child(attributes, 'time') : null
  if (!time) return null
  const numerator = Number.parseInt(textOf(time, 'beats'), 10)
  const denominator = Number.parseInt(textOf(time, 'beat-type'), 10)
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null
  return { numerator, denominator, beatUnitSeconds: (4 / denominator) * 1 }
}

function beatUnitToQuarters(unit: string, dots: number): number {
  const baseMap: Record<string, number> = {
    whole: 4,
    half: 2,
    quarter: 1,
    eighth: 0.5,
    '16th': 0.25,
    '32nd': 0.125,
  }
  const base = baseMap[unit] ?? 1
  return dots === 1 ? base * 1.5 : dots === 2 ? base * 1.75 : base
}

export interface ParsedScore {
  measures: WrittenMeasure[]
  tempos: TempoEvent[]
  warnings: ParseWarning[]
  partCount: number
}

export function parseMusicXml(xml: string): ParsedScore {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    throw new Error(`MusicXML 无法解析：${parserError.textContent ?? 'XML 语法错误'}`)
  }

  const root = doc.documentElement
  if (!root || root.tagName !== 'score-partwise') {
    throw new Error('请上传 part-wise MusicXML（.musicxml/.xml）。压缩 .mxl 与 timewise 不在当前明确支持范围内。')
  }

  const warnings: ParseWarning[] = []
  const partList = child(root, 'part-list')
  const scorePartNames = new Map<string, string>()
  if (partList) {
    for (const scorePart of children(partList, 'score-part')) {
      scorePartNames.set(scorePart.getAttribute('id') ?? '', textOf(scorePart, 'part-name'))
    }
  }

  const parts: PartMeasureInfo[] = children(root, 'part').map((part) => {
    const partId = part.getAttribute('id') ?? 'P1'
    return {
      partId,
      partName: scorePartNames.get(partId) || partId,
      elements: children(part, 'measure'),
    }
  })

  const partCount = parts.length
  const lengths = parts.map((part) => part.elements.length)
  if (lengths.some((length) => length !== lengths[0])) {
    addWarning(warnings, 'error', 'different-measure-count', `各声部小节数不一致：${lengths.join(', ')}，不能保证共有小节同步。`)
  }

  const measureCount = Math.max(0, ...lengths)
  if (measureCount === 0) {
    addWarning(warnings, 'error', 'no-measures', '没有找到任何 <measure>。')
    return { measures: [], tempos: [], warnings, partCount }
  }

  const measures: WrittenMeasure[] = []
  const tempos: TempoEvent[] = []
  const partDivisions = new Map(parts.map((part) => [part.partId, 30]))
  let currentTime: TimeSignature | null = null
  let currentBpm = 90

  for (let index = 0; index < measureCount; index += 1) {
    const measure = parts[0]?.elements[index]
    if (!measure) break
    const explicitNumberRaw = measure.getAttribute('number') ?? String(index + 1)
    const implicit = measure.getAttribute('implicit') === 'yes'
    const number = explicitNumberRaw
    const barlines = parseBarlines(measure, index + 1, warnings)
    const navMarkers = parseMarkers(measure, index + 1, warnings)
    navMarkers.forEach((marker) => { marker.measureIndex = index })

    const time = parseTime(measure)
    if (time) {
      if (currentTime && (currentTime.numerator !== time.numerator || currentTime.denominator !== time.denominator)) {
        addWarning(warnings, 'info', 'time-signature-change', `第 ${number} 小节变为 ${time.numerator}/${time.denominator}，时长计算按新拍号处理。`, index + 1)
      }
      currentTime = time
    }

    for (const sound of Array.from(measure.querySelectorAll('sound'))) {
      const tempoValue = Number(sound.getAttribute('tempo'))
      if (Number.isFinite(tempoValue) && tempoValue > 0) {
        currentBpm = tempoValue
        tempos.push({ measureIndex: index, bpm: tempoValue, label: `♩ = ${Math.round(tempoValue)}`, source: 'sound' })
      }
    }

    for (const metronome of Array.from(measure.querySelectorAll('metronome'))) {
      const beatUnit = textOf(metronome, 'beat-unit') || 'quarter'
      const dots = metronome.querySelectorAll('beat-dot').length
      const perMinute = Number.parseInt(textOf(metronome, 'per-minute'), 10)
      if (Number.isFinite(perMinute) && perMinute > 0) {
        const quarterBpm = perMinute / beatUnitToQuarters(beatUnit, dots)
        currentBpm = quarterBpm
        tempos.push({ measureIndex: index, bpm: quarterBpm, label: `♩ ≈ ${Math.round(quarterBpm)}`, source: 'metronome' })
      }
    }

    let maxQuarters = 0
    let voiceCount = 1
    let hasMultipleVoices = false
    const partMeasureCounts: Record<string, number> = {}
    for (const part of parts) {
      const partMeasure = part.elements[index]
      if (!partMeasure) {
        partMeasureCounts[part.partId] = 0
        continue
      }
      const partDivisionsEl = partMeasure.querySelector('attributes > divisions')
      const parsedPartDivisions = Number.parseFloat(partDivisionsEl?.textContent ?? '')
      if (Number.isFinite(parsedPartDivisions) && parsedPartDivisions > 0) {
        partDivisions.set(part.partId, parsedPartDivisions)
      }
      const duration = measureDuration(partMeasure, currentTime?.denominator ?? null, partDivisions.get(part.partId) ?? 1)
      partMeasureCounts[part.partId] = duration.noteCount
      maxQuarters = Math.max(maxQuarters, duration.quarters)
      voiceCount = Math.max(voiceCount, duration.voiceCount)
      hasMultipleVoices = hasMultipleVoices || duration.hasMultipleVoices
    }

    const declaredQuarters = currentTime ? (currentTime.numerator * 4) / currentTime.denominator : null
    const isPickup = implicit || (index === 0 && declaredQuarters !== null && maxQuarters < declaredQuarters)
    measures.push({
      index,
      number,
      implicit,
      durationQuarters: maxQuarters || declaredQuarters || 1,
      declaredDurationQuarters: declaredQuarters,
      isPickup,
      hasMultipleVoices,
      voiceCount,
      partMeasureCounts,
      timeSignature: currentTime ? { ...currentTime } : null,
      repeats: barlines.repeats,
      endings: barlines.endings,
      navMarkers,
      warnings: [],
    })
  }

  validateScore(measures, warnings)
  if (!tempos.length) tempos.push({ measureIndex: 0, bpm: currentBpm, label: '默认 ♩ = 90', source: 'default' })

  return { measures, tempos, warnings, partCount }
}

interface EndingRange {
  numbers: number[]
  start: number
  end: number | null
}

function computeEndingRanges(measures: WrittenMeasure[], warnings?: ParseWarning[]): EndingRange[] {
  const report = (message: string, measureIndex: number): void => {
    if (warnings) addWarning(warnings, 'warning', 'orphan-ending', message, measureIndex + 1)
  }
  const ranges: EndingRange[] = []
  let open: EndingRange[] = []

  for (const measure of measures) {
    for (const ending of measure.endings.filter((item) => item.location === 'left' && item.type === 'start')) {
      const range: EndingRange = { numbers: ending.numbers, start: measure.index, end: null }
      ranges.push(range)
      open.push(range)
    }

    for (const ending of measure.endings.filter((item) => item.type === 'stop' || item.type === 'discontinue')) {
      const matches = open.filter((range) => range.numbers.some((number) => ending.numbers.includes(number)))
      if (matches.length) {
        for (const range of matches) {
          if (range.end === null) range.end = ending.location === 'left' ? measure.index - 1 : measure.index
        }
        if (ending.type === 'stop') {
          open = open.filter((range) => !matches.includes(range))
        }
        continue
      }

      const alreadyClosed = ranges.some(
        (range) =>
          range.end !== null &&
          range.numbers.some((number) => ending.numbers.includes(number)) &&
          (ending.location === 'left' ? measure.index === range.end + 1 : measure.index === range.end),
      )
      if (!alreadyClosed) {
        report(`第 ${measure.number} 小节有未开始的跳房结束记号。`, measure.index)
      }
    }
  }

  for (const range of ranges.filter((item) => item.end === null)) {
    report(`第 ${measures[range.start].number} 小节开始的跳房 ${range.numbers.join('/')} 没有结束。`, range.start)
    range.end = measures.length - 1
  }

  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      const a = ranges[i]
      const b = ranges[j]
      const aEnd = a.end ?? measures.length - 1
      const bEnd = b.end ?? measures.length - 1
      if (a.numbers.some((number) => b.numbers.includes(number)) && a.start <= bEnd && b.start <= aEnd) {
      if (warnings) {
        addWarning(warnings, 'error', 'overlapping-ending', `跳房 ${a.numbers.join('/')} 与 ${b.numbers.join('/')} 范围重叠。`, a.start + 1)
      }
      }
    }
  }

  return ranges
}

function validateScore(measures: WrittenMeasure[], warnings: ParseWarning[]): void {
  computeEndingRanges(measures, warnings)

  const forwardIndices = measures
    .filter((measure) => measure.repeats.some((repeat) => repeat.direction === 'forward' && repeat.location === 'left'))
    .map((measure) => measure.index)
  const backwardIndices = new Set(
    measures
      .filter((measure) => measure.repeats.some((repeat) => repeat.direction === 'backward' && repeat.location === 'right'))
      .map((measure) => measure.index),
  )

  for (const forward of forwardIndices) {
    if (![...backwardIndices].some((back) => back > forward)) {
      addWarning(warnings, 'warning', 'missing-back-repeat', `第 ${measures[forward].number} 小节有前反复，但之后没有匹配的后反复。`, forward + 1)
    }
  }

  for (const back of backwardIndices) {
    const hasPreviousForward = forwardIndices.some((forward) => forward < back)
    if (!hasPreviousForward) {
      addWarning(warnings, 'info', 'missing-forward-repeat', `第 ${measures[back].number} 小节的后反复没有显式起点，按乐曲开头处理。`, back + 1)
    }
  }

  const markers = measures.flatMap((measure) => measure.navMarkers)
  const count = (type: NavType): number => markers.filter((marker) => marker.type === type).length
  if (count('dalsegno') && !count('segno')) {
    addWarning(warnings, 'error', 'missing-segno', 'D.S. 找不到 Segno 目标，演奏路径无法闭合。')
  }
  if (count('segno') > 1) addWarning(warnings, 'warning', 'duplicate-segno', `发现 ${count('segno')} 个 Segno，本版本使用第一个。`)
  if (count('tocoda') && !markers.some((marker) => (marker.type === 'dacapo' || marker.type === 'dalsegno') && marker.alCoda)) {
    addWarning(warnings, 'error', 'unclosed-jump', 'To Coda 需要配套 D.C. al Coda 或 D.S. al Coda，否则第二次到达条件不明确。')
  }
  if (markers.some((marker) => (marker.type === 'dacapo' || marker.type === 'dalsegno') && marker.alCoda) && !count('tocoda')) {
    addWarning(warnings, 'error', 'unclosed-jump', 'al Coda 找不到 To Coda 跳转点，演奏路径无法闭合。')
  }
  if (count('tocoda') && !count('coda')) {
    addWarning(warnings, 'error', 'missing-coda', 'To Coda 找不到 Coda 目标，演奏路径无法闭合。')
  }
  if (count('coda') > 1) addWarning(warnings, 'warning', 'duplicate-coda', `发现 ${count('coda')} 个 Coda，本版本使用第一个。`)
  if (markers.some((marker) => (marker.type === 'dacapo' || marker.type === 'dalsegno') && marker.alFine) && !count('fine')) {
    addWarning(warnings, 'error', 'missing-fine', 'al Fine 找不到 Fine，演奏路径无法闭合。')
  }
  if (count('fine') > 1) addWarning(warnings, 'warning', 'multiple-fine', `发现 ${count('fine')} 个 Fine，本版本使用第一个。`)
}

function tempoAt(tempos: TempoEvent[], index: number): TempoEvent {
  return [...tempos].reverse().find((tempo) => tempo.measureIndex <= index) ?? tempos[0]
}

function endingPass(startIndex: number, backCounts: Map<number, number>): number {
  const priorCounts = [...backCounts.entries()].filter(([backRepeatIndex]) => backRepeatIndex <= startIndex).map(([, count]) => count)
  return 1 + (priorCounts.length ? Math.max(...priorCounts) : 0)
}

function rangesContaining(ranges: EndingRange[], index: number): EndingRange[] {
  return ranges.filter((range) => range.start <= index && (range.end ?? Number.MAX_SAFE_INTEGER) >= index)
}

export function buildPerformancePath(score: ParsedScore): BuiltPath {
  const warnings = score.warnings.map((item) => ({ ...item }))
  const endingRanges = computeEndingRanges(score.measures, warnings)
  const steps: PathStep[] = []
  const arrivalsMap = new Map<number, number[]>()
  const backCounts = new Map<number, number>()
  const consumedJumps = new Set<string>()
  let fineArmed = false
  let codaArmed = false
  let index = 0
  let incoming: JumpKind = 'straight'
  let event = '乐曲开头'
  let elapsed = 0
  const maxSteps = score.measures.length * 20 + 50

  const addStep = (): void => {
    const measure = score.measures[index]
    const tempo = tempoAt(score.tempos, index)
    const containing = rangesContaining(endingRanges, index)
    const passValues = containing.map((range) => endingPass(range.start, backCounts))
    const activeEndingNumbers = containing
      .filter((range, rangeIndex) => range.numbers.includes(passValues[rangeIndex]))
      .flatMap((range) => range.numbers)
    const durationSeconds = (measure.durationQuarters * 60) / tempo.bpm
    const occurrence = steps.filter((step) => step.measureIndex === index).length + 1
    steps.push({
      occurrence,
      measureIndex: index,
      measureNumber: measure.number,
      iteration: Math.max(1, ...passValues),
      bpm: tempo.bpm,
      durationSeconds,
      startSeconds: elapsed,
      endSeconds: elapsed + durationSeconds,
      activeEndingNumbers: [...new Set(activeEndingNumbers)],
      incomingJump: incoming,
      event,
      isPickup: measure.isPickup,
    })
    arrivalsMap.set(index, [...(arrivalsMap.get(index) ?? []), occurrence])
    elapsed += durationSeconds
  }

  while (steps.length < maxSteps) {
    const measure = score.measures[index]
    const startingRanges = endingRanges.filter((range) => range.start === index)
    if (startingRanges.length) {
      const pass = endingPass(index, backCounts)
      const allowed = startingRanges.some((range) => range.numbers.includes(pass))
      if (!allowed) {
        const nextIndex = Math.max(...startingRanges.map((range) => (range.end ?? index) + 1))
        incoming = 'volta-skip'
        event = `第 ${pass} 遍跳过跳房 ${startingRanges.flatMap((range) => range.numbers).join('/')}`
        index = nextIndex
        if (index >= score.measures.length) {
          incoming = 'end'
          event = '跳房后到达乐曲结束'
          break
        }
        continue
      }
    }

    addStep()

    if (fineArmed && measure.navMarkers.some((marker) => marker.type === 'fine')) {
      incoming = 'fine-stop'
      event = 'Fine：返始后终止'
      break
    }

    const backRepeat = measure.repeats.find((repeat) => repeat.direction === 'backward' && repeat.location === 'right')
    if (backRepeat) {
      const count = backCounts.get(index) ?? 0
      if (count < backRepeat.times) {
        backCounts.set(index, count + 1)
        const priorForward = [...score.measures.slice(0, index + 1)].reverse().find((candidate) =>
          candidate.repeats.some((repeat) => repeat.direction === 'forward' && repeat.location === 'left'),
        )
        index = priorForward?.index ?? 0
        incoming = 'repeat-back'
        event = `后反复第 ${count + 1}/${backRepeat.times} 次`
        continue
      }
    }

    const returnTrigger = measure.navMarkers.find(
      (marker) => (marker.type === 'dacapo' || marker.type === 'dalsegno') && !consumedJumps.has(`${marker.type}-${index}`),
    )
    if (returnTrigger) {
      consumedJumps.add(`${returnTrigger.type}-${index}`)
      fineArmed = Boolean(returnTrigger.alFine)
      codaArmed = Boolean(returnTrigger.alCoda)

      if (returnTrigger.type === 'dacapo') {
        index = 0
        incoming = 'da-capo'
        event = returnTrigger.alFine
          ? 'D.C. al Fine：返回开头，至 Fine 停止'
          : returnTrigger.alCoda
            ? 'D.C. al Coda：返回开头，再跳 Coda'
            : 'D.C.：返回开头'
        continue
      }

      const target = score.measures.findIndex((candidate) => candidate.navMarkers.some((marker) => marker.type === 'segno'))
      if (target < 0) {
        addWarning(warnings, 'error', 'unclosed-jump', `第 ${measure.number} 小节的 D.S. 无法闭合：缺少 Segno。`, measure.index + 1)
        break
      }
      index = target
      incoming = 'dal-segno'
      event = returnTrigger.alFine
        ? 'D.S. al Fine：返回 Segno，至 Fine 停止'
        : returnTrigger.alCoda
          ? 'D.S. al Coda：返回 Segno，再跳 Coda'
          : 'D.S.：返回 Segno'
      continue
    }

    const tocoda = measure.navMarkers.find((marker) => marker.type === 'tocoda')
    if (tocoda && codaArmed && !consumedJumps.has(`tocoda-${index}`)) {
      consumedJumps.add(`tocoda-${index}`)
      const target = score.measures.findIndex((candidate) => candidate.navMarkers.some((marker) => marker.type === 'coda'))
      if (target < 0) {
        addWarning(warnings, 'error', 'unclosed-jump', `第 ${measure.number} 小节的 To Coda 无法闭合：缺少 Coda。`, measure.index + 1)
        break
      }
      index = target
      incoming = 'to-coda'
      event = 'To Coda：返始/记号后跳到 Coda'
      codaArmed = false
      continue
    }

    index += 1
    if (index >= score.measures.length) {
      incoming = 'end'
      event = '到达乐曲结束'
      break
    }
    incoming = 'straight'
    event = '顺序进入'
  }

  if (steps.length >= maxSteps) {
    addWarning(warnings, 'error', 'unclosed-jump', '跳转路径超过安全上限，可能存在无限反复或无法闭合的记号。')
  }

  const closed = !warnings.some((warning) => warning.level === 'error') && steps.length < maxSteps
  return {
    steps,
    arrivals: [...arrivalsMap.entries()].map(([measureIndex, occurrences]) => ({ measureIndex, occurrences })),
    totalSeconds: elapsed,
    warnings,
    closed,
  }
}

export function arrivalsFor(path: BuiltPath, measureIndex: number): number[] {
  return path.arrivals.find((item) => item.measureIndex === measureIndex)?.occurrences ?? []
}

export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const rest = seconds - minutes * 60
  return `${minutes}:${rest.toFixed(1).padStart(4, '0')}`
}
