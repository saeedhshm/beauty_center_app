import {
  Alert, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, Divider, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { getPayout, recordTransfer } from '../api/payouts';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import { describeApiError, formatDateTime, formatMoney } from '../fmt/format';

export function PayoutDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [transferRef, setTransferRef] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['admin-payout', id],
    queryFn: () => getPayout(id),
    enabled: id.length > 0,
  });
  const mutation = useMutation({
    mutationFn: () => recordTransfer(id, transferRef.trim()),
    onSuccess: async () => {
      setDialogOpen(false);
      setTransferRef('');
      setFieldError(null);
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-payout', id] });
      await queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
    },
    onError: (cause) => {
      if (cause instanceof ApiError && (cause.code === 'INVALID_TRANSITION' || cause.code === 'BOOKING_ALREADY_PAID_OUT')) {
        setActionError(describeApiError(cause.code, cause.message));
        void queryClient.invalidateQueries({ queryKey: ['admin-payout', id] });
      } else {
        setActionError(cause instanceof ApiError ? describeApiError(cause.code, cause.message) : 'تعذر تسجيل التحويل.');
      }
    },
  });
  const payout = query.data;

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader
        title="تفاصيل التحويل"
        actions={<Button component={RouterLink} to="/payouts">عودة إلى القائمة</Button>}
      />
      {query.isLoading && <LoadingState label="جارٍ تحميل التحويل" />}
      {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {payout && (
        <Stack spacing={3}>
          {actionError && <Alert severity="warning" onClose={() => setActionError(null)}>{actionError}</Alert>}
          <Paper elevation={0} sx={{ p: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
              <Box>
                <Typography variant="h5" component="h2">{formatMoney(payout.amount, payout.currency)}</Typography>
                <Typography color="text.secondary">
                  الخبيرة <Button size="small" component={RouterLink} to={`/experts/${payout.expertId}`}>فتح الملف</Button>
                </Typography>
                <Typography color="text.secondary">
                  {payout.transferRef
                    ? `المرجع التشغيلي: ${payout.transferRef} · حُوّل في ${formatDateTime(payout.transferredAt)}`
                    : 'مسجل بانتظار التحويل اليدوي — ليس تحويلًا مصرفيًا آليًا.'}
                </Typography>
              </Box>
              <Chip color={payout.transferredAt ? 'success' : 'warning'} label={payout.transferredAt ? 'محوّلة' : 'مسجلة'} />
            </Stack>
            <Divider sx={{ my: 2.5 }} />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
              <Button
                variant="contained"
                disabled={payout.transferredAt !== null || mutation.isPending}
                onClick={() => setDialogOpen(true)}
              >
                تسجيل التحويل اليدوي
              </Button>
              {payout.transferredAt && (
                <Typography variant="caption" color="text.secondary">التحويل المسجل ثابت ولا يُعدّل.</Typography>
              )}
            </Stack>
          </Paper>

          <Paper elevation={0} sx={{ p: 3 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 2 }}>الحجوزات المرتبطة ({payout.bookings.length})</Typography>
            {payout.bookings.length === 0 && <Typography color="text.secondary">لا توجد حجوزات مرتبطة.</Typography>}
            <Stack spacing={1.5}>
              {payout.bookings.map((booking) => (
                <Stack key={booking.id} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between' }}>
                  <Typography>
                    <Button size="small" component={RouterLink} to={`/bookings/${booking.id}`}>حجز #{booking.id.slice(0, 8)}</Button>
                    {' · '}{formatDateTime(booking.startsAt)}
                  </Typography>
                  <Typography>مستحق الخبيرة: {formatMoney(booking.expertEarning, booking.currency)}</Typography>
                </Stack>
              ))}
            </Stack>
          </Paper>
        </Stack>
      )}
      {!query.isLoading && !query.error && !payout && <EmptyState title="التحويل غير موجود" />}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} aria-labelledby="payout-transfer-title">
        <DialogTitle id="payout-transfer-title">تسجيل التحويل اليدوي</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            أدخلي مرجع التحويل المنفذ خارج اللوحة. يُسجل بعد تأكيد الخادم فقط، ولا يعني تحويلًا مصرفيًا آليًا.
          </DialogContentText>
          {fieldError && <Alert severity="error" sx={{ mb: 2 }}>{fieldError}</Alert>}
          <TextField
            label="المرجع التشغيلي"
            fullWidth
            value={transferRef}
            onChange={(event) => { setTransferRef(event.target.value); setFieldError(null); }}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>تراجع</Button>
          <Button
            variant="contained"
            disabled={mutation.isPending}
            onClick={() => {
              if (transferRef.trim() === '') { setFieldError('أدخلي المرجع التشغيلي أولًا.'); return; }
              mutation.mutate();
            }}
          >
            تسجيل
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
