import { useState } from 'react';
import type { CompanyDto } from '@recat/shared';
import { isDemoRealmId } from '@recat/shared';
import { companies as companiesApi } from '../../lib/api';
import { useApp } from '../../state/AppContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import HoverButton from './HoverButton';
import AddBusinessModal from './AddBusinessModal';
import { errMsg, fmtWhen } from './format';

interface BusinessesCardProps {
  onAddSuccess?: (companyId: string) => void;
  openAddDirectly?: boolean;
}

export default function BusinessesCard({ onAddSuccess, openAddDirectly = false }: BusinessesCardProps) {
  const {
    companies,
    activeCompany,
    setActiveCompany,
    refreshCompanies,
    toast,
  } = useApp();

  const [addModalOpen, setAddModalOpen] = useState(openAddDirectly);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [disconnectTarget, setDisconnectTarget] = useState<CompanyDto | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const handleSync = async (company: CompanyDto) => {
    if (syncingId) return;
    setSyncingId(company.id);
    try {
      const res = await companiesApi.sync(company.id);
      toast(res.message || `Successfully synced ${company.nickname}!`);
      await refreshCompanies();
    } catch (err) {
      toast(errMsg(err));
    } finally {
      setSyncingId(null);
    }
  };

  const handleDisconnect = async () => {
    if (!disconnectTarget || disconnecting) return;
    setDisconnecting(true);
    try {
      await companiesApi.disconnect(disconnectTarget.id);
      await refreshCompanies();
      toast(`Disconnected ${disconnectTarget.nickname}`);
      setDisconnectTarget(null);
    } catch (err) {
      toast(errMsg(err));
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <div
      style={{
        border: '1px solid var(--bd2)',
        borderRadius: 12,
        background: 'var(--card)',
        padding: '24px',
        boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--ink)' }}>
            Client Accounts & Businesses
          </div>
          <div style={{ fontSize: 13.5, color: 'var(--mut)', marginTop: 3 }}>
            Manage client businesses connected to QuickBooks Online.
          </div>
        </div>

        <HoverButton
          onClick={() => setAddModalOpen(true)}
          style={{
            border: 'none',
            background: 'var(--acc)',
            color: '#fff',
            borderRadius: 8,
            padding: '9px 16px',
            fontSize: 13.5,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
          hoverStyle={{ background: 'var(--accH)' }}
        >
          + Add Business
        </HoverButton>
      </div>

      {/* Business List Table */}
      <div
        style={{
          border: '1px solid var(--bd2)',
          borderRadius: 8,
          overflow: 'hidden',
        }}
      >
        {companies.length === 0 ? (
          <div style={{ padding: '36px 20px', textAlign: 'center', color: 'var(--mut)', fontSize: 14 }}>
            No client accounts connected yet. Click <strong>+ Add Business</strong> above to get started.
          </div>
        ) : (
          companies.map((co, idx) => {
            const isActive = co.id === activeCompany?.id;
            const isSyncing = syncingId === co.id;
            const isDemo = isDemoRealmId(co.realmId);

            return (
              <div
                key={co.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderBottom: idx === companies.length - 1 ? 'none' : '1px solid var(--bd2)',
                  background: isActive ? 'var(--hl)' : 'transparent',
                  flexWrap: 'wrap',
                  gap: 14,
                }}
              >
                {/* Left: Avatar and Info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 260, flex: 1 }}>
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: 10,
                      background: isActive ? 'var(--acc)' : 'var(--bd)',
                      color: isActive ? '#fff' : 'var(--ink)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: 15,
                      flexShrink: 0,
                    }}
                  >
                    {co.nickname.charAt(0).toUpperCase()}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)' }}>
                        {co.nickname}
                      </span>

                      {isActive && (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            color: 'var(--okT)',
                            background: 'var(--okB)',
                            border: '1px solid var(--okD)',
                            borderRadius: 99,
                            padding: '1px 8px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em',
                          }}
                        >
                          Active
                        </span>
                      )}

                      {isDemo ? (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--fnt)',
                            background: 'var(--sur)',
                            border: '1px solid var(--bd)',
                            borderRadius: 99,
                            padding: '1px 7px',
                          }}
                        >
                          Demo
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            color: co.env === 'production' ? '#fff' : 'var(--mut)',
                            background: co.env === 'production' ? 'var(--acc)' : 'var(--sur)',
                            border: '1px solid var(--bd2)',
                            borderRadius: 99,
                            padding: '1px 7px',
                            textTransform: 'capitalize',
                          }}
                        >
                          {co.env}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: 12.5, color: 'var(--mut)', marginTop: 3 }}>
                      {co.legalName} • Realm ID: <code>{co.realmId}</code>
                    </div>
                  </div>
                </div>

                {/* Right: Last Sync & Quick Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--fnt)', textAlign: 'right', marginRight: 6 }}>
                    {co.lastSyncedAt ? `Synced ${fmtWhen(co.lastSyncedAt)}` : 'Never synced'}
                  </div>

                  {!isActive && (
                    <HoverButton
                      onClick={() => {
                        setActiveCompany(co.id);
                        toast(`Switched to ${co.nickname}`);
                      }}
                      style={{
                        border: '1px solid var(--bd)',
                        background: 'var(--card)',
                        color: 'var(--ink)',
                        borderRadius: 7,
                        padding: '6px 12px',
                        fontSize: 12.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      hoverStyle={{ background: 'var(--hl)' }}
                    >
                      Switch
                    </HoverButton>
                  )}

                  <HoverButton
                    onClick={() => handleSync(co)}
                    disabled={isSyncing}
                    style={{
                      border: '1px solid var(--bd)',
                      background: 'var(--card)',
                      color: 'var(--ink)',
                      borderRadius: 7,
                      padding: '6px 12px',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: isSyncing ? 'not-allowed' : 'pointer',
                      opacity: isSyncing ? 0.6 : 1,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                    hoverStyle={{ background: 'var(--hl)' }}
                  >
                    {isSyncing ? 'Syncing…' : 'Sync'}
                  </HoverButton>

                  <HoverButton
                    onClick={() => setDisconnectTarget(co)}
                    style={{
                      border: '1px solid var(--erD)',
                      background: 'none',
                      color: 'var(--erT)',
                      borderRadius: 7,
                      padding: '6px 10px',
                      fontSize: 12.5,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    hoverStyle={{ background: 'var(--erB)' }}
                  >
                    Disconnect
                  </HoverButton>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Business Modal */}
      <AddBusinessModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onSuccess={(id) => {
          onAddSuccess?.(id);
          refreshCompanies();
        }}
      />

      {/* Disconnect Confirmation Dialog */}
      {disconnectTarget && (
        <ConfirmDialog
          open={Boolean(disconnectTarget)}
          title={`Disconnect ${disconnectTarget.nickname}?`}
          confirmLabel="Disconnect"
          tone="danger"
          busy={disconnecting}
          onConfirm={handleDisconnect}
          onCancel={() => setDisconnectTarget(null)}
        >
          Disconnecting <strong>{disconnectTarget.nickname}</strong> revokes its QuickBooks tokens
          and pauses syncing. Stored transactions, rules, and audit logs are retained.
        </ConfirmDialog>
      )}
    </div>
  );
}
