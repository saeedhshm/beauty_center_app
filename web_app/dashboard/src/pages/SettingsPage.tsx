import AddRounded from '@mui/icons-material/AddRounded';
import {
  Alert, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, FormControl, InputLabel, MenuItem, Paper, Select,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Typography,
} from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError } from '../api/client';
import { createCity, getSettings, listCities, setCityActive, updateCurrency, updatePolicy } from '../api/settings';
import type { AdminCity } from '../api/settings';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import { describeApiError, formatCommissionRate } from '../fmt/format';
import { useI18n, type Locale } from '../i18n/i18n';

type CityDecision = { city: AdminCity; activate: boolean } | null;
type Currency = 'EGP' | 'SAR';

function isTimeoutInput(value: string): boolean {
  return /^\d{1,4}$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= 1440;
}

function isCommissionInput(value: string): boolean {
  return /^\d{1,3}(?:\.\d{1,4})?$/.test(value.trim()) && Number(value) <= 100;
}

export function SettingsPage() {
  const { locale, setLocale, t } = useI18n();
  const queryClient = useQueryClient();
  const [cityDecision, setCityDecision] = useState<CityDecision>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingPolicy, setEditingPolicy] = useState(false);
  const [acceptance, setAcceptance] = useState('');
  const [payment, setPayment] = useState('');
  const [commission, setCommission] = useState('');
  const [policyErrors, setPolicyErrors] = useState<{ acceptance?: string; payment?: string; commission?: string }>({});
  const [confirmingPolicy, setConfirmingPolicy] = useState(false);
  const [currencyChoice, setCurrencyChoice] = useState<Currency | null>(null);
  const [confirmingCurrency, setConfirmingCurrency] = useState(false);
  const [cityDialogOpen, setCityDialogOpen] = useState(false);
  const [cityName, setCityName] = useState('');
  const [cityCode, setCityCode] = useState('');
  const [cityErrors, setCityErrors] = useState<{ name?: string; code?: string }>({});

  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: getSettings });
  const citiesQuery = useQuery({ queryKey: ['admin-cities'], queryFn: listCities });
  const settings = settingsQuery.data;
  const selectedCurrency: Currency = currencyChoice ?? (settings?.currency === 'SAR' ? 'SAR' : 'EGP');
  const loading = settingsQuery.isLoading || citiesQuery.isLoading;
  const error = settingsQuery.error ?? citiesQuery.error;

  const refreshSettings = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
  };
  const refreshCities = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-cities'] });
  };

  const cityStatusMutation = useMutation({
    mutationFn: ({ city, activate }: Exclude<CityDecision, null>) => setCityActive(city.id, activate),
    onSuccess: async () => {
      setCityDecision(null);
      setActionError(null);
      await refreshCities();
    },
    onError: (cause) => setActionError(cause instanceof ApiError ? describeApiError(cause.code, cause.message) : t('تعذر تنفيذ الأمر.')),
  });

  const cityCreateMutation = useMutation({
    mutationFn: () => createCity({ name: cityName.trim(), code: cityCode.trim().toUpperCase() }),
    onSuccess: async () => {
      setCityDialogOpen(false);
      setCityName('');
      setCityCode('');
      setCityErrors({});
      setActionError(null);
      await refreshCities();
    },
    onError: (cause) => setActionError(cause instanceof ApiError ? describeApiError(cause.code, cause.message) : t('تعذر إنشاء المدينة.')),
  });

  const policyMutation = useMutation({
    mutationFn: () => updatePolicy({
      acceptanceTimeoutMinutes: Number(acceptance.trim()),
      paymentTimeoutMinutes: Number(payment.trim()),
      commissionRate: commission.trim(),
    }),
    onSuccess: async () => {
      setEditingPolicy(false);
      setConfirmingPolicy(false);
      setActionError(null);
      await refreshSettings();
    },
    onError: (cause) => {
      setConfirmingPolicy(false);
      setActionError(cause instanceof ApiError ? describeApiError(cause.code, cause.message) : t('تعذر حفظ السياسة.'));
    },
  });

  const currencyMutation = useMutation({
    mutationFn: () => updateCurrency(selectedCurrency),
    onSuccess: async () => {
      setConfirmingCurrency(false);
      setCurrencyChoice(null);
      setActionError(null);
      await refreshSettings();
    },
    onError: (cause) => {
      setConfirmingCurrency(false);
      setActionError(cause instanceof ApiError ? describeApiError(cause.code, cause.message) : t('تعذر تغيير عملة السوق.'));
    },
  });

  const startPolicyEdit = () => {
    if (!settings) return;
    setAcceptance(String(settings.bookingPolicy.acceptanceTimeoutMinutes));
    setPayment(String(settings.bookingPolicy.paymentTimeoutMinutes));
    setCommission(settings.bookingPolicy.commissionRate.replace(/0+$/, '').replace(/\.$/, ''));
    setPolicyErrors({});
    setActionError(null);
    setEditingPolicy(true);
  };

  const requestPolicySave = () => {
    const errors: typeof policyErrors = {};
    if (!isTimeoutInput(acceptance)) errors.acceptance = t('عدد صحيح بين 1 و1440 دقيقة.');
    if (!isTimeoutInput(payment)) errors.payment = t('عدد صحيح بين 1 و1440 دقيقة.');
    if (!isCommissionInput(commission)) errors.commission = t('نسبة بين 0 و100 بأربع منازل عشرية كحد أقصى.');
    setPolicyErrors(errors);
    if (Object.keys(errors).length === 0) setConfirmingPolicy(true);
  };

  const requestCityCreate = () => {
    const errors: typeof cityErrors = {};
    if (!/^[\p{Script=Arabic}\p{N}][\p{Script=Arabic}\p{N}\p{M} .'-]{1,99}$/u.test(cityName.trim())) errors.name = t('اسم عربي صالح من حرفين إلى 100 حرف.');
    if (!/^[A-Z]{2}-[A-Z0-9]{2,12}$/.test(cityCode.trim().toUpperCase())) errors.code = t('استخدم رمزًا ثابتًا مثل EG-ALX.');
    setCityErrors(errors);
    if (Object.keys(errors).length === 0) cityCreateMutation.mutate();
  };

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader title={t('الإعدادات')} subtitle={t('سياسة الحجز والسوق والمدن ولغة واجهة هذا المتصفح.')} />
      {actionError && <Alert severity="warning" onClose={() => setActionError(null)} sx={{ mb: 2 }}>{actionError}</Alert>}

      <Paper elevation={0} sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" component="h2" sx={{ mb: 1 }}>{t('لغة واجهة لوحة الإدارة')}</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>{t('محلي على هذا المتصفح فقط، ولا يُرسل إلى الخادم.')}</Typography>
        <FormControl sx={{ minWidth: 220 }}>
          <InputLabel id="locale-label">{t('اللغة')}</InputLabel>
          <Select
            labelId="locale-label"
            label={t('اللغة')}
            value={locale}
            onChange={(event) => setLocale(event.target.value as Locale)}
          >
            <MenuItem value="ar">العربية</MenuItem>
            <MenuItem value="en">English</MenuItem>
          </Select>
        </FormControl>
      </Paper>

      {loading && <LoadingState label={t('جارٍ تحميل الإعدادات')} />}
      {error && <ErrorState error={error} onRetry={() => { void settingsQuery.refetch(); void citiesQuery.refetch(); }} />}

      {settings && (
        <>
          <Paper elevation={0} sx={{ p: 3, mb: 3 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 2 }}>
              <Typography variant="h6" component="h2">{t('لقطة السياسة الحالية')}</Typography>
              {!editingPolicy && <Button variant="outlined" onClick={startPolicyEdit}>{t('تعديل المهل والعمولة')}</Button>}
            </Stack>
            <Stack spacing={1}>
              <Typography>{t('مدينة الإطلاق')}: <strong>{settings.launchCity.name} ({settings.launchCity.code})</strong></Typography>
              <Typography>{t('العملة')}: <strong>{settings.currency}</strong> · {t('المنطقة الزمنية')}: <strong dir="ltr">{settings.timeZone}</strong></Typography>
              <Typography>{t('مهلة القبول')}: <strong>{settings.bookingPolicy.acceptanceTimeoutMinutes} {t('دقيقة')}</strong></Typography>
              <Typography>{t('مهلة الدفع')}: <strong>{settings.bookingPolicy.paymentTimeoutMinutes} {t('دقيقة')}</strong></Typography>
              <Typography>{t('العمولة')}: <strong>{formatCommissionRate(settings.bookingPolicy.commissionRate)}</strong></Typography>
              <Typography>{t('وضع الدفع')}: <strong>{settings.paymentMode === 'demo' ? t('تجريبي (Demo)') : settings.paymentMode}</strong></Typography>
            </Stack>
            <Alert severity="info" sx={{ mt: 2 }}>
              {t('تُحفظ مهلة القبول والعمولة كلقطتين عند إنشاء الحجز. مهلة الدفع الحالية هي التي تبدأ عندما يُقبل حجز pending. السجلات السابقة لا تتغير.')}
            </Alert>
            {editingPolicy && (
              <Box sx={{ mt: 2, borderTop: 1, borderColor: 'divider', pt: 2 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField label={t('مهلة القبول (دقيقة)')} type="number" value={acceptance} onChange={(event) => setAcceptance(event.target.value)} slotProps={{ htmlInput: { min: 1, max: 1440 } }} error={Boolean(policyErrors.acceptance)} helperText={policyErrors.acceptance ?? t('من 1 إلى 1440.')} sx={{ maxWidth: 220 }} />
                  <TextField label={t('مهلة الدفع (دقيقة)')} type="number" value={payment} onChange={(event) => setPayment(event.target.value)} slotProps={{ htmlInput: { min: 1, max: 1440 } }} error={Boolean(policyErrors.payment)} helperText={policyErrors.payment ?? t('من 1 إلى 1440.')} sx={{ maxWidth: 220 }} />
                  <TextField label={t('العمولة (%)')} inputMode="decimal" value={commission} onChange={(event) => setCommission(event.target.value)} error={Boolean(policyErrors.commission)} helperText={policyErrors.commission ?? t('من 0 إلى 100.')} sx={{ maxWidth: 220 }} />
                </Stack>
                <Stack direction="row" spacing={1.5} sx={{ mt: 2 }}>
                  <Button variant="contained" disabled={policyMutation.isPending} onClick={requestPolicySave}>{t('مراجعة وحفظ')}</Button>
                  <Button disabled={policyMutation.isPending} onClick={() => { setEditingPolicy(false); setPolicyErrors({}); }}>{t('تراجع')}</Button>
                </Stack>
              </Box>
            )}
          </Paper>

          <Paper elevation={0} sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 1 }}>{t('عملة السوق الحالية')}</Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>{t('تحدد عملة العروض والحجوزات الجديدة المؤهلة في السوق الحالي.')}</Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ alignItems: { sm: 'center' } }}>
              <FormControl sx={{ minWidth: 180 }}>
                <InputLabel id="currency-label">{t('العملة')}</InputLabel>
                <Select labelId="currency-label" label={t('العملة')} value={selectedCurrency} onChange={(event) => setCurrencyChoice(event.target.value as Currency)}>
                  <MenuItem value="EGP">EGP</MenuItem>
                  <MenuItem value="SAR">SAR</MenuItem>
                </Select>
              </FormControl>
              <Button variant="outlined" disabled={selectedCurrency === settings.currency || currencyMutation.isPending} onClick={() => setConfirmingCurrency(true)}>{t('تغيير عملة السوق')}</Button>
            </Stack>
          </Paper>
        </>
      )}

      {!loading && !error && (
        <Paper elevation={0} sx={{ p: { xs: 2, md: 3 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' }, mb: 2 }}>
            <Box>
              <Typography variant="h6" component="h2">{t('المدن')}</Typography>
              <Typography color="text.secondary">{t('أنشئ المدن ثم فعّل أو عطّل استقبال الأعمال الجديدة دون حذف التاريخ.')}</Typography>
            </Box>
            <Button variant="contained" startIcon={<AddRounded />} onClick={() => setCityDialogOpen(true)}>{t('مدينة جديدة')}</Button>
          </Stack>
          {citiesQuery.data?.length === 0 && <EmptyState title={t('لا توجد مدن')} hint={t('أنشئ أول مدينة للسوق.')} />}
          {citiesQuery.data && citiesQuery.data.length > 0 && (
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table aria-label={t('قائمة المدن')}>
                <TableHead><TableRow><TableCell>{t('المدينة')}</TableCell><TableCell>{t('الرمز')}</TableCell><TableCell>{t('الحالة')}</TableCell><TableCell /></TableRow></TableHead>
                <TableBody>
                  {citiesQuery.data.map((city) => (
                    <TableRow key={city.id} hover>
                      <TableCell sx={{ fontWeight: 700 }}>{city.name}</TableCell>
                      <TableCell dir="ltr">{city.code ?? '—'}</TableCell>
                      <TableCell><Chip size="small" color={city.isActive ? 'success' : 'default'} label={city.isActive ? t('مفعلة') : t('معطلة')} /></TableCell>
                      <TableCell align="left"><Button size="small" color={city.isActive ? 'error' : 'success'} onClick={() => setCityDecision({ city, activate: !city.isActive })}>{city.isActive ? t('تعطيل') : t('تفعيل')}</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          <Alert severity="info" sx={{ mt: 2 }}>{t('لا يوجد حذف للمدن: التعطيل يمنع الاستخدام الجديد مع الحفاظ على الحجوزات والسجلات التاريخية.')}</Alert>
        </Paper>
      )}

      <Dialog open={cityDecision !== null} onClose={() => setCityDecision(null)} aria-labelledby="city-decision-title">
        <DialogTitle id="city-decision-title">{cityDecision?.activate ? t('تأكيد تفعيل المدينة') : t('تأكيد تعطيل المدينة')}</DialogTitle>
        <DialogContent><DialogContentText>{cityDecision?.activate ? t('ستصبح {{name}} متاحة للاستخدام الجديد بعد تأكيد الخادم.', { name: cityDecision?.city.name ?? '' }) : t('سيتوقف الاستخدام الجديد لمدينة {{name}}، مع بقاء كل السجلات التاريخية دون حذف.', { name: cityDecision?.city.name ?? '' })}</DialogContentText></DialogContent>
        <DialogActions><Button onClick={() => setCityDecision(null)}>{t('تراجع')}</Button><Button variant="contained" color={cityDecision?.activate ? 'success' : 'error'} disabled={cityStatusMutation.isPending} onClick={() => cityDecision && cityStatusMutation.mutate(cityDecision)}>{t('تأكيد')}</Button></DialogActions>
      </Dialog>

      <Dialog open={cityDialogOpen} onClose={() => setCityDialogOpen(false)} fullWidth maxWidth="sm" aria-labelledby="city-create-title">
        <DialogTitle id="city-create-title">{t('إنشاء مدينة')}</DialogTitle>
        <DialogContent><Stack spacing={2} sx={{ pt: 1 }}><TextField label={t('اسم المدينة')} value={cityName} onChange={(event) => setCityName(event.target.value)} error={Boolean(cityErrors.name)} helperText={cityErrors.name ?? t('اسم عربي للاستخدام التجاري.')} autoFocus /><TextField label={t('رمز المدينة')} value={cityCode} onChange={(event) => setCityCode(event.target.value.toUpperCase())} error={Boolean(cityErrors.code)} helperText={cityErrors.code ?? t('مثال: EG-ALX')} slotProps={{ htmlInput: { dir: 'ltr', maxLength: 15 } }} /></Stack></DialogContent>
        <DialogActions><Button onClick={() => setCityDialogOpen(false)}>{t('إلغاء')}</Button><Button variant="contained" disabled={cityCreateMutation.isPending} onClick={requestCityCreate}>{t('إنشاء')}</Button></DialogActions>
      </Dialog>

      <Dialog open={confirmingPolicy} onClose={() => setConfirmingPolicy(false)} aria-labelledby="policy-decision-title">
        <DialogTitle id="policy-decision-title">{t('تأكيد تعديل السياسة')}</DialogTitle>
        <DialogContent><DialogContentText>{t('ستُحفظ مهلة القبول {{acceptance}} دقيقة والعمولة {{commission}}% كلقطتين للحجوزات التي تُنشأ لاحقًا. مهلة الدفع {{payment}} دقيقة ستُطبق عند قبول حجز pending وفق السياسة الحالية. السجلات السابقة لا تتغير.', { acceptance: acceptance.trim(), commission: commission.trim(), payment: payment.trim() })}</DialogContentText></DialogContent>
        <DialogActions><Button onClick={() => setConfirmingPolicy(false)}>{t('تراجع')}</Button><Button variant="contained" disabled={policyMutation.isPending} onClick={() => policyMutation.mutate()}>{t('تأكيد الحفظ')}</Button></DialogActions>
      </Dialog>

      <Dialog open={confirmingCurrency} onClose={() => setConfirmingCurrency(false)} aria-labelledby="currency-decision-title">
        <DialogTitle id="currency-decision-title">{t('تأكيد تغيير عملة السوق')}</DialogTitle>
        <DialogContent><Alert severity="warning" sx={{ mb: 2 }}>{t('هذا التغيير لا ينفذ أي تحويل عملات (FX). تبقى السجلات التاريخية بمبالغها وعملاتها الأصلية، وتصبح عروض الخبيرات بالعملة القديمة غير متاحة حتى تعيد كل خبيرة تسعيرها صراحةً بالعملة الجديدة.')}</Alert><DialogContentText>{t('ستتغير عملة السوق الحالية من {{from}} إلى {{to}} للحجوزات والعروض المؤهلة الجديدة فقط.', { from: settings?.currency ?? '', to: selectedCurrency })}</DialogContentText></DialogContent>
        <DialogActions><Button onClick={() => setConfirmingCurrency(false)}>{t('تراجع')}</Button><Button variant="contained" color="warning" disabled={currencyMutation.isPending} onClick={() => currencyMutation.mutate()}>{t('تأكيد تغيير العملة')}</Button></DialogActions>
      </Dialog>
    </Container>
  );
}
