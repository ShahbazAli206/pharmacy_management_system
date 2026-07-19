import { CustomFieldEntityType, CustomFieldType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { badRequest, notFound } from '../utils/httpError';

export interface CustomFieldDefinitionInput {
  entityType: CustomFieldEntityType;
  key: string;
  label: string;
  fieldType?: CustomFieldType;
  options?: string[];
  required?: boolean;
  sortOrder?: number;
}

export interface CustomFieldDefinitionUpdateInput {
  label?: string;
  options?: string[];
  required?: boolean;
  active?: boolean;
  sortOrder?: number;
}

const KEY_RE = /^[a-z][a-z0-9_]*$/;

export async function listDefinitions(entityType: CustomFieldEntityType, activeOnly = false) {
  return prisma.customFieldDefinition.findMany({
    where: { entityType, ...(activeOnly ? { active: true } : {}) },
    orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
  });
}

export async function createDefinition(input: CustomFieldDefinitionInput) {
  if (!KEY_RE.test(input.key)) {
    throw badRequest('key must be lowercase snake_case (e.g. "referred_by")');
  }
  if (input.fieldType === 'SELECT' && (!input.options || input.options.length === 0)) {
    throw badRequest('SELECT fields require at least one option');
  }
  try {
    return await prisma.customFieldDefinition.create({
      data: {
        entityType: input.entityType,
        key: input.key,
        label: input.label,
        fieldType: input.fieldType ?? 'TEXT',
        options: input.options ? JSON.stringify(input.options) : null,
        required: input.required ?? false,
        sortOrder: input.sortOrder ?? 0,
      },
    });
  } catch {
    throw badRequest(`A field with key "${input.key}" already exists for this entity type`);
  }
}

/** Everything except `key`/`entityType` is editable — those are immutable so stored values never get orphaned. */
export async function updateDefinition(id: string, input: CustomFieldDefinitionUpdateInput) {
  const existing = await prisma.customFieldDefinition.findUnique({ where: { id } });
  if (!existing) throw notFound('Custom field definition not found');
  if (existing.fieldType === 'SELECT' && input.options !== undefined && input.options.length === 0) {
    throw badRequest('SELECT fields require at least one option');
  }
  return prisma.customFieldDefinition.update({
    where: { id },
    data: {
      label: input.label,
      options: input.options ? JSON.stringify(input.options) : undefined,
      required: input.required,
      active: input.active,
      sortOrder: input.sortOrder,
    },
  });
}

function coerceValue(def: { key: string; fieldType: CustomFieldType; options: string | null }, value: unknown): unknown {
  switch (def.fieldType) {
    case 'TEXT':
      if (typeof value !== 'string') throw badRequest(`"${def.key}" must be text`);
      return value;
    case 'NUMBER': {
      const n = typeof value === 'number' ? value : Number(value);
      if (Number.isNaN(n)) throw badRequest(`"${def.key}" must be a number`);
      return n;
    }
    case 'DATE': {
      if (typeof value !== 'string') throw badRequest(`"${def.key}" must be a date string`);
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) throw badRequest(`"${def.key}" must be a valid date`);
      return d.toISOString();
    }
    case 'BOOLEAN':
      if (typeof value !== 'boolean') throw badRequest(`"${def.key}" must be true/false`);
      return value;
    case 'SELECT': {
      const opts: string[] = def.options ? JSON.parse(def.options) : [];
      if (typeof value !== 'string' || !opts.includes(value)) {
        throw badRequest(`"${def.key}" must be one of: ${opts.join(', ')}`);
      }
      return value;
    }
    default:
      return value;
  }
}

/**
 * Merges a patch of custom-field values onto the entity's existing values,
 * validating every key against active definitions. Unknown keys are rejected
 * (typos should surface immediately, not silently vanish). `required` is a UI
 * hint only — not retroactively enforced against records predating the field.
 */
export async function mergeCustomFields(
  entityType: CustomFieldEntityType,
  existing: Record<string, unknown>,
  patch: Record<string, unknown> | undefined,
): Promise<Record<string, unknown>> {
  if (!patch) return existing;
  const defs = await listDefinitions(entityType, true);
  const byKey = new Map(defs.map((d) => [d.key, d]));

  const merged = { ...existing };
  for (const [key, value] of Object.entries(patch)) {
    const def = byKey.get(key);
    if (!def) throw badRequest(`Unknown custom field: "${key}"`);
    merged[key] = value === null ? null : coerceValue(def, value);
  }
  return merged;
}
