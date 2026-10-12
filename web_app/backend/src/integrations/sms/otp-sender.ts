import { AppError } from '../../shared/app-error.js';
import type { AuthConfig } from '../../modules/auth/auth.config.js';

export const DEMO_OTP_CODE = '123456';

export interface OtpSender {
  readonly mode?: 'demo' | 'sms';
  generateCode?(): string;
  sendRegistrationCode(input: { phone: string; code: string; expiresInSeconds: number }): Promise<void>;
}

// Explicit presentation adapter: no SMS and no proof of phone ownership.
export class DemoOtpSender implements OtpSender {
  readonly mode = 'demo' as const;
  generateCode() { return DEMO_OTP_CODE; }
  async sendRegistrationCode(): Promise<void> { /* Demo delivery is intentionally simulated. */ }
}

// Preserve the unavailable path for disabling the demonstration before a real provider is connected.
export class UnconfiguredOtpSender implements OtpSender {
  async sendRegistrationCode(): Promise<void> {
    throw new AppError(503, 'OTP_DELIVERY_UNAVAILABLE', 'إرسال رمز التحقق غير متاح حاليًا');
  }
}

export function createOtpSender(config: AuthConfig): OtpSender {
  return config.AUTH_OTP_MODE === 'demo' ? new DemoOtpSender() : new UnconfiguredOtpSender();
}
