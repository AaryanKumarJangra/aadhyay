/**
 * Permission format: module.resource.action  (actions: view | create | edit | delete | approve | export | print | manage)
 * Wildcards: "*" (all), "fees.*" (whole module), "fees.payment.*" (all actions on a resource).
 */
export const ACTIONS = ['view', 'create', 'edit', 'delete', 'approve', 'export', 'print', 'manage'] as const;
export type Action = (typeof ACTIONS)[number];

/**
 * Segment-wise match. "*" in the middle stands for exactly one segment ("fees.*.view" grants "fees.receipt.view"
 * but not "fees.receipt.edit"); a trailing "*" stands for one or more segments ("fees.*" grants everything in fees).
 */
export function permissionMatches(granted: string, required: string): boolean {
  if (granted === '*' || granted === required) return true;
  const g = granted.split('.'), r = required.split('.');
  for (let i = 0; i < g.length; i++) {
    const last = i === g.length - 1;
    if (g[i] === '*') {
      if (last) return r.length > i; // trailing wildcard: needs at least one more segment
      if (r[i] === undefined) return false;
      continue;
    }
    if (g[i] !== r[i]) return false;
  }
  return g.length === r.length;
}

export function hasPermission(granted: Iterable<string>, required: string): boolean {
  for (const g of granted) if (permissionMatches(g, required)) return true;
  return false;
}
