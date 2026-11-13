/*
 * KYC Onboarding and Screening Simulator: user interface
 * Author: Adriano Huttener
 */
(function () {
  'use strict';
  var K = window.KYC;
  var STORE_KEY = 'kyc-sim-v1';
  var STATUSES = ['Pending review', 'Info requested', 'Escalated', 'Approved', 'Rejected'];
  var DECISION_STATUS = { approve: 'Approved', reject: 'Rejected', escalate: 'Escalated', request_info: 'Info requested' };
  var DECISION_LABEL = { approve: 'Approve', reject: 'Reject', escalate: 'Escalate to MLRO', request_info: 'Request information' };

  var state = load();
  var currentCaseId = null;

  // ---------------------------------------------------------------------------
  // Persistence (browser storage can be unavailable, so always fall back to memory)
  // ---------------------------------------------------------------------------
  function defaults() {
    return {
      cases: [], seq: 1000, users: K.DEMO_USERS.map(function (u) { return Object.assign({}, u); }), currentUserId: 'u-analyst', accessLog: [],
      exceptions: [], exSeq: 0,
      lists: { sanctions: K.SAMPLE_SANCTIONS.slice(), peps: K.SAMPLE_PEPS.slice(), highRiskCountries: K.HIGH_RISK_THIRD_COUNTRIES.slice(), sanctionsSource: 'Fictional sample list' }
    };
  }
  function load() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        // Data saved by an older version has no exceptions register yet.
        if (s && s.cases && s.lists && s.users) {
          s.exceptions = s.exceptions || []; s.exSeq = s.exSeq || 0;
          // Cases saved before red flags existed have none recorded.
          s.cases.forEach(function (c) { if (c.assessment && !c.assessment.redFlags) c.assessment.redFlags = []; });
          return s;
        }
      }
    } catch (e) { /* storage unavailable */ }
    return defaults();
  }
  function save() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $all(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmtDate(iso) { if (!iso) return ''; var d = new Date(iso); return d.toLocaleDateString('en-IE', { day: '2-digit', month: 'short', year: 'numeric' }); }
  function fmtTime(iso) { var d = new Date(iso); return d.toLocaleDateString('en-IE', { day: '2-digit', month: 'short' }) + ' ' + d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit' }); }
  function countryName(code) { var c = K.COUNTRIES.filter(function (x) { return x.code === code; })[0]; return c ? c.name : code; }
  function typeName(id) { var c = K.CUSTOMER_TYPES.filter(function (x) { return x.id === id; })[0]; return c ? c.name : id; }
  function tierBadge(t) { return '<span class="badge t-' + t + '">' + t + '</span>'; }
  function statusBadge(s) { return '<span class="badge s-' + s.split(' ')[0] + '">' + esc(s) + '</span>'; }
  function getCase(id) { return state.cases.filter(function (c) { return c.id === id; })[0]; }
  function me() { return state.users.filter(function (u) { return u.id === state.currentUserId; })[0]; }
  function userLabel(u) { return u ? u.name + ' (' + K.ROLES[u.role].name + ')' : 'Unknown'; }
  function addAudit(c, type, text, at) { c.audit.push({ at: at || new Date().toISOString(), by: userLabel(me()), userId: state.currentUserId, type: type, text: text }); }
  function logAccess(text, at) { state.accessLog.unshift({ at: at || new Date().toISOString(), user: userLabel(me()), text: text }); state.accessLog = state.accessLog.slice(0, 200); }
  function can(action, c, extra) { return K.authorize(action, me(), c, extra); }
  function now() { return new Date().toISOString(); }
  function nameOf(list, id) { var x = list.filter(function (i) { return i.id === id; })[0]; return x ? x.name : (id || ''); }
  function addDays(iso, days) { var d = new Date(iso); d.setDate(d.getDate() + days); return d.toISOString(); }
  var QA_SHORT = { id: 'ID and business', screening: 'Screening', risk: 'Risk rating', edd: 'EDD', authority: 'Authority', rationale: 'Rationale' };
  function reviewBadge(rs) { return rs ? '<span class="badge r-' + rs.state.split(' ')[0] + '">' + esc(rs.state) + '</span>' : ''; }
  function reviewWhen(rs) {
    if (!rs) return '';
    if (rs.state === 'In progress') return rs.days < 1 ? 'opened today' : 'open ' + rs.days + ' day' + (rs.days === 1 ? '' : 's');
    return rs.days < 0 ? Math.abs(rs.days) + ' days overdue' : 'in ' + rs.days + ' days';
  }
  function exBadge(st) { return '<span class="badge x-' + st.split(' ')[0] + '">' + esc(st) + '</span>'; }
  function qaBadge(o) { return '<span class="badge q-' + o + '">QA ' + esc(o) + '</span>'; }

  // ---------------------------------------------------------------------------
  // Case lifecycle
  // ---------------------------------------------------------------------------
  function createCase(input, at) {
    state.seq += 1;
    var c = Object.assign({}, input, {
      id: 'KYC-' + state.seq,
      createdAt: at || new Date().toISOString(),
      status: 'Pending review', audit: [], decidedAt: null, nextReview: null,
      createdById: state.currentUserId, createdBy: userLabel(me())
    });
    c.hits = K.screenCase(c, state.lists);
    c.assessment = K.assess(c, c.hits, state.lists);
    addAudit(c, 'create', 'Case created for ' + c.name + ' (' + typeName(c.customerType) + ', ' + countryName(c.country) + ').', c.createdAt);
    addAudit(c, 'screen', 'Screened customer' + ((c.ubos || []).length ? ' and ' + c.ubos.length + ' beneficial owner(s)' : '') + ' against ' + state.lists.sanctions.length + ' sanctions and ' + state.lists.peps.length + ' PEP entries: ' + c.hits.length + ' hit(s).', c.createdAt);
    addAudit(c, 'assess', 'Risk score ' + c.assessment.score + ', tier ' + c.assessment.tier + '. Recommendation: ' + K.recommend(c.assessment).text, c.createdAt);
    state.cases.unshift(c);
    return c;
  }

  function recompute(c) { c.assessment = K.assess(c, c.hits, state.lists); }

  function reviewHit(c, idx, outcome, note, at) {
    var h = c.hits[idx];
    h.review = { outcome: outcome, note: note, by: userLabel(me()), at: at || new Date().toISOString() };
    addAudit(c, 'hit', (outcome === 'true_match' ? 'Confirmed TRUE MATCH: ' : 'Cleared as FALSE POSITIVE: ') + h.listType + ' hit on ' + h.entryName + ' (' + h.score + ') for ' + h.subject + '. Note: ' + note, at);
    var before = c.assessment.tier;
    recompute(c);
    if (c.assessment.tier !== before) addAudit(c, 'assess', 'Risk tier changed from ' + before + ' to ' + c.assessment.tier + ' (score ' + c.assessment.score + ').', at);
  }

  // Red flag checkboxes grouped by typology. cls is the class used to read them back.
  function flagChecks(selected, cls) {
    var groups = [];
    K.RED_FLAGS.forEach(function (f) { if (groups.indexOf(f.group) === -1) groups.push(f.group); });
    return groups.map(function (g) {
      return '<div class="flag-group">' + esc(g) + '</div>' + K.RED_FLAGS.filter(function (f) { return f.group === g; }).map(function (f) {
        return '<label class="check"><input type="checkbox" class="' + cls + '" value="' + f.id + '"' + (selected.indexOf(f.id) !== -1 ? ' checked' : '') + '> ' + esc(f.name) + ' <span class="muted">+' + f.points + '</span></label>';
      }).join('');
    }).join('');
  }

  function recordRedFlags(c, ids, note, at) {
    var denied = can('record_red_flag', c); if (denied) return denied;
    if (c.status === 'Approved' || c.status === 'Rejected') return 'The case is closed. Start a review to record new red flags.';
    var before = (c.redFlags || []).slice().sort(), after = ids.slice().sort();
    if (before.join('|') === after.join('|')) return 'Nothing changed.';
    if (!note || note.trim().length < 10) return 'Describe what you saw (at least 10 characters).';
    var added = after.filter(function (i) { return before.indexOf(i) === -1; }), removed = before.filter(function (i) { return after.indexOf(i) === -1; });
    c.redFlags = after;
    var tierBefore = c.assessment.tier;
    recompute(c);
    addAudit(c, 'redflag', (added.length ? 'Red flag(s) recorded: ' + added.map(function (i) { return nameOf(K.RED_FLAGS, i); }).join('; ') + '. ' : '') +
      (removed.length ? 'Red flag(s) withdrawn: ' + removed.map(function (i) { return nameOf(K.RED_FLAGS, i); }).join('; ') + '. ' : '') +
      'Note: ' + sentence(note) + '. Risk score ' + c.assessment.score + ', tier ' + c.assessment.tier + (c.assessment.tier !== tierBefore ? ' (was ' + tierBefore + ')' : '') + '.', at);
    return null;
  }

  function decide(c, decision, opts, at) {
    var err = can(decision, c) || K.validateDecision(decision, c.assessment, opts);
    if (err) return err;
    at = at || new Date().toISOString();
    c.status = DECISION_STATUS[decision];
    var text = DECISION_LABEL[decision] + '. Rationale: ' + opts.rationale.trim();
    if (opts.eddCompleted) text += ' EDD completed.';
    if (decision === 'approve' && c.assessment.redFlags && c.assessment.redFlags.length) text += ' ' + c.assessment.redFlags.length + ' red flag(s) explained and evidenced.';
    if (decision === 'approve' && c.assessment.mandatoryEDD.length) text += ' Senior management approval given by ' + userLabel(me()) + ' (four eyes: case prepared by ' + (c.createdBy || 'another user') + ').';
    if (decision === 'approve' || decision === 'reject') {
      if (!c.decidedAt) c.decidedAt = at; // first decision: feeds the time to onboard metric
      c.decidedById = state.currentUserId;
      if (decision === 'approve') {
        var d = new Date(at); d.setMonth(d.getMonth() + c.assessment.reviewMonths);
        c.nextReview = d.toISOString();
        text += ' Next periodic review: ' + fmtDate(c.nextReview) + '.';
      } else {
        c.nextReview = null;
      }
      if (c.openReview) {
        c.reviews = (c.reviews || []).concat([Object.assign({}, c.openReview, { completedAt: at, by: userLabel(me()), outcome: decision === 'approve' ? 'Relationship continued' : 'Relationship exited' })]);
        text += decision === 'approve' ? ' Review completed: relationship continued.' : ' Review completed: relationship exited.';
        c.openReview = null;
      }
    }
    if (decision === 'escalate') text += ' Internal escalation only: customer not informed (s.49 tipping off).';
    addAudit(c, decision, text, at);
    return null;
  }

  function rescreen(c, at) {
    var old = c.hits || [];
    c.hits = K.screenCase(c, state.lists);
    c.hits.forEach(function (h) {
      var prev = old.filter(function (o) { return o.entryId === h.entryId && o.subject === h.subject && o.review; })[0];
      if (prev) h.review = prev.review;
    });
    recompute(c);
    addAudit(c, 'screen', 'Re-screened against current lists: ' + c.hits.length + ' hit(s). Risk score ' + c.assessment.score + ', tier ' + c.assessment.tier + '.' +
      (c.assessment.cddComplete ? '' : ' CDD incomplete: ' + c.assessment.cddIssues.join('; ') + '.'), at);
  }

  // ---------------------------------------------------------------------------
  // Ongoing CDD: periodic and event driven reviews
  // ---------------------------------------------------------------------------
  function startReview(c, trigger, note, at) {
    var denied = can('start_review', c); if (denied) return denied;
    if (c.status !== 'Approved') return 'Only an active (approved) relationship can be reviewed.';
    if (trigger !== 'periodic' && (!note || note.trim().length < 10)) return 'Describe what changed (at least 10 characters).';
    at = at || now();
    c.openReview = { trigger: trigger, note: (note || '').trim(), startedAt: at, startedBy: userLabel(me()), startedById: state.currentUserId };
    c.reviewAsOf = at;
    c.status = 'Pending review';
    if (c.qa) { c.qaHistory = (c.qaHistory || []).concat([c.qa]); c.qa = null; }
    addAudit(c, 'review', 'Started ' + (trigger === 'periodic' ? 'periodic review' : 'event driven review: ' + nameOf(K.REVIEW_TRIGGERS, trigger)) + (note ? '. ' + sentence(note) : '') + '. Documents are checked against the review date.', at);
    rescreen(c, at);
    return null;
  }

  var REVIEW_FIELDS = [['monthlyVolume', 'Expected monthly volume (EUR)'], ['sourceOfFunds', 'Source of funds'], ['country', 'Country'], ['idExpiry', 'ID document expiry'],
    ['idVerified', 'Identity verified'], ['addressDocDate', 'Proof of address date'], ['addressVerified', 'Address verified'], ['adverseMedia', 'Adverse media'], ['pepDeclared', 'PEP declared']];
  function sentence(t) { return String(t || '').trim().replace(/[.\s]+$/, ''); }
  function fmtVal(v) { return v === true ? 'yes' : v === false ? 'no' : (v === '' || v == null) ? 'none' : String(v); }

  function updateDuringReview(c, ch, at) {
    if (!c.openReview) return 'Start a review before changing customer data.';
    var denied = can('start_review', c); if (denied) return denied;
    var changes = [];
    REVIEW_FIELDS.forEach(function (f) {
      var k = f[0]; if (!(k in ch)) return;
      var before = c[k], after = k === 'monthlyVolume' ? (Number(ch[k]) || 0) : ch[k];
      if (fmtVal(before) === fmtVal(after)) return;
      changes.push(f[1] + ': ' + fmtVal(k === 'country' ? countryName(before) : before) + ' to ' + fmtVal(k === 'country' ? countryName(after) : after));
      c[k] = after;
    });
    if (ch.newUbo && ch.newUbo.name) {
      c.ubos = (c.ubos || []).concat([ch.newUbo]);
      changes.push('beneficial owner added: ' + ch.newUbo.name + (ch.newUbo.pct ? ' (' + ch.newUbo.pct + '%)' : ''));
    }
    if (!changes.length) return 'Nothing changed.';
    addAudit(c, 'update', 'Customer data updated during the review. ' + changes.join('; ') + '.', at);
    rescreen(c, at);
    return null;
  }

  // ---------------------------------------------------------------------------
  // Exceptions register
  // ---------------------------------------------------------------------------
  function getException(id) { return state.exceptions.filter(function (x) { return x.id === id; })[0]; }

  function raiseException(c, x, at) {
    var denied = can('raise_exception', c); if (denied) return denied;
    at = at || now();
    var err = K.validateException(x, at); if (err) return err;
    state.exSeq += 1;
    var e = { id: 'EX-' + (state.exSeq < 100 ? ('00' + state.exSeq).slice(-3) : String(state.exSeq)), caseId: c.id, customer: c.name, type: x.type, description: x.description.trim(), mitigation: x.mitigation.trim(),
      expiresOn: x.expiresOn, status: 'Pending approval', raisedAt: at, raisedBy: userLabel(me()), raisedById: state.currentUserId };
    state.exceptions.unshift(e);
    addAudit(c, 'exception', 'Exception ' + e.id + ' raised (' + nameOf(K.EXCEPTION_TYPES, e.type) + '): ' + e.description + ' Mitigation: ' + e.mitigation + ' Resolve by ' + e.expiresOn + '.', at);
    return null;
  }

  function decideException(e, approve, note, at) {
    var denied = can('decide_exception', null, { exception: e }); if (denied) return denied;
    if (e.status !== 'Pending approval') return 'This exception has already been decided.';
    if (!note || note.trim().length < 10) return 'Record the reason for the decision (at least 10 characters).';
    at = at || now();
    e.status = approve ? 'Approved' : 'Rejected'; e.decidedAt = at; e.decidedBy = userLabel(me()); e.decisionNote = note.trim();
    var c = getCase(e.caseId);
    if (c) addAudit(c, 'exception', 'Exception ' + e.id + (approve ? ' approved' : ' rejected') + ' (four eyes, raised by ' + e.raisedBy + '). ' + note.trim(), at);
    return null;
  }

  function closeException(e, note, at) {
    var denied = can('close_exception', null, { exception: e }); if (denied) return denied;
    if (e.status !== 'Approved') return 'Only an approved exception can be closed.';
    if (!note || note.trim().length < 10) return 'Record how it was resolved (at least 10 characters).';
    at = at || now();
    e.status = 'Closed'; e.closedAt = at; e.closedBy = userLabel(me()); e.closeNote = note.trim();
    var c = getCase(e.caseId);
    if (c) addAudit(c, 'exception', 'Exception ' + e.id + ' closed as resolved. ' + note.trim(), at);
    return null;
  }

  // ---------------------------------------------------------------------------
  // Quality assurance
  // ---------------------------------------------------------------------------
  function submitQA(c, results, note, at) {
    var d = K.decider(c);
    if (!d || !d.id) return 'The person who decided this case is not recorded, so independence cannot be checked.';
    var denied = can('qa_review', c, { deciderId: d.id }); if (denied) return denied;
    if (c.status !== 'Approved' && c.status !== 'Rejected') return 'Only decided cases can be quality checked.';
    if (c.qa) return 'This decision already has a QA result.';
    var err = K.validateQA(results, note, c); if (err) return err;
    at = at || now();
    var s = K.scoreQA(results);
    c.qa = { outcome: s.outcome, failed: s.failed, results: results, note: (note || '').trim(), by: userLabel(me()), byId: state.currentUserId, at: at, decidedBy: d.label, deciderId: d.id };
    addAudit(c, 'qa', 'Quality check ' + s.outcome.toUpperCase() + (s.failed.length ? ' on: ' + s.failed.map(function (f) { return QA_SHORT[f]; }).join(', ') : '') + (note && note.trim() ? '. ' + sentence(note) : '') + '.', at);
    return null;
  }

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------
  function show(view) {
    $all('main > section').forEach(function (s) { s.classList.add('hidden'); });
    $('#view-' + view).classList.remove('hidden');
    $all('#nav button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === view || (view === 'case' && b.getAttribute('data-view') === 'queue')); });
    if (view === 'dashboard') renderDashboard();
    if (view === 'queue') renderQueue();
    if (view === 'lists') renderLists();
    if (view === 'new') renderPreview();
    if (view === 'access') renderAccess();
    if (view === 'reviews') renderReviews();
    if (view === 'exceptions') renderExceptions();
    if (view === 'quality') renderQuality();
    // Keep the tabs in view instead of jumping to the banner at the top of the page.
    var tabs = document.querySelector('.appbar'), site = document.querySelector('.sitebar');
    if (tabs) {
      var y = tabs.getBoundingClientRect().top + window.pageYOffset - (site ? site.offsetHeight : 0) - 8;
      if (window.pageYOffset > y) window.scrollTo(0, y);
    } else {
      window.scrollTo(0, 0);
    }
  }
  $all('#nav button').forEach(function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-view')); }); });

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------
  function bars(el, rows, colorFn) {
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }).concat([1]));
    el.innerHTML = rows.map(function (r) {
      return '<div class="bar-row"><span>' + esc(r[0]) + '</span><div class="bar"><span style="width:' + (r[1] / max * 100) + '%;background:' + colorFn(r[0]) + '"></span></div><strong>' + r[1] + '</strong></div>';
    }).join('');
  }

  function renderDashboard() {
    var m = K.metrics(state.cases);
    var kpis = [
      ['Total cases', m.total, m.decided + ' decided'],
      ['Awaiting action', m.byStatus['Pending review'] + m.byStatus['Info requested'], 'pending or info requested'],
      ['EDD rate', m.eddRate + '%', m.eddCases + ' high risk cases'],
      ['Escalation rate', m.escalationRate + '%', m.escalated + ' sent to MLRO'],
      ['False positive rate', m.falsePositiveRate + '%', m.falsePositives + ' of ' + m.reviewedHits + ' reviewed hits'],
      ['Avg time to decision', m.avgHoursToDecision + ' h', 'creation to approve or reject']
    ];
    $('#kpis').innerHTML = kpiHtml(kpis);
    var sc = { 'Pending review': '#2563eb', 'Info requested': '#8892a0', 'Escalated': '#9333ea', 'Approved': '#16a34a', 'Rejected': '#dc2626' };
    bars($('#chart-status'), STATUSES.map(function (s) { return [s, m.byStatus[s] || 0]; }), function (k) { return sc[k]; });
    var tc = { Low: '#16a34a', Medium: '#d97706', High: '#dc2626' };
    bars($('#chart-tier'), ['Low', 'Medium', 'High'].map(function (t) { return [t, m.byTier[t]]; }), function (k) { return tc[k]; });
    bars($('#chart-hits'), [['Sanctions hits', m.sanctionsHits], ['PEP hits', m.pepHits], ['True matches', m.trueMatches], ['False positives', m.falsePositives]], function () { return '#22d3ee'; });
    bars($('#chart-controls'), [['CDD incomplete', m.cddIncomplete], ['EDD applied', m.eddCases], ['Red flag cases', m.redFlagCases], ['Escalated', m.escalated], ['Rejected', m.byStatus.Rejected]], function () { return '#06b6d4'; });

    var o = K.opsMetrics(state.cases, state.exceptions, now());
    $('#kpis2').innerHTML = kpiHtml([
      ['Reviews overdue', o.reviewsOverdue, o.reviewsDueSoon + ' due in the next ' + K.REVIEW_DUE_SOON_DAYS + ' days'],
      ['Reviews in progress', o.reviewsInProgress, o.reviewsCompleted + ' completed'],
      ['Open exceptions', o.exceptionsOpen, o.exceptionsOverdue + ' overdue, ' + o.exceptionsPending + ' awaiting approval'],
      ['QA pass rate', o.qaDone ? o.qaPassRate + '%' : 'n/a', o.qaDone + ' checked, ' + o.qaSampled + ' in the sample'],
      ['Over SLA (' + K.SLA_HOURS + ' h)', o.slaBreaches, 'of ' + o.openCases + ' open cases']
    ]);
    bars($('#chart-ageing'), Object.keys(o.ageing).map(function (k) { return [k, o.ageing[k]]; }), function (k) { return k === 'Over 5 days' ? '#dc2626' : k === '3 to 5 days' ? '#d97706' : '#22d3ee'; });
    bars($('#chart-qa'), K.QA_CHECKS.map(function (q) { return [QA_SHORT[q.id], o.qaErrors[q.id] || 0]; }), function () { return '#dc2626'; });
    $('#analyst-body').innerHTML = o.byAnalyst.length ? o.byAnalyst.map(function (a) {
      return '<tr><td>' + esc(a.name) + '</td><td>' + a.decisions + '</td><td>' + a.qaDone + '</td><td>' + (a.qaPassRate == null ? '<span class="muted">n/a</span>' : '<strong>' + a.qaPassRate + '%</strong>') + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="muted">No decisions yet.</td></tr>';
  }

  function kpiHtml(list) {
    return list.map(function (k) { return '<div class="card kpi"><div class="label">' + k[0] + '</div><div class="value">' + k[1] + '</div><div class="hint">' + k[2] + '</div></div>'; }).join('');
  }

  $('#btn-demo').addEventListener('click', function () { seedDemo(); save(); renderDashboard(); $('#dash-msg').textContent = 'Demo cases loaded.'; });
  // Two step confirmation built into the page (browser dialogs are blocked in some viewers).
  var resetArmed = null;
  $('#btn-reset').addEventListener('click', function () {
    var b = $('#btn-reset');
    var denied = can('reset_data'); if (denied) { $('#dash-msg').textContent = 'Reset: ' + denied; return; }
    if (!resetArmed) {
      b.textContent = 'Click again to delete all cases';
      b.classList.add('danger');
      resetArmed = setTimeout(function () { resetArmed = null; b.textContent = 'Reset all data (MLRO only)'; b.classList.remove('danger'); }, 4000);
      return;
    }
    clearTimeout(resetArmed); resetArmed = null;
    b.textContent = 'Reset all data (MLRO only)'; b.classList.remove('danger');
    var denied = can('reset_data'); if (denied) { $('#dash-msg').textContent = denied; return; }
    state = defaults(); save(); $('#export-panel').classList.add('hidden'); renderUserSwitch(); renderDashboard();
  });
  $('#btn-export').addEventListener('click', exportCSV);

  function exportCSV() {
    var head = ['case_id', 'created_at', 'customer', 'type', 'country', 'sector', 'risk_score', 'risk_tier', 'edd_required', 'cdd_complete', 'hits', 'red_flags', 'status', 'decided_at', 'next_review', 'review_state', 'open_exceptions', 'qa_result', 'audit_trail'];
    var t = now();
    var rows = state.cases.map(function (c) {
      var rs = K.reviewState(c, t);
      var openEx = state.exceptions.filter(function (x) { return x.caseId === c.id && ['Pending approval', 'Approved', 'Overdue'].indexOf(K.exceptionState(x, t)) !== -1; }).length;
      return [c.id, c.createdAt, c.name, typeName(c.customerType), countryName(c.country), c.sector, c.assessment.score, c.assessment.tier, c.assessment.eddRequired, c.assessment.cddComplete, c.hits.length, (c.assessment.redFlags || []).join(' '), c.status, c.decidedAt || '', c.nextReview || '',
        rs ? rs.state : '', openEx, c.qa ? c.qa.outcome : '',
        c.audit.map(function (a) { return a.at + ' [' + a.by + '] ' + a.text; }).join(' | ')];
    });
    var csv = [head].concat(rows).map(function (r) { return r.map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(','); }).join('\n');
    // Show the CSV in the page with Copy and Download, because some viewers block downloads.
    $('#export-text').value = csv;
    $('#export-panel').classList.remove('hidden');
    $('#export-msg').textContent = state.cases.length + ' case(s) exported.';
  }
  $('#export-copy').addEventListener('click', function () {
    var t = $('#export-text');
    try {
      navigator.clipboard.writeText(t.value).then(function () { $('#export-msg').textContent = 'Copied to the clipboard.'; },
        function () { t.select(); $('#export-msg').textContent = 'Select all and copy manually (Ctrl+C).'; });
    } catch (e) { t.select(); $('#export-msg').textContent = 'Select all and copy manually (Ctrl+C).'; }
  });
  $('#export-download').addEventListener('click', function () {
    try {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([$('#export-text').value], { type: 'text/csv' }));
      a.download = 'kyc-cases-export.csv';
      document.body.appendChild(a); a.click(); a.remove();
    } catch (e) { $('#export-msg').textContent = 'Download blocked here. Use Copy instead.'; }
  });
  $('#export-close').addEventListener('click', function () { $('#export-panel').classList.add('hidden'); });

  // ---------------------------------------------------------------------------
  // New case form with live preview
  // ---------------------------------------------------------------------------
  var form = $('#case-form');
  $('#f-type').innerHTML = K.CUSTOMER_TYPES.map(function (t) { return '<option value="' + t.id + '">' + t.name + '</option>'; }).join('');
  $('#f-country').innerHTML = K.COUNTRIES.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (c) { return '<option value="' + c.code + '"' + (c.code === 'IE' ? ' selected' : '') + '>' + c.name + '</option>'; }).join('');
  $('#f-sector').innerHTML = K.SECTORS.map(function (s) { return '<option value="' + s.id + '">' + s.name + (s.highRisk ? ' (higher risk)' : '') + '</option>'; }).join('');
  $('#f-iddoc').innerHTML = K.ID_DOC_TYPES.map(function (d) { return '<option value="' + d.id + '">' + esc(d.name) + '</option>'; }).join('');
  $('#f-addrdoc').innerHTML = K.ADDRESS_DOC_TYPES.map(function (d) { return '<option value="' + d.id + '">' + esc(d.name) + '</option>'; }).join('');
  $('#f-flags').innerHTML = flagChecks([], 'f-flag');
  $('#f-registry').innerHTML = K.REGISTRIES.map(function (r) { return '<option value="' + r.id + '">' + esc(r.name) + '</option>'; }).join('');

  function addUboRow(u) {
    u = u || {};
    var div = document.createElement('div');
    div.className = 'ubo';
    div.innerHTML = '<input type="text" class="u-name" placeholder="Beneficial owner name" value="' + esc(u.name || '') + '">' +
      '<input type="date" class="u-dob" value="' + esc(u.dob || '') + '">' +
      '<input type="number" class="u-pct" placeholder="%" min="0" max="100" value="' + esc(u.pct || '') + '">' +
      '<button type="button" class="btn ghost small">Remove</button>';
    div.querySelector('button').addEventListener('click', function () { div.remove(); renderPreview(); });
    $('#ubo-rows').appendChild(div);
  }
  $('#add-ubo').addEventListener('click', function () { addUboRow(); });

  function readForm() {
    var f = form.elements;
    var corp = f.customerType.value === 'company' || f.customerType.value === 'trust';
    var biz = f.customerType.value !== 'individual';
    return {
      name: f.name.value.trim(), customerType: f.customerType.value, country: f.country.value, dob: f.dob.value,
      sector: f.sector.value, idDocType: f.idDocType.value, idExpiry: f.idExpiry.value, idVerified: f.idVerified.checked,
      addressDocType: corp ? undefined : f.addressDocType.value, addressDocDate: corp ? undefined : f.addressDocDate.value, addressVerified: corp ? undefined : f.addressVerified.checked,
      redFlags: $all('#f-flags .f-flag').filter(function (b) { return b.checked; }).map(function (b) { return b.value; }),
      registry: biz ? f.registry.value : undefined, registryNumber: biz ? f.registryNumber.value.trim() : undefined, registryVerified: biz ? f.registryVerified.checked : undefined,
      monthlyVolume: Number(f.monthlyVolume.value) || 0, sourceOfFunds: f.sourceOfFunds.value.trim(),
      pepDeclared: f.pepDeclared.checked, adverseMedia: f.adverseMedia.checked,
      ubos: corp ? $all('#ubo-rows .ubo').map(function (r) { return { name: r.querySelector('.u-name').value.trim(), dob: r.querySelector('.u-dob').value, pct: r.querySelector('.u-pct').value }; }).filter(function (u) { return u.name; }) : [],
      createdAt: new Date().toISOString()
    };
  }

  function syncFormType() {
    var corp = form.elements.customerType.value === 'company' || form.elements.customerType.value === 'trust';
    $('#ubo-block').classList.toggle('hidden', !corp);
    $('#biz-block').classList.toggle('hidden', form.elements.customerType.value === 'individual');
    $('#addr-block').classList.toggle('hidden', corp);
    $('#lbl-dob').textContent = corp ? 'Date of incorporation' : 'Date of birth';
    if (corp && !$all('#ubo-rows .ubo').length) addUboRow();
  }

  function factorTable(a) {
    return '<table><tbody>' + a.factors.map(function (f) {
      return '<tr><td>' + esc(f.label) + '<div class="ref">' + esc(f.ref) + '</div></td><td style="text-align:right;font-weight:700">+' + f.points + '</td></tr>';
    }).join('') + '</tbody></table>';
  }

  function renderPreview() {
    var input = readForm();
    if (!input.name) { $('#preview-body').innerHTML = '<span class="muted">Enter a name to see the risk score and screening result.</span>'; return; }
    var hits = K.screenCase(input, state.lists);
    var a = K.assess(input, hits, state.lists);
    var rec = K.recommend(a);
    $('#preview-body').innerHTML =
      '<div style="display:flex;align-items:center;gap:12px"><span class="score">' + a.score + '</span>' + tierBadge(a.tier) + '</div>' +
      '<div class="rec ' + rec.code + '">' + esc(rec.text) + '</div>' +
      (hits.length ? '<p><strong>' + hits.length + ' screening hit(s)</strong> will need review.</p>' : '<p class="muted">No sanctions or PEP hits.</p>') +
      (a.cddIssues.length ? '<p class="err">' + a.cddIssues.map(esc).join('<br>') + '</p>' : '') +
      factorTable(a);
  }

  form.addEventListener('input', function (e) { if (e.target.name === 'customerType') syncFormType(); renderPreview(); });
  form.addEventListener('change', function (e) { if (e.target.name === 'customerType') syncFormType(); renderPreview(); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var input = readForm();
    if (!input.name) { $('#form-msg').innerHTML = '<div class="err">Enter the full legal name.</div>'; return; }
    var denied = can('create_case'); if (denied) { $('#form-msg').innerHTML = '<div class="err">' + esc(denied) + '</div>'; return; }
    var c = createCase(input);
    save();
    form.reset(); $('#ubo-rows').innerHTML = ''; syncFormType();
    $('#form-msg').innerHTML = '';
    openCase(c.id);
  });

  // ---------------------------------------------------------------------------
  // Queue
  // ---------------------------------------------------------------------------
  $('#q-status').innerHTML += STATUSES.map(function (s) { return '<option>' + s + '</option>'; }).join('');
  ['#q-search', '#q-status', '#q-tier'].forEach(function (s) { $(s).addEventListener('input', renderQueue); });

  function renderQueue() {
    var q = $('#q-search').value.toLowerCase(), st = $('#q-status').value, tr = $('#q-tier').value;
    var list = state.cases.filter(function (c) {
      return (!q || c.name.toLowerCase().indexOf(q) !== -1 || c.id.toLowerCase().indexOf(q) !== -1) && (!st || c.status === st) && (!tr || c.assessment.tier === tr);
    });
    $('#q-body').innerHTML = list.length ? list.map(function (c) {
      var open = c.hits.filter(function (h) { return !h.review; }).length;
      return '<tr class="click" data-id="' + c.id + '"><td><strong>' + c.id + '</strong></td><td>' + esc(c.name) + '</td><td>' + typeName(c.customerType) + '</td><td>' + esc(countryName(c.country)) + '</td><td>' + tierBadge(c.assessment.tier) + ' <span class="muted">' + c.assessment.score + '</span></td><td>' + c.hits.length + (open ? ' <span class="muted">(' + open + ' open)</span>' : '') + '</td><td>' + statusBadge(c.status) + '</td><td>' + fmtDate(c.createdAt) + '</td></tr>';
    }).join('') : '<tr><td colspan="8" class="muted">No cases yet. Create one or load the demo cases from the dashboard.</td></tr>';
    $all('#q-body tr.click').forEach(function (r) { r.addEventListener('click', function () { openCase(r.getAttribute('data-id')); }); });
  }

  // ---------------------------------------------------------------------------
  // Case detail
  // ---------------------------------------------------------------------------
  function openCase(id) { currentCaseId = id; renderCase(); show('case'); }

  function renderCase() {
    var c = getCase(currentCaseId);
    if (!c) return show('queue');
    var a = c.assessment, rec = K.recommend(a);
    var closed = c.status === 'Approved' || c.status === 'Rejected';
    var el = $('#view-case');

    var hitsHtml = c.hits.length ? c.hits.map(function (h, i) {
      var badge = h.review ? (h.review.outcome === 'true_match' ? '<span class="badge h-true">True match</span>' : '<span class="badge h-cleared">False positive</span>') : '<span class="badge h-' + h.level + '">' + (h.level === 'strong' ? 'Strong match' : 'Potential match') + '</span>';
      var controls = '';
      if (!h.review && !closed && me().role === 'auditor') {
        controls = '<p class="muted" style="margin:6px 0 0">Read only access.</p>';
      } else if (!h.review && !closed) {
        if (h.listType === 'Sanctions' && h.level === 'strong') {
          controls = '<p class="muted" style="margin:6px 0 0">Strong sanctions match: the analyst cannot clear this hit. Reject and escalate to the MLRO.</p>';
        } else {
          controls = '<div style="margin-top:8px"><input type="text" class="hit-note" data-i="' + i + '" placeholder="Reason, e.g. different date of birth and nationality"><div class="toolbar" style="margin:6px 0 0"><button class="btn small ghost hit-btn" data-i="' + i + '" data-o="false_positive">Clear as false positive</button><button class="btn small danger hit-btn" data-i="' + i + '" data-o="true_match">Confirm true match</button></div><div class="err" id="hit-msg-' + i + '"></div></div>';
        }
      }
      return '<div class="hit"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><div><strong>' + esc(h.listType) + ':</strong> ' + esc(h.entryName) + ' <span class="muted">(' + esc(h.entryId) + ')</span><br><span class="muted">' + esc(h.subject) + ' · matched on "' + esc(h.matchedOn) + '" · score ' + h.score + (h.dobConflict ? ' · date of birth differs' : '') + '</span><br><span class="muted">' + esc(h.detail) + '</span></div><div>' + badge + '</div></div>' +
        (h.review ? '<div class="muted" style="margin-top:6px">Reviewed by ' + esc(h.review.by) + ', ' + fmtTime(h.review.at) + ': ' + esc(h.review.note) + '</div>' : '') + controls + '</div>';
    }).join('') : '<p class="muted">No sanctions or PEP hits.</p>';

    var decisionHtml = closed ? '<p>Case closed: ' + statusBadge(c.status) + (c.nextReview ? ' Next periodic review on <strong>' + fmtDate(c.nextReview) + '</strong>.' : '') + '</p>' :
      '<p class="muted">Acting as <strong>' + esc(userLabel(me())) + '</strong>' + (me().role === 'analyst' ? (me().delegatedAuthority ? ', delegated authority for Low and Medium risk' : ', no delegated approval authority') : '') + '. Case prepared by ' + esc(c.createdBy || 'unknown') + '.</p>' +
      (a.eddRequired ? '<label class="check"><input type="checkbox" id="d-edd"> EDD completed: source of wealth and source of funds established and documented</label>' : '') +
      (a.redFlags.length ? '<label class="check"><input type="checkbox" id="d-flags"> Every red flag has been explained by the customer and the explanation is supported by evidence on file</label>' : '') +
      (a.mandatoryEDD.length ? '<p class="muted" style="font-size:12.5px">Senior management approval: approving this case records your sign off. It must be a senior analyst or the MLRO who did not prepare the case.</p>' : '') +
      '<div class="field"><label>Rationale</label><textarea id="d-rationale" placeholder="Explain the decision and the evidence relied on"></textarea></div>' +
      '<div class="toolbar">' + ['approve', 'request_info', 'escalate', 'reject'].map(function (d) {
        var why = rec.allowed.indexOf(d) === -1 ? 'Not allowed by policy for this case.' : can(d, c);
        return '<button class="btn ' + (d === 'reject' ? 'danger' : d === 'approve' ? '' : 'ghost') + ' d-btn" data-d="' + d + '"' + (why ? ' disabled title="' + esc(why) + '"' : '') + '>' + DECISION_LABEL[d] + '</button>';
      }).join('') + '</div>' + deniedList(c, rec) + '<div id="d-msg"></div>';

    function deniedList(c, rec) {
      var items = ['approve', 'request_info', 'escalate', 'reject'].map(function (d) {
        if (rec.allowed.indexOf(d) === -1) return null;
        var why = can(d, c); return why ? '<li><strong>' + DECISION_LABEL[d] + ':</strong> ' + esc(why) + '</li>' : null;
      }).filter(Boolean);
      return items.length ? '<ul class="muted" style="font-size:12.5px;margin:4px 0 0;padding-left:18px">' + items.join('') + '</ul>' : '';
    }
    var ubos = (c.ubos || []).length ? '<p><strong>Beneficial owners:</strong> ' + c.ubos.map(function (u) { return esc(u.name) + (u.pct ? ' (' + esc(u.pct) + '%)' : ''); }).join(', ') + '</p>' : '';

    el.innerHTML =
      '<span class="back" id="back">&larr; Back to queue</span>' +
      '<div class="toolbar"><h2 style="margin:0">' + c.id + ': ' + esc(c.name) + '</h2>' + statusBadge(c.status) + tierBadge(a.tier) + '<span style="margin-left:auto"></span>' + (closed ? '' : '<button class="btn ghost small" id="rescreen">Re-screen against current lists</button>') + '</div>' +
      (c.openReview ? '<div class="rec"><strong>' + (c.openReview.trigger === 'periodic' ? 'Periodic review' : 'Event driven review: ' + esc(nameOf(K.REVIEW_TRIGGERS, c.openReview.trigger))) + '</strong> started ' + fmtDate(c.openReview.startedAt) + ' by ' + esc(c.openReview.startedBy) + (c.openReview.note ? '. ' + esc(sentence(c.openReview.note)) : '') + '. The case needs a new decision to keep the relationship.</div>' : '') +
      '<div class="rec ' + rec.code + '"><strong>Recommendation:</strong> ' + esc(rec.text) + '</div>' +
      '<div class="grid two">' +
        '<div class="card"><h3>Customer profile</h3>' +
          '<p>' + typeName(c.customerType) + ' · ' + esc(countryName(c.country)) + ' · ' + esc((K.SECTORS.filter(function (s) { return s.id === c.sector; })[0] || {}).name || '') + '</p>' +
          '<p class="muted">' + (c.dob ? ((c.customerType === 'company' || c.customerType === 'trust') ? 'Incorporated: ' : 'Date of birth: ') + esc(c.dob) + ' · ' : '') + 'Monthly volume: EUR ' + Number(c.monthlyVolume || 0).toLocaleString('en-IE') + ' · Source of funds: ' + esc(c.sourceOfFunds || 'not provided') + '</p>' + ubos +
          '<p>Identity verified: <strong>' + (c.idVerified ? 'Yes' : 'No') + '</strong>' + (c.idDocType ? ' · ' + esc(nameOf(K.ID_DOC_TYPES, c.idDocType)) : '') + (c.idExpiry ? ' · ID expiry ' + esc(c.idExpiry) : '') + ' · PEP declared: <strong>' + (c.pepDeclared ? 'Yes' : 'No') + '</strong></p>' +
          (c.addressVerified !== undefined ? '<p>Address verified: <strong>' + (c.addressVerified ? 'Yes' : 'No') + '</strong>' + (c.addressDocType ? ' · ' + esc(nameOf(K.ADDRESS_DOC_TYPES, c.addressDocType)) : '') + (c.addressDocDate ? ' · dated ' + esc(c.addressDocDate) : '') + '</p>' : '') +
          (c.registry ? '<p>Register: ' + esc(nameOf(K.REGISTRIES, c.registry)) + (c.registryNumber ? ' · <code>' + esc(c.registryNumber) + '</code>' : '') + ' · <strong>' + (c.registryVerified ? 'checked' : 'not checked') + '</strong></p>' : '') +
          (a.cddIssues.length ? '<p class="err">CDD incomplete:<br>' + a.cddIssues.map(esc).join('<br>') + '</p>' : '<p class="ok">CDD complete</p>') +
          (a.mandatoryEDD.length ? '<p class="err">Mandatory EDD:<br>' + a.mandatoryEDD.map(esc).join('<br>') + '</p>' : '') +
        '</div>' +
        '<div class="card"><h3>Risk assessment</h3><div style="display:flex;align-items:center;gap:12px;margin-bottom:6px"><span class="score">' + a.score + '</span>' + tierBadge(a.tier) + '<span class="muted">Review every ' + a.reviewMonths + ' months</span></div>' + factorTable(a) + '</div>' +
        '<div class="card"><h3>Sanctions and PEP screening</h3>' + hitsHtml + '</div>' +
        '<div class="card"><h3>Red flags</h3>' + redFlagsHtml(c, closed) + '</div>' +
        '<div class="card"><h3>Decision</h3>' + decisionHtml + '</div>' +
        '<div class="card"><h3>Information request</h3>' + infoRequestHtml(c, closed) + '</div>' +
        '<div class="card"><h3>Ongoing CDD</h3>' + ongoingHtml(c) + '</div>' +
        '<div class="card"><h3>Exceptions</h3>' + caseExceptionsHtml(c) + '</div>' +
      '</div>' +
      (closed || c.qa || (c.qaHistory || []).length ? '<div class="card" style="margin-top:14px"><h3>Quality assurance</h3>' + qaHtml(c) + '</div>' : '') +
      '<div class="card" style="margin-top:14px"><h3>Audit trail (append only, retained 5 years under s.55)</h3><ol class="audit">' +
        c.audit.slice().reverse().map(function (e) { return '<li><time>' + fmtTime(e.at) + '</time><strong>' + esc(e.by) + ':</strong> ' + esc(e.text) + '</li>'; }).join('') +
      '</ol></div>';

    $('#back').addEventListener('click', function () { show('queue'); });
    var rs = $('#rescreen'); if (rs) rs.addEventListener('click', function () { if (can('rescreen', c)) return; rescreen(c); save(); renderCase(); });
    $all('.hit-btn', el).forEach(function (b) {
      b.addEventListener('click', function () {
        var i = Number(b.getAttribute('data-i')), note = $('.hit-note[data-i="' + i + '"]', el).value.trim();
        if (note.length < 10) { $('#hit-msg-' + i).textContent = 'Record the reason for this outcome (at least 10 characters).'; return; }
        var denied = can('review_hit', c, { hit: c.hits[i], outcome: b.getAttribute('data-o') });
        if (denied) { $('#hit-msg-' + i).textContent = denied; return; }
        reviewHit(c, i, b.getAttribute('data-o'), note); save(); renderCase();
      });
    });
    $all('.d-btn', el).forEach(function (b) {
      b.addEventListener('click', function () {
        var err = decide(c, b.getAttribute('data-d'), {
          rationale: $('#d-rationale').value,
          eddCompleted: $('#d-edd') ? $('#d-edd').checked : false,
          redFlagsExplained: $('#d-flags') ? $('#d-flags').checked : false
        });
        if (err) { $('#d-msg').innerHTML = '<div class="err">' + esc(err) + '</div>'; return; }
        save(); renderCase();
      });
    });
    bindCaseExtras(c, el);
  }

  // Case detail: red flags card
  function redFlagsHtml(c, closed) {
    var ids = c.assessment.redFlags || [];
    var list = ids.length ? '<ul style="margin:0 0 8px;padding-left:18px">' + ids.map(function (i) { var f = K.RED_FLAGS.filter(function (x) { return x.id === i; })[0]; return '<li>' + esc(f.name) + ' <span class="muted">(' + esc(f.group) + ', +' + f.points + ')</span></li>'; }).join('') + '</ul>' : '<p class="muted">No red flags recorded.</p>';
    if (closed) return list + '<p class="muted" style="font-size:12.5px">The case is closed. New red flags are recorded through an event driven review.</p>';
    if (me().role === 'auditor') return list + '<p class="muted">Read only access.</p>';
    return (ids.length ? list : '') + '<p class="muted" style="font-size:12.5px;margin:0">Tick what does not add up. A flagged case can only be approved by a senior analyst or the MLRO, after each flag is explained with evidence.</p>' +
      flagChecks(ids, 'rf-box') +
      '<div class="field" style="margin-top:8px"><input type="text" id="rf-note" placeholder="What did you see? e.g. payslip shows EUR 2,400 a month, deposit of EUR 90,000"></div>' +
      '<div class="toolbar" style="margin:0"><button class="btn ghost" id="rf-save">Save red flags</button></div><div id="rf-msg"></div>';
  }

  // Case detail: draft message asking the customer for outstanding items
  function infoRequestHtml(c, closed) {
    var r = K.infoRequest(c, c.assessment);
    if (closed) return '<p class="muted">The case is closed, nothing is outstanding.</p>';
    if (!r.items.length) return '<p class="ok">Nothing outstanding from the customer.</p>';
    return '<p class="muted" style="font-size:12.5px;margin-top:0">' + r.items.length + ' item(s) outstanding. Draft message to the customer. It only asks for documents and never mentions screening, red flags or the MLRO (s.49 tipping off).</p>' +
      '<textarea class="mail" id="ir-text" readonly>' + esc(r.text) + '</textarea>' +
      '<div class="toolbar" style="margin:6px 0 0"><button class="btn ghost small" id="ir-copy">Copy message</button><span class="muted" id="ir-msg" style="font-size:12.5px"></span></div>';
  }

  // Case detail: ongoing CDD card
  function ongoingHtml(c) {
    var rs = K.reviewState(c, now());
    var ro = me().role === 'auditor';
    var hist = (c.reviews || []).length ? '<h3 style="margin-top:14px;font-size:13.5px">Review history</h3><ol class="audit">' + c.reviews.slice().reverse().map(function (r) {
      return '<li><time>' + fmtDate(r.completedAt) + '</time>' + esc(r.trigger === 'periodic' ? 'Periodic review' : nameOf(K.REVIEW_TRIGGERS, r.trigger)) + ': <strong>' + esc(r.outcome) + '</strong> <span class="muted">(' + esc(r.by) + ')</span></li>';
    }).join('') + '</ol>' : '';
    if (c.openReview) {
      if (ro) return '<p>' + reviewBadge(rs) + ' ' + reviewWhen(rs) + '</p><p class="muted">Read only access.</p>' + hist;
      var countries = K.COUNTRIES.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (x) { return '<option value="' + x.code + '"' + (x.code === c.country ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('');
      return '<p>' + reviewBadge(rs) + ' ' + reviewWhen(rs) + '. Update what changed, then decide the case again.</p>' +
        '<div class="row"><div class="field"><label>Expected monthly volume (EUR)</label><input type="number" id="rv-monthlyVolume" min="0" step="1000" value="' + esc(c.monthlyVolume || 0) + '"></div>' +
        '<div class="field"><label>Source of funds</label><input type="text" id="rv-sourceOfFunds" value="' + esc(c.sourceOfFunds || '') + '"></div></div>' +
        '<div class="row"><div class="field"><label>Country</label><select id="rv-country">' + countries + '</select></div>' +
        '<div class="field"><label>ID document expiry</label><input type="date" id="rv-idExpiry" value="' + esc(c.idExpiry || '') + '"></div></div>' +
        '<label class="check"><input type="checkbox" id="rv-idVerified"' + (c.idVerified ? ' checked' : '') + '> Identity verified against a reliable, independent source</label>' +
        (c.addressVerified !== undefined ? '<div class="row"><div class="field"><label>Date on the proof of address</label><input type="date" id="rv-addressDocDate" value="' + esc(c.addressDocDate || '') + '"></div><div class="field" style="padding-top:22px"><label class="check"><input type="checkbox" id="rv-addressVerified"' + (c.addressVerified ? ' checked' : '') + '> Address verified with a current proof of address</label></div></div>' : '') +
        '<label class="check"><input type="checkbox" id="rv-pepDeclared"' + (c.pepDeclared ? ' checked' : '') + '> Customer or a beneficial owner is a PEP</label>' +
        '<label class="check"><input type="checkbox" id="rv-adverseMedia"' + (c.adverseMedia ? ' checked' : '') + '> Adverse media linked to financial crime</label>' +
        (c.customerType === 'company' || c.customerType === 'trust' ? '<div class="field" style="margin-top:8px"><label>New beneficial owner (optional)</label><div class="ubo" style="grid-template-columns:2fr 1.2fr .8fr"><input type="text" id="rv-ubo-name" placeholder="Name"><input type="date" id="rv-ubo-dob"><input type="number" id="rv-ubo-pct" placeholder="%" min="0" max="100"></div></div>' : '') +
        '<div class="toolbar" style="margin:8px 0 0"><button class="btn ghost" id="rv-save">Save changes and re-screen</button></div><div id="rv-msg"></div>' + hist;
    }
    if (c.status === 'Approved') {
      var start = ro ? '<p class="muted">Read only access.</p>' :
        '<div class="field"><label>Start a review</label><select id="rv-trigger">' + K.REVIEW_TRIGGERS.map(function (t) { return '<option value="' + t.id + '">' + esc(t.name) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><input type="text" id="rv-note" placeholder="What changed? (required for event driven reviews)"></div>' +
        '<div class="toolbar" style="margin:0"><button class="btn ghost" id="rv-start">Start review</button></div><div id="rv-msg"></div>';
      return '<p>' + reviewBadge(rs) + ' Next periodic review <strong>' + fmtDate(c.nextReview) + '</strong> (' + reviewWhen(rs) + ').</p>' + start + hist;
    }
    if (c.status === 'Rejected') return '<p class="muted">No active relationship, so no reviews.</p>' + hist;
    return '<p class="muted">Reviews start once the relationship is approved. The first periodic review is set by the risk tier: every ' + c.assessment.reviewMonths + ' months for this case.</p>' + hist;
  }

  // Case detail: exceptions card
  function caseExceptionsHtml(c) {
    var t = now();
    var list = state.exceptions.filter(function (x) { return x.caseId === c.id; });
    var rows = list.length ? '<table><tbody>' + list.map(function (x) {
      return '<tr><td><strong>' + esc(x.id) + '</strong><br><span class="muted">' + esc(nameOf(K.EXCEPTION_TYPES, x.type)) + '</span></td><td>' + esc(x.description) + '<div class="muted">Mitigation: ' + esc(x.mitigation) + '</div></td><td>' + exBadge(K.exceptionState(x, t)) + '<div class="muted">by ' + esc(x.expiresOn) + '</div></td></tr>';
    }).join('') + '</tbody></table>' : '<p class="muted">No exceptions on this case.</p>';
    if (me().role === 'auditor') return rows;
    var def = addDays(t, 30).slice(0, 10);
    return rows + '<h3 style="margin-top:14px;font-size:13.5px">Raise an exception</h3>' +
      '<div class="field"><select id="ex-type">' + K.EXCEPTION_TYPES.map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><textarea id="ex-desc" placeholder="What deviates from policy and why" style="min-height:56px"></textarea></div>' +
      '<div class="row"><div class="field"><input type="text" id="ex-mit" placeholder="Mitigating control, e.g. payouts capped"></div>' +
      '<div class="field"><input type="date" id="ex-exp" value="' + def + '" title="Resolve by (at most ' + K.EXCEPTION_MAX_DAYS + ' days)"></div></div>' +
      '<div class="toolbar" style="margin:0"><button class="btn ghost" id="ex-raise">Raise for approval</button></div><div id="ex-msg"></div>';
  }

  // Case detail: quality assurance card
  function qaHtml(c) {
    var d = K.decider(c);
    var hist = (c.qaHistory || []).length ? '<p class="muted" style="font-size:12.5px">Earlier QA results: ' + c.qaHistory.map(function (q) { return q.outcome + ' (' + esc(q.by) + ', ' + fmtDate(q.at) + ')'; }).join('; ') + '</p>' : '';
    if (c.qa) {
      return '<p>' + qaBadge(c.qa.outcome) + ' Checked by <strong>' + esc(c.qa.by) + '</strong> on ' + fmtDate(c.qa.at) + '. Decision taken by ' + esc(c.qa.decidedBy || 'unknown') + '.</p>' +
        '<table><tbody>' + K.QA_CHECKS.map(function (q) { var v = c.qa.results[q.id]; return '<tr><td>' + esc(q.name) + '</td><td style="text-align:right">' + (v === 'fail' ? '<strong style="color:#f87171">Fail</strong>' : v === 'pass' ? '<span style="color:#4ade80">Pass</span>' : '<span class="muted">N/A</span>') + '</td></tr>'; }).join('') + '</tbody></table>' +
        (c.qa.note ? '<p class="muted">' + esc(c.qa.note) + '</p>' : '') + hist;
    }
    if (c.status !== 'Approved' && c.status !== 'Rejected') return hist || '<p class="muted">QA happens after the decision.</p>';
    var head = '<p>' + (K.qaSelected(c) ? '<span class="badge s-Pending">In the QA sample</span> ' : '<span class="muted">Not in the routine sample (ad hoc checks are allowed).</span> ') + 'Decision taken by <strong>' + esc(d ? d.label : 'unknown') + '</strong>.</p>';
    var denied = can('qa_review', c, { deciderId: d && d.id });
    if (denied) return head + '<p class="muted">' + esc(denied) + '</p>' + hist;
    return head + '<table><tbody>' + K.QA_CHECKS.map(function (q) {
      return '<tr><td>' + esc(q.name) + '</td><td style="width:130px"><select class="qa-sel" data-q="' + q.id + '"><option value="">Choose</option><option value="pass">Pass</option><option value="fail">Fail</option><option value="na">N/A</option></select></td></tr>';
    }).join('') + '</tbody></table>' +
      '<div class="field" style="margin-top:10px"><textarea id="qa-note" placeholder="Findings for the analyst (required when a check fails)" style="min-height:56px"></textarea></div>' +
      '<div class="toolbar" style="margin:0"><button class="btn" id="qa-submit">Record QA result</button></div><div id="qa-msg"></div>' + hist;
  }

  function bindCaseExtras(c, el) {
    function msg(id, err) { $(id).innerHTML = err ? '<div class="err">' + esc(err) + '</div>' : ''; }
    var st = $('#rv-start', el);
    if (st) st.addEventListener('click', function () {
      var err = startReview(c, $('#rv-trigger').value, $('#rv-note').value);
      if (err) return msg('#rv-msg', err);
      save(); renderCase();
    });
    var sv = $('#rv-save', el);
    if (sv) sv.addEventListener('click', function () {
      var ch = {};
      ['monthlyVolume', 'sourceOfFunds', 'country', 'idExpiry'].forEach(function (k) { ch[k] = $('#rv-' + k).value.trim(); });
      ['idVerified', 'pepDeclared', 'adverseMedia'].forEach(function (k) { ch[k] = $('#rv-' + k).checked; });
      if ($('#rv-addressDocDate')) { ch.addressDocDate = $('#rv-addressDocDate').value; ch.addressVerified = $('#rv-addressVerified').checked; }
      var un = $('#rv-ubo-name');
      if (un && un.value.trim()) ch.newUbo = { name: un.value.trim(), dob: $('#rv-ubo-dob').value, pct: $('#rv-ubo-pct').value };
      var err = updateDuringReview(c, ch);
      if (err) return msg('#rv-msg', err);
      save(); renderCase();
    });
    var rx = $('#ex-raise', el);
    if (rx) rx.addEventListener('click', function () {
      var err = raiseException(c, { type: $('#ex-type').value, description: $('#ex-desc').value, mitigation: $('#ex-mit').value, expiresOn: $('#ex-exp').value });
      if (err) return msg('#ex-msg', err);
      save(); renderCase();
    });
    var rf = $('#rf-save', el);
    if (rf) rf.addEventListener('click', function () {
      var ids = $all('.rf-box', el).filter(function (b) { return b.checked; }).map(function (b) { return b.value; });
      var err = recordRedFlags(c, ids, $('#rf-note').value);
      if (err) return msg('#rf-msg', err);
      save(); renderCase();
    });
    var ic = $('#ir-copy', el);
    if (ic) ic.addEventListener('click', function () {
      var t = $('#ir-text');
      try {
        navigator.clipboard.writeText(t.value).then(function () { $('#ir-msg').textContent = 'Copied.'; }, function () { t.select(); $('#ir-msg').textContent = 'Select all and copy manually (Ctrl+C).'; });
      } catch (e) { t.select(); $('#ir-msg').textContent = 'Select all and copy manually (Ctrl+C).'; }
    });
    var qs = $('#qa-submit', el);
    if (qs) qs.addEventListener('click', function () {
      var results = {};
      $all('.qa-sel', el).forEach(function (s) { results[s.getAttribute('data-q')] = s.value; });
      var err = submitQA(c, results, $('#qa-note').value);
      if (err) return msg('#qa-msg', err);
      save(); renderCase();
    });
  }

  // ---------------------------------------------------------------------------
  // Reviews, exceptions and quality views
  // ---------------------------------------------------------------------------
  var REVIEW_ORDER = { 'Overdue': 0, 'In progress': 1, 'Due soon': 2, 'Scheduled': 3 };
  $('#r-filter').addEventListener('input', renderReviews);

  function renderReviews() {
    var t = now(), f = $('#r-filter').value;
    var all = state.cases.map(function (c) { return { c: c, rs: K.reviewState(c, t) }; }).filter(function (x) { return x.rs; });
    var count = function (s) { return all.filter(function (x) { return x.rs.state === s; }).length; };
    $('#r-kpis').innerHTML = kpiHtml([
      ['Overdue', count('Overdue'), 'past the review date'],
      ['Due soon', count('Due soon'), 'in the next ' + K.REVIEW_DUE_SOON_DAYS + ' days'],
      ['In progress', count('In progress'), 'periodic or event driven'],
      ['Completed', state.cases.reduce(function (n, c) { return n + (c.reviews || []).length; }, 0), 'reviews closed with a decision']
    ]);
    var rows = all.filter(function (x) { return !f || x.rs.state === f; }).sort(function (a, b) { return (REVIEW_ORDER[a.rs.state] - REVIEW_ORDER[b.rs.state]) || (a.rs.days - b.rs.days); });
    var ro = me().role === 'auditor';
    $('#r-body').innerHTML = rows.length ? rows.map(function (x) {
      var c = x.c, last = (c.reviews || []).slice(-1)[0];
      var action = x.rs.state === 'In progress' ? '<button class="btn ghost small r-open" data-id="' + c.id + '">Open</button>' :
        (ro ? '' : '<button class="btn ghost small r-start" data-id="' + c.id + '">Start periodic review</button>');
      return '<tr><td><strong class="click r-open" data-id="' + c.id + '" style="cursor:pointer">' + c.id + '</strong></td><td>' + esc(c.name) + '</td><td>' + tierBadge(c.assessment.tier) + '</td><td>' + reviewBadge(x.rs) + '<div class="muted">' + reviewWhen(x.rs) + '</div></td><td>' + (c.nextReview ? fmtDate(c.nextReview) : '') + '</td><td>' + (last ? fmtDate(last.completedAt) + '<div class="muted">' + esc(last.outcome) + '</div>' : '<span class="muted">Onboarded ' + fmtDate(c.decidedAt) + '</span>') + '</td><td>' + action + '</td></tr>';
    }).join('') : '<tr><td colspan="7" class="muted">No active relationships. Approve a case or load the demo cases.</td></tr>';
    $all('#r-body .r-open').forEach(function (b) { b.addEventListener('click', function () { openCase(b.getAttribute('data-id')); }); });
    $all('#r-body .r-start').forEach(function (b) {
      b.addEventListener('click', function () {
        var c = getCase(b.getAttribute('data-id'));
        var err = startReview(c, 'periodic', '');
        if (err) { b.parentNode.innerHTML = '<span class="err">' + esc(err) + '</span>'; return; }
        save(); openCase(c.id);
      });
    });
  }

  $('#x-filter').addEventListener('input', renderExceptions);
  function renderExceptions() {
    var t = now(), f = $('#x-filter').value;
    var list = state.exceptions.filter(function (x) { return !f || K.exceptionState(x, t) === f; });
    $('#x-body').innerHTML = list.length ? list.map(function (x) {
      var st = K.exceptionState(x, t), action = '';
      if (x.status === 'Pending approval' && !can('decide_exception', null, { exception: x })) {
        action = '<input type="text" class="x-note" data-id="' + x.id + '" placeholder="Reason for the decision"><div class="toolbar" style="margin:6px 0 0"><button class="btn small x-dec" data-id="' + x.id + '" data-a="1">Approve</button><button class="btn small ghost x-dec" data-id="' + x.id + '" data-a="0">Reject</button></div>';
      } else if (x.status === 'Pending approval') {
        action = '<span class="muted" style="font-size:12px">' + esc(can('decide_exception', null, { exception: x })) + '</span>';
      } else if (x.status === 'Approved' && !can('close_exception', null, { exception: x })) {
        action = '<input type="text" class="x-note" data-id="' + x.id + '" placeholder="How it was resolved"><div class="toolbar" style="margin:6px 0 0"><button class="btn small ghost x-close" data-id="' + x.id + '">Close as resolved</button></div>';
      } else {
        action = '<span class="muted" style="font-size:12px">' + esc(x.closeNote || x.decisionNote || '') + '</span>';
      }
      return '<tr><td><strong>' + esc(x.id) + '</strong></td><td><span class="click x-case" data-id="' + esc(x.caseId) + '" style="cursor:pointer;color:var(--accent)">' + esc(x.caseId) + '</span><br><span class="muted">' + esc(x.customer) + '</span></td><td><strong>' + esc(nameOf(K.EXCEPTION_TYPES, x.type)) + '</strong><br>' + esc(x.description) + '</td><td>' + esc(x.mitigation) + '</td><td>' + fmtDate(x.raisedAt) + '<div class="muted">' + esc(x.raisedBy) + '</div></td><td>' + esc(x.expiresOn) + '</td><td>' + exBadge(st) + (x.decidedBy ? '<div class="muted">' + esc(x.decidedBy) + '</div>' : '') + '</td><td style="min-width:190px">' + action + '<div class="err" id="x-err-' + esc(x.id) + '"></div></td></tr>';
    }).join('') : '<tr><td colspan="8" class="muted">No exceptions. Raise one from a case.</td></tr>';
    $all('#x-body .x-case').forEach(function (b) { b.addEventListener('click', function () { openCase(b.getAttribute('data-id')); }); });
    function note(id) { var n = $('.x-note[data-id="' + id + '"]'); return n ? n.value : ''; }
    $all('#x-body .x-dec').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-id'), err = decideException(getException(id), b.getAttribute('data-a') === '1', note(id));
        if (err) { $('#x-err-' + id).textContent = err; return; }
        save(); renderExceptions();
      });
    });
    $all('#x-body .x-close').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-id'), err = closeException(getException(id), note(id));
        if (err) { $('#x-err-' + id).textContent = err; return; }
        save(); renderExceptions();
      });
    });
  }

  function renderQuality() {
    var decided = state.cases.filter(function (c) { return c.status === 'Approved' || c.status === 'Rejected'; });
    var sampled = decided.filter(K.qaSelected), done = decided.filter(function (c) { return c.qa; });
    var passed = done.filter(function (c) { return c.qa.outcome === 'Pass'; }).length;
    $('#qa-kpis').innerHTML = kpiHtml([
      ['In the sample', sampled.length, 'of ' + decided.length + ' decisions'],
      ['Checked', done.length, sampled.filter(function (c) { return !c.qa; }).length + ' sampled still waiting'],
      ['Pass rate', done.length ? Math.round(passed / done.length * 1000) / 10 + '%' : 'n/a', passed + ' passed'],
      ['Failed', done.length - passed, 'sent back to the analyst']
    ]);
    var rows = decided.slice().sort(function (a, b) {
      var ka = (K.qaSelected(a) && !a.qa) ? 0 : a.qa ? 2 : 1, kb = (K.qaSelected(b) && !b.qa) ? 0 : b.qa ? 2 : 1;
      return ka - kb;
    });
    $('#qa-body').innerHTML = rows.length ? rows.map(function (c) {
      var d = K.decider(c), inS = K.qaSelected(c);
      return '<tr class="click" data-id="' + c.id + '"><td><strong>' + c.id + '</strong></td><td>' + esc(c.name) + '</td><td>' + tierBadge(c.assessment.tier) + '</td><td>' + statusBadge(c.status) + '</td><td>' + esc(d ? d.label : '') + '</td><td>' + (inS ? 'Yes' + (c.assessment.tier === 'High' ? ' <span class="muted">(High risk)</span>' : '') : '<span class="muted">No</span>') + '</td><td>' + (c.qa ? qaBadge(c.qa.outcome) + '<div class="muted">' + esc(c.qa.by) + '</div>' : (inS ? '<span class="badge s-Pending">Waiting</span>' : '<span class="muted">-</span>')) + '</td></tr>';
    }).join('') : '<tr><td colspan="7" class="muted">No decided cases yet.</td></tr>';
    $all('#qa-body tr.click').forEach(function (r) { r.addEventListener('click', function () { openCase(r.getAttribute('data-id')); }); });
  }

  // ---------------------------------------------------------------------------
  // Watchlists
  // ---------------------------------------------------------------------------
  function renderLists() {
    var s = state.lists.sanctions;
    $('#sanc-info').textContent = s.length + ' entries loaded. Source: ' + state.lists.sanctionsSource + '.';
    $('#sanc-body').innerHTML = s.slice(0, 300).map(function (e) { return '<tr><td>' + esc(e.id) + '</td><td>' + esc(e.name) + (e.aliases && e.aliases.length ? '<br><span class="muted">' + esc(e.aliases.join('; ')) + '</span>' : '') + '</td><td>' + esc(e.dob || '') + '</td></tr>'; }).join('') + (s.length > 300 ? '<tr><td colspan="3" class="muted">Showing the first 300 entries.</td></tr>' : '');
    $('#pep-body').innerHTML = state.lists.peps.map(function (p) { return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.role) + '</td></tr>'; }).join('');
    $('#hr-countries').innerHTML = K.COUNTRIES.filter(function (c) { return !c.eea; }).map(function (c) {
      return '<span class="pill' + (state.lists.highRiskCountries.indexOf(c.code) !== -1 ? ' on' : '') + '" data-c="' + c.code + '">' + esc(c.name) + '</span>';
    }).join('');
    $all('#hr-countries .pill').forEach(function (p) {
      p.addEventListener('click', function () {
        var denied = can('manage_lists'); if (denied) { $('#sanc-msg').innerHTML = '<div class="err">High risk countries: ' + esc(denied) + '</div>'; return; }
        var code = p.getAttribute('data-c'), l = state.lists.highRiskCountries, i = l.indexOf(code);
        if (i === -1) l.push(code); else l.splice(i, 1);
        logAccess((i === -1 ? 'Added ' : 'Removed ') + code + (i === -1 ? ' to' : ' from') + ' the high risk third country list.');
        save(); renderLists();
      });
    });
  }

  $('#sanc-file').addEventListener('change', function (e) {
    var file = e.target.files[0]; if (!file) return;
    var denied = can('manage_lists'); if (denied) { $('#sanc-msg').innerHTML = '<div class="err">' + esc(denied) + '</div>'; e.target.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var entries = K.parseSanctionsCSV(reader.result);
        state.lists.sanctions = entries;
        state.lists.sanctionsSource = file.name + ' (imported ' + fmtDate(new Date().toISOString()) + ')';
        logAccess('Imported sanctions list ' + file.name + ' (' + entries.length + ' entries).');
        save(); renderLists();
        $('#sanc-msg').innerHTML = '<div class="ok">Imported ' + entries.length + ' entries. Use "Re-screen" on open cases to apply the new list.</div>';
      } catch (err) { $('#sanc-msg').innerHTML = '<div class="err">' + esc(err.message) + '</div>'; }
    };
    reader.readAsText(file);
    e.target.value = '';
  });
  $('#sanc-restore').addEventListener('click', function () {
    var denied = can('manage_lists'); if (denied) { $('#sanc-msg').innerHTML = '<div class="err">' + esc(denied) + '</div>'; return; }
    logAccess('Restored the fictional sample sanctions list.');
    state.lists.sanctions = K.SAMPLE_SANCTIONS.slice(); state.lists.sanctionsSource = 'Fictional sample list';
    save(); renderLists(); $('#sanc-msg').innerHTML = '<div class="ok">Sample list restored.</div>';
  });

  // ---------------------------------------------------------------------------
  // Access control (IAM): user switcher, permission matrix, access log
  // ---------------------------------------------------------------------------
  function renderUserSwitch() {
    $('#user-switch').innerHTML = state.users.map(function (u) { return '<option value="' + u.id + '"' + (u.id === state.currentUserId ? ' selected' : '') + '>' + esc(userLabel(u)) + '</option>'; }).join('');
  }
  $('#user-switch').addEventListener('change', function (e) {
    logAccess('Signed out.');
    state.currentUserId = e.target.value;
    logAccess('Signed in (simulated single sign on).');
    save();
    var visible = $all('main > section').filter(function (s) { return !s.classList.contains('hidden'); })[0];
    var view = visible ? visible.id.replace('view-', '') : 'dashboard';
    if (view === 'case') renderCase(); else show(view);
  });

  var MATRIX = [
    ['Create cases and re-screen', 'create_case'],
    ['Clear a screening hit as false positive', 'review_fp'],
    ['Confirm a sanctions true match', 'review_true'],
    ['Approve Low or Medium risk (delegated authority)', 'approve_low'],
    ['Approve High risk after EDD', 'approve_high'],
    ['Senior management approval, PEP and high risk country (four eyes)', 'approve_edd'],
    ['Record red flags on a case', 'record_red_flag'],
    ['Approve a case with red flags', 'approve_flags'],
    ['Decide escalated cases and sanctions matches', 'mlro_case'],
    ['Start a periodic or event driven review', 'start_review'],
    ['Raise an exception', 'raise_exception'],
    ['Approve an exception raised by someone else (four eyes)', 'decide_exception'],
    ['QA check of a decision taken by someone else', 'qa_review'],
    ['Manage watchlists and high risk countries', 'manage_lists'],
    ['Grant or revoke delegated authority', 'manage_users'],
    ['View cases, metrics, audit trail and access log', 'view']
  ];
  function matrixCell(key, u) {
    var fake = function (extra) { return Object.assign({ status: 'Pending review', createdById: 'someone-else', assessment: { tier: 'Low', mandatoryEDD: [], sanctionsBlocked: false } }, extra || {}); };
    var r;
    switch (key) {
      case 'create_case': r = K.authorize('create_case', u); break;
      case 'review_fp': r = K.authorize('review_hit', u, null, { hit: { listType: 'Sanctions' }, outcome: 'false_positive' }); break;
      case 'review_true': r = K.authorize('review_hit', u, null, { hit: { listType: 'Sanctions' }, outcome: 'true_match' }); break;
      case 'approve_low': r = K.authorize('approve', u, fake()); break;
      case 'approve_high': r = K.authorize('approve', u, fake({ assessment: { tier: 'High', mandatoryEDD: [], sanctionsBlocked: false } })); break;
      case 'approve_edd': r = K.authorize('approve', u, fake({ assessment: { tier: 'High', mandatoryEDD: ['PEP'], sanctionsBlocked: false } })); break;
      case 'record_red_flag': r = K.authorize('record_red_flag', u); break;
      case 'approve_flags': r = K.authorize('approve', u, fake({ assessment: { tier: 'Medium', mandatoryEDD: [], sanctionsBlocked: false, redFlags: ['funds_mismatch'] } })); break;
      case 'mlro_case': r = K.authorize('reject', u, fake({ status: 'Escalated' })); break;
      case 'start_review': r = K.authorize('start_review', u); break;
      case 'raise_exception': r = K.authorize('raise_exception', u); break;
      case 'decide_exception': r = K.authorize('decide_exception', u, null, { exception: { raisedById: 'someone-else' } }); break;
      case 'qa_review': r = K.authorize('qa_review', u, null, { deciderId: 'someone-else' }); break;
      case 'manage_lists': r = K.authorize('manage_lists', u); break;
      case 'manage_users': r = K.authorize('manage_users', u); break;
      case 'view': r = null; break;
    }
    return r ? '<span class="muted" title="' + esc(r) + '">No</span>' : '<strong style="color:var(--low)">Yes</strong>';
  }

  function renderAccess() {
    var u = me();
    $('#acc-me').innerHTML = 'Signed in as <strong>' + esc(userLabel(u)) + '</strong>. ' + esc(K.ROLES[u.role].summary);
    $('#acc-users').innerHTML = state.users.map(function (x) {
      var canManage = !can('manage_users') && x.role === 'analyst';
      return '<tr><td>' + esc(x.name) + (x.id === u.id ? ' <span class="muted">(you)</span>' : '') + '</td><td>' + esc(K.ROLES[x.role].name) + '</td><td>' +
        (x.role === 'analyst' ? (x.delegatedAuthority ? 'Granted' : 'Not granted') : (x.role === 'auditor' ? 'None (read only)' : 'Full for role')) +
        (canManage ? ' <button class="btn ghost small da-btn" data-u="' + x.id + '">' + (x.delegatedAuthority ? 'Revoke' : 'Grant') + '</button>' : '') + '</td></tr>';
    }).join('');
    $all('.da-btn').forEach(function (b) {
      b.addEventListener('click', function () {
        var target = state.users.filter(function (x) { return x.id === b.getAttribute('data-u'); })[0];
        target.delegatedAuthority = !target.delegatedAuthority;
        logAccess((target.delegatedAuthority ? 'Granted' : 'Revoked') + ' delegated approval authority for ' + target.name + '.');
        save(); renderAccess();
      });
    });
    $('#acc-matrix-head').innerHTML = '<tr><th>Permission</th>' + state.users.map(function (x) { return '<th>' + esc(x.name) + '<br><span style="text-transform:none">' + esc(K.ROLES[x.role].name) + '</span></th>'; }).join('') + '</tr>';
    $('#acc-matrix').innerHTML = MATRIX.map(function (m) { return '<tr><td>' + m[0] + '</td>' + state.users.map(function (x) { return '<td>' + matrixCell(m[1], x) + '</td>'; }).join('') + '</tr>'; }).join('');
    $('#acc-log').innerHTML = state.accessLog.length ? state.accessLog.slice(0, 60).map(function (e) { return '<li><time>' + fmtTime(e.at) + '</time><strong>' + esc(e.user) + ':</strong> ' + esc(e.text) + '</li>'; }).join('') : '<li class="muted">No access events yet. Switch user in the header to generate sign in events.</li>';
  }

  // ---------------------------------------------------------------------------
  // Demo data: realistic mix of outcomes for the metrics dashboard
  // ---------------------------------------------------------------------------
  function seedDemo() {
    var now = Date.now();
    var keepUser = state.currentUserId;
    function chk(err) { if (err && window.console) console.error('Demo data rule violation: ' + err); }
    function as(uid, fn) { var prev = state.currentUserId; state.currentUserId = uid; fn(); state.currentUserId = prev; }
    function ago(days, hours) { return new Date(now - days * 864e5 - (hours || 0) * 36e5).toISOString(); }
    function inDays(days) { return new Date(now + days * 864e5).toISOString().slice(0, 10); }
    function qaOk(edd) { return { id: 'pass', screening: 'pass', risk: 'pass', edd: edd ? 'pass' : 'na', authority: 'pass', rationale: 'pass' }; }
    var specs = [
      // Payments and e-commerce sellers from Portugal and Brazil, with notes in Portuguese.
      { d: 760, input: { name: 'Duarte & Filhos Transportes, Lda', customerType: 'company', country: 'PT', dob: '2004-05-12', sector: 'logistics', idDocType: 'national_id', idVerified: true, monthlyVolume: 260000, sourceOfFunds: 'Receitas de transporte rodoviário', registry: 'certidao', registryNumber: 'Código de acesso 1234-5678-9012', registryVerified: true, ubos: [{ name: 'Manuel Duarte', dob: '1961-04-04', pct: '70' }, { name: 'Rita Duarte', dob: '1990-02-02', pct: '30' }] },
        act: function (c, t) {
          chk(decide(c, 'approve', { rationale: 'Certidão Permanente confirma gerência e sócios; beneficiários verificados com Cartão de Cidadão. (EN: commercial register confirms managers and shareholders; UBOs verified.)' }, t(8)));
          chk(raiseException(c, { type: 'review_overdue', description: 'Revisão periódica vencida: cliente não respondeu a dois pedidos de documentos. (EN: periodic review overdue, customer has not answered two document requests.)', mitigation: 'Payouts capped at EUR 50,000 a month until the review is complete.', expiresOn: inDays(30) }, ago(1)));
        } },
      { d: 350, input: { name: 'Pix Ponte Pagamentos Ltda', customerType: 'company', country: 'BR', dob: '2017-09-01', sector: 'msb', idDocType: 'passport', idVerified: true, monthlyVolume: 750000, sourceOfFunds: 'Taxas de remessa internacional', registry: 'cnpj', registryNumber: '12.345.678/0001-90', registryVerified: true, ubos: [{ name: 'Carlos Eduardo Ramos', dob: '1978-08-08', pct: '100' }] },
        act: function (c, t) {
          as('u-senior', function () { chk(decide(c, 'approve', { rationale: 'EDD concluída: autorização do Banco Central do Brasil, demonstrações auditadas e origem do patrimônio do sócio comprovadas. (EN: EDD complete, central bank licence, audited accounts and source of wealth evidenced.)', eddCompleted: true }, t(40))); });
          as('u-mlro', function () { chk(submitQA(c, qaOk(true), '', t(70))); });
        } },
      { d: 200, input: { name: 'João Pedro Alves', customerType: 'soletrader', country: 'PT', dob: '1993-03-21', sector: 'retail', idDocType: 'national_id', idExpiry: inDays(-12), idVerified: true, monthlyVolume: 15000, sourceOfFunds: 'Vendas online no marketplace', registry: 'other', registryNumber: 'NIF 234567890, início de atividade nas Finanças', registryVerified: true },
        act: function (c, t) {
          chk(decide(c, 'approve', { rationale: 'Empresário em nome individual; Cartão de Cidadão e início de atividade verificados. (EN: sole trader, citizen card and tax registration verified.)' }, t(4)));
          chk(startReview(c, 'id_expired', 'Cartão de Cidadão caducou; vendedor notificado para enviar o novo. (EN: citizen card expired, seller asked for the new one.)', ago(2)));
          chk(decide(c, 'request_info', { rationale: 'Pedido de cópia do Cartão de Cidadão renovado, prazo de 30 dias. (EN: requested the renewed citizen card within 30 days.)' }, ago(2, -1)));
          chk(raiseException(c, { type: 'doc_renewal', description: 'Documento caducado durante a relação; renovação já marcada no Espaço Cidadão. (EN: document expired during the relationship, renewal booked.)', mitigation: 'Payouts above EUR 2,000 held until the new card is received.', expiresOn: inDays(28) }, ago(2, -2)));
          as('u-senior', function () { chk(decideException(state.exceptions[0], true, 'Low risk seller, mitigation proportionate, 30 day limit.', ago(1))); });
        } },
      { d: 120, input: { name: 'Rafael Monteiro Dias', customerType: 'individual', country: 'BR', dob: '1989-11-30', sector: 'retail', idDocType: 'passport', idExpiry: '2031-07-01', idVerified: true, monthlyVolume: 3000, sourceOfFunds: 'Revenda de artesanato pelo marketplace' },
        act: function (c, t) {
          chk(decide(c, 'approve', { rationale: 'Vendedor pessoa física, passaporte verificado, volume baixo e compatível com a atividade. (EN: individual seller, passport verified, low volume.)' }, t(2)));
          chk(startReview(c, 'activity', 'Volume mensal subiu de EUR 3.000 para EUR 60.000 em 30 dias. (EN: monthly volume rose from EUR 3,000 to EUR 60,000 in 30 days.)', ago(1)));
          chk(updateDuringReview(c, { monthlyVolume: 60000, sourceOfFunds: 'Revenda de artesanato e venda por atacado' }, ago(1, -1)));
        } },
      { d: 30, input: { name: 'Loja Sabor do Minho, Lda', customerType: 'company', country: 'PT', dob: '2019-06-14', sector: 'retail', idDocType: 'national_id', idVerified: true, monthlyVolume: 40000, sourceOfFunds: 'Vendas de produtos regionais online', registry: 'certidao', registryNumber: 'Código de acesso 2345-6789-0123', registryVerified: true, ubos: [{ name: 'Ana Ribeiro Costa', dob: '1985-01-17', pct: '100' }] },
        act: function (c, t) {
          chk(decide(c, 'approve', { rationale: 'Certidão Permanente válida, sócia única identificada; vendas compatíveis com o histórico na plataforma. (EN: valid register extract, single UBO, sales consistent.)' }, t(5)));
          as('u-senior', function () { chk(submitQA(c, qaOk(false), '', t(48))); });
        } },
      { d: 25, input: { name: 'Ateliê Bahia Moda Ltda', customerType: 'company', country: 'BR', dob: '2021-02-08', sector: 'retail', idDocType: 'national_id', idVerified: true, monthlyVolume: 90000, sourceOfFunds: 'Vendas de roupas no marketplace', registry: 'cnpj', registryNumber: '23.456.789/0001-01', registryVerified: false, ubos: [{ name: 'Juliana Santos Lima', dob: '1991-05-05', pct: '100' }] },
        act: function (c, t) { chk(decide(c, 'request_info', { rationale: 'Razão social no comprovante do CNPJ não confere com o contrato social. Pedido de documento atualizado. (EN: company name on the CNPJ record does not match the articles; updated document requested.)' }, t(3))); } },

      { d: 21, input: { name: 'Siobhan Kelly', customerType: 'individual', country: 'IE', dob: '1990-07-15', sector: 'employee', idDocType: 'passport', idVerified: true, idExpiry: '2030-01-01', addressDocType: 'utility', addressDocDate: inDays(-50), addressVerified: true, monthlyVolume: 3000, sourceOfFunds: 'Salary' },
        act: function (c, t) {
          decide(c, 'approve', { rationale: 'Low risk retail customer, identity verified with passport, salary income consistent with expected activity.' }, t(3));
          as('u-senior', function () { chk(submitQA(c, qaOk(false), '', t(30))); });
        } },
      { d: 20, input: { name: 'Bruno Carvalho Lima', customerType: 'soletrader', country: 'PT', dob: '1987-02-10', sector: 'hospitality', idDocType: 'national_id', idVerified: true, idExpiry: '2031-05-01', monthlyVolume: 20000, sourceOfFunds: 'Restaurant revenue' },
        act: function (c, t) {
          decide(c, 'approve', { rationale: 'Sole trader in hospitality, revenue in line with business size. Standard CDD completed.' }, t(6));
          as('u-senior', function () { chk(submitQA(c, Object.assign(qaOk(false), { id: 'fail', rationale: 'fail' }), 'No evidence of the business registration (NIF and início de atividade) on file, and the rationale does not say how revenue was checked. Returned to the analyst.', t(50))); });
        } },
      { d: 19, input: { name: 'Greenfield Software Ltd', customerType: 'company', country: 'IE', dob: '2015-04-01', sector: 'tech', idDocType: 'passport', idVerified: true, monthlyVolume: 120000, sourceOfFunds: 'SaaS subscription revenue', registry: 'cro', registryNumber: 'CRO 612345', registryVerified: true, ubos: [{ name: 'Ciara Byrne', dob: '1984-03-03', pct: '60' }, { name: 'Tom Walsh', dob: '1982-09-09', pct: '40' }] },
        act: function (c, t) {
          chk(raiseException(c, { type: 'old_proof', description: 'Proof of address for one director is 8 months old; policy asks for 6.', mitigation: 'Registered office confirmed on the CRO extract.', expiresOn: inDays(-19 + 21) }, t(1)));
          as('u-senior', function () { chk(decideException(state.exceptions[0], true, 'Address risk covered by the CRO record; renewal requested.', t(2))); });
          decide(c, 'approve', { rationale: 'CRO extract verified, both beneficial owners identified and verified. Volume consistent with audited accounts.' }, t(20));
          chk(closeException(state.exceptions[0], 'Recent utility bill received and filed.', t(96)));
          as('u-senior', function () { chk(submitQA(c, qaOk(false), '', t(120))); });
        } },
      { d: 18, input: { name: 'Marko Belandi Ferrante', customerType: 'individual', country: 'AE', dob: '1968-03-14', sector: 'metals', idVerified: true, idExpiry: '2029-01-01', monthlyVolume: 400000, sourceOfFunds: 'Trading' },
        act: function (c, t) { as('u-analyst', function () { chk(decide(c, 'escalate', { rationale: 'Strong sanctions match on name variant and identical date of birth. Escalated to MLRO, funds not released.' }, t(1))); }); as('u-mlro', function () { chk(decide(c, 'reject', { rationale: 'MLRO confirmed the match. Relationship refused and the report handled by the MLRO.' }, t(5))); }); } },
      { d: 17, input: { name: 'Anna Grimes', customerType: 'individual', country: 'GB', dob: '1995-12-01', sector: 'professional', idVerified: true, idExpiry: '2032-01-01', monthlyVolume: 6000, sourceOfFunds: 'Consulting fees' },
        act: function (c, t) { c.hits.forEach(function (h, i) { reviewHit(c, i, 'false_positive', 'Different full name, date of birth (1995 vs 1981) and nationality.', t(2)); }); decide(c, 'approve', { rationale: 'Screening hit cleared as a false positive. Non EU customer with low expected volume.' }, t(4)); } },
      { d: 15, input: { name: 'Helena Marchetti', customerType: 'individual', country: 'IT', dob: '1970-04-12', sector: 'employee', idVerified: true, idExpiry: '2030-06-01', monthlyVolume: 15000, sourceOfFunds: 'Ministerial salary and property income', pepDeclared: true },
        act: function (c, t) { as('u-analyst', function () { c.hits.forEach(function (h, i) { reviewHit(c, i, 'true_match', 'Customer confirmed as the Minister of Finance in the PEP list. Self declaration matches.', t(2)); }); }); as('u-senior', function () { chk(decide(c, 'approve', { rationale: 'PEP relationship approved after EDD. Source of wealth evidenced by public asset declarations and payslips.', eddCompleted: true }, t(52))); }); as('u-mlro', function () { chk(submitQA(c, qaOk(true), '', t(80))); }); } },
      { d: 13, input: { name: 'Coinbridge Exchange Ltd', customerType: 'company', country: 'MT', dob: '2019-01-01', sector: 'crypto', idVerified: true, monthlyVolume: 900000, sourceOfFunds: 'Exchange fees', ubos: [] },
        act: function (c, t) { decide(c, 'request_info', { rationale: 'No beneficial owner disclosed. Requested shareholder register and ownership chart.' }, t(3)); } },
      { d: 11, input: { name: 'Farid Rahimi', customerType: 'individual', country: 'IR', dob: '1979-05-05', sector: 'logistics', idVerified: true, idExpiry: '2028-01-01', monthlyVolume: 30000, sourceOfFunds: 'Freight business' },
        act: function (c, t) { decide(c, 'escalate', { rationale: 'High risk third country customer. Escalated to MLRO for EDD scope and senior approval decision.' }, t(6)); } },
      { d: 9, input: { name: 'Nordlys Trading AS', customerType: 'company', country: 'NO', dob: '2011-03-03', sector: 'retail', idVerified: true, monthlyVolume: 60000, sourceOfFunds: 'Wholesale revenue', ubos: [{ name: 'Erik Solberg', dob: '1975-01-20', pct: '100' }] },
        act: function (c, t) { decide(c, 'approve', { rationale: 'EEA company, single verified beneficial owner, activity consistent with trade.' }, t(9)); } },
      { d: 7, by: 'u-trainee', input: { name: 'Mariana Souza Costa', customerType: 'individual', country: 'BR', dob: '1992-10-10', sector: 'employee', idVerified: false, addressDocType: 'bank', addressDocDate: '', addressVerified: false, monthlyVolume: 2500, sourceOfFunds: '' },
        act: function (c, t) { as('u-trainee', function () { chk(decide(c, 'request_info', { rationale: 'Passport image unreadable, no proof of address and no source of funds. Requested new documents and a payslip.' }, t(1))); }); } },
      { d: 5, input: { name: 'Lucky Spin Gaming Ltd', customerType: 'company', country: 'CY', dob: '2018-08-08', sector: 'gambling', idVerified: true, monthlyVolume: 300000, sourceOfFunds: 'Gaming revenue', adverseMedia: true, ubos: [{ name: 'Andreas Georgiou', dob: '1980-02-02', pct: '70' }] },
        act: function (c, t) { as('u-senior', function () { chk(decide(c, 'reject', { rationale: 'High risk sector with adverse media on licence breaches. Outside the firm risk appetite.' }, t(30))); }); } },
      { d: 4, input: { name: 'Declan Farrell', customerType: 'individual', country: 'IE', dob: '1986-09-18', sector: 'employee', idDocType: 'passport', idVerified: true, idExpiry: '2032-03-01', addressDocType: 'bank', addressDocDate: inDays(-35), addressVerified: true, monthlyVolume: 40000, sourceOfFunds: 'Salary and a gift from a family friend abroad', redFlags: ['funds_mismatch', 'third_party'] },
        act: function (c, t) { chk(decide(c, 'request_info', { rationale: 'Payslips show EUR 2,600 net a month, but EUR 40,000 a month is expected, funded by a family friend abroad. Asked for evidence of the gift and of the donor source of funds.' }, t(2))); } },
      { d: 3, input: { name: 'Kestrel Maritime Holdings Limited', customerType: 'company', country: 'CY', dob: '2010-01-01', sector: 'logistics', idVerified: true, monthlyVolume: 500000, sourceOfFunds: 'Shipping charters', ubos: [{ name: 'Orlan Vexby', dob: '1975-11-02', pct: '100' }] },
        act: function (c, t) { decide(c, 'escalate', { rationale: 'Entity and its beneficial owner both match the sanctions list. Escalated to MLRO immediately.' }, t(1)); } },
      { d: 2, by: 'u-trainee', input: { name: 'Aoife Brennan', customerType: 'individual', country: 'IE', dob: '1988-06-06', sector: 'professional', idDocType: 'passport', idVerified: true, idExpiry: '2033-01-01', addressDocType: 'gov', addressDocDate: inDays(-20), addressVerified: true, monthlyVolume: 8000, sourceOfFunds: 'Salary' }, act: null },
      { d: 1, input: { name: 'Ferrante Marco', customerType: 'individual', country: 'IT', dob: '1991-09-09', sector: 'retail', idDocType: 'national_id', idVerified: true, idExpiry: '2031-01-01', addressDocType: 'utility', addressDocDate: inDays(-230), addressVerified: true, monthlyVolume: 4000, sourceOfFunds: 'Shop revenue' }, act: null },
      { d: 0, input: { name: 'Valdoria Infrastructure Fund', customerType: 'trust', country: 'CH', dob: '2020-01-01', sector: 'realestate', idVerified: true, monthlyVolume: 750000, sourceOfFunds: 'Investor capital', ubos: [{ name: 'Rui Sena', dob: '1959-12-19', pct: '35' }, { name: 'Pedro Nunes', dob: '1970-07-07', pct: '30' }] }, act: null }
    ];
    specs.forEach(function (s, i) {
      var cd = new Date(now - s.d * 864e5); cd.setHours(9 + (i % 7), 15 * (i % 4), 0, 0);
      if (cd.getTime() > now) cd = new Date(now - 36e5);
      var created = cd.toISOString();
      var c;
      as(s.by || 'u-analyst', function () { c = createCase(Object.assign({ pepDeclared: false, adverseMedia: false, ubos: [], redFlags: [] }, s.input, { createdAt: created }), created); });
      if (s.act) as('u-analyst', function () { s.act(c, function (h) { return new Date(new Date(created).getTime() + h * 36e5).toISOString(); }); });
      if ((s.input.customerType === 'company' || s.input.customerType === 'trust') && s.input.registryVerified === undefined) {
        // Older demo companies: record the register check that the rationale already mentions.
        c.registryVerified = true; c.registry = c.registry || 'other';
      }
    });
    state.currentUserId = keepUser;
  }

  // Initial render
  renderUserSwitch();
  syncFormType();
  renderDashboard();
})();
