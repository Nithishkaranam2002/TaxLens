import { ArrowRight, FileSearch, History, MousePointerClick, PlayCircle, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { store, useApp, useWorkpaper } from '../../app/store';
import { Avatar, Button } from '../kit';
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

  const fresh = () => { store.setMe('st-01'); store.welcome(); store.go({ page: 'overview' }); };
  const season = async () => {
    setBusy(true);
    // Let the spinner paint before the season is built.
    await new Promise((r) => setTimeout(r, 30));
    try { await store.loadSeason('st-02'); } catch (e) { store.toast(e instanceof Error ? e.message : String(e), 'error'); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-[var(--scrim)] p-4 pt-[6vh] anim-fade">
      <div role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="w-full max-w-[760px] overflow-hidden rounded-2xl border border-line bg-panel shadow-2 anim-rise">
        <div className="border-b border-line bg-panel-2 px-6 pt-6 pb-5">
          <Logo />
          <h1 id="welcome-title" className="serif mt-4 text-2xl leading-tight font-semibold tracking-[-0.01em]">Every number carries its proof.</h1>
          <p className="mt-2 max-w-[62ch] text-md text-fg-2">
            TaxLens is a web-native workpaper for the {ix.engagement.fileName} {ix.engagement.year} return. Click any amount to see how it was built, the exact field on the page it came from, who checked it, and what changed it and why.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <Fact n={p.documents.length} label="documents in the packet" />
            <Fact n={p.extracted_values.length.toLocaleString('en-US')} label="values read from them" />
            <Fact n={wp.checks.length} label="independent checks, already run" />
            <Fact n={findings + reviews} label={`findings (${findings} errors, ${reviews} to review)`} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 p-6 sm:grid-cols-2">
          <button type="button" onClick={fresh} className="group flex flex-col rounded-xl border border-line-2 bg-panel p-4 text-left transition-colors hover:border-fg-3">
            <div className="flex items-center gap-2"><PlayCircle className="size-4.5 text-fg-2" /><span className="text-md font-semibold">Start the work fresh</span></div>
            <p className="mt-1.5 flex-1 text-base text-fg-2">The packet as delivered, on July 1, 2026, with nothing done yet. Work the findings, propose corrections and take the return to filing.</p>
            <div className="mt-3 flex items-center gap-2 text-sm text-fg-3"><Avatar actor={priya} size={20} />You are {priya?.name}, preparer<ArrowRight className="ml-auto size-4 text-fg-3 transition-transform group-hover:translate-x-0.5" /></div>
          </button>
          <button type="button" onClick={season} disabled={busy} className="group flex flex-col rounded-xl border border-line-2 bg-panel p-4 text-left transition-colors hover:border-fg-3 disabled:opacity-70">
            <div className="flex items-center gap-2"><History className="size-4.5 text-fg-2" /><span className="text-md font-semibold">Load the recorded season</span></div>
            <p className="mt-1.5 flex-1 text-base text-fg-2">March to June 2026 by the firm's team of five: corrections, review notes, a late K-1 that reopened sign-offs. Changes are waiting for your approval.</p>
            <div className="mt-3 flex items-center gap-2 text-sm text-fg-3"><Avatar actor={daniel} size={20} />You are {daniel?.name}, reviewer{busy ? <span className="ml-auto">Building the season…</span> : <ArrowRight className="ml-auto size-4 text-fg-3 transition-transform group-hover:translate-x-0.5" />}</div>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-line px-6 py-4 text-sm text-fg-2 sm:grid-cols-2">
          <Tip icon={<MousePointerClick className="size-3.5" />}>Numbers with a dotted underline open their proof. Sources open the page with the field highlighted.</Tip>
          <Tip icon={<Users className="size-3.5" />}>Each browser tab is one person. Open a second tab, switch person (top right), and work side by side.</Tip>
          <Tip icon={<ShieldCheck className="size-3.5" />}>The firm's rules are enforced: no self-review, partner approval over 1,000, masked identifiers.</Tip>
          <Tip icon={<FileSearch className="size-3.5" />}>Press <kbd className="mono rounded border border-line-2 px-1 text-cap">/</kbd> to find any number, document, check or person.</Tip>
        </div>
        <div className="flex justify-end border-t border-line px-6 py-3">
          <Button variant="ghost" size="sm" onClick={() => store.welcome()}>Just look around</Button>
        </div>
      </div>
    </div>
  );
}

function Fact({ n, label }: { n: number | string; label: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2">
      <div className="num text-lg leading-tight font-semibold">{n}</div>
      <div className="text-fg-3">{label}</div>
    </div>
  );
}

function Tip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex gap-2"><span className="mt-0.5 text-fg-3">{icon}</span><span>{children}</span></div>;
}
