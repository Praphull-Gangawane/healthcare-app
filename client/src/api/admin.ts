import { api } from './client';
import type { AdminFacility, Leave, OrgSettings, ReferenceRange, RoleKey, Schedule, StaffUser } from '../types/domain';

export const adminApi = {
  facilities: () => api.get<AdminFacility[]>('/admin/facilities'),
  createFacility: (body: unknown) => api.post<AdminFacility>('/admin/facilities', body),
  createDepartment: (body: { facilityId: string; name: string; code: string; description?: string }) => api.post<unknown>('/admin/departments', body),
  users: (role?: RoleKey) => api.get<StaffUser[]>('/admin/users', { role }),
  createUser: (body: { email: string; displayName: string; phone?: string; password: string; roles: { role: RoleKey; facilityId?: string }[] }) =>
    api.post<{ id: string }>('/admin/users', body),
  grantRole: (userId: string, role: RoleKey, facilityId?: string) => api.post<unknown>(`/admin/users/${userId}/roles`, { role, ...(facilityId ? { facilityId } : {}) }),
  revokeRole: (userId: string, userRoleId: string) => api.del<{ revoked: boolean }>(`/admin/users/${userId}/roles/${userRoleId}`),
  setUserStatus: (userId: string, status: 'ACTIVE' | 'DISABLED') => api.post<unknown>(`/admin/users/${userId}/status`, { status }),
  createDoctor: (body: unknown) => api.post<{ id: string }>('/admin/doctors', body),
  schedules: (doctorId: string) => api.get<{ schedules: Schedule[]; leaves: Leave[] }>(`/admin/doctors/${doctorId}/schedules`),
  createSchedule: (doctorId: string, body: unknown) => api.post<Schedule>(`/admin/doctors/${doctorId}/schedules`, body),
  deactivateSchedule: (scheduleId: string) => api.del<unknown>(`/admin/schedules/${scheduleId}`),
  addLeave: (doctorId: string, body: { type: Leave['type']; startAt: string; endAt: string; reason?: string }) =>
    api.post<Leave & { affectedAppointments?: unknown }>(`/admin/doctors/${doctorId}/leave`, body),
  referenceRanges: () => api.get<ReferenceRange[]>('/admin/reference-ranges'),
  upsertReferenceRange: (body: unknown) => api.put<ReferenceRange>('/admin/reference-ranges', body),
  settings: () => api.get<OrgSettings>('/admin/settings'),
  updateSettings: (body: Partial<OrgSettings>) => api.patch<OrgSettings>('/admin/settings', body),
};
