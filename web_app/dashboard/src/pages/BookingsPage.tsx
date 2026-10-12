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

const PAGE_SIZE = 20;
const FILTERS: Array<{ value: BookingStatus | 'all'; label: string }> = [
  { value: 'all', label: 'الكل' },
  { value: 'pending', label: BOOKING_STATUS_LABELS.pending },
  { value: 'accepted', label: BOOKING_STATUS_LABELS.accepted },
  { value: 'confirmed', label: BOOKING_STATUS_LABELS.confirmed },
  { value: 'completed', label: BOOKING_STATUS_LABELS.completed },
  { value: 'rejected', label: BOOKING_STATUS_LABELS.rejected },
  { value: 'cancelled', label: BOOKING_STATUS_LABELS.cancelled },
  { value: 'expired', label: BOOKING_STATUS_LABELS.expired },
];

export function BookingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const statusParam = searchParams.get('status');
  const status: BookingStatus | 'all' = FILTERS.some((option) => option.value === statusParam)
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
      <PageHeader title="الحجوزات" subtitle="الحالات واللقطات التاريخية كما حفظها الخادم، دون إعادة حساب." />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <FormControl sx={{ minWidth: 220 }}>
          <InputLabel id="booking-status-label">الحالة</InputLabel>
          <Select
            labelId="booking-status-label"
            label="الحالة"
            value={status}
            onChange={(event) => update({ status: event.target.value as BookingStatus | 'all', page: 1 })}
          >
            {FILTERS.map((option) => (
              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>
      {query.isLoading && <LoadingState label="جارٍ تحميل الحجوزات" />}
      {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState title="لا توجد حجوزات بهذا الفلتر" hint="غيّري الحالة أو انتظري حجوزات جديدة." />
      )}
      {query.data && query.data.items.length > 0 && (
        <Paper elevation={0}>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table aria-label="قائمة الحجوزات">
              <TableHead>
                <TableRow>
                  <TableCell>الموعد</TableCell>
                  <TableCell>الحالة</TableCell>
                  <TableCell>الإجمالي</TableCell>
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
                      <Button size="small" component={RouterLink} to={`/bookings/${booking.id}`}>التفاصيل</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack direction="row" spacing={1} sx={{ p: 2, justifyContent: 'flex-start' }}>
            <Button disabled={page <= 1} onClick={() => update({ page: page - 1 })}>السابق</Button>
            <Typography sx={{ alignSelf: 'center' }} aria-live="polite">صفحة {page}</Typography>
            <Button disabled={!query.data.pagination.hasNext} onClick={() => update({ page: page + 1 })}>التالي</Button>
          </Stack>
        </Paper>
      )}
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          المبالغ والعملة والتوقيت لقطات تاريخية من الخادم ولا تُعاد حسابها هنا.
        </Typography>
      </Box>
    </Container>
  );
}
