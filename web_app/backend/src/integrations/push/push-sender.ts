import { AppError } from '../../shared/app-error.js';

export interface PushMessage {
  tokens: string[];
  title: string;
  body: string;
  /** Booking id only. Addresses, phones and amounts never reach a push provider. */
  data?: Record<string, string>;
}

export interface PushSender {
  readonly mode?: 'demo' | 'push';
  send(message: PushMessage): Promise<void>;
}

// Explicit presentation adapter: nothing leaves the process and no delivery is claimed.
export class DemoPushSender implements PushSender {
  readonly mode = 'demo' as const;
  async send(): Promise<void> { /* Demo delivery is intentionally simulated. */ }
}

// Keeps the unavailable path until a real provider is connected and approved.
export class UnconfiguredPushSender implements PushSender {
  async send(): Promise<void> {
    throw new AppError(503, 'PUSH_DELIVERY_UNAVAILABLE', 'إرسال الإشعارات غير متاح حاليًا');
  }
}

export type PushMode = 'demo' | 'disabled';

export function createPushSender(mode: PushMode): PushSender {
  return mode === 'demo' ? new DemoPushSender() : new UnconfiguredPushSender();
}
