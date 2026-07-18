import { RoleName } from '@prisma/client';

/** Authenticated request context attached by the auth middleware. */
export interface AuthContext {
  userId: string;
  role: RoleName;
  locationId: string | null; // null for SYSTEM_OWNER
  permissions: Set<string>;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
