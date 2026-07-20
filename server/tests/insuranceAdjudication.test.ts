import { describe, it, expect, afterEach } from 'vitest';
import {
  getInsuranceAdjudicationProvider,
  setInsuranceAdjudicationProvider,
  type InsuranceAdjudicationProvider,
} from '../src/services/insuranceAdjudication';

const defaultStub: InsuranceAdjudicationProvider = {
  name: 'stub',
  async submitClaim(req) {
    return { ok: true, claimId: 'reset', payerName: 'Stub Payer', coveredCents: req.costCents };
  },
  async reverseClaim() {
    return { ok: true };
  },
};

describe('Insurance adjudication provider (pluggable)', () => {
  afterEach(() => setInsuranceAdjudicationProvider(defaultStub));

  it('the default stub approves a claim in full', async () => {
    const result = await getInsuranceAdjudicationProvider().submitClaim({ patientId: 'p1', costCents: 4500, idempotencyKey: 'a' });
    expect(result.ok).toBe(true);
    expect(result.coveredCents).toBe(4500);
    expect(result.claimId).toBeTruthy();
  });

  it('the default stub approves a claim reversal', async () => {
    const result = await getInsuranceAdjudicationProvider().reverseClaim('some-claim-id');
    expect(result.ok).toBe(true);
  });

  it('is swappable — a real provider implementation can reject a claim', async () => {
    setInsuranceAdjudicationProvider({
      name: 'fake-payer',
      async submitClaim() {
        return { ok: false, rejectReason: 'coverage expired' };
      },
      async reverseClaim() {
        return { ok: true };
      },
    });
    const result = await getInsuranceAdjudicationProvider().submitClaim({ patientId: 'p1', costCents: 1000, idempotencyKey: 'b' });
    expect(result.ok).toBe(false);
    expect(result.rejectReason).toBe('coverage expired');
  });
});
