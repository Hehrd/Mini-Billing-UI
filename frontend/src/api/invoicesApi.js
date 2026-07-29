const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:6969').replace(/\/$/, '')

async function request(path, options = {}) {
  let response
  const method = options.method || 'GET'
  const requestedAt = new Date().toISOString()
  const isFormData = options.body instanceof FormData

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      headers: {
        Accept: 'application/json',
        ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
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

export function importSourceFile({ sourceType, file, year, month }) {
  const formData = new FormData()
  formData.append('files', file)
  formData.append('sourceType', sourceType)

  if (year) {
    formData.append('periodYear', String(year))
  }
  if (month) {
    formData.append('periodMonth', String(month))
  }

  return request('/api/import', {
    method: 'POST',
    body: formData,
  })
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

export function startBillingRun(year, month) {
  return request('/api/billing/runs', {
    method: 'POST',
    body: JSON.stringify(toBillingRunRequest(year, month)),
  })
}

export function stopBillingRun(runId) {
  return request(`/api/billing/runs/${encodeURIComponent(runId)}/stop`, { method: 'POST' })
}

export function resumeBillingRun(runId) {
  return request(`/api/billing/runs/${encodeURIComponent(runId)}/resume`, { method: 'POST' })
}

export function restartBillingRun(runId) {
  return request(`/api/billing/runs/${encodeURIComponent(runId)}/restart`, { method: 'POST' })
}

export function getBillingRun(runId) {
  return request(`/api/billing/runs/${encodeURIComponent(runId)}`)
}

function toBillingRunRequest(year, month) {
  const shortYear = String(Number(year) % 100).padStart(2, '0')
  const paddedMonth = String(Number(month)).padStart(2, '0')
  const period = `${shortYear}-${paddedMonth}`

  return {
    periodStart: period,
    periodEnd: period,
  }
}

export function getInvoice(documentNumber) {
  return request(`/api/invoices/${encodeURIComponent(documentNumber)}`)
}

export async function downloadInvoice(documentNumber) {
  let response

  try {
    response = await fetch(`${API_BASE_URL}/api/invoices/${encodeURIComponent(documentNumber)}/download`, {
      headers: { Accept: 'application/json' },
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
