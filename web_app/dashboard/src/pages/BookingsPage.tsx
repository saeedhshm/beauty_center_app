import {
  Box, Button, Chip, Container, FormControl, InputLabel, MenuItem, Paper, Select,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { listBookings } from '../api/bookings';
import type { BookingStatus } from '../api/types';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import { BOOKING_STATUS_LABELS, bookingStatusTone, formatDateTime, formatMoney } from '../fmt/format';
import { useI18n } from '../i18n/i18n';

const PAGE_SIZE = 20;
export function BookingsPage() {
  const { t } = useI18n();
  const filters: Array<{ value: BookingStatus | 'all'; label: string }> = [
    { value: 'all', label: t('الكل') },
    ...(['pending', 'accepted', 'confirmed', 'completed', 'rejected', 'cancelled', 'expired'] as BookingStatus[]).map((value) => ({ value, label: BOOKING_STATUS_LABELS[value] })),
  ];
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const statusParam = searchParams.get('status');
  const status: BookingStatus | 'all' = filters.some((option) => option.value === statusParam)
    ? (statusParam as BookingStatus)
    : 'all';
  const query = useQuery({
    queryKey: ['admin-bookings', page, status],
    queryFn: () => listBookings({ page, limit: PAGE_SIZE, status }),
  });
  const update = (next: { page?: number; status?: BookingStatus | 'all' }) => {
    const params = new URLSearchParams();
    const nextPage = next.page ?? page;
    const nextStatus = next.status ?? status;
    if (nextPage > 1) params.set('page', String(nextPage));
    if (nextStatus !== 'all') params.set('status', nextStatus);
    setSearchParams(params);
  };

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader title={t('الحجوزات')} subtitle={t('الحالات واللقطات التاريخية كما حفظها الخادم، دون إعادة حساب.')} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <FormControl sx={{ minWidth: 220 }}>
          <InputLabel id="booking-status-label">{t('الحالة')}</InputLabel>
          <Select
            labelId="booking-status-label"
            label={t('الحالة')}
            value={status}
            onChange={(event) => update({ status: event.target.value as BookingStatus | 'all', page: 1 })}
          >
            {filters.map((option) => (
              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>
      {query.isLoading && <LoadingState label={t('جارٍ تحميل الحجوزات')} />}
      {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState title={t('لا توجد حجوزات بهذا الفلتر')} hint={t('غيّري الحالة أو انتظري حجوزات جديدة.')} />
      )}
      {query.data && query.data.items.length > 0 && (
        <Paper elevation={0}>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table aria-label={t('قائمة الحجوزات')}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('الموعد')}</TableCell>
                  <TableCell>{t('الحالة')}</TableCell>
                  <TableCell>{t('الإجمالي')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.items.map((booking) => (
                  <TableRow key={booking.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700 }}>{formatDateTime(booking.startsAt)}</Typography>
                      <Typography variant="caption" color="text.secondary">#{booking.id.slice(0, 8)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color={bookingStatusTone(booking.status)} label={BOOKING_STATUS_LABELS[booking.status]} />
                    </TableCell>
                    <TableCell>{formatMoney(booking.totalAmount, booking.currency)}</TableCell>
                    <TableCell align="left">
                      <Button size="small" component={RouterLink} to={`/bookings/${booking.id}`}>{t('التفاصيل')}</Button>
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
          {t('المبالغ والعملة والتوقيت لقطات تاريخية من الخادم ولا تُعاد حسابها هنا.')}
        </Typography>
      </Box>
    </Container>
  );
}
