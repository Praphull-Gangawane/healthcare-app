import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicLayout } from './layouts/PublicLayout';
import { RoleLayout } from './layouts/RoleLayout';
import { useAuth } from './hooks/useAuth';
import { homeFor } from './utils/roles';
import { HomePage } from './pages/public/HomePage';
import { DoctorsPage } from './pages/public/DoctorsPage';
import { DoctorProfilePage } from './pages/public/DoctorProfilePage';
import { BookingPage } from './pages/public/BookingPage';
import { LoginPage } from './pages/public/LoginPage';
import { RegisterPage } from './pages/public/RegisterPage';
import { SecureLinkPage } from './pages/public/SecureLinkPage';
import { QueueDisplayPage } from './pages/public/QueueDisplayPage';
import { PrivacyNoticePage } from './pages/public/PrivacyNoticePage';
import { NotFoundPage } from './pages/public/NotFoundPage';
import { PortalHome } from './pages/portal/PortalHome';
import { MyAppointments } from './pages/portal/MyAppointments';
import { AppointmentDetail } from './pages/portal/AppointmentDetail';
import { MyPrescriptions } from './pages/portal/MyPrescriptions';
import { PrescriptionDetail } from './pages/portal/PrescriptionDetail';
import { MyReports } from './pages/portal/MyReports';
import { MyTimeline } from './pages/portal/MyTimeline';
import { MyProfile } from './pages/portal/MyProfile';
import { MyDependents } from './pages/portal/MyDependents';
import { MyNotifications } from './pages/portal/MyNotifications';
import { MyDocuments } from './pages/portal/MyDocuments';
import { HealthDataPage } from './pages/portal/HealthDataPage';
import { MyBilling } from './pages/portal/MyBilling';
import { MyPrivacy } from './pages/portal/MyPrivacy';
import { DoctorDashboardPage } from './pages/doctor/DoctorDashboardPage';
import { DoctorPatientSearch } from './pages/doctor/DoctorPatientSearch';
import { PatientRecordPage } from './pages/doctor/PatientRecordPage';
import { ConsultationPage } from './pages/doctor/ConsultationPage';
import { ReceptionDashboardPage } from './pages/reception/ReceptionDashboardPage';
import { ReceptionAppointments } from './pages/reception/ReceptionAppointments';
import { ReceptionPatients } from './pages/reception/ReceptionPatients';
import { RegisterPatientPage } from './pages/reception/RegisterPatientPage';
import { ReceptionPatientDetail } from './pages/reception/ReceptionPatientDetail';
import { BookForPatientPage } from './pages/reception/BookForPatientPage';
import { WalkInPage } from './pages/reception/WalkInPage';
import { QueuePage } from './pages/reception/QueuePage';
import { InvoicesPage } from './pages/billing/InvoicesPage';
import { InvoiceDetailPage } from './pages/billing/InvoiceDetailPage';
import { RevenuePage } from './pages/billing/RevenuePage';
import { NurseStation } from './pages/nurse/NurseStation';
import { LabWorklist } from './pages/lab/LabWorklist';
import { LabOrderPage } from './pages/lab/LabOrderPage';
import { PharmacyPage } from './pages/pharmacy/PharmacyPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminReports } from './pages/admin/AdminReports';
import { AdminUsers } from './pages/admin/AdminUsers';
import { AdminDoctors } from './pages/admin/AdminDoctors';
import { AdminFacilities } from './pages/admin/AdminFacilities';
import { AdminServices } from './pages/admin/AdminServices';
import { AdminReferenceRanges } from './pages/admin/AdminReferenceRanges';
import { AdminSettings } from './pages/admin/AdminSettings';
import { AdminNotifications } from './pages/admin/AdminNotifications';
import { AdminAudit } from './pages/admin/AdminAudit';
import { AdminPrivacy } from './pages/admin/AdminPrivacy';

function DashboardRedirect() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  return <Navigate to={user ? homeFor(user) : '/login'} replace />;
}

export function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="doctors" element={<DoctorsPage />} />
        <Route path="doctors/:id" element={<DoctorProfilePage />} />
        <Route path="book/:doctorId" element={<BookingPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="register" element={<RegisterPage />} />
        <Route path="s/:token" element={<SecureLinkPage />} />
        <Route path="privacy" element={<PrivacyNoticePage />} />
        <Route path="dashboard" element={<DashboardRedirect />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="queue-display/:queueId" element={<QueueDisplayPage />} />

      <Route path="portal" element={<RoleLayout area="portal" />}>
        <Route index element={<PortalHome />} />
        <Route path="appointments" element={<MyAppointments />} />
        <Route path="appointments/:id" element={<AppointmentDetail />} />
        <Route path="prescriptions" element={<MyPrescriptions />} />
        <Route path="prescriptions/:id" element={<PrescriptionDetail />} />
        <Route path="reports" element={<MyReports />} />
        <Route path="timeline" element={<MyTimeline />} />
        <Route path="profile" element={<MyProfile />} />
        <Route path="dependents" element={<MyDependents />} />
        <Route path="notifications" element={<MyNotifications />} />
        <Route path="documents" element={<MyDocuments />} />
        <Route path="health-data" element={<HealthDataPage />} />
        <Route path="billing" element={<MyBilling />} />
        <Route path="privacy" element={<MyPrivacy />} />
      </Route>

      <Route path="doctor" element={<RoleLayout area="doctor" />}>
        <Route index element={<DoctorDashboardPage />} />
        <Route path="patients" element={<DoctorPatientSearch />} />
        <Route path="patients/:id" element={<PatientRecordPage />} />
        <Route path="encounters/:id" element={<ConsultationPage />} />
      </Route>

      <Route path="reception" element={<RoleLayout area="reception" />}>
        <Route index element={<ReceptionDashboardPage />} />
        <Route path="appointments" element={<ReceptionAppointments />} />
        <Route path="patients" element={<ReceptionPatients />} />
        <Route path="patients/:id" element={<ReceptionPatientDetail />} />
        <Route path="register" element={<RegisterPatientPage />} />
        <Route path="book" element={<BookForPatientPage />} />
        <Route path="walk-in" element={<WalkInPage />} />
        <Route path="queue" element={<QueuePage />} />
        <Route path="invoices" element={<InvoicesPage />} />
        <Route path="invoices/:id" element={<InvoiceDetailPage />} />
      </Route>

      <Route path="nurse" element={<RoleLayout area="nurse" />}>
        <Route index element={<NurseStation />} />
      </Route>
      <Route path="lab" element={<RoleLayout area="lab" />}>
        <Route index element={<LabWorklist />} />
        <Route path="orders/:id" element={<LabOrderPage />} />
      </Route>
      <Route path="billing" element={<RoleLayout area="billing" />}>
        <Route index element={<InvoicesPage />} />
        <Route path="invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="revenue" element={<RevenuePage />} />
      </Route>
      <Route path="pharmacy" element={<RoleLayout area="pharmacy" />}>
        <Route index element={<PharmacyPage />} />
      </Route>
      <Route path="admin" element={<RoleLayout area="admin" />}>
        <Route index element={<AdminDashboardPage />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="doctors" element={<AdminDoctors />} />
        <Route path="facilities" element={<AdminFacilities />} />
        <Route path="services" element={<AdminServices />} />
        <Route path="reference-ranges" element={<AdminReferenceRanges />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="notifications" element={<AdminNotifications />} />
        <Route path="audit" element={<AdminAudit />} />
        <Route path="privacy" element={<AdminPrivacy />} />
      </Route>
    </Routes>
  );
}
