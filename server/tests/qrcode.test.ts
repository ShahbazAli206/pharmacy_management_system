import { describe, it, expect } from 'vitest';
import { qrCodeSvg } from '../src/utils/qrcode';
import qrcodeGenerator from 'qrcode-generator';

describe('QR code', () => {
  it('renders a well-formed SVG', () => {
    const svg = qrCodeSvg('DIN:00987654');
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('<rect');
  });

  it('throws on empty input', () => {
    expect(() => qrCodeSvg('')).toThrow();
  });

  it('produces a structurally valid QR module matrix (finder patterns intact)', () => {
    const qr = qrcodeGenerator(0, 'M');
    qr.addData('https://example.com/patient/123');
    qr.make();
    const n = qr.getModuleCount();
    expect((n - 21) % 4).toBe(0); // valid QR sizes are 21 + 4k

    const FINDER = [
      [1, 1, 1, 1, 1, 1, 1],
      [1, 0, 0, 0, 0, 0, 1],
      [1, 0, 1, 1, 1, 0, 1],
      [1, 0, 1, 1, 1, 0, 1],
      [1, 0, 1, 1, 1, 0, 1],
      [1, 0, 0, 0, 0, 0, 1],
      [1, 1, 1, 1, 1, 1, 1],
    ];
    const finderOk = (r0: number, c0: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if ((qr.isDark(r0 + r, c0 + c) ? 1 : 0) !== FINDER[r][c]) return false;
        }
      }
      return true;
    };
    expect(finderOk(0, 0)).toBe(true);
    expect(finderOk(0, n - 7)).toBe(true);
    expect(finderOk(n - 7, 0)).toBe(true);
  });
});
