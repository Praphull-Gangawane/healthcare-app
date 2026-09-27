import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { appointmentsApi } from '../../api/appointments';
import { directoryApi } from '../../api/directory';
import { patientsApi } from '../../api/patients';
import { Alert } from '../../components/Alert';
import { AppointmentCalendar } from '../../components/AppointmentCalendar';
import { Button } from '../../components/Button';
import { FacilityDoctorPicker } from '../../components/FacilityDoctorPicker';
import { PageHeader } from '../../components/PageHeader';
import { PatientCard } from '../../components/PatientCard';
import { PatientSearch } from '../../components/PatientSearch';
import { SlotPicker } from '../../components/SlotPicker';
import { useFacilityDoctors } from '../../hooks/useFacilityDoctors';
import { useIdempotencyKey } from '../../hooks/useIdempotencyKey';
import type { Appointment, AppointmentType } from '../../types/domain';
import { errorCode, errorMessage, SLOT_UNAVAILABLE_MESSAGE } from '../../utils/errors';
import { formatDateLong, formatTime, todayIso } from '../../utils/format';
import { appointmentTypeLabel } from '../../utils/labels';

export function BookForPatientPage() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const idem = useIdempotencyKey();
  const fd = useFacilityDoctors();
  const [patientId, setPatientId] = useState(params.get('patientId') ?? '');
  const initialDoctor = params.get('doctorId');
  const doctorId = initialDoctor && !fd.doctors.length ? initialDoctor : fd.doctorId || initialDoctor || '';
  const [date, setDate] = useState(todayIso());
  const [slot, setSlot] = useState<string | null>(null);
  const [type, setType] = useState<AppointmentType>('IN_PERSON');
  const [reason, setReason] = useState('');
  const [booked, setBooked] = useState<Appointment | null>(null);
  const patient = useQuery({ queryKey: ['patient', patientId], queryFn: () => patientsApi.get(patientId), enabled: !!patientId });
  const slots = useQuery({ queryKey: ['availability', doctorId, date, type], queryFn: () => directoryApi.availability(doctorId, date, type), enabled: !!doctorId });
  const book = useMutation({
    mutationFn: () => idem.run(`desk-book:${doctorId}:${slot}:${patientId}`, (k) => appointmentsApi.book({ doctorId, patientId, startAt: slot ?? '', type, ...(reason ? { reason } : {}) }, k)),
    onSuccess: (a) => {
      setBooked(a);
      setSlot(null);
      void qc.invalidateQueries({ queryKey: ['availability'] });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (e) => {
      if (errorCode(e) === 'SLOT_UNAVAILABLE') void slots.refetch();
    },
  });
  return (
    <div className="page stack">
      <PageHeader title="Book appointment" docTitle="Book appointment" />
      {booked ? (
        <Alert tone="success" title="Appointment confirmed" testId="booking-confirmation">
          <span data-testid="appointment-number">{booked.appointmentNumber}</span> · {booked.patient.fullName} with {booked.doctor.displayName} on {formatDateLong(booked.startAt)} at {formatTime(booked.startAt)}. Confirmation sent to the patient’s opted-in channels.
        </Alert>
      ) : null}
      <section className="card stack-sm">
        <h2>1. Patient</h2>
        {patient.data ? (
          <PatientCard patient={patient.data} actions={<Button size="sm" variant="ghost" onClick={() => setPatientId('')}>Change</Button>} />
        ) : (
          <PatientSearch actionLabel="Select" onSelect={(p) => setPatientId(p.id)} />
        )}
      </section>
      <section className="card stack-sm">
        <h2>2. Doctor, date and time</h2>
        <FacilityDoctorPicker facilities={fd.facilities} facilityId={fd.facilityId} onFacility={fd.setFacilityId} doctors={fd.doctors} doctorId={doctorId} onDoctor={(v) => { fd.setDoctorId(v); setSlot(null); }} />
        <div className="field" style={{ maxWidth: 280 }}>
          <label htmlFor="bk-type">Visit type</label>
          <select id="bk-type" className="select" value={type} onChange={(e) => setType(e.target.value as AppointmentType)}>
            {(['IN_PERSON', 'FOLLOW_UP', 'TELECONSULTATION', 'DIAGNOSTIC', 'PROCEDURE', 'URGENT'] as AppointmentType[]).map((t) => (
              <option key={t} value={t}>
                {appointmentTypeLabel[t]}
              </option>
            ))}
          </select>
        </div>
        <AppointmentCalendar value={date} onChange={(d) => { setDate(d); setSlot(null); }} />
        <SlotPicker slots={slots.data?.slots} loading={slots.isLoading} error={slots.error} selected={slot} onSelect={(s) => setSlot(s.startAt)} />
      </section>
      <section className="card stack-sm">
        <h2>3. Confirm</h2>
        <div className="field">
          <label htmlFor="bk-reason">Reason for visit</label>
          <input id="bk-reason" className="input" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </div>
        {book.isError ? <Alert tone="error">{errorCode(book.error) === 'SLOT_UNAVAILABLE' ? SLOT_UNAVAILABLE_MESSAGE : errorMessage(book.error)}</Alert> : null}
        <div>
          <Button variant="primary" icon="check" disabled={!patientId || !slot} loading={book.isPending} loadingText="Confirming booking…" onClick={() => book.mutate()}>
            Confirm appointment
          </Button>
        </div>
      </section>
    </div>
  );
}
