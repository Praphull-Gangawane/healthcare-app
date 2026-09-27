import PDFDocument from 'pdfkit';
import { config } from '../../config/env.js';

export interface PrescriptionSnapshot {
  prescriptionNumber: string;
  version: number;
  issuedAt: string;
  amendmentReason?: string | null;
  facility: { name: string; address: string | null; phone: string | null; registrationNo: string | null };
  doctor: { name: string; qualifications: string; specialty: string; registrationNumber: string | null; registrationCouncil: string | null };
  patient: { name: string; uhid: string; age: number; gender: string };
  encounter: { number: string; date: string };
  diagnoses: string[];
  allergies: string[];
  items: {
    medicineName: string;
    strength: string | null;
    dose: string;
    route: string;
    frequency: string;
    timing: string | null;
    durationDays: number;
    quantity: string | null;
    instructions: string | null;
    refills: number;
  }[];
  advice: string | null;
  investigations: string[];
  investigationNotes: string | null;
  followUpDate: string | null;
  signature: { method: string; ref: string; statement: string };
  footer: string;
  contentHash?: string;
}

const MARGIN = 48;
const COLS = [20, 150, 90, 100, 50];
const HEADERS = ['#', 'Medicine (generic) & strength', 'Dose / route', 'Frequency / timing', 'Duration', 'Instructions'];

type Doc = InstanceType<typeof PDFDocument>;

function drawRow(doc: Doc, width: number, cells: string[], bold: boolean) {
  const widths = [...COLS, width - COLS.reduce((a, b) => a + b, 0)];
  if (doc.y > doc.page.height - 140) doc.addPage();
  const y = doc.y;
  let x = MARGIN;
  let maxH = 0;
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#111');
  cells.forEach((c, i) => {
    const w = (widths[i] ?? 50) - 4;
    maxH = Math.max(maxH, doc.heightOfString(c, { width: w }));
    doc.text(c, x + 2, y, { width: w });
    x += widths[i] ?? 50;
  });
  doc.y = y + maxH + 6;
  doc.moveTo(MARGIN, doc.y - 3).lineTo(MARGIN + width, doc.y - 3).strokeColor('#dddddd').stroke();
}

function header(doc: Doc, s: PrescriptionSnapshot, width: number) {
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(15).text(s.facility.name, MARGIN, MARGIN);
  doc.font('Helvetica').fontSize(9).fillColor('#333');
  if (s.facility.address) doc.text(s.facility.address);
  const contact = [s.facility.phone ? `Phone: ${s.facility.phone}` : null, s.facility.registrationNo ? `Facility reg. no: ${s.facility.registrationNo}` : null].filter(Boolean).join('   ');
  if (contact) doc.text(contact);
  doc.moveDown(0.5).moveTo(MARGIN, doc.y).lineTo(MARGIN + width, doc.y).strokeColor('#999999').stroke();

  const top = doc.y + 8;
  const half = width / 2;
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#111').text(s.doctor.name, MARGIN, top, { width: half - 8 });
  doc.font('Helvetica').fontSize(9).text(`${s.doctor.qualifications} — ${s.doctor.specialty}`, { width: half - 8 });
  doc.text(`Registration no: ${s.doctor.registrationNumber ?? 'Not provided'}${s.doctor.registrationCouncil ? ` (${s.doctor.registrationCouncil})` : ''}`, { width: half - 8 });
  const leftBottom = doc.y;

  const right = MARGIN + half;
  const line = (label: string, value: string) => {
    doc.font('Helvetica-Bold').fontSize(9).text(`${label}: `, right, doc.y, { continued: true, width: half }).font('Helvetica').text(value);
  };
  doc.y = top;
  line('Prescription no', `${s.prescriptionNumber} (version ${s.version})`);
  line('Date', s.issuedAt);
  line('Patient', s.patient.name);
  line('UHID', s.patient.uhid);
  line('Age / Sex', `${s.patient.age} / ${s.patient.gender}`);
  line('Visit', `${s.encounter.number} on ${s.encounter.date}`);
  doc.y = Math.max(doc.y, leftBottom) + 8;
}

/** Printable, legible A4 prescription. Plain typography, no decorative elements. */
export function renderPrescriptionPdf(s: PrescriptionSnapshot, contentHash: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      info: { Title: `Prescription ${s.prescriptionNumber} v${s.version}`, Author: s.doctor.name, Producer: config.APP_NAME },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const width = doc.page.width - MARGIN * 2;

    if (config.DEMO_MODE) {
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#b45309').text('DEMO DATA — NOT A VALID PRESCRIPTION', MARGIN, 22, { width, align: 'center' });
    }
    header(doc, s, width);

    doc.x = MARGIN;
    if (s.allergies.length) doc.font('Helvetica-Bold').fontSize(9).fillColor('#9a3412').text(`Known allergies: ${s.allergies.join(', ')}`, MARGIN, doc.y, { width });
    doc.fillColor('#111');
    if (s.diagnoses.length) doc.font('Helvetica').fontSize(9).text(`Diagnosis: ${s.diagnoses.join('; ')}`, MARGIN, doc.y, { width });
    if (s.amendmentReason) doc.font('Helvetica-Oblique').fontSize(9).text(`Amended in version ${s.version}: ${s.amendmentReason}`, MARGIN, doc.y, { width });

    doc.moveDown(0.6).font('Helvetica-Bold').fontSize(16).text('Rx', MARGIN, doc.y);
    drawRow(doc, width, HEADERS, true);
    s.items.forEach((it, i) =>
      drawRow(
        doc,
        width,
        [
          String(i + 1),
          `${it.medicineName}${it.strength ? ` ${it.strength}` : ''}${it.quantity ? `\nQty: ${it.quantity}` : ''}`,
          `${it.dose}\n${it.route}`,
          `${it.frequency}${it.timing ? `\n${it.timing}` : ''}`,
          `${it.durationDays} day${it.durationDays === 1 ? '' : 's'}`,
          `${it.instructions ?? ''}${it.refills ? `\nRefills: ${it.refills}` : ''}`,
        ],
        false,
      ),
    );

    doc.x = MARGIN;
    if (s.advice) doc.moveDown(0.4).font('Helvetica-Bold').fontSize(10).text('Advice', MARGIN).font('Helvetica').fontSize(9).text(s.advice, { width });
    if (s.investigations.length || s.investigationNotes) {
      doc.moveDown(0.4).font('Helvetica-Bold').fontSize(10).text('Investigations advised', MARGIN).font('Helvetica').fontSize(9);
      if (s.investigations.length) doc.text(s.investigations.map((x) => `• ${x}`).join('\n'), { width });
      if (s.investigationNotes) doc.text(s.investigationNotes, { width });
    }
    if (s.followUpDate) doc.moveDown(0.4).font('Helvetica-Bold').fontSize(10).text(`Follow-up on or around: ${s.followUpDate}`, MARGIN);

    doc.moveDown(1.2).font('Helvetica-Bold').fontSize(10).fillColor('#111').text(s.doctor.name, MARGIN, doc.y, { width, align: 'right' });
    doc.font('Helvetica').fontSize(8).fillColor('#333').text(s.signature.statement, { width, align: 'right' });
    doc.text(`Authorisation reference: ${s.signature.ref}`, { width, align: 'right' });

    doc.moveDown(1).fontSize(7.5).fillColor('#555').text(`${s.footer} SHA-256: ${contentHash}. Generated by ${config.APP_NAME}.`, MARGIN, doc.y, { width });
    doc.end();
  });
}
