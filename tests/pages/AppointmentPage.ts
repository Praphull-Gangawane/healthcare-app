import { expect, type Page } from '@playwright/test';
import { BasePage } from './BasePage.js';

/** Multi-step booking flow (/book/:doctorId). */
export class AppointmentPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  step() {
    return this.page.getByTestId('booking-step');
  }

  async currentStep(): Promise<number> {
    return Number(await this.step().getAttribute('data-step'));
  }

  async chooseVisitType(label = 'In-person') {
    if ((await this.currentStep()) !== 0) return;
    await this.page.getByRole('radio', { name: new RegExp(label, 'i') }).first().check();
    await this.page.getByRole('button', { name: 'Continue' }).click();
  }

  slots() {
    return this.page.getByTestId('slot-button').and(this.page.locator(':not([disabled])'));
  }

  async pickSlot(index = 0) {
    if ((await this.currentStep()) !== 1) return;
    await expect(this.slots().first()).toBeVisible();
    const count = await this.slots().count();
    await this.slots().nth(Math.min(index, count - 1)).click();
    await this.page.getByRole('button', { name: 'Continue' }).click();
  }

  async enterDetails(reason: string, patientLabel?: string | RegExp) {
    await expect(this.step()).toHaveAttribute('data-step', '2');
    if (patientLabel) await this.page.getByRole('radio', { name: patientLabel }).check();
    await this.page.getByLabel('Reason for visit').fill(reason);
    await this.page.getByRole('button', { name: 'Review booking' }).click();
  }

  async confirm() {
    await expect(this.page.getByRole('heading', { name: 'Review your appointment' })).toBeVisible();
    await this.page.getByRole('button', { name: 'Confirm appointment' }).click();
  }

  async appointmentNumber(): Promise<string> {
    await expect(this.page.getByTestId('booking-confirmation')).toBeVisible();
    return ((await this.page.getByTestId('appointment-number').textContent()) ?? '').trim();
  }

  error() {
    return this.page.getByTestId('booking-error');
  }
}
