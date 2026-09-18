import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BusinessesCard from './BusinessesCard';

const mocks = vi.hoisted(() => ({
  companies: [
    {
      id: 'c1',
      nickname: 'Acme Coffee LLC',
      legalName: 'Acme Coffee Operations LLC',
      realmId: '9341457935506736',
      env: 'sandbox' as const,
      isDemo: false,
      dryRun: false,
      pollInterval: 'manual',
      status: 'ok',
      lastSyncedAt: new Date().toISOString(),
    },
    {
      id: 'c2',
      nickname: 'Demo Services Co',
      legalName: 'Demo Services Company LLC',
      realmId: 'demo-realm',
      env: 'sandbox' as const,
      isDemo: true,
      dryRun: true,
      pollInterval: 'manual',
      status: 'ok',
      lastSyncedAt: null,
    },
  ],
  setActiveCompany: vi.fn(),
  refreshCompanies: vi.fn().mockResolvedValue(undefined),
  toast: vi.fn(),
  sync: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock('../../state/AppContext', () => ({
  useApp: () => ({
    companies: mocks.companies,
    activeCompany: mocks.companies[0],
    setActiveCompany: mocks.setActiveCompany,
    refreshCompanies: mocks.refreshCompanies,
    toast: mocks.toast,
  }),
}));

vi.mock('../../lib/api', () => ({
  companies: {
    sync: mocks.sync,
    disconnect: mocks.disconnect,
    connectUrl: vi.fn().mockResolvedValue({ url: 'https://appcenter.intuit.com/connect/oauth2' }),
    importLocal: vi.fn().mockResolvedValue({ ok: true, company: { id: 'c3', nickname: 'Imported' } }),
  },
}));

describe('BusinessesCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sync.mockResolvedValue({ ok: true, message: 'Synced 50 accounts' });
    mocks.disconnect.mockResolvedValue(undefined);
  });

  it('renders all businesses and highlights the active company', () => {
    render(<BusinessesCard />);

    expect(screen.getByText('Client Accounts & Businesses')).toBeInTheDocument();
    expect(screen.getByText('Acme Coffee LLC')).toBeInTheDocument();
    expect(screen.getByText('Demo Services Co')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('allows clicking Add Business to open the modal', async () => {
    const user = userEvent.setup();
    render(<BusinessesCard />);

    const addBtn = screen.getByRole('button', { name: /\+ Add Business/i });
    await user.click(addBtn);

    expect(screen.getByText('Add Business Account')).toBeInTheDocument();
  });

  it('allows switching to another business', async () => {
    const user = userEvent.setup();
    render(<BusinessesCard />);

    const switchBtn = screen.getByRole('button', { name: /Switch/i });
    await user.click(switchBtn);

    expect(mocks.setActiveCompany).toHaveBeenCalledWith('c2');
    expect(mocks.toast).toHaveBeenCalledWith('Switched to Demo Services Co');
  });

  it('allows syncing a business', async () => {
    const user = userEvent.setup();
    render(<BusinessesCard />);

    const syncBtns = screen.getAllByRole('button', { name: /Sync/i });
    expect(syncBtns.length).toBeGreaterThan(0);
    await user.click(syncBtns[0]!);

    await waitFor(() => {
      expect(mocks.sync).toHaveBeenCalledWith('c1');
      expect(mocks.refreshCompanies).toHaveBeenCalled();
      expect(mocks.toast).toHaveBeenCalledWith('Synced 50 accounts');
    });
  });

  it('allows disconnecting a business after confirmation', async () => {
    const user = userEvent.setup();
    render(<BusinessesCard />);

    const disconnectBtns = screen.getAllByRole('button', { name: /Disconnect/i });
    expect(disconnectBtns.length).toBeGreaterThan(0);
    await user.click(disconnectBtns[0]!);

    // Confirmation dialog appears
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/Disconnect Acme Coffee LLC\?/i)).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole('button', { name: /^Disconnect$/i });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mocks.disconnect).toHaveBeenCalledWith('c1');
      expect(mocks.refreshCompanies).toHaveBeenCalled();
      expect(mocks.toast).toHaveBeenCalledWith('Disconnected Acme Coffee LLC');
    });
  });
});
