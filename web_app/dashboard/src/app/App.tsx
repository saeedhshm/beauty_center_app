import { lazy, Suspense } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '../auth/ProtectedRoute';
import { AppErrorBoundary } from '../components/AppErrorBoundary';
import { AppProviders } from './AppProviders';

const LoginPage = lazy(() => import('../auth/LoginPage').then((module) => ({ default: module.LoginPage })));
const DashboardShell = lazy(() => import('../layout/DashboardShell').then((module) => ({ default: module.DashboardShell })));
const HomePage = lazy(() => import('../pages/HomePage').then((module) => ({ default: module.HomePage })));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })));
const ServicesPage = lazy(() => import('../pages/ServicesPage').then((module) => ({ default: module.ServicesPage })));
const ExpertsPage = lazy(() => import('../pages/ExpertsPage').then((module) => ({ default: module.ExpertsPage })));
const ExpertDetailPage = lazy(() => import('../pages/ExpertDetailPage').then((module) => ({ default: module.ExpertDetailPage })));
const BookingsPage = lazy(() => import('../pages/BookingsPage').then((module) => ({ default: module.BookingsPage })));
const BookingDetailPage = lazy(() => import('../pages/BookingDetailPage').then((module) => ({ default: module.BookingDetailPage })));
const UsersPage = lazy(() => import('../pages/UsersPage').then((module) => ({ default: module.UsersPage })));
const UserDetailPage = lazy(() => import('../pages/UserDetailPage').then((module) => ({ default: module.UserDetailPage })));
const ReviewsPage = lazy(() => import('../pages/ReviewsPage').then((module) => ({ default: module.ReviewsPage })));
const AuditPage = lazy(() => import('../pages/AuditPage').then((module) => ({ default: module.AuditPage })));
const PaymentsPage = lazy(() => import('../pages/PaymentsPage').then((module) => ({ default: module.PaymentsPage })));
const PaymentDetailPage = lazy(() => import('../pages/PaymentDetailPage').then((module) => ({ default: module.PaymentDetailPage })));
const PayoutsPage = lazy(() => import('../pages/PayoutsPage').then((module) => ({ default: module.PayoutsPage })));
const PayoutDetailPage = lazy(() => import('../pages/PayoutDetailPage').then((module) => ({ default: module.PayoutDetailPage })));
const PayoutCreatePage = lazy(() => import('../pages/PayoutCreatePage').then((module) => ({ default: module.PayoutCreatePage })));
const OverviewPage = lazy(() => import('../pages/OverviewPage').then((module) => ({ default: module.OverviewPage })));
const OperationsPage = lazy(() => import('../pages/OperationsPage').then((module) => ({ default: module.OperationsPage })));

function RouteFallback() {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
      <CircularProgress aria-label="جارٍ تحميل الصفحة" />
    </Box>
  );
}

export function App() {
  return (
    <AppErrorBoundary>
      <AppProviders>
        <Suspense fallback={<RouteFallback />}>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<DashboardShell />}>
                  <Route index element={<HomePage />} />
                  <Route path="services" element={<ServicesPage />} />
                  <Route path="experts" element={<ExpertsPage />} />
                  <Route path="experts/:id" element={<ExpertDetailPage />} />
                  <Route path="bookings" element={<BookingsPage />} />
                  <Route path="bookings/:id" element={<BookingDetailPage />} />
                  <Route path="users" element={<UsersPage />} />
                  <Route path="users/:id" element={<UserDetailPage />} />
                  <Route path="reviews" element={<ReviewsPage />} />
                  <Route path="audit" element={<AuditPage />} />
                  <Route path="payments" element={<PaymentsPage />} />
                  <Route path="payments/:id" element={<PaymentDetailPage />} />
                  <Route path="payouts" element={<PayoutsPage />} />
                  <Route path="payouts/new" element={<PayoutCreatePage />} />
                  <Route path="payouts/:id" element={<PayoutDetailPage />} />
                  <Route path="overview" element={<OverviewPage />} />
                  <Route path="operations" element={<OperationsPage />} />
                </Route>
              </Route>
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </BrowserRouter>
        </Suspense>
      </AppProviders>
    </AppErrorBoundary>
  );
}
