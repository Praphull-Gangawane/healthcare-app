import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { directoryApi } from '../api/directory';
import { useRequiredUser } from './useAuth';

/** Facility + doctor selection for staff screens, respecting the user's facility scope. */
export function useFacilityDoctors() {
  const user = useRequiredUser();
  const facilities = useQuery({ queryKey: ['facilities'], queryFn: directoryApi.facilities });
  const allowed = (facilities.data ?? []).filter((f) => user.facilityScope === 'ALL' || user.facilityScope.includes(f.id));
  const [facilityId, setFacilityId] = useState<string>('');
  const fid = facilityId || allowed[0]?.id || '';
  const doctors = useQuery({ queryKey: ['doctors', 'facility', fid], queryFn: () => directoryApi.doctors({ facilityId: fid, pageSize: 50 }), enabled: !!fid });
  const [doctorId, setDoctorId] = useState<string>('');
  const list = doctors.data?.items ?? [];
  const did = doctorId && list.some((d) => d.id === doctorId) ? doctorId : (list[0]?.id ?? '');
  return { facilities: allowed, facilityId: fid, setFacilityId: (v: string) => { setFacilityId(v); setDoctorId(''); }, doctors: list, doctorId: did, setDoctorId };
}
