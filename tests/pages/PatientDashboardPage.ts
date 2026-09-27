import { expect, type Page } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class PatientDashboardPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto() {
    await this.page.goto('/portal');
    await expect(this.heading(/^Hello/)).toBeVisible();
  }

  nextAppointment() {
    return this.page.getByRole('region', { name: 'Next appointment' }).or(this.page.locator('section', { has: this.page.getByRole('heading', { name: 'Next appointment' }) })).first();
  }

  async openPrescriptions() {
    await this.page.goto('/portal/prescriptions');
    await expect(this.heading('Prescriptions')).toBeVisible();
  }

  prescriptionRows() {
    return this.page.getByTestId('prescription-row');
  }

  async openTimeline() {
    await this.page.goto('/portal/timeline');
    await expect(this.heading('Medical timeline')).toBeVisible();
  }

  timelineItems() {
    return this.page.getByTestId('timeline-item');
  }

  async openReports() {
    await this.page.goto('/portal/reports');
    await expect(this.heading('Test reports')).toBeVisible();
  }
}
