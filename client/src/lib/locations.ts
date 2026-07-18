import { api } from './api';
import type { OwnerOverview } from './types';

export interface LocationOption {
  id: string;
  name: string;
  code: string;
}

/**
 * Locations the current user may target. Owners get every pharmacy (for
 * location-scoped actions like raising a workflow or importing patients);
 * non-owners are pinned to their own location by the API and don't need this.
 */
export async function fetchLocations(): Promise<LocationOption[]> {
  const overview = await api<OwnerOverview>('/dashboard/owner');
  return overview.locations.map((l) => ({ id: l.id, name: l.name, code: l.code }));
}
