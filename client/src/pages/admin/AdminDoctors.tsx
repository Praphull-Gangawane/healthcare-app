import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '../../api/admin';
import { directoryApi } from '../../api/directory';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { SelectField, TextField } from '../../components/Field';
import { PageHeader } from '../../components/PageHeader';
import { QueryState } from '../../components/QueryState';
import { useToast } from '../../hooks/useToast';
import { errorMessage } from '../../utils/errors';
import { formatDateTime, todayIso } from '../../utils/format';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function Schedules({ doctorId, facilityId, departmentId }: { doctorId: string; facilityId: string; departmentId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: ['schedules', doctorId], queryFn: () => adminApi.schedules(doctorId) });
  const [s, setS] = useState({ dayOfWeek: '1', startTime: '09:00', endTime: '13:00', slotMinutes: '15', bufferMinutes: '0', overbookPerSlot: '0' });
  const [leave, setLeave] = useState({ date: todayIso(), reason: '' });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['schedules', doctorId] });
  const add = useMutation({ mutationFn: () => adminApi.createSchedule(doctorId, { facilityId, departmentId, dayOfWeek: Number(s.dayOfWeek), startTime: s.startTime, endTime: s.endTime, slotMinutes: Number(s.slotMinutes), bufferMinutes: Number(s.bufferMinutes), overbookPerSlot: Number(s.overbookPerSlot), breaks: [], consultationTypes: [], validFrom: todayIso() }), onSuccess: () => { toast.success('Schedule added.'); refresh(); } });
  const del = useMutation({ mutationFn: (id: string) => adminApi.deactivateSchedule(id), onSuccess: refresh });
  const addLeave = useMutation({ mutationFn: () => adminApi.addLeave(doctorId, { type: 'LEAVE', startAt: new Date(`${leave.date}T00:00:00+05:30`).toISOString(), endAt: new Date(`${leave.date}T23:59:00+05:30`).toISOString(), ...(leave.reason ? { reason: leave.reason } : {}) }), onSuccess: () => { toast.success('Leave added. Existing bookings in that period need rescheduling.'); refresh(); }, onError: (e) => toast.error(errorMessage(e)) });
  return (
    <div className="stack-sm">
      <QueryState query={q}>
        {(d) => (
          <>
            <ul className="list">
              {d.schedules.filter((x) => x.isActive).map((x) => (
                <li key={x.id} className="list-item small">
                  <span className="list-item-main">
                    {DAYS[x.dayOfWeek]} {x.startTime}–{x.endTime} · {x.slotMinutes} min slots · {x.facility.name} {x.room ? `· ${x.room.name}` : ''}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => del.mutate(x.id)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
            {d.leaves.length ? <p className="small">Upcoming leave: {d.leaves.map((l) => formatDateTime(l.startAt)).join(', ')}</p> : null}
          </>
        )}
      </QueryState>
      {add.isError ? <Alert tone="error">{errorMessage(add.error)}</Alert> : null}
      <div className="form-grid">
        <SelectField label="Day" value={s.dayOfWeek} onChange={(e) => setS({ ...s, dayOfWeek: e.target.value })} options={DAYS.map((d, i) => ({ value: String(i), label: d }))} />
        <TextField label="Start" type="time" value={s.startTime} onChange={(e) => setS({ ...s, startTime: e.target.value })} />
        <TextField label="End" type="time" value={s.endTime} onChange={(e) => setS({ ...s, endTime: e.target.value })} />
        <TextField label="Slot minutes" type="number" value={s.slotMinutes} onChange={(e) => setS({ ...s, slotMinutes: e.target.value })} />
        <TextField label="Buffer minutes" type="number" value={s.bufferMinutes} onChange={(e) => setS({ ...s, bufferMinutes: e.target.value })} />
        <TextField label="Overbook per slot" type="number" value={s.overbookPerSlot} onChange={(e) => setS({ ...s, overbookPerSlot: e.target.value })} />
      </div>
      <div className="button-row">
        <Button size="sm" variant="secondary" loading={add.isPending} onClick={() => add.mutate()}>
          Add schedule
        </Button>
      </div>
      <div className="form-grid">
        <TextField label="Leave date" type="date" value={leave.date} onChange={(e) => setLeave({ ...leave, date: e.target.value })} />
        <TextField label="Reason" optional value={leave.reason} onChange={(e) => setLeave({ ...leave, reason: e.target.value })} />
      </div>
      <div>
        <Button size="sm" variant="ghost" onClick={() => addLeave.mutate()}>
          Add leave / block day
        </Button>
      </div>
    </div>
  );
}

export function AdminDoctors() {
  const [open, setOpen] = useState<string | null>(null);
  const doctors = useQuery({ queryKey: ['doctors', 'admin'], queryFn: () => directoryApi.doctors({ pageSize: 100 }) });
  return (
    <div className="page stack">
      <PageHeader title="Doctors & schedules" subtitle="Doctor profiles, weekly availability, leave and slot blocks." docTitle="Doctors" />
      <QueryState query={doctors}>
        {(d) => (
          <ul className="stack-sm">
            {d.items.map((doc) => {
              const link = doc.departments[0];
              return (
                <li key={doc.id} className="card stack-sm">
                  <div className="card-header">
                    <div>
                      <h2>{doc.displayName}</h2>
                      <p className="small muted">
                        {doc.specialty} · {link ? `${link.department.name}, ${link.facility.name}` : ''} · {doc.registrationNumber}
                      </p>
                    </div>
                    <Button size="sm" variant="secondary" aria-expanded={open === doc.id} onClick={() => setOpen(open === doc.id ? null : doc.id)}>
                      {open === doc.id ? 'Hide schedule' : 'Manage schedule'}
                    </Button>
                  </div>
                  {open === doc.id && link ? <Schedules doctorId={doc.id} facilityId={link.facility.id} departmentId={link.department.id} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
