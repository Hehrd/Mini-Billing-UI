import Alert from './Alert.jsx'
import LoadingSpinner from './LoadingSpinner.jsx'
import Button from './ui/Button.jsx'
import Card from './ui/Card.jsx'
import ErrorAlert from './ui/ErrorAlert.jsx'
import FormField from './ui/FormField.jsx'
import { formatDateTime, formatNumber } from '../utils/formatters.js'

const FR_09_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'FAILED']

function GenerateInvoiceCard({
  months,
  years,
  month,
  year,
  selectedPeriod,
  hasImportedData,
  importReadiness,
  hasInvoices,
  status,
  error,
  billingRun,
  isLoading,
  isBackendAvailable,
  onMonthChange,
  onYearChange,
  onPreviousPeriod,
  onNextPeriod,
  onBillingRunAction,
  onDismiss,
}) {
  const yearIsSupported = Number(year) >= 1900 && Number(year) <= 2100
  const monthIsSupported = Number(month) >= 1 && Number(month) <= 12
  const periodIsValid = yearIsSupported && monthIsSupported
  const canGenerate = isBackendAvailable && hasImportedData && periodIsValid && !isLoading
  const runStatus = billingRun?.status || 'NOT_STARTED'
  const progressTotal = Number(billingRun?.totalRecords || 0)
  const progressDone = Number(billingRun?.processedRecords || 0) + Number(billingRun?.failedRecords || 0)
  const progressPercent = progressTotal > 0 ? Math.min(100, Math.round((progressDone / progressTotal) * 100)) : 0
  const isFirstSupportedPeriod = Number(year) === 1900 && Number(month) === 1
  const isLastSupportedPeriod = Number(year) === 2100 && Number(month) === 12

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
            <p className="eyebrow">Step 2</p>
            <h2>Configure billing period</h2>
            <p>Select the month and year for the invoice generation run.</p>
          </div>
        </div>

        <form className="period-form" onSubmit={handleSubmit}>
          <div className="period-controls">
            <Button variant="secondary" type="button" onClick={onPreviousPeriod} disabled={isLoading || isFirstSupportedPeriod}>
              Previous
            </Button>

            <FormField label="Month">
              <select value={month} onChange={(event) => onMonthChange(Number(event.target.value))}>
                {months.map((monthOption) => (
                  <option key={monthOption.value} value={monthOption.value}>
                    {monthOption.label}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Year" helperText="Supported range: 1900-2100">
              <select value={year} onChange={(event) => onYearChange(Number(event.target.value))}>
                {years.map((yearOption) => (
                  <option key={yearOption} value={yearOption}>
                    {yearOption}
                  </option>
                ))}
              </select>
            </FormField>

            <Button variant="secondary" type="button" onClick={onNextPeriod} disabled={isLoading || isLastSupportedPeriod}>
              Next
            </Button>
          </div>

          <div className="selected-period-summary">
            <span>Selected billing period</span>
            <strong>{selectedPeriod}</strong>
            {!periodIsValid && <p>Choose a month from 1-12 and year from 1900-2100.</p>}
          </div>
        </form>
      </div>

      <div className="generation-section">
        <div className="card-header">
          <div>
            <p className="eyebrow">Step 3</p>
            <h2>Generate and review invoices</h2>
            <p>Confirm readiness, generate invoice documents, then review the refreshed invoice register.</p>
          </div>
        </div>

        <div className="generation-confirmation">
          <span>Generation period</span>
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
            {FR_09_STATUSES.map((item) => (
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
          <ChecklistItem complete={isBackendAvailable} label="Backend API is reachable" />
          <ChecklistItem complete={hasImportedData} label="Customers, usage, and tariffs imports are valid" />
          <ChecklistItem complete={(importReadiness?.blockingValidationCount || 0) === 0} label="No blocking validation errors remain" />
          <ChecklistItem complete={periodIsValid} label="Billing period is supported" />
          <ChecklistItem complete={!isLoading} label="No generation request is already running" />
        </ul>

        {!hasImportedData && (
          <Alert type="info" title="Billing run is blocked">
            {toReadinessMessage(importReadiness)}
          </Alert>
        )}

        {hasInvoices && (
          <Alert type="info" title="Existing invoices loaded">
            This selected view already has invoices loaded. The backend will skip existing invoices for the same period.
          </Alert>
        )}

      </div>

      {status && (
        <Alert type="success" title="Generation completed" onDismiss={onDismiss}>
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

function toReadinessMessage(readiness) {
  if (!readiness) {
    return 'Import all required source files before generating invoices.'
  }

  const messages = []
  if (readiness.missingFiles?.length > 0) {
    messages.push(`Missing required imports: ${readiness.missingFiles.map(toImportLabel).join(', ')}.`)
  }
  if (readiness.blockingValidationCount > 0) {
    messages.push(`${readiness.blockingValidationCount} blocking validation error${readiness.blockingValidationCount === 1 ? '' : 's'} must be fixed.`)
  }

  return messages.join(' ') || 'Import all required source files before generating invoices.'
}

function toImportLabel(sourceType) {
  const labels = {
    CUSTOMERS: 'Customers',
    USAGE: 'Usage',
    TARIFFS: 'Tariffs',
  }
  return labels[sourceType] || sourceType
}

function ChecklistItem({ complete, label }) {
  return (
    <li className={complete ? 'complete' : 'pending'}>
      <span aria-hidden="true">{complete ? '✓' : '•'}</span>
      {label}
    </li>
  )
}

export default GenerateInvoiceCard
