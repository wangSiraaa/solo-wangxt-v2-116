function measureAttributes(beats = 4, beatType = 4, divisions = 4, includeTime = false): string {
  return `<attributes>
      <divisions>${divisions}</divisions>${includeTime ? `
      <time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time>` : ''}
    </attributes>`;
}

function note(pitch: string, octave: number, duration: number, type: string, voice = 1): string {
  return `<note>
      <pitch><step>${pitch}</step><octave>${octave}</octave></pitch>
      <duration>${duration}</duration>
      <voice>${voice}</voice>
      <type>${type}</type>
    </note>`;
}

function rest(duration: number, type: string): string {
  return `<note><rest/><duration>${duration}</duration><type>${type}</type></note>`;
}

function tempo(beatAt: number, bpm: number, label: string): string {
  return `<direction placement="above"><direction-type><words>${label}</words></direction-type><sound tempo="${bpm}"/></direction>`;
}

function barline(location: 'left' | 'right', inner: string): string {
  return `<barline location="${location}">${inner}</barline>`;
}

const forward = barline('left', '<repeat direction="forward"/>');
const backward = barline('right', '<repeat direction="backward"/>');
const endingStart = (numbers: string): string => barline('left', `<ending number="${numbers}" type="start"/>`);
const endingStop = (numbers: string): string => barline('right', `<ending number="${numbers}" type="stop"/>`);
const endingStopWithBackward = (numbers: string): string => barline('right', `<repeat direction="backward"/><ending number="${numbers}" type="stop"/>`);

