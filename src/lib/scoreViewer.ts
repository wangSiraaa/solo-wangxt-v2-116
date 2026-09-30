import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';

export class ScoreViewer {
  readonly osmd: OpenSheetMusicDisplay;
  private ready = false;

  constructor(container: HTMLElement) {
    this.osmd = new OpenSheetMusicDisplay(container, {
      autoResize: true,
      backend: 'svg',
      drawCredits: true,
      drawMeasureNumbers: true,
      followCursor: true
    });
  }

  async load(xml: string): Promise<void> {
    await this.osmd.load(xml);
    this.osmd.render();
    this.osmd.cursor.show();
    this.osmd.cursor.update();
    this.ready = true;
  }

  reset(): void {
    if (!this.ready) return;
    this.osmd.cursor.reset();
  }

  nextMeasure(): number {
    if (!this.ready) return -1;
    this.osmd.cursor.nextMeasure();
    this.osmd.cursor.update();
    return this.currentMeasureIndex();
  }

  advanceToMeasure(targetMeasureIndex: number): number {
    this.reset();
    let current = this.currentMeasureIndex();
    let guard = 0;
    do {
      const next = this.nextMeasure();
      if (next === current && this.osmd.cursor.Iterator.EndReached) break;
      current = next;
      guard += 1;
    } while (current !== targetMeasureIndex && guard < 10_000);
    return current;
  }

  currentMeasureIndex(): number {
    if (!this.ready || this.osmd.cursor.Iterator.EndReached) return -1;
    return this.osmd.cursor.Iterator.CurrentMeasureIndex;
  }

  dispose(): void {
    this.osmd.clear();
    this.ready = false;
  }
}
