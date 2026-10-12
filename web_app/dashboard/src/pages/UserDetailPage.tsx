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
import { useI18n } from '../i18n/i18n';

export function UserDetailPage() {
  const { t } = useI18n();
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
      setActionError(cause instanceof ApiError ? describeApiError(cause.code, cause.message) : t('تعذر تنفيذ الأمر.'));
    },
  });
  const user = query.data;
  const expertLink = user?.role === 'expert' ? `/experts/${user.id}` : null;

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader
        title={t('ملف الحساب')}
        {...(user ? { subtitle: user.name } : {})}
        actions={<Button component={RouterLink} to="/users">{t('عودة إلى القائمة')}</Button>}
      />
      {query.isLoading && <LoadingState label={t('جارٍ تحميل الحساب')} />}
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
                   {user.role === 'customer' ? t('عميلة') : user.role === 'expert' ? t('خبيرة') : t('مدير')}
                   {' · '}{user.cityName ?? t('بلا مدينة')}
                   {' · '}{t('التقييم')} {user.ratingAvg} ({user.ratingCount})
                </Typography>
                 <Typography color="text.secondary">{t('أُنشئ')} {formatDateTime(user.createdAt)} · {t('الهاتف')} {user.phoneVerified ? t('موثق') : t('غير موثق')}</Typography>
              </Box>
               <Chip size="medium" color={user.isActive ? 'success' : 'default'} label={user.isActive ? t('نشط') : t('معطّل')} />
            </Stack>
            <Divider sx={{ my: 2.5 }} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
               {expertLink && <Button variant="outlined" component={RouterLink} to={expertLink}>{t('فتح ملف الخبيرة')}</Button>}
              {user.role !== 'admin' && user.isActive && (
                 <Button variant="outlined" color="error" disabled={mutation.isPending} onClick={() => setConfirm('deactivate')}>{t('تعطيل الحساب')}</Button>
              )}
              {user.role !== 'admin' && !user.isActive && (
                 <Button variant="contained" color="success" disabled={mutation.isPending} onClick={() => setConfirm('reactivate')}>{t('إعادة التفعيل')}</Button>
              )}
              {user.role === 'admin' && (
                 <Typography variant="caption" color="text.secondary">{t('لا يمكن تعطيل حساب مدير من اللوحة.')}</Typography>
              )}
            </Stack>
          </Paper>
        </Stack>
      )}
       {!query.isLoading && !query.error && !user && <EmptyState title={t('الحساب غير موجود')} />}
      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} aria-labelledby="user-decision-title">
         <DialogTitle id="user-decision-title">{confirm === 'reactivate' ? t('تأكيد التفعيل') : t('تأكيد التعطيل')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {confirm === 'reactivate'
               ? t('سيستعيد الحساب أهلية الدخول فقط دون تغيير أي بيانات أخرى.')
               : t('سيُبطل هذا كل جلسات الحساب فورًا مع حفظ تاريخه وحجوزاته.')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
           <Button onClick={() => setConfirm(null)}>{t('تراجع')}</Button>
          <Button
            variant="contained"
            color={confirm === 'reactivate' ? 'success' : 'error'}
            disabled={mutation.isPending}
            onClick={() => confirm && mutation.mutate(confirm)}
          >
             {t('تأكيد')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
