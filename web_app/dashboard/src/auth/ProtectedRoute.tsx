import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from './auth-context';
import { useI18n } from '../i18n/i18n';

export function ProtectedRoute() {
  const auth = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (auth.status === 'loading') {
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', bgcolor: 'background.default' }}>
        <CircularProgress aria-label={t('جارٍ استعادة جلسة الإدارة')} />
      </Box>
    );
  }
  if (auth.status === 'anonymous') return <Navigate to="/login" replace state={{ from: location }} />;
  return <Outlet />;
}
