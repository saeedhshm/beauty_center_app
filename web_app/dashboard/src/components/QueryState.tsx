import { Alert, Box, Button, CircularProgress, Paper, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import { ApiError } from '../api/client';
import { describeApiError, isConflictCode } from '../fmt/format';

export function LoadingState({ label }: { label: string }) {
  return (
    <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
      <CircularProgress aria-label={label} />
      <Typography color="text.secondary" sx={{ mt: 2 }}>{label}</Typography>
    </Box>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <Paper elevation={0} sx={{ p: 5, textAlign: 'center' }}>
      <Typography variant="h6">{title}</Typography>
      {hint && <Typography color="text.secondary" sx={{ mt: 1 }}>{hint}</Typography>}
    </Paper>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const code = error instanceof ApiError ? error.code : undefined;
  const message = error instanceof ApiError ? describeApiError(code, error.message) : 'تعذر الاتصال بالخادم. تحقّقي من الشبكة ثم حاولي مجددًا.';
  const conflict = isConflictCode(code);
  const forbidden = error instanceof ApiError && error.status === 403;
  return (
    <Paper elevation={0} sx={{ p: 4 }}>
      <Alert severity={conflict ? 'warning' : 'error'} sx={{ mb: 2 }}>
        {forbidden ? 'ليس لديك صلاحية عرض هذا المورد.' : message}
        {error instanceof ApiError && error.requestId && (
          <Typography variant="caption" sx={{ display: 'block' }}>رقم التتبع: {error.requestId}</Typography>
        )}
      </Alert>
      <Button variant="outlined" onClick={onRetry}>إعادة المحاولة</Button>
    </Paper>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start', justifyContent: 'space-between', mb: 3 }}>
      <Box>
        <Typography variant="h4" component="h1" sx={{ fontSize: { xs: '1.6rem', md: '2.1rem' } }}>{title}</Typography>
        {subtitle && <Typography color="text.secondary" sx={{ mt: 0.5 }}>{subtitle}</Typography>}
      </Box>
      {actions && <Box sx={{ display: 'flex', gap: 1 }}>{actions}</Box>}
    </Box>
  );
}
