import {
  Button, Chip, Container, FormControl, InputLabel, MenuItem, Paper, Select,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { listPayouts } from '../api/payouts';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import { formatDateTime, formatMoney } from '../fmt/format';

const PAGE_SIZE = 20;

export function PayoutsPage() {
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
        title="المستحقات والتحويلات"
        subtitle="المبالغ محسوبة على الخادم. التسجيل اليدوي توثيق تشغيلي وليس تحويلًا مصرفيًا آليًا."
        actions={<Button component={RouterLink} to="/payouts/new">تحويل جديد</Button>}
      />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <FormControl sx={{ minWidth: 180 }}>
          <InputLabel id="transfer-filter-label">التحويل</InputLabel>
          <Select
            labelId="transfer-filter-label"
            label="التحويل"
            value={transferredParam ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              update({ transferred: value === '' ? 'all' : value === 'true', page: 1 });
            }}
          >
            <MenuItem value="">الكل</MenuItem>
            <MenuItem value="true">محوّلة</MenuItem>
            <MenuItem value="false">مسجلة بانتظار التحويل</MenuItem>
          </Select>
        </FormControl>
      </Stack>
      {query.isLoading && <LoadingState label="جارٍ تحميل التحويلات" />}
      {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState title="لا توجد تحويلات بهذا الفلتر" hint="أنشئي تحويلًا من الحجوزات المؤهلة." />
      )}
      {query.data && query.data.items.length > 0 && (
        <Paper elevation={0}>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table aria-label="قائمة التحويلات">
              <TableHead>
                <TableRow>
                  <TableCell>المبلغ</TableCell>
                  <TableCell>الحالة</TableCell>
                  <TableCell>المرجع</TableCell>
                  <TableCell>التاريخ</TableCell>
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
                      <Chip size="small" color={payout.transferredAt ? 'success' : 'warning'} label={payout.transferredAt ? 'محوّلة' : 'مسجلة'} />
                    </TableCell>
                    <TableCell dir="ltr" sx={{ textAlign: 'right' }}>{payout.transferRef ?? '—'}</TableCell>
                    <TableCell>{formatDateTime(payout.transferredAt ?? payout.createdAt)}</TableCell>
                    <TableCell align="left">
                      <Button size="small" component={RouterLink} to={`/payouts/${payout.id}`}>التفاصيل</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack direction="row" spacing={1} sx={{ p: 2, justifyContent: 'flex-start' }}>
            <Button disabled={page <= 1} onClick={() => update({ page: page - 1 })}>السابق</Button>
            <Typography sx={{ alignSelf: 'center' }} aria-live="polite">صفحة {page}</Typography>
            <Button disabled={!query.data.pagination.hasNext} onClick={() => update({ page: page + 1 })}>التالي</Button>
          </Stack>
        </Paper>
      )}
    </Container>
  );
}
