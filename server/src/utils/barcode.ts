/**
 * Dependency-free Code39 barcode renderer -> SVG string.
 * Code39 encodes 0-9, A-Z, and a few symbols; each character is 9 elements
 * (5 bars, 4 spaces), 3 of which are wide. Suitable for DINs and product/label
 * codes. (QR would need a heavier library; Code39 is fully self-contained.)
 */
const CODE39: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', A: 'wnnnnwnnw', B: 'nnwnnwnnw',
  C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn',
  G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww',
  O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnnnwww', R: 'wnnnnnwwn',
  S: 'nnwnnnwwn', T: 'nnnnwnwwn', U: 'wwnnnnnnw', V: 'nwwnnnnnw',
  W: 'wwwnnnnnn', X: 'nwnnwnnnw', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '*': 'nwnnwnwnn',
};

export function code39Svg(value: string, opts: { height?: number; narrow?: number } = {}): string {
  const height = opts.height ?? 60;
  const narrow = opts.narrow ?? 2;
  const wide = narrow * 3;
  const text = value.toUpperCase();
  const framed = `*${text}*`;

  let x = 10;
  const bars: string[] = [];
  for (const ch of framed) {
    const pattern = CODE39[ch];
    if (!pattern) throw new Error(`Code39 cannot encode character: "${ch}"`);
    for (let i = 0; i < pattern.length; i++) {
      const w = pattern[i] === 'w' ? wide : narrow;
      const isBar = i % 2 === 0;
      if (isBar) bars.push(`<rect x="${x}" y="10" width="${w}" height="${height}" fill="#000"/>`);
      x += w;
    }
    x += narrow; // inter-character gap
  }

  const width = x + 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + 40}" viewBox="0 0 ${width} ${height + 40}">` +
    `<rect width="${width}" height="${height + 40}" fill="#fff"/>` +
    bars.join('') +
    `<text x="${width / 2}" y="${height + 30}" font-family="monospace" font-size="16" text-anchor="middle">${text}</text>` +
    `</svg>`;
}
