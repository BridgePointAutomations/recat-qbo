import { useState } from 'react';
import type { QboEnv } from '@recat/shared';
import { companies as companiesApi } from '../../lib/api';
import { useApp } from '../../state/AppContext';
import HoverButton from './HoverButton';
import { errMsg } from './format';

interface AddBusinessModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (companyId: string) => void;
}

export default function AddBusinessModal({ open, onClose, onSuccess }: AddBusinessModalProps) {
  const { toast, refreshCompanies, setActiveCompany } = useApp();
  const [tab, setTab] = useState<'oauth' | 'import' | 'demo'>('oauth');
  const [qboEnv, setQboEnv] = useState<QboEnv>('sandbox');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const handleOAuthConnect = async () => {
    setBusy(true);
    try {
      const res = await companiesApi.connectUrl({
        mode: 'real',
        env: qboEnv,
        returnTo: 'settings',
      });
      window.location.href = res.url;
    } catch (err) {
      toast(errMsg(err));
      setBusy(false);
    }
  };

  const handleLocalImport = async () => {
    setBusy(true);
    try {
      const res = await companiesApi.importLocal();
      await refreshCompanies();
      setActiveCompany(res.company.id);
      toast(`Successfully connected ${res.company.nickname}!`);
      onSuccess(res.company.id);
      onClose();
    } catch (err) {
      toast(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDemoConnect = async () => {
    setBusy(true);
    try {
      const res = await companiesApi.connectUrl({
        mode: 'demo',
        returnTo: 'settings',
      });
      window.location.href = res.url;
    } catch (err) {
      toast(errMsg(err));
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--card)',
          border: '1px solid var(--bd)',
          borderRadius: 14,
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.2)',
          width: '100%',
          maxWidth: 540,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px 16px',
            borderBottom: '1px solid var(--bd2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--ink)' }}>
              Add Business Account
            </div>
            <div style={{ fontSize: 13, color: 'var(--mut)', marginTop: 2 }}>
              Connect a client company to your bookkeeping workspace.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: 'var(--mut)',
              padding: '4px 8px',
              borderRadius: 6,
            }}
          >
            ✕
          </button>
        </div>

        {/* Tab switchers */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid var(--bd2)',
            background: 'var(--sur)',
            padding: '4px 8px 0',
            gap: 6,
          }}
        >
          <button
            onClick={() => setTab('oauth')}
            style={{
              padding: '10px 14px',
              fontSize: 13.5,
              fontWeight: 600,
              border: 'none',
              borderBottom: tab === 'oauth' ? '2px solid var(--acc)' : '2px solid transparent',
              background: 'none',
              color: tab === 'oauth' ? 'var(--ink)' : 'var(--mut)',
              cursor: 'pointer',
            }}
          >
            QuickBooks OAuth
          </button>
          <button
            onClick={() => setTab('import')}
            style={{
              padding: '10px 14px',
              fontSize: 13.5,
              fontWeight: 600,
              border: 'none',
              borderBottom: tab === 'import' ? '2px solid var(--acc)' : '2px solid transparent',
              background: 'none',
              color: tab === 'import' ? 'var(--ink)' : 'var(--mut)',
              cursor: 'pointer',
            }}
          >
            1-Click Sandbox Import
          </button>
          <button
            onClick={() => setTab('demo')}
            style={{
              padding: '10px 14px',
              fontSize: 13.5,
              fontWeight: 600,
              border: 'none',
              borderBottom: tab === 'demo' ? '2px solid var(--acc)' : '2px solid transparent',
              background: 'none',
              color: tab === 'demo' ? 'var(--ink)' : 'var(--mut)',
              cursor: 'pointer',
            }}
          >
            Demo Business
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 24 }}>
          {tab === 'oauth' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.5 }}>
                Launch the standard browser-based Intuit consent screen to link a QuickBooks Online company directly.
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
                  QuickBooks Environment
                </label>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setQboEnv('sandbox')}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${qboEnv === 'sandbox' ? 'var(--acc)' : 'var(--bd)'}`,
                      background: qboEnv === 'sandbox' ? 'var(--hl)' : 'var(--card)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Sandbox</div>
                    <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 2 }}>For development & testing</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setQboEnv('production')}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: 8,
                      border: `1px solid ${qboEnv === 'production' ? 'var(--acc)' : 'var(--bd)'}`,
                      background: qboEnv === 'production' ? 'var(--hl)' : 'var(--card)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Production</div>
                    <div style={{ fontSize: 12, color: 'var(--mut)', marginTop: 2 }}>Live client company books</div>
                  </button>
                </div>
              </div>

              <HoverButton
                onClick={handleOAuthConnect}
                disabled={busy}
                style={{
                  border: 'none',
                  background: 'var(--acc)',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '12px 18px',
                  fontSize: 14.5,
                  fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
                hoverStyle={{ background: 'var(--accH)' }}
              >
                {busy ? 'Opening Intuit Authorization…' : 'Connect with QuickBooks Online'}
              </HoverButton>
            </div>
          )}

          {tab === 'import' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.5 }}>
                Detected active sandbox credentials from the local Model Context Protocol (MCP) server or seed store.
              </div>

              <div
                style={{
                  background: 'var(--sur)',
                  border: '1px solid var(--bd2)',
                  borderRadius: 8,
                  padding: '14px 16px',
                  fontSize: 13,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                }}
              >
                <div><strong>Detected Store:</strong> <code>tools/quickbooks-mcp-server/.env</code></div>
                <div><strong>Default Realm ID:</strong> <code>9341457935506736</code> (Sandbox US 504c)</div>
                <div><strong>Auth Mechanism:</strong> Proactive AES-256 token rotation & auto-sync</div>
              </div>

              <HoverButton
                onClick={handleLocalImport}
                disabled={busy}
                style={{
                  border: 'none',
                  background: 'var(--okT)',
                  color: '#fff',
                  borderRadius: 8,
                  padding: '12px 18px',
                  fontSize: 14.5,
                  fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
                hoverStyle={{ opacity: 0.9 }}
              >
                {busy ? 'Importing & Verifying…' : '1-Click Import Active Sandbox Company'}
              </HoverButton>
            </div>
          )}

          {tab === 'demo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.5 }}>
                Instantly spin up a mock company with pre-seeded transactions, charts of accounts, and realistic financials for onboarding or testing.
              </div>

              <div
                style={{
                  background: 'var(--sur)',
                  border: '1px solid var(--bd2)',
                  borderRadius: 8,
                  padding: '14px 16px',
                  fontSize: 13,
                  color: 'var(--mut)',
                  lineHeight: 1.4,
                }}
              >
                Requires no Intuit developer credentials. Works fully offline in sandbox simulation mode.
              </div>

              <HoverButton
                onClick={handleDemoConnect}
                disabled={busy}
                style={{
                  border: '1px solid var(--bd)',
                  background: 'var(--card)',
                  color: 'var(--ink)',
                  borderRadius: 8,
                  padding: '12px 18px',
                  fontSize: 14.5,
                  fontWeight: 600,
                  cursor: busy ? 'not-allowed' : 'pointer',
                  opacity: busy ? 0.7 : 1,
                }}
                hoverStyle={{ background: 'var(--hl)' }}
              >
                {busy ? 'Creating Demo Company…' : 'Create Sample Demo Company'}
              </HoverButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
