import { APP_CONFIG, normalizeRole } from '../config/appConfig.js'

const API_BASE_URL = APP_CONFIG.apiBaseUrl
const AUTH_STORAGE_KEY = APP_CONFIG.authStorageKey

export function readStoredAuth() {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const session = JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY))
    return session ? { ...session, role: normalizeRole(session.role) } : null
  } catch {
    return null
  }
}

export function storeAuthSession(session) {
  if (typeof window === 'undefined') {
    return
  }
  const persistedSession = session
    ? {
        username: session.username,
        role: normalizeRole(session.role),
        reference: session.reference,
      }
    : null
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(persistedSession))
}

export function clearAuthSession() {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.removeItem(AUTH_STORAGE_KEY)
}

async function request(path, options = {}) {
  let response
  const method = options.method || 'GET'
  const requestedAt = new Date().toISOString()

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
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

  return readJsonOrNull(response)
}

async function readError(response, context) {
  const data = await readJsonOrNull(response)
  const description = toErrorDescription(response.status, data)
  return createApiError({
    title: toErrorTitle(response.status, data),
    description,
    kind: toErrorKind(response.status),
    status: response.status,
    serverTitle: data?.title,
    reason: data?.reason || data?.detail || description,
    errors: Array.isArray(data?.errors) ? data.errors : undefined,
    ...context,
  })
}

async function readJsonOrNull(response) {
  const text = await response.text()
  if (!text.trim()) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return { detail: text }
  }
}

function toErrorDescription(status, data) {
  if (Array.isArray(data?.errors) && data.errors.length) {
    return data.errors.join('\n')
  }
  if (data?.detail || data?.reason || data?.title || data?.message) {
    return data.detail || data.reason || data.title || data.message
  }
  if (status === 401) {
    return 'Please sign in again. Your session may have expired.'
  }
  if (status === 403) {
    return 'Your account is signed in, but it is not allowed to perform this action.'
  }
  if (status === 404) {
    return 'The requested resource was not found.'
  }
  if (status >= 500) {
    return 'The backend failed while processing the request. Check the server logs for the exact cause.'
  }
  return `The request failed with HTTP ${status}.`
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

function toErrorKind(status) {
  if (status === 401) {
    return 'authentication'
  }
  if (status === 403) {
    return 'authorization'
  }
  if (status === 400 || status === 422) {
    return 'validation'
  }
  if (status >= 500) {
    return 'server'
  }
  return 'request'
}

function createApiError({ title, description, kind, status, method, path, requestedAt, serverTitle, reason, errors }) {
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
    errors,
  }
  return error
}

export async function login({ username, password }) {
  const response = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })

  return {
    username: response.username,
    role: normalizeRole(response.role),
    reference: response.reference,
  }
}

function appendFileEntries(formData, entries) {
  entries.forEach((entry, index) => {
    formData.append(`files[${index}].type`, entry.type)
    formData.append(`files[${index}].file`, entry.file)
  })
}

export async function importCsvFiles({ usersFile, readingsFile, priceFiles, uploadedBy }) {
  const entries = [
    ...(usersFile ? [{ type: 'USERS', file: usersFile }] : []),
    ...(readingsFile ? [{ type: 'READINGS', file: readingsFile }] : []),
    ...Array.from(priceFiles || []).map((file) => ({ type: 'PRICES', file })),
  ]

  if (!entries.length) {
    throw createApiError({
      title: 'No files selected',
      description: 'Select at least one users, readings, or prices file to import.',
      kind: 'validation',
      method: 'POST',
      path: '/api/file/import',
      requestedAt: new Date().toISOString(),
    })
  }

  const formData = new FormData()
  formData.append('uploadedBy', uploadedBy)
  appendFileEntries(formData, entries)

  await request('/api/file/import', {
    method: 'POST',
    body: formData,
    headers: {},
  })

  return {
    importedUsers: usersFile ? 1 : 0,
    importedReadings: readingsFile ? 1 : 0,
    importedPrices: priceFiles?.length || 0,
  }
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

export async function getInvoices({ reference, page = 0, size = 100, sort = 'dateTime,desc' } = {}) {
  const query = withPageParams({ page, size, sort, reference })
  const response = await request(`/api/billing/invoices?${query}`)
  return normalizePage(response).content.map(normalizeInvoice)
}

export async function getReadings({ reference, page = 0, size = 200, sort = 'dateTime,desc' } = {}) {
  const query = withPageParams({ page, size, sort, reference })
  return normalizePage(await request(`/api/billing/readings?${query}`)).content
}

export async function getReadingSelfReports({ reference, page = 0, size = 100, sort = 'requestedAt,desc' } = {}) {
  const query = withPageParams({ page, size, sort, reference })
  return normalizePage(await request(`/api/billing/readings/self-reports?${query}`)).content
}

export function createReadingSelfReport({ date, service, amount }) {
  return request('/api/billing/readings/self-reports', {
    method: 'POST',
    body: JSON.stringify({ date, service, amount: Number(amount) }),
  })
}

export function acceptReadingSelfReport(requestId) {
  return request(`/api/billing/readings/self-reports/${encodeURIComponent(requestId)}/accept`, {
    method: 'POST',
  })
}

export function denyReadingSelfReport(requestId) {
  return request(`/api/billing/readings/self-reports/${encodeURIComponent(requestId)}/deny`, {
    method: 'POST',
  })
}

export function startBillingRun({ startDate, endDate, reference }) {
  return request('/api/billing/runs', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate, reference }),
  })
}

