import { test, expect } from '../fixtures/ui.js';
import { AdminPage } from '../pages/AdminPage.js';

test.describe('admin oversight (UI)', () => {
  test('audit log is searchable and admin overview shows operational stats only', async ({ loginAs, page }) => {
    await loginAs('admin');
    const admin = new AdminPage(page);
    await admin.gotoOverview();
    await expect(page.getByText('Appointments', { exact: true }).first()).toBeVisible();
    await admin.gotoAudit();
    await admin.filterAudit('auth.login');
    await expect(admin.auditRows().first()).toContainText('auth.login');
    await admin.gotoReports();
    await expect(page.getByRole('table', { name: 'Appointments' })).toBeVisible();
  });
});
