function header(title: string, parts = 1): string {
  const partList = Array.from({ length: parts }, (_, index) => `
    <score-part id="P${index + 1}">
      <part-name>${index === 0 ? '高声部' : '低声部'}</part-name>
    </score-part>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>${title}</work-title></work>
  <part-list>${partList}</part-list>`
}

const footer = `</score-partwise>`

function attributes(beats: number, beatType = 4, withDivisions = false): string {
  return `<attributes>
      ${withDivisions ? `<divisions>30</divisions>` : ''}
      <key><fifths>0</fifths></key>
      <time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>
      <clef><sign>G</sign><line>2</line></clef>
    </attributes>`
}

function pitchParts(pitch: string): { step: string; octave: string } {
  return { step: pitch[0], octave: pitch.slice(-1) }
}

function note(pitch: string, duration: number, voice = 1, chord = false): string {
  const { step, octave } = pitchParts(pitch)
  const type = duration >= 120 ? 'whole' : duration >= 60 ? 'half' : duration >= 30 ? 'quarter' : 'eighth'
  return `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>${type}</type></note>`
}

function rest(duration: number, voice = 1): string {
  const type = duration >= 60 ? 'half' : duration >= 30 ? 'quarter' : 'eighth'
  return `<note><rest/><duration>${duration}</duration><voice>${voice}</voice><type>${type}</type></note>`
}

function backup(duration: number): string {
  return `<backup><duration>${duration}</duration></backup>`
}

interface MeasureOptions {
  number: string | number
  implicit?: boolean
  body: string
  left?: string
  right?: string
}

function measure({ number, implicit, body, left = '', right = '' }: MeasureOptions): string {
  return `<measure number="${number}"${implicit ? ' implicit="yes"' : ''}>
      ${left}${body}${right}
    </measure>`
}

function direction(words: string, tempo?: number): string {
  return `<direction placement="above">
      <direction-type><words>${words}</words></direction-type>
      ${tempo ? `<sound tempo="${tempo}"/>` : ''}
    </direction>`
}

export function fullSampleXml(): string {
  const pickupBody = `${attributes(3, 4, true)}${direction('♩ = 80', 80)}${note('C4', 30)}`
  const upperBodies = [
    `${attributes(4, 4, true)}${note('C4', 120)}`,
    `${direction('♩ = 120', 120)}${note('D4', 120)}`,
    `${note('E4', 60)}${note('F4', 60)}`,
    `${note('G4', 120)}`,
    `${note('A4', 60)}${note('G4', 60)}`,
    `${note('F4', 120)}`,
    `${note('E4', 120)}`,
    `${note('C4', 120)}`,
  ]
  const lowerBodies = [
    `${attributes(4, 4)}${note('C3', 120)}`,
    `${note('C3', 120)}`,
    `${note('G2', 60)}${rest(60)}`,
    `${note('C3', 30, 1)}${note('D3', 30, 1)}${note('E3', 30, 1)}${note('F3', 30, 1)}${backup(120)}${rest(30, 2)}${note('G2', 30, 2)}${note('A2', 30, 2)}${note('B2', 30, 2)}`,
    `${note('A2', 60)}${note('G2', 60)}`,
    `${note('F2', 120)}`,
    `${note('E2', 120)}`,
    `${note('C3', 120)}`,
  ]

  const repeatLeft = '<barline location="left"><barline-style>heavy-light</barline-style><repeat direction="forward"/></barline>'
  const repeatRight = '<barline location="right"><barline-style>light-heavy</barline-style><repeat direction="backward" times="1"/></barline>'
  const endingOneStart = '<barline location="left"><ending type="start" number="1"/></barline>'
  const endingOneStop = '<barline location="right"><ending type="stop" number="1"/></barline>'
  const endingTwoStart = '<barline location="left"><ending type="discontinue" number="1"/><ending type="start" number="2"/></barline>'
  const endingTwoStop = '<barline location="right"><ending type="stop" number="2"/></barline>'

  const p1: string[] = [`<part id="P1">${measure({ number: 0, implicit: true, body: pickupBody })}`]
  const p2: string[] = [`<part id="P2">${measure({ number: 0, implicit: true, body: `${attributes(3, 4)}${rest(30)}` })}`]

  upperBodies.forEach((body, index) => {
    let left = ''
    let right = ''
    if (index === 1) left = repeatLeft
    if (index === 4) {
      left = endingOneStart
      right = endingOneStop + repeatRight
    }
    if (index === 5) {
      left = endingTwoStart
      right = endingTwoStop
    }
    p1.push(measure({ number: index + 1, body, left, right }))
    p2.push(measure({ number: index + 1, body: lowerBodies[index], left, right }))
  })
  p1.push('</part>')
  p2.push('</part>')

  return `${header('双跳房、速度变化与多声部样例', 2)}${p1.join('\n')}\n${p2.join('\n')}\n${footer}`
}

export function unclosedJumpXml(): string {
  const body = `${attributes(4, 4, true)}${note('C4', 120)}`
  const measures = [
    measure({ number: 1, body }),
    measure({ number: 2, body }),
    measure({ number: 3, body: `${body}${direction('D.S. al Fine')}` }),
    measure({ number: 4, body }),
  ].join('\n')
  return `${header('无法闭合的 D.S. 样例', 1)}<part id="P1">${measures}</part>${footer}`
}

export const sampleLibrary = [
  { name: '双跳房 / 速度 / 多声部 / 弱起', getXml: fullSampleXml },
  { name: '无法闭合跳转（D.S. 缺少 Segno/Fine）', getXml: unclosedJumpXml },
]
