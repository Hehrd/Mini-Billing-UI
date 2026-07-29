import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  downloadInvoice,
  generateInvoices,
  clearAuthSession,
  getHealth,
  getInvoice,
  getInvoices,
  importCsvFiles,
  login,
  readStoredAuth,
  storeAuthSession,
} from './api/invoicesApi.js'
import Header from './components/Header.jsx'
import LoginScreen from './components/LoginScreen.jsx'
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

function App() {
  const [auth, setAuth] = useState(() => readStoredAuth())
  const [loginError, setLoginError] = useState(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [activeView, setActiveView] = useState('workspace')
  const [year, setYear] = useState(DEFAULT_YEAR)
  const [month, setMonth] = useState(DEFAULT_MONTH)
  const [invoices, setInvoices] = useState([])
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [isInvoicesLoading, setIsInvoicesLoading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
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

  const isAdmin = auth?.role === 'ADMIN'

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
      if (auth && error.status === 404) {
        setHealth({ status: 'connected', message: 'API authenticated', details: { healthEndpoint: 'missing' } })
        return
      }
      setHealth({ status: 'offline', message: error.message })
    }
  }, [auth])

  useEffect(() => {
    loadHealth()
  }, [auth, loadHealth])

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
    if (!auth) {
      return
    }
    loadInvoices()
  }, [auth, loadInvoices])

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

  async function handleImport() {
    if (!guardRole(['ADMIN'], 'Only ADMIN users can import source data.')) {
      return
    }
    if (isImporting) {
      return
    }

    setIsImporting(true)
    setImportError(null)
    setImportStatus(null)
    setPageError(null)

    try {
      const summary = await importCsvFiles()
      setImportSummary(summary)
      setImportStatus(
        `Imported ${summary.importedUsers} users, ${summary.importedReadings} readings and ${summary.importedPrices} prices.`,
      )
      pushToast({
        type: 'success',
        title: 'CSV import completed',
        description: `${summary.importedUsers} users, ${summary.importedReadings} readings and ${summary.importedPrices} prices imported.`,
      })
      await loadInvoices()
    } catch (error) {
      setImportError(error)
      pushToast({
        type: 'error',
        title: error.title || 'Import failed',
        description: 'Review the import panel for details and retry when ready.',
      })
    } finally {
      setIsImporting(false)
    }
  }

  async function handleGenerate(event) {
    event?.preventDefault()
    if (!guardRole(['USER', 'ADMIN'], 'Sign in with a USER or ADMIN account to generate invoices.')) {
      return
    }
    if (isGenerating || health.status !== 'connected' || Number(year) < 1900 || Number(year) > 2100) {
      return
    }

    setIsGenerating(true)
    setGenerateError(null)
    setGenerateStatus(null)
    setPageError(null)

    if (invoices.length > 0 && !window.confirm('Invoices are already loaded for this selected period. Generate again?')) {
      setIsGenerating(false)
      return
    }

    try {
      const result = await generateInvoices(year, month)
      setGenerateStatus(
        `Generated ${result.generatedCount} invoice${result.generatedCount === 1 ? '' : 's'}${
          result.skippedExistingCount ? ` and skipped ${result.skippedExistingCount} existing.` : '.'
        }`,
      )
      pushToast({
        type: 'success',
        title: 'Invoice generation completed',
        description: `${result.generatedCount} generated, ${result.skippedExistingCount} skipped for ${selectedPeriod}.`,
      })
      await loadInvoices()
    } catch (error) {
      setGenerateError(error)
      pushToast({
        type: 'error',
        title: error.title || 'Generation failed',
        description: 'The generation panel has the full error details.',
      })
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleView(documentNumber) {
    if (!guardRole(['USER', 'ADMIN'], 'Sign in to view invoice details.')) {
      return
    }
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
    if (!guardRole(['USER', 'ADMIN'], 'Sign in to download invoices.')) {
      return
    }
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
  const canImport = isAdmin

  async function handleLogin(credentials) {
    setIsLoggingIn(true)
    setLoginError(null)

    try {
      const session = await login(credentials)
      storeAuthSession(session)
      setAuth(session)
      setActiveView('workspace')
      pushToast({
        type: 'success',
        title: 'Signed in',
        description: `${session.username} authenticated as ${session.role}.`,
      })
    } catch (error) {
      setLoginError(error)
    } finally {
      setIsLoggingIn(false)
    }
  }

  function handleLogout() {
    clearAuthSession()
    setAuth(null)
    setActiveView('workspace')
    setInvoices([])
    setSelectedInvoice(null)
    setImportSummary(null)
    setPageError(null)
    setLoginError(null)
  }

  function guardRole(roles, message) {
    if (auth && roles.includes(auth.role)) {
      return true
    }
    const error = new Error(message)
    error.title = 'Action not allowed'
    error.description = message
    error.kind = 'authorization'
    setPageError({ error })
    pushToast({ type: 'error', title: error.title, description: message })
    return false
  }

  function focusImportWorkflow() {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    document
      .getElementById('billing-workflow-title')
      ?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  }

  if (!auth) {
    return (
      <div className="app-shell">
        <LoginScreen
          error={loginError}
          isLoading={isLoggingIn}
          theme={theme}
          onLogin={handleLogin}
          onToggleTheme={() => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))}
        />
        <ToastStack toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((toast) => toast.id !== id))} />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Header
        selectedPeriod={selectedPeriod}
        theme={theme}
        user={auth}
        activeView={activeView}
        onViewChange={setActiveView}
        onLogout={handleLogout}
        onToggleTheme={() => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))}
      />

      <main className="dashboard">
        {activeView !== 'workspace' && (
          <section className="guard-panel" role="status">
            <strong>{activeViewLabel(activeView)}</strong>
            <p>This section is available in the ADMIN menu shell. The detailed screen is not implemented yet.</p>
          </section>
        )}

        <BillingOverview
          selectedPeriod={selectedPeriod}
          healthStatus={health.status}
          importSummary={importSummary}
          invoicesCount={invoices.length}
          isImporting={isImporting}
          isGenerating={isGenerating}
          canImport={canImport}
          onImport={handleImport}
          onGenerate={() => handleGenerate()}
        />

        {pageError && (
          <ErrorAlert error={pageError.error || pageError} onRetry={pageError.retry || loadInvoices} onDismiss={() => setPageError(null)} />
        )}

        <BillingWorkflow
          inputDirectory={health.details?.inputDirectory}
          importSummary={importSummary}
          importStatus={importStatus}
          importError={importError}
          generateStatus={generateStatus}
          generateError={generateError}
          isImporting={isImporting}
          isGenerating={isGenerating}
          selectedPeriod={selectedPeriod}
          months={MONTHS}
          years={years}
          month={month}
          year={year}
          isBackendAvailable={isBackendAvailable}
          canImport={canImport}
          invoicesCount={invoices.length}
          onImport={handleImport}
          onGenerate={handleGenerate}
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

function activeViewLabel(activeView) {
  return {
    'billing-runs': 'Billing runs',
    reports: 'Reports',
    audit: 'Audit',
    users: 'Users',
  }[activeView] || 'Workspace'
}

export default App
