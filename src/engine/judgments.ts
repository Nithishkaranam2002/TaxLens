import type { AreaId } from './areas';
import type { Payload } from './events';

export interface JudgmentTopic {
  id: string;
  area: AreaId;
  topic: string;
  kind: Payload['judgment']['kind'];
  needsPartner: boolean;
  question: string;
  suggest: (n: (k: string) => number) => { decision: string; rationale: string; authority: string; refs: string[] };
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export const JUDGMENTS: JudgmentTopic[] = [
  {
    id: 'J-CA-AMT', area: 'california', topic: 'California AMT on the ISO exercise', kind: 'judgment', needsPartner: true,
    question: 'The engine does not compute California AMT. Is there any?',
    suggest: (n) => {
      const amti = n('F540NR.19') + 40000 + n('SchA.5b');
      const breakEven = amti - n('F540NR.31') / 0.07;
      return {
        decision: 'No California AMT is due. Attach Schedule P (540NR) completed by hand showing tentative minimum tax below the regular tax.',
        rationale: `Estimated California AMTI ${fmt(amti)} (taxable income + ISO spread 40,000 + property taxes not allowed for AMT). At 7%, tentative minimum tax exceeds the regular tax on total income (${fmt(n('F540NR.31'))}) only if the exemption were under ${fmt(breakEven)}; the California exemption for joint filers is several times that. The ISO spread is California-source (earned while working in San Francisco) but does not create AMT.`,
        authority: 'Cal. Rev. & Tax. Code §17062; Schedule P (540NR) instructions; FTB Pub. 1004 (equity compensation)',
        refs: ['D12', 'F6251.2i', 'F540NR.61'],
      };
    },
  },
  {
    id: 'J-SEP-EXCESS', area: 'business', topic: 'SEP contribution above the deductible limit', kind: 'judgment', needsPartner: true,
    question: 'What should happen to the part of the 18,000 SEP deposit that is not deductible?',
    suggest: (n) => ({
      decision: `Deduct ${fmt(n('Sch1.16'))}. Advise Erik in writing to withdraw the excess (${fmt(18000 - n('Sch1.16'))}) and its earnings from the SEP-IRA before 10/15/2026.`,
      rationale: `The limit is 20% of net profit less half of SE tax. After the Schedule C corrections it is ${fmt(n('Sch1.16'))}. A timely corrective withdrawal avoids the excise tax on excess contributions; leaving it in means carrying a nondeductible amount forward.`,
      authority: 'IRC §404(h); §408(d)(4) (timely corrective distribution); §4973',
      refs: ['D26', 'qa-26', 'Sch1.16'],
    }),
  },
  {
    id: 'J-STBRIGID', area: 'deductions', topic: 'St. Brigid gift without a full acknowledgment', kind: 'position', needsPartner: false,
    question: 'Can the 1,500 parish gift be deducted with a handwritten receipt that has no goods-or-services statement?',
    suggest: () => ({
      decision: 'Keep the 1,500 deduction only with a written acknowledgment from St. Brigid, dated before the return is filed, stating that no goods or services were provided. Without it, remove the gift before filing.',
      rationale: 'Bank statement (check #2207, 12/21/2025) and the parish phone confirmation support 1,500. A gift of 250 or more needs a contemporaneous written acknowledgment with the goods-or-services statement, obtained by the filing date.',
      authority: 'IRC §170(f)(8)',
      refs: ['D64', 'msg-08', 'ev-1049'],
    }),
  },
  {
    id: 'J-CRYPTO-METHOD', area: 'investments', topic: 'Crypto lot identification', kind: 'judgment', needsPartner: false,
    question: 'The export claims FIFO but used newer lots. Report as shown, or recompute?',
    suggest: () => ({
      decision: 'Report the lots as identified on the 1099-DA and CSV once Erik confirms he gave Coinhaven standing lot instructions before the sales. If he did not, recompute under FIFO with his holdings detail.',
      rationale: 'From 2025, lots held at a broker must be identified by the time of sale (standing orders allowed) or FIFO applies within the account.',
      authority: 'Treas. Reg. §1.1012-1(j); Rev. Proc. 2024-28',
      refs: ['D35', 'qa-15'],
    }),
  },
  {
    id: 'J-WASH', area: 'investments', topic: 'Losses followed by repurchases', kind: 'judgment', needsPartner: false,
    question: 'Should any wash sale be added beyond what the brokers reported?',
    suggest: () => ({
      decision: 'No change. Brokers report wash sales for covered lots in the same account; no repurchases were found across accounts or in IRAs.',
      rationale: 'The screen\'s hits are within single accounts where the broker matched at the lot level. No security appears in more than one account.',
      authority: 'IRC §1091; Form 1099-B box 1g (wash sale loss disallowed)',
      refs: ['D31', 'D74'],
    }),
  },
  {
    id: 'J-CONDO-COSTS', area: 'rentals', topic: 'Condo costs after the last tenant', kind: 'judgment', needsPartner: false,
    question: 'Are October HOA dues and make-ready repairs rental expenses or selling costs?',
    suggest: () => ({
      decision: 'No change. Leave October HOA (410) and make-ready repairs (1,800) on Schedule E.',
      rationale: 'Treating them as selling costs would move 2,210 from an ordinary passive deduction to a reduction of the sale gain. The difference in tax is small, and the repairs were done in the gap between the lease ending (9/30) and the listing (10/1).',
      authority: 'IRC §212; IRC §1001 (selling costs reduce the amount realized); materiality',
      refs: ['D50', 'D51'],
    }),
  },
  {
    id: 'J-3520', area: 'retirement', topic: 'Form 3520 for the 2023 inheritance', kind: 'position', needsPartner: true,
    question: 'The prior preparer flagged a 2023 foreign bequest over 100,000 with no resolution. What do we do?',
    suggest: () => ({
      decision: 'Recommend a late Form 3520 for 2023 with a reasonable-cause statement, under a separate engagement. Raise it with the clients in writing now.',
      rationale: 'The Sparbanken account (about 1.2–1.45 million SEK) was inherited from Erik\'s mother in 2023. A bequest from a foreign person over 100,000 is reported on Form 3520; the penalty for not filing can be up to 25% of the bequest. It is outside this engagement and does not change the 2025 return.',
      authority: 'IRC §6039F; Form 3520 instructions (Part IV)',
      refs: ['D07', 'D36', 'qa-07'],
    }),
  },
  {
    id: 'J-1099NEC', area: 'business', topic: 'Forms 1099-NEC not filed', kind: 'position', needsPartner: false,
    question: 'How do we answer Schedule C line J, and what do we tell the client?',
    suggest: () => ({
      decision: 'Answer line J "No". Advise Erik in writing to file the two late Forms 1099-NEC now (outside this engagement).',
      rationale: 'Two contractors were paid 600 or more by ACH; the forms were due 2/2/2026. Filing late limits the penalty.',
      authority: 'IRC §6041A; §6721; Schedule C instructions, lines I and J',
      refs: ['D27', 'qa-22', 'qa-23'],
    }),
  },
  {
    id: 'J-2023-K1', area: 'passthroughs', topic: 'Was the 2023 Woodworks K-1 reported?', kind: 'position', needsPartner: false,
    question: 'The prior preparer never had the 2023 K-1. Was its 14,100 of income on the 2023 return?',
    suggest: () => ({
      decision: 'Ask the client and Delta River whether the 2023 return included the Woodworks K-1. If not, recommend an amended 2023 return (separate engagement).',
      rationale: 'The 2023 K-1 surfaced in June 2026 among Erik\'s mother\'s papers; the 2024 workpaper says it was never provided.',
      authority: 'IRC §1366; §6501 (assessment period)',
      refs: ['D40', 'D07'],
    }),
  },
  {
    id: 'J-PENALTY', area: 'payments', topic: 'Underpayment penalty', kind: 'penalty', needsPartner: true,
    question: 'Accept the Form 2210 penalty, or is there a better method or a waiver?',
    suggest: (n) => ({
      decision: `Accept the regular-method penalty (${fmt(n('F1040.38'))}). No waiver applies.`,
      rationale: 'The required payment is 110% of 2024 tax (41,313) because 2024 AGI was over 150,000. The annualized method gives no lower installment in any period (engine what-if). No casualty, disaster or retirement waiver applies.',
      authority: 'IRC §6654; Form 2210 instructions; engine what-if penalty_annualized',
      refs: ['F2210.8', 'F2210.AI'],
    }),
  },
  {
    id: 'J-DEDUCTION', area: 'deductions', topic: 'Itemize or take the standard deduction', kind: 'election', needsPartner: false,
    question: 'Which deduction is better this year?',
    suggest: (n) => ({
      decision: `Itemize (${fmt(n('F1040.12'))}).`,
      rationale: 'Mortgage interest and points on the new home, state and local taxes and charitable gifts exceed the 31,500 standard deduction. The engine\'s what-if shows the standard deduction would raise federal tax by 12,306.',
      authority: 'IRC §63(e); engine what-if standard_deduction',
      refs: ['SchA.17'],
    }),
  },
  {
    id: 'J-DISCLOSURE', area: 'totals', topic: 'Positions and disclosure', kind: 'position', needsPartner: true,
    question: 'Does any position on the return need disclosure (Form 8275)?',
    suggest: () => ({
      decision: 'No disclosure needed. Every position has substantial authority; judgment calls are recorded with their authority in this workpaper.',
      rationale: 'The corrections move the return toward the documents. Remaining judgment areas (home office method, phone share, crypto lot method) follow the rules as applied to the client\'s facts.',
      authority: 'IRC §6662(d)(2)(B); §6694',
      refs: [],
    }),
  },
];

export const DUE_DILIGENCE_QUESTIONS: { id: string; q: string; suggested: string }[] = [
  { id: 'dd-1', q: 'Did you interview the taxpayer, ask adequate questions and record the answers?', suggested: 'Yes. Organizer answers (qa-04, qa-05) and the 3/26 call; follow-up questions recorded in this workpaper.' },
  { id: 'dd-2', q: 'Did any information appear incorrect, inconsistent or incomplete, and did you resolve it?', suggested: 'Yes. Theo\'s SSN in the organizer differed from the 2024 return; corrected to the number on the 2024 return and confirmed with his Social Security card.' },
  { id: 'dd-3', q: 'Theo: relationship, age and residency', suggested: 'Son, born 2/9/2017 (age 8), lived with the taxpayers all 12 months. Qualifies for the child tax credit.' },
  { id: 'dd-4', q: 'Ada: relationship, age, student status and residency', suggested: 'Daughter, born 5/21/2006 (age 19), full-time student at UC Davis (Form 1098-T box 8), away at school (temporary absence). Credit for other dependents.' },
  { id: 'dd-5', q: 'Can anyone else claim either child? Does Ada claim herself?', suggested: 'No. Ada files her own return and checked "someone can claim you as a dependent".' },
  { id: 'dd-6', q: 'American opportunity credit: eligibility and amount', suggested: 'Ada is eligible (second year, at least half-time; qualified expenses 6,800 after the restricted scholarship), but the credit is fully phased out at this AGI. No credit claimed.' },
  { id: 'dd-7', q: 'Documents kept for the knowledge and record-retention requirements', suggested: 'Form 1098-T (D59), scholarship letter (D60), 2024 return (D06), Social Security card (D71) once received; retained 7 years after filing.' },
];

export const STEP_IDS = [
  'Engagement letter and consents signed',
  'Identity verified',
  'Prior-year return reviewed',
  'All documents accounted for',
  'Prior-year variances explained',
  'Carryovers agreed to prior year',
  'Estimated payments agreed to IRS and FTB records',
  'Due diligence completed',
  'Diagnostics resolved',
  'Reviewer sign-off',
  'Partner sign-off',
  'Client approval and e-file authorization',
] as const;
