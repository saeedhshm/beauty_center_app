import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { Box, Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/i18n';

export function NotFoundPage() {
  const { t } = useI18n();
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', px: 2 }}>
      <Box sx={{ textAlign: 'center' }}>
        <Typography className="eyebrow" color="primary.main">404</Typography>
        <Typography variant="h1" sx={{ fontSize: { xs: '2.4rem', md: '4rem' }, mt: 1 }}>{t('هذه الصفحة غير موجودة')}</Typography>
        <Typography color="text.secondary" sx={{ mt: 2, mb: 4 }}>{t('ربما تغيّر الرابط أو لم تُفعّل الوحدة بعد.')}</Typography>
        <Button component={Link} to="/" variant="contained" startIcon={<ArrowForwardRounded />}>{t('العودة إلى اللوحة')}</Button>
      </Box>
    </Box>
  );
}
