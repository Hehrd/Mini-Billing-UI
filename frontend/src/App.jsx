import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  downloadInvoice,
  startBillingRun,
  clearAuthSession,
  getAuditLogs,
  getBillingRunReport,
  getBillingRuns,
  getErrorLogs,
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
import ReportsView from './components/ReportsView.jsx'
import AuditLogsView from './components/AuditLogsView.jsx'
import ErrorAlert from './components/ui/ErrorAlert.jsx'
import ToastStack from './components/ui/ToastStack.jsx'
import { formatMoney, formatNumber } from './utils/formatters.js'
import { APP_CONFIG, NAV_ITEMS, isAdminRole } from './config/appConfig.js'

const DEFAULT_START_DATE = `${APP_CONFIG.period.defaultYear}-${String(APP_CONFIG.period.defaultMonth).padStart(2, '0')}-01`
const DEFAULT_END_DATE = new Date(APP_CONFIG.period.defaultYear, APP_CONFIG.period.defaultMonth, 0).toISOString().slice(0, 10)

function App() {
  const [auth, setAuth] = useState(() => readStoredAuth())
  const [loginError, setLoginError] = useState(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [activeView, setActiveView] = useState('workspace')
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE)
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE)
  const [targetUserId, setTargetUserId] = useState('')
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
  const [billingRuns, setBillingRuns] = useState([])
  const [currentBillingRun, setCurrentBillingRun] = useState(null)
  const [reportsByRunId, setReportsByRunId] = useState({})
  const [reportsError, setReportsError] = useState(null)
  const [isReportsLoading, setIsReportsLoading] = useState(false)
  const [auditLogs, setAuditLogs] = useState([])
  const [errorLogs, setErrorLogs] = useState([])
  const [auditError, setAuditError] = useState(null)
  const [isAuditLoading, setIsAuditLoading] = useState(false)
  const [toasts, setToasts] = useState([])
  const invoiceRequestId = useRef(0)
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') {
      return 'light'
    }
    const savedTheme = window.localStorage.getItem(APP_CONFIG.themeStorageKey)
    if (savedTheme) {
      return savedTheme
    }
    return window.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
  })

  const isAdmin = isAdminRole(auth?.role)
  const generationUserId = isAdmin ? targetUserId.trim() || 'all' : auth?.reference
  const visibleActiveView = auth && canUseView(activeView, auth.role) ? activeView : 'workspace'

  const selectedPeriod = useMemo(() => {
    return startDate && endDate ? `${startDate} to ${endDate}` : '—'
  }, [endDate, startDate])

  const pushToast = useCallback((toast) => {
    const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
    setToasts((current) => [...current, { id, ...toast }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id))
    }, 4200)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    window.localStorage.setItem(APP_CONFIG.themeStorageKey, theme)
  }, [theme])

  const loadInvoices = useCallback(async ({ toastOnSuccess = false } = {}) => {
    const requestId = invoiceRequestId.current + 1
    invoiceRequestId.current = requestId
    setIsInvoicesLoading(true)
    setInvoiceError(null)

    try {
      const loadedInvoices = await getInvoices({ userId: isAdmin ? undefined : auth?.reference })
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
        description: error.description || 'The invoice register could not be refreshed.',
      })
    } finally {
      if (requestId === invoiceRequestId.current) {
        setIsInvoicesLoading(false)
      }
    }
  }, [auth?.reference, isAdmin, pushToast, selectedPeriod])

  const loadReports = useCallback(async ({ toastOnSuccess = false } = {}) => {
    if (!guardRole([APP_CONFIG.roles.user, APP_CONFIG.roles.admin], 'Reports are available only to signed-in users.')) {
      return
    }
    setIsReportsLoading(true)
    setReportsError(null)
    try {
      const page = await getBillingRuns()
      setBillingRuns(page.content)
      if (page.content[0]) {
        const report = await getBillingRunReport(page.content[0].id)
        setReportsByRunId((current) => ({ ...current, [page.content[0].id]: report }))
      }
      if (toastOnSuccess) {
        pushToast({ type: 'success', title: 'Reports refreshed', description: `${page.content.length} Billing Runs loaded.` })
      }
    } catch (error) {
      setReportsError(error)
      pushToast({ type: 'error', title: error.title || 'Reports failed', description: error.description || 'The reports screen could not be refreshed.' })
    } finally {
      setIsReportsLoading(false)
    }
  }, [pushToast])

  const loadReport = useCallback(async (runId) => {
    if (!runId || reportsByRunId[runId]) {
      return
    }
    try {
      const report = await getBillingRunReport(runId)
      setReportsByRunId((current) => ({ ...current, [runId]: report }))
    } catch (error) {
      setReportsError(error)
      pushToast({ type: 'error', title: error.title || 'Report failed', description: error.description || `Report ${runId} could not be loaded.` })
    }
  }, [pushToast, reportsByRunId])

  const loadAudit = useCallback(async ({ toastOnSuccess = false } = {}) => {
    if (!guardRole([APP_CONFIG.roles.admin], `${activeViewLabel('audit')} screens are available only to ${APP_CONFIG.roles.admin} users.`)) {
      return
    }
    setIsAuditLoading(true)
    setAuditError(null)
    try {
      const [auditPage, errorPage] = await Promise.all([getAuditLogs(), getErrorLogs()])
      setAuditLogs(auditPage.content)
      setErrorLogs(errorPage.content)
      if (toastOnSuccess) {
        pushToast({ type: 'success', title: 'Audit refreshed', description: 'Audit and error logs loaded.' })
      }
    } catch (error) {
      setAuditError(error)
      pushToast({ type: 'error', title: error.title || 'Audit failed', description: error.description || 'The audit screen could not be refreshed.' })
    } finally {
      setIsAuditLoading(false)
    }
  }, [pushToast])

  useEffect(() => {
    setInvoices([])
    setInvoiceError(null)
  }, [endDate, startDate])

  useEffect(() => {
    if (!auth) {
      return
    }
    loadInvoices()
  }, [auth, loadInvoices])

  useEffect(() => {
    if (visibleActiveView === 'reports' && isAdminRole(auth?.role)) {
      loadReports()
    }
    if (visibleActiveView === 'audit' && isAdminRole(auth?.role)) {
      loadAudit()
    }
  }, [visibleActiveView, auth?.role, loadAudit, loadReports])

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

  async function handleImport(files = {}) {
    if (!guardRole([APP_CONFIG.roles.admin], `Only ${APP_CONFIG.roles.admin} users can import source data.`)) {
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
      const summary = await importCsvFiles({ ...files, uploadedBy: auth.reference })
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
        description: error.description || 'Review the import panel for details and retry when ready.',
      })
    } finally {
      setIsImporting(false)
    }
  }

  async function handleGenerate(event) {
    event?.preventDefault()
    if (!guardRole([APP_CONFIG.roles.user, APP_CONFIG.roles.admin], `Sign in with a ${APP_CONFIG.roles.user} or ${APP_CONFIG.roles.admin} account to generate invoices.`)) {
      return
    }
    if (isGenerating || !dateRangeIsValid(startDate, endDate)) {
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
      const result = await startBillingRun({ startDate, endDate, userId: generationUserId })
      setCurrentBillingRun(result)
      setBillingRuns((current) => [result, ...current.filter((run) => run.id !== result.id)])
      setGenerateStatus(
        `Billing Run ${result.id} finished with ${result.processedRecords} processed and ${result.failedRecords} failed.`,
      )
      pushToast({
        type: 'success',
        title: 'Billing Run completed',
        description: `${result.processedRecords} processed, ${result.failedRecords} failed for ${selectedPeriod}.`,
      })
      await loadInvoices()
    } catch (error) {
      setGenerateError(error)
      pushToast({
        type: 'error',
        title: error.title || 'Generation failed',
        description: error.description || 'The generation panel has the full error details.',
      })
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleView(documentNumber) {
    if (!guardRole([APP_CONFIG.roles.user, APP_CONFIG.roles.admin], 'Sign in to view invoice details.')) {
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
        description: error.description || 'The selected invoice could not be opened.',
      })
    } finally {
      setIsDetailsLoading(false)
    }
  }

  async function handleDownload(documentNumber) {
    if (!guardRole([APP_CONFIG.roles.user, APP_CONFIG.roles.admin], 'Sign in to download invoices.')) {
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
        description: error.description || 'The invoice PDF download could not be started.',
      })
    }
  }

  function handleExportReport(run, report) {
    if (!run || !report) {
      return
    }
    const rows = [
      ['runId', 'periodStart', 'periodEnd', 'status', 'processedRecords', 'successfulInvoices', 'failedRecords', 'failureSummary'],
      [run.id, run.periodStart, run.periodEnd, run.status, report.processedRecords, report.successfulInvoices, report.failedRecords, report.failureSummary || ''],
    ]
    const csv = rows.map((row) => row.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `billing-run-${run.id}-report.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

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
    setCurrentBillingRun(null)
    setPageError(null)
    setLoginError(null)
    setTargetUserId('')
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
    if (!isAdmin) {
      return
    }
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
        activeView={visibleActiveView}
        onViewChange={(view) => {
          if (canUseView(view, auth.role)) {
            setActiveView(view)
          }
        }}
        onLogout={handleLogout}
        onToggleTheme={() => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))}
      />

      <main className="dashboard">
        {visibleActiveView === 'reports' ? (
          <ReportsView
            billingRuns={billingRuns}
            reportsByRunId={reportsByRunId}
            isLoading={isReportsLoading}
            error={reportsError}
            onRefresh={() => loadReports({ toastOnSuccess: true })}
            onSelectRun={loadReport}
            onExport={handleExportReport}
          />
        ) : visibleActiveView === 'audit' ? (
          <AuditLogsView
            auditLogs={auditLogs}
            errorLogs={errorLogs}
            isLoading={isAuditLoading}
            error={auditError}
            user={auth}
            onRefresh={() => loadAudit({ toastOnSuccess: true })}
          />
        ) : (
          <>
            <BillingOverview
              selectedPeriod={selectedPeriod}
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
            importSummary={importSummary}
            importStatus={importStatus}
            importError={importError}
            generateStatus={generateStatus}
            generateError={generateError}
            billingRun={currentBillingRun}
            isImporting={isImporting}
            isGenerating={isGenerating}
            selectedPeriod={selectedPeriod}
            startDate={startDate}
            endDate={endDate}
            targetUserId={targetUserId}
            currentUserReference={auth.reference}
            isAdmin={isAdmin}
            canImport={canImport}
            invoicesCount={invoices.length}
            onImport={handleImport}
            onBillingRunAction={(action) => {
              if (action === 'START' || action === 'RESTART') {
                handleGenerate()
              }
            }}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            onTargetUserIdChange={setTargetUserId}
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
          errorLogs={errorLogs}
          isLoading={isInvoicesLoading}
          error={invoiceError}
          selectedPeriod={selectedPeriod}
          user={auth}
          onRefresh={() => loadInvoices({ toastOnSuccess: true })}
          onView={handleView}
          onDownload={handleDownload}
          onStartImport={isAdmin ? focusImportWorkflow : null}
          onClearError={() => setInvoiceError(null)}
        />
          </>
        )}
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

function canUseView(view, role) {
  return NAV_ITEMS.some((item) => item.id === view && item.roles.includes(role))
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

export default App
