import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  downloadInvoice,
  getBillingRun,
  getHealth,
  getInvoice,
  getInvoices,
  importSourceFile,
  restartBillingRun,
  resumeBillingRun,
  startBillingRun,
  stopBillingRun,
} from './api/invoicesApi.js'
import Header from './components/Header.jsx'
import BillingOverview from './components/BillingOverview.jsx'
import BillingWorkflow from './components/BillingWorkflow.jsx'
import StatsCards from './components/StatsCards.jsx'
import InvoiceTable from './components/InvoiceTable.jsx'
import InvoiceDetailsModal from './components/InvoiceDetailsModal.jsx'
import ErrorAlert from './components/ui/ErrorAlert.jsx'
import ToastStack from './components/ui/ToastStack.jsx'
import { formatMoney, formatMonthYear, formatNumber } from './utils/formatters.js'

const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

const DEFAULT_YEAR = 2024
const DEFAULT_MONTH = 3
const IMPORT_TYPES = ['CUSTOMERS', 'USAGE', 'TARIFFS']
const ACTIVE_BILLING_RUN_STATUSES = ['NOT_STARTED', 'IN_PROGRESS']

const EMPTY_IMPORT_STATUS = IMPORT_TYPES.reduce((statusMap, sourceType) => {
  statusMap[sourceType] = { state: 'idle', message: 'No file selected yet.' }
  return statusMap
}, {})

