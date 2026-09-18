// Company routes — mounted at /api/companies. Connect/disconnect, settings
// patch, manual sync, chart of accounts, holding-account setup, sync log.
// Nested per-company data routers (transactions/tags/rules/...) are mounted
// separately in index.ts; this file owns the company resource itself.

import { Router } from 'express';
import { z } from 'zod';
import type { Company } from '@prisma/client';
import {
  isHoldingAccountName,
  type CompanyDto,
  type PollInterval,
  type QboAccountDto,
  type QboDiagnosticCode,
  type SyncLogDto,
} from '@recat/shared';
import { parseConnectRequest } from '../lib/connectRequest.js';
import { asyncHandler, HttpError, validate } from '../lib/http.js';
import { prisma } from '../lib/prisma.js';
import { classifyQboFailure } from '../lib/qbo/diagnostics.js';
import {
  hasIntuitCredentials,
  inspectAuthorizedConnection,
  qboFactory,
  testCompanyConnection,
} from '../lib/qbo/factory.js';
import { refreshTokenGrant } from '../lib/qbo/real.js';
import { encrypt } from '../lib/crypto.js';
import { env } from '../env.js';
import { requireInstanceAdmin, requireRole, requireUser } from '../middleware/auth.js';
import { withCompany } from '../middleware/company.js';
import {
  disconnectCompanyWithLiveAuthority,
  updateCompanySettingsWithLiveAuthority,
} from '../services/companyLiveAuthority.js';
import { syncCompany } from '../services/sync.js';
import { createOauthState, defaultNickname } from './qboOauth.js';
import { teamRouter } from './team.js';
import {
  ATTACHMENT_POLICY_BOUNDS,
  resolveAttachmentStoragePolicy,
} from '../services/attachments/policy.js';
import {
  getAttachmentStoragePolicyDefaults,
  getAttachmentStoragePolicyDto,
} from '../services/attachments/policyStore.js';
import { AttachmentError } from '../services/attachments/types.js';

function jsonStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function toPollInterval(n: number): PollInterval {
  return n === 5 || n === 10 || n === 30 || n === 60 ? n : 10;
}

export function toCompanyDto(c: Company): CompanyDto {
  return {
    id: c.id,
    realmId: c.realmId,
    legalName: c.legalName,
    nickname: c.nickname,
    env: c.env,
    syncMode: c.syncMode,
    pollIntervalMin: toPollInterval(c.pollIntervalMin),
    holdingAccountIds: jsonStringArray(c.holdingAccountIds),
    dryRun: c.dryRun,
    tagsRequired: c.tagsRequired,
    retainAttachmentFiles: c.retainAttachmentFiles,
    connectedAt: c.connectedAt.toISOString(),
    disconnectedAt: c.disconnectedAt?.toISOString() ?? null,
    lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
  };
}

function scopedCompany(req: { company?: Company }): Company {
  if (!req.company) throw new HttpError(404, 'Company not found', 'COMPANY_NOT_FOUND');
  return req.company;
}

const patchBody = z.object({
  nickname: z.string().trim().min(1).max(120).optional(),
  syncMode: z.enum(['polling', 'webhook']).optional(),
  pollIntervalMin: z.union([z.literal(5), z.literal(10), z.literal(30), z.literal(60)]).optional(),
  holdingAccountIds: z.array(z.string().min(1)).min(1).optional(),
  dryRun: z.boolean().optional(),
  tagsRequired: z.boolean().optional(),
  retainAttachmentFiles: z.boolean().optional(),
  attachmentQuotaBytes: z.union([
    z.string().regex(/^\d+$/).transform((value) => BigInt(value)).refine(
      (value) => value >= ATTACHMENT_POLICY_BOUNDS.companyQuotaMinBytes
        && value <= ATTACHMENT_POLICY_BOUNDS.companyQuotaMaxBytes,
    ),
    z.null(),
  ]).optional(),
  attachmentRetentionDays: z.number().int()
    .min(ATTACHMENT_POLICY_BOUNDS.retentionMinDays)
    .max(ATTACHMENT_POLICY_BOUNDS.retentionMaxDays)
    .nullable()
    .optional(),
});

const holdingAccountsBody = z.object({ holdingAccountIds: z.array(z.string().min(1)).min(1) });

export const companiesRouter = Router();
companiesRouter.use(requireUser);

