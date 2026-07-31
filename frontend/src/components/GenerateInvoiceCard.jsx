import Alert from './Alert.jsx'
import LoadingSpinner from './LoadingSpinner.jsx'
import Button from './ui/Button.jsx'
import Card from './ui/Card.jsx'
import ErrorAlert from './ui/ErrorAlert.jsx'
import FormField from './ui/FormField.jsx'
import { formatDateTime, formatNumber } from '../utils/formatters.js'
import { APP_CONFIG } from '../config/appConfig.js'

const BILLING_RUN_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'FAILED']

function GenerateInvoiceCard({
  startDate,
  endDate,
  targetUserId,
  currentUserReference,
  isAdmin,
  selectedPeriod,
  hasImportedData,
  hasInvoices,
  status,
  error,
  billingRun,
  isLoading,
  onStartDateChange,
  onEndDateChange,
  onTargetUserIdChange,
  onBillingRunAction,
  onDismiss,
}) {
  const periodIsValid = dateRangeIsValid(startDate, endDate)
  const canGenerate = periodIsValid && !isLoading
  const runStatus = billingRun?.status || 'NOT_STARTED'
  const progressTotal = Number(billingRun?.totalRecords || 0)
  const progressDone = Number(billingRun?.processedRecords || 0) + Number(billingRun?.failedRecords || 0)
  const progressPercent = progressTotal > 0 ? Math.min(100, Math.round((progressDone / progressTotal) * 100)) : 0

  function handleSubmit(event) {
    event.preventDefault()
    if (canGenerate) {
      onBillingRunAction('START')
    }
  }

  return (
    <Card className="workflow-card generate-card">
      <div className="period-config-section">
        <div className="card-header">
          <div>
            <p className="eyebrow">Step 1</p>
            <h2>Configure billing period</h2>
            <p>Select the date range for the invoice generation run.</p>
          </div>
        </div>

        <form className="period-form" onSubmit={handleSubmit}>
          <div className="period-controls">
            <FormField label="Start date">
              <input
                type="date"
                min={`${APP_CONFIG.period.minYear}-01-01`}
                max={`${APP_CONFIG.period.maxYear}-12-31`}
                value={startDate}
                onChange={(event) => onStartDateChange(event.target.value)}
                disabled={isLoading}
              />
            </FormField>

            <FormField label="End date" helperText={`Supported range: ${APP_CONFIG.period.minYear}-${APP_CONFIG.period.maxYear}`}>
              <input
                type="date"
                min={`${APP_CONFIG.period.minYear}-01-01`}
                max={`${APP_CONFIG.period.maxYear}-12-31`}
                value={endDate}
                onChange={(event) => onEndDateChange(event.target.value)}
                disabled={isLoading}
              />
            </FormField>
          </div>

          <div className="selected-period-summary">
            <span>Selected billing period</span>
            <strong>{selectedPeriod}</strong>
            {!periodIsValid && <p>Choose a valid date range where the end date is not before the start date.</p>}
          </div>
        </form>

        <div className="generation-target">
          {isAdmin ? (
            <FormField label="Customer ID" helperText="Leave empty or enter all to generate for every customer.">
              <input
                type="text"
                value={targetUserId}
                placeholder="all"
                onChange={(event) => onTargetUserIdChange(event.target.value)}
                disabled={isLoading}
              />
            </FormField>
          ) : (
            <FormField label="Customer ID">
              <input type="text" value={currentUserReference || ''} disabled readOnly />
            </FormField>
          )}
        </div>
      </div>

      <div className="generation-section">
        <div className="card-header">
          <div>
            <p className="eyebrow">Step 2</p>
            <h2>Start Billing Run and review invoices</h2>
            <p>Confirm readiness, start the Billing Run, then review the refreshed invoice register.</p>
          </div>
        </div>

        <div className="generation-confirmation">
          <span>Billing Run period</span>
          <strong>{selectedPeriod}</strong>
        </div>

        <section className="billing-run-panel" aria-labelledby="billing-run-lifecycle-title">
          <div className="billing-run-panel-header">
            <div>
              <p className="eyebrow">FR-09 Lifecycle</p>
              <h3 id="billing-run-lifecycle-title">Billing run lifecycle</h3>
            </div>
            <span className={`billing-run-status billing-run-status-${runStatus.toLowerCase().replace('_', '-')}`}>
              {runStatus}
            </span>
          </div>

          <div className="billing-run-status-strip" aria-label="Billing run statuses">
            {BILLING_RUN_STATUSES.map((item) => (
              <span className={item === runStatus ? 'active' : ''} key={item}>
                {item.replace('_', ' ')}
              </span>
            ))}
          </div>

          <div className="billing-run-progress" aria-label="Billing run progress">
            <div className="billing-run-progress-top">
              <strong>{progressPercent}%</strong>
              <span>
                {formatNumber(progressDone)} of {progressTotal ? formatNumber(progressTotal) : '—'} records handled
              </span>
            </div>
            <div className="billing-run-progress-track">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          <div className="billing-run-metrics">
            <RunMetric label="Processed" value={formatNumber(billingRun?.processedRecords)} />
            <RunMetric label="Failed" value={formatNumber(billingRun?.failedRecords)} />
            <RunMetric label="Started" value={formatDateTime(billingRun?.startedAt)} />
            <RunMetric label="Ended" value={formatDateTime(billingRun?.endedAt)} />
            <RunMetric label="Frozen tariff version" value={billingRun?.frozenTariffVersion || '—'} />
          </div>

          <div className="billing-run-actions">
            <Button type="button" onClick={() => onBillingRunAction('START')} disabled={!canGenerate || runStatus === 'IN_PROGRESS'}>
              {isLoading && runStatus === 'NOT_STARTED' ? <LoadingSpinner label="Starting" /> : 'Start'}
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => onBillingRunAction('STOP')}
              disabled={!billingRun?.id || isLoading || runStatus !== 'IN_PROGRESS'}
            >
              Stop
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => onBillingRunAction('RESUME')}
              disabled={!billingRun?.id || isLoading || runStatus !== 'PAUSED'}
            >
              Resume
            </Button>
            <Button
              variant="secondary"
              type="button"
              onClick={() => onBillingRunAction('RESTART')}
              disabled={!billingRun?.id || isLoading || !['PAUSED', 'COMPLETED', 'FAILED'].includes(runStatus)}
            >
              Restart
            </Button>
          </div>
        </section>

        <ul className="readiness-list" aria-label="Generation readiness checklist">
          <ChecklistItem complete label={hasImportedData ? 'Current session imports are loaded' : 'Stored imports will be used'} />
          <ChecklistItem complete={periodIsValid} label="Billing period is supported" />
          <ChecklistItem complete={!isLoading} label="No Billing Run request is already running" />
        </ul>

        {hasInvoices && (
          <Alert type="info" title="Existing invoices loaded">
            This selected view already has invoices loaded. The backend will skip existing invoices for the same period.
          </Alert>
        )}

      </div>

      {status && (
        <Alert type="success" title="Billing Run completed" onDismiss={onDismiss}>
          {status}
        </Alert>
      )}
      <ErrorAlert error={error} onRetry={canGenerate ? () => onBillingRunAction('START') : null} onDismiss={onDismiss} />
    </Card>
  )
}

function RunMetric({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ChecklistItem({ complete, label }) {
  return (
    <li className={complete ? 'complete' : 'pending'}>
      <span aria-hidden="true">{complete ? '✓' : '•'}</span>
      {label}
    </li>
  )
}

function dateRangeIsValid(startDate, endDate) {
  if (!startDate || !endDate) {
    return false
  }
  const start = new Date(`${startDate}T00:00:00`)
  const end = new Date(`${endDate}T00:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return false
  }
  return end >= start
}

export default GenerateInvoiceCard
