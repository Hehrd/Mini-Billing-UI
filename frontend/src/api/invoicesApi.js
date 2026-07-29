const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:6969').replace(/\/$/, '')
const AUTH_STORAGE_KEY = 'mini-billing-auth'

let accessToken = readStoredAuth()?.token || null

export function setAccessToken(token) {
  accessToken = token || null
}

export function readStoredAuth() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY))
  } catch {
    return null
  }
}

export function storeAuthSession(session) {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
  setAccessToken(session?.token)
}

export function clearAuthSession() {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem(AUTH_STORAGE_KEY)
  setAccessToken(null)
}

async function request(path, options = {}) {
  let response
  const method = options.method || 'GET'
  const requestedAt = new Date().toISOString()

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      ...options,
    })
  } catch {
    throw createApiError({
      title: 'Backend unavailable',
      description: 'The request could not reach the Mini Billing API.',
      kind: 'connection',
      method,
      path,
      requestedAt,
    })
  }

  if (!response.ok) {
    throw await readError(response, { method, path, requestedAt })
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

async function readError(response, context) {
  try {
    const data = await response.json()
    return createApiError({
      title: toErrorTitle(response.status, data),
      description: data.detail || data.reason || data.title || `Request failed with status ${response.status}.`,
      kind: response.status === 422 || response.status === 400 ? 'validation' : 'server',
      status: response.status,
      serverTitle: data.title,
      reason: data.reason,
      ...context,
    })
  } catch {
    return createApiError({
      title: toErrorTitle(response.status),
      description: `Request failed with status ${response.status}.`,
      kind: response.status >= 500 ? 'server' : 'validation',
      status: response.status,
      ...context,
    })
  }
}

function toErrorTitle(status, data = {}) {
  if (status === 400 || status === 422) {
    return data.title || 'Request validation failed'
  }
  if (status === 404) {
    return data.title || 'Resource not found'
  }
  if (status === 401) {
    return data.title || 'Authentication required'
  }
  if (status === 403) {
    return data.title || 'Access denied'
  }
  if (status >= 500) {
    return 'Backend error'
  }
  return data.title || 'Request failed'
}

function createApiError({ title, description, kind, status, method, path, requestedAt, serverTitle, reason }) {
  const error = new Error(description)
  error.title = title
  error.description = description
  error.kind = kind
  error.status = status
  error.endpoint = `${method} ${path}`
  error.requestedAt = requestedAt
  error.technicalDetails = {
    endpoint: error.endpoint,
    status: status || 'network',
    category: kind,
    serverTitle,
    reason,
  }
  return error
}

export async function login({ username, password }) {
  const response = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })

  return {
    token: response.token,
    tokenType: response.tokenType || 'Bearer',
    username: response.username,
    role: response.role,
    reference: response.reference,
  }
}

export function importCsvFiles() {
  return request('/api/import', { method: 'POST' })
}

export function getHealth() {
  return request('/api/billing/health')
}

export function getInvoices({ year, month } = {}) {
  const params = new URLSearchParams()
  if (year) {
    params.set('year', year)
  }
  if (month) {
    params.set('month', month)
  }

  const query = params.toString()
  return request(`/api/invoices${query ? `?${query}` : ''}`)
}

export function generateInvoices(year, month) {
  return request('/api/invoices/generate', {
    method: 'POST',
    body: JSON.stringify({ year: Number(year), month: Number(month) }),
  })
}

export function getInvoice(documentNumber) {
  return request(`/api/invoices/${encodeURIComponent(documentNumber)}`)
}

export async function downloadInvoice(documentNumber) {
  let response

  try {
    response = await fetch(`${API_BASE_URL}/api/invoices/${encodeURIComponent(documentNumber)}/download`, {
      headers: {
        Accept: 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    })
  } catch {
    throw createApiError({
      title: 'Backend unavailable',
      description: 'The invoice download request could not reach the Mini Billing API.',
      kind: 'connection',
      method: 'GET',
      path: `/api/invoices/${encodeURIComponent(documentNumber)}/download`,
      requestedAt: new Date().toISOString(),
    })
  }

  if (!response.ok) {
    throw await readError(response, {
      method: 'GET',
      path: `/api/invoices/${encodeURIComponent(documentNumber)}/download`,
      requestedAt: new Date().toISOString(),
    })
  }

  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') || ''
  const fileName = extractFileName(disposition) || `${documentNumber}.json`
  return { blob, fileName }
}

function extractFileName(contentDisposition) {
  const encodedMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (encodedMatch) {
    return decodeURIComponent(encodedMatch[1].replace(/"/g, ''))
  }

  const match = contentDisposition.match(/filename="?([^"]+)"?/i)
  return match?.[1]
}
