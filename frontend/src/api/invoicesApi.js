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
  return request('/api/file/import', { method: 'POST' })
}

export function getHealth() {
  return request('/api/billing/health')
}

function normalizePage(response) {
  if (Array.isArray(response)) {
    return { content: response, totalElements: response.length, number: 0, size: response.length, totalPages: 1 }
  }

  return {
    content: Array.isArray(response?.content) ? response.content : [],
    totalElements: Number(response?.totalElements || 0),
    number: Number(response?.number || 0),
    size: Number(response?.size || 0),
    totalPages: Number(response?.totalPages || 0),
    first: Boolean(response?.first),
    last: Boolean(response?.last),
  }
}

function withPageParams({ page = 0, size = 50, sort, ...filters } = {}) {
  const params = new URLSearchParams()
  params.set('page', page)
  params.set('size', size)
  if (sort) {
    params.set('sort', sort)
  }
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, value)
    }
  })
  return params.toString()
}

export async function getInvoices({ userId, page = 0, size = 100, sort = 'documentDate,desc' } = {}) {
  const query = withPageParams({ page, size, sort, userId })
  const response = await request(`/api/billing/invoices?${query}`)
  return normalizePage(response).content
}

export function generateInvoices(year, month) {
  return request('/api/billing/generate', {
    method: 'POST',
    body: JSON.stringify({ year: Number(year), month: Number(month) }),
  })
}

export async function getInvoice(documentNumber) {
  const invoices = await getInvoices()
  const invoice = invoices.find((item) => item.documentNumber === documentNumber)
  if (!invoice) {
    throw createApiError({
      title: 'Invoice not found',
      description: `Invoice ${documentNumber} is not visible to the current user.`,
      kind: 'validation',
      status: 404,
      method: 'GET',
      path: `/api/billing/invoices?documentNumber=${encodeURIComponent(documentNumber)}`,
      requestedAt: new Date().toISOString(),
    })
  }
  return invoice
}

export async function downloadInvoice(documentNumber) {
  try {
    const invoice = await getInvoice(documentNumber)
    const blob = new Blob([buildInvoicePdf(invoice)], { type: 'application/pdf' })
    return { blob, fileName: `${documentNumber}.pdf` }
  } catch (error) {
    if (error.status) {
      throw error
    }
    throw createApiError({
      title: 'Backend unavailable',
      description: 'The invoice PDF export could not be prepared.',
      kind: 'connection',
      method: 'GET',
      path: `/api/billing/invoices`,
      requestedAt: new Date().toISOString(),
    })
  }
}

function buildInvoicePdf(invoice) {
  const lines = [
    `Invoice ${invoice.documentNumber || ''}`,
    `Document date: ${invoice.documentDate || ''}`,
    `Customer: ${invoice.consumer || ''}`,
    `Reference: ${invoice.reference || ''}`,
    `Total amount: ${invoice.totalAmount || 0}`,
    '',
    'Lines:',
    ...(invoice.lines || []).slice(0, 24).map((line) => {
      return `${line.product || ''} | quantity ${line.quantity || ''} | price ${line.unitPrice || line.price || ''} | amount ${line.amount || ''}`
    }),
  ]

  const content = [
    'BT',
    '/F1 12 Tf',
    '50 790 Td',
    ...lines.flatMap((line, index) => [
      index === 0 ? '/F1 18 Tf' : '/F1 10 Tf',
      `(${escapePdfText(line)}) Tj`,
      index === 0 ? '/F1 10 Tf' : '',
      '0 -18 Td',
    ]).filter(Boolean),
    'ET',
  ].join('\n')

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
  ]

  let pdf = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object) => {
    offsets.push(pdf.length)
    pdf += object
  })
  const xrefOffset = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  })
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return pdf
}

function escapePdfText(value) {
  return String(value).replace(/[\\()]/g, '\\$&')
}

export async function getBillingRuns({ page = 0, size = 20, sort = 'startedAt,desc' } = {}) {
  return normalizePage(await request(`/api/billing/runs?${withPageParams({ page, size, sort })}`))
}

export function getBillingRunReport(runId) {
  return request(`/api/reports/billing-runs/${encodeURIComponent(runId)}`)
}

export async function getAuditLogs({ page = 0, size = 50, sort = 'occurredAt,desc' } = {}) {
  return normalizePage(await request(`/api/audit/logs?${withPageParams({ page, size, sort })}`))
}

export async function getErrorLogs({ page = 0, size = 50, sort = 'occurredAt,desc' } = {}) {
  return normalizePage(await request(`/api/audit/errors?${withPageParams({ page, size, sort })}`))
}