// Per-company team management (Team card) — nested here so index.ts stays
// untouched; teamRouter does its own withCompany + company-admin gating.
companiesRouter.use('/:companyId/team', teamRouter);

// Companies visible to the signed-in user: instance admins see every
// connected company; everyone else only the companies they have a
// membership in (per-company data reads are role-gated on their own routes).
companiesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = req.user;
    if (!user) throw new HttpError(401, 'Not signed in', 'UNAUTHENTICATED');
    const companies = await prisma.company.findMany({
      where: {
        disconnectedAt: null,
        ...(user.isInstanceAdmin ? {} : { memberships: { some: { userId: user.id } } }),
      },
      orderBy: { connectedAt: 'asc' },
    });
    const body: CompanyDto[] = companies.map(toCompanyDto);
    res.json(body);
  }),
);

// Start a connect flow (instance admin — connecting a company is an
// instance-level act). The user's choices ride along:
//   GET /connect-url?mode=real|demo&env=sandbox|production
// mode=demo → the built-in fake consent page (no credentials needed, always
// available); mode=real (default) → the Intuit authorize URL, 400 with an
// actionable message when credentials are missing. The env choice is carried
// on the state token so the callback records exactly what the user picked.
// POST /connect is kept as the handoff §4 spelling of the same thing.
const connectHandler = asyncHandler(async (req, res) => {
  const body = typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : {};
  const input = {
    mode: body.mode ?? req.query.mode,
    env: body.env ?? req.query.env,
  };
  const returnTo = typeof body.returnTo === 'string'
    ? body.returnTo
    : typeof req.query.returnTo === 'string'
      ? req.query.returnTo
      : null;
  const parsed = parseConnectRequest(input, await hasIntuitCredentials());
  const state = createOauthState({ mode: parsed.mode, env: parsed.env, returnTo });
  res.json({ url: await qboFactory.authorizeUrl(state, parsed.mode) });
});
companiesRouter.get('/connect-url', requireInstanceAdmin, connectHandler);
companiesRouter.post('/connect', requireInstanceAdmin, connectHandler);

companiesRouter.post(
  '/import-local',
  requireInstanceAdmin,
  asyncHandler(async (req, res) => {
    const fs = await import('node:fs');
    const path = await import('node:path');

    const tokenPaths = [
      process.env.QUICKBOOKS_TOKEN_STORE_PATH,
      path.resolve(process.cwd(), '../../tools/quickbooks-mcp-server/.env'),
      path.resolve(process.cwd(), '../tools/quickbooks-mcp-server/.env'),
      path.resolve(process.cwd(), '../../scripts/qbo-sandbox-seed/.tokens.json'),
      path.resolve(process.cwd(), '../scripts/qbo-sandbox-seed/.tokens.json'),
    ].filter(Boolean) as string[];

    let foundTokenStore: string | null = null;
    for (const p of tokenPaths) {
      if (fs.existsSync(p)) {
        foundTokenStore = p;
        break;
      }
    }

    if (!foundTokenStore) {
      throw new HttpError(404, 'No local QuickBooks tokens found on server.', 'TOKENS_NOT_FOUND');
    }

    let clientId = env.QBO_CLIENT_ID;
    let clientSecret = env.QBO_CLIENT_SECRET;
    let refreshToken = '';
    let realmId = '';
    let environment: 'sandbox' | 'production' = env.QBO_ENVIRONMENT || 'sandbox';

    if (foundTokenStore.endsWith('.json')) {
      const json = JSON.parse(fs.readFileSync(foundTokenStore, 'utf8'));
      refreshToken = json.refreshToken || '';
      realmId = json.realmId || '';
    } else {
      const content = fs.readFileSync(foundTokenStore, 'utf8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const k = trimmed.slice(0, eqIdx).trim();
          const v = trimmed.slice(eqIdx + 1).trim();
          if (k === 'QUICKBOOKS_CLIENT_ID' && !clientId) clientId = v;
          if (k === 'QUICKBOOKS_CLIENT_SECRET' && !clientSecret) clientSecret = v;
          if (k === 'QUICKBOOKS_REFRESH_TOKEN') refreshToken = v;
          if (k === 'QUICKBOOKS_REALM_ID') realmId = v;
          if (k === 'QUICKBOOKS_ENVIRONMENT') environment = v as any;
        }
      }
    }

    if (!clientId || !clientSecret || !refreshToken || !realmId) {
      throw new HttpError(400, 'Incomplete QuickBooks credentials in local token store.', 'INVALID_TOKENS');
    }

    const refreshed = await refreshTokenGrant({
      clientId,
      clientSecret,
      refreshToken,
    });

    const inspected = await inspectAuthorizedConnection({
      realmId,
      environment,
      mode: 'real',
      tokens: refreshed,
    });

    const tokenData = {
      accessToken: encrypt(inspected.tokens.accessToken),
      refreshToken: encrypt(inspected.tokens.refreshToken),
      tokenExpiresAt: new Date(inspected.tokens.expiresAt),
    };

    const legalName = inspected.info.legalName || 'QuickBooks Sandbox Company';
    const nickname = defaultNickname(legalName);

    const company = await prisma.company.upsert({
      where: { realmId },
      update: {
        legalName,
        nickname,
        env: environment,
        ...tokenData,
        disconnectedAt: null,
      },
      create: {
        realmId,
        legalName,
        nickname,
        env: environment,
        ...tokenData,
        dryRun: false,
      },
    });

    if (req.user) {
      await prisma.membership.upsert({
        where: {
          userId_companyId: {
            userId: req.user.id,
            companyId: company.id,
          },
        },
        update: { role: 'admin' },
        create: {
          userId: req.user.id,
          companyId: company.id,
          role: 'admin',
        },
      });
    }

    res.json({ ok: true, company: toCompanyDto(company) });
  }),
);

