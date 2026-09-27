import { expect, type Page } from '@playwright/test';
import { BasePage } from './BasePage.js';

export interface VitalsInput {
  heartRate?: string;
  systolic?: string;
  diastolic?: string;
  respiratoryRate?: string;
  temperature?: string;
  spo2?: string;
  height?: string;
  weight?: string;
}

/** The vitals form (used inside the consultation screen and the nurse station). */
export class VitalsPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  form() {
    return this.page.getByTestId('vital-form');
  }

  async record(v: VitalsInput) {
    const f = this.form();
    if (v.heartRate) await f.getByLabel('Heart rate (bpm)').fill(v.heartRate);
    if (v.systolic) await f.getByLabel('Systolic (mmHg)').fill(v.systolic);
    if (v.diastolic) await f.getByLabel('Diastolic (mmHg)').fill(v.diastolic);
    if (v.respiratoryRate) await f.getByLabel('Respiratory rate (breaths/min)').fill(v.respiratoryRate);
    if (v.temperature) await f.getByLabel('Temperature', { exact: true }).fill(v.temperature);
    if (v.spo2) await f.getByLabel('Oxygen saturation (%)').fill(v.spo2);
    if (v.height) await f.getByLabel('Height (cm)').fill(v.height);
    if (v.weight) await f.getByLabel('Weight (kg)').fill(v.weight);
    await f.getByRole('button', { name: 'Record vitals' }).click();
  }

  card(type: string) {
    return this.page.getByTestId('vital-card').and(this.page.locator(`[data-type="${type}"]`));
  }

  formError() {
    return this.form().getByRole('alert');
  }

  async expectCardFlag(type: string, flag: string) {
    await expect(this.card(type).first()).toHaveAttribute('data-flag', flag);
  }
}
