import { expect, type Page } from '@playwright/test';
import { BasePage } from './BasePage.js';

/** Prescription builder inside the consultation screen. */
export class PrescriptionPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  builder() {
    return this.page.getByTestId('prescription-builder');
  }

  rows() {
    return this.page.getByTestId('medication-row');
  }

  async create() {
    await this.page.getByRole('button', { name: 'Create prescription' }).click();
    await expect(this.builder()).toBeVisible();
  }

  async addFromCatalogue(search: string, resultName: RegExp, frequency = 'Twice daily', timing = 'After food') {
    await this.page.getByLabel('Search medicine (generic name)').fill(search);
    await this.page.getByRole('button', { name: resultName }).first().click();
    const row = this.rows().last();
    await row.getByLabel('Frequency').selectOption(frequency);
    await row.getByLabel('Timing').selectOption(timing);
  }

  async addBlank() {
    await this.page.getByRole('button', { name: 'Add medicine' }).click();
  }

  async remove(index: number) {
    await this.page.getByRole('button', { name: `Remove medicine ${index + 1}` }).click();
  }

  async saveDraft() {
    await this.page.getByRole('button', { name: 'Save draft' }).click();
  }

  async finalize() {
    await this.page.getByTestId('finalize-prescription').click();
    await this.page.getByRole('alertdialog').getByRole('button', { name: 'Finalize and sign' }).click();
    await expect(this.page.getByText(/Prescription finalized · Version 1/)).toBeVisible();
  }

  status() {
    return this.page.getByTestId('prescription-status');
  }
}
