/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../fixtures/ui.js';
import { DoctorDashboardPage } from '../pages/DoctorDashboardPage.js';
import { ConsultationPage } from '../pages/ConsultationPage.js';
import { VitalsPage } from '../pages/VitalsPage.js';
import { PrescriptionPage } from '../pages/PrescriptionPage.js';
import { PatientRecordPage } from '../pages/PatientRecordPage.js';
import { createPatient } from '../utils/factories.js';
import { expectOk } from '../utils/assertions.js';

async function walkInForTestDoctor(as: any, refs: any) {
  const reception = await as('reception');
  const p = await createPatient(reception, { medicalProfile: { allergies: [{ substance: 'Paracetamol' }] } });
  const appt = expectOk(await reception.post('/api/appointments/walk-ins', { patientId: p.id, doctorId: refs.testDoctorId, facilityId: refs.rscFacilityId, reason: 'Fever and cough' }), 201) as any;
  return { p, appt };
}

test.describe('doctor consultation (UI)', () => {
  test('full consultation: history, vitals with review flag, diagnosis, order, prescription, complete', async ({ loginAs, page, as, refs }) => {
    const { p, appt } = await walkInForTestDoctor(as, refs);
    await loginAs('doctor');
    const dash = new DoctorDashboardPage(page);
    await dash.goto();
    await dash.startConsultation(appt.appointmentNumber);
    const c = new ConsultationPage(page);
    await expect(c.draftBadge()).toHaveText('DRAFT · NOT FINALIZED');
    await expect(page.getByText(p.fullName).first()).toBeVisible();
    await c.fillHistory('High temperature since yesterday.');

    const v = new VitalsPage(page);
    await v.record({ heartRate: '108', systolic: '124', diastolic: '80', temperature: '38.4', spo2: '97' });
    await v.expectCardFlag('HEART_RATE', 'REQUIRES_REVIEW');
    await expect(v.card('HEART_RATE')).toContainText('Please review the result with a qualified healthcare professional.');
    await expect(page.locator('body')).not.toContainText(/heart disease|arrhythmia/i);

    await c.addDiagnosis('Acute upper respiratory infection', 'J06.9');
    await c.orderTest('Complete Blood Count (CBC)');

    const rx = new PrescriptionPage(page);
    await rx.create();
    await rx.addFromCatalogue('parac', /Paracetamol 500 mg/);
    await rx.saveDraft();
    await expect(page.getByText(/may match recorded allergy/)).toBeVisible();
    await rx.finalize();
    await c.completeVisit();
    await expect(dash.row(appt.appointmentNumber)).toHaveAttribute('data-status', 'COMPLETED');
  });

  test('validation: cannot finalize with incomplete medicine rows', async ({ loginAs, page, as, refs }) => {
    const { appt } = await walkInForTestDoctor(as, refs);
    await loginAs('doctor');
    const dash = new DoctorDashboardPage(page);
    await dash.goto();
    await dash.startConsultation(appt.appointmentNumber);
    const rx = new PrescriptionPage(page);
    await rx.create();
    await rx.addBlank();
    await page.getByTestId('finalize-prescription').click();
    await expect(page.getByText('Medicine is required')).toBeVisible();
    await expect(page.getByText('Frequency is required')).toBeVisible();
    await expect(rx.status()).toHaveText('DRAFT · NOT FINALIZED');
    await rx.remove(0);
    await expect(rx.rows()).toHaveCount(0);
  });

  test('doctor without care relationship uses audited emergency access', async ({ loginAs, page, as }) => {
    const reception = await as('reception');
    const stranger = await createPatient(reception);
    await loginAs('demoDoctor');
    const rec = new PatientRecordPage(page);
    await rec.goto(stranger.id);
    await expect(page.getByText('This patient is not under your care')).toBeVisible();
    await rec.breakGlass('Patient collapsed in waiting area; need allergy history');
    await rec.tab('Timeline');
  });
});
