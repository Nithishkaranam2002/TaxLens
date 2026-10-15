# Errors found, and how the design surfaced them

The engine adds correctly. TaxLens's independent recompute reproduces every numeric line of engine v1, v2 and v3, and all five engine what-ifs, to the dollar (check `CHK-RECOMPUTE`; 133 sum lines re-footed in `CHK-REFOOT`). What is wrong is what went **into** the engine: values misread from documents, documents counted twice, the client's memory used where a record exists, and a few rules applied to the wrong facts.

## The result

| | Engine as delivered | Corrected | Change |
|---|---:|---:|---:|
| Federal total tax | 81,962 | 71,710 | −10,252 |
| Federal payments | 77,742 | 76,742 | −1,000 |
| Federal penalty (Form 2210) | 164 | 181 | +17 |
| **Federal result** | **owes 4,220 + 164** | **refund 4,851** | |
| California total tax | 18,874 | 10,610 | −8,264 |
| California payments | 27,130 | 23,630 | −3,500 |
| **California result** | **refund 8,256** | **refund 13,020** | |

Effects below are each correction alone on the engine's return. Together they are not the sum, because corrections interact (brackets, AMT, phase-outs); the corrected column above is the whole return recomputed with all of them.

## Corrections (23)

| # | What was wrong | Evidence | How TaxLens surfaced it | Federal | California |
|---|---|---|---|---:|---:|
| 1 | Three RSU lots carried **zero basis**: Northlake left basis blank (noncovered) and the pipeline read the blanks as 0.00 with 0.98 confidence. 47,620 of wages taxed twice. | Corvane supplemental statement (D11); W-2 box 14 RSU 38,200 | Re-read of every value against its page, and a tie of RSU lots to the supplemental statement and the W-2 | −15,449 | −3,304 |
| 2 | **Form 1099-K counted twice.** The Paywell 12,400 is Atlas card payments already in the books. | QuickBooks deposit detail (D15), 1099-K (D21), Atlas 1099-NEC (D17) | Books rebuilt to Schedule C; receipts tied to every information return | −4,236 | −494 |
| 3 | **Self-employed health insurance** deducted although Erik could join Ngozi's employer plan. | Questionnaire qa-25; 2024 preparer reached the same conclusion | Rule check against the client's own answer and the prior year | +3,395 | +771 |
| 4 | **HVAC replacement expensed** as a repair. It replaced the whole building system; the small-taxpayer safe harbor does not apply. | Invoice (D47), owner statement (D46) | Rental rebuilt line by line; engine what-if `hvac_improvement` confirms the amount exactly | +3,633 | +896 |
| 5 | **Halvorsen wages sourced to California after the move.** Box 16 kept CA through 9/30 by mistake. | Paystub at 7/18 (D73): CA wages 22,469 through 7/15; qa-45 | California wages checked against the paystub and the residency dates | 0 | −5,736 |
| 6 | **Mileage log page counted twice.** Page 3 is a second scan of page 2 (same 22 trips; the page says so). 11,800 miles instead of 8,100. | Mileage scan (D23) | Trips compared page by page; page totals re-added | +889 | +108 |
| 7 | **Interest counted twice.** The Northlake Bank 1099-INT is the bank sweep inside the Northlake Securities composite. | D28, D29; 2024 return reported it once | Duplicate payer and amount across statements, cross-checked to the prior year | −649 | −105 |
| 8 | **Payoff interest counted twice.** The Lonestar 1098 already includes interest paid at payoff. | 1098 (D55), payoff statement (D56) | Mortgage interest rebuilt from every 1098 and statement | +559 | +132 |
| 9 | **Subaru donation at the client's estimate** (6,000). The charity sold it for 2,900. | Form 1098-C box 4c (D66), qa-39 | Charity rules applied to each receipt | +806 | +178 |
| 10 | **Seller's share of property tax deducted.** Escrow paid the full bill; the seller credited 6,912 at closing. | Buyer closing statement (D54), tax receipt (D58) | Property tax rebuilt by days of ownership | 0 (AMT) | +418 |
| 11 | **Fourth federal estimate at 4,000** from the client's memory. The IRS transcript shows 3,000. | IRS transcript (D69), qa-41 | Every payment agreed to the IRS record | balance +1,000; penalty +17 | |
| 12 | **A 2024 payment claimed for 2025.** The FTB applied the 9/15/2025 payment of 3,500 to 2024. | FTB account record, Web Pay confirmations (D68) | Every payment agreed to the FTB account by year applied | | balance +3,500 |
| 13 | **Crypto lot C6 at zero basis** and a short holding period: it was transferred in. Erik bought it on 3/15/2021 for about 3,050. | 1099-DA and CSV (D34, D35), Erik's message of 6/30 | Lot detail tied to the 1099-DA; transfer lots flagged | −1,309 | −246 |
| 14 | **Home office averaged across two homes** (1,200). The simplified method covers one home a year. | Client measurements (D24) | Rule check by home and by month | +168 | +17 |
| 15 | **Whole family phone plan** deducted; only Erik's line is business (70%). | Books (D15), call notes 3/26 | Books rebuilt to Schedule C, expense by expense | +593 | +82 |
| 16 | **Shared home internet** deducted in full; business use about 50%. | Books (D15), call notes 3/26 | Same | +251 | +21 |
| 17 | **Spotify Family** booked to software; personal. | Books (D15), call notes 3/26 | Same | +66 | +7 |
| 18 | **Swedish interest converted at last year's rate** (10.56). Credited once on 12/31/2025: 9.71 that day. | Sparbanken statement (D36), engine FX table | Rate checked against the date of receipt | +46 | +7 |
| 19 | **A sale never read:** page 32 of the corrected Meridian 1099 ("Additional transactions"). | D31 page 32 | Broker detail tied to the broker summary (250 short); pages with amounts but no extracted values listed | −18 | 0 |
| 20 | **Section 179 not elected** for the studio equipment. Same federal result; California allows 179 but not special depreciation. | Equipment invoice (D22); engine what-if `equipment_section179` | Every engine what-if rerun on our return | 0 | −1,050 |
| 21 | **Theo's SSN has two digits transposed** in the organizer. The packet scripts the IRS rejecting the e-file for it (R0000-504-02). | 2024 return (D06); later his card (D71) | Dependents compared with the prior-year return | data (avoids the rejection) | |
| 22 | **Little Sprouts' tax ID misread** (…516 for …156). | Provider statement (D62) | Re-read of every value against its page | data (Form 2441) | |
| 23 | **Wrong provider name** on Form 2441 ("Bright Oak Preschool"). | Provider statement (D61), 2024 return | Compared with the statement and the prior year | data (Form 2441) | |

