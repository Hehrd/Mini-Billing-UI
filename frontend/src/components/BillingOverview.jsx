import Button from './ui/Button.jsx'
import Badge from './ui/Badge.jsx'

function BillingOverview({
  selectedPeriod,
  importSummary,
  invoicesCount,
  isImporting,
  isGenerating,
  canImport,
  onImport,
  onGenerate,
}) {
  const status = getOverviewStatus({ importSummary, invoicesCount })
  const imported = Boolean(importSummary)
  const generated = invoicesCount > 0

  return (
    <section className="overview-panel" aria-labelledby="billing-overview-title">
      <div className="overview-content">
        <div className="overview-copy">
          <Badge tone={status.tone}>{status.label}</Badge>
          <h2 id="billing-overview-title">Billing Overview</h2>
          <p>
            Import source CSV files, generate invoices for the selected billing period, then review persisted documents
            and line-level charges.
          </p>
        </div>

        <div className="overview-actions">
          {canImport && (
            <Button type="button" onClick={onImport} disabled={isImporting}>
              {isImporting ? 'Importing' : imported ? 'Re-import CSV files' : 'Import CSV files'}
            </Button>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={onGenerate}
            disabled={isGenerating}
          >
            {isGenerating ? 'Generating' : 'Generate invoices'}
          </Button>
        </div>
      </div>

      <div className="overview-meta" aria-label="Billing workflow status">
        <div className="overview-period">
          <span>Selected period</span>
          <strong>{selectedPeriod}</strong>
        </div>

        <div className="workflow-strip">
          <WorkflowStep label="Stored source data" active={!generated} complete={imported} />
          <WorkflowStep label="Billing period selected" active={!generated} complete />
          <WorkflowStep label="Invoices generated" active={generated} complete={generated} />
        </div>

        <div className="overview-accent" aria-hidden="true">
          <span className="document-stack document-stack-one" />
          <span className="document-stack document-stack-two" />
          <span className="document-stack document-stack-three" />
        </div>
      </div>
    </section>
  )
}

function WorkflowStep({ label, active, complete }) {
  return (
    <div className={`workflow-step ${active ? 'active' : ''} ${complete ? 'complete' : ''}`.trim()}>
      <span aria-hidden="true" />
      <strong>{label}</strong>
    </div>
  )
}

function getOverviewStatus({ importSummary, invoicesCount }) {
  if (invoicesCount > 0) {
    return { label: 'Invoices generated', tone: 'success' }
  }
  if (importSummary) {
    return { label: 'Ready to generate', tone: 'primary' }
  }
  return { label: importSummary ? 'Ready to generate' : 'Using stored imports', tone: 'primary' }
}

export default BillingOverview
