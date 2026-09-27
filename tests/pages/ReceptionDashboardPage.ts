import { expect, type Page } from '@playwright/test';
import { BasePage, selectOptionContaining } from './BasePage.js';

export class ReceptionDashboardPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto() {
    await this.page.goto('/reception');
    await expect(this.heading('Front desk')).toBeVisible();
  }

  async search(text: string) {
    await this.page.getByTestId('patient-search-input').fill(text);
    await expect(this.page.getByTestId('patient-result').first()).toBeVisible();
  }

  async openAppointments(date?: string) {
    await this.page.goto('/reception/appointments');
    if (date) await this.page.getByLabel('Date').fill(date);
  }

  appointmentRow(appointmentNumber: string) {
    return this.page.getByTestId('appointment-row').filter({ hasText: appointmentNumber });
  }

  /** Narrows the day list to one appointment (the list is paginated). */
  async findAppointment(appointmentNumber: string) {
    await this.page.getByRole('searchbox', { name: 'Search' }).fill(appointmentNumber);
    await expect(this.page.getByTestId('appointment-row')).toHaveCount(1);
  }

  async checkIn(appointmentNumber: string) {
    await this.findAppointment(appointmentNumber);
    await this.appointmentRow(appointmentNumber).getByRole('button', { name: /^Check in/ }).click();
    await expect(this.appointmentRow(appointmentNumber)).toHaveAttribute('data-status', 'WAITING');
  }

  async openQueue(doctorName: string, facilityName = 'Riverside Demo Clinic') {
    await this.page.goto('/reception/queue');
    await selectOptionContaining(this.page, 'Facility', facilityName);
    await selectOptionContaining(this.page, 'Doctor', doctorName);
  }
}