## Raised for judgment, outside filings and the client

These do not change a number by themselves, but a reviewer must close each one. Each is a recorded judgment with its authority, a disposition, or an outside filing with an owner.

- **SEP contribution over the limit.** 18,000 deposited; deductible about 14,000 after the Schedule C corrections. Withdraw the excess before 10/15/2026 or carry it (judgment J-SEP-EXCESS, partner).
- **California AMT on the ISO exercise.** The engine does not compute it; the estimate shows none due (J-CA-AMT, partner).
- **St. Brigid gift (1,500).** The handwritten receipt has no goods-or-services statement, which a gift of 250 or more needs. Keep it only with a written acknowledgment (J-STBRIGID). The amendment in the end-to-end test removes it when the acknowledgment never comes.
- **Crypto lot method.** The export says FIFO but newer lots were sold; from 2025 lots must be identified at sale (J-CRYPTO-METHOD, client asked).
- **Form 3520 for 2023.** The Swedish account came from Erik's mother in 2023; the prior preparer left it open (J-3520, partner).
- **Forms 1099-NEC not filed** for two contractors paid by ACH; Schedule C line J answered No (J-1099NEC).
- **The 2023 Woodworks K-1** surfaced in June 2026; ask whether its income was on the 2023 return (J-2023-K1).
- **FBAR** for the Swedish account (client's, due 10/15/2026); **digital asset question** must be Yes despite the questionnaire's "we didn't really sell".
- **Six questionnaire answers** conflict with documents or agency records; each conflict is resolved by the stronger evidence (`CHK-QUESTIONNAIRE`).
- **Condo costs after the last tenant** (October HOA 410, make-ready 1,800) could be selling costs; under 700 of tax either way, left on Schedule E (J-CONDO-COSTS).
- **Prior preparer's 2024 home office** used 300 sq ft; the client measured 220 (immaterial, noted).

## How the design surfaced them

| Mechanism | What it catches here |
|---|---|
| **Re-read every extracted value against its printed page** (3,012 values) | RSU blank-as-zero basis, Little Sprouts' TIN, the ambiguous St. Brigid amount |
| **Tie detail to summaries** | Meridian 250 short → the unread page 32 sale; all 260 Brightpath lots tie to the cent |
| **Rebuild, don't trust** (books to Schedule C, rentals, mortgage interest, property tax, mileage pages) | 1099-K double count, phone, internet, Spotify, payoff interest, seller's tax share, duplicated mileage page, HVAC |
| **Agency records over memory** | The fourth federal estimate, the California payment applied to 2024 |
| **Prior year and client answers** | Theo's SSN, the provider name, SEHI eligibility, interest reported once in 2024 |
| **Rules applied to facts** | Vehicle donation limit, home office across two homes, foreign interest rate, California sourcing after the move |
| **Independent recompute** | Proves the engine's arithmetic; gives every correction its exact federal and California effect; reruns every what-if on the corrected return (section 179 election) |
| **Completeness** | 28 areas considered, outside filings with owners, prior preparer's open items |
| **Workflow** | Nothing applies until a reviewer approves; changes over 1,000 need the partner; sign-offs reopen when their area changes; the client's approval lapses if amounts change; the return freezes at filing |
