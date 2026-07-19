import qrcodeGenerator from 'qrcode-generator';

/**
 * QR code -> SVG string. Unlike Code39 (barcode.ts), QR needs real Reed-Solomon
 * error correction and mask-pattern selection to produce a code that actually
 * scans — not something to hand-roll without a way to verify the output
 * against a real decoder. `qrcode-generator` is a small, dependency-free,
 * long-established library that only builds the boolean module matrix; we
 * render that matrix to SVG ourselves, same approach as the barcode renderer.
 */
export function qrCodeSvg(value: string, opts: { moduleSize?: number; margin?: number } = {}): string {
  if (!value) throw new Error('QR code value must not be empty');
  const moduleSize = opts.moduleSize ?? 6;
  const margin = opts.margin ?? 2;

  const qr = qrcodeGenerator(0, 'M');
  qr.addData(value);
  qr.make();

  const count = qr.getModuleCount();
  const size = (count + margin * 2) * moduleSize;

  const rects: string[] = [];
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!qr.isDark(row, col)) continue;
      const x = (col + margin) * moduleSize;
      const y = (row + margin) * moduleSize;
      rects.push(`<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" fill="#000"/>`);
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="#fff"/>` +
    rects.join('') +
    `</svg>`;
}