companiesRouter.get(
  '/:companyId/attachment-storage-policy',
  withCompany({ allowDisconnected: true }),
  requireRole('viewer'),
  asyncHandler(async (req, res) => {
    const policy = await getAttachmentStoragePolicyDto(scopedCompany(req).id);
    if (policy === null) {
      throw new HttpError(404, 'Company not found', 'COMPANY_NOT_FOUND');
    }
    res.json(policy);
  }),
);

function qboDiagnosticStatus(code: QboDiagnosticCode): number {
  return code === 'COMPANY_DISCONNECTED' ? 409 : 502;
}

function qboDiagnosticMessage(code: QboDiagnosticCode): string {
  return code === 'COMPANY_DISCONNECTED'
    ? 'This company is disconnected from QuickBooks.'
    : 'QuickBooks connection test failed.';
}

companiesRouter.post(
  '/:companyId/test-connection',
  requireInstanceAdmin,
  withCompany({ allowDisconnected: true }),
  asyncHandler(async (req, res) => {
    try {
      res.json(await testCompanyConnection(scopedCompany(req).id));
    } catch (error) {
      const code = classifyQboFailure(error, 'company_info');
      throw new HttpError(qboDiagnosticStatus(code), qboDiagnosticMessage(code), code);
    }
  }),
);

companiesRouter.patch(
  '/:companyId',
  withCompany({ allowDisconnected: true }),
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const company = scopedCompany(req);
    const patch = validate(patchBody)(req.body);
    const attachmentPolicyChanged = patch.attachmentQuotaBytes !== undefined
      || patch.attachmentRetentionDays !== undefined;
    if (attachmentPolicyChanged) {
      if (req.user?.isInstanceAdmin !== true) {
        throw new HttpError(403, 'You do not have permission to do that', 'FORBIDDEN');
      }
      try {
        resolveAttachmentStoragePolicy({
          attachmentQuotaBytes: patch.attachmentQuotaBytes === undefined
            ? company.attachmentQuotaBytes
            : patch.attachmentQuotaBytes,
          attachmentRetentionDays: patch.attachmentRetentionDays === undefined
            ? company.attachmentRetentionDays
            : patch.attachmentRetentionDays,
        }, await getAttachmentStoragePolicyDefaults());
      } catch (error) {
        if (error instanceof AttachmentError && error.code === 'ATTACHMENT_POLICY_INVALID') {
          throw new HttpError(400, error.message, error.code);
        }
        throw error;
      }
    }

    const holdingChanged =
      patch.holdingAccountIds !== undefined &&
      JSON.stringify(patch.holdingAccountIds) !== JSON.stringify(jsonStringArray(company.holdingAccountIds));

    const updated = await updateCompanySettingsWithLiveAuthority(company.id, patch);

    // Watching different holding accounts changes what the queue should hold —
    // kick a manual sync in the background.
    if (holdingChanged && updated.disconnectedAt === null) {
      void syncCompany(updated.id, 'manual').catch((err) =>
        console.error(`[companies] post-patch sync failed for ${updated.id}:`, err),
      );
    }

    res.json(toCompanyDto(updated));
  }),
);

