// Run with: node tests/engine.test.js
'use strict';
var assert = require('assert');
var K = require('../src/engine.js');
var lists = { sanctions: K.SAMPLE_SANCTIONS, peps: K.SAMPLE_PEPS, highRiskCountries: K.HIGH_RISK_THIRD_COUNTRIES };
var passed = 0;
function test(name, fn) { fn(); passed++; console.log('ok  ' + name); }
function base(extra) {
  return Object.assign({ name: 'Mary Murphy', customerType: 'individual', country: 'IE', dob: '1985-05-05', sector: 'employee',
    idVerified: true, idExpiry: '2030-01-01', monthlyVolume: 3000, sourceOfFunds: 'Salary', pepDeclared: false, adverseMedia: false,
    ubos: [], createdAt: '2026-11-08T10:00:00Z' }, extra || {});
}

test('clean Irish individual is Low risk and can be approved', function () {
  var c = base(), hits = K.screenCase(c, lists), a = K.assess(c, hits, lists);
  assert.strictEqual(hits.length, 0);
  assert.strictEqual(a.tier, 'Low');
  assert.strictEqual(K.recommend(a).code, 'STANDARD');
  assert.strictEqual(K.validateDecision('approve', a, { rationale: 'Verified low risk customer with salary income.' }), null);
});

test('name variant with same DOB is a strong sanctions match and blocks approval', function () {
  var c = base({ name: 'Marko Belandi Ferrante', dob: '1968-03-14' });
  var hits = K.screenCase(c, lists), a = K.assess(c, hits, lists);
  assert.strictEqual(hits[0].level, 'strong');
  assert.strictEqual(K.recommend(a).code, 'BLOCK');
  assert.ok(K.validateDecision('approve', a, { rationale: 'Trying to approve a sanctioned person.' }));
});

test('same name with a different DOB is only a potential match', function () {
  var c = base({ name: 'Marco Bellandi Ferrante', dob: '1990-01-01' });
  var hits = K.screenCase(c, lists);
  assert.strictEqual(hits[0].level, 'potential');
  assert.strictEqual(hits[0].dobConflict, true);
});

test('company names ignore legal suffixes', function () {
  var hits = K.screenName('Kestrel Maritime Holdings Limited', '', lists.sanctions, 'Sanctions');
  assert.strictEqual(hits[0].entryId, 'S-003');
  assert.strictEqual(hits[0].level, 'strong');
});

test('common names do not produce false hits', function () {
  ['Mary Murphy', 'Joao Silva', 'Sean O Brien', 'Patrick Walsh'].forEach(function (n) {
    assert.strictEqual(K.screenCase(base({ name: n, dob: '' }), lists).length, 0, n);
  });
});

test('screening hits must be reviewed before approval', function () {
  var c = base({ name: 'Anna Grimes', dob: '1995-12-01' });
  var hits = K.screenCase(c, lists), a = K.assess(c, hits, lists);
  assert.ok(hits.length > 0);
  assert.strictEqual(K.recommend(a).code, 'REVIEW_HITS');
  hits.forEach(function (h) { h.review = { outcome: 'false_positive', note: 'Different person' }; });
  a = K.assess(c, hits, lists);
  assert.strictEqual(K.recommend(a).code, 'STANDARD');
});

test('declared PEP forces High risk and needs EDD plus senior approval (s.37)', function () {
  var c = base({ pepDeclared: true }), a = K.assess(c, [], lists);
  assert.strictEqual(a.tier, 'High');
  assert.ok(a.mandatoryEDD.length === 1);
  assert.ok(K.validateDecision('approve', a, { rationale: 'Approving a PEP without EDD.' }));
  assert.strictEqual(K.validateDecision('approve', a, { rationale: 'EDD done and documented in full.', eddCompleted: true }), null);
});

function user(id) { return K.DEMO_USERS.filter(function (u) { return u.id === id; })[0]; }
function caseOf(extra, createdById) { var c = base(extra); c.assessment = K.assess(c, [], lists); c.status = 'Pending review'; c.createdById = createdById || 'u-analyst'; return c; }

test('IAM: auditor is read only', function () {
  assert.ok(K.authorize('create_case', user('u-audit')));
  assert.ok(K.authorize('approve', user('u-audit'), caseOf()));
});

test('IAM: trainee without delegated authority cannot approve, can escalate', function () {
  var c = caseOf({}, 'u-trainee');
  assert.ok(K.authorize('approve', user('u-trainee'), c));
  assert.strictEqual(K.authorize('escalate', user('u-trainee'), c), null);
  assert.strictEqual(K.authorize('approve', user('u-analyst'), c), null);
});

