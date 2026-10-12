import {
  Box, Button, Chip, Container, Divider, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { getOverview } from '../api/overview';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import { formatDateTime, formatMoney } from '../fmt/format';
import { BOOKING_STATUS_LABELS, PAYMENT_STATUS_LABELS } from '../fmt/format';
import { useI18n } from '../i18n/i18n';

export function OverviewPage() {
  const { t } = useI18n();
  const [days, setDays] = useState('30');
  const [appliedDays, setAppliedDays] = useState('30');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const to = new Date();
  const parsedDays = Number(appliedDays);
  const from = new Date(to.getTime() - (Number.isInteger(parsedDays) && parsedDays > 0 ? parsedDays : 30) * 24 * 3600 * 1000);
  const query = useQuery({
    queryKey: ['admin-overview', appliedDays],
    queryFn: () => getOverview(from.toISOString(), to.toISOString()),
  });
  const applyRange = () => {
    const value = Number(days);
    if (!Number.isInteger(value) || value < 1 || value > 365) {
      setFieldError(t('أدخلي عدد أيام بين 1 و365.'));
      return;
    }
    setFieldError(null);
    setAppliedDays(String(value));
  };
  const summary = query.data;

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader
        title={t('الملخص التشغيلي')}
        subtitle={t('كل رقم محسوب على الخادم عبر كامل البيانات في الفترة، وليس من صفحة نتائج واحدة.')}
      />
      <Paper elevation={0} sx={{ p: 3, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'flex-end' } }}>
          <TextField
             label={t('الفترة بالأيام')}
            type="number"
            value={days}
            onChange={(event) => setDays(event.target.value)}
            slotProps={{ htmlInput: { min: 1, max: 365 } }}
            error={Boolean(fieldError)}
             helperText={fieldError ?? t('الافتراضي 30 يومًا. العرض بتوقيت Africa/Cairo.')}
            sx={{ maxWidth: 220 }}
          />
           <Button variant="contained" onClick={applyRange}>{t('تطبيق الفترة')}</Button>
          {summary && (
            <Typography variant="caption" color="text.secondary">
               {t('من')} {formatDateTime(summary.range.from)} {t('إلى')} {formatDateTime(summary.range.to)} ({summary.range.timeZone})
            </Typography>
          )}
        </Stack>
      </Paper>
       {query.isLoading && <LoadingState label={t('جارٍ تحميل الملخص')} />}
      {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {summary && (
        <Stack spacing={3}>
          <Paper elevation={0} sx={{ p: 3 }}>
             <Typography variant="h6" component="h2" sx={{ mb: 2 }}>{t('الحجوزات حسب الحالة')}</Typography>
             {summary.bookings.length === 0 && <EmptyState title={t('لا توجد حجوزات في الفترة')} />}
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {summary.bookings.map((row) => (
                 <Chip key={row.status} label={`${BOOKING_STATUS_LABELS[row.status as keyof typeof BOOKING_STATUS_LABELS] ?? row.status}: ${row.count}`} variant="outlined" />
              ))}
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: 3 }}>
             <Typography variant="h6" component="h2" sx={{ mb: 2 }}>{t('المدفوعات حسب الحالة والعملة')}</Typography>
             {summary.payments.length === 0 && <EmptyState title={t('لا توجد مدفوعات في الفترة')} />}
            <Stack spacing={1}>
              {summary.payments.map((row, index) => (
                <Typography key={`${row.status}-${row.currency}-${index}`}>
                   {PAYMENT_STATUS_LABELS[row.status as keyof typeof PAYMENT_STATUS_LABELS] ?? row.status} · {formatMoney(row.total, row.currency)} · {row.count} {t('محاولات')}
                </Typography>
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
               {t('التحصيل المعروض إجمالي محصّل، وليس ربح المنصة.')}
            </Typography>
          </Paper>

          <Paper elevation={0} sx={{ p: 3 }}>
             <Typography variant="h6" component="h2" sx={{ mb: 2 }}>{t('المستحقات: مسجلة ومحوّلة')}</Typography>
             {summary.payouts.length === 0 && <EmptyState title={t('لا توجد تحويلات في الفترة')} />}
            <Stack spacing={1}>
              {summary.payouts.map((row, index) => (
                <Typography key={`${row.transferred}-${row.currency}-${index}`}>
                   {row.transferred ? t('محوّلة') : t('مسجلة بانتظار التحويل')} · {formatMoney(row.total, row.currency)} · {row.count}
                </Typography>
              ))}
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: 3 }}>
             <Typography variant="h6" component="h2" sx={{ mb: 2 }}>{t('الحسابات والتقييمات')}</Typography>
            <Stack spacing={1}>
              {summary.users.map((row) => (
                 <Typography key={row.role}>{t(row.role === 'customer' ? 'عميلة' : row.role === 'expert' ? 'خبيرة' : 'مدير')}: {row.count}</Typography>
              ))}
              <Typography>
                 {t('التقييمات')}: {summary.reviews.count} · {t('المتوسط')} {summary.reviews.average ?? '—'}
              </Typography>
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
              <Box>
                 <Typography variant="h6" component="h2">{t('حالة التسليم والـWorker')}</Typography>
                <Typography color="text.secondary">
                  {summary.worker
                     ? t('آخر دورة ناجحة {{date}}؛ معالجة {{sent}} وإعادة {{retried}}.', { date: formatDateTime(summary.worker.tickAt), sent: summary.worker.sent, retried: summary.worker.retried })
                     : t('لم تُسجل أي دورة Worker بعد.')}
                </Typography>
              </Box>
               <Button component={RouterLink} to="/operations" variant="outlined">{t('صفحة التشغيل')}</Button>
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
               {summary.outbox.length === 0 && <Typography color="text.secondary">{t('لا توجد صفوف تسليم.')}</Typography>}
              {summary.outbox.map((row) => (
                <Chip
                  key={row.status}
                  color={row.status === 'failed' ? 'error' : 'default'}
                  label={`${row.status}: ${row.count}`}
                />
              ))}
            </Stack>
          </Paper>
        </Stack>
      )}
    </Container>
  );
}
