/*
 * KYC Onboarding and Screening Simulator: rules engine
 * Author: Adriano Huttener
 *
 * Pure logic with no DOM access, so it can run in the browser and be unit tested in Node.
 * Every rule references docs/POLICY.md and the Criminal Justice (Money Laundering and
 * Terrorist Financing) Act 2010 ("CJA 2010").
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Reference data
  // ---------------------------------------------------------------------------

  // eea: true for EU and EEA member states.
  var COUNTRIES = [
    ['IE', 'Ireland', true], ['PT', 'Portugal', true], ['ES', 'Spain', true], ['FR', 'France', true],
    ['DE', 'Germany', true], ['IT', 'Italy', true], ['NL', 'Netherlands', true], ['BE', 'Belgium', true],
    ['PL', 'Poland', true], ['RO', 'Romania', true], ['SE', 'Sweden', true], ['AT', 'Austria', true],
    ['LU', 'Luxembourg', true], ['CY', 'Cyprus', true], ['MT', 'Malta', true], ['NO', 'Norway', true],
    ['GB', 'United Kingdom', false], ['US', 'United States', false], ['BR', 'Brazil', false],
    ['CA', 'Canada', false], ['AU', 'Australia', false], ['CH', 'Switzerland', false],
    ['AE', 'United Arab Emirates', false], ['IN', 'India', false], ['CN', 'China', false],
    ['TR', 'Turkey', false], ['NG', 'Nigeria', false], ['ZA', 'South Africa', false],
    ['MX', 'Mexico', false], ['AR', 'Argentina', false], ['RU', 'Russia', false],
    ['AF', 'Afghanistan', false], ['CD', 'Democratic Republic of the Congo', false],
    ['HT', 'Haiti', false], ['IR', 'Iran', false], ['KP', 'North Korea', false],
    ['MM', 'Myanmar', false], ['SS', 'South Sudan', false], ['SY', 'Syria', false],
    ['YE', 'Yemen', false], ['VE', 'Venezuela', false]
  ].map(function (c) { return { code: c[0], name: c[1], eea: c[2] }; });

  // Illustrative subset of the EU list of high risk third countries
  // (Delegated Regulation (EU) 2016/1675, as amended). The list changes regularly:
  // always verify against the current version before relying on it.
  var HIGH_RISK_THIRD_COUNTRIES = ['AF', 'CD', 'HT', 'IR', 'KP', 'MM', 'SS', 'SY', 'YE', 'VE'];

  var SECTORS = [
    { id: 'retail', name: 'Retail and e-commerce', highRisk: false },
    { id: 'tech', name: 'Technology and software', highRisk: false },
    { id: 'hospitality', name: 'Hospitality and food', highRisk: false },
    { id: 'professional', name: 'Professional services', highRisk: false },
    { id: 'logistics', name: 'Logistics and transport', highRisk: false },
    { id: 'realestate', name: 'Real estate', highRisk: false },
    { id: 'employee', name: 'Employee or private individual', highRisk: false },
    { id: 'msb', name: 'Money services and remittance', highRisk: true },
    { id: 'crypto', name: 'Crypto assets', highRisk: true },
    { id: 'gambling', name: 'Gambling', highRisk: true },
    { id: 'metals', name: 'Precious metals and stones', highRisk: true },
    { id: 'cash', name: 'Cash intensive business', highRisk: true },
    { id: 'arms', name: 'Arms and defence', highRisk: true }
  ];

  var CUSTOMER_TYPES = [
    { id: 'individual', name: 'Individual', points: 0 },
    { id: 'soletrader', name: 'Sole trader', points: 5 },
    { id: 'company', name: 'Company', points: 10 },
    { id: 'trust', name: 'Trust or complex structure', points: 20 }
  ];

  // FICTIONAL sample sanctions list. Names, dates and entities are invented for
  // demonstration. Import the real EU consolidated list for genuine screening.
  var SAMPLE_SANCTIONS = [
    { id: 'S-001', name: 'Marco Bellandi Ferrante', aliases: ['Marko Belandi', 'M. B. Ferrante'], dob: '1968-03-14', type: 'person', program: 'Sample programme A (fictional)' },
    { id: 'S-002', name: 'Orlan Vexby', aliases: ['Orlan Veksbi'], dob: '1975-11-02', type: 'person', program: 'Sample programme B (fictional)' },
    { id: 'S-003', name: 'Kestrel Maritime Holdings Ltd', aliases: ['Kestrel Maritime', 'KMH Shipping'], dob: '', type: 'entity', program: 'Sample programme A (fictional)' },
    { id: 'S-004', name: 'Anatol Grimsrud', aliases: [], dob: '1981-06-30', type: 'person', program: 'Sample programme C (fictional)' },
    { id: 'S-005', name: 'Sable Ridge Mining Corp', aliases: ['Sable Ridge Mining'], dob: '', type: 'entity', program: 'Sample programme B (fictional)' },
    { id: 'S-006', name: 'Lucia Montaverde Rios', aliases: ['Lucía Montaverde'], dob: '1972-09-21', type: 'person', program: 'Sample programme C (fictional)' },
    { id: 'S-007', name: 'Tomasz Wilczewski Brandt', aliases: ['Tomas Brandt'], dob: '1964-01-08', type: 'person', program: 'Sample programme A (fictional)' },
    { id: 'S-008', name: 'Northgate Bullion Exchange', aliases: ['Northgate Bullion'], dob: '', type: 'entity', program: 'Sample programme B (fictional)' }
  ];

  // FICTIONAL sample PEP list. Roles refer to invented countries.
  var SAMPLE_PEPS = [
    { id: 'P-001', name: 'Helena Marchetti', aliases: ['Helena Marchetti Rossi'], dob: '1970-04-12', role: 'Minister of Finance, Republic of Valdoria (fictional)' },
    { id: 'P-002', name: 'Jonas Okafor Lindqvist', aliases: [], dob: '1966-08-03', role: 'Central bank governor, Kingdom of Estrava (fictional)' },
    { id: 'P-003', name: 'Rui Albuquerque Sena', aliases: ['Rui Sena'], dob: '1959-12-19', role: 'Supreme court judge, Republic of Valdoria (fictional)' },
    { id: 'P-004', name: 'Mirela Dragan', aliases: [], dob: '1983-02-27', role: 'Spouse of a head of state, Kingdom of Estrava (fictional)' }
  ];

  var THRESHOLDS = { strong: 0.92, potential: 0.82 };

  var TIERS = [
    { id: 'Low', min: 0, max: 24, reviewMonths: 36 },
    { id: 'Medium', min: 25, max: 49, reviewMonths: 24 },
    { id: 'High', min: 50, max: Infinity, reviewMonths: 12 }
  ];

  // ---------------------------------------------------------------------------
  // Identity and access management (POLICY.md section 10A)
  // ---------------------------------------------------------------------------

  var ROLES = {
    analyst: { name: 'Analyst', summary: 'Creates cases, reviews screening hits, approves Low and Medium risk cases if delegated authority has been granted.' },
    senior: { name: 'Senior analyst', summary: 'Everything an analyst can do, plus High risk approvals and senior management approval for PEP and high risk third country cases.' },
    mlro: { name: 'MLRO', summary: 'Decides escalated cases and sanctions matches, manages watchlists, grants delegated authority and resets data.' },
    auditor: { name: 'Internal auditor', summary: 'Read only access to cases, metrics and logs. Cannot change anything (segregation of duties).' }
  };

  // Fictional demo users. Sign in is simulated: there are no passwords in this project.
  var DEMO_USERS = [
    { id: 'u-trainee', name: 'J. Byrne', role: 'analyst', delegatedAuthority: false },
    { id: 'u-analyst', name: 'A. Huttener', role: 'analyst', delegatedAuthority: true },
    { id: 'u-senior', name: 'S. Walsh', role: 'senior', delegatedAuthority: true },
    { id: 'u-mlro', name: 'M. Kelly', role: 'mlro', delegatedAuthority: true },
    { id: 'u-audit', name: 'R. Doyle', role: 'auditor', delegatedAuthority: false }
  ];

  // Returns null when the user may perform the action, otherwise the reason it is denied.
  // Least privilege: anything not explicitly allowed is denied.
  function authorize(action, user, c, extra) {
    if (!user) return 'Sign in first.';
    var r = user.role;
    if (!ROLES[r]) return 'Unknown role.';
    if (r === 'auditor') return 'Internal audit has read only access (segregation of duties).';
    switch (action) {
      case 'create_case':
      case 'rescreen':
      case 'start_review':
      case 'raise_exception':
      case 'close_exception':
        return null;
      case 'decide_exception':
        if (r !== 'senior' && r !== 'mlro') return 'Exceptions are approved by a senior analyst or the MLRO.';
        if (extra && extra.exception && extra.exception.raisedById === user.id) return 'Four eyes rule: the approver must be a different person from the one who raised the exception.';
        return null;
      case 'qa_review':
        if (r !== 'senior' && r !== 'mlro') return 'Quality assurance is done by a senior analyst or the MLRO.';
        if (extra && extra.deciderId && extra.deciderId === user.id) return 'Independence: QA must be done by someone other than the person who decided the case.';
        return null;
      case 'manage_lists':
      case 'manage_users':
      case 'reset_data':
        return r === 'mlro' ? null : 'Only the MLRO can do this.';
      case 'review_hit':
        if (extra && extra.hit && extra.hit.listType === 'Sanctions' && extra.outcome === 'true_match' && r === 'analyst') {
          return 'Confirming a sanctions true match needs a senior analyst or the MLRO.';
        }
        return null;
      case 'approve':
      case 'reject':
      case 'escalate':
      case 'request_info':
        if (!c || !c.assessment) return 'No case selected.';
        var a = c.assessment;
        if (c.status === 'Escalated' && action === 'escalate') return 'The case is already with the MLRO.';
        if (c.status === 'Escalated' && r !== 'mlro') return 'Escalated cases can only be decided by the MLRO.';
        if ((action === 'approve' || action === 'reject') && a.sanctionsBlocked && r !== 'mlro') return 'Only the MLRO can close a case with a sanctions match.';
        if (action === 'approve') {
          if (r === 'analyst' && !user.delegatedAuthority) return 'No delegated approval authority yet. Escalate or ask a senior analyst.';
          if (a.tier === 'High' && r === 'analyst') return 'High risk approvals are above analyst delegated authority.';
          if (a.mandatoryEDD.length && user.id === c.createdById) return 'Four eyes rule: the senior approver must be a different person from the analyst who prepared the case.';
          if (a.mandatoryEDD.length && c.openReview && user.id === c.openReview.startedById) return 'Four eyes rule: the approver must be a different person from the one who carried out the review.';
        }
        if (action === 'reject' && a.tier === 'High' && r === 'analyst') return 'High risk rejections need a senior analyst or the MLRO.';
        return null;
      default:
        return 'Action not permitted.';
    }
  }

  // ---------------------------------------------------------------------------
  // Name matching
  // ---------------------------------------------------------------------------

  var STOP_WORDS = ['ltd', 'limited', 'llc', 'inc', 'corp', 'corporation', 'plc', 'sa', 'gmbh', 'co', 'the', 'and', 'de', 'da', 'do', 'dos', 'das'];

  function stripAccents(s) {
    return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s;
  }

  function tokens(name) {
    return stripAccents(String(name || '').toLowerCase())
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter(function (t) { return t && t.length > 1 && STOP_WORDS.indexOf(t) === -1; });
  }

  function normalize(name) { return tokens(name).join(' '); }
  function sortedKey(name) { return tokens(name).slice().sort().join(' '); }

  function jaro(a, b) {
    if (a === b) return a.length ? 1 : 0;
    if (!a.length || !b.length) return 0;
    var range = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
    var aM = new Array(a.length), bM = new Array(b.length), matches = 0, i, j;
    for (i = 0; i < a.length; i++) {
      var lo = Math.max(0, i - range), hi = Math.min(i + range + 1, b.length);
      for (j = lo; j < hi; j++) {
        if (!bM[j] && a[i] === b[j]) { aM[i] = bM[j] = true; matches++; break; }
      }
    }
    if (!matches) return 0;
    var t = 0, k = 0;
    for (i = 0; i < a.length; i++) {
      if (!aM[i]) continue;
      while (!bM[k]) k++;
      if (a[i] !== b[k]) t++;
      k++;
    }
    return (matches / a.length + matches / b.length + (matches - t / 2) / matches) / 3;
  }

  function jaroWinkler(a, b) {
    var j = jaro(a, b), p = 0;
    for (var i = 0; i < Math.min(4, a.length, b.length) && a[i] === b[i]; i++) p++;
    return j + p * 0.1 * (1 - j);
  }

  // Average best match of each token in the shorter name against the longer name.
  // Handles missing middle names and reordered names.
  function tokenScore(a, b) {
    var ta = tokens(a), tb = tokens(b);
    if (!ta.length || !tb.length) return 0;
    var shortT = ta.length <= tb.length ? ta : tb, longT = shortT === ta ? tb : ta;
    var sum = 0;
    shortT.forEach(function (t) {
      var best = 0;
      longT.forEach(function (u) { best = Math.max(best, jaroWinkler(t, u)); });
      sum += best;
    });
    var coverage = shortT.length / longT.length; // penalise very partial names
    return (sum / shortT.length) * (0.85 + 0.15 * coverage);
  }

  function nameSimilarity(a, b) {
    var na = normalize(a), nb = normalize(b);
    if (!na || !nb) return 0;
    return Math.max(
      jaroWinkler(na, nb),
      jaroWinkler(sortedKey(a), sortedKey(b)),
      tokenScore(a, b)
    );
  }

  // Screen one name (and optional date of birth) against a list.
  // Returns hits at or above the potential threshold, best first.
  function screenName(name, dob, list, listType) {
    var hits = [];
    (list || []).forEach(function (entry) {
      var candidates = [entry.name].concat(entry.aliases || []);
      var best = 0, matchedOn = entry.name;
      candidates.forEach(function (c) {
        var s = nameSimilarity(name, c);
        if (s > best) { best = s; matchedOn = c; }
      });
      if (best < THRESHOLDS.potential) return;
      var dobConflict = !!(dob && entry.dob && dob !== entry.dob);
      var level = best >= THRESHOLDS.strong && !dobConflict ? 'strong' : 'potential';
      hits.push({
        listType: listType,
        entryId: entry.id,
        entryName: entry.name,
        matchedOn: matchedOn,
        score: Math.round(best * 1000) / 1000,
        level: level,
        dobConflict: dobConflict,
        detail: entry.program || entry.role || '',
        review: null // { outcome: 'true_match' | 'false_positive', note, by, at }
      });
    });
    return hits.sort(function (x, y) { return y.score - x.score; });
  }

  // Screen the customer and all UBOs against sanctions and PEP lists.
  function screenCase(c, lists) {
    var subjects = [{ role: 'Customer', name: c.name, dob: c.dob }];
    (c.ubos || []).forEach(function (u) { subjects.push({ role: 'UBO', name: u.name, dob: u.dob }); });
    var hits = [];
    subjects.forEach(function (s) {
      if (!s.name) return;
      screenName(s.name, s.dob, lists.sanctions, 'Sanctions').forEach(function (h) { h.subject = s.role + ': ' + s.name; hits.push(h); });
      screenName(s.name, s.dob, lists.peps, 'PEP').forEach(function (h) { h.subject = s.role + ': ' + s.name; hits.push(h); });
    });
    return hits;
  }

  // ---------------------------------------------------------------------------
  // Risk assessment (POLICY.md section 4)
  // ---------------------------------------------------------------------------

  function find(arr, key, val) { for (var i = 0; i < arr.length; i++) if (arr[i][key] === val) return arr[i]; return null; }

  function assess(c, hits, lists) {
    var factors = [], mandatoryEDD = [], cddIssues = [];
    var hrList = (lists && lists.highRiskCountries) || HIGH_RISK_THIRD_COUNTRIES;
    hits = hits || [];

    function add(label, points, ref) { factors.push({ label: label, points: points, ref: ref }); }

    var ct = find(CUSTOMER_TYPES, 'id', c.customerType) || CUSTOMER_TYPES[0];
    add('Customer type: ' + ct.name, ct.points, 'CJA 2010 s.30B');

    var country = find(COUNTRIES, 'code', c.country);
    if (hrList.indexOf(c.country) !== -1) {
      add('EU high risk third country: ' + (country ? country.name : c.country), 40, 'CJA 2010 s.38A');
      mandatoryEDD.push('Established in an EU high risk third country (s.38A)');
    } else if (country && !country.eea) {
      add('Non EU or EEA country: ' + country.name, 10, 'CJA 2010 s.30B');
    } else {
      add('EU or EEA country' + (country ? ': ' + country.name : ''), 0, 'CJA 2010 s.30B');
    }

    var sector = find(SECTORS, 'id', c.sector);
    if (sector && sector.highRisk) add('High risk sector: ' + sector.name, 15, 'CJA 2010 s.30B, Sch. 4');

    // PEP: self declared, or a list hit the analyst confirmed as a true match.
    var pepConfirmed = hits.some(function (h) { return h.listType === 'PEP' && h.review && h.review.outcome === 'true_match'; });
    if (c.pepDeclared || pepConfirmed) {
      add('Politically exposed person' + (c.pepDeclared ? ' (self declared)' : ' (list match confirmed)'), 30, 'CJA 2010 s.37');
      mandatoryEDD.push('Customer or UBO is a PEP (s.37): senior management approval required');
    }

    if (c.customerType === 'company' || c.customerType === 'trust') {
      var ubos = (c.ubos || []).filter(function (u) { return u.name; });
      if (!ubos.length) {
        add('No beneficial owner identified', 25, 'CJA 2010 s.33');
        cddIssues.push('No beneficial owner identified for a corporate customer (s.33)');
      }
    }

    var vol = Number(c.monthlyVolume) || 0;
    if (vol > 250000) add('Expected monthly volume above EUR 250,000', 20, 'CJA 2010 s.30B');
    else if (vol > 50000) add('Expected monthly volume above EUR 50,000', 10, 'CJA 2010 s.30B');

    if (!c.sourceOfFunds || !String(c.sourceOfFunds).trim()) add('Source of funds not provided', 10, 'CJA 2010 s.35');
    if (c.adverseMedia) add('Adverse media linked to financial crime', 20, 'CJA 2010 s.39');

    if (!c.idVerified) cddIssues.push('Identity not verified against a reliable independent source (s.33)');
    // During a review the document is checked against the review date, not the onboarding date.
    var asOf = String(c.reviewAsOf || c.createdAt || '').slice(0, 10);
    if (c.idExpiry && asOf && c.idExpiry < asOf) cddIssues.push('Identity document expired (s.33)');
    // Business verification: only evaluated when the field was captured (older cases have no value).
    if (c.registryVerified === false && c.customerType !== 'individual') cddIssues.push('Business registration not verified against the official register (s.33)');

    var score = factors.reduce(function (s, f) { return s + f.points; }, 0);
    var tier = TIERS.filter(function (t) { return score >= t.min && score <= t.max; })[0].id;
    if (mandatoryEDD.length) tier = 'High';

    var sanctionsStrong = hits.some(function (h) { return h.listType === 'Sanctions' && (h.level === 'strong' || (h.review && h.review.outcome === 'true_match')); });
    var pendingHits = hits.filter(function (h) { return !h.review && !(h.listType === 'Sanctions' && h.level === 'strong'); });

    return {
      score: score,
      tier: tier,
      factors: factors,
      mandatoryEDD: mandatoryEDD,
      eddRequired: tier === 'High',
      cddIssues: cddIssues,
      cddComplete: cddIssues.length === 0,
      sanctionsBlocked: sanctionsStrong,
      pendingHits: pendingHits.length,
      reviewMonths: find(TIERS, 'id', tier).reviewMonths
    };
  }

  // ---------------------------------------------------------------------------
  // Recommendation and allowed decisions (POLICY.md section 9)
  // ---------------------------------------------------------------------------

  function recommend(a) {
    if (a.sanctionsBlocked) {
      return { code: 'BLOCK', text: 'Blocked: sanctions match. Do not onboard, freeze funds and escalate to the MLRO.', allowed: ['reject', 'escalate'] };
    }
    if (a.pendingHits > 0) {
      return { code: 'REVIEW_HITS', text: 'Screening hits need review. Mark each hit as a true match or a false positive before deciding.', allowed: ['escalate', 'request_info'] };
    }
    if (!a.cddComplete) {
      return { code: 'CDD_INCOMPLETE', text: 'CDD incomplete. The relationship cannot be established until identity and ownership are verified (s.33).', allowed: ['request_info', 'reject'] };
    }
    if (a.eddRequired) {
      return { code: 'EDD', text: 'High risk: apply enhanced due diligence. Approval needs EDD completion by a senior analyst or the MLRO' + (a.mandatoryEDD.length ? ', who must be a different person from the case preparer (senior management approval, four eyes).' : '.'), allowed: ['approve', 'reject', 'escalate', 'request_info'] };
    }
    return { code: 'STANDARD', text: a.tier + ' risk: standard CDD. Analyst may approve under delegated authority.', allowed: ['approve', 'reject', 'escalate', 'request_info'] };
  }

  // Validate a decision against policy. Returns an error message or null.
  function validateDecision(decision, a, opts) {
    opts = opts || {};
    var rec = recommend(a);
    if (rec.allowed.indexOf(decision) === -1) return 'Decision not allowed by policy for this case: ' + rec.text;
    if (!opts.rationale || opts.rationale.trim().length < 15) return 'A written rationale of at least 15 characters is required.';
    if (decision === 'approve' && a.eddRequired && !opts.eddCompleted) return 'Confirm that EDD has been completed (source of wealth and funds) before approving a High risk case.';
    return null;
  }

  // ---------------------------------------------------------------------------
  // Sanctions CSV import (real EU consolidated list or any CSV with a name column)
  // ---------------------------------------------------------------------------

  function parseCSVLine(line, sep) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  function parseSanctionsCSV(text) {
    var lines = String(text || '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (lines.length < 2) throw new Error('The file has no data rows.');
    var sep = (lines[0].split(';').length > lines[0].split(',').length) ? ';' : ',';
    var head = parseCSVLine(lines[0], sep).map(function (h) { return h.toLowerCase().trim(); });
    function col(re) { for (var i = 0; i < head.length; i++) if (re.test(head[i])) return i; return -1; }
    var nameIdx = col(/wholename|whole_name|^name$|full ?name|naal_wholename/);
    if (nameIdx === -1) nameIdx = col(/name/);
    if (nameIdx === -1) throw new Error('No name column found. Expected a header such as "NameAlias_WholeName" or "name".');
    var idIdx = col(/logicalid|^id$|entity_id|reference/);
    var dobIdx = col(/birthdate_birthdate|^birthdate$|dob|date of birth/);
    var typeIdx = col(/subjecttype|^type$/);

    var byId = {}, order = [];
    for (var r = 1; r < lines.length; r++) {
      var cells = parseCSVLine(lines[r], sep);
      var name = (cells[nameIdx] || '').trim();
      if (!name) continue;
      var id = idIdx !== -1 && cells[idIdx] ? 'EU-' + cells[idIdx].trim() : 'CSV-' + r;
      if (!byId[id]) {
        byId[id] = { id: id, name: name, aliases: [], dob: '', type: '', program: 'Imported list' };
        order.push(id);
      } else if (byId[id].name !== name && byId[id].aliases.indexOf(name) === -1) {
        byId[id].aliases.push(name);
      }
      if (dobIdx !== -1 && cells[dobIdx] && /^\d{4}-\d{2}-\d{2}$/.test(cells[dobIdx].trim())) byId[id].dob = cells[dobIdx].trim();
      if (typeIdx !== -1 && cells[typeIdx]) byId[id].type = cells[typeIdx].trim();
    }
    return order.map(function (k) { return byId[k]; });
  }

  // ---------------------------------------------------------------------------
  // Metrics (POLICY.md section 13)
  // ---------------------------------------------------------------------------

  function metrics(cases) {
    var m = {
      total: cases.length,
      byStatus: { 'Pending review': 0, 'Info requested': 0, 'Escalated': 0, 'Approved': 0, 'Rejected': 0 },
      byTier: { Low: 0, Medium: 0, High: 0 },
      eddCases: 0, cddIncomplete: 0, escalated: 0,
      hits: 0, sanctionsHits: 0, pepHits: 0, reviewedHits: 0, falsePositives: 0, trueMatches: 0,
      decided: 0, avgHoursToDecision: 0
    };
    var totalHours = 0;
    cases.forEach(function (c) {
      m.byStatus[c.status] = (m.byStatus[c.status] || 0) + 1;
      m.byTier[c.assessment.tier]++;
      if (c.assessment.eddRequired) m.eddCases++;
      if (!c.assessment.cddComplete) m.cddIncomplete++;
      if (c.status === 'Escalated' || (c.audit || []).some(function (e) { return e.type === 'escalate'; })) m.escalated++;
      (c.hits || []).forEach(function (h) {
        m.hits++;
        if (h.listType === 'Sanctions') m.sanctionsHits++; else m.pepHits++;
        if (h.review) {
          m.reviewedHits++;
          if (h.review.outcome === 'false_positive') m.falsePositives++; else m.trueMatches++;
        }
      });
      if (c.decidedAt) {
        m.decided++;
        totalHours += (new Date(c.decidedAt) - new Date(c.createdAt)) / 36e5;
      }
    });
    m.avgHoursToDecision = m.decided ? Math.round((totalHours / m.decided) * 10) / 10 : 0;
    m.falsePositiveRate = m.reviewedHits ? Math.round((m.falsePositives / m.reviewedHits) * 1000) / 10 : 0;
    m.eddRate = m.total ? Math.round((m.eddCases / m.total) * 1000) / 10 : 0;
    m.escalationRate = m.total ? Math.round((m.escalated / m.total) * 1000) / 10 : 0;
    return m;
  }

  // ---------------------------------------------------------------------------
  // Identity documents and business registers (POLICY.md section 5)
  // ---------------------------------------------------------------------------

  var ID_DOC_TYPES = [
    { id: 'passport', name: 'Passport' },
    { id: 'national_id', name: 'National ID card (e.g. Cartão de Cidadão, RG)' },
    { id: 'residence_permit', name: 'Residence permit (e.g. IRP card)' },
    { id: 'driving_licence', name: 'Driving licence' }
  ];

  var REGISTRIES = [
    { id: 'cro', name: 'CRO, Companies Registration Office (Ireland)' },
    { id: 'rbo', name: 'RBO, Register of Beneficial Ownership (Ireland)' },
    { id: 'certidao', name: 'Certidão Permanente, Registo Comercial (Portugal)' },
    { id: 'cnpj', name: 'CNPJ, Receita Federal (Brazil)' },
    { id: 'other', name: 'Other official register' }
  ];

  // ---------------------------------------------------------------------------
  // Ongoing monitoring: periodic and event driven reviews (POLICY.md section 12)
  // ---------------------------------------------------------------------------

  var REVIEW_DUE_SOON_DAYS = 30;
  var REVIEW_TRIGGERS = [
    { id: 'periodic', name: 'Periodic review (scheduled by risk tier)' },
    { id: 'ownership', name: 'Change of beneficial ownership or control' },
    { id: 'activity', name: 'Activity inconsistent with the expected profile' },
    { id: 'country', name: 'Change of country of residence or establishment' },
    { id: 'id_expired', name: 'Identity document expired' },
    { id: 'adverse_media', name: 'New adverse media' },
    { id: 'pep', name: 'Change in PEP status' },
    { id: 'sanctions_update', name: 'Sanctions list update' }
  ];

  function dayDiff(from, to) { return Math.floor((new Date(to) - new Date(from)) / 864e5); }

  // Calendar day in the user's own time zone (a date picker gives local dates, not UTC ones).
  function localDay(iso) {
    var d = new Date(iso), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function isRealDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
  }
  function calendarDays(fromDay, toDay) { return Math.round((new Date(toDay + 'T00:00:00Z') - new Date(fromDay + 'T00:00:00Z')) / 864e5); }

  // Review position of a case at a given time. Null when the case is not an active relationship.
  function reviewState(c, now) {
    now = now || new Date().toISOString();
    if (c.openReview) return { state: 'In progress', days: dayDiff(c.openReview.startedAt, now) };
    if (c.status !== 'Approved' || !c.nextReview) return null;
    var diff = (new Date(c.nextReview) - new Date(now)) / 864e5;
    var d = diff < 0 ? Math.floor(diff) : Math.ceil(diff);
    return { state: diff < 0 ? 'Overdue' : (d <= REVIEW_DUE_SOON_DAYS ? 'Due soon' : 'Scheduled'), days: d };
  }

  // ---------------------------------------------------------------------------
  // Exceptions register (POLICY.md section 12A)
  // ---------------------------------------------------------------------------

  var EXCEPTION_MAX_DAYS = 90;
  var EXCEPTION_TYPES = [
    { id: 'doc_renewal', name: 'Expired document, renewal requested' },
    { id: 'old_proof', name: 'Proof of address older than policy allows' },
    { id: 'review_overdue', name: 'Periodic review overdue' },
    { id: 'late_info', name: 'Information request past the deadline' },
    { id: 'other', name: 'Other documented policy deviation' }
  ];

  // An exception documents a deviation, its mitigation and a deadline. It never overrides the
  // fail closed rules: incomplete CDD or an open sanctions hit still block approval.
  function validateException(x, now) {
    now = now || new Date().toISOString();
    if (!x || !find(EXCEPTION_TYPES, 'id', x.type)) return 'Choose the type of exception.';
    if (!x.description || x.description.trim().length < 15) return 'Describe the deviation (at least 15 characters).';
    if (!x.mitigation || x.mitigation.trim().length < 10) return 'Record the mitigating control (at least 10 characters).';
    if (!isRealDate(x.expiresOn)) return 'Set the date by which the exception must be resolved.';
    var days = calendarDays(localDay(now), x.expiresOn);
    if (days < 1) return 'The resolution date must be in the future.';
    if (days > EXCEPTION_MAX_DAYS) return 'Exceptions can last at most ' + EXCEPTION_MAX_DAYS + ' days. Escalate to the MLRO for anything longer.';
    return null;
  }

  function exceptionState(x, now) {
    var today = localDay(now || new Date().toISOString());
    if (x.status === 'Approved' && x.expiresOn < today) return 'Overdue';
    return x.status;
  }

  // ---------------------------------------------------------------------------
  // Quality assurance (POLICY.md section 12B)
  // ---------------------------------------------------------------------------

  var QA_CHECKS = [
    { id: 'id', name: 'Identity and business verification evidenced' },
    { id: 'screening', name: 'Screening hits reviewed with a recorded reason' },
    { id: 'risk', name: 'Risk rating consistent with the customer profile' },
    { id: 'edd', name: 'EDD evidence adequate (High risk only)' },
    { id: 'authority', name: 'Decision within delegated authority and policy' },
    { id: 'rationale', name: 'Rationale clear and supported by evidence' }
  ];
  var QA_SAMPLE_EVERY = 4; // 1 in 4 Low and Medium risk decisions, plus every High risk decision

  function isDecided(c) { return c.status === 'Approved' || c.status === 'Rejected'; }

  // Deterministic sample, so the same case is always in or out of the sample.
  function qaSelected(c) {
    if (!isDecided(c)) return false;
    if (c.assessment && c.assessment.tier === 'High') return true;
    var n = Number(String(c.id || '').replace(/\D/g, '')) || 0;
    return n % QA_SAMPLE_EVERY === 0;
  }

  // The user who took the final approve or reject decision.
  function decider(c) {
    var a = (c.audit || []).filter(function (e) { return e.type === 'approve' || e.type === 'reject'; });
    return a.length ? { id: a[a.length - 1].userId, label: a[a.length - 1].by } : null;
  }

  function validateQA(results, note, c) {
    var high = c && c.assessment && c.assessment.tier === 'High';
    for (var i = 0; i < QA_CHECKS.length; i++) {
      var v = results && results[QA_CHECKS[i].id];
      if (['pass', 'fail', 'na'].indexOf(v) === -1) return 'Answer every check: ' + QA_CHECKS[i].name + '.';
      if (QA_CHECKS[i].id === 'edd' && high && v === 'na') return 'EDD cannot be marked not applicable on a High risk case.';
    }
    var failed = QA_CHECKS.filter(function (q) { return results[q.id] === 'fail'; });
    if (failed.length && (!note || note.trim().length < 15)) return 'Describe the errors found (at least 15 characters) so the analyst can correct them.';
    return null;
  }

  function scoreQA(results) {
    var failed = QA_CHECKS.filter(function (q) { return results[q.id] === 'fail'; }).map(function (q) { return q.id; });
    return { outcome: failed.length ? 'Fail' : 'Pass', failed: failed };
  }

  // ---------------------------------------------------------------------------
  // Operational metrics: monitoring, exceptions, quality and service levels (section 13)
  // ---------------------------------------------------------------------------

  var SLA_HOURS = 48;

  function opsMetrics(cases, exceptions, now) {
    now = now || new Date().toISOString();
    var m = {
      reviewsOverdue: 0, reviewsDueSoon: 0, reviewsInProgress: 0, reviewsCompleted: 0,
      exceptionsOpen: 0, exceptionsOverdue: 0, exceptionsPending: 0,
      qaSampled: 0, qaDone: 0, qaPassed: 0, qaPassRate: 0, qaErrors: {},
      openCases: 0, slaBreaches: 0, ageing: { 'Under 1 day': 0, '1 to 2 days': 0, '3 to 5 days': 0, 'Over 5 days': 0 },
      byAnalyst: []
    };
    QA_CHECKS.forEach(function (q) { m.qaErrors[q.id] = 0; });
    var analysts = {};
    function analyst(id, label) { if (!analysts[id]) analysts[id] = { userId: id, name: label, decisions: 0, qaDone: 0, qaPassed: 0 }; return analysts[id]; }

    cases.forEach(function (c) {
      var rs = reviewState(c, now);
      if (rs) {
        if (rs.state === 'Overdue') m.reviewsOverdue++;
        else if (rs.state === 'Due soon') m.reviewsDueSoon++;
        else if (rs.state === 'In progress') m.reviewsInProgress++;
      }
      m.reviewsCompleted += (c.reviews || []).length;

      if (c.status === 'Pending review' || c.status === 'Info requested' || c.status === 'Escalated') {
        m.openCases++;
        var since = c.openReview ? c.openReview.startedAt : c.createdAt;
        var h = (new Date(now) - new Date(since)) / 36e5;
        if (h > SLA_HOURS) m.slaBreaches++;
        var bucket = h < 24 ? 'Under 1 day' : h < 72 ? '1 to 2 days' : h < 144 ? '3 to 5 days' : 'Over 5 days';
        m.ageing[bucket]++;
      }

      var d = decider(c);
      if (d && d.id) analyst(d.id, d.label).decisions++;
      if (qaSelected(c)) m.qaSampled++;
      // Current QA result plus earlier ones moved to the history when a review reopened the case.
      (c.qaHistory || []).concat(c.qa ? [c.qa] : []).forEach(function (q) {
        m.qaDone++;
        if (q.outcome === 'Pass') m.qaPassed++;
        (q.failed || []).forEach(function (f) { m.qaErrors[f] = (m.qaErrors[f] || 0) + 1; });
        var who = q.deciderId ? { id: q.deciderId, label: q.decidedBy } : d;
        if (who && who.id) { var an = analyst(who.id, who.label); an.qaDone++; if (q.outcome === 'Pass') an.qaPassed++; }
      });
    });

    (exceptions || []).forEach(function (x) {
      var st = exceptionState(x, now);
      if (st === 'Pending approval') m.exceptionsPending++;
      if (st === 'Pending approval' || st === 'Approved' || st === 'Overdue') m.exceptionsOpen++;
      if (st === 'Overdue') m.exceptionsOverdue++;
    });

    m.qaPassRate = m.qaDone ? Math.round((m.qaPassed / m.qaDone) * 1000) / 10 : 0;
    m.byAnalyst = Object.keys(analysts).map(function (k) {
      var a = analysts[k];
      a.qaPassRate = a.qaDone ? Math.round((a.qaPassed / a.qaDone) * 1000) / 10 : null;
      return a;
    }).sort(function (x, y) { return y.decisions - x.decisions; });
    return m;
  }

  var api = {
    COUNTRIES: COUNTRIES, HIGH_RISK_THIRD_COUNTRIES: HIGH_RISK_THIRD_COUNTRIES, SECTORS: SECTORS,
    CUSTOMER_TYPES: CUSTOMER_TYPES, SAMPLE_SANCTIONS: SAMPLE_SANCTIONS, SAMPLE_PEPS: SAMPLE_PEPS,
    THRESHOLDS: THRESHOLDS, TIERS: TIERS, ROLES: ROLES, DEMO_USERS: DEMO_USERS, authorize: authorize,
    normalize: normalize, jaroWinkler: jaroWinkler, nameSimilarity: nameSimilarity,
    screenName: screenName, screenCase: screenCase, assess: assess, recommend: recommend,
    validateDecision: validateDecision, parseSanctionsCSV: parseSanctionsCSV, metrics: metrics,
    ID_DOC_TYPES: ID_DOC_TYPES, REGISTRIES: REGISTRIES,
    REVIEW_TRIGGERS: REVIEW_TRIGGERS, REVIEW_DUE_SOON_DAYS: REVIEW_DUE_SOON_DAYS, reviewState: reviewState,
    EXCEPTION_TYPES: EXCEPTION_TYPES, EXCEPTION_MAX_DAYS: EXCEPTION_MAX_DAYS, validateException: validateException, exceptionState: exceptionState,
    QA_CHECKS: QA_CHECKS, QA_SAMPLE_EVERY: QA_SAMPLE_EVERY, qaSelected: qaSelected, decider: decider, validateQA: validateQA, scoreQA: scoreQA,
    SLA_HOURS: SLA_HOURS, opsMetrics: opsMetrics
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.KYC = api;
})(this);
