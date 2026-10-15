// Self-contained documents produced from the frozen record: the client's copy of the filed return
// and the response package for an IRS notice. Each is plain HTML with its own styles so it can be
// printed, saved as PDF or attached, and each carries a fingerprint of exactly what it contains.

import type { PacketIndex } from '../../data/index';
import type { EvidenceTable } from '../../engine/checks';
import { VERIFICATION_LABEL, canonical, hash53 } from '../../engine/events';
import type { Actor } from '../../engine/people';
import { maskSensitive, maskSsn } from '../../engine/people';
import type { Workpaper } from '../../engine/workpaper';
import { date, dateTime, money, value } from '../format';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const STYLE = `
  body{font:14px/1.5 "IBM Plex Sans",system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#141a16;max-width:820px;margin:32px auto;padding:0 24px}
  h1{font:600 22px/1.25 "IBM Plex Serif",Georgia,serif;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px;border-bottom:1px solid #cdd2c8;padding-bottom:4px}
  h3{font-size:14px;margin:18px 0 6px}.muted{color:#5f6763}.small{font-size:12px}.mono{font-family:"IBM Plex Mono",ui-monospace,monospace}
  table{border-collapse:collapse;width:100%;margin:6px 0 12px;font-size:13px}th,td{border-bottom:1px solid #e0e3dc;padding:5px 8px;text-align:left;vertical-align:top}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#5f6763;background:#f7f8f5}.r{text-align:right;font-variant-numeric:tabular-nums}
  .box{border:1px solid #cdd2c8;border-radius:8px;padding:12px 14px;margin:10px 0}.big{font-size:26px;font-weight:600}
  pre{white-space:pre-wrap;background:#f7f8f5;border:1px solid #e0e3dc;border-radius:6px;padding:10px;font:12px/1.45 "IBM Plex Mono",ui-monospace,monospace}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ok{color:#217449}.foot{margin-top:32px;font-size:11.5px;color:#7d877f;border-top:1px solid #e0e3dc;padding-top:8px}
  @media print{body{margin:0}a{color:inherit}}
`;

