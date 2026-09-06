import assert from 'node:assert/strict';
import test from 'node:test';

import { COMMUNITY_SPEND_REPORT_MINIMUM, parsePesoToMinor, spendPerPersonMinor, validateVisitReport } from '../src/services/community-utils.ts';

const visit = { placeId: 'place', rating: 5, totalSpendMinor: 180000, partySize: 4, visitType: 'dine_in' as const, visitDate: '2026-09-03', shortNote: null };
test('community validation accepts rating plus valid spend and derives minor-unit spend per person', () => { assert.equal(validateVisitReport(visit), null); assert.equal(spendPerPersonMinor(180000, 4), 45000); assert.equal(parsePesoToMinor('1,800.50'), 180050); });
test('community validation rejects invalid rating, negative spend, party size, and future dates', () => { assert.match(validateVisitReport({ ...visit, rating: 6 }) ?? '', /rating/); assert.match(validateVisitReport({ ...visit, totalSpendMinor: -1 }) ?? '', /non-negative/); assert.match(validateVisitReport({ ...visit, partySize: 0 }) ?? '', /number of people/); assert.match(validateVisitReport({ ...visit, visitDate: '2999-01-01' }) ?? '', /future/); });
test('community threshold stays locked at five reports', () => { assert.equal(COMMUNITY_SPEND_REPORT_MINIMUM, 5); assert.equal(4 >= COMMUNITY_SPEND_REPORT_MINIMUM, false); assert.equal(5 >= COMMUNITY_SPEND_REPORT_MINIMUM, true); });
