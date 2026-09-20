/**
 * The buyer company's own mark, shown beside Farq's while they are signed in.
 *
 * Keyed by the account the server reports (`scope_owner_user_id`), not by an
 * email domain: colleagues of one company sign in with different addresses, and
 * the company's owner may use another domain entirely.
 *
 * The artwork is placed in the company's own colours. Their identity is theirs;
 * we never recolour it to match our interface. `mark` is the circular monogram
 * for the header, `logo` the full lockup for the places that have room for it.
 */
export type AccountBrand = { name: string; mark: string; logo: string; aspect: string }

const BRANDS: Record<string, AccountBrand> = {
  '44cdaadd-e084-4654-a84b-a95e6c920580': {
    name: 'شركة الدفع للتجارة والمقاولات',
    mark: '/brand/aldafe-mark.png',
    logo: '/brand/aldafe-logo.png',
    aspect: '1/1',
  },
}

export function accountBrand(accountId?: string | null): AccountBrand | null {
  const key = String(accountId || '').toLowerCase()
  return BRANDS[key] || null
}
