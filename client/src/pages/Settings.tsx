// Settings & Administration screen — modern categorized layout with multi-business management,
// tabbed navigation, and streamlined client account creation.

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { InstanceSettingsDto, SyncLogDto } from '@recat/shared';
import { isDemoRealmId } from '@recat/shared';
import { api, companies as companiesApi, instanceSettings } from '../lib/api';
import { ToggleSwitch } from '../components/ui';
import { useApp } from '../state/AppContext';
import ConfirmDialog from '../components/ConfirmDialog';
import AccessCard from './settings/AccessCard';
import ApiAccessCard from './settings/ApiAccessCard';
import AutopilotCard from './settings/AutopilotCard';
import ConnectionCard from './settings/ConnectionCard';
import type { HoldingAccountOption } from './settings/ConnectionCard';
import DensityCard from './settings/DensityCard';
import EmailCard from './settings/EmailCard';
import HoverButton from './settings/HoverButton';
import SuggestionsCard from './settings/SuggestionsCard';
import TeamCard from './settings/TeamCard';
import TaxCard from './settings/TaxCard';
import McpTokensCard from './settings/McpTokensCard';
import AttachmentRetentionCard from './settings/AttachmentRetentionCard';
import ReceiptProcessingCard from './settings/ReceiptProcessingCard';
import BusinessesCard from './settings/BusinessesCard';
import AddBusinessModal from './settings/AddBusinessModal';
import { errMsg, fmtWhen } from './settings/format';

type SettingsTab = 'businesses' | 'bookkeeping' | 'automation' | 'integrations' | 'team' | 'preferences';

