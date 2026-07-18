import { authenticator } from 'otplib';

/**
 * TOTP (RFC 6238) multi-factor authentication. The spec mandates MFA for all
 * roles; this is the verification primitive. Secrets are generated here and
 * stored field-level-encrypted on the User (see auth.service). A ±1 step
 * window tolerates minor clock drift between the server and authenticator app.
 */
authenticator.options = { window: 1 };

const ISSUER = 'Pharmacy PMS';

/** Generate a fresh base32 TOTP secret to bind to a user's authenticator app. */
export function generateMfaSecret(): string {
  return authenticator.generateSecret();
}

/** otpauth:// URI the client renders as a QR code for enrolment. */
export function mfaKeyUri(accountName: string, secret: string): string {
  return authenticator.keyuri(accountName, ISSUER, secret);
}

/** Verify a 6-digit TOTP code against the user's secret. */
export function verifyMfaToken(secret: string, token: string): boolean {
  try {
    return authenticator.check(token, secret);
  } catch {
    // otplib throws on malformed input (e.g. non-numeric); treat as invalid.
    return false;
  }
}