const page = (title: string, body: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${STYLE}</style></head><body>${body}</body></html>`;

function evidenceTable(t: EvidenceTable): string {
  const cell = (c: EvidenceTable['rows'][number]['cells'][number], i: number) => {
    const v = c !== null && typeof c === 'object' ? c.v : c;
    const isMoney = t.money?.includes(i) || (c !== null && typeof c === 'object' && c.money);
    return `<td class="${isMoney ? 'r' : ''}">${v === null || v === undefined ? '—' : typeof v === 'number' ? (isMoney ? money(v, { cents: v % 1 !== 0 }) : v.toLocaleString('en-US')) : esc(v)}</td>`;
  };
  return `${t.title ? `<h3>${esc(t.title)}</h3>` : ''}<table><thead><tr>${t.columns.map((c, i) => `<th class="${t.money?.includes(i) ? 'r' : ''}">${esc(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.cells.map(cell).join('')}</tr>`).join('')}</tbody></table>`;
}

const lineRow = (vals: Record<string, number | string>, labels: Map<string, string>, k: string) =>
  vals[k] === undefined ? '' : `<tr><td>${esc(labels.get(k) ?? k)} <span class="muted small mono">${esc(k)}</span></td><td class="r">${esc(value(vals[k], k))}</td></tr>`;

/** The client's copy of the return as filed. */
export function clientCopyHtml(wp: Workpaper, ix: PacketIndex): string {
  const f = wp.state.frozen;
  const vals = f?.values ?? Object.fromEntries(wp.ours?.values ?? []);
  const labels = wp.ours?.labels ?? new Map();
  const p = ix.packet;
  const [a, b] = p.household.people;
  const deps = p.household.people.filter((x) => x.role === 'dependent');
  const ssn = (s: string) => maskSsn(s);
  const theo = wp.dataFixes.get('household:theo.ssn');
  const fed = ['F1040.1z', 'F1040.2b', 'F1040.3b', 'F1040.4b', 'F1040.7', 'F1040.8', 'F1040.9', 'F1040.10', 'F1040.11', 'F1040.12', 'F1040.13', 'F1040.15', 'F1040.16', 'F1040.19', 'F1040.20', 'F1040.23', 'F1040.24', 'F1040.25d', 'F1040.26', 'F1040.31', 'F1040.33', 'F1040.34', 'F1040.37', 'F1040.38'];
  const ca = ['F540NR.17', 'F540NR.19', 'F540NR.32', 'F540NR.36', 'F540NR.64', 'F540NR.71', 'F540NR.72', 'F540NR.78', 'F540NR.97'];
  const accepted = wp.state.results.filter((r) => r.status === 'accepted');
  const n = (k: string) => Number(vals[k] ?? 0);
  const fedBal = n('F1040.24') - n('F1040.33');
  const caBal = n('F540NR.64') - n('F540NR.78');
  const pen = n('F1040.38');
  const body = `
    <p class="muted small">${esc(p.firm.name)} · ${esc(p.firm.firm_identity.address)} · ${esc(p.firm.firm_identity.phone)}</p>
    <h1>Your 2025 tax returns as filed</h1>
    <p>${esc(a.name)} and ${esc(b.name)} · Married filing jointly · ${esc(p.household.addresses.find((x) => !x.to)?.address ?? '')}</p>
    <div class="grid">
      <div class="box"><div class="muted small">Federal (Form 1040)</div><div class="big ${fedBal < 0 ? 'ok' : ''}">${fedBal + pen < 0 ? `Refund ${money(-fedBal - pen)}` : `Paid ${money(fedBal + pen)}`}</div><div class="small muted">Total tax ${money(n('F1040.24'))} · payments ${money(n('F1040.33'))}${pen ? ` · estimated-tax penalty ${money(pen)}` : ''}</div></div>
      <div class="box"><div class="muted small">California (Form 540NR)</div><div class="big ${caBal < 0 ? 'ok' : ''}">${caBal < 0 ? `Refund ${money(-caBal)}` : `Paid ${money(caBal)}`}</div><div class="small muted">Total tax ${money(n('F540NR.64'))} · payments ${money(n('F540NR.78'))}</div></div>
    </div>
    <h2>Filing</h2>
    <table><tbody>
      <tr><td>Filed</td><td>${f ? esc(dateTime(f.at)) : 'Not yet filed (draft copy)'}</td></tr>
      ${accepted.map((r) => `<tr><td>${r.jurisdiction === 'federal' ? 'IRS' : 'California FTB'} acceptance</td><td class="mono">${esc(r.submissionId)} · ${esc(dateTime(r.at))}</td></tr>`).join('')}
      <tr><td>Approved and signed (Form 8879)</td><td>${wp.state.clientApproval ? esc(dateTime(wp.state.clientApproval.at)) : '—'}</td></tr>
      <tr><td>Dependents</td><td>${deps.map((d) => `${esc(d.name)} (${esc(ssn(d.id === 'theo' && theo ? theo : d.ssn))})`).join(', ')}</td></tr>
      <tr><td>Return fingerprint</td><td class="mono">${esc(f?.hash ?? wp.returnFingerprint)}</td></tr>
    </tbody></table>
    <h2>Federal summary</h2><table><thead><tr><th>Line</th><th class="r">Amount</th></tr></thead><tbody>${fed.map((k) => lineRow(vals, labels, k)).join('')}</tbody></table>
    <h2>California summary</h2><table><thead><tr><th>Line</th><th class="r">Amount</th></tr></thead><tbody>${ca.map((k) => lineRow(vals, labels, k)).join('')}</tbody></table>
    <h2>Keep with this copy</h2>
    <ul>
      <li>Records are kept by ${esc(p.firm.name)} for 7 years after filing.</li>
      <li>Minimum tax credit carried to 2026: ${money(wp.ours?.carryovers.minimum_tax_credit ?? 0)} (Form 8801).</li>
      <li>Items outside this engagement we told you about in writing: FBAR (FinCEN 114), late Forms 1099-NEC for your contractors, Form 3520 for 2023, and the SEP excess contribution.</li>
    </ul>
    <p class="foot">Prepared by ${esc(p.firm.name)}. Identification numbers are shown masked. Fingerprint ${esc(f?.hash ?? wp.returnFingerprint)} identifies the exact return filed.</p>`;
  return page('Your 2025 returns as filed', body);
}

/** The response package for an examination letter, built only from the frozen record. */
export function noticePackageHtml(wp: Workpaper, ix: PacketIndex, actors: Actor[], noticeId: string): { html: string; hash: string; items: string[] } {
  const p = ix.packet;
  const notice = p.tax_agency_records.notices.find((x) => x.id === noticeId)!;
  const f = wp.state.frozen;
  const vals = f?.values ?? {};
  const labels = wp.ours?.labels ?? new Map();
  const name = (id: string) => actors.find((a) => a.id === id)?.name ?? id;
  const partner = actors.find((a) => a.id === p.firm.firm_identity.paid_preparer_signing_returns);
  const [a, b] = p.household.people;
  const check = (id: string) => wp.checks.find((c) => c.id === id);
  const pages = (docs: string[]) => docs.map((d) => {
    const doc = ix.docs.get(d)!;
    return `<h3>${esc(d)} · ${esc(doc.title)}</h3><p class="small muted">${esc(doc.issuer)} · received ${esc(date(doc.received_at))} · ${esc(doc.file_name)}</p>${doc.pages.map((pg) => `<pre>${esc(maskSensitive(pg.printed_content))}</pre>`).join('')}`;
  }).join('');
  const trail = (fixIds: string[]) => {
    const rows = wp.proposals.filter((x) => x.fix && fixIds.includes(x.fix.id)).map((x) => {
      const appr = x.decisions.filter((d) => d.decision === 'approve').map((d) => `${name(d.by)} ${date(d.at)}`).join('; ');
      return `<tr><td>${esc(x.title)}</td><td>${x.changes.map((c) => `${esc(c.label)}: ${esc(typeof c.from === 'number' ? money(c.from) : c.from)} → ${esc(typeof c.to === 'number' ? money(c.to) : c.to)}`).join('<br>')}</td><td>${esc(name(x.by))} ${esc(date(x.at))}</td><td>${esc(appr)}</td><td>${esc(x.authority)}</td></tr>`;
    }).join('');
    return rows ? `<table><thead><tr><th>Change before filing</th><th>From → to</th><th>Proposed</th><th>Approved</th><th>Authority</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="muted">No changes to these lines before filing.</p>';
  };
  const verifs = (keys: string[]) => {
    const rows = wp.state.verifications.filter((v) => keys.includes(v.target));
    return rows.length ? `<ul>${rows.map((v) => `<li>${esc(labels.get(v.target) ?? v.target)}: ${esc(VERIFICATION_LABEL[v.method] ?? v.method)} by ${esc(name(v.by))}, ${esc(date(v.at))}${v.note ? ` — ${esc(v.note)}` : ''}</li>`).join('')}</ul>` : '';
  };
  const items: string[] = [];
  const sections: string[] = [];
  for (const [i, item] of (notice.items_under_examination ?? []).entries()) {
    items.push(item);
    if (/noncash|charitable/i.test(item)) {
      const keys = ['SchA.12', 'F8283.A1.stock', 'F8283.A1.vehicle'];
      sections.push(`<h2>Item ${i + 1}. Noncash charitable contributions</h2>
        <p>${esc(item)}</p>
        <p>Schedule A line 12 as filed: <b>${money(Number(vals['SchA.12'] ?? 0))}</b>, made up of two gifts reported on Form 8283:</p>
        <table><thead><tr><th>Gift</th><th>Donee and acknowledgment</th><th class="r">Deducted</th></tr></thead><tbody>
          <tr><td>200 shares of Northlake Total Market Index Fund, held since 04/2019: fair market value on the date of transfer (12/05/2025)</td><td>Austin Community Foundation (donor-advised fund) · written acknowledgment (D65) stating no goods or services were provided</td><td class="r">${money(Number(vals['F8283.A1.stock'] ?? 0))}</td></tr>
          <tr><td>2012 Subaru Outback</td><td>Lone Star Kids Auto Donation · Form 1098-C (D66). The charity sold the car without significant use, so the deduction is limited to the gross proceeds in box 4c.</td><td class="r">${money(Number(vals['F8283.A1.vehicle'] ?? 0))}</td></tr>
        </tbody></table>
        <p class="small">The client's organizer estimated the car at about 6,000 (Kelley Blue Book). The return was corrected before filing to the 1098-C proceeds:</p>
        ${trail(['FIX-VEHICLE'])}
        ${verifs(keys)}
        ${check('CHK-CHARITY') ? check('CHK-CHARITY')!.tables.filter((t) => t.rows.length).map(evidenceTable).join('') : ''}
        ${pages(['D65', 'D66'])}`);
    } else if (/gross receipts|Schedule C/i.test(item)) {
      const c = check('CHK-SCHC-RECEIPTS');
      sections.push(`<h2>Item ${i + 1}. Schedule C gross receipts</h2>
        <p>${esc(item)}</p>
        <p>Schedule C line 1 as filed: <b>${money(Number(vals['SchC.1'] ?? 0))}</b>. ${esc(c?.summary ?? '')}</p>
        ${c ? c.tables.filter((t) => t.rows.length).map(evidenceTable).join('') : ''}
        ${trail(['FIX-1099K'])}
        ${verifs(['SchC.1'])}
        ${pages(['D16', 'D17', 'D18', 'D19', 'D20', 'D21'])}`);
    } else {
      sections.push(`<h2>Item ${i + 1}</h2><p>${esc(item)}</p>`);
    }
  }
  const core = `
    <p class="muted small">${esc(p.firm.name)} · ${esc(p.firm.firm_identity.address)} · ${esc(p.firm.firm_identity.phone)}</p>
    <h1>Response to ${esc(notice.type)}</h1>
    <p>Tax year ${notice.tax_year} · ${esc(a.name)} and ${esc(b.name)} (married filing jointly) · letter dated ${esc(date(notice.dated))} · response due ${esc(date(notice.response_due))}</p>
    <div class="box">This package answers each item under examination using the return exactly as filed (fingerprint <span class="mono">${esc(f?.hash ?? '—')}</span>, accepted ${esc(f ? date(f.at) : '—')}) and the documents relied on when it was prepared. Each figure is traced to its source document; changes made before filing are listed with who made and approved them and the authority relied on.</div>
    ${sections.join('')}
    <h2>Representative</h2>
    <p>${esc(partner?.name ?? '')}${partner?.credential ? `, ${esc(partner.credential)}` : ''} · ${esc(p.firm.name)}. A Form 2848 accompanies this response.</p>`;
  const hash = hash53(canonical({ notice: noticeId, frozen: f?.hash ?? '', core }));
  const html = page(`Response to ${notice.type} (${notice.tax_year})`, `${core}<p class="foot">Package fingerprint ${esc(hash)} · built from the frozen 2025 workpaper. Identification numbers are omitted.</p>`);
  return { html, hash, items };
}
