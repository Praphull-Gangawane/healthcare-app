import { expect, type Page } from '@playwright/test';
import { BasePage } from './BasePage.js';

export interface RegistrationData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'Female' | 'Male' | 'Other';
  mobile: string;
  email: string;
  password: string;
  whatsapp?: boolean;
}

/** Patient self-registration (/register). */
export class PatientRegistrationPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto() {
    await this.page.goto('/register');
    await expect(this.heading('Create your account')).toBeVisible();
  }

  async fill(d: RegistrationData) {
    const p = this.page;
    await p.getByLabel('First name').fill(d.firstName);
    await p.getByLabel(/^Last name/).fill(d.lastName);
    await p.getByLabel('Date of birth').fill(d.dateOfBirth);
    await p.getByLabel('Gender').selectOption({ label: d.gender });
    await p.getByLabel('Mobile number').fill(d.mobile);
    await p.getByLabel('Email', { exact: true }).fill(d.email);
    await p.getByLabel('Password').fill(d.password);
    if (d.whatsapp) await p.getByLabel('Send me updates on WhatsApp').check();
    await p.getByLabel(/I agree to the terms/).check();
  }

  async submit() {
    await this.page.getByRole('button', { name: 'Create account' }).click();
  }

  errorFor(label: string | RegExp) {
    return this.page.locator('.field', { has: this.page.getByLabel(label) }).locator('.field-error');
  }
}
