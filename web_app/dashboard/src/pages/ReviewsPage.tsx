import {
  Box, Button, Container, FormControl, InputLabel, MenuItem, Paper, Select,
  Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';
import { listReviews } from '../api/reviews';
import { EmptyState, ErrorState, LoadingState, PageHeader } from '../components/QueryState';
import { formatDateTime } from '../fmt/format';
import { useI18n } from '../i18n/i18n';

const PAGE_SIZE = 20;
const RATINGS = [5, 4, 3, 2, 1];

function Stars({ value }: { value: number }) {
  const { t } = useI18n();
  return (
    <Typography aria-label={t('التقييم {{value}} من 5', { value })} sx={{ letterSpacing: 2 }}>
      {'★'.repeat(value)}{'☆'.repeat(5 - value)}
    </Typography>
  );
}

export function ReviewsPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);
  const bookingId = searchParams.get('bookingId') ?? '';
  const revieweeId = searchParams.get('revieweeId') ?? '';
  const ratingParam = searchParams.get('rating');
  const rating = ratingParam === null || ratingParam === '' ? 'all' : Number(ratingParam);
  const query = useQuery({
    queryKey: ['admin-reviews', page, bookingId, revieweeId, ratingParam],
    queryFn: () => listReviews({
      page,
      limit: PAGE_SIZE,
      ...(bookingId === '' ? {} : { bookingId }),
      ...(revieweeId === '' ? {} : { revieweeId }),
      ...(rating === 'all' || !Number.isInteger(rating) ? {} : { rating: rating as number }),
    }),
  });
  const update = (next: { page?: number; bookingId?: string; revieweeId?: string; rating?: string }) => {
    const params = new URLSearchParams();
    const nextPage = next.page ?? page;
    if (nextPage > 1) params.set('page', String(nextPage));
    const nextBooking = next.bookingId ?? bookingId;
    if (nextBooking !== '') params.set('bookingId', nextBooking);
    const nextReviewee = next.revieweeId ?? revieweeId;
    if (nextReviewee !== '') params.set('revieweeId', nextReviewee);
    const nextRating = next.rating ?? (ratingParam ?? '');
    if (nextRating !== '') params.set('rating', nextRating);
    setSearchParams(params);
  };

  return (
    <Container maxWidth="xl" sx={{ py: { xs: 3, md: 4 } }}>
      <PageHeader title={t('التقييمات')} subtitle={t('قراءة فقط؛ لا تعديل ولا حذف من اللوحة.')} />
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
        <TextField
          label={t('معرف الحجز')}
          defaultValue={bookingId}
          onBlur={(event) => update({ bookingId: event.target.value.trim(), page: 1 })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') update({ bookingId: (event.target as HTMLInputElement).value.trim(), page: 1 });
          }}
          slotProps={{ htmlInput: { dir: 'ltr' } }}
          sx={{ minWidth: 220 }}
        />
        <TextField
          label={t('معرف المُقيَّم')}
          defaultValue={revieweeId}
          onBlur={(event) => update({ revieweeId: event.target.value.trim(), page: 1 })}
          onKeyDown={(event) => {
            if (event.key === 'Enter') update({ revieweeId: (event.target as HTMLInputElement).value.trim(), page: 1 });
          }}
          slotProps={{ htmlInput: { dir: 'ltr' } }}
          sx={{ minWidth: 220 }}
        />
        <FormControl sx={{ minWidth: 140 }}>
          <InputLabel id="rating-filter-label">{t('الدرجة')}</InputLabel>
          <Select
            labelId="rating-filter-label"
            label={t('الدرجة')}
            value={ratingParam ?? ''}
            onChange={(event) => update({ rating: event.target.value, page: 1 })}
          >
            <MenuItem value="">{t('الكل')}</MenuItem>
            {RATINGS.map((value) => (
              <MenuItem key={value} value={String(value)}>{t('{{value}} نجوم', { value })}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>
      {query.isLoading && <LoadingState label={t('جارٍ تحميل التقييمات')} />}
      {query.error && <ErrorState error={query.error} onRetry={() => void query.refetch()} />}
      {query.data && query.data.items.length === 0 && (
        <EmptyState title={t('لا توجد تقييمات بهذه الفلاتر')} hint={t('غيّري الفلاتر أو انتظري اكتمال حجوزات جديدة.')} />
      )}
      {query.data && query.data.items.length > 0 && (
        <Paper elevation={0}>
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table aria-label={t('قائمة التقييمات')}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('الدرجة')}</TableCell>
                  <TableCell>{t('الأطراف')}</TableCell>
                  <TableCell>{t('التعليق')}</TableCell>
                  <TableCell>{t('التاريخ')}</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {query.data.items.map((review) => (
                  <TableRow key={review.id} hover>
                    <TableCell><Stars value={review.rating} /></TableCell>
                    <TableCell>
                      <Typography variant="body2">{review.reviewerName} ← {review.revieweeName}</Typography>
                      <Typography variant="caption" color="text.secondary">{review.serviceName ?? '—'}</Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 320 }}>{review.comment ?? '—'}</TableCell>
                    <TableCell>{formatDateTime(review.createdAt)}</TableCell>
                    <TableCell align="left">
                      <Button size="small" component={RouterLink} to={`/bookings/${review.bookingId}`}>{t('الحجز')}</Button>
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
          {t('التقييمات للقراءة والمراجعة فقط؛ أي إجراء moderation يحتاج سياسة وAPI معتمدين.')}
        </Typography>
      </Box>
    </Container>
  );
}
