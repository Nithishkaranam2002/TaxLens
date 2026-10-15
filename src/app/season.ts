// The recorded season: what the firm did on this return from March 9 to June 30, 2026, played
// through the same actions and rules as the app. Every step is checked by the firm's rules at the
// moment it happens; a step the rules refuse stops the build (the tests prove none is refused).
// Facts come only from the packet: client answers quote the client's own messages, and every
// correction, judgment and disposition is the one the checks propose.

import type { PacketIndex } from '../data/index';
import type { AreaId } from '../engine/areas';
import type { CheckResult } from '../engine/checks';
import { type AnyEvent, type Level, type Payload, newId } from '../engine/events';
import type { FixDef } from '../engine/fixes';
import { JUDGMENTS } from '../engine/judgments';
import type { Actor } from '../engine/people';
import { type Workpaper, buildWorkpaper } from '../engine/workpaper';
import {
  type ActCtx, type Result, addNote, answerClient, approveJudgment, askClient, assign, decide, dispose, explainVariance, logTime, markStep,
  proposeFix, recordJudgment, reply, resolveNote, reveal, signOff, verify,
} from './actions';

export interface SeasonInput { ix: PacketIndex; fixes: FixDef[]; actors: Actor[]; checks: (asOf: string) => CheckResult[] }

const P = 'st-01'; // Priya Raman, preparer
const D = 'st-02'; // Daniel Ortiz, reviewer
const H = 'st-03'; // Helen Strand, partner
const M = 'st-04'; // Marcus Bell, preparer (joins 3/24, no sensitive-data clearance)
const J = 'st-05'; // Jo Kimura, firm administrator
const ERIK = 'cu-02';


