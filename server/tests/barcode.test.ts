import { describe, it, expect } from 'vitest';
import { code39Svg } from '../src/utils/barcode';

describe('Code39 barcode', () => {
  it('renders an SVG containing the human-readable value', () => {
    const svg = code39Svg('123456');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('123456');
    expect(svg).toContain('<rect');
  });

  it('uppercases input and encodes letters', () => {
    const svg = code39Svg('din42');
    expect(svg).toContain('DIN42');
  });

  it('throws on characters it cannot encode', () => {
    expect(() => code39Svg('a@b')).toThrow();
  });
});
