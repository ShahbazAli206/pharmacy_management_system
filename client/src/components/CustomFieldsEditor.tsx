import type { CustomFieldDefinition } from '../lib/types';

/**
 * Renders one input per active custom-field definition, driven entirely by
 * server-side metadata (GET /custom-fields/definitions) — adding a field in
 * the Admin console makes it show up here with no client code change.
 */
export function CustomFieldsEditor({
  definitions,
  values,
  onChange,
}: {
  definitions: CustomFieldDefinition[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  const active = definitions.filter((d) => d.active);
  if (active.length === 0) return null;

  return (
    <>
      {active.map((def) => {
        const value = values[def.key];
        const label = `${def.label}${def.required ? ' *' : ''}`;
        switch (def.fieldType) {
          case 'BOOLEAN':
            return (
              <label key={def.id} className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={Boolean(value)}
                  onChange={(e) => onChange(def.key, e.target.checked)}
                />
                {label}
              </label>
            );
          case 'NUMBER':
            return (
              <label key={def.id} className="field">
                {label}
                <input
                  type="number"
                  value={typeof value === 'number' ? value : ''}
                  onChange={(e) => onChange(def.key, e.target.value === '' ? null : Number(e.target.value))}
                />
              </label>
            );
          case 'DATE':
            return (
              <label key={def.id} className="field">
                {label}
                <input
                  type="date"
                  value={typeof value === 'string' ? value.slice(0, 10) : ''}
                  onChange={(e) => onChange(def.key, e.target.value || null)}
                />
              </label>
            );
          case 'SELECT': {
            const options: string[] = def.options ? JSON.parse(def.options) : [];
            return (
              <label key={def.id} className="field">
                {label}
                <select value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(def.key, e.target.value || null)}>
                  <option value="">Select…</option>
                  {options.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </label>
            );
          }
          case 'TEXT':
          default:
            return (
              <label key={def.id} className="field">
                {label}
                <input
                  type="text"
                  value={typeof value === 'string' ? value : ''}
                  onChange={(e) => onChange(def.key, e.target.value || null)}
                />
              </label>
            );
        }
      })}
    </>
  );
}
