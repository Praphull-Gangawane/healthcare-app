import { test, expect } from '../fixtures/ui.js';
import { ReceptionDashboardPage } from '../pages/ReceptionDashboardPage.js';
import { createPatient } from '../utils/factories.js';
import { bookAppointment } from '../utils/slots.js';
import { expectOk } from '../utils/assertions.js';
import { QUEUE_DOCTOR } from '../data/testData.js';

test.describe('front desk & queue (UI)', () => {
  test('reception checks a patient in and the token appears in the queue', async ({ loginAs, page, as, refs }) => {
    const reception = await as('reception');
    const p = await createPatient(reception);
    const { appointment } = await bookAppointment(reception, { doctorId: refs.testDoctorId, patientId: p.id }, { sameDay: true, minLeadMinutes: 5 });
    await loginAs('reception');
    const desk = new ReceptionDashboardPage(page);
    await desk.openAppointments();
    await desk.checkIn(appointment.appointmentNumber);
    await expect(desk.appointmentRow(appointment.appointmentNumber)).toContainText(/Token \d+/);
  });

  test('queue controls and public display show token numbers only', async ({ loginAs, page, as, refs, context }) => {
    const reception = await as('reception');
    const p = await createPatient(reception);
    expectOk(await reception.post('/api/appointments/walk-ins', { patientId: p.id, doctorId: refs.queueDoctorId, facilityId: refs.rscFacilityId }), 201);
    await loginAs('reception');
    const desk = new ReceptionDashboardPage(page);
    await desk.openQueue(QUEUE_DOCTOR.displayName);
    const token = page.getByTestId('queue-token').filter({ hasText: p.fullName });
    await expect(token).toHaveAttribute('data-status', 'WAITING');
    await token.getByRole('button', { name: /^Skip token/ }).click();
    await expect(token).toHaveAttribute('data-status', 'SKIPPED');
    await token.getByRole('button', { name: /^Return token/ }).click();
    await expect(token).toHaveAttribute('data-status', 'WAITING');
    const [display] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name: 'Open public display' }).click()]);
    await expect(display.getByTestId('now-serving')).toBeVisible();
    await expect(display.locator('body')).not.toContainText(p.fullName);
    await expect(display.locator('body')).not.toContainText(p.uhid);
  });
});
