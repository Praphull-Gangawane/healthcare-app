/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../fixtures/ui.js';
import { AppointmentPage } from '../pages/AppointmentPage.js';
import { DoctorSearchPage } from '../pages/DoctorSearchPage.js';
import { registerPortalUser } from '../utils/factories.js';
import { addDays, randInt, todayIST } from '../utils/dates.js';
import { availability } from '../utils/slots.js';
import { expectOk } from '../utils/assertions.js';
import { TEST_DOCTOR } from '../data/testData.js';

test.describe('appointment booking (UI)', () => {
  test('patient books through the full flow and sees the appointment', async ({ page }) => {
    const me = await registerPortalUser();
    await page.request.post('/api/auth/login', { data: { email: me.email, password: me.password } });
    const search = new DoctorSearchPage(page);
    await search.goto(`?q=${TEST_DOCTOR.searchName}`);
    await search.book(TEST_DOCTOR.displayName);
    const book = new AppointmentPage(page);
    await expect(book.step()).toBeVisible();
    if ((await book.currentStep()) === 2) {
      // DoctorCard deep-linked the next open slot; go back to pick a random future one to avoid collisions.
      await page.getByRole('button', { name: 'Back' }).click();
    }
    const date = addDays(todayIST(), randInt(3, 40));
    await page.getByLabel('Choose a date').fill(date);
    await book.pickSlot(randInt(0, 60));
    await book.enterDetails('Seasonal allergy review');
    await book.confirm();
    const number = await book.appointmentNumber();
    expect(number).toMatch(/^APT-\d{4}-\d{6}$/);
    await page.goto('/portal/appointments');
    await expect(page.getByTestId('appointment-row').filter({ hasText: number })).toHaveAttribute('data-status', 'CONFIRMED');
  });

  test('slot taken by someone else shows the exact conflict message', async ({ page, as, refs }) => {
    const me = await registerPortalUser();
    await page.request.post('/api/auth/login', { data: { email: me.email, password: me.password } });
    const date = addDays(todayIST(), randInt(5, 45));
    const reception = await as('reception');
    const slots = (await availability(reception, refs.testDoctorId, date)).filter((s) => s.status === 'AVAILABLE');
    const target = slots[randInt(0, slots.length - 1)]!;
    await page.goto(`/book/${refs.testDoctorId}?slot=${encodeURIComponent(target.startAt)}`);
    const book = new AppointmentPage(page);
    await book.enterDetails('Race condition check');
    // Another patient takes the slot while this user is reviewing.
    const other = await registerPortalUser();
    expectOk(await other.client.post('/api/appointments', { doctorId: refs.testDoctorId, patientId: other.patientId, startAt: target.startAt, type: 'IN_PERSON' }), 201);
    await book.confirm();
    await expect(book.error()).toHaveText('This slot was just booked by another patient. Please select another available time.');
    await expect(book.step()).toHaveAttribute('data-step', '1');
  });

  test('patient cancels an upcoming appointment', async ({ page, refs }) => {
    const me = await registerPortalUser();
    const date = addDays(todayIST(), randInt(5, 45));
    const slots = (await availability(me.client, refs.testDoctorId, date)).filter((s) => s.status === 'AVAILABLE');
    const appt = expectOk(await me.client.post('/api/appointments', { doctorId: refs.testDoctorId, patientId: me.patientId, startAt: slots[randInt(0, slots.length - 1)]!.startAt, type: 'IN_PERSON' }), 201) as any;
    await page.request.post('/api/auth/login', { data: { email: me.email, password: me.password } });
    await page.goto('/portal/appointments');
    const row = page.getByTestId('appointment-row').filter({ hasText: appt.appointmentNumber });
    await row.getByRole('button', { name: 'Cancel' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Cancel appointment' }).click();
    await expect(row).toHaveAttribute('data-status', 'CANCELLED');
  });
});
