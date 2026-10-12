import {
  Button, Chip, Container, FormControl, InputLabel, MenuItem, Paper, Select,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { listPayouts } from '../api/payouts';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import { formatDateTime, formatMoney } from '../fmt/format';
import { useI18n } from '../i18n/i18n';

const PAGE_SIZE = 20;

export function PayoutsPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const expertId = searchParams.get('expertId') ?? '';
  const transferredParam = searchParams.get('transferred');
  const transferred: boolean | 'all' = transferredParam === 'true' ? true : transferredParam === 'false' ? false : 'all';
  const query = useQuery({
    queryKey: ['admin-payouts', page, expertId, transferredParam],
    queryFn: () => listPayouts({
      page,
      limit: PAGE_SIZE,
      ...(expertId === '' ? {} : { expertId }),
      transferred,
    }),
  });
  const update = (next: { page?: number; expertId?: string; transferred?: boolean | 'all' }) => {
    const params = new URLSearchParams();
    const nextPage = next.page ?? page;
    if (nextPage > 1) params.set('page', String(nextPage));
    const nextExpert = next.expertId ?? expertId;
    if (nextExpert !== '') params.set('expertId', nextExpert);
    const nextTransferred = next.transferred ?? transferred;
    if (nextTransferred !== 'all') params.set('transferred', String(nextTransferred));
    setSearchParams(params);
  };

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader
        title={t('المستحقات والتحويلات')}
        subtitle={t('المبالغ محسوبة على الخادم. التسجيل اليدوي توثيق تشغيلي وليس تحويلًا مصرفيًا آليًا.')}
        actions={<Button component={RouterLink} to="/payouts/new">{t('تحويل جديد')}</Button>}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <FormControl sx={{ minWidth: 180 }}>
          <InputLabel id="transfer-filter-label">{t('التحويل')}</InputLabel>
          <Select
            labelId="transfer-filter-label"
            label={t('التحويل')}
            value={transferredParam ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              update({ transferred: value === '' ? 'all' : value === 'true', page: 1 });
            }}
          >
            <MenuItem value="">{t('الكل')}</MenuItem>
            <MenuItem value="true">{t('محوّلة')}</MenuItem>
            <MenuItem value="false">{t('مسجلة بانتظار التحويل')}</MenuItem>
          </Select>
        </FormControl>
      </Stack>
      {query.isLoading && <LoadingState label={t('جارٍ تحميل التحويلات')} />}
      {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState title={t('لا توجد تحويلات بهذا الفلتر')} hint={t('أنشئي تحويلًا من الحجوزات المؤهلة.')} />
      )}
      {query.data && query.data.items.length > 0 && (
        <Paper elevation={0}>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table aria-label={t('قائمة التحويلات')}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('المبلغ')}</TableCell>
                  <TableCell>{t('الحالة')}</TableCell>
                  <TableCell>{t('المرجع')}</TableCell>
                  <TableCell>{t('التاريخ')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.items.map((payout) => (
                  <TableRow key={payout.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700 }}>{formatMoney(payout.amount, payout.currency)}</Typography>
                      <Typography variant="caption" color="text.secondary">#{payout.id.slice(0, 8)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Chip size="small" color={payout.transferredAt ? 'success' : 'warning'} label={payout.transferredAt ? t('محوّلة') : t('مسجلة')} />
                    </TableCell>
                    <TableCell dir="ltr" sx={{ textAlign: 'right' }}>{payout.transferRef ?? '—'}</TableCell>
                    <TableCell>{formatDateTime(payout.transferredAt ?? payout.createdAt)}</TableCell>
                    <TableCell align="left">
                      <Button size="small" component={RouterLink} to={`/payouts/${payout.id}`}>{t('التفاصيل')}</Button>
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
    </Container>
  );
}