export default function Settings() {
  const {
    session,
    role,
    companies,
    activeCompany,
    setActiveCompany,
    updateCompany,
    refreshCompanies,
    dryRun,
    tagsRequired,
    toast,
  } = useApp();

  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab') as SettingsTab | null;
  const initialTab: SettingsTab =
    rawTab && ['businesses', 'bookkeeping', 'automation', 'integrations', 'team', 'preferences'].includes(rawTab)
      ? rawTab
      : 'businesses';

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  const [addModalOpen, setAddModalOpen] = useState(searchParams.get('action') === 'add');

  useEffect(() => {
    if (rawTab && rawTab !== activeTab && ['businesses', 'bookkeeping', 'automation', 'integrations', 'team', 'preferences'].includes(rawTab)) {
      setActiveTab(rawTab);
    }
    if (searchParams.get('action') === 'add') {
      setAddModalOpen(true);
    }
  }, [rawTab, activeTab, searchParams]);

  const switchTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  const isAdmin = role === 'admin';
  const companyId = activeCompany?.id ?? null;

  const [holdingOptions, setHoldingOptions] = useState<HoldingAccountOption[]>([]);
  const [syncLog, setSyncLog] = useState<SyncLogDto[]>([]);
  const [settings, setSettings] = useState<InstanceSettingsDto | null>(null);

  const reloadSyncLog = useCallback(async (): Promise<SyncLogDto[]> => {
    if (!companyId) return [];
    const log = await api.get<SyncLogDto[]>(`/api/companies/${companyId}/sync-log`);
    setSyncLog(log);
    return log;
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    api
      .get<{ qboId: string; name: string; count: number }[]>(
        `/api/companies/${companyId}/holding-account-options`,
      )
      .then((opts) => {
        if (!cancelled) setHoldingOptions(opts.map((o) => ({ id: o.qboId, name: o.name, count: o.count })));
      })
      .catch(() => {
        // leave empty
      });
    reloadSyncLog().catch(() => {
      // leave empty
    });
    return () => {
      cancelled = true;
    };
  }, [companyId, reloadSyncLog]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    instanceSettings
      .get()
      .then((dto) => {
        if (!cancelled) setSettings(dto);
      })
      .catch(() => {
        // admin-only cards stay hidden
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const toggleDry = () => {
    const next = !dryRun;
    updateCompany({ dryRun: next })
      .then(() =>
        toast(
          next
            ? 'Dry-run ON — nothing will be written to QuickBooks'
            : 'Dry-run OFF — posts now write to QuickBooks',
        ),
      )
      .catch((err) => toast(errMsg(err)));
  };

  const toggleReqTags = () => {
    const next = !tagsRequired;
    updateCompany({ tagsRequired: next })
      .then(() =>
        toast(next ? "Tags required — untagged transactions can't be posted" : 'Tags optional'),
      )
      .catch((err) => toast(errMsg(err)));
  };

  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const disconnect = () => {
    if (!activeCompany || disconnecting) return;
    setDisconnecting(true);
    companiesApi
      .disconnect(activeCompany.id)
      .then(async () => {
        await refreshCompanies();
        toast(`Disconnected ${activeCompany.nickname}`);
      })
      .catch((err) => toast(errMsg(err)))
      .finally(() => {
        setDisconnecting(false);
        setConfirmDisconnect(false);
      });
  };

  const lastWebhookEventAt = syncLog.find((s) => s.kind === 'webhook')?.at ?? null;

  const TABS: { id: SettingsTab; label: string }[] = [
    { id: 'businesses', label: 'Businesses' },
    { id: 'bookkeeping', label: 'Bookkeeping & Queue' },
    { id: 'automation', label: 'AI & Automation' },
    { id: 'integrations', label: 'Integrations & MCP' },
    { id: 'team', label: 'Team & Access' },
    { id: 'preferences', label: 'Preferences' },
  ];

  return (
    <div
      style={{
        maxWidth: 960,
        margin: '0 auto',
        padding: '28px clamp(14px,3.5vw,32px) 80px',
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
      }}
    >
      {/* Top Header & Context Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 16,
          paddingBottom: 4,
        }}
      >
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            Settings & Administration
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--mut)', marginTop: 3 }}>
            Manage client businesses, bookkeeping automation, QuickBooks sync, and team access.
          </div>
        </div>

        {/* Quick Context / Add Business Action */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {activeCompany && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                background: 'var(--card)',
                border: '1px solid var(--bd)',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 13,
              }}
            >
              <span style={{ color: 'var(--mut)' }}>Configuring:</span>
              <strong style={{ color: 'var(--ink)' }}>{activeCompany.nickname}</strong>
              {dryRun && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--amT)',
                    background: 'var(--amB)',
                    borderRadius: 99,
                    padding: '1px 6px',
                  }}
                >
                  Dry-run
                </span>
              )}
            </div>
          )}

          <HoverButton
            onClick={() => setAddModalOpen(true)}
            style={{
              border: 'none',
              background: 'var(--acc)',
              color: '#fff',
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
            }}
            hoverStyle={{ background: 'var(--accH)' }}
          >
            + Add Business
          </HoverButton>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--bd2)',
          gap: 4,
          overflowX: 'auto',
          paddingBottom: 2,
        }}
      >
        {TABS.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => switchTab(t.id)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '10px 14px',
                fontSize: 14,
                fontWeight: active ? 600 : 500,
                color: active ? 'var(--ink)' : 'var(--mut)',
                background: active ? 'var(--hl)' : 'transparent',
                border: 'none',
                borderBottom: active ? '2px solid var(--acc)' : '2px solid transparent',
                borderRadius: '8px 8px 0 0',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              <span>{t.label}</span>
              {t.id === 'businesses' && (
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    background: 'var(--bd)',
                    color: 'var(--ink)',
                    padding: '1px 6px',
                    borderRadius: 99,
                    marginLeft: 2,
                  }}
                >
                  {companies.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 1: Businesses */}
      {activeTab === 'businesses' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <BusinessesCard
            onAddSuccess={(newId) => {
              setActiveCompany(newId);
            }}
          />

          {/* Quick Active Company Overview */}
          {activeCompany && (
            <div
              style={{
                border: '1px solid var(--bd2)',
                borderRadius: 10,
                background: 'var(--card)',
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 14,
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: 'var(--mut)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                  Active Workspace Business
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginTop: 2 }}>
                  {activeCompany.legalName}
                </div>
                <div style={{ fontSize: 13, color: 'var(--mut)', marginTop: 3 }}>
                  Realm ID: <code>{activeCompany.realmId}</code> • Mode: {activeCompany.syncMode} • Polling: every {activeCompany.pollIntervalMin}m
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <HoverButton
                  onClick={() => switchTab('bookkeeping')}
                  style={{
                    border: '1px solid var(--bd)',
                    background: 'var(--card)',
                    color: 'var(--ink)',
                    borderRadius: 7,
                    padding: '8px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  hoverStyle={{ background: 'var(--hl)' }}
                >
                  Configure Bookkeeping Rules →
                </HoverButton>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Bookkeeping & Queue */}
      {activeTab === 'bookkeeping' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Dry Run Safeguard */}
          <div
            style={{
              border: `1px solid ${dryRun ? 'var(--amD)' : 'var(--bd2)'}`,
              borderRadius: 10,
              background: dryRun ? 'var(--amB)' : 'var(--card)',
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Dry-run mode</div>
              <div style={{ fontSize: 13.5, color: 'var(--mut)', marginTop: 3, lineHeight: 1.5 }}>
                When on, Recat logs the exact payload it <i>would</i> send to QuickBooks — but writes
                nothing. Recommended until you trust the setup.
              </div>
            </div>
            <ToggleSwitch on={dryRun} onToggle={toggleDry} label="Dry-run mode" />
          </div>

          {/* Tags Required */}
          <div
            style={{
              border: '1px solid var(--bd2)',
              borderRadius: 10,
              background: 'var(--card)',
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              boxShadow: '0 1px 6px rgba(60,55,45,.05)',
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Tags are required</div>
              <div style={{ fontSize: 13.5, color: 'var(--mut)', marginTop: 3, lineHeight: 1.5 }}>
                A transaction can't be posted to QuickBooks until it carries at least one tag.
              </div>
            </div>
            <ToggleSwitch on={tagsRequired} onToggle={toggleReqTags} label="Tags are required" />
          </div>

          {/* Holding Accounts & Connection */}
          {activeCompany && (
            <ConnectionCard
              key={activeCompany.id}
              company={activeCompany}
              holdingOptions={holdingOptions}
              reloadSyncLog={reloadSyncLog}
            />
          )}

          {/* Tax Setup */}
          <TaxCard />

          {/* Attachment Retention */}
          <AttachmentRetentionCard />

          {/* Danger zone */}
          {activeCompany && (
            <div
              style={{
                border: '1px solid var(--erD)',
                borderRadius: 10,
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--erT)' }}>
                  Disconnect {activeCompany.nickname}
                </div>
                <div style={{ fontSize: 13.5, color: 'var(--mut)', marginTop: 3 }}>
                  Stops syncing and revokes QuickBooks tokens. Stored history and audit logs are retained.
                </div>
              </div>
              <HoverButton
                onClick={() => setConfirmDisconnect(true)}
                style={{
                  border: '1px solid var(--erD)',
                  background: 'none',
                  color: 'var(--erT)',
                  borderRadius: 7,
                  padding: '8px 14px',
                  fontSize: 13.5,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
                hoverStyle={{ background: 'var(--erB)' }}
              >
                Disconnect…
              </HoverButton>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: AI & Automation */}
      {activeTab === 'automation' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Categorization Suggestions */}
          {settings && (
            <SuggestionsCard
              key={`${settings.suggestionSource}-${settings.suggestionProvider}`}
              settings={settings}
              onSettings={setSettings}
            />
          )}

          {/* Autopilot Rules */}
          {activeCompany && (role === 'categorizer' || role === 'admin') && (
            <AutopilotCard
              key={activeCompany.id}
              companyId={activeCompany.id}
              companyName={activeCompany.legalName}
              role={role}
            />
          )}

          {/* Receipt Processing */}
          {activeCompany && isAdmin && <ReceiptProcessingCard companyId={activeCompany.id} />}
        </div>
      )}

      {/* TAB 4: Integrations & MCP */}
      {activeTab === 'integrations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Claude Model Context Protocol (MCP) Tokens */}
          <McpTokensCard />

          {/* QuickBooks API & Webhooks */}
          {isAdmin && settings && activeCompany && (
            <ApiAccessCard
              settings={settings}
              onSettings={setSettings}
              syncMode={activeCompany.syncMode}
              lastWebhookEventAt={lastWebhookEventAt}
            />
          )}

          {/* Sync History Log */}
          <div
            style={{
              border: '1px solid var(--bd2)',
              borderRadius: 10,
              background: 'var(--card)',
              padding: 24,
              boxShadow: '0 1px 6px rgba(60,55,45,.05)',
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>QuickBooks Sync History</div>
            {syncLog.length === 0 ? (
              <div style={{ color: 'var(--mut)', fontSize: 13.5 }}>No sync events recorded yet.</div>
            ) : (
              syncLog.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 1fr 140px',
                    gap: '0 14px',
                    alignItems: 'center',
                    padding: '9px 0',
                    borderBottom: '1px solid var(--rowbd)',
                    fontSize: 13.5,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: s.ok ? 'var(--okT)' : 'var(--erT)' }}>
                    {s.kind}
                  </span>
                  <span style={{ color: 'var(--mut)' }}>{s.message}</span>
                  <span style={{ textAlign: 'right', color: 'var(--fnt)', fontSize: 12.5 }}>
                    {fmtWhen(s.at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: Team & Access */}
      {activeTab === 'team' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Company Team Members */}
          {isAdmin && <TeamCard />}

          {/* Platform Instance Admins */}
          {session?.isInstanceAdmin && <AccessCard />}
        </div>
      )}

      {/* TAB 6: Preferences */}
      {activeTab === 'preferences' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Display Density */}
          <DensityCard />

          {/* Email / SMTP Notifications */}
          {isAdmin && settings && <EmailCard settings={settings} onSettings={setSettings} />}
        </div>
      )}

      {/* In-Portal Add Business Modal */}
      <AddBusinessModal
        open={addModalOpen}
        onClose={() => {
          setAddModalOpen(false);
          if (searchParams.get('action') === 'add') {
            const next = new URLSearchParams(searchParams);
            next.delete('action');
            setSearchParams(next);
          }
        }}
        onSuccess={(id) => {
          setActiveCompany(id);
          refreshCompanies();
        }}
      />

      {/* Disconnect Dialog */}
      {activeCompany && (
        <ConfirmDialog
          open={confirmDisconnect}
          title={`Disconnect ${activeCompany.nickname}?`}
          confirmLabel="Disconnect"
          tone="danger"
          busy={disconnecting}
          onConfirm={disconnect}
          onCancel={() => setConfirmDisconnect(false)}
        >
          Syncing stops and the QuickBooks tokens are revoked. Local history and the
          audit log are kept — you can reconnect any time.
        </ConfirmDialog>
      )}
    </div>
  );
}
