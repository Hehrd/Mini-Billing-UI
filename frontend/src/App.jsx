import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  acceptReadingSelfReport,
  createReadingSelfReport,
  denyReadingSelfReport,
  downloadInvoice,
  startBillingRun,
  restartBillingRun,
  clearAuthSession,
  getAuditLogs,
  getBillingRunReport,
  getBillingRuns,
  getErrorLogs,
  getInvoice,
  getInvoices,
  getReadings,
  getReadingSelfReports,
  importCsvFiles,
  login,
  readStoredAuth,
  storeAuthSession,
  resumeBillingRun,
  stopBillingRun,
} from './api/invoicesApi.js'
import Header from './components/Header.jsx'
import LoginScreen from './components/LoginScreen.jsx'
import BillingOverview from './components/BillingOverview.jsx'
import BillingWorkflow from './components/BillingWorkflow.jsx'
import StatsCards from './components/StatsCards.jsx'
import InvoiceTable from './components/InvoiceTable.jsx'
import InvoiceDetailsModal from './components/InvoiceDetailsModal.jsx'
import ReportsView from './components/ReportsView.jsx'
import ReadingsView from './components/ReadingsView.jsx'
import LogsView from './components/LogsView.jsx'
import ErrorAlert from './components/ui/ErrorAlert.jsx'
import ToastStack from './components/ui/ToastStack.jsx'
import { formatMoney, formatNumber } from './utils/formatters.js'
import { APP_CONFIG, NAV_ITEMS, hasRole, isAdminRole, normalizeRole } from './config/appConfig.js'

const DEFAULT_START_DATE = `${APP_CONFIG.period.defaultYear}-${String(APP_CONFIG.period.defaultMonth).padStart(2, '0')}-01`
const DEFAULT_END_DATE = new Date(APP_CONFIG.period.defaultYear, APP_CONFIG.period.defaultMonth, 0).toISOString().slice(0, 10)

