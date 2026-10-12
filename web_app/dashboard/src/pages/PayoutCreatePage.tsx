import {
  Alert, Box, Button, Checkbox, Container, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { createPayout, listEligibleBookings } from '../api/payouts';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import { describeApiError, formatDateTime, formatMoney } from '../fmt/format';

export function PayoutCreatePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expertId, setExpertId] = useState(searchParams.get('expertId') ?? '');
  const [appliedExpertId, setAppliedExpertId] = useState(searchParams.get('expertId') ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionError, setActionError] = useState<string | null>(null);
  const [idError, setIdError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ['admin-payout-eligible', appliedExpertId],
    queryFn: () => listEligibleBookings(appliedExpertId),
    enabled: appliedExpertId.length > 0,
  });
  const mutation = useMutation({
    mutationFn: () => createPayout(appliedExpertId, [...selected]),
    onSuccess: async (payout) => {
      await queryClient.invalidateQueries({ queryKey: ['admin-payouts'] });
      navigate(`/payouts/${payout.id}`);
    },
    onError: (cause) => {
      if (cause instanceof ApiError && (cause.code === 'BOOKING_ALREADY_PAID_OUT' || cause.code === 'INVALID_TRANSITION')) {
        setActionError(describeApiError(cause.code, cause.message));
        void queryClient.invalidateQueries({ queryKey: ['admin-payout-eligible', appliedExpertId] });
      } else {
        setActionError(cause instanceof ApiError ? describeApiError(cause.code, cause.message) : 'تعذر إنشاء التحويل.');
      }
    },
  });
  const toggle = (id: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const applyExpert = () => {
    const value = expertId.trim();
    if (!/^[0-9a-fA-F-]{36}$/.test(value)) {
      setIdError('أدخلي معرف خبيرة بصيغة UUID صحيحة.');
      return;
    }
    setIdError(null);
    setSelected(new Set());
    setActionError(null);
    setSearchParams({ expertId: value });
    setAppliedExpertId(value);
  };

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader
        title="تحويل جديد"
        subtitle="من الحجوزات المكتملة مدفوعة الأجر غير المربوطة فقط، وبعملة واحدة."
        actions={<Button component={RouterLink} to="/payouts">عودة إلى القائمة</Button>}
      />
      <Paper elevation={0} sx={{ p: 3, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'flex-end' } }}>
          <TextField
            label="معرف الخبيرة"
            value={expertId}
            onChange={(event) => setExpertId(event.target.value)}
            slotProps={{ htmlInput: { dir: 'ltr' } }}
            error={Boolean(idError)}
            helperText={idError ?? 'الصقي المعرف من ملف الخبيرة.'}
            sx={{ minWidth: 300 }}
          />
          <Button variant="contained" onClick={applyExpert}>عرض المؤهلة</Button>
        </Stack>
      </Paper>
      {actionError && <Alert severity="warning" onClose={() => setActionError(null)} sx={{ mb: 2 }}>{actionError}</Alert>}
      {appliedExpertId !== '' && query.isLoading && <LoadingState label="جارٍ تحميل الحجوزات المؤهلة" />}
      {appliedExpertId !== '' && query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.data && query.data.bookings.length === 0 && (
        <EmptyState title="لا توجد حجوزات مؤهلة لهذه الخبيرة" hint="الأهلية: مكتملة ومدفوعة وغير مربوطة بتحويل سابق." />
      )}
      {query.data && query.data.bookings.length > 0 && (
        <Paper elevation={0}>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table aria-label="الحجوزات المؤهلة للتحويل">
              <TableHead>
                <TableRow>
                  <TableCell />
                  <TableCell>الحجز</TableCell>
                  <TableCell>الموعد</TableCell>
                  <TableCell>مستحق الخبيرة</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.bookings.map((booking) => (
                  <TableRow key={booking.id} hover selected={selected.has(booking.id)}>
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selected.has(booking.id)}
                        onChange={() => toggle(booking.id)}
                        slotProps={{ input: { 'aria-label': `اختيار الحجز ${booking.id.slice(0, 8)}` } }}
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="small" component={RouterLink} to={`/bookings/${booking.id}`}>#{booking.id.slice(0, 8)}</Button>
                    </TableCell>
                    <TableCell>{formatDateTime(booking.startsAt)}</TableCell>
                    <TableCell>{formatMoney(booking.expertEarning, booking.currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ p: 2, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
            <Typography aria-live="polite">المحدد: {selected.size} من {query.data.bookings.length}</Typography>
            <Button
              variant="contained"
              disabled={selected.size === 0 || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              إنشاء التحويل بالمحدد
            </Button>
          </Stack>
        </Paper>
      )}
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          المبلغ النهائي يحسبه الخادم كمجموع المستحقات؛ لا تُدخل الواجهة أي مبلغ.
        </Typography>
      </Box>
    </Container>
  );
}
