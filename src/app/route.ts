import type { AreaId } from '../engine/areas';

export type Route =
  | { page: 'overview' }
  | { page: 'inbox'; filter?: string }
  | { page: 'area'; id: AreaId }
  | { page: 'documents'; filter?: string }
  | { page: 'checks'; id?: string }
  | { page: 'changes'; tab?: 'ledger' | 'versions' | 'whatif' }
  | { page: 'records'; tab?: string }
  | { page: 'review'; tab?: string }
  | { page: 'client'; tab?: string }
  | { page: 'filing'; tab?: string }
  | { page: 'activity' }
  | { page: 'firm'; tab?: string };

const PAGES = ['overview', 'inbox', 'area', 'documents', 'checks', 'changes', 'records', 'review', 'client', 'filing', 'activity', 'firm'];

/** Hash routes use only letters, digits and . _ ~ - so they survive any host (e.g. #area.business). */
export function parseHash(hash: string): Route | null {
  const h = hash.replace(/^#/, '');
  if (!h) return null;
  const [page, arg] = h.split('.', 2).length === 2 ? [h.slice(0, h.indexOf('.')), h.slice(h.indexOf('.') + 1)] : [h, undefined];
  if (!PAGES.includes(page)) return null;
  switch (page) {
    case 'area': return arg ? { page: 'area', id: arg as AreaId } : { page: 'overview' };
    case 'checks': return { page: 'checks', id: arg };
    case 'changes': return { page: 'changes', tab: (arg as 'ledger' | 'versions' | 'whatif') ?? 'ledger' };
    case 'records': case 'review': case 'client': case 'filing': case 'firm':
      return { page, tab: arg } as Route;
    case 'inbox': return { page: 'inbox', filter: arg };
    case 'documents': return { page: 'documents', filter: arg };
    default: return { page } as Route;
  }
}

export function routeToHash(r: Route): string {
  const arg = 'id' in r ? r.id : 'tab' in r ? r.tab : 'filter' in r ? r.filter : undefined;
  return '#' + r.page + (arg ? '.' + arg : '');
}
