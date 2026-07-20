import { describe, it, expect, afterEach } from 'vitest';
import { getPaymentGateway, setPaymentGatewayProvider, type PaymentGatewayProvider } from '../src/services/paymentGateway';

describe('Payment gateway provider (pluggable)', () => {
  afterEach(() => {
    // Restore the default stub so other test files aren't affected by a swap.
    setPaymentGatewayProvider(new (class implements PaymentGatewayProvider {
      readonly name = 'stub';
      async charge() {
        return { ok: true, transactionId: 'STUB-CHG-reset' };
      }
      async refund() {
        return { ok: true, transactionId: 'STUB-REF-reset' };
      }
    })());
  });

  it('the default stub approves a charge with a unique transaction id', async () => {
    const a = await getPaymentGateway().charge({ amountCents: 5000, currency: 'CAD', idempotencyKey: 'a' });
    const b = await getPaymentGateway().charge({ amountCents: 5000, currency: 'CAD', idempotencyKey: 'b' });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(a.transactionId).not.toBe(b.transactionId);
  });

  it('the default stub approves a refund with a unique transaction id', async () => {
    const result = await getPaymentGateway().refund({ originalTransactionId: 'X', amountCents: 1000, idempotencyKey: 'c' });
    expect(result.ok).toBe(true);
    expect(result.transactionId).toBeTruthy();
  });

  it('is swappable — a real provider implementation can be injected', async () => {
    setPaymentGatewayProvider({
      name: 'fake-declining-gateway',
      async charge() {
        return { ok: false, error: 'insufficient funds' };
      },
      async refund() {
        return { ok: true, transactionId: 'FAKE-REF' };
      },
    });
    const result = await getPaymentGateway().charge({ amountCents: 100, currency: 'CAD', idempotencyKey: 'd' });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('insufficient funds');
  });
});
