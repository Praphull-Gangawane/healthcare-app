import { expect, type Page } from '@playwright/test';
import { BasePage } from './BasePage.js';

/** Lab worklist and order detail. */
export class InvestigationPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async gotoWorklist() {
    await this.page.goto('/lab');
    await expect(this.heading('Lab worklist')).toBeVisible();
  }

  async openOrder(orderNumber: string) {
    await this.page.getByRole('link', { name: orderNumber }).click();
    await expect(this.page.getByRole('heading', { level: 1, name: new RegExp(orderNumber) })).toBeVisible();
  }

  async collect() {
    await this.page.getByRole('button', { name: 'Mark sample collected' }).click();
  }

  async enterResult(parameter: string, value: string) {
    await this.page.getByLabel(parameter, { exact: true }).fill(value);
  }

  async saveResults() {
    await this.page.getByRole('button', { name: 'Save results' }).click();
  }

  async verify() {
    await this.page.getByRole('button', { name: 'Verify report' }).click();
    await expect(this.page.getByTestId('status-badge').filter({ hasText: 'Verified' }).first()).toBeVisible();
  }

  resultRows() {
    return this.page.getByTestId('lab-result-row');
  }
}