// Disconnect: revoke tokens (best effort), keep all history. Instance admin
// only — disconnecting a company is an instance-level act, like connecting.
companiesRouter.delete(
  '/:companyId',
  requireInstanceAdmin,
  withCompany({ allowDisconnected: true }),
  asyncHandler(async (req, res) => {
    const company = scopedCompany(req);
    const disconnected = await disconnectCompanyWithLiveAuthority(company.id);
    await disconnected.revoke();
    res.json({ ok: true });
  }),
);

companiesRouter.post(
  '/:companyId/sync',
  withCompany(),
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const company = scopedCompany(req);
    const result = await syncCompany(company.id, 'manual');
    const fresh = await prisma.company.findUnique({ where: { id: company.id } });
    res.json({
      ok: result.ok,
      message: result.message,
      lastSyncedAt: fresh?.lastSyncedAt?.toISOString() ?? null,
    });
  }),
);

companiesRouter.get(
  '/:companyId/accounts',
  withCompany({ allowDisconnected: true }),
  requireRole('categorizer'),
  asyncHandler(async (req, res) => {
    const company = scopedCompany(req);
    const accounts = await prisma.qboAccount.findMany({
      where: { companyId: company.id, active: true },
      orderBy: { fullName: 'asc' },
    });
    const body: QboAccountDto[] = accounts.map((a) => ({
      id: a.id,
      qboId: a.qboId,
      name: a.name,
      fullName: a.fullName,
      classification: a.classification,
      active: a.active,
    }));
    res.json(body);
  }),
);

// Setup wizard: candidate holding accounts with how many txns currently post
// there. Straight from QBO (a few queries in real mode — acceptable).
companiesRouter.get(
  '/:companyId/holding-account-options',
  withCompany(),
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const company = scopedCompany(req);
    const client = await qboFactory.forCompany(company.id);
    const accounts = await client.listAccounts();
    const currentIds = jsonStringArray(company.holdingAccountIds);
    const candidates = accounts.filter(
      (account) => account.active && (
        isHoldingAccountName(account.name) || currentIds.includes(account.qboId)
      ),
    );
    const candidateIds = new Set(candidates.map((c) => c.qboId));

    const counts = new Map<string, number>();
    if (candidateIds.size > 0) {
      const txns = await client.listTxnsInAccounts([...candidateIds]);
      for (const t of txns) {
        // Count each txn once per candidate account it posts to.
        const hit = new Set(t.lines.map((l) => l.accountQboId).filter((id) => candidateIds.has(id)));
        for (const id of hit) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }

    res.json(candidates.map((c) => ({ qboId: c.qboId, name: c.name, count: counts.get(c.qboId) ?? 0 })));
  }),
);

// Setup wizard step 4: save the watched holding accounts and run the initial
// sync (awaited — the wizard shows a spinner while this runs).
companiesRouter.post(
  '/:companyId/holding-accounts',
  withCompany(),
  requireRole('admin'),
  asyncHandler(async (req, res) => {
    const company = scopedCompany(req);
    const { holdingAccountIds } = validate(holdingAccountsBody)(req.body);
    await prisma.company.update({ where: { id: company.id }, data: { holdingAccountIds } });
    try {
      await syncCompany(company.id, 'initial');
    } catch (err) {
      throw new HttpError(
        502,
        `Initial sync failed: ${err instanceof Error ? err.message : String(err)}`,
        'INITIAL_SYNC_FAILED',
      );
    }
    const fresh = await prisma.company.findUnique({ where: { id: company.id } });
    if (!fresh) throw new HttpError(404, 'Company not found', 'COMPANY_NOT_FOUND');
    res.json(toCompanyDto(fresh));
  }),
);

companiesRouter.get(
  '/:companyId/sync-log',
  withCompany({ allowDisconnected: true }),
  requireRole('categorizer'),
  asyncHandler(async (req, res) => {
    const company = scopedCompany(req);
    const rows = await prisma.syncLog.findMany({
      where: { companyId: company.id },
      orderBy: { at: 'desc' },
      take: 20,
    });
    const body: SyncLogDto[] = rows.map((r) => ({
      id: r.id,
      kind: r.kind as SyncLogDto['kind'],
      ok: r.ok,
      message: r.message,
      at: r.at.toISOString(),
    }));
    res.json(body);
  }),
);
