import { test, expect } from '../fixtures/ui.js';
import { DoctorSearchPage } from '../pages/DoctorSearchPage.js';
import { PatientDashboardPage } from '../pages/PatientDashboardPage.js';

const PAGES = ['/', '/doctors', '/login', '/register'];

test.describe('responsive layout', () => {
  for (const path of PAGES) {
    test(`no horizontal scroll on ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await new DoctorSearchPage(page).expectNoHorizontalScroll();
    });
  }

  test('patient portal fits the viewport and navigation is reachable', async ({ loginAs, page }) => {
    await loginAs('patient');
    const portal = new PatientDashboardPage(page);
    await portal.goto();
    await portal.expectNoHorizontalScroll();
    await expect(page.getByRole('link', { name: 'Book appointment' })).toBeVisible();
  });
});
