import { expect, type Page } from '@playwright/test';
import { BasePage } from './BasePage.js';

export class DoctorSearchPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async goto(query = '') {
    await this.page.goto(`/doctors${query}`);
    await expect(this.heading('Find a doctor')).toBeVisible();
  }

  async search(text: string) {
    await this.page.getByLabel('Doctor or speciality').fill(text);
  }

  async filterDepartment(name: string) {
    await this.page.getByLabel('Department').selectOption(name);
  }

  cards() {
    return this.page.getByTestId('doctor-card');
  }

  card(name: string) {
    return this.cards().filter({ has: this.page.getByRole('heading', { name }) });
  }

  async book(name: string) {
    await this.page.getByRole('link', { name: `Book appointment with ${name}` }).click();
  }
}
