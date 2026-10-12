import { zodResolver } from '@hookform/resolvers/zod';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import LockOutlined from '@mui/icons-material/LockOutlined';
import {
  Alert, Box, Button, CircularProgress, InputAdornment, Paper, Stack, TextField, Typography,
} from '@mui/material';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from '../api/client';
import { useAuth } from './auth-context';
import { useI18n } from '../i18n/i18n';

type LoginInput = { phone: string; password: string };

export function LoginPage() {
  const auth = useAuth();
  const { locale, setLocale, t } = useI18n();
  const loginSchema = z.object({
    phone: z.string().trim().regex(/^(?:01[0125]\d{8}|\+201[0125]\d{8}|05\d{8}|\+9665\d{8})$/, t('أدخل رقم الهاتف المصري المسجل')),
    password: z.string().min(1, t('أدخل كلمة المرور')).max(128),
  });
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<{ message: string; requestId?: string } | null>(null);
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { phone: '', password: '' },
  });

  if (auth.status === 'authenticated') return <Navigate to="/" replace />;

  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      await auth.login(values.phone, values.password);
      const requested = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname;
      navigate(requested && requested !== '/login' ? requested : '/', { replace: true });
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError({ message: cause.message, ...(cause.requestId ? { requestId: cause.requestId } : {}) });
      } else {
        setError({ message: t('تعذر الاتصال بالخادم. تحقّق من الشبكة ثم حاول مجددًا.') });
      }
    }
  });

  return (
    <Box className="login-page">
      <Box className="login-story" component="section" aria-label={t('عن منصة لمسة')}>
        <Box component="img" src="/lamsa_icon.png" alt="" className="brand-mark" />
        <Typography component="p" className="eyebrow">{t('لوحة عمليات لمسة')}</Typography>
        <Typography variant="h1" sx={{ maxWidth: 560, fontSize: { xs: '2.7rem', lg: '4.8rem' }, lineHeight: 1.05 }}>
          {t('كل قرار تشغيلي، في مكان واضح.')}
        </Typography>
        <Typography sx={{ maxWidth: 520, color: 'rgba(255,250,246,.72)', fontSize: '1.05rem', lineHeight: 1.9 }}>
          {t('راقب الحجوزات، راجع الخبيرات، وأدر العمليات المالية من مصدر بيانات واحد يحفظ التاريخ.')}
        </Typography>
        <Stack direction="row" spacing={1.5} className="market-stamp">
          <span>{t('القاهرة')}</span><span>EGP</span><span>Africa/Cairo</span>
        </Stack>
      </Box>

      <Box className="login-panel" component="main">
        <Paper className="login-card" elevation={0}>
          <Box sx={{ mb: 4 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography component="p" className="eyebrow" color="primary.main">{t('دخول مخصص للإدارة')}</Typography>
              <Button size="small" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>{locale === 'ar' ? 'English' : 'العربية'}</Button>
            </Stack>
            <Typography variant="h2" sx={{ mt: 1, fontSize: { xs: '2rem', md: '2.6rem' } }}>{t('مرحبًا بعودتك')}</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>{t('استخدم حساب المدير المعتمد للوصول إلى لوحة التشغيل.')}</Typography>
          </Box>

          <Box component="form" onSubmit={submit} noValidate>
            <Stack spacing={2.5}>
              {error && (
                <Alert severity="error">
                  {error.message}
                  {error.requestId && <Typography variant="caption" sx={{ display: 'block' }}>{t('رقم التتبع: {{id}}', { id: error.requestId })}</Typography>}
                </Alert>
              )}
              <Controller
                name="phone"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={t('رقم الهاتف')}
                    type="tel"
                    autoComplete="username"
                    autoFocus
                    error={Boolean(errors.phone)}
                    helperText={errors.phone?.message ?? t('مثال: 01000000001')}
                    slotProps={{ htmlInput: { dir: 'ltr' } }}
                  />
                )}
              />
              <Controller
                name="password"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label={t('كلمة المرور')}
                    type="password"
                    autoComplete="current-password"
                    error={Boolean(errors.password)}
                    helperText={errors.password?.message}
                    slotProps={{ input: { startAdornment: <InputAdornment position="start"><LockOutlined fontSize="small" /></InputAdornment> } }}
                  />
                )}
              />
              <Button type="submit" variant="contained" size="large" disabled={isSubmitting} endIcon={!isSubmitting && <ArrowBackRounded />}>
                {isSubmitting ? <CircularProgress size={24} color="inherit" aria-label={t('جارٍ تسجيل الدخول')} /> : t('دخول لوحة الإدارة')}
              </Button>
            </Stack>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 4, lineHeight: 1.8 }}>
            {t('هذه الجلسة منفصلة عن تطبيقات العميلات والخبيرات. لا تشارك بيانات الدخول أو رموز الجلسة.')}
          </Typography>
        </Paper>
      </Box>
    </Box>
  );
}
