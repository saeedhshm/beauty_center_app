import {
  Alert, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, Divider, Paper, Stack, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { deactivateUser, getUser, reactivateUser } from '../api/users';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import { describeApiError, formatDateTime } from '../fmt/format';

export function UserDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<'deactivate' | 'reactivate' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['admin-user', id],
    queryFn: () => getUser(id),
    enabled: id.length > 0,
  });
  const mutation = useMutation({
    mutationFn: (kind: 'deactivate' | 'reactivate') => kind === 'deactivate' ? deactivateUser(id) : reactivateUser(id),
    onSuccess: async () => {
      setConfirm(null);
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-user', id] });
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (cause) => {
      setActionError(cause instanceof ApiError ? describeApiError(cause.code, cause.message) : 'تعذر تنفيذ الأمر.');
    },
  });
  const user = query.data;
  const expertLink = user?.role === 'expert' ? `/experts/${user.id}` : null;

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader
        title="ملف الحساب"
        {...(user ? { subtitle: user.name } : {})}
        actions={<Button component={RouterLink} to="/users">عودة إلى القائمة</Button>}
      />
      {query.isLoading && <LoadingState label="جارٍ تحميل الحساب" />}
      {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {user && (
        <Stack spacing={3}>
          {actionError && <Alert severity="warning" onClose={() => setActionError(null)}>{actionError}</Alert>}
          <Paper elevation={0} sx={{ p: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
              <Box>
                <Typography variant="h5" component="h2">{user.name}</Typography>
                <Typography color="text.secondary" dir="ltr" sx={{ textAlign: 'right' }}>{user.phone}</Typography>
                <Typography color="text.secondary">
                  {user.role === 'customer' ? 'عميلة' : user.role === 'expert' ? 'خبيرة' : 'مدير'}
                  {' · '}{user.cityName ?? 'بلا مدينة'}
                  {' · '}التقييم {user.ratingAvg} ({user.ratingCount})
                </Typography>
                <Typography color="text.secondary">أُنشئ {formatDateTime(user.createdAt)} · الهاتف {user.phoneVerified ? 'موثق' : 'غير موثق'}</Typography>
              </Box>
              <Chip size="medium" color={user.isActive ? 'success' : 'default'} label={user.isActive ? 'نشط' : 'معطّل'} />
            </Stack>
            <Divider sx={{ my: 2.5 }} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
              {expertLink && <Button variant="outlined" component={RouterLink} to={expertLink}>فتح ملف الخبيرة</Button>}
              {user.role !== 'admin' && user.isActive && (
                <Button variant="outlined" color="error" disabled={mutation.isPending} onClick={() => setConfirm('deactivate')}>تعطيل الحساب</Button>
              )}
              {user.role !== 'admin' && !user.isActive && (
                <Button variant="contained" color="success" disabled={mutation.isPending} onClick={() => setConfirm('reactivate')}>إعادة التفعيل</Button>
              )}
              {user.role === 'admin' && (
                <Typography variant="caption" color="text.secondary">لا يمكن تعطيل حساب مدير من اللوحة.</Typography>
              )}
            </Stack>
          </Paper>
        </Stack>
      )}
      {!query.isLoading && !query.error && !user && <EmptyState title="الحساب غير موجود" />}
      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} aria-labelledby="user-decision-title">
        <DialogTitle id="user-decision-title">{confirm === 'reactivate' ? 'تأكيد التفعيل' : 'تأكيد التعطيل'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirm === 'reactivate'
              ? 'سيستعيد الحساب أهلية الدخول فقط دون تغيير أي بيانات أخرى.'
              : 'سيُبطل هذا كل جلسات الحساب فورًا مع حفظ تاريخه وحجوزاته.'}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>تراجع</Button>
          <Button
            variant="contained"
            color={confirm === 'reactivate' ? 'success' : 'error'}
            disabled={mutation.isPending}
            onClick={() => confirm && mutation.mutate(confirm)}
          >
            تأكيد
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
