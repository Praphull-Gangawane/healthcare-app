import { expect, type Page } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class ConsultationPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  draftBadge() {
    return this.page.getByTestId('draft-badge');
  }

  async fillHistory(text: string) {
    await this.page.getByLabel('History of present illness').fill(text);
    await expect(this.page.getByText('Draft saved')).toBeVisible({ timeout: 10_000 });
  }

  async addDiagnosis(description: string, code?: string) {
    await this.page.getByLabel('Diagnosis', { exact: true }).fill(description);
    if (code) await this.page.getByLabel('ICD-10 code (optional)').fill(code);
    await this.page.getByRole('button', { name: 'Add diagnosis' }).click();
    await expect(this.page.getByTestId('diagnosis-list')).toContainText(description);
  }

  async orderTest(label: string) {
    await this.page.getByLabel('Test', { exact: true }).selectOption({ label });
    await this.page.getByRole('button', { name: 'Order test' }).click();
    await expect(this.page.getByText(label.replace(/ \(.*\)$/, '')).first()).toBeVisible();
  }

  async completeVisit() {
    await this.page.getByRole('button', { name: 'Complete visit' }).first().click();
    await this.page.getByRole('alertdialog').getByRole('button', { name: 'Complete visit' }).click();
    await this.page.waitForURL(/\/doctor$/);
  }
}
