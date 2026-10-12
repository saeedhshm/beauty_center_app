import {
  Alert, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, Divider, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { cancelBooking, getBooking } from '../api/bookings';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import {
  BOOKING_STATUS_LABELS, bookingStatusTone, describeApiError, formatCommissionRate,
  formatDateTime, formatMoney,
} from '../fmt/format';

const CANCELLABLE = new Set(['pending', 'accepted']);

export function BookingDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['admin-booking', id],
    queryFn: () => getBooking(id),
    enabled: id.length > 0,
  });
  const mutation = useMutation({
    mutationFn: () => cancelBooking(id, reason.trim() === '' ? undefined : reason.trim()),
    onSuccess: async () => {
      setConfirmOpen(false);
      setReason('');
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-booking', id] });
      await queryClient.invalidateQueries({ queryKey: ['admin-bookings'] });
    },
    onError: (cause) => {
      if (cause instanceof ApiError && (cause.code === 'INVALID_TRANSITION' || cause.code === 'BOOKING_EXPIRED')) {
        setActionError(describeApiError(cause.code, cause.message));
        void queryClient.invalidateQueries({ queryKey: ['admin-booking', id] });
      } else {
        setActionError(cause instanceof ApiError ? describeApiError(cause.code, cause.message) : 'تعذر تنفيذ الإلغاء.');
      }
    },
  });
  const booking = query.data;
  const canCancel = booking !== undefined && CANCELLABLE.has(booking.status);

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader
        title="تفاصيل الحجز"
        {...(booking ? { subtitle: `الموعد ${formatDateTime(booking.startsAt)} بتوقيت القاهرة` } : {})}
        actions={<Button component={RouterLink} to="/bookings">عودة إلى القائمة</Button>}
      />
      {query.isLoading && <LoadingState label="جارٍ تحميل الحجز" />}
      {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {booking && (
        <Stack spacing={3}>
          {actionError && <Alert severity="warning" onClose={() => setActionError(null)}>{actionError}</Alert>}
          <Paper elevation={0} sx={{ p: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
              <Box>
                <Typography variant="h5" component="h2">حجز #{booking.id.slice(0, 8)}</Typography>
                <Typography color="text.secondary">العميلة #{booking.customerId.slice(0, 8)} · الخبيرة #{booking.expertId.slice(0, 8)} · خدمة #{booking.serviceId}</Typography>
              </Box>
              <Chip color={bookingStatusTone(booking.status)} label={BOOKING_STATUS_LABELS[booking.status]} />
            </Stack>
            <Divider sx={{ my: 2.5 }} />
            <Stack spacing={1}>
              <Typography>الفترة: {formatDateTime(booking.startsAt)} — {formatDateTime(booking.endsAt)} ({booking.timeZone})</Typography>
              <Typography>العنوان المحفوظ: {booking.addressText}</Typography>
              {booking.notes && <Typography>ملاحظات: {booking.notes}</Typography>}
              {booking.expiresAt && (booking.status === 'pending' || booking.status === 'accepted') && (
                <Typography>ينتهي الانتظار في: {formatDateTime(booking.expiresAt)}</Typography>
              )}
              {booking.status === 'cancelled' && (
                <Typography>أُلغي في {formatDateTime(booking.cancelledAt)}{booking.cancellationReason ? ` — السبب: ${booking.cancellationReason}` : ''}</Typography>
              )}
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: 3 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 2 }}>المبالغ المحفوظة</Typography>
            <Stack spacing={1}>
              <Typography>السعر: {formatMoney(booking.price, booking.currency)}</Typography>
              <Typography>العمولة ({formatCommissionRate(booking.commissionRate)}): {formatMoney(booking.commissionAmount, booking.currency)}</Typography>
              <Typography>مستحق الخبيرة: {formatMoney(booking.expertEarning, booking.currency)}</Typography>
              <Typography>الإجمالي: {formatMoney(booking.totalAmount, booking.currency)}</Typography>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
              لقطات تاريخية لا تتغير بتعديل الأسعار أو السياسة لاحقًا.
            </Typography>
          </Paper>

          <Paper elevation={0} sx={{ p: 3 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 2 }}>سجل الحالات</Typography>
            <Stack spacing={1.5}>
              {booking.statusHistory.map((change) => (
                <Stack key={change.id} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between' }}>
                  <Typography>
                    <Chip size="small" color={bookingStatusTone(change.status)} label={BOOKING_STATUS_LABELS[change.status]} sx={{ ml: 1 }} />
                    {change.changedBy ? 'بواسطة طرف الحجز' : 'حدث نظام تلقائي'}
                  </Typography>
                  <Typography color="text.secondary">{formatDateTime(change.createdAt)}</Typography>
                </Stack>
              ))}
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: 3 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 1 }}>الإلغاء الإداري</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              متاح لحجوزات pending وaccepted فقط، ويُسجل تدقيقيًا باسم المدير.
            </Typography>
            <Button variant="outlined" color="error" disabled={!canCancel || mutation.isPending} onClick={() => setConfirmOpen(true)}>
              إلغاء الحجز
            </Button>
            {!canCancel && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                الحالة الحالية لا تسمح بالإلغاء الإداري.
              </Typography>
            )}
          </Paper>
        </Stack>
      )}
      {!query.isLoading && !query.error && !booking && <EmptyState title="الحجز غير موجود" />}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} aria-labelledby="booking-cancel-title">
        <DialogTitle id="booking-cancel-title">تأكيد إلغاء الحجز</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            سيُلغى الحجز فور تأكيد الخادم فقط. أي تغير في الحالة أثناء المراجعة سيُعرض بدل ادعاء النجاح.
          </DialogContentText>
          <TextField
            label="سبب الإلغاء (اختياري)"
            fullWidth
            multiline
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 500 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>تراجع</Button>
          <Button variant="contained" color="error" disabled={mutation.isPending} onClick={() => mutation.mutate()}>تأكيد الإلغاء</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