test('IAM: High risk approval is above analyst authority', function () {
  var c = caseOf({ pepDeclared: true });
  assert.ok(K.authorize('approve', user('u-analyst'), c));
  assert.strictEqual(K.authorize('approve', user('u-senior'), c), null);
});

test('IAM: four eyes, a senior cannot approve a PEP case they prepared', function () {
  var c = caseOf({ pepDeclared: true }, 'u-senior');
  assert.ok(/Four eyes/.test(K.authorize('approve', user('u-senior'), c)));
  assert.strictEqual(K.authorize('approve', user('u-mlro'), c), null);
});

test('IAM: only the MLRO decides escalated cases and manages watchlists', function () {
  var c = caseOf(); c.status = 'Escalated';
  assert.ok(K.authorize('reject', user('u-senior'), c));
  assert.strictEqual(K.authorize('reject', user('u-mlro'), c), null);
  assert.ok(K.authorize('manage_lists', user('u-senior')));
  assert.strictEqual(K.authorize('manage_lists', user('u-mlro')), null);
});

test('IAM: analysts cannot confirm a sanctions true match', function () {
  var hit = { listType: 'Sanctions' };
  assert.ok(K.authorize('review_hit', user('u-analyst'), null, { hit: hit, outcome: 'true_match' }));
  assert.strictEqual(K.authorize('review_hit', user('u-analyst'), null, { hit: hit, outcome: 'false_positive' }), null);
  assert.strictEqual(K.authorize('review_hit', user('u-senior'), null, { hit: hit, outcome: 'true_match' }), null);
});

test('high risk third country forces EDD (s.38A)', function () {
  var a = K.assess(base({ country: 'IR' }), [], lists);
  assert.strictEqual(a.tier, 'High');
  assert.ok(a.score >= 40);
});

test('company without beneficial owner has incomplete CDD (s.33)', function () {
  var c = base({ name: 'Test Holdings Ltd', customerType: 'company', ubos: [] }), a = K.assess(c, [], lists);
  assert.strictEqual(a.cddComplete, false);
  assert.strictEqual(K.recommend(a).code, 'CDD_INCOMPLETE');
  assert.ok(K.validateDecision('approve', a, { rationale: 'Approve without ownership information.' }));
});

test('expired ID makes CDD incomplete', function () {
  var a = K.assess(base({ idExpiry: '2020-01-01' }), [], lists);
  assert.strictEqual(a.cddComplete, false);
});

test('score accumulates and reaches High at 50 points', function () {
  var c = base({ customerType: 'company', name: 'Spin Ltd', sector: 'gambling', monthlyVolume: 300000, adverseMedia: true, ubos: [{ name: 'Owner One', dob: '1980-01-01' }] });
  var a = K.assess(c, [], lists);
  assert.strictEqual(a.score, 10 + 15 + 20 + 20);
  assert.strictEqual(a.tier, 'High');
});

test('rationale is mandatory', function () {
  var a = K.assess(base(), [], lists);
  assert.ok(K.validateDecision('approve', a, { rationale: 'ok' }));
});

test('CSV import groups aliases by ID and detects EU columns', function () {
  var csv = 'Entity_LogicalId;NameAlias_WholeName;BirthDate_BirthDate;Entity_SubjectType\n' +
    '101;Ivan Testov;1970-01-01;person\n101;I. Testov;;person\n202;Example Trading LLC;;enterprise\n';
  var e = K.parseSanctionsCSV(csv);
  assert.strictEqual(e.length, 2);
  assert.strictEqual(e[0].id, 'EU-101');
  assert.deepStrictEqual(e[0].aliases, ['I. Testov']);
  assert.strictEqual(e[0].dob, '1970-01-01');
});

test('metrics compute rates', function () {
  var cases = [
    { status: 'Approved', assessment: { tier: 'Low', eddRequired: false, cddComplete: true }, hits: [{ listType: 'Sanctions', review: { outcome: 'false_positive' } }], audit: [], createdAt: '2026-01-01T00:00:00Z', decidedAt: '2026-01-01T10:00:00Z' },
    { status: 'Escalated', assessment: { tier: 'High', eddRequired: true, cddComplete: true }, hits: [{ listType: 'PEP', review: { outcome: 'true_match' } }], audit: [{ type: 'escalate' }], createdAt: '2026-01-01T00:00:00Z' }
  ];
  var m = K.metrics(cases);
  assert.strictEqual(m.falsePositiveRate, 50);
  assert.strictEqual(m.eddRate, 50);
  assert.strictEqual(m.escalationRate, 50);
  assert.strictEqual(m.avgHoursToDecision, 10);
});

