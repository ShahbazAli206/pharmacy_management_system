import { env } from '../config/env';

/**
 * OpenAPI 3.0 description of the API. Hand-authored (no codegen dependency) and
 * focused on the Phase-1 surface — authentication (incl. MFA + password reset),
 * patient records and their allergy/condition sub-resources, dashboards, and
 * health. Later-phase route groups are listed as tags; their paths can be
 * documented incrementally as those modules stabilize.
 */
export function buildOpenApiSpec() {
  const bearer = [{ bearerAuth: [] }];

  const errorResponse = {
    description: 'Error',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/Error' },
      },
    },
  };

  return {
    openapi: '3.0.3',
    info: {
      title: 'Pharmacy Management System API',
      version: '1.0.0',
      description:
        'Multi-location pharmacy platform. All data endpoints require a Bearer ' +
        'JWT (see /auth/login). Access is enforced by a DB-backed permission ' +
        'matrix (RBAC) and location isolation — non-owners are scoped to their ' +
        'assigned pharmacy at the API layer and, for patient data, at the ' +
        'database layer via row-level security.',
    },
    servers: [{ url: `http://localhost:${env.PORT}/api`, description: 'Local' }],
    tags: [
      { name: 'Health', description: 'Liveness/readiness' },
      { name: 'Auth', description: 'Login, tokens, MFA, password reset' },
      { name: 'Patients', description: 'Patient records + allergy/condition sub-resources' },
      { name: 'Dashboards', description: 'Owner-consolidated and per-location overviews' },
      { name: 'Other modules', description: 'Inventory, prescriptions, POS, compliance, narcotics, finance, cameras, messaging, reports, admin — Bearer-authenticated and permission-gated.' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'FORBIDDEN' },
                message: { type: 'string' },
              },
            },
          },
        },
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email', example: 'owner@pharmacy.ca' },
            password: { type: 'string', format: 'password', example: 'ChangeMe123!' },
            mfaToken: { type: 'string', description: 'Required only when the account has MFA enabled', example: '123456' },
          },
        },
        LoginResponse: {
          type: 'object',
          properties: {
            accessToken: { type: 'string' },
            refreshToken: { type: 'string' },
            user: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                firstName: { type: 'string' },
                lastName: { type: 'string' },
                role: { type: 'string', example: 'SYSTEM_OWNER' },
                pharmacyId: { type: 'string', nullable: true },
                mfaEnabled: { type: 'boolean' },
                permissions: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
        MfaSetupResponse: {
          type: 'object',
          properties: {
            secret: { type: 'string', description: 'Base32 TOTP secret' },
            otpauthUrl: { type: 'string', description: 'otpauth:// URI to render as a QR code' },
          },
        },
        Patient: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            pharmacyId: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            dateOfBirth: { type: 'string', format: 'date-time' },
            gender: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'] },
            healthCard: { type: 'string', nullable: true, description: 'Decrypted for authorized readers; AES-256-GCM at rest' },
            insurancePlan: { type: 'string', nullable: true },
            allergies: { type: 'array', items: { $ref: '#/components/schemas/Allergy' } },
            conditions: { type: 'array', items: { $ref: '#/components/schemas/Condition' } },
          },
        },
        PatientInput: {
          type: 'object',
          required: ['firstName', 'lastName', 'dateOfBirth', 'gender'],
          properties: {
            pharmacyId: { type: 'string', description: 'Owner only; non-owners are scoped to their location' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            dateOfBirth: { type: 'string', example: '1980-01-01' },
            gender: { type: 'string', enum: ['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'] },
            healthCard: { type: 'string', nullable: true },
            insurancePlan: { type: 'string', nullable: true },
          },
        },
        Allergy: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            patientId: { type: 'string' },
            substance: { type: 'string' },
            reaction: { type: 'string', nullable: true },
            severity: { type: 'string', enum: ['LOW', 'MODERATE', 'HIGH', 'SEVERE'] },
          },
        },
        AllergyInput: {
          type: 'object',
          required: ['substance'],
          properties: {
            substance: { type: 'string' },
            reaction: { type: 'string', nullable: true },
            severity: { type: 'string', enum: ['LOW', 'MODERATE', 'HIGH', 'SEVERE'] },
          },
        },
        Condition: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            patientId: { type: 'string' },
            name: { type: 'string' },
            diagnosis: { type: 'string', nullable: true },
          },
        },
        ConditionInput: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            diagnosis: { type: 'string', nullable: true },
          },
        },
      },
    },
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Liveness probe',
          security: [],
          responses: { 200: { description: 'Service is up' } },
        },
      },
      '/auth/login': {
        post: {
          tags: ['Auth'],
          summary: 'Authenticate; returns access + refresh tokens',
          security: [],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
          },
          responses: {
            200: { description: 'Authenticated', content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginResponse' } } } },
            401: { description: 'Invalid credentials, or MFA_REQUIRED when a code is needed', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
          },
        },
      },
      '/auth/refresh': {
        post: {
          tags: ['Auth'],
          summary: 'Rotate the refresh token; returns a new token pair',
          security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } } } },
          responses: { 200: { description: 'New token pair' }, 401: errorResponse },
        },
      },
      '/auth/logout': {
        post: {
          tags: ['Auth'],
          summary: 'Revoke a refresh token',
          security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['refreshToken'], properties: { refreshToken: { type: 'string' } } } } } },
          responses: { 204: { description: 'Revoked' } },
        },
      },
      '/auth/me': {
        get: {
          tags: ['Auth'],
          summary: 'Current user profile + live permissions',
          security: bearer,
          responses: { 200: { description: 'Profile' }, 401: errorResponse },
        },
      },
      '/auth/mfa/setup': {
        post: {
          tags: ['Auth'],
          summary: 'Begin TOTP enrolment (returns secret + otpauth URL)',
          security: bearer,
          responses: { 200: { description: 'Secret issued', content: { 'application/json': { schema: { $ref: '#/components/schemas/MfaSetupResponse' } } } }, 401: errorResponse },
        },
      },
      '/auth/mfa/enable': {
        post: {
          tags: ['Auth'],
          summary: 'Confirm TOTP enrolment with a valid code',
          security: bearer,
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['token'], properties: { token: { type: 'string', example: '123456' } } } } } },
          responses: { 204: { description: 'MFA enabled' }, 400: errorResponse },
        },
      },
      '/auth/mfa/disable': {
        post: {
          tags: ['Auth'],
          summary: 'Disable MFA (requires a current valid code)',
          security: bearer,
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['token'], properties: { token: { type: 'string' } } } } } },
          responses: { 204: { description: 'MFA disabled' }, 400: errorResponse },
        },
      },
      '/auth/password/forgot': {
        post: {
          tags: ['Auth'],
          summary: 'Request a password-reset email (always 204; no account enumeration)',
          security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } } } } },
          responses: { 204: { description: 'Processed (whether or not the email exists)' } },
        },
      },
      '/auth/password/reset': {
        post: {
          tags: ['Auth'],
          summary: 'Complete a password reset with an emailed token',
          security: [],
          requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['token', 'newPassword'], properties: { token: { type: 'string' }, newPassword: { type: 'string', minLength: 8 } } } } } },
          responses: { 204: { description: 'Password changed; all sessions revoked' }, 400: errorResponse },
        },
      },
      '/patients': {
        get: {
          tags: ['Patients'],
          summary: 'List patients (location-scoped; owner may pass pharmacyId)',
          security: bearer,
          parameters: [
            { name: 'search', in: 'query', schema: { type: 'string' } },
            { name: 'pharmacyId', in: 'query', schema: { type: 'string' }, description: 'Owner only' },
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'pageSize', in: 'query', schema: { type: 'integer', default: 25, maximum: 100 } },
          ],
          responses: { 200: { description: 'Paged patient list' }, 403: errorResponse },
        },
        post: {
          tags: ['Patients'],
          summary: 'Create a patient (patient:write)',
          security: bearer,
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PatientInput' } } } },
          responses: { 201: { description: 'Created', content: { 'application/json': { schema: { $ref: '#/components/schemas/Patient' } } } }, 403: errorResponse },
        },
      },
      '/patients/{id}': {
        get: {
          tags: ['Patients'],
          summary: 'Get a patient by id (location-checked)',
          security: bearer,
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: { 200: { description: 'Patient', content: { 'application/json': { schema: { $ref: '#/components/schemas/Patient' } } } }, 403: errorResponse, 404: errorResponse },
        },
        patch: {
          tags: ['Patients'],
          summary: 'Update a patient (patient:write)',
          security: bearer,
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/PatientInput' } } } },
          responses: { 200: { description: 'Updated' }, 403: errorResponse, 404: errorResponse },
        },
      },
      '/patients/{id}/allergies': {
        post: {
          tags: ['Patients'],
          summary: 'Add an allergy/ADR to a patient',
          security: bearer,
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/AllergyInput' } } } },
          responses: { 201: { description: 'Added', content: { 'application/json': { schema: { $ref: '#/components/schemas/Allergy' } } } }, 403: errorResponse, 404: errorResponse },
        },
      },
      '/patients/{id}/allergies/{allergyId}': {
        delete: {
          tags: ['Patients'],
          summary: 'Remove an allergy',
          security: bearer,
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'allergyId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { 204: { description: 'Removed' }, 403: errorResponse, 404: errorResponse },
        },
      },
      '/patients/{id}/conditions': {
        post: {
          tags: ['Patients'],
          summary: 'Add a chronic condition to a patient',
          security: bearer,
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ConditionInput' } } } },
          responses: { 201: { description: 'Added', content: { 'application/json': { schema: { $ref: '#/components/schemas/Condition' } } } }, 403: errorResponse, 404: errorResponse },
        },
      },
      '/patients/{id}/conditions/{conditionId}': {
        delete: {
          tags: ['Patients'],
          summary: 'Remove a chronic condition',
          security: bearer,
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'conditionId', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: { 204: { description: 'Removed' }, 403: errorResponse, 404: errorResponse },
        },
      },
      '/dashboard/owner': {
        get: {
          tags: ['Dashboards'],
          summary: 'Consolidated owner overview across all locations (dashboard:owner)',
          security: bearer,
          responses: { 200: { description: 'Overview' }, 403: errorResponse },
        },
      },
      '/dashboard/location': {
        get: {
          tags: ['Dashboards'],
          summary: 'Single-location dashboard (dashboard:location)',
          security: bearer,
          parameters: [{ name: 'pharmacyId', in: 'query', schema: { type: 'string' }, description: 'Owner may inspect a specific location' }],
          responses: { 200: { description: 'Location overview' }, 403: errorResponse },
        },
      },
    },
  };
}
