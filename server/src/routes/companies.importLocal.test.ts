import express, { type RequestHandler } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorMiddleware } from '../lib/http.js';

const mocks = vi.hoisted(() => ({
  companyUpsert: vi.fn(),
  membershipUpsert: vi.fn(),
  refreshTokenGrant: vi.fn(),
  inspectAuthorizedConnection: vi.fn(),
  encrypt: vi.fn((s: string) => `encrypted-${s}`),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    company: {
      upsert: mocks.companyUpsert,
      findMany: vi.fn().mockResolvedValue([]),
    },
    membership: {
      upsert: mocks.membershipUpsert,
    },
  },
}));

vi.mock('../lib/qbo/real.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/qbo/real.js')>();
  return {
    ...actual,
    refreshTokenGrant: mocks.refreshTokenGrant,
  };
});

vi.mock('../lib/qbo/factory.js', () => ({
  hasIntuitCredentials: vi.fn().mockResolvedValue(true),
  inspectAuthorizedConnection: mocks.inspectAuthorizedConnection,
  qboFactory: {
    authorizeUrl: vi.fn(),
  },
  testCompanyConnection: vi.fn(),
}));

vi.mock('../lib/crypto.js', () => ({
  encrypt: mocks.encrypt,
}));

vi.mock('../middleware/auth.js', () => ({
  requireUser: ((req, _res, next) => {
    req.user = { id: 'admin-1', isInstanceAdmin: true, memberships: [] } as any;
    next();
  }) satisfies RequestHandler,
  requireInstanceAdmin: ((req, _res, next) => {
    req.user = { id: 'admin-1', isInstanceAdmin: true, memberships: [] } as any;
    next();
  }) satisfies RequestHandler,
  requireRole: () => ((_req, _res, next) => next()) satisfies RequestHandler,
}));

vi.mock('../services/sync.js', () => ({
  syncCompany: vi.fn(),
}));

import { companiesRouter } from './companies.js';

function app() {
  const application = express();
  application.use(express.json());
  application.use('/api/companies', companiesRouter);
  application.use(errorMiddleware);
  return application;
}

describe('POST /api/companies/import-local', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it('returns 404 if no local token store is found', async () => {
    process.env.QUICKBOOKS_TOKEN_STORE_PATH = '/nonexistent/path/to/tokens.json';

    const res = await request(app()).post('/api/companies/import-local');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('TOKENS_NOT_FOUND');
  });

  it('successfully imports company when local credentials are valid', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qbo-tokens-test-'));
    const tempTokens = path.join(tempDir, '.tokens.json');
    fs.writeFileSync(
      tempTokens,
      JSON.stringify({
        refreshToken: 'valid-refresh-token',
        realmId: '9341457935506736',
      }),
      'utf8',
    );

    process.env.QUICKBOOKS_TOKEN_STORE_PATH = tempTokens;
    process.env.QBO_CLIENT_ID = 'test-client-id';
    process.env.QBO_CLIENT_SECRET = 'test-client-secret';

    mocks.refreshTokenGrant.mockResolvedValue({
      accessToken: 'fresh-access-token',
      refreshToken: 'fresh-refresh-token',
      expiresAt: Date.now() + 3600000,
    });

    mocks.inspectAuthorizedConnection.mockResolvedValue({
      tokens: {
        accessToken: 'fresh-access-token',
        refreshToken: 'fresh-refresh-token',
        expiresAt: Date.now() + 3600000,
      },
      info: {
        legalName: 'Sandbox Company US 504c',
      },
    });

    mocks.companyUpsert.mockResolvedValue({
      id: 'imported-company-1',
      realmId: '9341457935506736',
      legalName: 'Sandbox Company US 504c',
      nickname: 'Sandbox Company US 504c',
      env: 'sandbox',
      syncMode: 'manual',
      pollIntervalMin: 60,
      holdingAccountIds: [],
      dryRun: false,
      tagsRequired: false,
      connectedAt: new Date(),
      disconnectedAt: null,
      lastSyncedAt: null,
      taxReferenceRefreshedAt: null,
      taxUsingSalesTax: null,
      taxSupportStatus: 'needs_setup',
      taxSupportReason: null,
    });

    const res = await request(app()).post('/api/companies/import-local');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.company.nickname).toBe('Sandbox Company US 504c');
    expect(mocks.refreshTokenGrant).toHaveBeenCalledWith({
      clientId: expect.any(String),
      clientSecret: expect.any(String),
      refreshToken: 'valid-refresh-token',
    });
    expect(mocks.companyUpsert).toHaveBeenCalled();

    // Clean up temp file
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
