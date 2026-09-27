/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../fixtures/ui.js';
import { PatientDashboardPage } from '../pages/PatientDashboardPage.js';
import { registerPortalUser } from '../utils/factories.js';
import { expectOk } from '../utils/assertions.js';
import { finalizedPrescription } from '../utils/flows.js';

test.describe('prescriptions (UI, patient)', () => {
  test('patient opens a finalized prescription, sees version and can open the PDF; timeline updates', async ({ page, as, refs }) => {
    const me = await registerPortalUser();
    const reception = await as('reception');
    const doctor = await as('doctor');
    const walk = expectOk(await reception.post('/api/appointments/walk-ins', { patientId: me.patientId, doctorId: refs.testDoctorId, facilityId: refs.rscFacilityId }), 201) as any;
    const enc = expectOk(await doctor.post('/api/encounters', { appointmentId: walk.id }), 201) as any;
    await finalizedPrescription(doctor, enc.id);
    expectOk(await doctor.post(`/api/encounters/${enc.id}/complete`, {}));

    await page.request.post('/api/auth/login', { data: { email: me.email, password: me.password } });
    const portal = new PatientDashboardPage(page);
    await portal.openPrescriptions();
    await portal.prescriptionRows().first().getByRole('link').click();
    await expect(page.getByTestId('prescription-version')).toHaveText('Version 1');
    await expect(page.getByTestId('rx-item')).toContainText('Paracetamol 500 mg');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).click()]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/);
    await portal.openTimeline();
    await expect(portal.timelineItems().filter({ hasText: 'Consultation' }).first()).toBeVisible();
  });

  test('another patient cannot open it', async ({ page, as, refs }) => {
    const owner = await registerPortalUser();
    const reception = await as('reception');
    const doctor = await as('doctor');
    const walk = expectOk(await reception.post('/api/appointments/walk-ins', { patientId: owner.patientId, doctorId: refs.testDoctorId, facilityId: refs.rscFacilityId }), 201) as any;
    const enc = expectOk(await doctor.post('/api/encounters', { appointmentId: walk.id }), 201) as any;
    const rx = await finalizedPrescription(doctor, enc.id);
    const intruder = await registerPortalUser();
    await page.request.post('/api/auth/login', { data: { email: intruder.email, password: intruder.password } });
    await page.goto(`/portal/prescriptions/${rx.id}`);
    await expect(page.getByTestId('error-state').or(page.getByText(/don’t have access|not found/i)).first()).toBeVisible();
  });
});
