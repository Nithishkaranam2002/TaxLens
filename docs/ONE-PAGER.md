# Tickmark: every number carries its proof

## The idea

A paper workpaper earns trust through tickmarks: a small mark beside a number that says *I agreed this to the source*. Spreadsheets lost that. The number and its proof live in different places, and the proof goes stale when the number changes.

Tickmark puts the proof on the number. Click any amount on the return and one panel answers the questions a 20-year CPA asks in order:

1. **How was it built?** The engine's rule and inputs, and Tickmark's own recomputation of the same line.
2. **Where did it come from?** Each source value, opening the document page with that value highlighted, plus a flag if a re-read of the page disagrees.
3. **Who checked it, and how?** Verifications drawn as tickmarks in the verifier's ink (preparer blue, reviewer green, partner violet).
4. **What changed it, and why?** Each adjustment with the original kept, who proposed and approved it, the evidence, the authority and the exact tax effect.
5. **What is still open?** Notes, client questions, checks that look at this number.

A new hire needs no map: every screen is a list of things to do, and every number explains itself.

## The data model

```
Packet (immutable, as delivered, SHA-256)          Activity log (append-only events)
  documents → pages → extracted values               propose · decide · withdraw · verify · note · attach
  engine versions → lines (rule, inputs, sources)    judgment · disposition · sign-off · assign · time
  prior year, agency records, client answers         client approval · transmit · result · freeze
  firm: staff, standards, budgets, deadlines         amend · notice response · reveal · revert
                 │                                                    │
                 └──────────────┬─────────────────────────────────────┘
                                ▼
           Workpaper = derive(packet, fold(events up to time T))
             our return  = recompute(engine version, approved changes)
             findings    = checks(packet at T) + their corrections and dispositions
             sign-offs   = signed fingerprint vs the area's fingerprint now
             blockers    = everything that still stands between the file and filing
```

**Three inputs, one function.** The packet never changes. Everything people do is an event: who, when (on the season clock), what. The screen shows a pure function of the packet, the log and the time being viewed. That one decision is what makes the rest simple:

- **Undo** appends a revert; nothing is deleted. A batch (say, approving 18 changes) shares an id, so one undo reverses it.
- **"What changed since I last looked"** is the part of the log after your last *seen* event.
- **Compare versions or look back** at any date: fold the log up to that moment.
- **Sign-offs that reopen.** A sign-off stores the fingerprint and a snapshot of its area (lines, approved changes, judgments, documents). If anything in the area changes, the fingerprint no longer matches; the sign-off shows *reopened* with the exact list of what moved.
- **Client approval that lapses.** The client signs a fingerprint of the amounts. If the return changes afterwards, the approval lapses.
- **Freeze, amend, answer a notice.** Filing records a freeze event with the filed values. Later changes need an amendment on top of it, with the same review and signatures. A 2028 IRS letter is answered from the frozen record, and the package carries a fingerprint of what was sent.
- **Assignments, deadlines, notifications.** A note is handed to a person with a date; a question to the client carries the date asked for. Nothing is stored for notifications: each person's list is derived from the log on every change (changes to approve, notes for them, their sign-offs that reopened, overdue questions, firm deadlines near or passed on the season clock).
- **Live collaboration.** Two tabs or two people append to the same log (BroadcastChannel in the browser; an optional Postgres log behind one Vercel Function, idempotent by event id).

**Checks that do not trust the engine.** The engine's arithmetic is verified by an independent recompute that reproduces all three engine runs and all five what-ifs to the dollar. That same recompute gives each correction its exact effect on federal and California tax, so the partner-approval threshold uses the real number, not a per-dollar estimate. The inputs are verified separately: every extracted value is re-read against its printed page, brokers are tied to their summaries, books are rebuilt to Schedule C, payments are agreed to the IRS transcript and the FTB account, and the client's answers are weighed against the documents.

**Rules in the actions, not the screens.** Every action is checked before anything is recorded: no self-review, partner approval over 1,000, authority required for judgment calls, open review notes block filing, identifiers masked for staff without clearance and every unmasked view logged, nothing changes after filing except through an amendment. A refusal quotes the firm rule.

**Documents stay replaceable.** Source documents are rendered from the packet's printed text, and highlights come from re-reading that text. Each extracted value also keeps its recorded position, so a real scan can be attached to a page and the same values are drawn on it.
