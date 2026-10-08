import PDFDocument from 'pdfkit';

const inr = (p: number) => 'Rs. ' + (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface ReceiptPdfInput {
  institution: { name: string; address?: string; phone?: string; affiliation?: string };
  number: string; date: Date; mode: string; reference?: string | null;
  student: { name: string; admissionNo: string; className?: string };
  lines: { title: string; amountPaise: number; lateFeePaise: number }[];
  totalPaise: number; cancelled?: boolean;
}

/** A4 or 80mm thermal receipt. Returns a PDF buffer. */
export function receiptPdf(r: ReceiptPdfInput, format: 'a4' | 'thermal' = 'a4'): Promise<Buffer> {
  const thermal = format === 'thermal';
  const doc = new PDFDocument({ size: thermal ? [226, 600] : 'A4', margin: thermal ? 10 : 48 });
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on('end', () => res(Buffer.concat(chunks))));
  const W = thermal ? 206 : 499;
  doc.fontSize(thermal ? 11 : 18).font('Helvetica-Bold').text(r.institution.name, { align: 'center', width: W });
  doc.font('Helvetica').fontSize(thermal ? 7 : 9);
  if (r.institution.affiliation) doc.text(r.institution.affiliation, { align: 'center', width: W });
  if (r.institution.address) doc.text(r.institution.address, { align: 'center', width: W });
  if (r.institution.phone) doc.text(`Phone: ${r.institution.phone}`, { align: 'center', width: W });
  doc.moveDown(0.5).fontSize(thermal ? 9 : 13).font('Helvetica-Bold').text(r.cancelled ? 'FEE RECEIPT (CANCELLED)' : 'FEE RECEIPT', { align: 'center', width: W });
  doc.moveDown(0.5).font('Helvetica').fontSize(thermal ? 8 : 10);
  doc.text(`Receipt No: ${r.number}`).text(`Date: ${r.date.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  doc.text(`Student: ${r.student.name} (${r.student.admissionNo})`);
  if (r.student.className) doc.text(`Class: ${r.student.className}`);
  doc.moveDown(0.5);
  const y0 = doc.y;
  doc.font('Helvetica-Bold').text('Particulars', doc.x, y0, { width: W * 0.65 }).text('Amount', doc.page.margins.left + W * 0.65, y0, { width: W * 0.35, align: 'right' });
  doc.font('Helvetica');
  for (const l of r.lines) {
    const y = doc.y + 2;
    doc.text(l.title, doc.page.margins.left, y, { width: W * 0.65 }).text(inr(l.amountPaise), doc.page.margins.left + W * 0.65, y, { width: W * 0.35, align: 'right' });
    if (l.lateFeePaise) {
      const y2 = doc.y + 1;
      doc.text('  Late fee', doc.page.margins.left, y2, { width: W * 0.65 }).text(inr(l.lateFeePaise), doc.page.margins.left + W * 0.65, y2, { width: W * 0.35, align: 'right' });
    }
  }
  doc.moveDown(0.5).font('Helvetica-Bold');
  const yt = doc.y;
  doc.text('Total', doc.page.margins.left, yt, { width: W * 0.65 }).text(inr(r.totalPaise), doc.page.margins.left + W * 0.65, yt, { width: W * 0.35, align: 'right' });
  doc.font('Helvetica').moveDown(0.5).text(`Paid by: ${r.mode.toUpperCase()}${r.reference ? ` (${r.reference})` : ''}`, doc.page.margins.left);
  doc.moveDown(1).fontSize(thermal ? 6 : 8).fillColor('#666').text('Computer generated receipt. Powered by Aadhyay.', { align: 'center', width: W });
  doc.end();
  return done;
}
