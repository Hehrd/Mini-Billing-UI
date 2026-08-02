const ROLE_ADMIN = 'ADMIN'
const ROLE_USER = 'USER'

const currentDate = new Date()

function integerFromEnv(name, fallback) {
  const value = Number(import.meta.env[name])
  return Number.isInteger(value) ? value : fallback
}

export const APP_CONFIG = {
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, ''),
  productName: import.meta.env.VITE_APP_NAME || 'Mini Billing',
  productTagline: import.meta.env.VITE_APP_TAGLINE || 'Utility invoicing control center',
  authStorageKey: import.meta.env.VITE_AUTH_STORAGE_KEY || 'mini-billing-auth',
  themeStorageKey: import.meta.env.VITE_THEME_STORAGE_KEY || 'mini-billing-theme',
  roles: {
    admin: ROLE_ADMIN,
    user: ROLE_USER,
  },
  period: {
    minYear: integerFromEnv('VITE_MIN_BILLING_YEAR', currentDate.getFullYear() - 10),
    maxYear: integerFromEnv('VITE_MAX_BILLING_YEAR', currentDate.getFullYear() + 10),
    defaultYear: integerFromEnv('VITE_DEFAULT_BILLING_YEAR', currentDate.getFullYear()),
    defaultMonth: integerFromEnv('VITE_DEFAULT_BILLING_MONTH', currentDate.getMonth() + 1),
  },
  pageSizes: [10, 20, 50, 100],
}

export const NAV_ITEMS = [
  { id: 'invoices', label: 'Invoices', roles: [ROLE_USER, ROLE_ADMIN] },
  { id: 'readings', label: 'Readings', roles: [ROLE_USER, ROLE_ADMIN] },
  { id: 'reports', label: 'Reports', roles: [ROLE_ADMIN] },
  { id: 'logs', label: 'Logs', roles: [ROLE_ADMIN] },
]

export const MONTH_OPTIONS = Array.from({ length: 12 }, (_, index) => {
  const value = index + 1
  const label = new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(2000, index, 1))
  return { value, label }
})

export function isAdminRole(role) {
  return normalizeRole(role) === APP_CONFIG.roles.admin
}

export function canUseInvoices(role) {
  return hasRole(role, [APP_CONFIG.roles.user, APP_CONFIG.roles.admin])
}

export function hasRole(role, allowedRoles) {
  return allowedRoles.includes(normalizeRole(role))
}

export function normalizeRole(role) {
  return String(role || '')
    .trim()
    .toUpperCase()
    .replace(/^ROLE_/, '')
}
