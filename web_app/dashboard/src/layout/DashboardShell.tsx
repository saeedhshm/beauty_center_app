import AssignmentOutlined from '@mui/icons-material/AssignmentOutlined';
import AccountBalanceOutlined from '@mui/icons-material/AccountBalanceOutlined';
import CalendarMonthOutlined from '@mui/icons-material/CalendarMonthOutlined';
import DashboardOutlined from '@mui/icons-material/DashboardOutlined';
import GroupOutlined from '@mui/icons-material/GroupOutlined';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';
import MonitorHeartOutlined from '@mui/icons-material/MonitorHeartOutlined';
import PaymentsOutlined from '@mui/icons-material/PaymentsOutlined';
import PersonSearchOutlined from '@mui/icons-material/PersonSearchOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import ShowChartOutlined from '@mui/icons-material/ShowChartOutlined';
import SpaOutlined from '@mui/icons-material/SpaOutlined';
import StarRateOutlined from '@mui/icons-material/StarRateOutlined';
import {
  AppBar, Avatar, Box, Button, Divider, Drawer, IconButton, List, ListItemButton,
  ListItemIcon, ListItemText, Stack, Toolbar, Tooltip, Typography,
} from '@mui/material';
import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';

const drawerWidth = 280;
const active = [
  { label: 'الملخص', to: '/overview', icon: <ShowChartOutlined /> },
  { label: 'الخبيرات', to: '/experts', icon: <PersonSearchOutlined /> },
  { label: 'الخدمات', to: '/services', icon: <SpaOutlined /> },
  { label: 'الحجوزات', to: '/bookings', icon: <CalendarMonthOutlined /> },
  { label: 'الحسابات', to: '/users', icon: <GroupOutlined /> },
  { label: 'التقييمات', to: '/reviews', icon: <StarRateOutlined /> },
  { label: 'سجل التدقيق', to: '/audit', icon: <AssignmentOutlined /> },
  { label: 'المدفوعات', to: '/payments', icon: <PaymentsOutlined /> },
  { label: 'المستحقات', to: '/payouts', icon: <AccountBalanceOutlined /> },
  { label: 'التشغيل', to: '/operations', icon: <MonitorHeartOutlined /> },
  { label: 'الإعدادات', to: '/settings', icon: <SettingsOutlined /> },
];

function Navigation({ close }: { close: () => void }) {
  return (
    <Box className="sidebar-content">
      <Box sx={{ px: 3, pt: 3.5, pb: 3 }}>
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <Box className="sidebar-logo">ل</Box>
          <Box>
            <Typography sx={{ color: '#fffaf6', fontWeight: 800, fontSize: '1.25rem' }}>لمسة</Typography>
            <Typography sx={{ color: 'rgba(255,250,246,.55)', fontSize: '.75rem' }}>مركز العمليات</Typography>
          </Box>
        </Stack>
      </Box>
      <Divider sx={{ borderColor: 'rgba(255,255,255,.09)' }} />
      <List sx={{ px: 1.5, pt: 2 }}>
        <ListItemButton component={NavLink} to="/" end onClick={close} className="sidebar-link">
          <ListItemIcon><DashboardOutlined /></ListItemIcon>
          <ListItemText primary="نظرة عامة" />
        </ListItemButton>
        {active.map((item) => (
          <ListItemButton key={item.label} component={NavLink} to={item.to} onClick={close} className="sidebar-link">
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ mt: 'auto', p: 2.5 }}>
        <Typography sx={{ color: 'rgba(255,250,246,.62)', fontSize: '.72rem', lineHeight: 1.7 }}>
          بيئة العرض التجريبية<br />لا توجد معاملات مالية حقيقية
        </Typography>
      </Box>
    </Box>
  );
}

export function DashboardShell() {
  const auth = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const initial = auth.user?.name.trim().charAt(0) || 'م';

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex' }}>
      <Button href="#main-content" className="skip-link">تخطَّ إلى المحتوى الرئيسي</Button>
      <AppBar position="fixed" color="transparent" elevation={0} className="dashboard-appbar" sx={{ width: { lg: `calc(100% - ${drawerWidth}px)` }, mr: { lg: `${drawerWidth}px` } }}>
        <Toolbar sx={{ minHeight: '76px !important', px: { xs: 2, md: 4 } }}>
          <IconButton onClick={() => setMobileOpen(true)} sx={{ display: { lg: 'none' }, ml: 1 }} aria-label="فتح قائمة التنقل">
            <MenuRounded />
          </IconButton>
          <Box sx={{ flexGrow: 1 }}>
            <Typography sx={{ fontWeight: 800 }}>لوحة الإدارة</Typography>
            <Typography variant="caption" color="text.secondary">القاهرة · توقيت الأعمال المحلي</Typography>
          </Box>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
            <Box sx={{ display: { xs: 'none', sm: 'block' }, textAlign: 'left' }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>{auth.user?.name}</Typography>
              <Typography variant="caption" color="text.secondary">مدير النظام</Typography>
            </Box>
            <Avatar sx={{ bgcolor: 'primary.main', color: 'primary.contrastText' }}>{initial}</Avatar>
            <Tooltip title="تسجيل الخروج">
              <IconButton onClick={() => void auth.logout()} aria-label="تسجيل الخروج"><LogoutRounded /></IconButton>
            </Tooltip>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { lg: drawerWidth }, flexShrink: { lg: 0 } }} aria-label="التنقل الرئيسي">
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: 'block', lg: 'none' }, '& .MuiDrawer-paper': { width: drawerWidth } }}
        >
          <Navigation close={() => setMobileOpen(false)} />
        </Drawer>
        <Drawer
          variant="permanent"
          open
          sx={{ display: { xs: 'none', lg: 'block' }, '& .MuiDrawer-paper': { width: drawerWidth } }}
        >
          <Navigation close={() => undefined} />
        </Drawer>
      </Box>

      <Box component="main" id="main-content" tabIndex={-1} sx={{ flexGrow: 1, minWidth: 0, pt: '76px' }}>
        <Outlet />
      </Box>
    </Box>
  );
}
