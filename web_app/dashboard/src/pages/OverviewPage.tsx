import {
  Box, Button, Chip, Container, Divider, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { getOverview } from '../api/overview';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import { formatDateTime, formatMoney } from '../fmt/format';

export function OverviewPage() {
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
      setFieldError('أدخلي عدد أيام بين 1 و365.');
      return;
    }
    setFieldError(null);
    setAppliedDays(String(value));
  };
  const summary = query.data;

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader
        title="الملخص التشغيلي"
        subtitle="كل رقم محسوب على الخادم عبر كامل البيانات في الفترة، وليس من صفحة نتائج واحدة."
      />
      <Paper elevation={0} sx={{ p: 3, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'flex-end' } }}>
          <TextField
            label="الفترة بالأيام"
            type="number"
            value={days}
            onChange={(event) => setDays(event.target.value)}
            slotProps={{ htmlInput: { min: 1, max: 365 } }}
            error={Boolean(fieldError)}
            helperText={fieldError ?? 'الافتراضي 30 يومًا. العرض بتوقيت Africa/Cairo.'}
            sx={{ maxWidth: 220 }}
          />
          <Button variant="contained" onClick={applyRange}>تطبيق الفترة</Button>
          {summary && (
            <Typography variant="caption" color="text.secondary">
              من {formatDateTime(summary.range.from)} إلى {formatDateTime(summary.range.to)} ({summary.range.timeZone})
            </Typography>
          )}
        </Stack>
      </Paper>
      {query.isLoading && <LoadingState label="جارٍ تحميل الملخص" />}
      {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {summary && (
        <Stack spacing={3}>
          <Paper elevation={0} sx={{ p: 3 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 2 }}>الحجوزات حسب الحالة</Typography>
            {summary.bookings.length === 0 && <EmptyState title="لا توجد حجوزات في الفترة" />}
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {summary.bookings.map((row) => (
                <Chip key={row.status} label={`${row.status}: ${row.count}`} variant="outlined" />
              ))}
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: 3 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 2 }}>المدفوعات حسب الحالة والعملة</Typography>
            {summary.payments.length === 0 && <EmptyState title="لا توجد مدفوعات في الفترة" />}
            <Stack spacing={1}>
              {summary.payments.map((row, index) => (
                <Typography key={`${row.status}-${row.currency}-${index}`}>
                  {row.status} · {formatMoney(row.total, row.currency)} · {row.count} محاولات
                </Typography>
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              التحصيل المعروض إجمالي محصّل، وليس ربح المنصة.
            </Typography>
          </Paper>

          <Paper elevation={0} sx={{ p: 3 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 2 }}>المستحقات: مسجلة ومحوّلة</Typography>
            {summary.payouts.length === 0 && <EmptyState title="لا توجد تحويلات في الفترة" />}
            <Stack spacing={1}>
              {summary.payouts.map((row, index) => (
                <Typography key={`${row.transferred}-${row.currency}-${index}`}>
                  {row.transferred ? 'محوّلة' : 'مسجلة بانتظار التحويل'} · {formatMoney(row.total, row.currency)} · {row.count}
                </Typography>
              ))}
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: 3 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 2 }}>الحسابات والتقييمات</Typography>
            <Stack spacing={1}>
              {summary.users.map((row) => (
                <Typography key={row.role}>{row.role}: {row.count}</Typography>
              ))}
              <Typography>
                التقييمات: {summary.reviews.count} · المتوسط {summary.reviews.average ?? '—'}
              </Typography>
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
              <Box>
                <Typography variant="h6" component="h2">حالة التسليم والـWorker</Typography>
                <Typography color="text.secondary">
                  {summary.worker
                    ? `آخر دورة ناجحة ${formatDateTime(summary.worker.tickAt)} — معالجة ${summary.worker.sent} وإعادة ${summary.worker.retried}.`
                    : 'لم تُسجل أي دورة Worker بعد.'}
                </Typography>
              </Box>
              <Button component={RouterLink} to="/operations" variant="outlined">صفحة التشغيل</Button>
            </Stack>
            <Divider sx={{ my: 2 }} />
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {summary.outbox.length === 0 && <Typography color="text.secondary">لا توجد صفوف تسليم.</Typography>}
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
