import { test, expect } from '../fixtures/ui.js';
import { createPatient } from '../utils/factories.js';
import { expectOk } from '../utils/assertions.js';

test.describe('accessibility (axe, WCAG 2.1 AA serious/critical)', () => {
  for (const path of ['/', '/login', '/register', '/doctors']) {
    test(`public ${path}`, async ({ page, checkA11y }) => {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await checkA11y(path);
    });
  }

  test('booking flow', async ({ page, checkA11y, refs }) => {
    await page.goto(`/book/${refs.testDoctorId}`);
    await expect(page.getByTestId('booking-step')).toBeVisible();
    await checkA11y('booking');
  });

  test('patient dashboard, prescriptions, reports', async ({ loginAs, page, checkA11y }) => {
    await loginAs('patient', '/portal');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    await checkA11y('portal');
    for (const p of ['/portal/prescriptions', '/portal/reports']) {
      await page.goto(p);
      await page.waitForLoadState('networkidle');
      await checkA11y(p);
    }
  });

  test('doctor dashboard and consultation', async ({ loginAs, page, checkA11y, as, refs }) => {
    const reception = await as('reception');
    const doctor = await as('doctor');
    const pt = await createPatient(reception);
    const walk = expectOk(await reception.post('/api/appointments/walk-ins', { patientId: pt.id, doctorId: refs.testDoctorId, facilityId: refs.rscFacilityId }), 201) as { id: string };
    const enc = expectOk(await doctor.post('/api/encounters', { appointmentId: walk.id }), 201) as { id: string };
    await loginAs('doctor', '/doctor');
    await page.waitForLoadState('networkidle');
    await checkA11y('doctor dashboard');
    await page.goto(`/doctor/encounters/${enc.id}`);
    await expect(page.getByTestId('draft-badge')).toBeVisible();
    await checkA11y('consultation');
  });
});
