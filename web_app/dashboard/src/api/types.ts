export interface AdminUser {
  id: string;
  name: string;
  phone: string;
  role: 'admin';
  phoneVerified: boolean;
}

export interface AdminSession {
  user: AdminUser;
  tokenType: 'Bearer';
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

export interface ApiEnvelope<T> {
  data: T;
  requestId: string;
}

export interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    fields?: Record<string, string[]>;
  };
  requestId?: string;
}

export interface PageEnvelope<T> {
  items: T[];
  pagination: { page: number; limit: number; hasNext: boolean };
}

export interface Service {
  id: number;
  name: string;
  description: string | null;
  durationMin: number;
  isActive: boolean;
}

export interface ServiceInput {
  name: string;
  description?: string | null;
  durationMin: number;
  isActive?: boolean;
}

export type ApprovalStatus = 'pending' | 'approved' | 'suspended';

export interface AdminExpert {
  id: string;
  name: string;
  cityId: number | null;
  cityName: string | null;
  bio: string | null;
  ratingAvg: string;
  ratingCount: number;
  phone: string;
  isActive: boolean;
  approvalStatus: ApprovalStatus;
  isAcceptingBookings: boolean;
}

export interface ExpertPrice {
  serviceId: number;
  name?: string;
  price: string;
  currency: string;
  isActive: boolean;
  durationMin?: number;
}

export interface PortfolioItem {
  id: string;
  serviceId: number | null;
  sortOrder: number;
  url: string;
}

export interface AdminExpertDetail extends AdminExpert {
  services: ExpertPrice[];
  portfolio: PortfolioItem[];
  identityDocument: { present: boolean };
}

export type BookingStatus =
  | 'pending' | 'accepted' | 'confirmed' | 'completed'
  | 'rejected' | 'cancelled' | 'expired';

export interface Booking {
  id: string;
  customerId: string;
  expertId: string;
  serviceId: number;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  expiresAt: string | null;
  addressText: string;
  cityId: number;
  lat: string | null;
  lng: string | null;
  price: string;
  commissionRate: string;
  commissionAmount: string;
  expertEarning: string;
  vatRate: string;
  vatAmount: string;
  totalAmount: string;
  currency: string;
  notes: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StatusChange {
  id: string;
  status: BookingStatus;
  changedBy: string | null;
  createdAt: string;
}

export interface BookingDetail extends Booking {
  statusHistory: StatusChange[];
}

export type AccountRole = 'customer' | 'expert' | 'admin';

export interface ManagedUser {
  id: string;
  name: string;
  phone: string;
  role: AccountRole;
  cityId: number | null;
  cityName: string | null;
  isActive: boolean;
  phoneVerified: boolean;
  ratingAvg: string;
  ratingCount: number;
  createdAt: string;
}

export interface Review {
  id: string;
  bookingId: string;
  reviewerId: string;
  revieweeId: string;
  rating: number;
  comment: string | null;
  serviceName: string | null;
  reviewerName: string;
  revieweeName: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  details: unknown;
  createdAt: string;
}
