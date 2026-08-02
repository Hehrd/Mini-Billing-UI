import { useMemo, useState } from 'react'
import Button from './ui/Button.jsx'
import Card from './ui/Card.jsx'
import EmptyState from './ui/EmptyState.jsx'
import ErrorAlert from './ui/ErrorAlert.jsx'
import Skeleton from './ui/Skeleton.jsx'
import { APP_CONFIG, hasRole, isAdminRole } from '../config/appConfig.js'
import { formatNumber } from '../utils/formatters.js'

const PAGE_SIZE_OPTIONS = [10, 20, 50]

function ReadingsView({
  readings,
  selfReports = [],
  isLoading,
  isSubmitting,
  reviewingId,
  error,
  user,
  onRefresh,
  onSubmitSelfReport,
  onReviewSelfReport,
  onClearError,
}) {
  const [query, setQuery] = useState('')
  const [product, setProduct] = useState('all')
  const [pageSize, setPageSize] = useState(20)
  const [page, setPage] = useState(1)
  const [readingDate, setReadingDate] = useState('')
  const [service, setService] = useState('elec')
  const [amount, setAmount] = useState('')

  const filteredReadings = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return readings.filter((reading) => {
      const matchesQuery = normalizedQuery
        ? [reading.reference, reading.product, reading.dateTime]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalizedQuery))
        : true
      const matchesProduct = product === 'all' || reading.product === product
      return matchesQuery && matchesProduct
    })
  }, [product, query, readings])

  const totalPages = Math.max(1, Math.ceil(filteredReadings.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const visibleReadings = filteredReadings.slice((safePage - 1) * pageSize, safePage * pageSize)
  const hasFilters = Boolean(query.trim()) || product !== 'all'
  const isAdmin = isAdminRole(user?.role)

  function clearFilters() {
    setQuery('')
    setProduct('all')
    setPage(1)
  }

  function handleQuery(value) {
    setQuery(value)
    setPage(1)
  }

  function handleProduct(value) {
    setProduct(value)
    setPage(1)
  }

  async function handleSubmitSelfReport(event) {
    event.preventDefault()
    if (!readingDate || !amount) {
      return
    }
    await onSubmitSelfReport?.({ date: readingDate, service, amount })
    setAmount('')
  }

  return (
    <section className="admin-grid" aria-labelledby="readings-title">
      <Card className="table-card self-report-card">
        <div className="register-header">
          <div>
            <p className="eyebrow">Self reports</p>
            <h2>{isAdmin ? 'Reading self report review' : 'Reading self report request'}</h2>
            <p>
              {isAdmin
                ? 'Review pending user-submitted readings. Accepted requests appear in the readings register as self reported.'
                : 'Submit a meter reading for a service and date. Accepted requests appear in the readings register as self reported.'}
            </p>
          </div>
        </div>

        {!isAdmin && (
          <form className="self-report-form" onSubmit={handleSubmitSelfReport}>
            <label className="toolbar-field">
              <span>Reading date</span>
              <input type="date" value={readingDate} onChange={(event) => setReadingDate(event.target.value)} required />
            </label>

            <label className="toolbar-field">
              <span>Service</span>
              <select value={service} onChange={(event) => setService(event.target.value)}>
                <option value="elec">Electricity</option>
                <option value="gas">Gas</option>
              </select>
            </label>

            <label className="toolbar-field">
              <span>Amount</span>
              <input
                type="number"
                min="0.001"
                max="1000000"
                step="0.001"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </label>

            <div className="toolbar-actions">
              <Button type="submit" disabled={isSubmitting || !readingDate || !amount}>
                {isSubmitting ? 'Submitting' : 'Submit request'}
              </Button>
            </div>
          </form>
        )}

        <div className="self-report-register">
          <div className="register-subheader">
            <h3>Self report requests</h3>
            <span>{formatNumber(selfReports.length)} loaded</span>
          </div>

          {selfReports.length === 0 ? (
            <EmptyState title="No self report requests" description="Submitted requests will appear here while they wait for review." />
          ) : (
            <div className="table-wrap compact-table">
              <table>
                <caption className="sr-only">Reading self report requests visible to the signed-in user</caption>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Service</th>
                    <th>Reading date</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Requested</th>
                    {isAdmin && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {selfReports.map((request) => (
                    <tr key={request.id}>
                      <td className="document-number">{request.reference}</td>
                      <td>{formatProduct(request.service)}</td>
                      <td>{formatDate(request.date)}</td>
                      <td className="amount-cell">{formatNumber(Number(request.amount || 0), { maximumFractionDigits: 3 })}</td>
                      <td>
                        <span className={`status-chip ${statusClass(request.status)}`}>{formatStatus(request.status)}</span>
                      </td>
                      <td>{formatDateTime(request.requestedAt)}</td>
                      {isAdmin && (
                        <td>
                          {isPendingStatus(request.status) ? (
                            <div className="row-actions">
                              <Button
                                variant="secondary"
                                size="sm"
                                type="button"
                                onClick={() => onReviewSelfReport?.(request.id, 'accept')}
                                disabled={reviewingId === request.id}
                              >
                                Accept
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                type="button"
                                onClick={() => onReviewSelfReport?.(request.id, 'decline')}
                                disabled={reviewingId === request.id}
                              >
                                Decline
                              </Button>
                            </div>
                          ) : (
                            request.reviewedBy || 'Reviewed'
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Card className="table-card readings-register">
        <div className="register-header">
          <div>
            <p className="eyebrow">Meter readings</p>
            <h2 id="readings-title">Readings register</h2>
            <p>
              {isLoading
                ? 'Refreshing readings...'
                : `${formatNumber(filteredReadings.length)} of ${formatNumber(readings.length)} readings loaded${
                    hasRole(user?.role, [APP_CONFIG.roles.user]) ? ' for your customer account' : ''
                  }`}
            </p>
          </div>
          <Button variant="secondary" type="button" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? 'Refreshing' : 'Refresh'}
          </Button>
        </div>

        <div className="table-toolbar readings-toolbar" aria-label="Reading table controls">
          <label className="search-field">
            <span>Search readings</span>
            <input
              type="search"
              value={query}
              onChange={(event) => handleQuery(event.target.value)}
              placeholder="Reference, product or date"
            />
          </label>

          <label className="toolbar-field">
            <span>Product</span>
            <select value={product} onChange={(event) => handleProduct(event.target.value)}>
              <option value="all">All</option>
              <option value="gas">Gas</option>
              <option value="elec">Electricity</option>
            </select>
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

          <div className="toolbar-actions">
            <Button variant="secondary" type="button" onClick={clearFilters} disabled={!hasFilters}>
              Clear filters
            </Button>
          </div>
        </div>

        {error && <ErrorAlert error={error} onRetry={onRefresh} onDismiss={onClearError} />}

        {isLoading && readings.length === 0 ? (
          <ReadingsSkeleton />
        ) : readings.length === 0 ? (
          <EmptyState title="No readings available" description="Imported meter readings will appear here." />
        ) : filteredReadings.length === 0 ? (
          <EmptyState
            icon="⌕"
            title="No matching readings"
            description="Your search filters removed every loaded reading from the current view."
            action={
              <Button variant="secondary" type="button" onClick={clearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Meter readings visible to the signed-in user</caption>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Product</th>
                    <th>Reading date</th>
                    <th>Last reading</th>
                    <th>Source</th>
                    <th>Invoice state</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleReadings.map((reading) => (
                    <tr key={reading.id}>
                      <td className="document-number">{reading.reference}</td>
                      <td>{formatProduct(reading.product)}</td>
                      <td>{formatDateTime(reading.dateTime)}</td>
                      <td className="amount-cell">{formatNumber(Number(reading.lastReading || 0), { maximumFractionDigits: 3 })}</td>
                      <td>{reading.selfReported ? 'Self reported' : 'Imported'}</td>
                      <td>
                        <span className={`status-chip ${reading.invoiced ? 'status-success' : 'status-neutral'}`}>
                          {reading.invoiced ? 'Invoiced' : 'Not invoiced'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination-bar" aria-label="Readings pagination">
              <span>
                Page {safePage} of {totalPages}
              </span>
              <div>
                <Button variant="secondary" size="sm" type="button" onClick={() => setPage(1)} disabled={safePage === 1}>
                  First
                </Button>
                <Button variant="secondary" size="sm" type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage === 1}>
                  Previous
                </Button>
                <Button variant="secondary" size="sm" type="button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={safePage === totalPages}>
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </section>
  )
}

function formatProduct(product) {
  if (product === 'elec') {
    return 'Electricity'
  }
  if (product === 'gas') {
    return 'Gas'
  }
  return product || '—'
}

function formatDateTime(value) {
  if (!value) {
    return '—'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatDate(value) {
  if (!value) {
    return '—'
  }
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(date)
}

function formatStatus(status) {
  const normalizedStatus = normalizeStatus(status)
  if (normalizedStatus === 'ACCEPTED') {
    return 'Accepted'
  }
  if (normalizedStatus === 'DENIED') {
    return 'Declined'
  }
  return 'Pending'
}

function statusClass(status) {
  const normalizedStatus = normalizeStatus(status)
  if (normalizedStatus === 'ACCEPTED') {
    return 'status-success'
  }
  if (normalizedStatus === 'DENIED') {
    return 'status-danger'
  }
  return 'status-warning'
}

function isPendingStatus(status) {
  return normalizeStatus(status) === 'PENDING'
}

function normalizeStatus(status) {
  return String(status || '').toUpperCase()
}

function ReadingsSkeleton() {
  return (
    <div className="table-skeleton">
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

export default ReadingsView
