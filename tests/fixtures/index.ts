/* eslint-disable @typescript-eslint/no-explicit-any */
import { test as base, expect, request as pwRequest } from '@playwright/test';
import { ApiClient, cachedSession } from '../utils/api.js';
import { API_BASE_URL } from '../utils/env.js';
import { ACCOUNTS, QUEUE_DOCTOR, TEST_DEPARTMENT, TEST_DOCTOR, DEMO_DOCTOR, LAKEVIEW, type Role } from '../data/testData.js';

/** Stable ids resolved once per worker from the public directory. */
export interface Refs {
  testDoctorId: string;
  demoDoctorId: string;
  queueDoctorId: string;
  rscFacilityId: string;
  lvhFacilityId: string;
  gmDepartmentId: string;
  /** Seeded demo patient (Priya) and her dependent child. */
  demoPatientId: string;
  dependentPatientId: string;
  patient2Id: string;
}

export interface ApiFixtures {
  /** Bearer client for a seeded role (token cached per worker). */
  as: (role: Role) => Promise<ApiClient>;
  /** Unauthenticated client. */
  anon: ApiClient;
}

export const test = base.extend<ApiFixtures, { refs: Refs }>({
  refs: [
    // eslint-disable-next-line no-empty-pattern -- Playwright requires an object pattern here
    async ({}, use) => {
      const ctx = await pwRequest.newContext({ baseURL: API_BASE_URL });
      const anon = new ApiClient(ctx);
      const doctors = async (q: string) => {
        const r = await anon.get('/api/directory/doctors', { params: { q, pageSize: 50 } });
        expect(r.status, r.text).toBe(200);
        return r.body.data as any[];
      };
      const byName = async (name: { searchName: string; displayName: string }) => {
        const d = (await doctors(name.searchName)).find((x) => x.displayName === name.displayName);
        if (!d) throw new Error(`Doctor ${name.displayName} not found — is the test DB seeded?`);
        return d.id as string;
      };
      const facilities = (await anon.get('/api/directory/facilities')).body.data as any[];
      const rsc = facilities.find((f) => f.code === TEST_DEPARTMENT.facilityCode);
      const lvh = facilities.find((f) => f.code === LAKEVIEW.code);
      const gm = rsc.departments.find((d: any) => d.code === TEST_DEPARTMENT.code);

      const patient = await cachedSession(ACCOUNTS.patient.email, ACCOUNTS.patient.password);
      const patientClient = new ApiClient(ctx, { kind: 'bearer', accessToken: patient.accessToken });
      const deps = (await patientClient.get('/api/patients/me/dependents')).body.data as any[];
      const patient2 = await cachedSession(ACCOUNTS.patient2.email, ACCOUNTS.patient2.password);

      await use({
        testDoctorId: await byName(TEST_DOCTOR),
        demoDoctorId: await byName(DEMO_DOCTOR),
        queueDoctorId: await byName(QUEUE_DOCTOR),
        rscFacilityId: rsc.id,
        lvhFacilityId: lvh.id,
        gmDepartmentId: gm.id,
        demoPatientId: patient.user.patientId as string,
        dependentPatientId: deps.find((d) => d.status === 'ACTIVE')?.patient.id,
        patient2Id: patient2.user.patientId as string,
      });
      await ctx.dispose();
    },
    { scope: 'worker' },
  ],

  as: async ({ request }, use) => {
    await use(async (role: Role) => {
      const acct = ACCOUNTS[role];
      const s = await cachedSession(acct.email, acct.password);
      return new ApiClient(request, { kind: 'bearer', accessToken: s.accessToken, refreshToken: s.refreshToken }, s.user);
    });
  },

  anon: async ({ request }, use) => {
    await use(new ApiClient(request));
  },
});

export { expect };
