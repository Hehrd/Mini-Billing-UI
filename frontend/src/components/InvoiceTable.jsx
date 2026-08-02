import { useMemo, useState } from 'react'
import Button from './ui/Button.jsx'
import Card from './ui/Card.jsx'
import EmptyState from './ui/EmptyState.jsx'
import ErrorAlert from './ui/ErrorAlert.jsx'
import Skeleton from './ui/Skeleton.jsx'
import { formatMoney, formatNumber } from '../utils/formatters.js'
import { APP_CONFIG, isAdminRole } from '../config/appConfig.js'

const PAGE_SIZE_OPTIONS = APP_CONFIG.pageSizes

function InvoiceTable({
  invoices,
  errorLogs = [],
  isLoading,
  error,
  selectedPeriod,
  user,
  onRefresh,
  onView,
  onDownload,
  onStartImport,
  onClearError,
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: 'documentNumber', direction: 'asc' })
  const [pageSize, setPageSize] = useState(10)
  const [page, setPage] = useState(1)
  const [density, setDensity] = useState('comfortable')

  const filteredInvoices = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const searched = normalizedQuery
      ? invoices.filter((invoice) =>
          [invoice.documentNumber, invoice.consumer, invoice.reference]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
        )
      : invoices

    return [...searched].sort((left, right) => compareInvoices(left, right, sort))
  }, [invoices, query, sort])
  const errorsByCustomer = useMemo(() => {
    return errorLogs.reduce((groups, log) => {
      if (!log.customerId) {
        return groups
      }
      groups[log.customerId] = [...(groups[log.customerId] || []), log]
      return groups
    }, {})
  }, [errorLogs])

  const totalPages = Math.max(1, Math.ceil(filteredInvoices.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const visibleInvoices = filteredInvoices.slice((safePage - 1) * pageSize, safePage * pageSize)
  const hasFilters = Boolean(query.trim())
  const isEmpty = !isLoading && invoices.length === 0
  const hasNoResults = !isLoading && invoices.length > 0 && filteredInvoices.length === 0
  const canStartImport = isAdminRole(user?.role) && typeof onStartImport === 'function'

  function updateSort(key) {
    setSort((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }))
  }

  function clearFilters() {
    setQuery('')
    setPage(1)
  }

  function handleSearch(value) {
    setQuery(value)
    setPage(1)
  }

  return (
    <Card className={`table-card invoice-register density-${density}`}>
      <div className="register-header">
        <div>
          <p className="eyebrow">Invoices</p>
          <h2>Invoice register</h2>
          <p>
            {isLoading
              ? 'Refreshing invoice data...'
              : `${formatNumber(filteredInvoices.length)} of ${formatNumber(invoices.length)} invoices loaded${
                  !isAdminRole(user?.role) ? ' for your customer account' : ''
                }`}
          </p>
        </div>
        <div className="register-count">
          <span>Period</span>
          <strong>{selectedPeriod}</strong>
        </div>
      </div>

      <div className="table-toolbar" aria-label="Invoice table controls">
        <label className="search-field">
          <span>Search invoices</span>
          <input
            type="search"
            value={query}
            onChange={(event) => handleSearch(event.target.value)}
            placeholder="Document, customer or user ID"
          />
        </label>

        <label className="toolbar-field">
          <span>Rows</span>
          <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
            {PAGE_SIZE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <label className="toolbar-field">
          <span>Density</span>
          <select value={density} onChange={(event) => setDensity(event.target.value)}>
            <option value="comfortable">Comfortable</option>
            <option value="compact">Compact</option>
          </select>
        </label>

        <div className="toolbar-actions">
          <Button variant="secondary" type="button" onClick={clearFilters} disabled={!hasFilters}>
            Clear filters
          </Button>
          <Button variant="secondary" type="button" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? 'Refreshing' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error && <ErrorAlert error={error} onRetry={onRefresh} onDismiss={onClearError} />}

      {isLoading && invoices.length === 0 ? (
        <SkeletonTable />
      ) : isEmpty ? (
        <EmptyState
          icon={<InvoiceEmptyIcon />}
          title="No invoices for this period"
          description={
            isAdminRole(user?.role)
              ? `Import source files, configure ${selectedPeriod}, then generate invoices to populate the register.`
              : `No invoices are available for your account in ${selectedPeriod}.`
          }
          action={canStartImport ? (
            <Button type="button" onClick={onStartImport}>
              Go to import workflow
            </Button>
          ) : null}
        />
      ) : hasNoResults ? (
        <EmptyState
          icon="⌕"
          title="No matching invoices"
          description="Your search filters removed every loaded invoice from the current view."
          action={
            <Button variant="secondary" type="button" onClick={clearFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <div className="table-wrap invoice-table-wrap">
            <table>
              <caption className="sr-only">Invoices loaded for {selectedPeriod}</caption>
              <thead>
                <tr>
                  <SortableHeader label="Document number" column="documentNumber" sort={sort} onSort={updateSort} />
                  <SortableHeader label="Customer" column="consumer" sort={sort} onSort={updateSort} />
                  <SortableHeader label="Reference" column="reference" sort={sort} onSort={updateSort} />
                  <th>Status</th>
                  <th>Billing period</th>
                  <SortableHeader label="Lines" column="linesCount" sort={sort} onSort={updateSort} />
                  <SortableHeader label="Total amount" column="totalAmount" sort={sort} onSort={updateSort} />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleInvoices.map((invoice) => {
                  const invoiceStatus = getInvoiceStatus(invoice, errorsByCustomer[invoice.reference])
                  return (
                  <tr
                    className="invoice-row"
                    key={invoice.documentNumber}
                    tabIndex={0}
                    onDoubleClick={() => onView(invoice.documentNumber)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        onView(invoice.documentNumber)
                      }
                    }}
                  >
                    <td>
                      <button
                        className="document-link"
                        type="button"
                        onClick={() => onView(invoice.documentNumber)}
                      >
                        {invoice.documentNumber}
                      </button>
                    </td>
                    <td>{invoice.consumer}</td>
                    <td>{invoice.reference}</td>
                    <td>
                      <div className="status-cell">
                        <span className={`status-chip status-${invoiceStatus.tone}`}>{invoiceStatus.label}</span>
                        {invoiceStatus.indicators.map((indicator) => (
                          <span className={`indicator-dot indicator-${indicator.tone}`} key={indicator.label} title={indicator.label}>
                            {indicator.short}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>{selectedPeriod}</td>
                    <td>{invoice.linesCount ?? '—'}</td>
                    <td className="amount-cell">{formatMoney(invoice.totalAmount)}</td>
                    <td>
                      <div className="row-actions">
                        <Button variant="ghost" size="sm" type="button" onClick={() => onView(invoice.documentNumber)}>
                          View
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          type="button"
                          onClick={() => onDownload(invoice.documentNumber)}
                        >
                          Download PDF
                        </Button>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="pagination-bar" aria-label="Invoice pagination">
            <span>
              Page {safePage} of {totalPages}
            </span>
            <div>
              <Button variant="secondary" size="sm" type="button" onClick={() => setPage(1)} disabled={safePage === 1}>
                First
              </Button>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={safePage === 1}
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                type="button"
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={safePage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}

function getInvoiceStatus(invoice, customerErrors = []) {
  const openErrors = customerErrors.filter((error) => error.status === 'OPEN')
  const hasCritical = openErrors.some((error) => error.severity === 'CRITICAL')
  const hasWarning = openErrors.some((error) => error.severity === 'WARNING')
  const missingLines = Number(invoice.linesCount ?? invoice.lines?.length ?? 0) === 0

  if (hasCritical || missingLines) {
    return {
      label: 'Manual review',
      tone: 'danger',
      indicators: [{ label: hasCritical ? 'Critical error logged' : 'No invoice lines', short: 'MR', tone: 'danger' }],
    }
  }

  if (hasWarning || openErrors.length > 0) {
    return {
      label: 'Warning',
      tone: 'warning',
      indicators: [{ label: 'Open warning or error log for this customer', short: 'W', tone: 'warning' }],
    }
  }

  return { label: 'Ready', tone: 'success', indicators: [{ label: 'No open indicators', short: 'OK', tone: 'success' }] }
}

function SortableHeader({ label, column, sort, onSort }) {
  const active = sort.key === column
  return (
    <th>
      <button className="sort-button" type="button" onClick={() => onSort(column)}>
        {label}
        <span aria-hidden="true">{active ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
      </button>
    </th>
  )
}

function SkeletonTable() {
  return (
    <div className="table-skeleton" aria-label="Loading invoices">
      {Array.from({ length: 5 }, (_, index) => (
        <div className="table-skeleton-row" key={index}>
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      ))}
    </div>
  )
}

function InvoiceEmptyIcon() {
  return (
    <svg className="empty-svg" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M18 10h22l8 8v36H18z" />
      <path d="M40 10v9h8" />
      <path d="M24 29h18M24 37h18M24 45h10" />
    </svg>
  )
}

function compareInvoices(left, right, sort) {
  const multiplier = sort.direction === 'asc' ? 1 : -1
  const leftValue = left[sort.key]
  const rightValue = right[sort.key]

  if (sort.key === 'totalAmount' || sort.key === 'linesCount') {
    return (Number(leftValue || 0) - Number(rightValue || 0)) * multiplier
  }

  return String(leftValue || '').localeCompare(String(rightValue || ''), 'bg-BG', { numeric: true }) * multiplier
}

export default InvoiceTable
