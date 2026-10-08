import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';

/** SMS port (DLT-registered templates required in India). Used only for OTP fallback and SOS. */
@Injectable()
export class SmsAdapter {
  private readonly log = new Logger('SMS');
  /** Approx cost per SMS in paise, used for metering. */
  readonly costPaise = 18;

  async send(to: string, text: string, dltTemplateId?: string): Promise<{ id: string }> {
    switch (env.SMS_PROVIDER) {
      case 'msg91': {
        const res = await fetch('https://control.msg91.com/api/v5/flow', {
          method: 'POST',
          headers: { authkey: env.SMS_API_KEY!, 'Content-Type': 'application/json' },
          body: JSON.stringify({ template_id: dltTemplateId, short_url: '0', recipients: [{ mobiles: to.replace('+', ''), message: text }] }),
        });
        if (!res.ok) throw new Error(`msg91 ${res.status}`);
        return { id: ((await res.json()) as any).request_id ?? `msg91-${Date.now()}` };
      }
      case 'fast2sms': {
        const res = await fetch('https://www.fast2sms.com/dev/bulkV2', {
          method: 'POST',
          headers: { authorization: env.SMS_API_KEY!, 'Content-Type': 'application/json' },
          body: JSON.stringify({ route: 'dlt', sender_id: env.SMS_SENDER_ID, message: dltTemplateId, variables_values: text, numbers: to.replace('+91', '') }),
        });
        if (!res.ok) throw new Error(`fast2sms ${res.status}`);
        return { id: ((await res.json()) as any).request_id ?? `f2s-${Date.now()}` };
      }
      default:
        this.log.log(`[sms→${to}] ${text}`);
        return { id: `log-${Date.now()}` };
    }
  }
}
