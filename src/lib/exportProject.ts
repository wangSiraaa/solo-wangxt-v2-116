import type { StoredProject } from '../types/score';

export interface RehearsalExport {
  format: 'musicxml-rehearsal-stand/1';
  exportedAt: string;
  title: string;
  originalXml: string;
  rehearsalMarks: StoredProject['marks'];
}

export function buildProjectExport(project: StoredProject): RehearsalExport {
  return {
    format: 'musicxml-rehearsal-stand/1',
    exportedAt: new Date().toISOString(),
    title: project.title,
    originalXml: project.xml,
    rehearsalMarks: project.marks
  };
}

export function buildAnnotatedMusicXml(project: StoredProject): string {
  const document = new DOMParser().parseFromString(project.xml, 'application/xml');
  const root = document.documentElement;
  root.querySelector('rehearsal-stand-marks')?.remove();

  const container = document.createElementNS(null, 'rehearsal-stand-marks');
  container.setAttribute('format', 'musicxml-rehearsal-stand/1');
  container.setAttribute('exported-at', new Date().toISOString());

  for (const mark of project.marks) {
    const element = document.createElementNS(null, 'rehearsal-mark');
    element.setAttribute('id', mark.id);
    element.setAttribute('measure-index', String(mark.measureIndex));
    element.setAttribute('occurrence', String(mark.occurrence));
    element.setAttribute('created-at', new Date(mark.createdAt).toISOString());
    const label = document.createElementNS(null, 'label');
    label.textContent = mark.label;
    const note = document.createElementNS(null, 'note');
    note.textContent = mark.note;
    element.append(label, note);
    container.append(element);
  }
  root.append(container);

  const serialized = new XMLSerializer().serializeToString(document);
  return project.xml.startsWith('<?xml') ? serialized : `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`;
}
