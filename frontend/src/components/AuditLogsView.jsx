import { useMemo, useState } from 'react'
import Button from './ui/Button.jsx'
import Card from './ui/Card.jsx'
import EmptyState from './ui/EmptyState.jsx'
import ErrorAlert from './ui/ErrorAlert.jsx'
import Skeleton from './ui/Skeleton.jsx'

const ALL = 'ALL'

function AuditLogsView({ auditLogs, errorLogs, isLoading, error, user, onRefresh }) {
  const [moduleFilter, setModuleFilter] = useState(ALL)
  const [severityFilter, setSeverityFilter] = useState(ALL)
  const [statusFilter, setStatusFilter] = useState(ALL)
  const readOnly = user?.role !== 'ADMIN'

  const modules = useMemo(() => {
    const values = [...auditLogs, ...errorLogs].map((entry) => entry.module).filter(Boolean)
    return [ALL, ...Array.from(new Set(values)).sort()]
  }, [auditLogs, errorLogs])

  const filteredAuditLogs = auditLogs.filter((entry) => moduleFilter === ALL || entry.module === moduleFilter)
  const filteredErrorLogs = errorLogs.filter((entry) => {
    return (
      (moduleFilter === ALL || entry.module === moduleFilter) &&
      (severityFilter === ALL || entry.severity === severityFilter) &&
      (statusFilter === ALL || entry.status === statusFilter)
    )
  })

  return (
    <section className="admin-grid" aria-labelledby="audit-title">
      <Card className="table-card">
        <div className="register-header">
          <div>
            <p className="eyebrow">Audit</p>
            <h2 id="audit-title">Error Logs and Audit Logs</h2>
            <p>{readOnly ? 'Read-only role mode.' : 'Auditor filters are available for ADMIN users.'}</p>
          </div>
          <Button variant="secondary" type="button" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? 'Refreshing' : 'Refresh'}
          </Button>
        </div>

        {error && <ErrorAlert error={error} onRetry={onRefresh} />}

        <div className="table-toolbar audit-toolbar">
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
          <label className="toolbar-field">
            <span>Severity</span>
            <select value={severityFilter} onChange={(event) => setSeverityFilter(event.target.value)}>
              <option value={ALL}>ALL</option>
              <option value="WARNING">WARNING</option>
              <option value="ERROR">ERROR</option>
              <option value="CRITICAL">CRITICAL</option>
            </select>
          </label>
          <label className="toolbar-field">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value={ALL}>ALL</option>
              <option value="OPEN">OPEN</option>
              <option value="RESOLVED">RESOLVED</option>
            </select>
          </label>
          <div className="read-only-chip">{readOnly ? 'Read-only' : 'Auditor filters'}</div>
        </div>

        {isLoading && auditLogs.length === 0 && errorLogs.length === 0 ? (
          <div className="table-skeleton">
            {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} />)}
          </div>
        ) : (
          <>
            <LogTable
              title="Error log table"
              rows={filteredErrorLogs}
              emptyTitle="No error logs"
              columns={['occurredAt', 'errorId', 'errorType', 'customerId', 'module', 'severity', 'status', 'description']}
            />
            <LogTable
              title="Audit log table"
              rows={filteredAuditLogs}
              emptyTitle="No audit logs"
              columns={['occurredAt', 'username', 'action', 'module', 'description']}
            />
          </>
        )}
      </Card>
    </section>
  )
}

function LogTable({ title, rows, emptyTitle, columns }) {
  return (
    <div className="log-section">
      <div className="section-title compact">
        <h3>{title}</h3>
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
    </div>
  )
}

function renderCell(row, column) {
  const value = row[column]
  if (column === 'severity' || column === 'status') {
    return <span className={`status-chip status-${String(value || '').toLowerCase()}`}>{value || '—'}</span>
  }
  return value || '—'
}

function columnLabel(column) {
  return column.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase())
}

export default AuditLogsView
