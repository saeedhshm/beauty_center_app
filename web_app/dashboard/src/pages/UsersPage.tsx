import {
  Alert, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, FormControl, InputLabel, MenuItem, Paper, Select, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api/client';
import { deactivateUser, listUsers, reactivateUser } from '../api/users';
import type { AccountRole } from '../api/types';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import { describeApiError, formatDateTime } from '../fmt/format';

const PAGE_SIZE = 20;

type Decision = { id: string; name: string; active: boolean } | null;

export function UsersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [decision, setDecision] = useState<Decision>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const roleParam = searchParams.get('role');
  const role: AccountRole | 'all' = roleParam === 'customer' || roleParam === 'expert' || roleParam === 'admin' ? roleParam : 'all';
  const activeParam = searchParams.get('active');
  const isActive: boolean | 'all' = activeParam === 'true' ? true : activeParam === 'false' ? false : 'all';
  const q = searchParams.get('q') ?? '';
  const query = useQuery({
    queryKey: ['admin-users', page, role, isActive, q],
    queryFn: () => listUsers({
      page, limit: PAGE_SIZE, role, isActive, ...(q === '' ? {} : { q }),
    }),
  });
  const update = (next: { page?: number; role?: AccountRole | 'all'; isActive?: boolean | 'all'; q?: string }) => {
    const params = new URLSearchParams();
    const nextPage = next.page ?? page;
    if (nextPage > 1) params.set('page', String(nextPage));
    const nextRole = next.role ?? role;
    if (nextRole !== 'all') params.set('role', nextRole);
    const nextActive = next.isActive ?? isActive;
    if (nextActive !== 'all') params.set('active', String(nextActive));
    const nextQ = next.q ?? q;
    if (nextQ !== '') params.set('q', nextQ);
    setSearchParams(params);
  };
  const mutation = useMutation({
    mutationFn: (target: { id: string; active: boolean }) => target.active
      ? reactivateUser(target.id)
      : deactivateUser(target.id),
    onSuccess: async () => {
      setDecision(null);
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (cause) => {
      setActionError(cause instanceof ApiError ? describeApiError(cause.code, cause.message) : 'تعذر تنفيذ الأمر.');
    },
  });

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader title="الحسابات" subtitle="تعطيل الحسابات يبطل الجلسات ويحفظ التاريخ؛ لا يمكن تعطيل مدير." />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          label="بحث بالاسم أو الهاتف"
          defaultValue={q}
          onBlur={(event) => update({ q: event.target.value.trim(), page: 1 })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') update({ q: (event.target as HTMLInputElement).value.trim(), page: 1 });
          }}
          sx={{ minWidth: 220 }}
        />
        <FormControl sx={{ minWidth: 160 }}>
          <InputLabel id="role-filter-label">الدور</InputLabel>
          <Select labelId="role-filter-label" label="الدور" value={role}
            onChange={(event) => update({ role: event.target.value as AccountRole | 'all', page: 1 })}>
            <MenuItem value="all">الكل</MenuItem>
            <MenuItem value="customer">عميلة</MenuItem>
            <MenuItem value="expert">خبيرة</MenuItem>
            <MenuItem value="admin">مدير</MenuItem>
          </Select>
        </FormControl>
        <FormControl sx={{ minWidth: 160 }}>
          <InputLabel id="active-filter-label">النشاط</InputLabel>
          <Select labelId="active-filter-label" label="النشاط" value={isActive === 'all' ? 'all' : String(isActive)}
            onChange={(event) => {
              const value = event.target.value;
              update({ isActive: value === 'all' ? 'all' : value === 'true', page: 1 });
            }}>
            <MenuItem value="all">الكل</MenuItem>
            <MenuItem value="true">نشط</MenuItem>
            <MenuItem value="false">معطّل</MenuItem>
          </Select>
        </FormControl>
      </Stack>
      {query.isLoading && <LoadingState label="جارٍ تحميل الحسابات" />}
      {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState title="لا توجد حسابات بهذا الفلتر" hint="غيّري البحث أو الفلاتر." />
      )}
      {query.data && query.data.items.length > 0 && (
        <Paper elevation={0}>
          {actionError && <Alert severity="warning" onClose={() => setActionError(null)} sx={{ m: 2, mb: 0 }}>{actionError}</Alert>}
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table aria-label="قائمة الحسابات">
              <TableHead>
                <TableRow>
                  <TableCell>الحساب</TableCell>
                  <TableCell>الهاتف</TableCell>
                  <TableCell>الدور</TableCell>
                  <TableCell>الحالة</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.items.map((user) => (
                  <TableRow key={user.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700 }}>{user.name}</Typography>
                      <Typography variant="caption" color="text.secondary">أُنشئ {formatDateTime(user.createdAt)}</Typography>
                    </TableCell>
                    <TableCell dir="ltr" sx={{ textAlign: 'right' }}>{user.phone}</TableCell>
                    <TableCell>{user.role === 'customer' ? 'عميلة' : user.role === 'expert' ? 'خبيرة' : 'مدير'}</TableCell>
                    <TableCell>
                      <Chip size="small" color={user.isActive ? 'success' : 'default'} label={user.isActive ? 'نشط' : 'معطّل'} />
                    </TableCell>
                    <TableCell align="left">
                      <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                        <Button size="small" component={RouterLink} to={`/users/${user.id}`}>الملف</Button>
                        {user.role !== 'admin' && user.isActive && (
                          <Button size="small" color="error" onClick={() => setDecision({ id: user.id, name: user.name, active: false })}>تعطيل</Button>
                        )}
                        {user.role !== 'admin' && !user.isActive && (
                          <Button size="small" color="success" onClick={() => setDecision({ id: user.id, name: user.name, active: true })}>تفعيل</Button>
                        )}
                      </Stack>
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
      <Dialog open={decision !== null} onClose={() => setDecision(null)} aria-labelledby="user-decision-title">
        <DialogTitle id="user-decision-title">{decision?.active ? 'تأكيد التفعيل' : 'تأكيد التعطيل'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {decision?.active
              ? `سيستعيد ${decision?.name} أهلية الدخول فقط دون تغيير أي بيانات أخرى.`
              : `سيُبطل هذا كل جلسات ${decision?.name} فورًا مع حفظ تاريخ الحساب والحجوزات.`}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDecision(null)}>تراجع</Button>
          <Button variant="contained" color={decision?.active ? 'success' : 'error'} disabled={mutation.isPending}
            onClick={() => decision && mutation.mutate({ id: decision.id, active: decision.active })}>
            تأكيد
          </Button>
        </DialogActions>
      </Dialog>
      <Box sx={{ mt: 2 }}>
        <Typography variant="caption" color="text.secondary">
          أرقام الهواتف ظاهرة للمدير في هذا السياق التشغيلي فقط.
        </Typography>
      </Box>
    </Container>
  );
}
