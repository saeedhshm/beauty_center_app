import {
  Box, Button, Container, FormControl, InputLabel, MenuItem, Paper, Select,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { auditResourcePath, listAuditLogs } from '../api/audit';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import { formatDateTime } from '../fmt/format';

const PAGE_SIZE = 20;

function DetailsCell({ details }: { details: unknown }) {
  let text: string;
  try {
    text = JSON.stringify(details, null, 2) ?? '—';
  } catch {
    text = '—';
  }
  return (
    <Typography
      component="pre"
      dir="ltr"
      sx={{ textAlign: 'left', fontSize: '.72rem', maxHeight: 140, overflow: 'auto', m: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
    >
      {text}
    </Typography>
  );
}

export function AuditPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const action = searchParams.get('action') ?? '';
  const resourceType = searchParams.get('resourceType') ?? '';
  const actorId = searchParams.get('actorId') ?? '';
  const query = useQuery({
    queryKey: ['admin-audit', page, action, resourceType, actorId],
    queryFn: () => listAuditLogs({
      page,
      limit: PAGE_SIZE,
      ...(action === '' ? {} : { action }),
      ...(resourceType === '' ? {} : { resourceType }),
      ...(actorId === '' ? {} : { actorId }),
    }),
  });
  const update = (next: { page?: number; action?: string; resourceType?: string; actorId?: string }) => {
    const params = new URLSearchParams();
    const nextPage = next.page ?? page;
    if (nextPage > 1) params.set('page', String(nextPage));
    const nextAction = next.action ?? action;
    if (nextAction !== '') params.set('action', nextAction);
    const nextType = next.resourceType ?? resourceType;
    if (nextType !== '') params.set('resourceType', nextType);
    const nextActor = next.actorId ?? actorId;
    if (nextActor !== '') params.set('actorId', nextActor);
    setSearchParams(params);
  };
  const applyText = (key: 'action' | 'resourceType' | 'actorId', value: string) => {
    if (key === 'action') update({ action: value, page: 1 });
    else if (key === 'resourceType') update({ resourceType: value, page: 1 });
    else update({ actorId: value, page: 1 });
  };

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader title="سجل التدقيق" subtitle="قراءة فقط؛ كل أمر إداري حساس مسجل بفاعله ومورده ووقته." />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField label="الإجراء" defaultValue={action} sx={{ minWidth: 180 }}
          onBlur={(event) => applyText('action', event.target.value.trim())}
          onKeyDown={(event) => { if (event.key === 'Enter') applyText('action', (event.target as HTMLInputElement).value.trim()); }} />
        <FormControl sx={{ minWidth: 180 }}>
          <InputLabel id="resource-filter-label">نوع المورد</InputLabel>
          <Select labelId="resource-filter-label" label="نوع المورد" value={resourceType}
            onChange={(event) => update({ resourceType: event.target.value, page: 1 })}>
            <MenuItem value="">الكل</MenuItem>
            {['user', 'expert', 'booking', 'payment', 'payout', 'service', 'settings', 'city'].map((type) => (
              <MenuItem key={type} value={type}>{type}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField label="معرف الفاعل" defaultValue={actorId} sx={{ minWidth: 220 }}
          slotProps={{ htmlInput: { dir: 'ltr' } }}
          onBlur={(event) => applyText('actorId', event.target.value.trim())}
          onKeyDown={(event) => { if (event.key === 'Enter') applyText('actorId', (event.target as HTMLInputElement).value.trim()); }} />
      </Stack>
      {query.isLoading && <LoadingState label="جارٍ تحميل السجل" />}
      {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState title="لا توجد سجلات بهذه الفلاتر" hint="وسّعي الفلاتر أو نفّذي إجراءً إداريًا أولًا." />
      )}
      {query.data && query.data.items.length > 0 && (
        <Paper elevation={0}>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table aria-label="سجل التدقيق">
              <TableHead>
                <TableRow>
                  <TableCell>الوقت</TableCell>
                  <TableCell>الإجراء</TableCell>
                  <TableCell>المورد</TableCell>
                  <TableCell>التفاصيل</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.items.map((row) => {
                  const path = auditResourcePath(row.resourceType, row.resourceId);
                  return (
                    <TableRow key={row.id} hover>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(row.createdAt)}</TableCell>
                      <TableCell>
                        <Typography sx={{ fontWeight: 700 }} dir="ltr" align="right">{row.action}</Typography>
                        <Typography variant="caption" color="text.secondary" dir="ltr" sx={{ display: 'block', textAlign: 'right' }}>{row.actorId.slice(0, 8)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" dir="ltr" sx={{ textAlign: 'right' }}>{row.resourceType}</Typography>
                        {path ? (
                          <Button size="small" component={RouterLink} to={path}>فتح المورد</Button>
                        ) : (
                          <Typography variant="caption" color="text.secondary" dir="ltr" sx={{ display: 'block', textAlign: 'right' }}>{row.resourceId.slice(0, 8)}</Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ minWidth: 220 }}><DetailsCell details={row.details} /></TableCell>
                    </TableRow>
                  );
                })}
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
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          الاسترجاع المالي والإلغاء الإداري والتحويلات وتعطيل الحسابات تظهر هنا بأفعالها المسماة.
        </Typography>
      </Box>
    </Container>
  );
}
