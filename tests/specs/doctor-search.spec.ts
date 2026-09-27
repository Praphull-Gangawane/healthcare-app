import { test, expect } from '../fixtures/ui.js';
import { DoctorSearchPage } from '../pages/DoctorSearchPage.js';

test.describe('doctor search (UI)', () => {
  test('search by name and filter by department', async ({ page }) => {
    const s = new DoctorSearchPage(page);
    await s.goto();
    await s.search('Varkey');
    await expect(s.card('Dr. Asha Varkey')).toBeVisible();
    await s.search('');
    await s.filterDepartment('Paediatrics');
    await expect(s.cards().first()).toBeVisible();
    for (const text of await s.cards().allInnerTexts()) expect(text).toContain('Paediatrics');
  });

  test('doctor profile shows availability', async ({ page }) => {
    const s = new DoctorSearchPage(page);
    await s.goto('?q=Neel');
    await page.getByRole('link', { name: 'View profile of Dr. Neel Sahasrabuddhe' }).click();
    await expect(page.getByRole('heading', { name: 'Availability' })).toBeVisible();
    await expect(page.getByText('Registration')).toBeVisible();
  });

  test('empty state for no matches', async ({ page }) => {
    const s = new DoctorSearchPage(page);
    await s.goto('?q=zzzznomatch');
    await expect(page.getByText('No doctors match your search')).toBeVisible();
  });
});