export function stopBillingRun(runId) {
  return request(`/api/billing/runs/${encodeURIComponent(runId)}/stop`, {
    method: 'POST',
  })
}

export function resumeBillingRun(runId) {
  return request(`/api/billing/runs/${encodeURIComponent(runId)}/resume`, {
    method: 'POST',
  })
}

export function restartBillingRun(runId) {
  return request(`/api/billing/runs/${encodeURIComponent(runId)}/restart`, {
    method: 'POST',
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
  const invoiceLines = (invoice.lines || []).slice(0, 8)
  const invoiceDate = formatPdfDate(invoice.documentDate)
  const period = formatPdfPeriod(invoice)
  const subtotal = Number(invoice.totalAmount || 0)
  const vatAmount = (invoice.vat || []).reduce((sum, entry) => sum + Number(entry.amount || 0), 0)
  const grandTotal = Number(invoice.totalAmountWithVat ?? invoice.totalAmount ?? 0)
  const content = [
    '1 1 1 rg 0 0 612 792 re f',
    '0.83 0.24 0.29 rg 144 702 m 144 710 151 717 159 717 c 167 717 174 710 174 702 c 174 694 167 687 159 687 c 151 687 144 694 144 702 c f',
    text('m', 149, 692, { size: 24, font: 'F2', color: '1 1 1' }),
    text('methodia', 96, 669, { size: 22, font: 'F2', color: '0.42 0.44 0.46' }),
    text('INVOICE', 96, 612, { size: 55, font: 'F2' }),
    text('Bill To:', 441, 684, { size: 12, font: 'F2' }),
    text(fitPdfText(invoice.consumer || 'Name/Company Name', 24), 441, 664, { size: 12 }),
    text(`Reference: ${invoice.reference || ''}`, 441, 644, { size: 12 }),
    text('Customer account', 441, 624, { size: 12 }),
    text('Billing contact', 441, 604, { size: 12 }),
    text('Bill From:', 441, 562, { size: 12, font: 'F2' }),
    text('Methodia', 441, 542, { size: 12 }),
    text('Mini Billing', 441, 522, { size: 12 }),
    text('billing@methodia.com', 441, 502, { size: 12 }),
    text('Sofia, Bulgaria', 441, 482, { size: 12 }),
    text('Invoice #:', 88, 540, { size: 12 }),
    text(invoice.documentNumber || '', 205, 540, { size: 12 }),
    text('Due Date:', 88, 518, { size: 12 }),
    text(invoiceDate, 205, 518, { size: 12 }),
    text('Invoice Date:', 88, 496, { size: 12 }),
    text(invoiceDate, 205, 496, { size: 12 }),
    text('Invoice Period:', 88, 474, { size: 12 }),
    text(period, 205, 474, { size: 12 }),
    '0 0 0 rg 78 420 470 25 re f',
    text('Product', 88, 431, { size: 12, font: 'F2', color: '1 1 1' }),
    text('Period', 197, 431, { size: 12, font: 'F2', color: '1 1 1' }),
    text('Price', 340, 431, { size: 12, font: 'F2', color: '1 1 1' }),
    text('Quantity', 420, 431, { size: 12, font: 'F2', color: '1 1 1' }),
    text('Total', 515, 431, { size: 12, font: 'F2', color: '1 1 1' }),
    ...invoiceLines.flatMap((line, index) => invoiceLinePdfOps(line, 400 - index * 22)),
    ...emptyInvoiceRows(invoiceLines.length),
    '0 0 0 RG 0.8 w 431 198 m 576 198 l S',
    '0 0 0 RG 0.8 w 431 179 m 576 179 l S',
    '0 0 0 rg 431 137 145 22 re f',
    text('Subtotal:', 441, 184, { size: 12 }),
    text(formatPdfAmount(subtotal), 523, 184, { size: 10 }),
    text('VAT', 441, 165, { size: 12 }),
    text(formatPdfAmount(vatAmount), 523, 165, { size: 10 }),
    text('Grand Total', 441, 145, { size: 10, font: 'F2', color: '1 1 1' }),
    text(formatPdfAmount(grandTotal), 523, 145, { size: 9, font: 'F2', color: '1 1 1' }),
    text('Notes:', 88, 102, { size: 12, font: 'F2' }),
    text('Thank you for your business.', 88, 84, { size: 9 }),
    text('Terms & Conditions:', 88, 32, { size: 12, font: 'F2' }),
    text('Payment is due according to the agreed billing terms.', 88, 14, { size: 9 }),
  ].join('\n')

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
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

function invoiceLinePdfOps(line, y) {
  return [
    '0 0 0 RG 0.8 w 78 ' + (y - 7) + ' m 548 ' + (y - 7) + ' l S',
    text(fitPdfText(formatProductName(line.product), 16), 88, y, { size: 10 }),
    text(fitPdfText(formatLinePeriod(line), 20), 197, y, { size: 10 }),
    text(formatPdfAmount(line.unitPrice ?? line.price ?? 0), 355, y, { size: 10 }),
    text(fitPdfText(`${formatPdfNumber(line.quantity)} ${line.unit || ''}`, 16), 420, y, { size: 10 }),
    text(formatPdfAmount(line.amount ?? 0), 525, y, { size: 10 }),
  ]
}

function emptyInvoiceRows(count) {
  return Array.from({ length: Math.max(0, 8 - count) }, (_, index) => {
    const y = 400 - (count + index) * 22
    return '0 0 0 RG 0.8 w 78 ' + (y - 7) + ' m 548 ' + (y - 7) + ' l S'
  })
}

function text(value, x, y, { size = 10, font = 'F1', color = '0 0 0' } = {}) {
  return `BT ${color} rg /${font} ${size} Tf ${x} ${y} Td (${escapePdfText(value)}) Tj ET`
}

function formatProductName(product) {
  return String(product || 'Product')
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatPdfDate(value) {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return String(value).slice(0, 10)
  }
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatPdfPeriod(invoice) {
  const datedLines = (invoice.lines || []).filter((line) => line.start || line.end)
  if (!datedLines.length) {
    return ''
  }
  return `${formatPdfDate(datedLines[0].start)} - ${formatPdfDate(datedLines[datedLines.length - 1].end)}`
}

function formatLinePeriod(line) {
  if (!line.start && !line.end) {
    return ''
  }
  return `${formatPdfDate(line.start)}-${formatPdfDate(line.end)}`
}

function formatPdfMoney(value) {
  const number = Number(value)
  return Number.isFinite(number) ? `EUR ${number.toFixed(2)}` : String(value || '')
}

function formatPdfAmount(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toFixed(2) : String(value || '')
}

function formatPdfNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number.toLocaleString('en-GB', { maximumFractionDigits: 2 }) : String(value || '')
}

function fitPdfText(value, maxLength) {
  const textValue = String(value || '')
  return textValue.length > maxLength ? `${textValue.slice(0, maxLength - 1)}.` : textValue
}

function normalizeInvoice(invoice = {}) {
  const lines = Array.isArray(invoice.lines) ? invoice.lines.map(normalizeInvoiceLine) : []
  const vat = Array.isArray(invoice.vat) ? invoice.vat.map(normalizeVatEntry) : []
  const totalAmount = toNumberOrValue(invoice.totalAmount)
  const totalAmountWithVat = toNumberOrValue(invoice.totalAmountWithVat ?? invoice.totalAmount)

  return {
    ...invoice,
    totalAmount,
    totalAmountWithVat,
    lines,
    vat,
    linesCount: invoice.linesCount ?? lines.length,
  }
}

function normalizeInvoiceLine(line = {}) {
  const start = line.start ?? line.lineStart
  const end = line.end ?? line.lineEnd
  const referencedLines = Array.isArray(line.lines) ? line.lines : []

  return {
    ...line,
    lines: referencedLines,
    quantity: toNumberOrValue(line.quantity),
    price: toNumberOrValue(line.price ?? line.unitPrice),
    unitPrice: toNumberOrValue(line.unitPrice ?? line.price),
    amount: toNumberOrValue(line.amount),
    unit: line.unit || defaultUnit(line.product),
    start,
    end,
    lineStart: start,
    lineEnd: end,
  }
}

function normalizeVatEntry(entry = {}) {
  return {
    ...entry,
    lines: Array.isArray(entry.lines) ? entry.lines : [],
    percentage: toNumberOrValue(entry.percentage),
    amount: toNumberOrValue(entry.amount),
  }
}

function toNumberOrValue(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : value
}

function defaultUnit(product) {
  return String(product || '').toLowerCase() === 'standing_charge' ? 'days' : 'kW/h'
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
  return normalizePage(await request(`/api/logs/audit?${withPageParams({ page, size, sort })}`))
}

export async function getErrorLogs({ page = 0, size = 50, sort = 'occurredAt,desc' } = {}) {
  return normalizePage(await request(`/api/logs/errors?${withPageParams({ page, size, sort })}`))
}
