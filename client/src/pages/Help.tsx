// Built-in manual — explains how Recat and the rest of the system fit
// together, in plain language. Reachable at all times via the "?" icon in
// Nav (desktop and mobile), independent of role — even a viewer can read it.

import { useState } from 'react';
import { InfoDot } from '../components/ui';

const HELP_CSS = `
.rr .help-layout { display: grid; grid-template-columns: 220px minmax(0,1fr); gap: 28px; align-items: start; }
.rr .help-nav { position: sticky; top: 84px; display: flex; flex-direction: column; gap: 2px; }
.rr .help-nav-item { display: block; width: 100%; text-align: left; border: none; background: none; padding: 9px 12px; border-radius: 7px; font-size: 13.5px; font-weight: 500; color: var(--mut); cursor: pointer; font-family: inherit; }
.rr .help-nav-item.is-active { background: var(--hl); color: var(--ink); font-weight: 600; }
.rr .help-section { scroll-margin-top: 84px; padding: 22px 24px; }
.rr .help-section + .help-section { margin-top: 14px; }
.rr .help-section h2 { font-family: 'Spectral', serif; font-size: 19px; font-weight: 500; margin: 0 0 10px; }
.rr .help-section p { font-size: 14px; line-height: 1.6; color: var(--ink); margin: 0 0 12px; }
.rr .help-section p:last-child { margin-bottom: 0; }
.rr .help-soon { border-color: var(--amD) !important; background: var(--amB) !important; }
.rr .help-soon h2 { color: var(--amT); }
@media (max-width: 760px) {
  .rr .help-layout { grid-template-columns: minmax(0,1fr); }
  .rr .help-nav { position: static; flex-direction: row; flex-wrap: wrap; gap: 6px; }
}
`;

interface Section {
  id: string;
  title: string;
  soon?: boolean;
  body: React.ReactNode;
}