function wrapPartwise(title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="4.0">
  <work><work-title>${title}</work-title></work>
  <part-list>
    <score-part id="P1"><part-name>长笛</part-name></score-part>
    <score-part id="P2"><part-name>单簧管</part-name></score-part>
  </part-list>
  ${body}
</score-partwise>`;
}

function part(id: string, measures: string[]): string {
  const startsWithPickup = measures[0]?.includes('data-pickup="yes"') ?? false;
  return `<part id="${id}">${measures.map((content, index) => {
    const isPickup = content.includes('data-pickup="yes"');
    const printedNumber = isPickup ? '0' : startsWithPickup ? String(index) : String(index + 1);
    const implicit = isPickup ? ' implicit="yes"' : '';
    return `<measure number="${printedNumber}"${implicit}>${content.replace(' data-pickup="yes"', '')}</measure>`;
  }).join('\n    ')}</part>`;
}

export const doubleEndingSample = wrapPartwise('双跳房：反复与二房子', `
  <part id="P1">
    <measure number="1">
      ${measureAttributes(4, 4, 4, true)}
      ${note('C', 5, 16, 'whole')}
    </measure>
    <measure number="2">
      ${forward}${note('D', 5, 16, 'whole')}
    </measure>
    <measure number="3">${note('E', 5, 16, 'whole')}</measure>
    <measure number="4">${note('F', 5, 16, 'whole')}</measure>
    <measure number="5">
      ${endingStart('1')}
      ${note('G', 5, 16, 'whole')}
      ${endingStopWithBackward('1')}
    </measure>
    <measure number="6">
      ${endingStart('2')}
      ${note('A', 5, 16, 'whole')}
      ${endingStop('2')}
    </measure>
    <measure number="7">${note('B', 5, 16, 'whole')}</measure>
  </part>
  <part id="P2">
    <measure number="1">${measureAttributes(4, 4, 4, true)}${note('G', 4, 16, 'whole')}</measure>
    <measure number="2">${forward}${note('A', 4, 16, 'whole')}</measure>
    <measure number="3">${note('B', 4, 16, 'whole')}</measure>
    <measure number="4">${note('C', 5, 16, 'whole')}</measure>
    <measure number="5">${endingStart('1')}${note('D', 5, 16, 'whole')}${endingStopWithBackward('1')}</measure>
    <measure number="6">${endingStart('2')}${note('E', 5, 16, 'whole')}${endingStop('2')}</measure>
    <measure number="7">${note('F', 5, 16, 'whole')}</measure>
  </part>
`);

export const tempoPickupSample = wrapPartwise('速度改变与弱起小节', `
  ${part('P1', [
    `data-pickup="yes"${measureAttributes(4, 4, 4, true)}${tempo(0, 90, 'Andante ♩=90')}${note('C', 5, 4, 'quarter')}`,
    note('D', 5, 16, 'whole'),
    `${tempo(0, 144, 'Allegro ♩=144')}${note('E', 5, 16, 'whole')}`,
    note('F', 5, 16, 'whole')
  ])}
  ${part('P2', [
    `data-pickup="yes"${measureAttributes(4, 4, 4, true)}${rest(4, 'quarter')}`,
    note('G', 4, 16, 'whole'),
    note('A', 4, 16, 'whole'),
    note('B', 4, 16, 'whole')
  ])}
`);

// The first measure is an anacrusis. It carries <time>; implicit="yes" and one beat of music.
const pickupMeasuresP1 = [
  `data-pickup="yes"${measureAttributes(4, 4, 4, true)}${tempo(0, 84, '弱起 ♩=84')}${note('E', 5, 4, 'quarter')}`,
  `${forward}${note('F', 5, 16, 'whole')}`,
  note('G', 5, 16, 'whole'),
  `${tempo(8, 132, '♩=132')}${note('A', 5, 8, 'half')}${note('B', 5, 8, 'half')}`,
  `${endingStart('1')}${note('C', 6, 16, 'whole')}${endingStopWithBackward('1')}`,
  `${endingStart('2')}${tempo(0, 160, '♩=160')}${note('D', 6, 16, 'whole')}${endingStop('2')}`,
  note('C', 6, 16, 'whole')
];
const pickupMeasuresP2 = [
  `data-pickup="yes"${measureAttributes(4, 4, 4, true)}${note('C', 5, 4, 'quarter')}`,
  `${forward}${note('C', 5, 16, 'whole')}`,
  note('D', 5, 16, 'whole'),
  `${note('E', 5, 8, 'half')}${note('F', 5, 8, 'half')}`,
  `${endingStart('1')}${note('G', 5, 16, 'whole')}${endingStopWithBackward('1')}`,
  `${endingStart('2')}${note('A', 5, 16, 'whole')}${endingStop('2')}`,
  note('B', 5, 16, 'whole')
];

export const combinedSample = wrapPartwise('综合：双跳房、速度、弱起、多声部共有小节', `
  ${part('P1', pickupMeasuresP1)}
  ${part('P2', pickupMeasuresP2)}
`);

export const unclosedJumpSample = wrapPartwise('无法闭合：D.S. 缺 Segno', `
  ${part('P1', [
    `${measureAttributes(4, 4, 4, true)}${note('C', 5, 16, 'whole')}`,
    `${note('D', 5, 16, 'whole')}<direction placement="above"><direction-type><words>D.S. al Fine</words></direction-type></direction>`,
    `${note('E', 5, 16, 'whole')}<direction placement="above"><direction-type><words>Fine</words></direction-type></direction>`
  ])}
  ${part('P2', [
    `${measureAttributes(4, 4, 4, true)}${note('G', 4, 16, 'whole')}`,
    note('A', 4, 16, 'whole'),
    note('B', 4, 16, 'whole')
  ])}
`);

export const returnJumpSample = wrapPartwise('D.S. al Fine 闭合路径', `
  ${part('P1', [
    `${measureAttributes(4, 4, 4, true)}<direction placement="above"><direction-type><segno/></direction-type></direction>${note('C', 5, 16, 'whole')}`,
    note('D', 5, 16, 'whole'),
    `${note('E', 5, 16, 'whole')}<direction placement="above"><direction-type><words>D.S. al Fine</words></direction-type></direction>`,
    `${note('F', 5, 16, 'whole')}<direction placement="above"><direction-type><words>Fine</words></direction-type></direction>`,
    note('G', 5, 16, 'whole')
  ])}
  ${part('P2', [
    `${measureAttributes(4, 4, 4, true)}${note('G', 4, 16, 'whole')}`,
    note('A', 4, 16, 'whole'),
    note('B', 4, 16, 'whole'),
    note('C', 5, 16, 'whole'),
    note('D', 5, 16, 'whole')
  ])}
`);

export const samples = [
  { id: 'double-ending', title: '双跳房', xml: doubleEndingSample },
  { id: 'tempo-pickup', title: '速度与弱起', xml: tempoPickupSample },
  { id: 'combined', title: '综合多声部', xml: combinedSample },
  { id: 'dacapo', title: 'D.S. 闭合', xml: returnJumpSample },
  { id: 'unclosed', title: '无法闭合样例', xml: unclosedJumpSample }
];
