import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import { Box, Button, Typography } from '@mui/material';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', px: 2 }}>
      <Box sx={{ textAlign: 'center' }}>
        <Typography className="eyebrow" color="primary.main">404</Typography>
        <Typography variant="h1" sx={{ fontSize: { xs: '2.4rem', md: '4rem' }, mt: 1 }}>هذه الصفحة غير موجودة</Typography>
        <Typography color="text.secondary" sx={{ mt: 2, mb: 4 }}>ربما تغيّر الرابط أو لم تُفعّل الوحدة بعد.</Typography>
        <Button component={Link} to="/" variant="contained" startIcon={<ArrowForwardRounded />}>العودة إلى اللوحة</Button>
      </Box>
    </Box>
  );
}
