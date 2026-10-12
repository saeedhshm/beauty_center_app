import { zodResolver } from '@hookform/resolvers/zod';
import AddRounded from '@mui/icons-material/AddRounded';
import {
  Alert, Box, Button, Chip, Container, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Stack, Switch, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, Typography, Paper,
} from '@mui/material';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { ApiError } from '../api/client';
import { createService, listServices, updateService } from '../api/services';
import type { Service } from '../api/types';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import { describeApiError } from '../fmt/format';

const serviceSchema = z.object({
  name: z.string().trim().min(2, 'الاسم من حرفين على الأقل').max(100),
  description: z.string().trim().max(2000).nullable().optional(),
  durationMin: z.coerce.number().int().min(1, 'المدة دقيقة واحدة على الأقل').max(1440),
  isActive: z.boolean().default(true),
});

function ServiceDialog({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const editing = service !== null && service.id !== 0;
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.input<typeof serviceSchema>>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: service?.name ?? '',
      description: service?.description ?? null,
      durationMin: service?.durationMin ?? 60,
      isActive: service?.isActive ?? true,
    },
  });
  const mutation = useMutation({
    mutationFn: (values: z.input<typeof serviceSchema>) => {
      const payload: { name: string; description?: string | null; durationMin: number; isActive?: boolean } = {
        name: values.name,
        durationMin: values.durationMin,
      };
      if (values.description !== undefined) payload.description = values.description;
      if (values.isActive !== undefined) payload.isActive = values.isActive;
      return editing ? updateService(service!.id, payload) : createService({
        name: payload.name,
        description: payload.description ?? null,
        durationMin: payload.durationMin,
        isActive: payload.isActive ?? true,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-services'] });
      onClose();
    },
    onError: (cause) => {
      setServerError(cause instanceof ApiError ? describeApiError(cause.code, cause.message) : 'تعذر حفظ الخدمة.');
    },
  });
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="service-dialog-title">
      <DialogTitle id="service-dialog-title">{editing ? 'تعديل الخدمة' : 'خدمة جديدة'}</DialogTitle>
      <Box component="form" onSubmit={handleSubmit((values: z.input<typeof serviceSchema>) => mutation.mutate(values))} noValidate>
        <DialogContent>
          <Stack spacing={2.5} sx={{ pt: 1 }}>
            {serverError && <Alert severity="error">{serverError}</Alert>}
            <Controller name="name" control={control} render={({ field }) => (
              <TextField {...field} label="اسم الخدمة" autoFocus error={Boolean(errors.name)} helperText={errors.name?.message} />
            )} />
            <Controller name="description" control={control} render={({ field }) => (
              <TextField {...field} value={field.value ?? ''} onChange={(event) => field.onChange(event.target.value === '' ? null : event.target.value)} label="الوصف (اختياري)" multiline rows={3} error={Boolean(errors.description)} helperText={errors.description?.message} />
            )} />
            <Controller name="durationMin" control={control} render={({ field }) => (
              <TextField {...field} label="المدة بالدقائق" type="number" slotProps={{ htmlInput: { min: 1, max: 1440 } }} error={Boolean(errors.durationMin)} helperText={errors.durationMin?.message ?? 'تطبق على الحجوزات الجديدة فقط، واللقطات التاريخية لا تتغير'} />
            )} />
            <Controller name="isActive" control={control} render={({ field }) => (
              <FormControlLabel control={<Switch {...field} checked={field.value} />} label={field.value ? 'نشطة وقابلة للاكتشاف' : 'معطلة (تُخفى عن الكتالوج دون حذف التاريخ)'} />
            )} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>إلغاء</Button>
          <Button type="submit" variant="contained" disabled={isSubmitting || mutation.isPending}>حفظ</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

const PAGE_SIZE = 20;

export function ServicesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [dialog, setDialog] = useState<{ open: boolean; service: Service | null }>({ open: false, service: null });
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const query = useQuery({
    queryKey: ['admin-services', page],
    queryFn: () => listServices({ page, limit: PAGE_SIZE }),
  });

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader
        title="الخدمات"
        subtitle="إدارة كتالوج القاهرة. التعطيل يُخفي الخدمة دون مسح تاريخ الحجوزات."
        actions={<Button variant="contained" startIcon={<AddRounded />} onClick={() => setDialog({ open: true, service: null })}>خدمة جديدة</Button>}
      />
      {query.isLoading && <LoadingState label="جارٍ تحميل الخدمات" />}
      {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState title="لا توجد خدمات بعد" hint="أنشئي أول خدمة لتبدأ الخبيرات بعرض أسعارها." />
      )}
      {query.data && query.data.items.length > 0 && (
        <Paper elevation={0}>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table aria-label="قائمة الخدمات">
              <TableHead>
                <TableRow>
                  <TableCell>الخدمة</TableCell>
                  <TableCell>المدة</TableCell>
                  <TableCell>الحالة</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.items.map((service) => (
                  <TableRow key={service.id} hover>
                    <TableCell>
                      <Typography sx={{ fontWeight: 700 }}>{service.name}</Typography>
                      <Typography variant="caption" color="text.secondary">#{service.id}</Typography>
                    </TableCell>
                    <TableCell>{service.durationMin} دقيقة</TableCell>
                    <TableCell>
                      <Chip size="small" color={service.isActive ? 'success' : 'default'} label={service.isActive ? 'نشطة' : 'معطلة'} />
                    </TableCell>
                    <TableCell align="left">
                      <Button size="small" onClick={() => setDialog({ open: true, service })}>تعديل</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Stack direction="row" spacing={1} sx={{ p: 2, justifyContent: 'flex-start' }}>
            <Button disabled={page <= 1} onClick={() => setSearchParams(page > 2 ? { page: String(page - 1) } : {})}>السابق</Button>
            <Typography sx={{ alignSelf: 'center' }} aria-live="polite">صفحة {page}</Typography>
            <Button disabled={!query.data.pagination.hasNext} onClick={() => setSearchParams({ page: String(page + 1) })}>التالي</Button>
          </Stack>
        </Paper>
      )}
      {dialog.open && <ServiceDialog service={dialog.service} onClose={() => setDialog({ open: false, service: null })} />}
    </Container>
  );
}
