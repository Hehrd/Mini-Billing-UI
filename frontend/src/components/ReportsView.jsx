import { useMemo, useState } from 'react'
import Button from './ui/Button.jsx'
import Card from './ui/Card.jsx'
import EmptyState from './ui/EmptyState.jsx'
import ErrorAlert from './ui/ErrorAlert.jsx'
import Skeleton from './ui/Skeleton.jsx'
import { formatNumber } from '../utils/formatters.js'

function ReportsView({ billingRuns, reportsByRunId, isLoading, error, onRefresh, onSelectRun, onExport, onRunAction, actionInProgress }) {
  const [selectedRunId, setSelectedRunId] = useState('')
  const selectedRun = useMemo(
    () => billingRuns.find((run) => run.id === selectedRunId) || billingRuns[0],
    [billingRuns, selectedRunId],
  )
  const report = selectedRun ? reportsByRunId[selectedRun.id] : null

  function handleSelect(event) {
    const runId = event.target.value
    setSelectedRunId(runId)
    onSelectRun(runId)
  }

  return (
    <section className="admin-grid" aria-labelledby="reports-title">
      <Card className="table-card">
        <div className="register-header">
          <div>
            <p className="eyebrow">Reports</p>
            <h2 id="reports-title">Billing Run summary</h2>
            <p>Operational report for processed, successful and failed invoice records.</p>
          </div>
          <Button variant="secondary" type="button" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? 'Refreshing' : 'Refresh'}
          </Button>
        </div>

        {error && <ErrorAlert error={error} onRetry={onRefresh} />}

        {isLoading && billingRuns.length === 0 ? (
          <ReportSkeleton />
        ) : billingRuns.length === 0 ? (
          <EmptyState title="No Billing Runs" description="Start a Billing Run before opening reports." />
        ) : (
          <>
            <div className="table-toolbar reports-toolbar">
              <label className="search-field">
                <span>Billing Run</span>
                <select value={selectedRun?.id || ''} onChange={handleSelect}>
                  {billingRuns.map((run) => (
                    <option key={run.id} value={run.id}>
                      {run.id} | {run.periodStart} to {run.periodEnd}
                    </option>
                  ))}
                </select>
              </label>
              <div className="toolbar-actions">
                <Button variant="secondary" type="button" onClick={() => onSelectRun(selectedRun.id)}>
                  Load report
                </Button>
                <Button type="button" onClick={() => onExport(selectedRun, report)} disabled={!report}>
                  Export report
                </Button>
              </div>
            </div>

            <div className="report-summary-grid">
              <ReportMetric label="Processed records" value={report?.processedRecords ?? selectedRun.processedRecords} />
              <ReportMetric label="Successful invoices" value={report?.successfulInvoices ?? '—'} tone="success" />
              <ReportMetric label="Failed invoices" value={report?.failedRecords ?? selectedRun.failedRecords} tone="danger" />
            </div>

            <div className="failure-panel">
              <span>Reasons for failures</span>
              <strong>{report?.failureSummary || 'No failure summary returned for this Billing Run.'}</strong>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Run ID</th>
                    <th>Period</th>
                    <th>Status</th>
                    <th>Started by</th>
                    <th>Processed</th>
                    <th>Failed</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {billingRuns.map((run) => {
                    const status = String(run.status || '')
                    const actionKey = (action) => `${run.id}:${action}`
                    return (
                      <tr key={run.id}>
                        <td className="document-number">{run.id}</td>
                        <td>
                          {run.periodStart} to {run.periodEnd}
                        </td>
                        <td><span className={`status-chip status-${status.toLowerCase()}`}>{run.status}</span></td>
                        <td>{run.startedBy || '—'}</td>
                        <td>{formatNumber(run.processedRecords || 0)}</td>
                        <td>{formatNumber(run.failedRecords || 0)}</td>
                        <td>
                          <div className="row-actions billing-run-row-actions">
                            <Button
                              variant="secondary"
                              size="sm"
                              type="button"
                              onClick={() => onRunAction(run, 'stop')}
                              disabled={actionInProgress === actionKey('stop') || status === 'COMPLETED' || status === 'FAILED' || status === 'PAUSED'}
                            >
                              {actionInProgress === actionKey('stop') ? 'Stopping' : 'Stop'}
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              type="button"
                              onClick={() => onRunAction(run, 'resume')}
                              disabled={actionInProgress === actionKey('resume') || status !== 'PAUSED'}
                            >
                              {actionInProgress === actionKey('resume') ? 'Resuming' : 'Resume'}
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              type="button"
                              onClick={() => onRunAction(run, 'restart')}
                              disabled={actionInProgress === actionKey('restart')}
                            >
                              {actionInProgress === actionKey('restart') ? 'Restarting' : 'Restart'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </section>
  )
}

function ReportMetric({ label, value, tone = 'neutral' }) {
  return (
    <div className={`report-metric report-metric-${tone}`}>
      <span>{label}</span>
      <strong>{typeof value === 'number' ? formatNumber(value) : value}</strong>
    </div>
  )
}

function ReportSkeleton() {
  return (
    <div className="report-summary-grid">
      <Skeleton />
      <Skeleton />
      <Skeleton />
    </div>
  )
}

export default ReportsView
