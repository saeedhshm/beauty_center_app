import {
  Box, Button, Chip, Container, FormControl, InputLabel, MenuItem, Paper, Select,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { listPayments } from '../api/payments';
import type { PaymentStatus } from '../api/payments';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import { PAYMENT_STATUS_LABELS, formatDateTime, formatMoney, paymentStatusTone } from '../fmt/format';
import { useI18n } from '../i18n/i18n';

const PAGE_SIZE = 20;
export function PaymentsPage() {
  const { t } = useI18n();
  const filters: Array<{ value: PaymentStatus | 'all'; label: string }> = [
    { value: 'all', label: t('الكل') },
    ...(['pending', 'paid', 'failed', 'refunded'] as PaymentStatus[]).map((value) => ({ value, label: PAYMENT_STATUS_LABELS[value] })),
  ];
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const statusParam = searchParams.get('status');
  const status: PaymentStatus | 'all' = filters.some((option) => option.value === statusParam)
    ? (statusParam as PaymentStatus)
    : 'all';
  const bookingId = searchParams.get('bookingId') ?? '';
  const query = useQuery({
    queryKey: ['admin-payments', page, status, bookingId],
    queryFn: () => listPayments({
      page,
      limit: PAGE_SIZE,
      status,
      ...(bookingId === '' ? {} : { bookingId }),
    }),
  });
  const update = (next: { page?: number; status?: PaymentStatus | 'all'; bookingId?: string }) => {
    const params = new URLSearchParams();
    const nextPage = next.page ?? page;
    if (nextPage > 1) params.set('page', String(nextPage));
    const nextStatus = next.status ?? status;
    if (nextStatus !== 'all') params.set('status', nextStatus);
    const nextBooking = next.bookingId ?? bookingId;
    if (nextBooking !== '') params.set('bookingId', nextBooking);
    setSearchParams(params);
  };

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader
        title={t('المدفوعات')}
        subtitle={t('وضع Demo للمحاكاة فقط؛ لا توجد تحصيلات حقيقية. المبالغ لقطات من الخادم.')}
        actions={<Button component={RouterLink} to="/payouts">{t('المستحقات والتحويلات')}</Button>}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <FormControl sx={{ minWidth: 180 }}>
          <InputLabel id="payment-status-label">{t('الحالة')}</InputLabel>
          <Select
            labelId="payment-status-label"
            label={t('الحالة')}
            value={status}
            onChange={(event) => update({ status: event.target.value as PaymentStatus | 'all', page: 1 })}
          >
            {filters.map((option) => (
              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField
          label={t('معرف الحجز')}
          defaultValue={bookingId}
          onBlur={(event) => update({ bookingId: event.target.value.trim(), page: 1 })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') update({ bookingId: (event.target as HTMLInputElement).value.trim(), page: 1 });
          }}
          slotProps={{ htmlInput: { dir: 'ltr' } }}
          sx={{ minWidth: 260 }}
        />
      </Stack>
      {query.isLoading && <LoadingState label={t('جارٍ تحميل المدفوعات')} />}
      {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState title={t('لا توجد مدفوعات بهذه الفلاتر')} hint={t('غيّري الفلاتر أو انتظري محاولات دفع جديدة.')} />
      )}
      {query.data && query.data.items.length > 0 && (
        <Paper elevation={0}>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table aria-label={t('قائمة المدفوعات')}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('المبلغ')}</TableCell>
                  <TableCell>{t('الحالة')}</TableCell>
                  <TableCell>{t('المرجع')}</TableCell>
                  <TableCell>{t('التاريخ')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.items.map((payment) => (
                  <TableRow key={payment.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700 }}>{formatMoney(payment.amount, payment.currency)}</Typography>
                      <Typography variant="caption" color="text.secondary">#{payment.id.slice(0, 8)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color={paymentStatusTone(payment.status)} label={PAYMENT_STATUS_LABELS[payment.status]} />
                    </TableCell>
                    <TableCell dir="ltr" sx={{ textAlign: 'right' }}>{payment.providerRef ?? '—'}</TableCell>
                    <TableCell>{formatDateTime(payment.createdAt)}</TableCell>
                    <TableCell align="left">
                      <Button size="small" component={RouterLink} to={`/payments/${payment.id}`}>{t('التفاصيل')}</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack direction="row" spacing={1} sx={{ p: 2, justifyContent: 'flex-start' }}>
            <Button disabled={page <= 1} onClick={() => update({ page: page - 1 })}>{t('السابق')}</Button>
            <Typography sx={{ alignSelf: 'center' }} aria-live="polite">{t('صفحة {{page}}', { page })}</Typography>
            <Button disabled={!query.data.pagination.hasNext} onClick={() => update({ page: page + 1 })}>{t('التالي')}</Button>
          </Stack>
        </Paper>
      )}
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          {t('نجاح شاشة الدفع ليس دليل تحصيل؛ التأكيد يتم عبر Webhook موثوق فقط.')}
        </Typography>
      </Box>
    </Container>
  );
}
