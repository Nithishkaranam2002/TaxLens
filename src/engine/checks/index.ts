import type { PacketIndex } from '../../data/index';
import type { FixDef } from '../fixes';
import { computeReturn } from '../recompute';
import { checkCaPayments, checkFederalPayments, checkIdentity } from './agency';
import { checkCaSource, checkCaWages } from './california';
import { checkAreasConsidered, checkOutsideFilings } from './completeness';
import { checkCarryovers, checkPriorOpenItems, checkQuestionnaire } from './crossyear';
import { checkCorrected1099, checkDuplicateInterest, checkDuplicateMileage, checkDuplicateW2 } from './duplicates';
import { checkRecompute, checkRefoot } from './engine';
import {
  check4797, checkBooksToTax, checkBrokerTieout, checkContractors, checkDepreciation, checkEspp, checkIso, checkPartnership,
  checkPassive, checkRentalA, checkRentalB, checkRsuBasis, checkScheduleCReceipts, checkScorpBasis, checkWages,
} from './reconcile';
import { checkReread, checkUnreadPages } from './reread';
import {
  checkCharity, checkCryptoBasis, checkCryptoMethod, checkDepCare, checkDependents, checkElections, checkForeign, checkHomeOffice,
  checkHsa, checkInterestFx, checkIraBasis, checkMortgage, checkPropertyTax, checkQbi, checkSaltCap, checkSehi, checkSep, checkWashSales,
} from './rules';
import type { CheckCtx, CheckResult } from './types';

export * from './types';

const ALL = [
  checkReread, checkUnreadPages,
  checkDuplicateW2, checkDuplicateMileage, checkDuplicateInterest, checkCorrected1099,
  checkBrokerTieout, checkRsuBasis, checkEspp, checkIso, checkWages, checkScheduleCReceipts, checkBooksToTax, checkContractors,
  checkRentalA, checkRentalB, checkDepreciation, check4797, checkPassive, checkScorpBasis, checkPartnership,
  checkInterestFx, checkForeign, checkIraBasis, checkHsa, checkSehi, checkSep, checkHomeOffice, checkQbi, checkMortgage, checkPropertyTax,
  checkCharity, checkSaltCap, checkDepCare, checkDependents, checkCryptoBasis, checkCryptoMethod, checkWashSales, checkElections,
  checkFederalPayments, checkCaPayments, checkIdentity,
  checkCaWages, checkCaSource,
  checkCarryovers, checkPriorOpenItems, checkQuestionnaire,
  checkRefoot, checkRecompute,
  checkOutsideFilings, checkAreasConsidered,
];

/** Run every independent check against the packet as it stood at `asOf`. */
export function runChecks(ix: PacketIndex, asOf: string, fixes: FixDef[]): CheckResult[] {
  const version = ix.versionAsOf(asOf);
  const base = version ? computeReturn(ix.packet, version) : null;
  const fixMap = new Map(fixes.map((f) => [f.id, f]));
  const x: CheckCtx = {
    ix, asOf, version, base, fixes: fixMap,
    has: (d) => ix.received(d, asOf),
    line: (k) => { const v = base?.values.get(k); return typeof v === 'number' ? v : 0; },
    lineText: (k) => base?.labels.get(k) ?? '',
  };
  const out: CheckResult[] = [];
  for (const fn of ALL) {
    try {
      const r = fn(x);
      if (r) out.push({ ...r, fixes: r.fixes.filter((f) => fixMap.has(f) && fixMap.get(f)!.requiresDocs.every((d) => x.has(d))) });
    } catch (e) {
      out.push({ id: `CHK-ERROR-${fn.name}`, group: 'Engine', area: 'totals', title: `Check ${fn.name} could not run`, question: '', method: '', status: 'review', summary: String(e), tables: [], refs: [], fixes: [] });
    }
  }
  return out;
}