// --- Ongoing CDD: periodic and event driven reviews -------------------------
var NOW = '2026-11-08T10:00:00Z';
function approved(nextReview, extra) { return Object.assign({ id: 'KYC-1001', status: 'Approved', nextReview: nextReview, assessment: { tier: 'Low' }, audit: [] }, extra || {}); }

test('review state: overdue, due soon and scheduled', function () {
  assert.strictEqual(K.reviewState(approved('2026-10-01T00:00:00Z'), NOW).state, 'Overdue');
  assert.strictEqual(K.reviewState(approved('2026-11-20T00:00:00Z'), NOW).state, 'Due soon');
  assert.strictEqual(K.reviewState(approved('2027-06-01T00:00:00Z'), NOW).state, 'Scheduled');
  assert.strictEqual(K.reviewState(approved('2027-06-01T00:00:00Z', { openReview: { startedAt: '2026-11-06T10:00:00Z' } }), NOW).state, 'In progress');
  assert.strictEqual(K.reviewState({ status: 'Rejected' }, NOW), null);
});

test('an ID that expired after onboarding makes CDD incomplete at review (s.33)', function () {
  var c = base({ idExpiry: '2026-09-30', createdAt: '2026-01-10T10:00:00Z' });
  assert.strictEqual(K.assess(c, [], lists).cddComplete, true);
  c.reviewAsOf = '2026-11-08T10:00:00Z';
  var a = K.assess(c, [], lists);
  assert.strictEqual(a.cddComplete, false);
  assert.strictEqual(K.recommend(a).code, 'CDD_INCOMPLETE');
});

test('IAM: the auditor cannot start a review, an analyst can', function () {
  assert.ok(K.authorize('start_review', K.DEMO_USERS[4]));
  assert.strictEqual(K.authorize('start_review', K.DEMO_USERS[0]), null);
});

// --- Exceptions register -----------------------------------------------------
function exc(extra) { return Object.assign({ type: 'doc_renewal', description: 'Passport expired, renewal appointment booked.', mitigation: 'Outgoing payments capped at EUR 1,000.', expiresOn: '2026-12-08' }, extra || {}); }

test('exceptions need a description, a mitigation and at most 90 days', function () {
  assert.strictEqual(K.validateException(exc(), NOW), null);
  assert.ok(K.validateException(exc({ mitigation: '' }), NOW));
  assert.ok(K.validateException(exc({ expiresOn: '2027-03-01' }), NOW), 'more than 90 days must be refused');
  assert.ok(K.validateException(exc({ expiresOn: '2026-11-01' }), NOW), 'a past date must be refused');
});

test('IAM: exceptions are approved by a senior, never by the person who raised them', function () {
  var x = exc({ raisedById: 'u-senior' });
  assert.ok(K.authorize('decide_exception', K.DEMO_USERS[1], null, { exception: x }), 'analyst cannot approve');
  assert.ok(K.authorize('decide_exception', K.DEMO_USERS[2], null, { exception: x }), 'four eyes');
  assert.strictEqual(K.authorize('decide_exception', K.DEMO_USERS[3], null, { exception: x }), null);
});

test('an approved exception past its date is overdue', function () {
  assert.strictEqual(K.exceptionState(exc({ status: 'Approved', expiresOn: '2026-11-01' }), NOW), 'Overdue');
  assert.strictEqual(K.exceptionState(exc({ status: 'Closed', expiresOn: '2026-11-01' }), NOW), 'Closed');
});

// --- Quality assurance -------------------------------------------------------
test('QA sample includes every High risk decision and 1 in 4 of the rest', function () {
  assert.strictEqual(K.qaSelected({ id: 'KYC-1001', status: 'Approved', assessment: { tier: 'High' } }), true);
  assert.strictEqual(K.qaSelected({ id: 'KYC-1004', status: 'Approved', assessment: { tier: 'Low' } }), true);
  assert.strictEqual(K.qaSelected({ id: 'KYC-1005', status: 'Approved', assessment: { tier: 'Low' } }), false);
  assert.strictEqual(K.qaSelected({ id: 'KYC-1008', status: 'Pending review', assessment: { tier: 'High' } }), false);
});

test('IAM: QA is independent from the decision maker', function () {
  assert.ok(K.authorize('qa_review', K.DEMO_USERS[1], null, {}), 'analysts do not QA');
  assert.ok(K.authorize('qa_review', K.DEMO_USERS[2], null, { deciderId: 'u-senior' }), 'cannot QA own decision');
  assert.strictEqual(K.authorize('qa_review', K.DEMO_USERS[2], null, { deciderId: 'u-analyst' }), null);
});

