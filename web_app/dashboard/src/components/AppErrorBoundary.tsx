import { Component, type ReactNode } from 'react';
import { Box, Button, Typography } from '@mui/material';

interface State { failed: boolean }

export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch() {
    // A production reporter may record a generated correlation ID, never tokens or request bodies.
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Box sx={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', px: 2 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography variant="h2">حدث خطأ غير متوقع</Typography>
          <Typography color="text.secondary" sx={{ my: 2 }}>لم تُحفظ أي عملية غير مؤكدة. أعد تحميل الصفحة وحاول مجددًا.</Typography>
          <Button variant="contained" onClick={() => window.location.reload()}>إعادة تحميل الصفحة</Button>
        </Box>
      </Box>
    );
  }
}
