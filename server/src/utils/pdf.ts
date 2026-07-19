import PDFDocument from 'pdfkit';

/** Collect a PDFKit document's output stream into a single Buffer. */
function renderToBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc);
    doc.end();
  });
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export interface ExpensePdfRow {
  incurredOn: Date;
  location: string;
  category: string;
  description: string;
  vendor: string | null;
  amountCents: number;
  taxCents: number;
  status: string;
}

export function expensesPdfBuffer(rows: ExpensePdfRow[], title = 'Expense Report'): Promise<Buffer> {
  return renderToBuffer((doc) => {
    doc.fontSize(18).text(title, { align: 'left' });
    doc.fontSize(9).fillColor('#666').text(`Generated ${new Date().toISOString().slice(0, 10)}`);
    doc.moveDown();
    doc.fillColor('#000');

    const cols = [
      { label: 'Date', width: 60 },
      { label: 'Location', width: 55 },
      { label: 'Category', width: 90 },
      { label: 'Description', width: 140 },
      { label: 'Vendor', width: 80 },
      { label: 'Amount', width: 55 },
      { label: 'Status', width: 50 },
    ];
    const startX = doc.x;
    let y = doc.y;

    const drawRow = (cells: string[], bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      let x = startX;
      for (let i = 0; i < cols.length; i++) {
        doc.text(cells[i] ?? '', x, y, { width: cols[i].width, ellipsis: true });
        x += cols[i].width;
      }
      y += 16;
    };

    drawRow(cols.map((c) => c.label), true);
    doc.moveTo(startX, y - 2).lineTo(startX + cols.reduce((s, c) => s + c.width, 0), y - 2).stroke();

    let totalCents = 0;
    for (const r of rows) {
      if (y > doc.page.height - 80) {
        doc.addPage();
        y = doc.y;
      }
      drawRow([
        r.incurredOn.toISOString().slice(0, 10),
        r.location,
        r.category.replace(/_/g, ' '),
        r.description,
        r.vendor ?? '',
        money(r.amountCents + r.taxCents),
        r.status,
      ]);
      totalCents += r.amountCents + r.taxCents;
    }

    doc.moveTo(startX, y).lineTo(startX + cols.reduce((s, c) => s + c.width, 0), y).stroke();
    y += 8;
    doc.font('Helvetica-Bold').fontSize(9).text(`Total: ${money(totalCents)}  (${rows.length} item(s))`, startX, y);
  });
}

export interface PlPdfData {
  pharmacyName: string;
  period: { from: string; to: string };
  revenueCents: number;
  totalExpensesCents: number;
  netIncomeCents: number;
  taxCollectedCents: number;
  expensesByCategory: Record<string, number>;
}

export function plStatementPdfBuffer(pl: PlPdfData): Promise<Buffer> {
  return renderToBuffer((doc) => {
    doc.fontSize(18).text('Profit & Loss Statement');
    doc.fontSize(11).fillColor('#666').text(pl.pharmacyName);
    doc.fontSize(9).text(`Period: ${pl.period.from.slice(0, 10)} to ${pl.period.to.slice(0, 10)}`);
    doc.fillColor('#000').moveDown(1.5);

    const line = (label: string, value: string, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(11);
      doc.text(label, doc.x, doc.y, { continued: true, width: 300 });
      doc.text(value, { align: 'right' });
    };

    line('Revenue', money(pl.revenueCents));
    line('Total expenses', money(pl.totalExpensesCents));
    doc.moveDown(0.3);
    line('Net income', money(pl.netIncomeCents), true);
    doc.moveDown(0.3);
    line('HST/GST collected', money(pl.taxCollectedCents));
    doc.moveDown(1);

    doc.font('Helvetica-Bold').fontSize(12).text('Expenses by category');
    doc.moveDown(0.3);
    const entries = Object.entries(pl.expensesByCategory);
    if (entries.length === 0) {
      doc.font('Helvetica').fontSize(10).fillColor('#666').text('No expenses recorded for this period.');
    }
    for (const [category, cents] of entries) {
      line(category.replace(/_/g, ' '), money(cents));
    }
  });
}
