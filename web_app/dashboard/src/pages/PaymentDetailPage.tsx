import {
  Alert, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, Divider, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { getPayment, refundPayment } from '../api/payments';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import {
  BOOKING_STATUS_LABELS, bookingStatusTone, describeApiError, formatDateTime, formatMoney,
  PAYMENT_STATUS_LABELS, paymentStatusTone,
} from '../fmt/format';

export function PaymentDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['admin-payment', id],
    queryFn: () => getPayment(id),
    enabled: id.length > 0,
  });
  const mutation = useMutation({
    mutationFn: () => refundPayment(id, reason.trim() === '' ? undefined : reason.trim()),
    onSuccess: async () => {
      setConfirmOpen(false);
      setReason('');
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-payment', id] });
      await queryClient.invalidateQueries({ queryKey: ['admin-payments'] });
    },
    onError: (cause) => {
      if (cause instanceof ApiError && (cause.code === 'INVALID_TRANSITION' || cause.code === 'BOOKING_IN_PAYOUT')) {
        setActionError(describeApiError(cause.code, cause.message));
        void queryClient.invalidateQueries({ queryKey: ['admin-payment', id] });
      } else {
        setActionError(cause instanceof ApiError ? describeApiError(cause.code, cause.message) : 'تعذر تنفيذ الاسترجاع.');
      }
    },
  });
  const detail = query.data;
  const payment = detail;
  const canRefund = payment !== undefined && payment.status === 'paid';

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader
        title="تفاصيل الدفعة"
        actions={<Button component={RouterLink} to="/payments">عودة إلى القائمة</Button>}
      />
      {query.isLoading && <LoadingState label="جارٍ تحميل الدفعة" />}
      {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {payment && (
        <Stack spacing={3}>
          {actionError && <Alert severity="warning" onClose={() => setActionError(null)}>{actionError}</Alert>}
          <Paper elevation={0} sx={{ p: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
              <Box>
                <Typography variant="h5" component="h2">{formatMoney(payment.amount, payment.currency)}</Typography>
                <Typography color="text.secondary">المزود: {payment.provider} (Demo) · المرجع: <span dir="ltr">{payment.providerRef ?? '—'}</span></Typography>
                {payment.failureReason && <Typography color="error">سبب الفشل: {payment.failureReason}</Typography>}
                {payment.status === 'refunded' && (
                  <Typography>مسترد بالكامل: {formatMoney(payment.refundedAmount, payment.currency)} في {formatDateTime(payment.refundedAt)}</Typography>
                )}
              </Box>
              <Chip color={paymentStatusTone(payment.status)} label={PAYMENT_STATUS_LABELS[payment.status]} />
            </Stack>
            <Divider sx={{ my: 2.5 }} />
            <Stack spacing={1}>
              <Typography>
                الحجز: <Button size="small" component={RouterLink} to={`/bookings/${payment.bookingId}`}>فتح التفاصيل</Button>
              </Typography>
              {detail.booking && (
                <>
                  <Typography>
                    حالة الحجز:{' '}
                    <Chip
                      size="small"
                      color={bookingStatusTone(detail.booking.status as keyof typeof BOOKING_STATUS_LABELS)}
                      label={BOOKING_STATUS_LABELS[detail.booking.status as keyof typeof BOOKING_STATUS_LABELS] ?? detail.booking.status}
                    />
                  </Typography>
                  <Typography>الفترة: {formatDateTime(detail.booking.startsAt)} — {formatDateTime(detail.booking.endsAt)}</Typography>
                  <Typography>إجمالي الحجز: {formatMoney(detail.booking.totalAmount, detail.booking.currency)}</Typography>
                </>
              )}
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: 3 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 1 }}>الاسترجاع الإداري</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              استرجاع كامل فقط ضمن السياسة المؤقتة الحالية، وبعد تأكيد الخادم فقط. الاسترجاع الجزئي وبعد الإكمال أو الصرف غير معتمدين.
            </Typography>
            <Button variant="outlined" color="error" disabled={!canRefund || mutation.isPending} onClick={() => setConfirmOpen(true)}>
              استرجاع كامل
            </Button>
            {!canRefund && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                الاسترجاع متاح للدفعات بحالة مدفوعة فقط.
              </Typography>
            )}
          </Paper>
        </Stack>
      )}
      {!query.isLoading && !query.error && !detail && <EmptyState title="الدفعة غير موجودة" />}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} aria-labelledby="payment-refund-title">
        <DialogTitle id="payment-refund-title">تأكيد الاسترجاع الكامل</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            سيُسجل الاسترجاع بعد تأكيد الخادم فقط، وقد يُلغى الحجز المؤكد المرتبط. لا تعتبري المبلغ مستردًا قبل ذلك.
          </DialogContentText>
          <TextField
            label="سبب الاسترجاع (اختياري)"
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
          <Button variant="contained" color="error" disabled={mutation.isPending} onClick={() => mutation.mutate()}>تأكيد الاسترجاع</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
