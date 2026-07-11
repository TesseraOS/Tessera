import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderMascotMasterSvg, renderMoodSheetSvg } from './masters.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const brandDir = path.resolve(here, '..', '..', '..', 'docs', 'design', 'brand');

const readMaster = (name: string): string =>
  readFileSync(path.join(brandDir, name), 'utf8').replace(/\r\n/g, '\n');

describe('brand masters (generated, drift-tested — ADR-0046)', () => {
  it('the checked-in idle master matches the mood data exactly', () => {
    expect(readMaster('tessera-mascot.svg')).toBe(renderMascotMasterSvg());
  });

  it('the checked-in mood sheet matches the mood data exactly', () => {
    expect(readMaster('tessera-mascot-moods.svg')).toBe(renderMoodSheetSvg());
  });

  it('masters declare themselves generated and stay standalone-valid', () => {
    for (const svg of [renderMascotMasterSvg(), renderMoodSheetSvg()]) {
      expect(svg).toContain('GENERATED from @tessera/mascot');
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('viewBox=');
    }
  });
});
