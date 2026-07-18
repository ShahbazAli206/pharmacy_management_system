/**
 * Prescription OCR — pluggable provider interface.
 *
 * The spec calls for Google Cloud Vision or AWS Textract. Those require cloud
 * credentials that aren't wired here, so this ships a provider interface plus a
 * StubOcrProvider that returns a low-confidence empty parse. Swap in a real
 * provider by implementing OcrProvider and setting it in getOcrProvider().
 *
 * Workflow contract (unchanged regardless of provider): OCR only PRE-FILLS
 * fields. A pharmacist must review and confirm every field before the
 * prescription is saved, and the original image is always retained.
 */

export interface ParsedPrescription {
  drugName?: string;
  din?: string;
  strength?: string;
  directions?: string;
  quantity?: number;
  refills?: number;
  prescriberName?: string;
  /** 0..1 — pharmacist review is mandatory regardless of confidence. */
  confidence: number;
  provider: string;
  notes?: string;
}

export interface OcrProvider {
  readonly name: string;
  parsePrescription(image: Buffer): Promise<ParsedPrescription>;
}

class StubOcrProvider implements OcrProvider {
  readonly name = 'stub';

  async parsePrescription(image: Buffer): Promise<ParsedPrescription> {
    return {
      confidence: 0,
      provider: this.name,
      notes:
        `Received ${image.byteLength} bytes. OCR engine not configured — ` +
        'pharmacist must enter all fields manually. Configure Google Vision or ' +
        'AWS Textract in src/services/ocr.ts to enable auto-parsing.',
    };
  }
}

let provider: OcrProvider = new StubOcrProvider();

export function getOcrProvider(): OcrProvider {
  return provider;
}

export function setOcrProvider(p: OcrProvider): void {
  provider = p;
}
