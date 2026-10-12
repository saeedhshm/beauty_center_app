import {
  Box, Button, Chip, Container, FormControl, InputLabel, MenuItem, Paper, Select,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { listExperts } from '../api/experts';
import type { ApprovalStatus } from '../api/types';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import { APPROVAL_STATUS_LABELS, approvalStatusTone } from '../fmt/format';
import { useI18n } from '../i18n/i18n';

const PAGE_SIZE = 20;
export function ExpertsPage() {
  const { t } = useI18n();
  const filters: Array<{ value: ApprovalStatus | 'all'; label: string }> = [
    { value: 'all', label: t('الكل') },
    { value: 'pending', label: APPROVAL_STATUS_LABELS.pending },
    { value: 'approved', label: APPROVAL_STATUS_LABELS.approved },
    { value: 'suspended', label: APPROVAL_STATUS_LABELS.suspended },
  ];
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const statusParam = searchParams.get('status');
  const approvalStatus: ApprovalStatus | 'all' = statusParam === 'pending' || statusParam === 'approved' || statusParam === 'suspended'
    ? statusParam
    : 'all';
  const query = useQuery({
    queryKey: ['admin-experts', page, approvalStatus],
    queryFn: () => listExperts({ page, limit: PAGE_SIZE, approvalStatus }),
  });
  const update = (next: { page?: number; approvalStatus?: ApprovalStatus | 'all' }) => {
    const params = new URLSearchParams();
    const nextPage = next.page ?? page;
    const nextStatus = next.approvalStatus ?? approvalStatus;
    if (nextPage > 1) params.set('page', String(nextPage));
    if (nextStatus !== 'all') params.set('status', nextStatus);
    setSearchParams(params);
  };

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader title={t('الخبيرات')} subtitle={t('مراجعة ملفات الاعتماد والوثائق الخاصة قبل النشر.')} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <FormControl sx={{ minWidth: 220 }}>
          <InputLabel id="approval-filter-label">{t('حالة الاعتماد')}</InputLabel>
          <Select
            labelId="approval-filter-label"
            label={t('حالة الاعتماد')}
            value={approvalStatus}
            onChange={(event) => update({ approvalStatus: event.target.value as ApprovalStatus | 'all', page: 1 })}
          >
            {filters.map((option) => (
              <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>
      {query.isLoading && <LoadingState label={t('جارٍ تحميل الخبيرات')} />}
      {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState title={t('لا توجد خبيرات بهذا الفلتر')} hint={t('غيّري حالة الاعتماد أو انتظري تسجيل خبيرات جدد.')} />
      )}
      {query.data && query.data.items.length > 0 && (
        <Paper elevation={0}>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table aria-label={t('قائمة الخبيرات')}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('الخبيرة')}</TableCell>
                  <TableCell>{t('الهاتف')}</TableCell>
                  <TableCell>{t('التقييم')}</TableCell>
                  <TableCell>{t('الاعتماد')}</TableCell>
                  <TableCell>{t('استقبال الحجوزات')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.items.map((expert) => (
                  <TableRow key={expert.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700 }}>{expert.name}</Typography>
                      <Typography variant="caption" color="text.secondary">{expert.cityName ?? '—'}</Typography>
                    </TableCell>
                    <TableCell dir="ltr" sx={{ textAlign: 'right' }}>{expert.phone}</TableCell>
                    <TableCell>{expert.ratingAvg} ({expert.ratingCount})</TableCell>
                    <TableCell>
                      <Chip size="small" color={approvalStatusTone(expert.approvalStatus)} label={APPROVAL_STATUS_LABELS[expert.approvalStatus]} />
                    </TableCell>
                    <TableCell>{expert.isAcceptingBookings ? t('مفعّل') : t('موقوف')}</TableCell>
                    <TableCell align="left">
                      <Button size="small" component={RouterLink} to={`/experts/${expert.id}`}>{t('مراجعة')}</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack direction="row" spacing={1} sx={{ p: 2, justifyContent: 'flex-start' }}>
            <Button disabled={page <= 1} onClick={() => update({ page: page - 1 })}>{t('السابق')}</Button>
            <Typography sx={{ alignSelf: 'center' }} aria-live="polite">{t('صفحة {{page}}', { page })}</Typography>
            <Button disabled={!query.data.pagination.hasNext} onClick={() => update({ page: page + 1 })}>{t('التالي')}</Button>
          </Stack>
        </Paper>
      )}
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          {t('أرقام الهواتف ظاهرة للمدير في هذا السياق التشغيلي فقط.')}
        </Typography>
      </Box>
    </Container>
  );
}