function App() {
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(DEFAULT_MONTH)
  const [invoices, setInvoices] = useState([])
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [isInvoicesLoading, setIsInvoicesLoading] = useState(false)
  const [importStatuses, setImportStatuses] = useState(EMPTY_IMPORT_STATUS)
  const [validationResults, setValidationResults] = useState([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [billingRun, setBillingRun] = useState(null)
  const [isDetailsLoading, setIsDetailsLoading] = useState(false)
  const [importSummary, setImportSummary] = useState(null)
  const [importStatus, setImportStatus] = useState(null)
  const [generateStatus, setGenerateStatus] = useState(null)
  const [importError, setImportError] = useState(null)
  const [generateError, setGenerateError] = useState(null)
  const [invoiceError, setInvoiceError] = useState(null)
  const [pageError, setPageError] = useState(null)
  const [toasts, setToasts] = useState([])
  const [health, setHealth] = useState({ status: 'checking', message: 'Checking API' })
  const invoiceRequestId = useRef(0)
  const healthRequestId = useRef(0)
  const billingRunRequestId = useRef(0)
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') {
      return 'light'
    }
    const savedTheme = window.localStorage.getItem('mini-billing-theme')
    if (savedTheme) {
      return savedTheme
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
  })

  const years = useMemo(() => {
    return Array.from({ length: 201 }, (_, index) => 1900 + index)
  }, [])

  const selectedPeriod = useMemo(() => {
    return formatMonthYear(month, year, MONTHS)
  }, [month, year])

  const pushToast = useCallback((toast) => {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setToasts((current) => [...current, { id, ...toast }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 4200)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem('mini-billing-theme', theme)
  }, [theme])

  const loadHealth = useCallback(async () => {
    const requestId = healthRequestId.current + 1
    healthRequestId.current = requestId
    setHealth({ status: 'checking', message: 'Checking API' })

    try {
      const response = await getHealth()
      if (requestId !== healthRequestId.current) {
        return
      }
      setHealth({
        status: response?.status === 'UP' ? 'connected' : 'degraded',
        message: response?.status === 'UP' ? 'API online' : 'API responded',
        details: response,
      })
    } catch (error) {
      if (requestId !== healthRequestId.current) {
        return
      }
      setHealth({ status: 'offline', message: error.message })
    }
  }, [])

  useEffect(() => {
    loadHealth()
  }, [loadHealth])

  const loadInvoices = useCallback(async ({ toastOnSuccess = false } = {}) => {
    const requestId = invoiceRequestId.current + 1
    invoiceRequestId.current = requestId
    setIsInvoicesLoading(true)
    setInvoiceError(null)

    try {
      const loadedInvoices = await getInvoices({ year, month })
      if (requestId !== invoiceRequestId.current) {
        return
      }
      setInvoices(loadedInvoices)
      if (toastOnSuccess) {
        pushToast({
          type: 'success',
          title: 'Invoice register refreshed',
          description: `${loadedInvoices.length} invoices loaded for ${selectedPeriod}.`,
        })
      }
    } catch (error) {
      if (requestId !== invoiceRequestId.current) {
        return
      }
      setInvoiceError(error)
      pushToast({
        type: 'error',
        title: error.title || 'Refresh failed',
        description: 'The invoice register could not be refreshed.',
      })
    } finally {
      if (requestId === invoiceRequestId.current) {
        setIsInvoicesLoading(false)
      }
    }
  }, [month, pushToast, selectedPeriod, year])

  useEffect(() => {
    setInvoices([])
    setInvoiceError(null)
  }, [month, year])

  useEffect(() => {
    loadInvoices()
  }, [loadInvoices])

  useEffect(() => {
    if (!billingRun?.id || !ACTIVE_BILLING_RUN_STATUSES.includes(billingRun.status)) {
      return undefined
    }

    const intervalId = window.setInterval(async () => {
      const requestId = billingRunRequestId.current + 1
      billingRunRequestId.current = requestId

      try {
        const latestRun = await getBillingRun(billingRun.id)
        if (requestId === billingRunRequestId.current) {
          setBillingRun(normalizeBillingRun(latestRun))
        }
      } catch {
        window.clearInterval(intervalId)
      }
    }, 3000)

    return () => window.clearInterval(intervalId)
  }, [billingRun?.id, billingRun?.status])

  const stats = useMemo(() => {
    const totalAmount = invoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount || 0), 0)
    const totalLines = invoices.reduce((sum, invoice) => sum + Number(invoice.linesCount ?? invoice.lines?.length ?? 0), 0)
    const lastDocumentNumber =
      invoices
        .map((invoice) => invoice.documentNumber)
        .filter(Boolean)
        .sort((left, right) => Number(left) - Number(right))
        .at(-1) || '—'

    return {
      totalInvoices: invoices.length,
      totalAmount: formatMoney(totalAmount),
      selectedPeriod,
      lastDocumentNumber,
      totalLines,
      averageInvoiceValue: invoices.length ? formatMoney(totalAmount / invoices.length) : '—',
      averageLinesPerInvoice: invoices.length
        ? formatNumber(totalLines / invoices.length, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        : '—',
    }
  }, [invoices, selectedPeriod])

  const isImporting = useMemo(() => {
    return Object.values(importStatuses).some((status) => status.state === 'importing')
  }, [importStatuses])

  const importReadiness = useMemo(() => {
    const missingFiles = IMPORT_TYPES.filter((sourceType) => importStatuses[sourceType]?.state !== 'success')
    const blockingValidationCount = validationResults.filter((result) => ['ERROR', 'CRITICAL'].includes(result.severity)).length

    return {
      isReady: missingFiles.length === 0 && blockingValidationCount === 0,
      missingFiles,
      blockingValidationCount,
    }
  }, [importStatuses, validationResults])

  const hasImportedData = importReadiness.isReady

  function setImportTypeStatus(sourceType, status) {
    setImportStatuses((current) => ({
      ...current,
      [sourceType]: {
        ...current[sourceType],
        ...status,
      },
    }))
  }

  async function handleImport({ sourceType, file, validationError } = {}) {
    if (!sourceType || !file) {
      return
    }

    if (validationError) {
      setImportTypeStatus(sourceType, {
        state: 'error',
        fileName: file.name,
        message: validationError,
        validation: validationError,
      })
      setValidationResults((current) => [
        ...current.filter((result) => result.sourceType !== sourceType),
        {
          id: `${sourceType}-${Date.now()}`,
          sourceType,
          fileName: file.name,
          rowNumber: 'File',
          field: validationError.toLowerCase().includes('extension') || validationError.includes('.csv') ? 'extension' : 'filename',
          severity: 'ERROR',
          message: validationError,
        },
      ])
      setImportError(null)
      setImportStatus(null)
      pushToast({
        type: 'error',
        title: `${toImportLabel(sourceType)} file rejected`,
        description: validationError,
      })
      return
    }

    if (isImporting) {
      return
    }

    setImportTypeStatus(sourceType, {
      state: 'importing',
      fileName: file.name,
      message: `Uploading ${file.name}.`,
      validation: null,
    })
    setValidationResults((current) => current.filter((result) => result.sourceType !== sourceType))
    setImportError(null)
    setImportStatus(null)
    setPageError(null)

    try {
      const summary = await importSourceFile({ sourceType, file, year, month })
      setImportSummary(summary)
      setImportTypeStatus(sourceType, {
        state: 'success',
        fileName: file.name,
        message: toImportStatusMessage(summary, file.name),
        validation: null,
      })
      setImportStatus(toImportStatusMessage(summary, file.name))
      setValidationResults((current) => [
        ...current.filter((result) => result.sourceType !== sourceType),
        ...normalizeValidationResults(summary, sourceType, file.name),
      ])
      pushToast({
        type: 'success',
        title: `${toImportLabel(sourceType)} import completed`,
        description: toImportStatusMessage(summary, file.name),
      })
      await loadInvoices()
    } catch (error) {
      setImportTypeStatus(sourceType, {
        state: 'error',
        fileName: file.name,
        message: error.description || error.message || 'Import failed.',
        validation: null,
      })
      setValidationResults((current) => [
        ...current.filter((result) => result.sourceType !== sourceType),
        ...normalizeValidationResults(error, sourceType, file.name),
      ])
      setImportError(error)
      pushToast({
        type: 'error',
        title: error.title || `${toImportLabel(sourceType)} import failed`,
        description: 'Review the import row for details and retry when ready.',
      })
    }
  }

  async function handleBillingRunAction(action, event) {
    event?.preventDefault()
    if (isGenerating || health.status !== 'connected' || Number(year) < 1900 || Number(year) > 2100) {
      return
    }

    if (!importReadiness.isReady) {
      setGenerateError(createClientError('Billing run blocked', toReadinessMessage(importReadiness)))
      pushToast({
        type: 'error',
        title: 'Billing run blocked',
        description: toReadinessMessage(importReadiness),
      })
      return
    }

    setIsGenerating(true)
    setGenerateError(null)
    setGenerateStatus(null)
    setPageError(null)

    if (action === 'START' && invoices.length > 0 && !window.confirm('Invoices are already loaded for this selected period. Start a new billing run?')) {
      setIsGenerating(false)
      return
    }

    try {
      const result = await runBillingLifecycleAction(action, { billingRun, year, month })
      const normalizedRun = normalizeBillingRun(result)
      setBillingRun(normalizedRun)
      setGenerateStatus(toBillingRunStatusMessage(action, normalizedRun))
      pushToast({
        type: 'success',
        title: toBillingRunToastTitle(action),
        description: toBillingRunStatusMessage(action, normalizedRun),
      })
      await loadInvoices()
    } catch (error) {
      setGenerateError(error)
      pushToast({
        type: 'error',
        title: error.title || 'Billing run action failed',
        description: 'The billing run panel has the full error details.',
      })
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleView(documentNumber) {
    setSelectedInvoice(null)
    setIsDetailsLoading(true)
    setPageError(null)

    try {
      setSelectedInvoice(await getInvoice(documentNumber))
    } catch (error) {
      setPageError({ error, retry: () => handleView(documentNumber) })
      pushToast({
        type: 'error',
        title: error.title || 'Invoice details unavailable',
        description: 'The selected invoice could not be opened.',
      })
    } finally {
      setIsDetailsLoading(false)
    }
  }

  async function handleDownload(documentNumber) {
    setPageError(null)

    try {
      const { blob, fileName } = await downloadInvoice(documentNumber)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (error) {
      setPageError({ error, retry: () => handleDownload(documentNumber) })
      pushToast({
        type: 'error',
        title: error.title || 'Download failed',
        description: 'The invoice JSON download could not be started.',
      })
    }
  }

  function handlePreviousPeriod() {
    const current = new Date(Number(year), Number(month) - 1, 1)
    current.setMonth(current.getMonth() - 1)
    if (current.getFullYear() < 1900) {
      return
    }
    setYear(current.getFullYear())
    setMonth(current.getMonth() + 1)
  }

  function handleNextPeriod() {
    const current = new Date(Number(year), Number(month) - 1, 1)
    current.setMonth(current.getMonth() + 1)
    if (current.getFullYear() > 2100) {
      return
    }
    setYear(current.getFullYear())
    setMonth(current.getMonth() + 1)
  }

  const isBackendAvailable = health.status === 'connected'

  function focusImportWorkflow() {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    document
      .getElementById('billing-workflow-title')
      ?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <div className="app-shell">
      <Header
        selectedPeriod={selectedPeriod}
        theme={theme}
        onToggleTheme={() => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))}
      />

      <main className="dashboard">
        <BillingOverview
          selectedPeriod={selectedPeriod}
          healthStatus={health.status}
          importSummary={importSummary}
          invoicesCount={invoices.length}
          isImporting={isImporting}
          isGenerating={isGenerating}
          onImport={() => focusImportWorkflow()}
          onGenerate={() => handleBillingRunAction('START')}
        />

        {pageError && (
          <ErrorAlert error={pageError.error || pageError} onRetry={pageError.retry || loadInvoices} onDismiss={() => setPageError(null)} />
        )}

        <BillingWorkflow
          inputDirectory={health.details?.inputDirectory}
          importSummary={importSummary}
          importStatus={importStatus}
          importError={importError}
          importStatuses={importStatuses}
          validationResults={validationResults}
          generateStatus={generateStatus}
          generateError={generateError}
          billingRun={billingRun}
          isImporting={isImporting}
          isGenerating={isGenerating}
          selectedPeriod={selectedPeriod}
          months={MONTHS}
          years={years}
          month={month}
          year={year}
          isBackendAvailable={isBackendAvailable}
          invoicesCount={invoices.length}
          importReadiness={importReadiness}
          onImport={handleImport}
          onBillingRunAction={handleBillingRunAction}
          onMonthChange={setMonth}
          onYearChange={setYear}
          onPreviousPeriod={handlePreviousPeriod}
          onNextPeriod={handleNextPeriod}
          onDismissImport={() => {
            setImportStatus(null)
            setImportError(null)
          }}
          onDismissGenerate={() => {
            setGenerateStatus(null)
            setGenerateError(null)
          }}
        />

        <StatsCards stats={stats} isLoading={isInvoicesLoading} />

        <InvoiceTable
          invoices={invoices}
          isLoading={isInvoicesLoading}
          error={invoiceError}
          selectedPeriod={selectedPeriod}
          onRefresh={() => loadInvoices({ toastOnSuccess: true })}
          onView={handleView}
          onDownload={handleDownload}
          onStartImport={focusImportWorkflow}
          onClearError={() => setInvoiceError(null)}
        />
      </main>

      <InvoiceDetailsModal
        invoice={selectedInvoice}
        selectedPeriod={selectedPeriod}
        isLoading={isDetailsLoading}
        onClose={() => {
          setSelectedInvoice(null)
          setIsDetailsLoading(false)
        }}
        onDownload={handleDownload}
      />

      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
    </div>
  )
}

async function runBillingLifecycleAction(action, { billingRun, year, month }) {
  if (action === 'STOP') {
    return stopBillingRun(billingRun.id)
  }
  if (action === 'RESUME') {
    return resumeBillingRun(billingRun.id)
  }
  if (action === 'RESTART') {
    return restartBillingRun(billingRun.id)
  }
  return startBillingRun(year, month)
}

function normalizeBillingRun(run) {
  if (!run) {
    return null
  }

  const processedRecords = Number(run.processedRecords ?? run.processedCount ?? run.processed ?? 0)
  const failedRecords = Number(run.failedRecords ?? run.failedCount ?? run.failed ?? 0)
  const totalRecords = Number(run.totalRecords ?? run.totalCount ?? run.total ?? processedRecords + failedRecords)

  return {
    id: run.id || run.runId,
    status: run.status || 'NOT_STARTED',
    periodStart: run.periodStart,
    periodEnd: run.periodEnd,
    year: run.year,
    month: run.month,
    startedAt: run.startedAt || run.createdAt || run.startTime,
    endedAt: run.endedAt || run.completedAt || run.endTime,
    startedBy: run.startedBy || run.createdBy,
    processedRecords,
    failedRecords,
    totalRecords,
    frozenTariffVersion: run.frozenTariffVersion || run.tariffVersion || run.priceListVersion || '—',
  }
}

function toBillingRunStatusMessage(action, run) {
  const actionCopy = {
    START: 'started',
    STOP: 'paused',
    RESUME: 'resumed',
    RESTART: 'restarted',
  }
  return `Billing run ${run?.id || ''} ${actionCopy[action] || 'updated'} with status ${run?.status || 'UNKNOWN'}.`
}

function toBillingRunToastTitle(action) {
  const titles = {
    START: 'Billing run started',
    STOP: 'Billing run paused',
    RESUME: 'Billing run resumed',
    RESTART: 'Billing run restarted',
  }
  return titles[action] || 'Billing run updated'
}

function toImportLabel(sourceType) {
  const labels = {
    CUSTOMERS: 'Customers',
    USAGE: 'Usage',
    TARIFFS: 'Tariffs',
  }
  return labels[sourceType] || sourceType
}

function toImportStatusMessage(summary, fileName) {
  if (!summary) {
    return `${fileName} was accepted for import.`
  }

  if (summary.status && summary.importId) {
    return `${fileName} import is ${summary.status.toLowerCase()} as ${summary.importId}.`
  }

  const counts = [
    summary.importedUsers !== undefined ? `${summary.importedUsers} customers` : null,
    summary.importedReadings !== undefined ? `${summary.importedReadings} usage rows` : null,
    summary.importedPrices !== undefined ? `${summary.importedPrices} tariffs` : null,
  ].filter(Boolean)

  return counts.length ? `Imported ${counts.join(', ')} from ${fileName}.` : `${fileName} was imported.`
}

function normalizeValidationResults(payload, sourceType, fileName) {
  const candidates = payload?.validationErrors || payload?.details || payload?.errors || []
  const items = Array.isArray(candidates) ? candidates : [candidates]

  return items
    .map((item, index) => {
      if (typeof item === 'string') {
        return {
          id: `${sourceType}-${fileName}-${index}`,
          sourceType,
          fileName,
          rowNumber: 'File',
          field: 'structure',
          severity: 'WARNING',
          message: item,
        }
      }

      if (!item) {
        return null
      }

      return {
        id: item.id || `${sourceType}-${fileName}-${index}`,
        sourceType,
        fileName: item.fileName || fileName,
        rowNumber: item.rowNumber ?? item.row ?? 'File',
        field: item.field || item.column || 'structure',
        severity: String(item.severity || item.level || 'ERROR').toUpperCase(),
        message: item.message || item.reason || item.detail || 'Validation issue found.',
      }
    })
    .filter(Boolean)
}

function toReadinessMessage(readiness) {
  const messages = []
  if (readiness.missingFiles.length > 0) {
    messages.push(`Missing required imports: ${readiness.missingFiles.map(toImportLabel).join(', ')}.`)
  }
  if (readiness.blockingValidationCount > 0) {
    messages.push(`${readiness.blockingValidationCount} blocking validation error${readiness.blockingValidationCount === 1 ? '' : 's'} must be fixed.`)
  }
  return messages.join(' ')
}

function createClientError(title, description) {
  const error = new Error(description)
  error.title = title
  error.description = description
  error.kind = 'validation'
  error.technicalDetails = {
    category: 'client-readiness',
  }
  return error
}

export default App
