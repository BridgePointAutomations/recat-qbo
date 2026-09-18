import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AddBusinessModal from './AddBusinessModal';

const mocks = vi.hoisted(() => ({
  connectUrl: vi.fn(),
  importLocal: vi.fn(),
  toast: vi.fn(),
  refreshCompanies: vi.fn(),
  setActiveCompany: vi.fn(),
}));

vi.mock('../../lib/api', () => ({
  companies: {
    connectUrl: mocks.connectUrl,
    importLocal: mocks.importLocal,
  },
}));

vi.mock('../../state/AppContext', () => ({
  useApp: () => ({
    toast: mocks.toast,
    refreshCompanies: mocks.refreshCompanies,
    setActiveCompany: mocks.setActiveCompany,
  }),
}));

describe('AddBusinessModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.connectUrl.mockResolvedValue({ url: 'https://appcenter.intuit.com/connect/oauth2' });
    mocks.importLocal.mockResolvedValue({
      ok: true,
      company: { id: 'comp-1', nickname: 'Imported Company', env: 'sandbox', isDemo: false },
    });
    // Stub window.location to prevent navigation errors in jsdom
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    });
  });

  it('renders with connection methods and allows switching between tabs', async () => {
    const user = userEvent.setup();
    render(<AddBusinessModal open={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

    expect(screen.getByText('Add Business Account')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /QuickBooks OAuth/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /1-Click Sandbox Import/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Demo Business/i })).toBeInTheDocument();

    // Default tab is OAuth
    expect(screen.getByRole('button', { name: /Connect with QuickBooks Online/i })).toBeInTheDocument();

    // Switch to Local Dev Tokens tab
    await user.click(screen.getByRole('button', { name: /1-Click Sandbox Import/i }));
    expect(screen.getByRole('button', { name: /1-Click Import Active Sandbox Company/i })).toBeInTheDocument();

    // Switch to Demo tab
    await user.click(screen.getByRole('button', { name: /Demo Business/i }));
    expect(screen.getByRole('button', { name: /Create Sample Demo Company/i })).toBeInTheDocument();
  });

  it('triggers local import and calls onSuccess callback', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    const onClose = vi.fn();

    render(<AddBusinessModal open={true} onClose={onClose} onSuccess={onSuccess} />);

    await user.click(screen.getByRole('button', { name: /1-Click Sandbox Import/i }));
    const importBtn = screen.getByRole('button', { name: /1-Click Import Active Sandbox Company/i });
    await user.click(importBtn);

    await waitFor(() => {
      expect(mocks.importLocal).toHaveBeenCalledTimes(1);
      expect(mocks.refreshCompanies).toHaveBeenCalledTimes(1);
      expect(mocks.setActiveCompany).toHaveBeenCalledWith('comp-1');
      expect(onSuccess).toHaveBeenCalledWith('comp-1');
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  it('requests connect url when clicking Connect with QuickBooks Online', async () => {
    const user = userEvent.setup();
    render(<AddBusinessModal open={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

    const connectBtn = screen.getByRole('button', { name: /Connect with QuickBooks Online/i });
    await user.click(connectBtn);

    await waitFor(() => {
      expect(mocks.connectUrl).toHaveBeenCalledWith({
        mode: 'real',
        env: 'sandbox',
        returnTo: 'settings',
      });
      expect(window.location.href).toBe('https://appcenter.intuit.com/connect/oauth2');
    });
  });

  it('requests demo connect url when clicking Create Sample Demo Company', async () => {
    const user = userEvent.setup();
    render(<AddBusinessModal open={true} onClose={vi.fn()} onSuccess={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Demo Business/i }));
    const demoBtn = screen.getByRole('button', { name: /Create Sample Demo Company/i });
    await user.click(demoBtn);

    await waitFor(() => {
      expect(mocks.connectUrl).toHaveBeenCalledWith({
        mode: 'demo',
        returnTo: 'settings',
      });
    });
  });
});
