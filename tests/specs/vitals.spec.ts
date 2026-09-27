import { test, expect } from '../fixtures/ui.js';
import { VitalsPage } from '../pages/VitalsPage.js';
import { createPatient } from '../utils/factories.js';
import { expectOk } from '../utils/assertions.js';

test.describe('vitals (UI, nurse station)', () => {
  test('nurse records vitals; invalid values are rejected with a clear message', async ({ loginAs, page, as, refs }) => {
    const reception = await as('reception');
    const p = await createPatient(reception);
    expectOk(await reception.post('/api/appointments/walk-ins', { patientId: p.id, doctorId: refs.queueDoctorId, facilityId: refs.rscFacilityId }), 201);
    await loginAs('nurse', '/nurse');
    const doctorSelect = page.getByLabel('Doctor', { exact: true });
    const value = await doctorSelect.locator('option', { hasText: 'Rohan' }).first().getAttribute('value');
    await doctorSelect.selectOption(value ?? '');
    await page.getByTestId('queue-token').filter({ hasText: p.fullName }).getByRole('button', { name: 'Open' }).click();
    const v = new VitalsPage(page);
    await v.record({ heartRate: '700' });
    await expect(page.getByText(/outside the plausible range/)).toBeVisible();
    await v.record({ heartRate: '76', systolic: '118', diastolic: '76', spo2: '98', height: '160', weight: '58' });
    await v.expectCardFlag('HEART_RATE', 'WITHIN_RANGE');
    await expect(v.card('BMI')).toContainText('22.7');
    await v.record({ systolic: '120' });
    await expect(v.formError()).toHaveText('Enter both systolic and diastolic blood pressure.');
  });
});
