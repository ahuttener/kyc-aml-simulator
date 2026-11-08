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
      lists: { sanctions: K.SAMPLE_SANCTIONS.slice(), peps: K.SAMPLE_PEPS.slice(), highRiskCountries: K.HIGH_RISK_THIRD_COUNTRIES.slice(), sanctionsSource: 'Fictional sample list' }
    };
  }
  function load() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (raw) { var s = JSON.parse(raw); if (s && s.cases && s.lists && s.users) return s; }
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

  function decide(c, decision, opts, at) {
    var err = can(decision, c) || K.validateDecision(decision, c.assessment, opts);
    if (err) return err;
    at = at || new Date().toISOString();
    c.status = DECISION_STATUS[decision];
    var text = DECISION_LABEL[decision] + '. Rationale: ' + opts.rationale.trim();
    if (opts.eddCompleted) text += ' EDD completed.';
    if (decision === 'approve' && c.assessment.mandatoryEDD.length) text += ' Senior management approval given by ' + userLabel(me()) + ' (four eyes: case prepared by ' + (c.createdBy || 'another user') + ').';
    if (decision === 'approve' || decision === 'reject') {
      c.decidedAt = at;
      if (decision === 'approve') {
        var d = new Date(at); d.setMonth(d.getMonth() + c.assessment.reviewMonths);
        c.nextReview = d.toISOString();
        text += ' Next periodic review: ' + fmtDate(c.nextReview) + '.';
      }
    }
    if (decision === 'escalate') text += ' Internal escalation only: customer not informed (s.49 tipping off).';
    addAudit(c, decision, text, at);
    return null;
  }

  function rescreen(c) {
    var old = c.hits || [];
    c.hits = K.screenCase(c, state.lists);
    c.hits.forEach(function (h) {
      var prev = old.filter(function (o) { return o.entryId === h.entryId && o.subject === h.subject && o.review; })[0];
      if (prev) h.review = prev.review;
    });
    recompute(c);
    addAudit(c, 'screen', 'Re-screened against current lists: ' + c.hits.length + ' hit(s). Risk score ' + c.assessment.score + ', tier ' + c.assessment.tier + '.');
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
    window.scrollTo(0, 0);
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
    $('#kpis').innerHTML = kpis.map(function (k) { return '<div class="card kpi"><div class="label">' + k[0] + '</div><div class="value">' + k[1] + '</div><div class="hint">' + k[2] + '</div></div>'; }).join('');
    var sc = { 'Pending review': '#2563eb', 'Info requested': '#8892a0', 'Escalated': '#9333ea', 'Approved': '#16a34a', 'Rejected': '#dc2626' };
    bars($('#chart-status'), STATUSES.map(function (s) { return [s, m.byStatus[s] || 0]; }), function (k) { return sc[k]; });
    var tc = { Low: '#16a34a', Medium: '#d97706', High: '#dc2626' };
    bars($('#chart-tier'), ['Low', 'Medium', 'High'].map(function (t) { return [t, m.byTier[t]]; }), function (k) { return tc[k]; });
    bars($('#chart-hits'), [['Sanctions hits', m.sanctionsHits], ['PEP hits', m.pepHits], ['True matches', m.trueMatches], ['False positives', m.falsePositives]], function () { return '#22d3ee'; });
    bars($('#chart-controls'), [['CDD incomplete', m.cddIncomplete], ['EDD applied', m.eddCases], ['Escalated', m.escalated], ['Rejected', m.byStatus.Rejected]], function () { return '#06b6d4'; });
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
    var head = ['case_id', 'created_at', 'customer', 'type', 'country', 'sector', 'risk_score', 'risk_tier', 'edd_required', 'cdd_complete', 'hits', 'status', 'decided_at', 'next_review', 'audit_trail'];
    var rows = state.cases.map(function (c) {
      return [c.id, c.createdAt, c.name, typeName(c.customerType), countryName(c.country), c.sector, c.assessment.score, c.assessment.tier, c.assessment.eddRequired, c.assessment.cddComplete, c.hits.length, c.status, c.decidedAt || '', c.nextReview || '',
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
    return {
      name: f.name.value.trim(), customerType: f.customerType.value, country: f.country.value, dob: f.dob.value,
      sector: f.sector.value, idExpiry: f.idExpiry.value, idVerified: f.idVerified.checked,
      monthlyVolume: Number(f.monthlyVolume.value) || 0, sourceOfFunds: f.sourceOfFunds.value.trim(),
      pepDeclared: f.pepDeclared.checked, adverseMedia: f.adverseMedia.checked,
      ubos: corp ? $all('#ubo-rows .ubo').map(function (r) { return { name: r.querySelector('.u-name').value.trim(), dob: r.querySelector('.u-dob').value, pct: r.querySelector('.u-pct').value }; }).filter(function (u) { return u.name; }) : [],
      createdAt: new Date().toISOString()
    };
  }

  function syncFormType() {
    var corp = form.elements.customerType.value === 'company' || form.elements.customerType.value === 'trust';
    $('#ubo-block').classList.toggle('hidden', !corp);
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
      '<div class="rec ' + rec.code + '"><strong>Recommendation:</strong> ' + esc(rec.text) + '</div>' +
      '<div class="grid two">' +
        '<div class="card"><h3>Customer profile</h3>' +
          '<p>' + typeName(c.customerType) + ' · ' + esc(countryName(c.country)) + ' · ' + esc((K.SECTORS.filter(function (s) { return s.id === c.sector; })[0] || {}).name || '') + '</p>' +
          '<p class="muted">' + (c.dob ? ((c.customerType === 'company' || c.customerType === 'trust') ? 'Incorporated: ' : 'Date of birth: ') + esc(c.dob) + ' · ' : '') + 'Monthly volume: EUR ' + Number(c.monthlyVolume || 0).toLocaleString('en-IE') + ' · Source of funds: ' + esc(c.sourceOfFunds || 'not provided') + '</p>' + ubos +
          '<p>Identity verified: <strong>' + (c.idVerified ? 'Yes' : 'No') + '</strong>' + (c.idExpiry ? ' · ID expiry ' + esc(c.idExpiry) : '') + ' · PEP declared: <strong>' + (c.pepDeclared ? 'Yes' : 'No') + '</strong></p>' +
          (a.cddIssues.length ? '<p class="err">CDD incomplete:<br>' + a.cddIssues.map(esc).join('<br>') + '</p>' : '<p class="ok">CDD complete</p>') +
          (a.mandatoryEDD.length ? '<p class="err">Mandatory EDD:<br>' + a.mandatoryEDD.map(esc).join('<br>') + '</p>' : '') +
        '</div>' +
        '<div class="card"><h3>Risk assessment</h3><div style="display:flex;align-items:center;gap:12px;margin-bottom:6px"><span class="score">' + a.score + '</span>' + tierBadge(a.tier) + '<span class="muted">Review every ' + a.reviewMonths + ' months</span></div>' + factorTable(a) + '</div>' +
        '<div class="card"><h3>Sanctions and PEP screening</h3>' + hitsHtml + '</div>' +
        '<div class="card"><h3>Decision</h3>' + decisionHtml + '</div>' +
      '</div>' +
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
          eddCompleted: $('#d-edd') ? $('#d-edd').checked : false
        });
        if (err) { $('#d-msg').innerHTML = '<div class="err">' + esc(err) + '</div>'; return; }
        save(); renderCase();
      });
    });
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
    ['Decide escalated cases and sanctions matches', 'mlro_case'],
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
      case 'mlro_case': r = K.authorize('reject', u, fake({ status: 'Escalated' })); break;
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
    var specs = [
      { d: 21, input: { name: 'Siobhan Kelly', customerType: 'individual', country: 'IE', dob: '1990-07-15', sector: 'employee', idVerified: true, idExpiry: '2030-01-01', monthlyVolume: 3000, sourceOfFunds: 'Salary' },
        act: function (c, t) { decide(c, 'approve', { rationale: 'Low risk retail customer, identity verified with passport, salary income consistent with expected activity.' }, t(3)); } },
      { d: 20, input: { name: 'Bruno Carvalho Lima', customerType: 'soletrader', country: 'PT', dob: '1987-02-10', sector: 'hospitality', idVerified: true, idExpiry: '2031-05-01', monthlyVolume: 20000, sourceOfFunds: 'Restaurant revenue' },
        act: function (c, t) { decide(c, 'approve', { rationale: 'Sole trader in hospitality, revenue in line with business size. Standard CDD completed.' }, t(6)); } },
      { d: 19, input: { name: 'Greenfield Software Ltd', customerType: 'company', country: 'IE', dob: '2015-04-01', sector: 'tech', idVerified: true, monthlyVolume: 120000, sourceOfFunds: 'SaaS subscription revenue', ubos: [{ name: 'Ciara Byrne', dob: '1984-03-03', pct: '60' }, { name: 'Tom Walsh', dob: '1982-09-09', pct: '40' }] },
        act: function (c, t) { decide(c, 'approve', { rationale: 'CRO extract verified, both beneficial owners identified and verified. Volume consistent with audited accounts.' }, t(20)); } },
      { d: 18, input: { name: 'Marko Belandi Ferrante', customerType: 'individual', country: 'AE', dob: '1968-03-14', sector: 'metals', idVerified: true, idExpiry: '2029-01-01', monthlyVolume: 400000, sourceOfFunds: 'Trading' },
        act: function (c, t) { as('u-analyst', function () { chk(decide(c, 'escalate', { rationale: 'Strong sanctions match on name variant and identical date of birth. Escalated to MLRO, funds not released.' }, t(1))); }); as('u-mlro', function () { chk(decide(c, 'reject', { rationale: 'MLRO confirmed the match. Relationship refused and the report handled by the MLRO.' }, t(5))); }); } },
      { d: 17, input: { name: 'Anna Grimes', customerType: 'individual', country: 'GB', dob: '1995-12-01', sector: 'professional', idVerified: true, idExpiry: '2032-01-01', monthlyVolume: 6000, sourceOfFunds: 'Consulting fees' },
        act: function (c, t) { c.hits.forEach(function (h, i) { reviewHit(c, i, 'false_positive', 'Different full name, date of birth (1995 vs 1981) and nationality.', t(2)); }); decide(c, 'approve', { rationale: 'Screening hit cleared as a false positive. Non EU customer with low expected volume.' }, t(4)); } },
      { d: 15, input: { name: 'Helena Marchetti', customerType: 'individual', country: 'IT', dob: '1970-04-12', sector: 'employee', idVerified: true, idExpiry: '2030-06-01', monthlyVolume: 15000, sourceOfFunds: 'Ministerial salary and property income', pepDeclared: true },
        act: function (c, t) { as('u-analyst', function () { c.hits.forEach(function (h, i) { reviewHit(c, i, 'true_match', 'Customer confirmed as the Minister of Finance in the PEP list. Self declaration matches.', t(2)); }); }); as('u-senior', function () { chk(decide(c, 'approve', { rationale: 'PEP relationship approved after EDD. Source of wealth evidenced by public asset declarations and payslips.', eddCompleted: true }, t(52))); }); } },
      { d: 13, input: { name: 'Coinbridge Exchange Ltd', customerType: 'company', country: 'MT', dob: '2019-01-01', sector: 'crypto', idVerified: true, monthlyVolume: 900000, sourceOfFunds: 'Exchange fees', ubos: [] },
        act: function (c, t) { decide(c, 'request_info', { rationale: 'No beneficial owner disclosed. Requested shareholder register and ownership chart.' }, t(3)); } },
      { d: 11, input: { name: 'Farid Rahimi', customerType: 'individual', country: 'IR', dob: '1979-05-05', sector: 'logistics', idVerified: true, idExpiry: '2028-01-01', monthlyVolume: 30000, sourceOfFunds: 'Freight business' },
        act: function (c, t) { decide(c, 'escalate', { rationale: 'High risk third country customer. Escalated to MLRO for EDD scope and senior approval decision.' }, t(6)); } },
      { d: 9, input: { name: 'Nordlys Trading AS', customerType: 'company', country: 'NO', dob: '2011-03-03', sector: 'retail', idVerified: true, monthlyVolume: 60000, sourceOfFunds: 'Wholesale revenue', ubos: [{ name: 'Erik Solberg', dob: '1975-01-20', pct: '100' }] },
        act: function (c, t) { decide(c, 'approve', { rationale: 'EEA company, single verified beneficial owner, activity consistent with trade.' }, t(9)); } },
      { d: 7, by: 'u-trainee', input: { name: 'Mariana Souza Costa', customerType: 'individual', country: 'BR', dob: '1992-10-10', sector: 'employee', idVerified: false, monthlyVolume: 2500, sourceOfFunds: '' },
        act: function (c, t) { as('u-trainee', function () { chk(decide(c, 'request_info', { rationale: 'Passport image unreadable and no source of funds. Requested new document and payslip.' }, t(1))); }); } },
      { d: 5, input: { name: 'Lucky Spin Gaming Ltd', customerType: 'company', country: 'CY', dob: '2018-08-08', sector: 'gambling', idVerified: true, monthlyVolume: 300000, sourceOfFunds: 'Gaming revenue', adverseMedia: true, ubos: [{ name: 'Andreas Georgiou', dob: '1980-02-02', pct: '70' }] },
        act: function (c, t) { as('u-senior', function () { chk(decide(c, 'reject', { rationale: 'High risk sector with adverse media on licence breaches. Outside the firm risk appetite.' }, t(30))); }); } },
      { d: 3, input: { name: 'Kestrel Maritime Holdings Limited', customerType: 'company', country: 'CY', dob: '2010-01-01', sector: 'logistics', idVerified: true, monthlyVolume: 500000, sourceOfFunds: 'Shipping charters', ubos: [{ name: 'Orlan Vexby', dob: '1975-11-02', pct: '100' }] },
        act: function (c, t) { decide(c, 'escalate', { rationale: 'Entity and its beneficial owner both match the sanctions list. Escalated to MLRO immediately.' }, t(1)); } },
      { d: 2, by: 'u-trainee', input: { name: 'Aoife Brennan', customerType: 'individual', country: 'IE', dob: '1988-06-06', sector: 'professional', idVerified: true, idExpiry: '2033-01-01', monthlyVolume: 8000, sourceOfFunds: 'Salary' }, act: null },
      { d: 1, input: { name: 'Ferrante Marco', customerType: 'individual', country: 'IT', dob: '1991-09-09', sector: 'retail', idVerified: true, idExpiry: '2031-01-01', monthlyVolume: 4000, sourceOfFunds: 'Shop revenue' }, act: null },
      { d: 0, input: { name: 'Valdoria Infrastructure Fund', customerType: 'trust', country: 'CH', dob: '2020-01-01', sector: 'realestate', idVerified: true, monthlyVolume: 750000, sourceOfFunds: 'Investor capital', ubos: [{ name: 'Rui Sena', dob: '1959-12-19', pct: '35' }, { name: 'Pedro Nunes', dob: '1970-07-07', pct: '30' }] }, act: null }
    ];
    specs.forEach(function (s, i) {
      var cd = new Date(now - s.d * 864e5); cd.setHours(9 + (i % 7), 15 * (i % 4), 0, 0);
      if (cd.getTime() > now) cd = new Date(now - 36e5);
      var created = cd.toISOString();
      var c;
      as(s.by || 'u-analyst', function () { c = createCase(Object.assign({ pepDeclared: false, adverseMedia: false, ubos: [] }, s.input, { createdAt: created }), created); });
      if (s.act) as('u-analyst', function () { s.act(c, function (h) { return new Date(new Date(created).getTime() + h * 36e5).toISOString(); }); });
    });
    state.currentUserId = keepUser;
  }

  // Initial render
  renderUserSwitch();
  syncFormType();
  renderDashboard();
})();
