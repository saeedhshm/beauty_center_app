import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import CheckCircleRounded from '@mui/icons-material/CheckCircleRounded';
import ConstructionRounded from '@mui/icons-material/ConstructionRounded';
import ShieldOutlined from '@mui/icons-material/ShieldOutlined';
import { Box, Chip, Container, Paper, Stack, Typography } from '@mui/material';
import { useAuth } from '../auth/auth-context';

const nextModules = [
  { number: '01', title: 'الخدمات والخبيرات', text: 'إدارة الكتالوج ومراجعة ملفات الاعتماد والوثائق الخاصة.' },
  { number: '02', title: 'الحجوزات', text: 'متابعة الحالات والمهل واللقطات وسجل الانتقالات.' },
  { number: '03', title: 'التشغيل المالي', text: 'مراجعة الدفع التجريبي والمستحقات والتحويلات اليدوية.' },
];

function cairoDate() {
  return new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Cairo',
  }).format(new Date());
}

export function HomePage() {
  const auth = useAuth();
  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 5 }, px: { xs: 2, md: 4 } }}>
      <Paper className="welcome-panel" elevation={0}>
        <Box sx={{ position: 'relative', zIndex: 1, maxWidth: 680 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 3, alignItems: 'center' }}>
            <Chip icon={<ShieldOutlined />} label="جلسة إدارة موثقة" className="light-chip" />
            <Chip label="Demo" className="demo-chip" />
          </Stack>
          <Typography variant="body2" sx={{ color: 'rgba(255,250,246,.65)', mb: 1 }}>{cairoDate()}</Typography>
          <Typography variant="h1" sx={{ color: '#fffaf6', fontSize: { xs: '2.25rem', md: '3.7rem' }, lineHeight: 1.1 }}>
            صباح العمليات، {auth.user?.name.split(' ')[0]}
          </Typography>
          <Typography sx={{ color: 'rgba(255,250,246,.72)', mt: 2, maxWidth: 570, lineHeight: 1.9 }}>
            اكتمل أساس اللوحة الآمن. الوحدات التشغيلية ستُفعّل تباعًا بعد مطابقة عقودها مع الخادم.
          </Typography>
        </Box>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr 1.95fr' }, gap: 3, mt: 3 }}>
        <Paper className="foundation-card" elevation={0}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Box>
              <Typography className="eyebrow" color="primary.main">المرحلة الحالية</Typography>
              <Typography variant="h3" sx={{ mt: 1, fontSize: '1.65rem' }}>الأساس والجلسة</Typography>
            </Box>
            <CheckCircleRounded color="success" sx={{ fontSize: 34 }} />
          </Stack>
          <Stack spacing={1.5} sx={{ mt: 4 }}>
            {['تجديد متسلسل للجلسة', 'حماية المسارات الإدارية', 'واجهة عربية RTL', 'معالجة موحدة للأخطاء'].map((item) => (
              <Stack key={item} direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                <Box className="status-dot" />
                <Typography color="text.secondary">{item}</Typography>
              </Stack>
            ))}
          </Stack>
        </Paper>

        <Paper className="roadmap-card" elevation={0}>
          <Stack direction="row" sx={{ mb: 3, justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography className="eyebrow" color="secondary.dark">قيد البناء</Typography>
              <Typography variant="h3" sx={{ mt: 1, fontSize: '1.65rem' }}>المسار التشغيلي التالي</Typography>
            </Box>
            <ConstructionRounded color="secondary" />
          </Stack>
          <Stack divider={<Box className="roadmap-divider" />}>
            {nextModules.map((module) => (
              <Box key={module.number} className="roadmap-item">
                <Typography className="roadmap-number">{module.number}</Typography>
                <Box sx={{ flexGrow: 1 }}>
                  <Typography sx={{ fontWeight: 800 }}>{module.title}</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: .5 }}>{module.text}</Typography>
                </Box>
                <ArrowBackRounded color="disabled" />
              </Box>
            ))}
          </Stack>
        </Paper>
      </Box>
    </Container>
  );
}
