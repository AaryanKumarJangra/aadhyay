import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { env } from '../../config/env';
import { safeEqual } from '../../common/crypto';

export interface GatewayCreds { keyId: string; keySecret: string; webhookSecret?: string }
export interface Order { id: string; amountPaise: number; currency: 'INR'; keyId: string; checkoutUrl?: string }

/**
 * Payment port. Money for fees always settles into the INSTITUTION's merchant account (their own Razorpay keys),
 * never Aadhyay's (RBI payment-aggregator rules). Aadhyay's own keys are used only for Aadhyay's invoices & wallet.
 */
@Injectable()
export class PaymentsAdapter {
  private readonly log = new Logger('Payments');
  platformCreds(): GatewayCreds {
    return { keyId: env.RAZORPAY_KEY_ID ?? 'rzp_log', keySecret: env.RAZORPAY_KEY_SECRET ?? 'log', webhookSecret: env.RAZORPAY_WEBHOOK_SECRET };
  }
  private live(c: GatewayCreds) {
    return env.PAYMENT_PROVIDER === 'razorpay' && c.keyId !== 'rzp_log';
  }

  async createOrder(c: GatewayCreds, amountPaise: number, receipt: string, notes: Record<string, string>): Promise<Order> {
    if (!this.live(c)) {
      this.log.log(`[order] ₹${amountPaise / 100} ${receipt}`);
      return { id: `order_log_${Date.now()}`, amountPaise, currency: 'INR', keyId: c.keyId };
    }
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(`${c.keyId}:${c.keySecret}`).toString('base64'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt: receipt.slice(0, 40), notes }),
    });
    const j = (await res.json()) as any;
    if (!res.ok) throw new Error(`razorpay ${res.status}: ${j?.error?.description}`);
    return { id: j.id, amountPaise: j.amount, currency: 'INR', keyId: c.keyId };
  }

  /** Checkout success callback signature: HMAC_SHA256(order_id|payment_id, key_secret). */
  verifyCheckout(c: GatewayCreds, orderId: string, paymentId: string, signature: string): boolean {
    if (!this.live(c)) return signature === 'log';
    const exp = createHmac('sha256', c.keySecret).update(`${orderId}|${paymentId}`).digest('hex');
    return safeEqual(exp, signature);
  }
  verifyWebhook(c: GatewayCreds, rawBody: string, signature: string | undefined): boolean {
    if (!this.live(c)) return true;
    if (!signature || !c.webhookSecret) return false;
    return safeEqual(createHmac('sha256', c.webhookSecret).update(rawBody).digest('hex'), signature);
  }
}
