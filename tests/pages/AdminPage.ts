import { expect, type Page } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class AdminPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoOverview() {
    await this.page.goto('/admin');
    await expect(this.heading('Operations overview')).toBeVisible();
  }

  async gotoAudit() {
    await this.page.goto('/admin/audit');
    await expect(this.heading('Audit log')).toBeVisible();
  }

  async filterAudit(action: string) {
    await this.page.getByLabel('Action starts with').fill(action);
  }

  auditRows() {
    return this.page.getByTestId('audit-row');
  }

  async gotoReports() {
    await this.page.goto('/admin/reports');
    await expect(this.heading('Reports')).toBeVisible();
  }
}
