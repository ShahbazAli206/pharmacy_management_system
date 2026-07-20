import crypto from 'crypto';

/**
 * Real-time insurance claims adjudication — pluggable provider interface
 * (spec §7/§14: "Provincial drug plans... Private insurance adjudication via
 * Telus Health"). Like the payment gateway, no interface existed for this at
 * all before — an INSURANCE-method sale was previously just marked complete
 * with no actual claim, silently assuming 100% coverage. Ships the adapter
 * layer + a stub that approves every claim in full, so the POS flow is real
 * and testable without a payer connection; swap in a real TELUS Health
 * eClaims (or a provincial plan) client via setInsuranceAdjudicationProvider()
 * once that connection exists.
 */

export interface ClaimRequest {
  patientId: string;
  costCents: number;
  idempotencyKey: string;
}

export interface ClaimResult {
  ok: boolean;
  claimId?: string;
  payerName?: string;
  /** How much of costCents the payer covers; the rest is patient-pay. */
  coveredCents?: number;
  rejectReason?: string;
}

export interface ReversalResult {
  ok: boolean;
  error?: string;
}

export interface InsuranceAdjudicationProvider {
  readonly name: string;
  submitClaim(req: ClaimRequest): Promise<ClaimResult>;
  reverseClaim(claimId: string): Promise<ReversalResult>;
}

class StubInsuranceAdjudicationProvider implements InsuranceAdjudicationProvider {
  readonly name = 'stub';

  async submitClaim(req: ClaimRequest): Promise<ClaimResult> {
    return {
      ok: true,
      claimId: `STUB-CLAIM-${crypto.randomBytes(8).toString('hex')}`,
      payerName: 'Stub Payer (no real adjudicator configured)',
      coveredCents: req.costCents, // approves in full
    };
  }

  async reverseClaim(_claimId: string): Promise<ReversalResult> {
    return { ok: true };
  }
}

let provider: InsuranceAdjudicationProvider = new StubInsuranceAdjudicationProvider();
export const getInsuranceAdjudicationProvider = () => provider;
export const setInsuranceAdjudicationProvider = (p: InsuranceAdjudicationProvider) => {
  provider = p;
};
