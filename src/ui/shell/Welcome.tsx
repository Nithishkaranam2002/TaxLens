import { ArrowRight, ChevronDown, FileSearch, History, Loader2, MousePointerClick, PlayCircle, ShieldCheck, Users } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { store, useApp, useWorkpaper } from '../../app/store';
import type { Actor } from '../../engine/people';
import { Avatar, Button, cx } from '../kit';
import { Logo } from './Logo';

export function Welcome() {
  const ix = useApp((s) => s.ix)!;
  const actors = useApp((s) => s.actors);
  const wp = useWorkpaper();
  const [busy, setBusy] = useState(false);
  const findings = wp.findings.filter((f) => f.check.status === 'fail').length;
  const reviews = wp.findings.filter((f) => f.check.status === 'review').length;
  const priya = actors.find((a) => a.id === 'st-01');
  const daniel = actors.find((a) => a.id === 'st-02');
  const p = ix.packet;
  const eng = ix.engagement;

  const fresh = () => { store.setMe('st-01'); store.welcome(); store.go({ page: 'overview' }); };
  const season = async () => {
    setBusy(true);
    // Let the spinner paint before the season is built.
    await new Promise((r) => setTimeout(r, 30));
    try { await store.loadSeason('st-02'); } catch (e) { store.toast(e instanceof Error ? e.message : String(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[55] overflow-y-auto bg-bg anim-fade" style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="mx-auto flex min-h-full w-full max-w-[1200px] flex-col px-4 sm:px-8">
        <header className="flex items-center justify-between py-6">
          <Logo />
          <Button variant="ghost" size="sm" onClick={() => store.welcome()}>Just look around</Button>
        </header>

        <main className="grid flex-1 grid-cols-1 content-center gap-x-16 gap-y-10 py-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:py-10">
          <section className="anim-rise lg:col-start-1 lg:row-start-1 lg:self-end">
            <div className="text-sm font-medium text-fg-3">{eng.fileName} · {eng.year} return · {eng.filingStatus}</div>
            <h1 id="welcome-title" className="serif mt-3 text-[clamp(2.25rem,5vw,3.25rem)] leading-[1.08] font-semibold tracking-[-0.02em]">Every number carries its proof.</h1>
            <p className="mt-5 max-w-[54ch] text-md text-fg-2">
              A web-native tax workpaper. Click any amount to see how it was built, the exact field on the page it came from, who checked it, and what changed it and why.
            </p>
          </section>

          <section className="anim-rise space-y-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center" aria-label="Choose how to start">
            <Choice onClick={fresh} icon={<PlayCircle />} title="Start fresh" who={priya} role="preparer"
              text="The packet as delivered, on July 1, 2026, with nothing done yet. Work the findings, propose corrections and take the return to filing." />
            <Choice onClick={season} disabled={busy} busy={busy} icon={<History />} title="Load the recorded season" who={daniel} role="reviewer"
              text="March to June 2026 by the firm's team of five: corrections, review notes, a late K-1 that reopened sign-offs. Changes are waiting for your approval." />
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-4">
              <Fact n={p.documents.length} label="documents" />
              <Fact n={p.extracted_values.length.toLocaleString('en-US')} label="values read" />
              <Fact n={wp.checks.length} label="checks run" />
              <Fact n={findings + reviews} label={`findings: ${findings} errors, ${reviews} to review`} />
            </dl>
            <HowItWorks />
          </section>

          <section className="anim-rise lg:col-start-1 lg:row-start-2 lg:self-start" aria-label="What it does">
            <ul className="space-y-5">
              <Point icon={<MousePointerClick />} title="Proof on every number">Rule and inputs, the source page with the value highlighted, verifications, changes and open questions, in one panel.</Point>
              <Point icon={<ShieldCheck />} title="The firm's rules, enforced">No self-review, partner approval over 1,000, masked identifiers. A refusal quotes the rule.</Point>
              <Point icon={<History />} title="One log behind everything">Undo, sign-offs that reopen, filing, amending and answering a notice all come from the same append-only record.</Point>
            </ul>
          </section>

        </main>

        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-5 text-sm text-fg-3">
          <span>Built by <span className="font-medium text-fg-2">Nithish Karanam</span> · Case study for MiraFlores AI, <i>Redesign the Tax Workpaper</i></span>
          <span>Packet {p.packet.client_id} · SHA-256 {ix.sha256.slice(0, 12)}…</span>
        </footer>
      </div>
    </div>
  );
}

function Point({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-panel text-fg-2 [&_svg]:size-5">{icon}</span>
      <span>
        <span className="block text-md font-semibold">{title}</span>
        <span className="block text-sm text-fg-2">{children}</span>
      </span>
    </li>
  );
}

function Choice({ onClick, disabled, busy, icon, title, text, who, role }: { onClick: () => void; disabled?: boolean; busy?: boolean; icon: ReactNode; title: string; text: string; who?: Actor; role: string }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="group flex w-full flex-col rounded-2xl border border-line bg-panel p-5 text-left shadow-1 transition-[border-color,box-shadow] hover:border-fg-3 hover:shadow-2 disabled:opacity-80 sm:p-6">
      <span className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-btn text-btn-fg [&_svg]:size-5">{icon}</span>
        <span className="flex-1 text-xl font-semibold tracking-[-0.01em]">{title}</span>
        {busy ? <Loader2 className="size-5 animate-spin text-fg-3" /> : <ArrowRight className="size-5 text-fg-3 transition-transform group-hover:translate-x-1 group-hover:text-fg" />}
      </span>
      <span className="mt-3 text-base text-fg-2">{text}</span>
      <span className="mt-4 flex items-center gap-2 text-sm text-fg-3">
        <Avatar actor={who} size={24} />
        <span>{busy ? 'Building the season…' : <>You are <span className="font-medium text-fg-2">{who?.name}</span>, {role}</>}</span>
      </span>
    </button>
  );
}

function Fact({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="bg-panel px-4 py-3">
      <dt className="sr-only">{label}</dt>
      <dd className="num text-xl font-semibold">{n}</dd>
      <div className="text-cap text-fg-3" aria-hidden>{label}</div>
    </div>
  );
}

function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-panel">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex h-12 w-full items-center gap-2 px-4 text-left text-base font-medium">
        <span className="flex-1">How it works</span>
        <ChevronDown className={cx('size-4 text-fg-3 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="grid grid-cols-1 gap-3 border-t border-line px-4 py-4 text-sm text-fg-2 sm:grid-cols-2">
          <Tip icon={<MousePointerClick />}>Numbers with a dotted underline open their proof. Sources open the page with the field highlighted.</Tip>
          <Tip icon={<Users />}>Each browser tab is one person. Open a second tab, switch person (top right), and work side by side.</Tip>
          <Tip icon={<ShieldCheck />}>The firm's rules are enforced: no self-review, partner approval over 1,000, masked identifiers.</Tip>
          <Tip icon={<FileSearch />}>Press <kbd className="mono rounded-md border border-line-2 px-1.5 text-cap">/</kbd> to find any number, document, check or person.</Tip>
        </div>
      )}
    </div>
  );
}

function Tip({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <div className="flex gap-2.5"><span className="mt-0.5 shrink-0 text-fg-3 [&_svg]:size-4">{icon}</span><span>{children}</span></div>;
}
