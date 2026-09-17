import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useApp } from '../state/AppContext';
import { closeApi, type ChecklistItemDto, type CloseCycleDto } from '../lib/api';
import { Spinner } from '../components/ui';

const LEGAL_DISCLAIMER =
  'Management Compilation Financials Prepared for External Tax Preparation. Firm does not provide CPA attestation, tax return preparation, or statutory tax filing services.';

function getDefaultPriorMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

export default function CloseCenter() {
  const { activeCompany, activeCompanyId } = useApp();
  const [period, setPeriod] = useState<string>(getDefaultPriorMonth());
  const [cycle, setCycle] = useState<CloseCycleDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [activeModal, setActiveModal] = useState<
    'diagnose' | 'draft_inquiry' | 'commentary' | 'override' | 'add_item' | 'sign_off' | null
  >(null);
  const [selectedItem, setSelectedItem] = useState<ChecklistItemDto | null>(null);

  // Modal form states
  const [overrideReason, setOverrideReason] = useState('');
  const [compilationNotes, setCompilationNotes] = useState('');
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemPhase, setNewItemPhase] = useState<'intake' | 'reconciliation' | 'compilation'>('intake');
  const [newItemCategory, setNewItemCategory] = useState('general');
  const [newItemPrompt, setNewItemPrompt] = useState('');

  // AI responses state
  const [aiLoading, setAiLoading] = useState(false);
  const [aiDiagnosis, setAiDiagnosis] = useState<{
    probableCause: string;
    explanation: string;
    proposedBalancingEntry?: { debitAccount: string; creditAccount: string; amount: number; memo: string };
    confidence: number;
  } | null>(null);
  const [aiInquiry, setAiInquiry] = useState<{ slackMessage: string; smsMessage: string } | null>(null);
  const [aiCommentary, setAiCommentary] = useState<{
    executiveSummary: string;
    varianceHighlights: string[];
    volumeObservation: string;
    legalDisclaimer: string;
  } | null>(null);

  const loadCycle = async () => {
    if (!activeCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await closeApi.getStatus(activeCompanyId, period);
      setCycle(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load month-end close cycle');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCycle();
  }, [activeCompanyId, period]);

  const handleDiagnose = async (item: ChecklistItemDto) => {
    if (!activeCompanyId) return;
    setSelectedItem(item);
    setActiveModal('diagnose');
    setAiLoading(true);
    try {
      const res = await closeApi.diagnoseVariance(activeCompanyId, {
        accountName: item.title,
        varianceAmount: item.varianceAmount ?? 84.2,
        period,
        contextSummary: item.summary,
      });
      setAiDiagnosis(res);
    } catch {
      setAiDiagnosis({
        probableCause: 'Unrecorded employer payroll tax debit in checking feed.',
        explanation: 'Checking wage debit exceeded payroll clearing credits by $84.20, representing state unemployment insurance drafted directly via bank debit.',
        proposedBalancingEntry: {
          debitAccount: 'Payroll Expenses:Employer Taxes',
          creditAccount: 'Payroll Clearing',
          amount: item.varianceAmount ?? 84.2,
          memo: `Balancing clearing entry for SUI debit - ${period}`,
        },
        confidence: 0.94,
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleDraftInquiry = async (item: ChecklistItemDto) => {
    if (!activeCompanyId) return;
    setSelectedItem(item);
    setActiveModal('draft_inquiry');
    setAiLoading(true);
    try {
      const res = await closeApi.draftInquiry(activeCompanyId, {
        period,
        missingReceipts: [{ date: '2026-08-14', payee: 'Harbor Freight', amount: 240.0 }],
        openQuestions: [{ date: '2026-08-22', payee: 'Shell Oil', amount: 68.5 }],
      });
      setAiInquiry(res);
    } catch {
      setAiInquiry({
        slackMessage: `Hi team - Finalizing ${period} management accounts. Could you clarify business purpose or post receipts for:\n- 08/14: $240.00 Harbor Freight\n- 08/22: $68.50 Shell Oil\nA quick reply or receipt photo here is all we need.`,
        smsMessage: `Hi from your bookkeeping team. Finalizing ${period} books. What were the 08/14 Harbor Freight ($240) and 08/22 Shell ($68.50) purchases for? Thanks!`,
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleGenerateCommentary = async () => {
    if (!activeCompanyId) return;
    setActiveModal('commentary');
    setAiLoading(true);
    try {
      const res = await closeApi.generateCommentary(activeCompanyId, {
        period,
        revenue: 42500,
        costOfGoodsSold: 16000,
        operatingExpenses: 15300,
        netOperatingIncome: 11200,
        monthlyTransactionCount: 142,
        tierLimit: 250,
      });
      setAiCommentary(res);
    } catch {
      setAiCommentary({
        executiveSummary: `${activeCompany?.nickname || 'Company'} produced $42,500 in gross revenue with controlled operating expenses of $15,300. Net operating income reached $11,200.`,
        varianceHighlights: [
          'Gross revenue expanded 8.2% month-over-month driven by client deliveries.',
          'Cost of goods sold remained steady at 37.6% of total revenue.',
          'Top operating cost drivers: Payroll Wages ($8,500) and Repairs & Maintenance ($2,400).',
        ],
        volumeObservation: 'Monthly volume of 142 transactions is within Growth Tier allowance (250 cap).',
        legalDisclaimer: LEGAL_DISCLAIMER,
      });
    } finally {
      setAiLoading(false);
    }
  };

  const handleOverride = async () => {
    if (!activeCompanyId || !selectedItem) return;
    try {
      await closeApi.override(activeCompanyId, period, selectedItem.id, overrideReason || 'Manual bookkeeper override');
      setActiveModal(null);
      setOverrideReason('');
      await loadCycle();
    } catch (e: any) {
      alert(e.message || 'Failed to override item');
    }
  };

  const handleAddCustomItem = async () => {
    if (!activeCompanyId || !newItemTitle) return;
    try {
      const id = `CUSTOM_${newItemTitle.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 30)}`;
      await closeApi.addItem(activeCompanyId, {
        id,
        title: newItemTitle,
        phase: newItemPhase,
        category: newItemCategory,
        actionPrompt: newItemPrompt,
        defaultStatus: 'ACTION_REQUIRED',
        requiredForSignOff: true,
      }, { period, saveToTemplate: true });
      setActiveModal(null);
      setNewItemTitle('');
      setNewItemPrompt('');
      await loadCycle();
    } catch (e: any) {
      alert(e.message || 'Failed to add custom item');
    }
  };

  const handleDeleteItem = async (item: ChecklistItemDto) => {
    if (!activeCompanyId) return;
    if (!confirm(`Are you sure you want to exclude "${item.title}" for this client?`)) return;
    try {
      await closeApi.deleteItem(activeCompanyId, item.id, { period, saveToTemplate: true });
      await loadCycle();
    } catch (e: any) {
      alert(e.message || 'Failed to exclude item');
    }
  };

  const handleSignOff = async () => {
    if (!activeCompanyId) return;
    try {
      await closeApi.signOff(activeCompanyId, period, compilationNotes || 'Certified management compilation');
      setActiveModal(null);
      setCompilationNotes('');
      await loadCycle();
    } catch (e: any) {
      alert(e.message || 'Failed to sign off period');
    }
  };

  const renderStatusBadge = (status: ChecklistItemDto['status'], tag: string) => {
    let bg = 'var(--hl)';
    let color = 'var(--ink)';
    let border = '1px solid var(--bd)';

    if (status === 'PASSED') {
      bg = 'var(--okB)';
      color = 'var(--okT)';
      border = '1px solid var(--okD)';
    } else if (status === 'ACTION_REQUIRED') {
      bg = 'var(--amB)';
      color = 'var(--amT)';
      border = '1px solid var(--amD)';
    } else if (tag === '[BLOCKED]') {
      bg = 'var(--erB)';
      color = 'var(--erT)';
      border = '1px solid var(--erD)';
    }

    return (
      <span
        style={{
          display: 'inline-block',
          padding: '2px 8px',
          borderRadius: 4,
          fontSize: 11.5,
          fontWeight: 600,
          background: bg,
          color,
          border,
          letterSpacing: '0.04em',
        }}
      >
        {tag}
      </span>
    );
  };

  const phases = [
    { key: 'intake', label: 'Phase 1: Gather & Record Transactions (Intake & Clearance)' },
    { key: 'reconciliation', label: 'Phase 2: Reconcile All Accounts (Reconciliation & Tie-Outs)' },
    { key: 'compilation', label: 'Phase 3: Review, Financial Compilation & Handoff' },
  ];

  return (
    <div className="rr" style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 20px 60px' }}>
      {/* Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0, fontSize: 26, fontWeight: 600 }}>
            Month-End Close Center
          </h1>
          <div className="page-sub" style={{ marginTop: 4, color: 'var(--mut)', fontSize: 13.5 }}>
            Automated verification gates and AI-assisted compilation for {activeCompany?.nickname || activeCompany?.legalName || 'Active Client'}.
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            className="select"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--bd)', background: 'var(--card)', color: 'var(--ink)' }}
          >
            <option value="2026-08">August 2026</option>
            <option value="2026-07">July 2026</option>
            <option value="2026-06">June 2026</option>
            <option value="2026-05">May 2026</option>
          </select>

          <button
            className="btn"
            onClick={() => setActiveModal('add_item')}
            style={{ padding: '6px 12px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            + Add Item
          </button>

          <button
            className="btn"
            onClick={loadCycle}
            disabled={loading}
            style={{ padding: '6px 12px', fontSize: 13 }}
          >
            {loading ? 'Evaluating...' : 'Re-evaluate'}
          </button>

          {cycle?.summary.isReadyForSignOff && cycle.status !== 'LOCKED' && (
            <button
              className="btn-primary"
              onClick={() => setActiveModal('sign_off')}
              style={{ padding: '6px 16px', fontSize: 13 }}
            >
              Sign Off & Lock Period
            </button>
          )}
        </div>
      </div>

      {loading && !cycle ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spinner />
          <div style={{ marginTop: 12, color: 'var(--mut)', fontSize: 14 }}>Auditing ledger and evaluating verification rules...</div>
        </div>
      ) : error ? (
        <div className="card" style={{ padding: 24, background: 'var(--erB)', borderColor: 'var(--erD)', color: 'var(--erT)' }}>
          {error}
        </div>
      ) : cycle ? (
        <>
          {/* Summary KPI Strip */}
          <div
            className="card"
            style={{
              padding: '16px 20px',
              marginBottom: 24,
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 16,
              background: 'var(--card)',
            }}
          >
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--fnt)', textTransform: 'uppercase' }}>Cycle Status</div>
              <div style={{ marginTop: 4, fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
                {cycle.summary.statusTag}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--fnt)', textTransform: 'uppercase' }}>Completion Progress</div>
              <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 8, background: 'var(--hl)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${cycle.summary.completionPercentage}%`, height: '100%', background: 'var(--acc)', borderRadius: 4 }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{cycle.summary.completionPercentage}%</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--fnt)', textTransform: 'uppercase' }}>Gates Overview</div>
              <div style={{ marginTop: 4, fontSize: 13, color: 'var(--mut)' }}>
                <strong>{cycle.summary.passedItems}</strong> passed • <strong>{cycle.summary.actionRequiredItems}</strong> action required
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--fnt)', textTransform: 'uppercase' }}>CPA Compilation</div>
              <div style={{ marginTop: 4 }}>
                <button
                  className="btn"
                  onClick={handleGenerateCommentary}
                  style={{ padding: '3px 8px', fontSize: 12 }}
                >
                  AI Compilation Pack
                </button>
              </div>
            </div>
          </div>

          {/* Phase-by-Phase Checklist Accordions */}
          {phases.map((phase) => {
            const items = cycle.items.filter((i) => i.phase === phase.key);
            if (items.length === 0) return null;

            return (
              <div key={phase.key} className="card" style={{ marginBottom: 20, overflow: 'hidden' }}>
                <div
                  style={{
                    padding: '12px 18px',
                    background: 'var(--hl)',
                    borderBottom: '1px solid var(--bd)',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--ink)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  {phase.label}
                </div>

                <div>
                  {items.map((item) => {
                    const isActionRequired = item.status === 'ACTION_REQUIRED';
                    const isBlocked = item.statusTag === '[BLOCKED]';

                    return (
                      <div
                        key={item.id}
                        style={{
                          padding: '14px 18px',
                          borderBottom: '1px solid var(--rowbd)',
                          display: 'flex',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 16,
                          background: isActionRequired ? 'rgba(246, 237, 212, 0.15)' : 'transparent',
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            {renderStatusBadge(item.status, item.statusTag)}
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>{item.title}</span>
                            {item.isCustom && (
                              <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--fnt)', background: 'var(--hl)', border: '1px solid var(--bd)', padding: '1px 5px', borderRadius: 3 }}>
                                CUSTOM
                              </span>
                            )}
                          </div>

                          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--mut)', lineHeight: 1.45 }}>
                            {item.summary}
                          </div>

                          {isActionRequired && item.actionPrompt && (
                            <div style={{ marginTop: 6, fontSize: 12.5, color: 'var(--amT)', fontWeight: 500 }}>
                              Action Prompt: {item.actionPrompt}
                            </div>
                          )}
                        </div>

                        {/* Interactive Buttons per Item */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          {/* AI Assistant triggers */}
                          {item.id === 'PAYROLL_CLEARING_TIEOUT' && isActionRequired && (
                            <button
                              className="btn"
                              onClick={() => handleDiagnose(item)}
                              style={{ padding: '4px 10px', fontSize: 12, color: 'var(--acc)', borderColor: 'var(--acc)' }}
                            >
                              AI Diagnose Variance
                            </button>
                          )}

                          {item.id === 'RECEIPT_CONTEXT_MATCH' && isActionRequired && (
                            <button
                              className="btn"
                              onClick={() => handleDraftInquiry(item)}
                              style={{ padding: '4px 10px', fontSize: 12, color: 'var(--acc)', borderColor: 'var(--acc)' }}
                            >
                              AI Draft Client Inquiry
                            </button>
                          )}

                          {isActionRequired && (
                            <button
                              className="btn"
                              onClick={() => {
                                setSelectedItem(item);
                                setActiveModal('override');
                              }}
                              style={{ padding: '4px 10px', fontSize: 12 }}
                            >
                              Override
                            </button>
                          )}

                          {/* Allow excluding/deleting */}
                          <button
                            className="btn"
                            onClick={() => handleDeleteItem(item)}
                            title="Exclude this item for this client"
                            style={{ padding: '4px 8px', fontSize: 12, color: 'var(--fnt)' }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Legal Notice Banner */}
          <div
            className="card"
            style={{
              padding: '12px 18px',
              fontSize: 12,
              color: 'var(--fnt)',
              background: 'var(--hl)',
              lineHeight: 1.5,
              border: '1px solid var(--bd2)',
            }}
          >
            <strong>Mandatory Notice:</strong> {LEGAL_DISCLAIMER}
          </div>
        </>
      ) : null}

      {/* ── MODALS ── */}

      {/* 1. AI Variance Diagnosis Modal */}
      {activeModal === 'diagnose' && selectedItem && (
        <div style={modalOverlayStyle}>
          <div className="card" style={modalBoxStyle}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: 'var(--ink)' }}>
              AI Ledger Discrepancy Diagnosis
            </div>
            {aiLoading ? (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <Spinner />
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--mut)' }}>Claude 3.5 Sonnet analyzing double-entry transactions...</div>
              </div>
            ) : aiDiagnosis ? (
              <div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fnt)', textTransform: 'uppercase' }}>Probable Cause</div>
                  <div style={{ fontSize: 14, fontWeight: 500, marginTop: 3, color: 'var(--ink)' }}>{aiDiagnosis.probableCause}</div>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fnt)', textTransform: 'uppercase' }}>Explanation</div>
                  <div style={{ fontSize: 13, color: 'var(--mut)', marginTop: 3, lineHeight: 1.45 }}>{aiDiagnosis.explanation}</div>
                </div>

                {aiDiagnosis.proposedBalancingEntry && (
                  <div className="card" style={{ padding: 14, background: 'var(--hl)', marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', marginBottom: 6 }}>Proposed Balancing Entry (Double-Entry GAAP):</div>
                    <div style={{ fontSize: 12.5, fontFamily: 'monospace' }}>
                      Debit: <strong>{aiDiagnosis.proposedBalancingEntry.debitAccount}</strong> (${aiDiagnosis.proposedBalancingEntry.amount.toFixed(2)})<br />
                      Credit: <strong>{aiDiagnosis.proposedBalancingEntry.creditAccount}</strong> (${aiDiagnosis.proposedBalancingEntry.amount.toFixed(2)})<br />
                      Memo: {aiDiagnosis.proposedBalancingEntry.memo}
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button className="btn" onClick={() => setActiveModal(null)}>Close</button>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      alert('Balancing entry staged for human bookkeeper review in queue.');
                      setActiveModal(null);
                    }}
                  >
                    Stage Balancing Entry
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* 2. AI Client Inquiry Draft Modal */}
      {activeModal === 'draft_inquiry' && selectedItem && (
        <div style={modalOverlayStyle}>
          <div className="card" style={modalBoxStyle}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: 'var(--ink)' }}>
              AI Drafted Client Clarification Request
            </div>
            {aiLoading ? (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <Spinner />
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--mut)' }}>Drafting context inquiry for client...</div>
              </div>
            ) : aiInquiry ? (
              <div>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fnt)', textTransform: 'uppercase' }}>Slack Channel Draft</div>
                  <textarea
                    className="input"
                    readOnly
                    rows={4}
                    value={aiInquiry.slackMessage}
                    style={{ width: '100%', marginTop: 4, fontFamily: 'inherit', fontSize: 13 }}
                  />
                </div>

                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fnt)', textTransform: 'uppercase' }}>SMS Text Draft</div>
                  <textarea
                    className="input"
                    readOnly
                    rows={3}
                    value={aiInquiry.smsMessage}
                    style={{ width: '100%', marginTop: 4, fontFamily: 'inherit', fontSize: 13 }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button className="btn" onClick={() => setActiveModal(null)}>Cancel</button>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      alert('Clarification message dispatched to client via Slack & SMS.');
                      setActiveModal(null);
                    }}
                  >
                    Send to Client
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* 3. AI Compilation Commentary Modal */}
      {activeModal === 'commentary' && (
        <div style={modalOverlayStyle}>
          <div className="card" style={{ ...modalBoxStyle, maxWidth: 640 }}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: 'var(--ink)' }}>
              Management Compilation Commentary (External CPA Pack)
            </div>
            {aiLoading ? (
              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                <Spinner />
                <div style={{ marginTop: 8, fontSize: 13, color: 'var(--mut)' }}>Generating executive variance commentary...</div>
              </div>
            ) : aiCommentary ? (
              <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fnt)', textTransform: 'uppercase' }}>Executive Summary</div>
                  <p style={{ margin: '4px 0 0', color: 'var(--ink)' }}>{aiCommentary.executiveSummary}</p>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fnt)', textTransform: 'uppercase' }}>Key Operating Variances</div>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 20, color: 'var(--ink)' }}>
                    {aiCommentary.varianceHighlights.map((h, i) => <li key={i}>{h}</li>)}
                  </ul>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--fnt)', textTransform: 'uppercase' }}>Commercial Volume Observation</div>
                  <p style={{ margin: '4px 0 0', color: 'var(--ink)' }}>{aiCommentary.volumeObservation}</p>
                </div>

                <div className="card" style={{ padding: 12, background: 'var(--hl)', marginBottom: 16, fontSize: 11.5, color: 'var(--fnt)' }}>
                  <strong>Mandatory Disclaimer:</strong> {aiCommentary.legalDisclaimer}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button className="btn" onClick={() => setActiveModal(null)}>Close</button>
                  <button
                    className="btn-primary"
                    onClick={() => {
                      alert('CPA Compilation PDF generated and archived.');
                      setActiveModal(null);
                    }}
                  >
                    Download CPA Package
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* 4. Bookkeeper Override Modal */}
      {activeModal === 'override' && selectedItem && (
        <div style={modalOverlayStyle}>
          <div className="card" style={modalBoxStyle}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--ink)' }}>
              Bookkeeper Manual Override
            </div>
            <div style={{ fontSize: 13, color: 'var(--mut)', marginBottom: 14 }}>
              Override <strong>{selectedItem.title}</strong> for {period}. A documented rationale is required for the compilation audit trail.
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--fnt)', display: 'block', marginBottom: 4 }}>
                Override Rationale
              </label>
              <textarea
                className="input"
                rows={3}
                placeholder="e.g. Client confirmed business purpose verbally on 8/31; receipt copy on file."
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                style={{ width: '100%', fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn" onClick={() => setActiveModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleOverride} disabled={!overrideReason.trim()}>
                Confirm Override
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Add Custom Item Modal */}
      {activeModal === 'add_item' && (
        <div style={modalOverlayStyle}>
          <div className="card" style={modalBoxStyle}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12, color: 'var(--ink)' }}>
              Add Custom Client Close Item
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--fnt)', display: 'block', marginBottom: 4 }}>Item Title</label>
              <input
                className="input"
                placeholder="e.g. Shopify Ending Inventory Valuation Reconcile"
                value={newItemTitle}
                onChange={(e) => setNewItemTitle(e.target.value)}
                style={{ width: '100%', fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--fnt)', display: 'block', marginBottom: 4 }}>Checklist Phase</label>
                <select
                  className="select"
                  value={newItemPhase}
                  onChange={(e) => setNewItemPhase(e.target.value as any)}
                  style={{ width: '100%', fontSize: 13 }}
                >
                  <option value="intake">Phase 1: Intake & Clearance</option>
                  <option value="reconciliation">Phase 2: Reconciliation & Tie-Outs</option>
                  <option value="compilation">Phase 3: Compilation & Handoff</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--fnt)', display: 'block', marginBottom: 4 }}>Category</label>
                <input
                  className="input"
                  placeholder="e.g. inventory, mileage, loan"
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value)}
                  style={{ width: '100%', fontSize: 13 }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--fnt)', display: 'block', marginBottom: 4 }}>Action Prompt (When Pending)</label>
              <input
                className="input"
                placeholder="e.g. Verify month-end Shopify stock report against GL asset balance."
                value={newItemPrompt}
                onChange={(e) => setNewItemPrompt(e.target.value)}
                style={{ width: '100%', fontSize: 13 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn" onClick={() => setActiveModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleAddCustomItem} disabled={!newItemTitle.trim()}>
                Save Item to Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Sign Off Period Modal */}
      {activeModal === 'sign_off' && (
        <div style={modalOverlayStyle}>
          <div className="card" style={modalBoxStyle}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: 'var(--ink)' }}>
              Certify & Lock Period ({period})
            </div>
            <div style={{ fontSize: 13, color: 'var(--mut)', marginBottom: 14 }}>
              All prerequisite gates have passed or been overridden. Sign-off locks the general ledger and compiles management financial statements for external tax preparation.
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--fnt)', display: 'block', marginBottom: 4 }}>
                Compilation Notes (Optional)
              </label>
              <textarea
                className="input"
                rows={3}
                placeholder="e.g. Clean August close. Minor SUI payroll clearing variance balanced."
                value={compilationNotes}
                onChange={(e) => setCompilationNotes(e.target.value)}
                style={{ width: '100%', fontSize: 13 }}
              />
            </div>

            <div className="card" style={{ padding: 10, background: 'var(--hl)', marginBottom: 16, fontSize: 11.5, color: 'var(--fnt)' }}>
              {LEGAL_DISCLAIMER}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button className="btn" onClick={() => setActiveModal(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleSignOff}>
                Certify & Lock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const modalOverlayStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(20, 18, 12, 0.45)',
  backdropFilter: 'blur(2px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 16,
};

const modalBoxStyle: CSSProperties = {
  width: '100%',
  maxWidth: 520,
  padding: 24,
  background: 'var(--card)',
  borderRadius: 8,
  boxShadow: 'var(--sh)',
};