test('QA: every check answered, a failure needs a note and fails the case', function () {
  var all = { id: 'pass', screening: 'pass', risk: 'pass', edd: 'na', authority: 'pass', rationale: 'pass' };
  assert.strictEqual(K.validateQA(all, '', { assessment: { tier: 'Low' } }), null);
  assert.ok(K.validateQA(all, '', { assessment: { tier: 'High' } }), 'EDD cannot be N/A on High risk');
  var bad = Object.assign({}, all, { id: 'fail' });
  assert.ok(K.validateQA(bad, 'short', { assessment: { tier: 'Low' } }));
  assert.deepStrictEqual(K.scoreQA(bad), { outcome: 'Fail', failed: ['id'] });
});

test('operational metrics: reviews, exceptions, QA by analyst and SLA', function () {
  var cases = [
    approved('2026-10-01T00:00:00Z', { audit: [{ type: 'approve', userId: 'u-analyst', by: 'A. Huttener (Analyst)' }], qa: { outcome: 'Fail', failed: ['id'] } }),
    approved('2026-11-20T00:00:00Z', { id: 'KYC-1004', audit: [{ type: 'approve', userId: 'u-analyst', by: 'A. Huttener (Analyst)' }], qa: { outcome: 'Pass', failed: [] } }),
    { id: 'KYC-1010', status: 'Pending review', createdAt: '2026-11-04T10:00:00Z', assessment: { tier: 'Low' }, audit: [] }
  ];
  var exceptions = [exc({ status: 'Approved', expiresOn: '2026-11-01' }), exc({ status: 'Pending approval' }), exc({ status: 'Closed' })];
  var m = K.opsMetrics(cases, exceptions, NOW);
  assert.strictEqual(m.reviewsOverdue, 1);
  assert.strictEqual(m.reviewsDueSoon, 1);
  assert.strictEqual(m.exceptionsOpen, 2);
  assert.strictEqual(m.exceptionsOverdue, 1);
  assert.strictEqual(m.qaPassRate, 50);
  assert.strictEqual(m.qaErrors.id, 1);
  assert.strictEqual(m.byAnalyst[0].decisions, 2);
  assert.strictEqual(m.byAnalyst[0].qaPassRate, 50);
  assert.strictEqual(m.slaBreaches, 1);
  assert.strictEqual(m.ageing['3 to 5 days'], 1);
});

test('IAM: four eyes also applies to whoever carried out a review', function () {
  var c = { status: 'Pending review', createdById: 'u-analyst', openReview: { startedById: 'u-senior' }, assessment: { tier: 'High', mandatoryEDD: ['PEP'], sanctionsBlocked: false } };
  assert.ok(K.authorize('approve', K.DEMO_USERS[2], c), 'the senior who did the review cannot approve it');
  assert.strictEqual(K.authorize('approve', K.DEMO_USERS[3], c), null, 'another senior person can');
});

test('a review becomes overdue as soon as its date has passed', function () {
  assert.strictEqual(K.reviewState(approved('2026-11-08T04:00:00Z'), NOW).state, 'Overdue');
});

test('impossible dates are refused for exceptions', function () {
  assert.ok(K.validateException(exc({ expiresOn: '2026-11-31' }), NOW));
});

test('QA results moved to the history still count in the metrics', function () {
  var c = approved('2027-06-01T00:00:00Z', { audit: [], qa: null, qaHistory: [{ outcome: 'Fail', failed: ['risk'], deciderId: 'u-analyst', decidedBy: 'A. Huttener (Analyst)' }] });
  var m = K.opsMetrics([c], [], NOW);
  assert.strictEqual(m.qaDone, 1);
  assert.strictEqual(m.qaErrors.risk, 1);
  assert.strictEqual(m.byAnalyst[0].qaPassRate, 0);
});

// --- Business verification -------------------------------------------------
test('company registration not verified makes CDD incomplete; older cases are unaffected', function () {
  var co = base({ name: 'Loja Exemplo, Lda', customerType: 'company', country: 'PT', ubos: [{ name: 'Ana Costa', dob: '1980-01-01', pct: '100' }] });
  assert.strictEqual(K.assess(co, [], lists).cddComplete, true, 'no registry field captured');
  co.registryVerified = false;
  assert.strictEqual(K.assess(co, [], lists).cddComplete, false);
  co.registryVerified = true;
  assert.strictEqual(K.assess(co, [], lists).cddComplete, true);
});

console.log('\n' + passed + ' tests passed');
