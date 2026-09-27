/* eslint-disable @typescript-eslint/no-explicit-any */
import { test, expect } from '../fixtures/ui.js';
import { InvestigationPage } from '../pages/InvestigationPage.js';
import { PatientDashboardPage } from '../pages/PatientDashboardPage.js';
import { registerPortalUser } from '../utils/factories.js';
import { expectOk } from '../utils/assertions.js';

test.describe('lab results (UI)', () => {
  test('lab collects, enters results, verifies; patient sees the released report', async ({ loginAs, page, browser, as, refs }) => {
    const me = await registerPortalUser();
    const reception = await as('reception');
    const doctor = await as('doctor');
    const walk = expectOk(await reception.post('/api/appointments/walk-ins', { patientId: me.patientId, doctorId: refs.testDoctorId, facilityId: refs.rscFacilityId }), 201) as any;
    const enc = expectOk(await doctor.post('/api/encounters', { appointmentId: walk.id }), 201) as any;
    const cbc = (expectOk(await doctor.get('/api/investigations/catalog', { params: { q: 'CBC' } })) as any[])[0];
    const order = expectOk(await doctor.post(`/api/encounters/${enc.id}/orders`, { investigationId: cbc.id }), 201) as any;

    await loginAs('lab');
    const lab = new InvestigationPage(page);
    await lab.gotoWorklist();
    await lab.openOrder(order.orderNumber);
    await lab.collect();
    await lab.enterResult('Haemoglobin', '10.2');
    await lab.enterResult('Total leucocyte count', '6.5');
    await lab.enterResult('Platelet count', '250');
    await lab.saveResults();
    await expect(lab.resultRows().filter({ hasText: 'Haemoglobin' })).toHaveAttribute('data-flag', 'LOW');
    await lab.verify();

    const ctx = await browser.newContext();
    const pp = await ctx.newPage();
    await pp.request.post('/api/auth/login', { data: { email: me.email, password: me.password } });
    const portal = new PatientDashboardPage(pp);
    await portal.openReports();
    await expect(pp.getByRole('heading', { name: 'Complete Blood Count' })).toBeVisible();
    await expect(pp.getByTestId('lab-result-row').filter({ hasText: 'Haemoglobin' })).toContainText('Below range');
    await ctx.close();
  });
});
