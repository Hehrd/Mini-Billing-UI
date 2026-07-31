import ImportCard from './ImportCard.jsx'
import GenerateInvoiceCard from './GenerateInvoiceCard.jsx'

function BillingWorkflow({
  importSummary,
  importStatus,
  importError,
  importStatuses,
  validationResults,
  generateStatus,
  generateError,
  billingRun,
  isImporting,
  isGenerating,
  selectedPeriod,
  startDate,
  endDate,
  targetUserId,
  currentUserReference,
  isAdmin,
  canImport,
  invoicesCount,
  onImport,
  onBillingRunAction,
  onStartDateChange,
  onEndDateChange,
  onTargetUserIdChange,
  onDismissImport,
  onDismissGenerate,
}) {
  const hasImportedData = Boolean(importSummary)
  const hasInvoices = invoicesCount > 0
  const steps = [
    getStepState('Configure billing period', {
      active: !hasInvoices,
      complete: true,
    }),
    getStepState('Generate and review invoices', {
      failed: Boolean(generateError),
      active: !hasInvoices,
      complete: hasInvoices,
    }),
  ]

  return (
    <section className="workflow-panel" aria-labelledby="billing-workflow-title">
      <div className="workflow-header">
        <div>
          <p className="eyebrow">Guided workflow</p>
          <h2 id="billing-workflow-title">Billing run setup</h2>
          <p>Choose a billing period and generate invoices from stored customer, usage, and tariff data.</p>
        </div>
      </div>

      <ol className="workflow-stepper" aria-label="Billing workflow steps">
        {steps.map((step, index) => (
          <li className={`workflow-stepper-item ${step.state}`} key={step.label}>
            <span className="workflow-step-index">{index + 1}</span>
            <div>
              <strong>{step.label}</strong>
              <span>{step.copy}</span>
            </div>
          </li>
        ))}
      </ol>

      <div className="workflow-grid">
        {canImport && (
          <ImportCard
            summary={importSummary}
            status={importStatus}
            error={importError}
            importStatuses={importStatuses}
            validationResults={validationResults}
            isLoading={isImporting}
            canImport={canImport}
            onImport={onImport}
            onDismiss={onDismissImport}
          />
        )}

        <GenerateInvoiceCard
          startDate={startDate}
          endDate={endDate}
          targetUserId={targetUserId}
          currentUserReference={currentUserReference}
          isAdmin={isAdmin}
          selectedPeriod={selectedPeriod}
          hasImportedData={hasImportedData}
          hasInvoices={hasInvoices}
          status={generateStatus}
          error={generateError}
          billingRun={billingRun}
          isLoading={isGenerating}
          onStartDateChange={onStartDateChange}
          onEndDateChange={onEndDateChange}
          onTargetUserIdChange={onTargetUserIdChange}
          onBillingRunAction={onBillingRunAction}
          onDismiss={onDismissGenerate}
        />
      </div>
    </section>
  )
}

function getStepState(label, { failed, active, complete }) {
  if (failed) {
    return { label, state: 'failed', copy: 'Needs attention' }
  }
  if (complete) {
    return { label, state: 'complete', copy: 'Complete' }
  }
  if (active) {
    return { label, state: 'active', copy: 'Active' }
  }
  return { label, state: 'pending', copy: 'Pending' }
}

export default BillingWorkflow