function App() {
  const [auth, setAuth] = useState(() => readStoredAuth())
  const [loginError, setLoginError] = useState(null)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [activeView, setActiveView] = useState('invoices')
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE)
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE)
  const [targetUserReference, setTargetUserReference] = useState('')
  const [invoices, setInvoices] = useState([])
  const [readings, setReadings] = useState([])
  const [readingSelfReports, setReadingSelfReports] = useState([])
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const [isInvoicesLoading, setIsInvoicesLoading] = useState(false)
  const [isReadingsLoading, setIsReadingsLoading] = useState(false)
  const [isSelfReportSubmitting, setIsSelfReportSubmitting] = useState(false)
  const [reviewingSelfReportId, setReviewingSelfReportId] = useState(null)
  const [isImporting, setIsImporting] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isDetailsLoading, setIsDetailsLoading] = useState(false)
  const [importSummary, setImportSummary] = useState(null)
  const [importStatus, setImportStatus] = useState(null)
  const [generateStatus, setGenerateStatus] = useState(null)
  const [importError, setImportError] = useState(null)
  const [generateError, setGenerateError] = useState(null)
  const [invoiceError, setInvoiceError] = useState(null)
  const [readingsError, setReadingsError] = useState(null)
  const [pageError, setPageError] = useState(null)
  const [billingRuns, setBillingRuns] = useState([])
  const [currentBillingRun, setCurrentBillingRun] = useState(null)
  const [reportsByRunId, setReportsByRunId] = useState({})
  const [reportsError, setReportsError] = useState(null)
  const [isReportsLoading, setIsReportsLoading] = useState(false)
  const [billingRunActionId, setBillingRunActionId] = useState(null)
  const [auditLogs, setAuditLogs] = useState([])
  const [errorLogs, setErrorLogs] = useState([])
  const [auditPage, setAuditPage] = useState({ number: 0, size: 20, totalElements: 0, totalPages: 0, first: true, last: true })
  const [errorLogPage, setErrorLogPage] = useState({ number: 0, size: 20, totalElements: 0, totalPages: 0, first: true, last: true })
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

  const normalizedRole = normalizeRole(auth?.role)
  const isAdmin = isAdminRole(normalizedRole)
  const generationUserReference = isAdmin ? targetUserReference.trim() || 'all' : auth?.reference
  const visibleActiveView = auth && canUseView(activeView, normalizedRole) ? activeView : 'invoices'

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
      const loadedInvoices = await getInvoices({ reference: isAdmin ? undefined : auth?.reference })
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
    if (!guardRole([APP_CONFIG.roles.admin], `Reports are available only to ${APP_CONFIG.roles.admin} users.`)) {
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

  const loadReadings = useCallback(async ({ toastOnSuccess = false } = {}) => {
    if (!guardRole([APP_CONFIG.roles.user, APP_CONFIG.roles.admin], 'Readings are available only to signed-in users.')) {
      return
    }
    setIsReadingsLoading(true)
    setReadingsError(null)
    try {
      const [loadedReadings, loadedSelfReports] = await Promise.all([
        getReadings({ reference: isAdmin ? undefined : auth?.reference }),
        getReadingSelfReports({ reference: isAdmin ? undefined : auth?.reference }),
      ])
      setReadings(loadedReadings)
      setReadingSelfReports(loadedSelfReports)
      if (toastOnSuccess) {
        pushToast({
          type: 'success',
          title: 'Readings refreshed',
          description: `${loadedReadings.length} readings and ${loadedSelfReports.length} self reports loaded.`,
        })
      }
    } catch (error) {
      setReadingsError(error)
      pushToast({ type: 'error', title: error.title || 'Readings failed', description: error.description || 'The readings screen could not be refreshed.' })
    } finally {
      setIsReadingsLoading(false)
    }
  }, [auth?.reference, isAdmin, pushToast])

  const submitReadingSelfReport = useCallback(async (request) => {
    if (!guardRole([APP_CONFIG.roles.user, APP_CONFIG.roles.admin], 'Sign in to submit a reading self report.')) {
      return
    }
    setIsSelfReportSubmitting(true)
    setReadingsError(null)
    try {
      const created = await createReadingSelfReport(request)
      setReadingSelfReports((current) => [created, ...current])
      pushToast({ type: 'success', title: 'Self report submitted', description: 'The request is pending admin review.' })
    } catch (error) {
      setReadingsError(error)
      pushToast({ type: 'error', title: error.title || 'Self report failed', description: error.description || 'The self report could not be submitted.' })
    } finally {
      setIsSelfReportSubmitting(false)
    }
  }, [pushToast])

  const reviewReadingSelfReport = useCallback(async (requestId, decision) => {
    if (!guardRole([APP_CONFIG.roles.admin], 'Only ADMIN users can review reading self reports.')) {
      return
    }
    setReviewingSelfReportId(requestId)
    setReadingsError(null)
    try {
      const accepted = decision === 'accept'
      const reviewed = accepted
        ? await acceptReadingSelfReport(requestId)
        : await denyReadingSelfReport(requestId)
      setReadingSelfReports((current) => current.map((request) => (request.id === requestId ? reviewed : request)))
      if (accepted) {
        await loadReadings()
      }
      pushToast({
        type: 'success',
        title: accepted ? 'Self report accepted' : 'Self report declined',
        description: `Request ${requestId} was ${accepted ? 'accepted' : 'declined'}.`,
      })
    } catch (error) {
      setReadingsError(error)
      pushToast({ type: 'error', title: error.title || 'Review failed', description: error.description || 'The self report could not be reviewed.' })
    } finally {
      setReviewingSelfReportId(null)
    }
  }, [loadReadings, pushToast])

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

  const loadLogs = useCallback(async ({ toastOnSuccess = false } = {}) => {
    if (!guardRole([APP_CONFIG.roles.admin], `${activeViewLabel('logs')} screens are available only to ${APP_CONFIG.roles.admin} users.`)) {
      return
    }
    setIsAuditLoading(true)
    setAuditError(null)
    try {
      const [auditResponse, errorResponse] = await Promise.all([
        getAuditLogs({ page: auditPage.number, size: auditPage.size }),
        getErrorLogs({ page: errorLogPage.number, size: errorLogPage.size }),
      ])
      setAuditLogs(auditResponse.content)
      setErrorLogs(errorResponse.content)
      setAuditPage(auditResponse)
      setErrorLogPage(errorResponse)
      if (toastOnSuccess) {
        pushToast({ type: 'success', title: 'Logs refreshed', description: 'Audit and error logs loaded.' })
      }
    } catch (error) {
      setAuditError(error)
      pushToast({ type: 'error', title: error.title || 'Logs failed', description: error.description || 'The logs screen could not be refreshed.' })
    } finally {
      setIsAuditLoading(false)
    }
  }, [auditPage.number, auditPage.size, errorLogPage.number, errorLogPage.size, pushToast])

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
    if (visibleActiveView === 'readings' && auth) {
      loadReadings()
    }
    if (visibleActiveView === 'logs' && isAdminRole(auth?.role)) {
      loadLogs()
    }
  }, [visibleActiveView, auth, auth?.role, loadLogs, loadReadings, loadReports])

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
      setReadings([])
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
    if (!guardRole([APP_CONFIG.roles.admin], `Only ${APP_CONFIG.roles.admin} users can start Billing Runs.`)) {
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
      const result = await startBillingRun({ startDate, endDate, reference: generationUserReference })
      setCurrentBillingRun(result)
      setBillingRuns((current) => [result, ...current.filter((run) => run.id !== result.id)])
      setGenerateStatus(
        `Billing Run ${result.id} started. Processing will continue in the background.`,
      )
      pushToast({
        type: 'success',
        title: 'Billing Run started',
        description: `Run ${result.id} is processing ${selectedPeriod} in the background.`,
      })
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

  async function handleBillingRunAction(run, action) {
    if (!guardRole([APP_CONFIG.roles.admin], `Only ${APP_CONFIG.roles.admin} users can manage Billing Runs.`)) {
      return
    }
    setBillingRunActionId(`${run.id}:${action}`)
    setReportsError(null)
    try {
      const updatedRun = action === 'stop'
        ? await stopBillingRun(run.id)
        : action === 'resume'
          ? await resumeBillingRun(run.id)
          : await restartBillingRun(run.id)
      setBillingRuns((current) => [updatedRun, ...current.filter((item) => item.id !== updatedRun.id)])
      setCurrentBillingRun(updatedRun)
      pushToast({
        type: 'success',
        title: action === 'stop' ? 'Billing Run paused' : action === 'resume' ? 'Billing Run resumed' : 'Billing Run restarted',
        description: `Run ${updatedRun.id} is ${String(updatedRun.status || '').toLowerCase().replaceAll('_', ' ')}.`,
      })
      await loadReports()
    } catch (error) {
      setReportsError(error)
      pushToast({
        type: 'error',
        title: error.title || 'Billing Run action failed',
        description: error.description || `The ${action} action could not be completed.`,
      })
    } finally {
      setBillingRunActionId(null)
    }
  }

  const canImport = isAdmin

  async function handleLogin(credentials) {
    setIsLoggingIn(true)
    setLoginError(null)

    try {
      const session = await login(credentials)
      storeAuthSession(session)
      setAuth(session)
      setActiveView('invoices')
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
    setActiveView('invoices')
    setInvoices([])
    setReadings([])
    setReadingSelfReports([])
    setSelectedInvoice(null)
    setImportSummary(null)
    setCurrentBillingRun(null)
    setPageError(null)
    setLoginError(null)
    setTargetUserReference('')
  }

  function guardRole(roles, message) {
    if (auth && hasRole(auth.role, roles)) {
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
          if (canUseView(view, normalizedRole)) {
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
            onRunAction={handleBillingRunAction}
            actionInProgress={billingRunActionId}
          />
        ) : visibleActiveView === 'readings' ? (
          <ReadingsView
            readings={readings}
            selfReports={readingSelfReports}
            isLoading={isReadingsLoading}
            isSubmitting={isSelfReportSubmitting}
            reviewingId={reviewingSelfReportId}
            error={readingsError}
            user={auth}
            onRefresh={() => loadReadings({ toastOnSuccess: true })}
            onSubmitSelfReport={submitReadingSelfReport}
            onReviewSelfReport={reviewReadingSelfReport}
            onClearError={() => setReadingsError(null)}
          />
        ) : visibleActiveView === 'logs' ? (
          <LogsView
            auditLogs={auditLogs}
            errorLogs={errorLogs}
            isLoading={isAuditLoading}
            error={auditError}
            user={auth}
            auditPage={auditPage}
            errorLogPage={errorLogPage}
            onRefresh={() => loadLogs({ toastOnSuccess: true })}
            onAuditPageChange={(nextPage) => setAuditPage((current) => ({ ...current, number: nextPage }))}
            onErrorLogPageChange={(nextPage) => setErrorLogPage((current) => ({ ...current, number: nextPage }))}
            onAuditPageSizeChange={(nextSize) => setAuditPage((current) => ({ ...current, number: 0, size: nextSize }))}
            onErrorLogPageSizeChange={(nextSize) => setErrorLogPage((current) => ({ ...current, number: 0, size: nextSize }))}
          />
        ) : (
          <>
            {isAdmin && (
              <BillingOverview
                selectedPeriod={selectedPeriod}
                importSummary={importSummary}
                invoicesCount={invoices.length}
                isImporting={isImporting}
                isGenerating={isGenerating}
                canImport={canImport}
                canGenerate={isAdmin}
                onImport={handleImport}
                onGenerate={() => handleGenerate()}
              />
            )}

            {pageError && (
              <ErrorAlert error={pageError.error || pageError} onRetry={pageError.retry || loadInvoices} onDismiss={() => setPageError(null)} />
            )}

          {isAdmin && (
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
              targetUserReference={targetUserReference}
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
              onTargetUserIdChange={setTargetUserReference}
              onDismissImport={() => {
                setImportStatus(null)
                setImportError(null)
              }}
              onDismissGenerate={() => {
                setGenerateStatus(null)
                setGenerateError(null)
              }}
            />
          )}

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
    logs: 'Logs',
    users: 'Users',
    invoices: 'Invoices',
  }[activeView] || 'Invoices'
}

function canUseView(view, role) {
  return NAV_ITEMS.some((item) => item.id === view && hasRole(role, item.roles))
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