export function buildSeason(inp: SeasonInput): AnyEvent[] {
  const { ix, actors } = inp;
  const fixMap = new Map(inp.fixes.map((f) => [f.id, f]));
  const events: AnyEvent[] = [];
  let cache: { key: string; wp: Workpaper } | null = null;
  const wpAt = (at: string): Workpaper => {
    const key = `${at}|${events.length}`;
    if (cache?.key === key) return cache.wp;
    const wp = buildWorkpaper({ ix, fixes: inp.fixes, actors, events, asOf: at, checks: inp.checks(at), noProjection: true });
    cache = { key, wp };
    return wp;
  };
  const T = (md: string, hm: string) => `2026-${md}T${hm}:00Z`;
  /** Run one action through the rules. Steps that only record (time, notes, verifications) reuse the last workpaper. */
  const act = (at: string, actor: string, fn: (x: ActCtx) => Result, what: string, fresh = true): Result & { ok: true } => {
    const me = actors.find((a) => a.id === actor)!;
    const wp = fresh || !cache ? wpAt(at) : cache.wp;
    const r = fn({ ix, fixes: fixMap, actors, wp, me, now: at });
    if (!r.ok) throw new Error(`Season step refused (${what}, ${actor} at ${at}): ${r.rule}`);
    events.push(...r.events);
    return r;
  };
  const idOf = (r: Result & { ok: true }) => (r.events[0].payload as { id: string }).id;

  // ---- helpers that keep the script short
  const propose = (at: string, who: string, fixId: string, option?: string, reason?: string) => {
    const f = fixMap.get(fixId)!;
    return idOf(act(at, who, (x) => proposeFix(x, fixId, option ?? f.options[f.recommended].id, reason), `propose ${fixId}`));
  };
  const proposalOf = (at: string, fixId: string) => wpAt(at).proposals.find((p) => p.fix?.id === fixId && p.status === 'proposed')!;
  const approve = (at: string, who: string, fixId: string, note = '') => act(at, who, (x) => decide(x, proposalOf(at, fixId).id, 'approve', note), `approve ${fixId}`);
  const time = (at: string, who: string, area: AreaId, min: number, note: string) => act(at, who, (x) => logTime(x, area, min, note), 'time', false);
  const disp = (at: string, who: string, checkId: string, how: Payload['finding.dispose']['disposition'], reason: string) => act(at, who, (x) => dispose(x, checkId, how, reason), `dispose ${checkId}`);
  const judge = (at: string, who: string, id: string) => {
    const t = JUDGMENTS.find((j) => j.id === id)!;
    const ours = wpAt(at).ours!;
    const s = t.suggest((k) => { const v = ours.values.get(k); return typeof v === 'number' ? v : 0; });
    return act(at, who, (x) => recordJudgment(x, id, s), `judgment ${id}`);
  };
  const preparerOf = (area: AreaId) => (area === 'investments' ? M : P);
  /** Sign an area at a level, re-signing lower levels first if a change reopened them. */
  const sign = (at: string, area: AreaId, level: Level) => {
    const order: Level[] = ['preparer', 'reviewer', 'partner'];
    for (const l of order.slice(0, order.indexOf(level) + 1)) {
      if (wpAt(at).areas.find((a) => a.id === area)!.signoffs[l].state === 'signed') continue;
      const who = l === 'preparer' ? preparerOf(area) : l === 'reviewer' ? D : H;
      act(at, who, (x) => signOff(x, area, l), `sign ${area} as ${l}`);
    }
  };
  const verifyLines = (at: string, who: string, keys: string[], method: Payload['verify']['method'], note: string, evidence: string[] = []) => {
    const batch = newId('b_');
    for (const k of keys) act(at, who, (x) => verify(x, k, method, note, evidence, batch), `verify ${k}`, false);
  };

  // ---------------------------------------------------------------- March 9: work starts
  events.push({ id: newId(), at: T('03-09', '14:00'), real: new Date().toISOString(), actor: J, type: 'workspace.load', payload: { what: 'season', note: 'Recorded season, March 9 to June 30, 2026' } } as AnyEvent);
  time(T('03-09', '15:05'), P, 'intake', 50, 'Engagement letter, consents, organizer and the 2024 file');
  act(T('03-09', '15:20'), P, (x) => markStep(x, 'Identity verified', 'Driver licenses (D04, D05) and the IP PIN notice (D03) agree to the organizer.'), 'step', false);
  act(T('03-09', '15:25'), P, (x) => markStep(x, 'Prior-year return reviewed', '2024 return (D06) and Delta River\'s memo and open items (D07) read; open items carried into this file.'), 'step', false);
  act(T('03-09', '15:40'), P, (x) => reveal(x, 'household:theo', 'ssn', 'Compare the organizer with the 2024 return'), 'reveal', false);
  propose(T('03-09', '15:45'), P, 'FIX-THEO-SSN', undefined, 'The organizer has Theo\'s SSN with two digits transposed; the 2024 return (D06), accepted by the IRS, has the other order. Card requested from the client.');
  act(T('03-09', '15:50'), P, (x) => askClient(x, { target: 'household:theo', area: 'intake', text: 'Theo\'s Social Security number in the organizer differs from your 2024 return in two digits. Could you upload a photo of his Social Security card so we can confirm it?', due: '2026-03-20' }), 'ask', false);
  disp(T('03-09', '16:10'), P, 'CHK-PRIOR-OPEN-ITEMS', 'reviewed', 'Closed where this year\'s documents allow. The 2023 Woodworks K-1 is requested from the client; Form 3520 for 2023 goes to the partner as a judgment call (J-3520).');
  disp(T('03-09', '16:15'), P, 'CHK-QUESTIONNAIRE', 'reviewed', 'Each conflict goes to the stronger evidence: documents and agency records over recollection. Corrections are proposed where they change the return.');
  verifyLines(T('03-09', '16:30'), P, ['F1040.1a', 'F1040.25a'], 'agreed_to_source_document', 'W-2 boxes 1 and 2: Corvane (D08) plus Halvorsen (D09); the phone photo (D10) is the same form.', ['D08', 'D09']);
  time(T('03-09', '16:40'), P, 'wages', 45, 'W-2s, stock plan statement, Forms 3921 and 3922');

  // ---------------------------------------------------------------- March 10–13: preparation
  propose(T('03-10', '14:10'), P, 'FIX-RSU-BASIS');
  propose(T('03-10', '14:30'), P, 'FIX-MILEAGE');
  propose(T('03-10', '14:50'), P, 'FIX-1099K');
  propose(T('03-10', '15:20'), P, 'FIX-SEHI');
  propose(T('03-10', '15:40'), P, 'FIX-HVAC');
  time(T('03-10', '16:00'), P, 'business', 70, 'Books to Schedule C, 1099 tie-out, mileage log');
  time(T('03-10', '16:20'), P, 'rentals', 65, 'Owner statement, HVAC invoice, condo sale and Form 4797');
  disp(T('03-10', '16:40'), P, 'CHK-RENTAL-B', 'reviewed', 'October HOA and make-ready repairs stay on Schedule E (judgment J-CONDO-COSTS). Sale gain agrees to Form 1099-S.');
  judge(T('03-10', '16:45'), P, 'J-CONDO-COSTS');
  disp(T('03-10', '16:50'), P, 'CHK-CONTRACTORS', 'reviewed', 'Two contractors paid by ACH need Forms 1099-NEC (due 2/2/2026). Schedule C line J answered No; the client is told in writing (J-1099NEC).');
  judge(T('03-10', '16:55'), P, 'J-1099NEC');

  propose(T('03-11', '14:05'), P, 'FIX-MORTGAGE');
  propose(T('03-11', '14:20'), P, 'FIX-PROPTAX');
  propose(T('03-11', '14:35'), P, 'FIX-VEHICLE');
  propose(T('03-11', '14:50'), P, 'FIX-2441-TIN');
  propose(T('03-11', '14:52'), P, 'FIX-2441-NAME');
  judge(T('03-11', '15:10'), P, 'J-DEDUCTION');
  time(T('03-11', '15:30'), P, 'deductions', 75, 'Home purchase and refinance, property taxes, charity, child care');
  propose(T('03-11', '16:00'), P, 'FIX-INT-DUP');
  act(T('03-11', '16:15'), P, (x) => reveal(x, 'D36', 'account_number', 'Form 8938 account details'), 'reveal', false);
  propose(T('03-11', '16:20'), P, 'FIX-FX', 'spot');
  disp(T('03-11', '16:40'), P, 'CHK-FOREIGN', 'reviewed', 'Form 8938 is on the return. FBAR is the client\'s, outside this engagement. Form 3520 for 2023 raised with the partner (J-3520).');
  disp(T('03-11', '16:45'), P, 'CHK-OUTSIDE-FILINGS', 'reviewed', 'Each outside filing has an owner. Items outside the engagement go to the client in writing with the return.');
  time(T('03-11', '17:00'), P, 'retirement', 45, 'Form 8606, HSA, Sparbanken and Form 8938');

  propose(T('03-12', '16:40'), P, 'FIX-EST-Q4');
  propose(T('03-12', '16:55'), P, 'FIX-CA-PAYMENT');
  verifyLines(T('03-12', '17:10'), P, ['F1040.26'], 'agreed_to_third_party_record', 'IRS account transcript: four TC 670 payments of 3,000 (D69).', ['D69']);
  time(T('03-12', '17:20'), P, 'payments', 30, 'Estimates against the IRS transcript and the FTB account');
  disp(T('03-12', '17:30'), P, 'CHK-SCORP-BASIS', 'deferred', 'The 2023 Woodworks K-1 is not in the file (nor was it in the prior preparer\'s). Requested from the client; basis carried as the prior preparer did until it arrives.');
  const qK1 = idOf(act(T('03-12', '17:35'), P, (x) => askClient(x, { target: 'D39', area: 'passthroughs', text: 'Do you have the 2023 Schedule K-1 from Lindqvist Family Woodworks? We need it to carry Erik\'s basis forward.', due: '2026-04-03' }), 'ask', false));
  disp(T('03-12', '17:45'), P, 'CHK-CA-SOURCE', 'reviewed', 'Column E recomputes from the source rules for every line. California AMT on the ISO exercise is outside the engine and goes to the partner (J-CA-AMT).');

  act(T('03-13', '14:30'), P, (x) => askClient(x, { target: 'D35', area: 'investments', text: 'Before selling crypto on Coinhaven in 2025, had you told Coinhaven which lots to sell (for example a standing instruction such as highest cost first)?', due: null }), 'ask', false);
  judge(T('03-13', '15:00'), P, 'J-3520');
  time(T('03-13', '15:30'), P, 'investments', 60, '1099-B tie-out, RSU basis, crypto');
  time(T('03-13', '16:00'), P, 'intake', 25, 'Dependents and the questionnaire');

  // ---------------------------------------------------------------- March 16–17: first review
  act(T('03-16', '14:10'), D, (x) => reveal(x, 'household:theo', 'ssn', 'Review the SSN correction'), 'reveal', false);
  approve(T('03-16', '14:15'), D, 'FIX-THEO-SSN', 'Agrees to the 2024 return (D06). Keep the card on file when it comes.');
  for (const [m, f] of [['14:20', 'FIX-MILEAGE'], ['14:25', 'FIX-INT-DUP'], ['14:30', 'FIX-FX'], ['14:35', 'FIX-MORTGAGE'], ['14:37', 'FIX-PROPTAX'], ['14:39', 'FIX-VEHICLE'], ['14:41', 'FIX-2441-TIN'], ['14:43', 'FIX-2441-NAME'], ['14:50', 'FIX-EST-Q4']] as const) approve(T('03-16', m), D, f);
  for (const [m, f] of [['15:00', 'FIX-RSU-BASIS'], ['15:05', 'FIX-1099K'], ['15:08', 'FIX-SEHI'], ['15:11', 'FIX-HVAC'], ['15:14', 'FIX-CA-PAYMENT']] as const) approve(T('03-16', m), D, f, 'Agree; over 1,000, so to Helen.');
  verifyLines(T('03-16', '15:30'), D, ['F1040.25d', 'SchB.4', 'SchB.6'], 'recalculated', 'Re-added.');
  const n1 = idOf(act(T('03-16', '15:40'), D, (x) => addNote(x, { kind: 'review', target: 'SchC.25', area: 'business', text: 'The books deduct the whole family phone plan. Which line is Erik\'s, and how much of it is business use?', blocking: true, assignee: P }), 'note'));
  time(T('03-16', '16:00'), D, 'business', 35, 'Review: Schedule C and SE');
  time(T('03-16', '16:20'), D, 'deductions', 30, 'Review: Schedule A, credits');

  for (const [m, f, note] of [['15:00', 'FIX-RSU-BASIS', 'The supplemental statement governs; zero basis was a read error.'], ['15:05', 'FIX-1099K', 'Atlas card payments are in the books once.'], ['15:10', 'FIX-SEHI', 'Eligible for Ngozi\'s employer plan (qa-25): no deduction.'], ['15:15', 'FIX-HVAC', 'Whole system replaced: an improvement, not a repair.'], ['15:20', 'FIX-CA-PAYMENT', 'The FTB applied it to 2024; request a transfer.']] as const) approve(T('03-17', m), H, f, note);
  act(T('03-17', '15:30'), H, (x) => approveJudgment(x, 'J-3520', 'Raise it with the clients in writing this week.'), 'approve J-3520');
  time(T('03-17', '15:40'), H, 'totals', 20, 'Partner review of the large changes');

  // ---------------------------------------------------------------- March 24–27: Marcus joins; the client call
  act(T('03-24', '15:05'), J, (x) => assign(x, 'investments', 'preparer', M), 'assign');
  time(T('03-24', '15:30'), M, 'investments', 95, 'Corrected Meridian 1099 and tie-out by box');
  propose(T('03-24', '16:00'), M, 'FIX-M18');
  judge(T('03-24', '16:10'), M, 'J-WASH');
  disp(T('03-24', '16:15'), M, 'CHK-WASH-SALES', 'reviewed', 'No repurchases across accounts or in the IRAs; only broker-reported wash sales (J-WASH).');
  judge(T('03-24', '16:20'), M, 'J-CRYPTO-METHOD');
  disp(T('03-24', '16:25'), M, 'CHK-CRYPTO-METHOD', 'reviewed', 'Report the lots as identified while we wait for Erik on standing instructions (J-CRYPTO-METHOD).');
  verifyLines(T('03-24', '16:40'), M, ['SchB.1.1', 'SchB.1.3', 'SchB.5.1'], 'agreed_to_source_document', 'Agreed to the 1099s.', ['D28', 'D32']);
  approve(T('03-25', '14:00'), D, 'FIX-M18');
  time(T('03-25', '14:30'), M, 'investments', 75, 'Lot detail, crypto CSV, wash-sale screen');

  propose(T('03-26', '17:45'), P, 'FIX-SPOTIFY', undefined, 'Personal family subscription booked to software by mistake (call with Erik, 3/26).');
  const phone = propose(T('03-26', '17:50'), P, 'FIX-PHONE', 'line', 'Erik\'s own line is one of four on the family plan; he uses it 70% for the studio (call with Erik, 3/26).');
  propose(T('03-26', '17:55'), P, 'FIX-INTERNET', undefined, 'Home internet is shared with the family; business use about 50% (call with Erik, 3/26).');
  act(T('03-26', '18:00'), P, (x) => reply(x, n1, `Erik's own line is one of four; he puts his business use at 70%. Proposed 70% of his line (change ${wpAt(T('03-26', '18:00')).proposals.find((p) => p.id === phone)?.seq}).`), 'reply');
  time(T('03-26', '18:10'), P, 'business', 45, 'Client call follow-up');

  propose(T('03-27', '16:45'), P, 'FIX-CA-WAGES');
  for (const a of ['intake', 'wages', 'rentals', 'deductions', 'payments', 'retirement', 'passthroughs', 'california'] as AreaId[]) sign(T('03-27', '17:00'), a, 'preparer');
  time(T('03-27', '17:30'), P, 'california', 50, 'Part-year allocation and the paystub');

  // ---------------------------------------------------------------- March 30 – April 2: review
  approve(T('03-30', '14:00'), D, 'FIX-SPOTIFY');
  approve(T('03-30', '14:02'), D, 'FIX-PHONE', 'Agreed: 70% of Erik\'s line.');
  approve(T('03-30', '14:04'), D, 'FIX-INTERNET');
  act(T('03-30', '14:10'), D, (x) => resolveNote(x, n1, 'Agreed with 70% of his line.'), 'resolve N1');
  approve(T('03-30', '14:20'), D, 'FIX-CA-WAGES', 'Agree; over 1,000, so to Helen.');
  for (const a of ['intake', 'wages', 'rentals', 'deductions', 'payments', 'retirement', 'passthroughs'] as AreaId[]) sign(T('03-30', '15:00'), a, 'reviewer');
  act(T('03-30', '15:30'), D, (x) => addNote(x, { kind: 'review', target: 'SchC.30', area: 'business', text: 'Home office: the 2025 measurements (D24) are 220 sq ft in Sacramento and 260 sq ft in Austin, not the 300 carried from 2024, and the office moved in July. Please recompute before I sign Schedule C.', blocking: true, assignee: P }), 'note');
  time(T('03-30', '16:00'), D, 'wages', 40, 'Review: wages, RSU and ESPP');
  time(T('03-30', '16:30'), D, 'rentals', 35, 'Review: Schedule E and the condo sale');

  approve(T('03-31', '15:00'), H, 'FIX-CA-WAGES', 'The paystub governs: California wages through July 15.');
  time(T('03-31', '15:10'), H, 'totals', 15, 'Partner review');

  {
    const at = T('04-01', '14:00');
    const batch = newId('b_');
    for (const v of wpAt(at).variances.filter((x) => x.flagged && !x.explanation)) act(at, P, (x) => explainVariance(x, v.key, v.suggestion, batch), `variance ${v.key}`, false);
  }
  sign(T('04-01', '14:30'), 'california', 'preparer');
  sign(T('04-01', '14:35'), 'totals', 'preparer');
  time(T('04-01', '15:00'), P, 'totals', 35, 'Tax computation and variances');
  sign(T('04-02', '15:00'), 'california', 'reviewer');
  sign(T('04-02', '15:05'), 'totals', 'reviewer');
  verifyLines(T('04-02', '15:20'), D, ['F1040.24', 'F540NR.64'], 'recalculated', 'Independent recompute agrees line for line (CHK-RECOMPUTE).');
  time(T('04-02', '15:40'), D, 'california', 30, 'Review: Schedule CA and 540NR');
  time(T('04-08', '15:00'), D, 'totals', 25, 'Review complete');

  // ---------------------------------------------------------------- June: late documents and engine v3
  act(T('06-05', '00:45'), ERIK, (x) => answerClient(x, qK1, 'Found the 2023 Woodworks K-1 in my mom\'s papers - photo attached (D40).', ['2023 Woodworks K-1 (D40)']), 'client answer');
  act(T('06-08', '14:00'), P, (x) => verify(x, `question:${qK1}`, 'confirmed_with_client', 'Client answer accepted: the 2023 K-1 is D40.', ['D40']), 'verify answer');
  judge(T('06-08', '14:10'), P, 'J-2023-K1');
  act(T('06-08', '14:15'), P, (x) => askClient(x, { target: 'D40', area: 'passthroughs', text: 'Was the 2023 Woodworks K-1 income (14,100) included on your 2023 return? Delta River\'s file says they never received the K-1.', due: '2026-07-10' }), 'ask', false);

  time(T('06-24', '14:00'), P, 'passthroughs', 70, 'Ridgeline K-1 and the 2023 K-1 basis roll-forward');
  sign(T('06-24', '14:30'), 'passthroughs', 'preparer');
  sign(T('06-24', '14:35'), 'retirement', 'preparer');
  disp(T('06-24', '15:00'), P, 'CHK-SEP', 'reviewed', 'The 18,000 SEP deposit exceeds the deductible limit. Deduction limited; the excess is to be withdrawn (J-SEP-EXCESS).');
  judge(T('06-24', '15:05'), P, 'J-SEP-EXCESS');
  judge(T('06-24', '15:30'), P, 'J-CA-AMT');
  time(T('06-24', '16:00'), P, 'california', 30, 'Ridgeline California share after v3');
  sign(T('06-25', '15:00'), 'passthroughs', 'reviewer');
  sign(T('06-25', '15:05'), 'retirement', 'reviewer');
  time(T('06-25', '15:30'), D, 'passthroughs', 30, 'Review: K-1s and basis');
  act(T('06-26', '15:00'), H, (x) => approveJudgment(x, 'J-SEP-EXCESS', 'Agree. Letter to Erik this week.'), 'approve J-SEP-EXCESS');
  for (const a of ['rentals', 'deductions', 'payments'] as AreaId[]) sign(T('06-29', '14:00'), a, 'reviewer');

  // June 30: Erik answers about the crypto lot; the last corrections go up for review.
  propose(T('06-30', '18:30'), P, 'FIX-C6', undefined, 'Erik bought this BTC on another exchange in March 2021 for about 3,050 and moved it to Coinhaven (his message of 6/30).');
  const n2 = [...wpAt(T('06-30', '18:40')).state.notes.values()].find((n) => n.target === 'SchC.30' && n.status === 'open')!;
  const ho = propose(T('06-30', '18:45'), P, 'FIX-HOMEOFFICE', 'austin');
  act(T('06-30', '18:50'), P, (x) => reply(x, n2.id, `Recomputed with the 2025 measurements: simplified method for the Austin office, 6 months × 260 sq ft. Proposed as change ${wpAt(T('06-30', '18:50')).proposals.find((p) => p.id === ho)?.seq}. Sacramento actual expenses can be added if Erik sends the rent and utilities.`), 'reply');
  propose(T('06-30', '18:55'), P, 'FIX-ELECT-179');
  sign(T('06-30', '19:10'), 'business', 'preparer');
  sign(T('06-30', '19:20'), 'investments', 'preparer');
  time(T('06-30', '19:30'), P, 'business', 40, 'Home office, election, sign-off');
  time(T('06-30', '19:40'), M, 'investments', 45, 'Crypto basis from Erik\'s message; sign-off');

  return events;
}
