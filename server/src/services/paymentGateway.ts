import crypto from 'crypto';

/**
 * Card payment processing — pluggable provider interface (spec §7/§14:
 * "Cash, debit, credit card payment processing (Moneris or Square
 * integration)"). Unlike OCR/storage/notifications, there was no existing
 * interface for this at all — POS previously just recorded a payment method
 * string with no actual gateway call. This ships the adapter layer + a stub
 * that "approves" every charge so the POS flow is real and testable without
 * merchant credentials; swap in a real Moneris/Square client via
 * setPaymentGatewayProvider() once those credentials exist.
 *
 * Cash and insurance payment methods never call this — cash has no gateway,
 * and insurance goes through claims adjudication instead (see
 * services/insuranceAdjudication.ts).
 */

export interface ChargeRequest {
  amountCents: number;
  currency: string;
  /** Our own Sale id — lets a real gateway dedupe a retried request instead of double-charging. */
  idempotencyKey: string;
}

export interface RefundGatewayRequest {
  originalTransactionId: string;
  amountCents: number;
  idempotencyKey: string;
}

export interface GatewayResult {
  ok: boolean;
  transactionId?: string;
  error?: string;
}

export interface PaymentGatewayProvider {
  readonly name: string;
  charge(req: ChargeRequest): Promise<GatewayResult>;
  refund(req: RefundGatewayRequest): Promise<GatewayResult>;
}

class StubPaymentGatewayProvider implements PaymentGatewayProvider {
  readonly name = 'stub';

  async charge(_req: ChargeRequest): Promise<GatewayResult> {
    return { ok: true, transactionId: `STUB-CHG-${crypto.randomBytes(8).toString('hex')}` };
  }

  async refund(_req: RefundGatewayRequest): Promise<GatewayResult> {
    return { ok: true, transactionId: `STUB-REF-${crypto.randomBytes(8).toString('hex')}` };
  }
}

let provider: PaymentGatewayProvider = new StubPaymentGatewayProvider();
export const getPaymentGateway = () => provider;
export const setPaymentGatewayProvider = (p: PaymentGatewayProvider) => {
  provider = p;
};
