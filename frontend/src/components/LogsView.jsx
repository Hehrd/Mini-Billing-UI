import { useMemo, useState } from 'react'
import Button from './ui/Button.jsx'
import Card from './ui/Card.jsx'
import EmptyState from './ui/EmptyState.jsx'
import ErrorAlert from './ui/ErrorAlert.jsx'
import Skeleton from './ui/Skeleton.jsx'
import { APP_CONFIG, isAdminRole } from '../config/appConfig.js'

const ALL = 'ALL'
const LOG_TYPES = {
  errors: {
    label: 'Error logs',
    emptyTitle: 'No error logs',
    columns: ['occurredAt', 'errorId', 'errorType', 'customerId', 'module', 'severity', 'description'],
  },
  audit: {
    label: 'Audit logs',
    emptyTitle: 'No audit logs',
    columns: ['occurredAt', 'username', 'action', 'module', 'description'],
  },
}

function LogsView({
  auditLogs,
  errorLogs,
  isLoading,
  error,
  user,
  auditPage,
  errorLogPage,
  onRefresh,
  onAuditPageChange,
  onErrorLogPageChange,
  onAuditPageSizeChange,
  onErrorLogPageSizeChange,
}) {
  const [logType, setLogType] = useState('errors')
  const [moduleFilter, setModuleFilter] = useState(ALL)
  const [severityFilter, setSeverityFilter] = useState(ALL)
  const readOnly = !isAdminRole(user?.role)
  const selectedRows = logType === 'audit' ? auditLogs : errorLogs
  const selectedPage = logType === 'audit' ? auditPage : errorLogPage
  const onSelectedPageChange = logType === 'audit' ? onAuditPageChange : onErrorLogPageChange
  const onSelectedPageSizeChange = logType === 'audit' ? onAuditPageSizeChange : onErrorLogPageSizeChange

  const modules = useMemo(() => {
    const values = selectedRows.map((entry) => entry.module).filter(Boolean)
    return [ALL, ...Array.from(new Set(values)).sort()]
  }, [selectedRows])

  const filteredAuditLogs = auditLogs.filter((entry) => moduleFilter === ALL || entry.module === moduleFilter)
  const filteredErrorLogs = errorLogs.filter((entry) => {
    return (
      (moduleFilter === ALL || entry.module === moduleFilter) &&
      (severityFilter === ALL || entry.severity === severityFilter)
    )
  })
  const filteredRows = logType === 'audit' ? filteredAuditLogs : filteredErrorLogs
  const selectedConfig = LOG_TYPES[logType]

  return (
    <section className="admin-grid" aria-labelledby="logs-title">
      <Card className="table-card">
        <div className="register-header">
          <div>
            <p className="eyebrow">Logs</p>
            <h2 id="logs-title">Logs</h2>
            <p>{readOnly ? 'Read-only role mode.' : `${APP_CONFIG.roles.admin} users can inspect audit and error logs.`}</p>
          </div>
          <Button variant="secondary" type="button" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? 'Refreshing' : 'Refresh'}
          </Button>
        </div>

        {error && <ErrorAlert error={error} onRetry={onRefresh} />}

        <div className="table-toolbar logs-toolbar">
          <label className="toolbar-field">
            <span>Log type</span>
            <select
              value={logType}
              onChange={(event) => {
                setLogType(event.target.value)
                setModuleFilter(ALL)
                setSeverityFilter(ALL)
              }}
            >
              <option value="errors">Error logs</option>
              <option value="audit">Audit logs</option>
            </select>
          </label>
          <label className="toolbar-field">
            <span>Module</span>
            <select value={moduleFilter} onChange={(event) => setModuleFilter(event.target.value)}>
              {modules.map((module) => (
                <option key={module} value={module}>
                  {module}
                </option>
              ))}
            </select>
          </label>
          {logType === 'errors' && (
            <label className="toolbar-field">
              <span>Severity</span>
              <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
                <option value={ALL}>ALL</option>
                <option value="WARNING">WARNING</option>
                <option value="ERROR">ERROR</option>
                <option value="CRITICAL">CRITICAL</option>
              </select>
            </label>
          )}
        </div>

        {isLoading && auditLogs.length === 0 && errorLogs.length === 0 ? (
          <div className="table-skeleton">
            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} />)}
          </div>
        ) : (
          <LogTable
            title={selectedConfig.label}
            rows={filteredRows}
            emptyTitle={selectedConfig.emptyTitle}
            columns={selectedConfig.columns}
            pageInfo={selectedPage}
            onPageChange={onSelectedPageChange}
            onPageSizeChange={onSelectedPageSizeChange}
            isLoading={isLoading}
          />
        )}
      </Card>
    </section>
  )
}

function LogTable({ title, rows, emptyTitle, columns, pageInfo, onPageChange, onPageSizeChange, isLoading }) {
  const currentPage = Number(pageInfo?.number || 0)
  const totalPages = Math.max(1, Number(pageInfo?.totalPages || 0))
  const displayPage = Math.min(currentPage + 1, totalPages)
  const isFirst = currentPage <= 0
  const isLast = currentPage >= totalPages - 1

  return (
    <div className="log-section">
      <div className="section-title compact">
        <h3>{title}</h3>
        <span>{Number(pageInfo?.totalElements || 0)} records</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState title={emptyTitle} description="No records match the current filters." />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((column) => <th key={column}>{columnLabel(column)}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id || `${row.occurredAt}-${row.description}`}>
                  {columns.map((column) => (
                    <td key={column}>{renderCell(row, column)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="pagination-bar" aria-label={`${title} pagination`}>
        <span>
          Page {displayPage} of {totalPages}
        </span>
        <div>
          <label className="toolbar-field compact-page-size">
            <span>Rows</span>
            <select
              value={Number(pageInfo?.size || APP_CONFIG.pageSizes[1])}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              disabled={isLoading}
            >
              {APP_CONFIG.pageSizes.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
          <Button variant="secondary" size="sm" type="button" onClick={() => onPageChange(0)} disabled={isLoading || isFirst}>
            First
          </Button>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => onPageChange(Math.max(0, currentPage - 1))}
            disabled={isLoading || isFirst}
          >
            Previous
          </Button>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            onClick={() => onPageChange(Math.min(totalPages - 1, currentPage + 1))}
            disabled={isLoading || isLast}
          >
            Next
          </Button>
          </div>
      </div>
    </div>
  )
}

function renderCell(row, column) {
  const value = row[column]
  if (column === 'severity') {
    return <span className={`status-chip status-${String(value || '').toLowerCase()}`}>{value || '—'}</span>
  }
  return value || '—'
}

function columnLabel(column) {
  return column.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())
}

export default LogsView
