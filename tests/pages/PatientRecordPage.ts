import { expect, type Page } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class PatientRecordPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(patientId: string) {
    await this.page.goto(`/doctor/patients/${patientId}`);
  }

  async tab(name: 'Overview' | 'Timeline' | 'Vitals' | 'Lab results' | 'Prescriptions' | 'Documents' | 'Health data') {
    await this.page.getByRole('tab', { name }).click();
  }

  breakGlassForm() {
    return this.page.getByLabel(/Reason for emergency access/);
  }

  async breakGlass(reason: string) {
    await this.breakGlassForm().fill(reason);
    await this.page.getByRole('button', { name: 'Open with emergency access' }).click();
    await expect(this.page.getByText('Emergency access in use — audited.')).toBeVisible();
  }
}
