import { useState } from 'react'
import Alert from './Alert.jsx'
import LoadingSpinner from './LoadingSpinner.jsx'
import Button from './ui/Button.jsx'
import Card from './ui/Card.jsx'
import ErrorAlert from './ui/ErrorAlert.jsx'
import { APP_CONFIG } from '../config/appConfig.js'

function ImportCard({ summary, status, error, isLoading, canImport, onImport, onDismiss }) {
  const isLocked = !canImport
  const [usersFile, setUsersFile] = useState(null)
  const [readingsFile, setReadingsFile] = useState(null)
  const [priceFiles, setPriceFiles] = useState([])
  const hasRequiredFiles = Boolean(usersFile && readingsFile && priceFiles.length > 0)

  function handleImport() {
    onImport({ usersFile, readingsFile, priceFiles })
  }

  return (
    <Card className="workflow-card import-card">
      <div className="card-header">
        <div>
          <p className="eyebrow">File imports</p>
          <h2>Import source data</h2>
          <p>Load source files when you need to refresh the stored customer, usage, or tariff data.</p>
        </div>
      </div>

      <div className="source-panel">
        <ul className="source-list" aria-label="Expected CSV source categories">
          <li>customer_data.csv</li>
          <li>usage_data.csv</li>
          <li>tariff_plans.csv</li>
        </ul>
      </div>

      <div className="import-file-grid">
        <label>
          <span>Users file</span>
          <input type="file" accept=".csv,.xlsx" onChange={(event) => setUsersFile(event.target.files?.[0] || null)} />
        </label>
        <label>
          <span>Readings file</span>
          <input type="file" accept=".csv,.xlsx" onChange={(event) => setReadingsFile(event.target.files?.[0] || null)} />
        </label>
        <label>
          <span>Price files</span>
          <input type="file" accept=".csv,.xlsx" multiple onChange={(event) => setPriceFiles(Array.from(event.target.files || []))} />
        </label>
      </div>

      <Button type="button" onClick={handleImport} disabled={isLoading || isLocked || !hasRequiredFiles}>
        {isLoading ? <LoadingSpinner label="Importing source data" /> : isLocked ? `${APP_CONFIG.roles.admin} required` : 'Import CSV Files'}
      </Button>

      {isLocked && (
        <Alert type="info" title="Role guard">
          CSV imports are limited to {APP_CONFIG.roles.admin} users by the backend authorization rules.
        </Alert>
      )}

      {isLoading && (
        <div className="progress-note" role="status">
          <span className="progress-bar" aria-hidden="true" />
          Reading configured CSV files and storing validated rows.
        </div>
      )}

      {status && (
        <Alert type="success" title="Import completed" onDismiss={onDismiss}>
          {status}
        </Alert>
      )}
      <ErrorAlert error={error} onRetry={hasRequiredFiles ? handleImport : null} onDismiss={onDismiss} />

      <div className="mini-metrics">
        <Metric label="Users" value={summary?.importedUsers ?? '—'} />
        <Metric label="Readings" value={summary?.importedReadings ?? '—'} />
        <Metric label="Prices" value={summary?.importedPrices ?? '—'} />
        <Metric label="Skipped" value={summary?.skippedDuplicates ?? '—'} />
      </div>

      {summary?.errors?.length > 0 && (
        <Alert type="info" title="Import warnings">
          {summary.errors.join('; ')}
        </Alert>
      )}
    </Card>
  )
}

function Metric({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export default ImportCard
