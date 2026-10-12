import { apiRequest } from './client';

export interface OverviewRange {
  from: string;
  to: string;
  timeZone: string;
}

export interface CountRow {
  status: string;
  count: number;
}

export interface MoneyRow {
  status?: string;
  transferred?: boolean;
  currency: string;
  total: string;
  count: number;
}

export interface OverviewSummary {
  range: OverviewRange;
  bookings: CountRow[];
  payments: MoneyRow[];
  payouts: MoneyRow[];
  reviews: { count: number; average: string | null };
  users: Array<{ role: string; count: number }>;
  outbox: CountRow[];
  worker: {
    tickAt: string;
    expired: number;
    claimed: number;
    sent: number;
    retried: number;
    cleaned: number;
  } | null;
}

export function getOverview(from?: string, to?: string) {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  const query = params.toString();
  return apiRequest<OverviewSummary>(`/api/v1/admin/overview${query ? `?${query}` : ''}`);
}