const SECTIONS: Section[] = [
  {
    id: 'big-picture',
    title: 'The big picture',
    body: (
      <>
        <p>
          Recat is where a <b>human bookkeeper reviews every transaction</b> before anything is
          written to QuickBooks. Nothing posts on its own — an AI assistant proposes categories,
          but a person always has the final say before a change reaches the client&rsquo;s real
          books.
        </p>
        <p>
          Behind the scenes, Recat is one part of a small family of tools. This page walks through
          each piece and what it actually means for your day-to-day work in the Queue.
        </p>
      </>
    ),
  },
  {
    id: 'how-it-gets-here',
    title: 'How a transaction gets here',
    body: (
      <>
        <p>
          QuickBooks won&rsquo;t let outside tools see the bank feed&rsquo;s &ldquo;For
          Review&rdquo; tab directly, so Recat uses a standard workaround: a QuickBooks bank rule
          auto-adds new feed items into a dedicated <b>holding account</b> (for example, &ldquo;Ask
          My Accountant&rdquo;). Recat syncs everything sitting in that account into your{' '}
          <b>Queue</b> — that&rsquo;s the categorization list you work from every day.
        </p>
        <p>Each client company&rsquo;s holding accounts are set once, during setup, in Settings.</p>
      </>
    ),
  },
  {
    id: 'queue',
    title: 'The Queue',
    body: (
      <>
        <p>
          Every row is a transaction waiting on a category. A category box that&rsquo;s already
          filled in and labeled <b>suggested</b> came from an AI assistant that reads the payee and
          amount and proposes a category with a reason — it never posts by itself, it only
          proposes. A box labeled <b>rule</b> was filled in by one of your saved rules instead (see
          below).
        </p>
        <p>
          From a row you can accept the category as-is, <b>split</b> a transaction across several
          categories (each with its own tags), or mark two matching in/out transactions as a{' '}
          <b>transfer</b> with one click. Select multiple rows to categorize or post them together
          in bulk. Posting sends the transaction to QuickBooks and records it in the audit log.
        </p>
      </>
    ),
  },
  {
    id: 'rules',
    title: 'Rules',
    body: (
      <>
        <p>
          A rule says &ldquo;if the payee contains X, use category Y&rdquo; — useful for vendors
          that show up every week (a food supplier, a payroll provider). Once saved, a rule
          pre-fills the category on any matching future transaction automatically, saving you from
          re-picking it every time.
        </p>
        <p>
          A rule can also be set to <b>auto-post</b>, which skips the review step entirely for that
          match. Leave auto-post off for anything you&rsquo;d still want eyes on before it posts.
        </p>
      </>
    ),
  },
  {
    id: 'tags',
    title: 'Tags',
    body: (
      <>
        <p>
          Tags are private labels — a location, a project, an owner, anything useful for your own
          filtering and reporting. Unlike categories, <b>tags never get written back to
          QuickBooks</b> — they live only inside Recat, so you don&rsquo;t need any QuickBooks
          class-tracking plan to use them.
        </p>
        <p>Deleting a tag removes it from every transaction it was on; the transactions themselves are untouched.</p>
      </>
    ),
  },
  {
    id: 'audit-log',
    title: 'Audit log',
    body: (
      <p>
        Every write Recat makes to QuickBooks — a post, a split, an undo — is recorded in an{' '}
        <b>append-only audit log</b>: who did it, when, and what changed. Nothing in it can be
        edited or deleted, so there&rsquo;s always a clean record to point to if a client or an
        accountant asks &ldquo;why does this say that?&rdquo;
      </p>
    ),
  },
  {
    id: 'dry-run',
    title: 'Dry-run mode',
    body: (
      <p>
        Dry-run is a safety switch, on by default for new companies. While it&rsquo;s on, Recat
        logs the <i>exact</i> payload it would send to QuickBooks — without actually sending it.
        It&rsquo;s the way to try a new rule or a new company&rsquo;s setup risk-free before
        trusting it to post for real. Turn it off in Settings once you&rsquo;re confident.
      </p>
    ),
  },
  {
    id: 'settings-access',
    title: 'Settings & access',
    body: (
      <p>
        Admins manage the QuickBooks connection, holding accounts, team access and roles,
        whether tags are required before posting, and dry-run mode from <b>Settings</b>. If
        something in the Queue looks wrong — a missing account, a teammate who can&rsquo;t see a
        company — that&rsquo;s usually the first place to check, or the person on your team with
        admin access.
      </p>
    ),
  },
  {
    id: 'coming-soon',
    title: 'Coming soon',
    soon: true,
    body: (
      <>
        <p>
          Two pieces of the system are planned but <b>not live yet</b> — you won&rsquo;t see them
          in Recat today, and that&rsquo;s expected, not a bug:
        </p>
        <p>
          <b>Client receipt intake via Slack</b> — clients will eventually be able to drop a
          receipt photo into a Slack channel or answer a quick either/or question about an unclear
          transaction, feeding straight into the same suggestion system the Queue uses today.
        </p>
        <p>
          <b>Automated compliance checks</b> — background checks for things like a vendor crossing
          the $600 1099 filing threshold, or a client approaching their monthly transaction limit,
          are planned to run on a schedule and surface as alerts rather than a screen you visit.
        </p>
      </>
    ),
  },
];

export default function Help() {
  const [active, setActive] = useState(SECTIONS[0]!.id);

  const scrollTo = (id: string) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div style={{ maxWidth: 980, margin: '0 auto', padding: '28px clamp(14px,3.5vw,32px) 80px' }}>
      <style>{HELP_CSS}</style>
      <div style={{ marginBottom: 18 }}>
        <div className="page-title">How Recat works</div>
        <div className="page-sub" style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          A plain-language guide to Recat and the rest of the system behind it.
          <InfoDot tip="This page is a reference — jump to a section from the list, or just scroll." />
        </div>
      </div>

      <div className="help-layout">
        <nav className="help-nav" aria-label="Help sections">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`help-nav-item${active === s.id ? ' is-active' : ''}`}
              onClick={() => scrollTo(s.id)}
            >
              {s.title}
            </button>
          ))}
        </nav>

        <div>
          {SECTIONS.map((s) => (
            <section
              key={s.id}
              id={s.id}
              className={`card help-section${s.soon ? ' help-soon' : ''}`}
            >
              <h2>{s.title}</h2>
              {s.body}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
