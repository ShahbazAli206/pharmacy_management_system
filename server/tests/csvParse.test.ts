import { describe, it, expect } from 'vitest';
import { parseCsv } from '../src/utils/csvParse';

describe('CSV parser', () => {
  it('parses rows keyed by header', () => {
    const rows = parseCsv('din,name\n001,Warfarin\n002,Ibuprofen');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ din: '001', name: 'Warfarin' });
  });

  it('handles quoted fields with embedded commas and quotes', () => {
    const rows = parseCsv('name,note\n"Doe, Jane","said ""hi"""');
    expect(rows[0].name).toBe('Doe, Jane');
    expect(rows[0].note).toBe('said "hi"');
  });

  it('ignores blank lines and trailing newline', () => {
    const rows = parseCsv('a,b\n1,2\n\n');
    expect(rows).toHaveLength(1);
  });
});
