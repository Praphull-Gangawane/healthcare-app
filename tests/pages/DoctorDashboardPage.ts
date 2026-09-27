import { expect, type Page } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class DoctorDashboardPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto() {
    await this.page.goto('/doctor');
    await expect(this.heading('Today')).toBeVisible();
  }

  row(appointmentNumber: string) {
    return this.page.getByTestId('appointment-row').filter({ hasText: appointmentNumber });
  }

  async startConsultation(appointmentNumber: string) {
    await this.row(appointmentNumber).getByRole('button', { name: /Start consultation|Continue/ }).click();
    await this.page.waitForURL(/\/doctor\/encounters\//);
  }
}
