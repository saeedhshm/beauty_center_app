import {
  Alert, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../api/client';
import { getSettings, listCities, setCityActive } from '../api/settings';
import type { AdminCity } from '../api/settings';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import { describeApiError } from '../fmt/format';

type Decision = { city: AdminCity; activate: boolean } | null;

export function SettingsPage() {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<Decision>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: getSettings });
  const citiesQuery = useQuery({ queryKey: ['admin-cities'], queryFn: listCities });
  const mutation = useMutation({
    mutationFn: (target: { id: number; activate: boolean }) => setCityActive(target.id, target.activate),
    onSuccess: async () => {
      setDecision(null);
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-cities'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
    },
    onError: (cause) => {
      setActionError(cause instanceof ApiError ? describeApiError(cause.code, cause.message) : 'تعذر تنفيذ الأمر.');
    },
  });
  const settings = settingsQuery.data;
  const loading = settingsQuery.isLoading || citiesQuery.isLoading;
  const error = settingsQuery.error ?? citiesQuery.error;

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader
        title="الإعدادات"
        subtitle="لقطة سياسة التشغيل للقراءة فقط، وإدارة تفعيل المدن. لا يوجد تعديل ضريبي أو جدولة من هنا."
      />
      {actionError && <Alert severity="warning" onClose={() => setActionError(null)} sx={{ mb: 2 }}>{actionError}</Alert>}
      {loading && <LoadingState label="جارٍ تحميل الإعدادات" />}
      {error && <ErrorState error={error} onRetry={() => { void settingsQuery.refetch(); void citiesQuery.refetch(); }} />}

      {settings && (
        <Paper elevation={0} sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" component="h2" sx={{ mb: 2 }}>لقطة السياسة الحالية</Typography>
          <Stack spacing={1}>
            <Typography>مدينة الإطلاق: <strong>{settings.launchCity.name} ({settings.launchCity.code})</strong></Typography>
            <Typography>العملة: <strong>{settings.currency}</strong> · المنطقة الزمنية: <strong dir="ltr">{settings.timeZone}</strong></Typography>
            <Typography>
              وضع الدفع: <Chip size="small" label={settings.paymentMode === 'demo' ? 'تجريبي (Demo)' : settings.paymentMode} /> · الحجوزات نهارية فقط: <strong>{settings.daytimeOnly ? 'نعم' : 'لا'}</strong>
            </Typography>
            <Typography>
              مهلة القبول: <strong>{settings.bookingPolicy.acceptanceTimeoutMinutes} دقيقة</strong> · مهلة الدفع: <strong>{settings.bookingPolicy.paymentTimeoutMinutes} دقيقة</strong> · العمولة: <strong>{settings.bookingPolicy.commissionRate}%</strong>
            </Typography>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2 }}>
            تعديل السياسة والضرائب يتم بقرار معتمد خارج هذه الشاشة؛ أي تغيير يظهر في سجل التدقيق.
          </Typography>
        </Paper>
      )}

      {citiesQuery.data && (
        <Paper elevation={0} sx={{ p: 3 }}>
          <Typography variant="h6" component="h2" sx={{ mb: 2 }}>المدن</Typography>
          {citiesQuery.data.length === 0 && <EmptyState title="لا توجد مدن" />}
          {citiesQuery.data.length > 0 && (
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table aria-label="قائمة المدن">
                <TableHead>
                  <TableRow>
                    <TableCell>المدينة</TableCell>
                    <TableCell>الرمز</TableCell>
                    <TableCell>الحالة</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {citiesQuery.data.map((city) => (
                    <TableRow key={city.id} hover>
                      <TableCell sx={{ fontWeight: 700 }}>{city.name}</TableCell>
                      <TableCell dir="ltr" align="right">{city.code}</TableCell>
                      <TableCell>
                        <Chip size="small" color={city.isActive ? 'success' : 'default'} label={city.isActive ? 'مفعلة' : 'معطلة'} />
                      </TableCell>
                      <TableCell align="left">
                        <Button
                          size="small"
                          disabled={mutation.isPending}
                          onClick={() => setDecision({ city, activate: !city.isActive })}
                        >
                          {city.isActive ? 'تعطيل' : 'تفعيل'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      <Dialog open={decision !== null} onClose={() => setDecision(null)} aria-labelledby="city-decision-title">
        <DialogTitle id="city-decision-title">
          {decision?.activate ? 'تفعيل المدينة' : 'تعطيل المدينة'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {decision?.activate
              ? `سيُتاح الحجز في ${decision?.city.name} مجددًا. يُسجل القرار في سجل التدقيق.`
              : `سيتوقف استقبال حجوزات جديدة في ${decision?.city.name}، مع بقاء التاريخ والحجوزات القائمة. يُسجل القرار في سجل التدقيق.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDecision(null)}>تراجع</Button>
          <Button
            variant="contained"
            disabled={mutation.isPending}
            onClick={() => decision && mutation.mutate({ id: decision.city.id, activate: decision.activate })}
          >
            {decision?.activate ? 'تأكيد التفعيل' : 'تأكيد التعطيل'}
          </Button>
        </DialogActions>
      </Dialog>
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          لا تُحذف المدن من هنا؛ التعطيل يوقف الجديد ويحفظ التاريخ.
        </Typography>
      </Box>
    </Container>
  );
}
