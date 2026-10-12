import {
  Alert, Box, Button, Chip, Container, Divider, Paper, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { ApiError } from '../api/client';
import { listLatePayments, listOutbox, retryOutbox } from '../api/operations';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import { describeApiError, formatDateTime, formatMoney } from '../fmt/format';
import { BOOKING_STATUS_LABELS } from '../fmt/format';
import { useI18n } from '../i18n/i18n';

const PAGE_SIZE = 20;

export function OperationsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const outboxQuery = useQuery({
    queryKey: ['admin-outbox', 'failed'],
    queryFn: () => listOutbox({ page: 1, limit: PAGE_SIZE, status: 'failed' }),
  });
  const lateQuery = useQuery({
    queryKey: ['admin-late-payments'],
    queryFn: () => listLatePayments(1, PAGE_SIZE),
  });
  const retryMutation = useMutation({
    mutationFn: (id: string) => retryOutbox(id),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-outbox'] });
    },
    onError: (cause) => {
      setActionError(cause instanceof ApiError ? describeApiError(cause.code, cause.message) : t('تعذر إعادة المحاولة.'));
      void queryClient.invalidateQueries({ queryKey: ['admin-outbox'] });
    },
  });
  const failedCount = outboxQuery.data?.items.length ?? 0;
  const lateCount = lateQuery.data?.items.length ?? 0;

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader
         title={t('التشغيل')}
         subtitle={t('مراجعة يدوية فقط؛ لا تأكيد تلقائي ولا إرسال من طلب HTTP.')}
      />
      {(failedCount > 0 || lateCount > 0) && (
        <Alert severity="warning" sx={{ mb: 3 }}>
           {t('عناصر تحتاج تدخلًا: {{failed}} تسليمات فاشلة و{{late}} مدفوعات متأخرة بانتظار التسوية.', { failed: failedCount, late: lateCount })}
        </Alert>
      )}
      {actionError && <Alert severity="warning" onClose={() => setActionError(null)} sx={{ mb: 2 }}>{actionError}</Alert>}

      <Paper elevation={0} sx={{ p: 3, mb: 3 }}>
         <Typography variant="h6" component="h2" sx={{ mb: 1 }}>{t('التسليمات الفاشلة')}</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
           {t('إعادة المحاولة تعيد الصف إلى الدورة بميزانية جديدة وتُسجل تدقيقيًا؛ التسليم نفسه يتم في الـWorker.')}
        </Typography>
         {outboxQuery.isLoading && <LoadingState label={t('جارٍ تحميل التسليمات')} />}
        {outboxQuery.error && <ErrorState error={outboxQuery.error} onRetry={() => void outboxQuery.refetch()} />}
        {outboxQuery.data && outboxQuery.data.items.length === 0 && (
           <EmptyState title={t('لا توجد تسليمات فاشلة')} hint={t('كل الطابور يُسلَّم أو قيد المحاولة.')} />
        )}
        {outboxQuery.data && outboxQuery.data.items.length > 0 && (
          <TableContainer sx={{ overflowX: 'auto' }}>
             <Table aria-label={t('التسليمات الفاشلة')}>
              <TableHead>
                <TableRow>
                   <TableCell>{t('الحدث')}</TableCell>
                   <TableCell>{t('المحاولات')}</TableCell>
                   <TableCell>{t('آخر خطأ')}</TableCell>
                   <TableCell>{t('الموعد التالي')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {outboxQuery.data.items.map((row) => (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700 }} dir="ltr" align="right">{row.type}</Typography>
                      <Typography variant="caption" color="text.secondary">{formatDateTime(row.createdAt)}</Typography>
                    </TableCell>
                    <TableCell>{row.attempts}</TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>{row.lastError ?? '—'}</TableCell>
                    <TableCell>{formatDateTime(row.nextAttemptAt)}</TableCell>
                    <TableCell align="left">
                      <Button
                        size="small"
                        disabled={retryMutation.isPending}
                        onClick={() => retryMutation.mutate(row.id)}
                      >
                         {t('إعادة المحاولة')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Paper elevation={0} sx={{ p: 3 }}>
         <Typography variant="h6" component="h2" sx={{ mb: 1 }}>{t('المدفوعات المتأخرة')}</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
           {t('دفعات مسجلة دون تأكيد الحجز؛ للمراجعة والتسوية المعتمدة لاحقًا، وليست للتأكيد اليدوي من هنا.')}
        </Typography>
         {lateQuery.isLoading && <LoadingState label={t('جارٍ تحميل المتأخرات')} />}
        {lateQuery.error && <ErrorState error={lateQuery.error} onRetry={() => void lateQuery.refetch()} />}
        {lateQuery.data && lateQuery.data.items.length === 0 && (
           <EmptyState title={t('لا توجد مدفوعات متأخرة')} />
        )}
        {lateQuery.data && lateQuery.data.items.length > 0 && (
          <TableContainer sx={{ overflowX: 'auto' }}>
             <Table aria-label={t('المدفوعات المتأخرة')}>
              <TableHead>
                <TableRow>
                   <TableCell>{t('المبلغ')}</TableCell>
                   <TableCell>{t('حالة الحجز')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {lateQuery.data.items.map((payment) => (
                  <TableRow key={payment.id} hover>
                    <TableCell sx={{ fontWeight: 700 }}>{formatMoney(payment.amount, payment.currency)}</TableCell>
                     <TableCell><Chip size="small" label={BOOKING_STATUS_LABELS[payment.bookingStatus as keyof typeof BOOKING_STATUS_LABELS] ?? payment.bookingStatus} /></TableCell>
                    <TableCell align="left">
                       <Button size="small" component={RouterLink} to={`/payments/${payment.id}`}>{t('مراجعة الدفعة')}</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
      <Box sx={{ mt: 2 }}>
        <Divider sx={{ mb: 2 }} />
        <Typography variant="caption" color="text.secondary">
           {t('التسليم at-least-once: قد تتكرر رسالة أُرسلت ثم تعطل عاملها قبل التسجيل.')}
        </Typography>
      </Box>
    </Container>
  );
}
