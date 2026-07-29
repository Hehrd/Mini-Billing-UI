import Alert from './Alert.jsx'
import LoadingSpinner from './LoadingSpinner.jsx'
import Card from './ui/Card.jsx'
import ErrorAlert from './ui/ErrorAlert.jsx'

const IMPORT_OPTIONS = [
  {
    sourceType: 'CUSTOMERS',
    label: 'Customers',
    description: 'Customer master data in CSV or XLSX format.',
    expectedName: 'customers',
  },
  {
    sourceType: 'USAGE',
    label: 'Usage',
    description: 'Usage or meter reading rows for the selected billing period.',
    expectedName: 'usage',
  },
  {
    sourceType: 'TARIFFS',
    label: 'Tariffs',
    description: 'Tariff and price list data used during invoice generation.',
    expectedName: 'tariffs',
  },
]

const ACCEPTED_EXTENSIONS = ['csv', 'xlsx']

function ImportCard({
  inputDirectory,
  summary,
  status,
  error,
  importStatuses = {},
  validationResults = [],
  isLoading,
  isBackendAvailable,
  onImport,
  onDismiss,
}) {
  return (
    <Card className="workflow-card import-card">
      <div className="card-header">
        <div>
          <p className="eyebrow">Step 1</p>
          <h2>Import source data</h2>
          <p>Select and import each source file separately before generating invoices.</p>
        </div>
      </div>

      <div className="source-panel">
        <div>
          <span>Input directory</span>
          <strong>{inputDirectory || 'File upload is available when the backend is online'}</strong>
        </div>
        <ul className="source-list" aria-label="Expected source files">
          <li>Customers file</li>
          <li>Usage file</li>
          <li>Tariffs file</li>
        </ul>
      </div>

      <div className="import-file-list">
        {IMPORT_OPTIONS.map((option) => (
          <ImportFileRow
            key={option.sourceType}
            option={option}
            status={importStatuses[option.sourceType]}
            isAnyImportLoading={isLoading}
            isBackendAvailable={isBackendAvailable}
            onImport={onImport}
          />
        ))}
      </div>

      {isLoading && (
        <div className="progress-note" role="status">
          <span className="progress-bar" aria-hidden="true" />
          Uploading source data and storing validated rows.
        </div>
      )}

      {status && (
        <Alert type="success" title="Import completed" onDismiss={onDismiss}>
          {status}
        </Alert>
      )}
      <ErrorAlert error={error} onRetry={onImport} onDismiss={onDismiss} />

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

      <ValidationResultsPanel results={validationResults} importStatuses={importStatuses} />
    </Card>
  )
}

function ImportFileRow({ option, status, isAnyImportLoading, isBackendAvailable, onImport }) {
  const validation = status?.validation
  const statusState = status?.state || 'idle'
  const statusMessage = validation || status?.message || 'No file selected yet.'
  const fileInputId = `import-${option.sourceType.toLowerCase()}`
  const isCurrentImporting = statusState === 'importing'

  function handleFileChange(event) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const error = validateImportFile(file, option)
    if (error) {
      onImport({
        sourceType: option.sourceType,
        file,
        validationError: error,
      })
      event.target.value = ''
      return
    }

    onImport({ sourceType: option.sourceType, file })
    event.target.value = ''
  }

  return (
    <div className={`import-file-row import-file-row-${statusState}`}>
      <div className="import-file-copy">
        <strong>{option.label}</strong>
        <span>{option.description}</span>
      </div>

      <label className="file-picker-button" htmlFor={fileInputId}>
        Choose file
      </label>
      <input
        id={fileInputId}
        className="sr-only"
        type="file"
        accept=".csv,.xlsx"
        disabled={isAnyImportLoading || !isBackendAvailable}
        onChange={handleFileChange}
      />

      <div className="import-file-status" role="status">
        <span className="import-status-dot" aria-hidden="true" />
        <div>
          <strong>{status?.fileName || option.label}</strong>
          <span>{isCurrentImporting ? <LoadingSpinner label={statusMessage} /> : statusMessage}</span>
        </div>
      </div>
    </div>
  )
}

function validateImportFile(file, option) {
  const extension = file.name.split('.').pop()?.toLowerCase()
  const normalizedName = file.name.toLowerCase()

  if (!extension || !ACCEPTED_EXTENSIONS.includes(extension)) {
    return 'Only .csv and .xlsx files are allowed.'
  }

  if (!normalizedName.includes(option.expectedName)) {
    return `File name should include "${option.expectedName}" so it is clear which import it belongs to.`
  }

  return null
}

function ValidationResultsPanel({ results, importStatuses }) {
  const missingImports = IMPORT_OPTIONS.filter((option) => importStatuses[option.sourceType]?.state !== 'success')
  const groupedResults = groupValidationResults(results)

  return (
    <section className="validation-panel" aria-labelledby="validation-results-title">
      <div className="section-title compact">
        <div>
          <p className="eyebrow">Validation</p>
          <h3 id="validation-results-title">Import validation results</h3>
          <p>Grouped by file, row, field, and severity.</p>
        </div>
      </div>

      {missingImports.length > 0 && (
        <div className="validation-missing-list" aria-label="Missing required imports">
          {missingImports.map((option) => (
            <span key={option.sourceType}>{option.label} required</span>
          ))}
        </div>
      )}

      {groupedResults.length === 0 ? (
        <div className="validation-empty">
          <strong>No validation issues</strong>
          <span>Accepted files will stay clear here unless the backend reports row or structure problems.</span>
        </div>
      ) : (
        <div className="table-wrap validation-table-wrap">
          <table className="validation-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Row</th>
                <th>Field</th>
                <th>Severity</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {groupedResults.map((result) => (
                <tr key={result.key}>
                  <td>{result.fileName}</td>
                  <td>{result.rowNumber}</td>
                  <td>{result.field}</td>
                  <td>
                    <span className={`badge ${['ERROR', 'CRITICAL'].includes(result.severity) ? 'badge-danger' : 'badge-warning'}`}>
                      {result.severity}
                    </span>
                  </td>
                  <td>{result.messages.join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function groupValidationResults(results) {
  const grouped = new Map()

  results.forEach((result) => {
    const key = [
      result.fileName || result.sourceType || 'Unknown file',
      result.rowNumber ?? 'File',
      result.field || 'structure',
      result.severity || 'ERROR',
    ].join('|')

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        fileName: result.fileName || result.sourceType || 'Unknown file',
        rowNumber: result.rowNumber ?? 'File',
        field: result.field || 'structure',
        severity: result.severity || 'ERROR',
        messages: [],
      })
    }

    grouped.get(key).messages.push(result.message || 'Validation issue found.')
  })

  return Array.from(grouped.values()).sort((left, right) => {
    if (left.fileName !== right.fileName) {
      return left.fileName.localeCompare(right.fileName)
    }
    return String(left.rowNumber).localeCompare(String(right.rowNumber), undefined, { numeric: true })
  })
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
