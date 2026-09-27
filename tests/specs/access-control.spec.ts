import { test, expect } from '../fixtures/ui.js';

test.describe('role-based areas (UI)', () => {
  for (const [role, area] of [['reception', '/doctor'], ['lab', '/reception'], ['accountant', '/admin'], ['doctor', '/lab']] as const) {
    test(`${role} cannot use ${area}`, async ({ loginAs, page }) => {
      await loginAs(role, area);
      await expect(page.getByTestId('access-denied')).toBeVisible();
    });
  }

  test('reception patient view has no clinical sections', async ({ loginAs, page, refs }) => {
    await loginAs('reception', `/reception/patients/${refs.demoPatientId}`);
    await expect(page.getByRole('heading', { name: 'Communication consent' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/Diagnosis|Prescription|Allergies/);
  });
});
