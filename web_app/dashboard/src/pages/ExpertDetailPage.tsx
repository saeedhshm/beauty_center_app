import {
  Alert, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, Divider, Paper, Stack, Typography,
} from '@mui/material';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { approveExpert, downloadIdentityDocument, getExpert, suspendExpert } from '../api/experts';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import { APPROVAL_STATUS_LABELS, approvalStatusTone, describeApiError, formatMoney } from '../fmt/format';
import { useI18n } from '../i18n/i18n';

type Decision = 'approve' | 'suspend' | null;

export function ExpertDetailPage() {
  const { t } = useI18n();
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<Decision>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [docState, setDocState] = useState<{ open: boolean; message: string | null }>({ open: false, message: null });
  const query = useQuery({
    queryKey: ['admin-expert', id],
    queryFn: () => getExpert(id),
    enabled: id.length > 0,
  });
  const mutation = useMutation({
    mutationFn: (kind: Exclude<Decision, null>) => (kind === 'approve' ? approveExpert(id) : suspendExpert(id)),
    onSuccess: async () => {
      setDecision(null);
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-expert', id] });
      await queryClient.invalidateQueries({ queryKey: ['admin-experts'] });
    },
    onError: (cause) => {
      setActionError(cause instanceof ApiError ? describeApiError(cause.code, cause.message) : t('تعذر تنفيذ القرار.'));
    },
  });
  const openDocument = async () => {
    setDocState({ open: false, message: null });
    try {
      const file = await downloadIdentityDocument(id);
      window.open(file.blobUrl, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(file.blobUrl), 60_000);
    } catch (cause) {
      setDocState({
        open: false,
        message: cause instanceof ApiError ? describeApiError(cause.code, cause.message) : t('تعذر تنزيل الوثيقة.'),
      });
    }
  };

  const expert = query.data;
  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader
        title={t('مراجعة الخبيرة')}
        {...(expert ? { subtitle: expert.name } : {})}
        actions={<Button component={RouterLink} to="/experts">{t('عودة إلى القائمة')}</Button>}
      />
      {query.isLoading && <LoadingState label={t('جارٍ تحميل ملف الخبيرة')} />}
      {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {expert && (
        <Stack spacing={3}>
          {actionError && <Alert severity="warning" onClose={() => setActionError(null)}>{actionError}</Alert>}
          {docState.message && <Alert severity="error" onClose={() => setDocState({ open: false, message: null })}>{docState.message}</Alert>}
          <Paper elevation={0} sx={{ p: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
              <Box>
                <Typography variant="h5" component="h2">{expert.name}</Typography>
                <Typography color="text.secondary" dir="ltr" sx={{ textAlign: 'right' }}>{expert.phone}</Typography>
                <Typography color="text.secondary">{expert.cityName ?? '—'} · {t('التقييم')} {expert.ratingAvg} ({expert.ratingCount})</Typography>
                <Typography color="text.secondary" sx={{ mt: 1 }}>{expert.bio ?? t('لا توجد نبذة.')}</Typography>
              </Box>
              <Stack spacing={1} sx={{ alignItems: { xs: 'stretch', sm: 'flex-end' } }}>
                <Chip color={approvalStatusTone(expert.approvalStatus)} label={APPROVAL_STATUS_LABELS[expert.approvalStatus]} />
                <Chip variant={expert.isAcceptingBookings ? 'filled' : 'outlined'} color={expert.isAcceptingBookings ? 'success' : 'default'} label={expert.isAcceptingBookings ? t('تستقبل الحجوزات') : t('لا تستقبل الحجوزات')} />
                {!expert.isActive && <Chip color="error" label={t('الحساب معطّل')} />}
              </Stack>
            </Stack>
            <Divider sx={{ my: 2.5 }} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <Button variant="contained" color="success" disabled={expert.approvalStatus === 'approved' || mutation.isPending} onClick={() => setDecision('approve')}>
                {t('اعتماد')}
              </Button>
              <Button variant="outlined" color="error" disabled={expert.approvalStatus === 'suspended' || mutation.isPending} onClick={() => setDecision('suspend')}>
                {t('تعليق')}
              </Button>
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                {t('التعليق يوقف استقبال الحجوزات فورًا دون حذف التاريخ.')}
              </Typography>
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: 3 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 2 }}>{t('الخدمات والأسعار')}</Typography>
            {expert.services.length === 0 && <EmptyState title={t('لا توجد خدمات مسعرة')} hint={t('تظهر الأسعار هنا بعد أن تحددها الخبيرة.')} />}
            {expert.services.length > 0 && (
              <Stack spacing={1.5}>
                {expert.services.map((price) => (
                  <Stack key={price.serviceId} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between' }}>
                    <Typography sx={{ fontWeight: 700 }}>{price.name ?? t('خدمة #{{id}}', { id: price.serviceId })}</Typography>
                    <Typography>{formatMoney(price.price, price.currency)} · {price.isActive ? t('معروضة') : t('مخفية')}</Typography>
                  </Stack>
                ))}
              </Stack>
            )}
          </Paper>

          <Paper elevation={0} sx={{ p: 3 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 2 }}>{t('المعرض ووثيقة الهوية')}</Typography>
            {expert.portfolio.length === 0
              ? <Typography color="text.secondary">{t('لا توجد صور معرض بعد.')}</Typography>
              : (
                <Stack spacing={1}>
                  {expert.portfolio.map((item) => (
                    <Typography key={item.id}>
                       {t('صورة #{{order}}', { order: item.sortOrder })}{item.serviceId ? ` · ${t('خدمة #{{id}}', { id: item.serviceId })}` : ''} ·{' '}
                       <a href={item.url} target="_blank" rel="noopener noreferrer">{t('فتح الصورة')}</a>
                    </Typography>
                  ))}
                </Stack>
              )}
            <Divider sx={{ my: 2 }} />
            {expert.identityDocument.present
              ? (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
                   <Typography>{t('وثيقة الهوية مرفوعة ومحفوظة بشكل خاص.')}</Typography>
                   <Button variant="outlined" onClick={() => void openDocument()}>{t('عرض الوثيقة للمراجعة')}</Button>
                </Stack>
              )
               : <Typography color="text.secondary">{t('لا توجد وثيقة هوية مرفوعة.')}</Typography>}
          </Paper>
        </Stack>
      )}
      {!query.isLoading && !query.error && !query.data && <EmptyState title={t('الخبيرة غير موجودة')} />}
      <Dialog open={decision !== null} onClose={() => setDecision(null)} aria-labelledby="expert-decision-title">
        <DialogTitle id="expert-decision-title">{decision === 'approve' ? t('تأكيد الاعتماد') : t('تأكيد التعليق')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {decision === 'approve'
              ? t('سيؤدي الاعتماد إلى إظهار الخبيرة في الكتالوج عند استيفاء شروط الظهور.')
              : t('سيؤدي التعليق إلى إيقاف استقبال الحجوزات فورًا. القرار مسجل تدقيقيًا.')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDecision(null)}>{t('تراجع')}</Button>
          <Button
            variant="contained"
            color={decision === 'approve' ? 'success' : 'error'}
            disabled={mutation.isPending}
            onClick={() => decision && mutation.mutate(decision)}
          >
            {t('تأكيد')}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
