/*
 * TailorScan engine: compares a resume against a job description.
 * Runs entirely client-side (and in Node for tests). No network calls.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TailorScan = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var STOP = new Set(('a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves ' +
    'able ability across also among etc including include includes within without well using use used via per new strong excellent great good proven solid deep high highly ' +
    'experience experienced years year work working works team teams role roles company companies candidate candidates position job opportunity opportunities ' +
    'responsibilities responsible requirements required qualifications preferred plus bonus ideal ideally must need needs needed looking join help helping make making ' +
    'like least minimum knowledge understanding familiarity familiar skills skill demonstrated track record environment based related relevant equivalent field degree ' +
    'day days time full part across ensure drive drives driving build building support supporting manage managing lead leading partner partnering own owning ' +
    'business businesses customers customer clients client people world best every want way ways get take things thing one two three four five may might us').split(/\s+/));

  var WEAK_PHRASES = ['responsible for', 'duties included', 'duties include', 'helped with', 'helped to', 'worked on', 'assisted with', 'assisted in', 'tasked with', 'involved in', 'in charge of', 'participated in'];
  var CLICHES = ['team player', 'hard-working', 'hardworking', 'go-getter', 'results-driven', 'results-oriented', 'think outside the box', 'synergy', 'self-motivated', 'dynamic individual', 'passionate about', 'detail-oriented professional', 'proven track record', 'excellent communication skills', 'works well under pressure', 'motivated professional'];
  var ACTION_VERBS = new Set(('accelerated achieved acquired activated advised analyzed architected automated boosted built captured championed closed coached consolidated converted created cut decreased defined delivered deployed designed developed directed doubled drove eliminated enabled engineered established exceeded executed expanded generated grew headed identified implemented improved increased influenced initiated launched led managed mentored migrated modernized negotiated optimized orchestrated organized overhauled owned partnered pioneered planned produced programmed raised rebuilt redesigned reduced refactored reorganized resolved restructured revamped saved scaled secured shipped simplified spearheaded standardized streamlined strengthened structured supervised tested tripled transformed unified won wrote').split(' '));

  var SECTION_RE = {
    skip: /(about (us|the company|the team|our company)|benefits|perks|what we offer|why (join|work)|compensation|salary|pay range|equal (employment )?opportunity|\beeo\b|our (values|mission|story|culture)|who we are|life at|the company|location|working at|how to apply|our commitment)/i,
    preferred: /(preferred|nice[- ]to[- ]have|bonus|pluses|desired|ideal(ly)?|extra credit|stand out)/i,
    required: /(requirements|qualifications|what you('ll)? (need|bring)|must[- ]haves?|you (have|bring|are)|who you are|basic|minimum|required|what we('re)? look(ing)? for|skills|about you|your background|experience)/i,
    duties: /(responsibilit|what you('ll)? (do|own|work on)|the role|duties|day[- ]to[- ]day|in this role|your impact|the opportunity|what you will|key accountabilities|you will)/i
  };
  var BOILERPLATE = /(equal (employment )?opportunity|regardless of|race, colou?r|veteran status|sexual orientation|gender identity|disabilit|accommodation|401\(?k|paid time off|\bpto\b|parental leave|dental|vision (insurance|coverage)|health insurance|medical, dental|salary range|pay range|base (salary|pay)|compensation (range|package)|e-verify|background check|pay transparency|stock options|equity package|wellness stipend|commuter|unlimited vacation|applicants? (will|must)|privacy (policy|notice)|recruitment fraud|by applying)/i;

  function normalize(s) {
    return String(s || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[‘’‛′]/g, "'")
      .replace(/[“”″]/g, '"')
      .replace(/[‐-―−]/g, '-')
      .replace(/[•●▪■‣⁃∙·➢►▸–]/g, '•')
      .replace(/ /g, ' ')
      .normalize('NFKD').replace(/[̀-ͯ]/g, '');
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&'); }

  function buildMatchers(skills) {
    var out = [];
    ['hard', 'soft', 'cert'].forEach(function (cat) {
      (skills[cat] || []).forEach(function (entry) {
        var parts = entry.split('|');
        var canonical = parts[0].replace(/^=/, '');
        var seen = {};
        parts.forEach(function (p) {
          var cs = p.charAt(0) === '=';
          var alias = cs ? p.slice(1) : p.toLowerCase();
          if (!alias || seen[alias + cs]) return;
          seen[alias + cs] = 1;
          var body = escapeRe(alias).replace(/ +/g, '[\\s\\-]+');
          var re = cs
            ? new RegExp('(?<![A-Za-z0-9&+#\\-])' + body + '(?![A-Za-z0-9&+#\\-])', 'g')
            : new RegExp('(?<![a-z0-9])' + body + '(?![a-z0-9+#])', 'g');
          out.push({ skill: canonical, cat: cat, alias: alias, cs: cs, re: re });
        });
      });
    });
    out.sort(function (a, b) { return b.alias.length - a.alias.length; });
    return out;
  }

  // Finds taxonomy skills in text. Longer aliases claim their span first so
  // "customer segmentation" is not also counted as a bare "segmentation".
  function findSkills(text, matchers) {
    var orig = normalize(text);
    var lower = orig.toLowerCase();
    if (lower.length !== orig.length) orig = lower;
    var used = new Uint8Array(lower.length);
    var found = {};
    for (var i = 0; i < matchers.length; i++) {
      var m = matchers[i];
      var hay = m.cs ? orig : lower;
      m.re.lastIndex = 0;
      var r;
      while ((r = m.re.exec(hay)) !== null) {
        var s = r.index, e = s + r[0].length, clash = false;
        for (var k = s; k < e; k++) if (used[k]) { clash = true; break; }
        if (clash) continue;
        for (k = s; k < e; k++) used[k] = 1;
        var f = found[m.skill] || (found[m.skill] = { skill: m.skill, cat: m.cat, count: 0, aliases: {} });
        f.count++;
        f.aliases[r[0]] = 1;
      }
    }
    return { found: found, used: used, lower: lower };
  }

  // Returns a weight if the line looks like a section heading, else null.
  // Any heading resets the weight, so one skipped section never swallows the rest.
  function classifyHeading(line) {
    var raw = line.trim();
    if (/^[\u2022*\-\u25E6>]|^\d+[.)]\s/.test(raw)) return null; // bullets are content
    var t = raw.replace(/^#+\s*/, '').replace(/[:*]+/g, ' ').trim();
    if (!t || t.length > 70 || /[.!?,;]$/.test(raw)) return null;
    var words = t.split(/\s+/);
    if (words.length > 8) return null;
    var caps = words.filter(function (w) { return /^[A-Z0-9&]/.test(w); }).length;
    var headingLike = /:$/.test(raw) || /^#/.test(raw) || caps >= Math.ceil(words.length * 0.6) || words.length <= 3;
    if (!headingLike) return null;
    function at(re) { var m = re.exec(t); return !!m && m.index <= 14; }
    if (/^about (the )?(role|job|position|opportunity|you)\b/i.test(t)) return 2;
    if (at(SECTION_RE.skip)) return 0;
    if (at(SECTION_RE.preferred)) return 1.5;
    if (at(SECTION_RE.duties)) return 2;
    if (at(SECTION_RE.required)) return 3;
    if (/^about\b|\b(mission|culture|values)\b/i.test(t)) return 0.5;
    return 2;
  }

  // Splits a JD into weighted lines: requirements count most, boilerplate not at all.
  function weighJD(jd) {
    var lines = normalize(jd).split(/\n|(?<=[.;])\s+(?=[A-Z])/);
    var weight = 2, out = [];
    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      var h = classifyHeading(line);
      if (h !== null) { weight = h; return; }
      if (BOILERPLATE.test(line)) return;
      var w = weight;
      if (w > 0 && /(preferred|nice[- ]to[- ]have|\bbonus\b|a plus\b|is a plus|are a plus|desirable|ideally)/i.test(line)) w = Math.min(w, 1.5);
      if (w > 0 && /(required|must have|must be|minimum of|at least)/i.test(line)) w = 3;
      out.push({ text: line, weight: w });
    });
    return out;
  }

  function stem(w) {
    if (w.length > 4 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 4 && /(sses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
    return w;
  }

  function tokens(s) {
    return s.toLowerCase().replace(/[^a-z0-9+#.\/ -]/g, ' ').split(/[\s\/]+/)
      .map(function (w) { return w.replace(/^[.\-]+|[.\-]+$/g, ''); })
      .filter(Boolean);
  }

  // Repeated JD phrases that are not in the taxonomy (domain words, product names, etc.).
  function otherTerms(weighted, matchers, limit) {
    var counts = {}, display = {};
    weighted.forEach(function (l) {
      if (l.weight <= 0) return;
      var masked = findSkills(l.text, matchers);
      // Tokenize each unmasked segment separately so bigrams never bridge a known skill.
      var segs = [], cur = '';
      for (var i = 0; i < masked.lower.length; i++) {
        if (masked.used[i]) { if (cur) { segs.push(cur); cur = ''; } }
        else cur += masked.lower[i];
      }
      if (cur) segs.push(cur);
      segs.forEach(function (seg) { countSeg(tokens(seg), l.weight); });
    });
    function countSeg(toks, weight) {
      var l = { weight: weight };
      for (var j = 0; j < toks.length; j++) {
        var a = toks[j];
        var good = a.length > 2 && !STOP.has(a) && !/^\d+[a-z%+]*$/.test(a);
        if (good) {
          var ka = stem(a);
          counts[ka] = (counts[ka] || 0) + l.weight;
          display[ka] = display[ka] || a;
        }
        var b = toks[j + 1];
        if (good && b && b.length > 2 && !STOP.has(b) && !/^\d/.test(b)) {
          var kb = stem(a) + ' ' + stem(b);
          counts[kb] = (counts[kb] || 0) + l.weight * 1.6;
          display[kb] = display[kb] || (a + ' ' + b);
        }
      }
    }
    var keys = Object.keys(counts).filter(function (k) { return counts[k] >= 4; });
    keys.sort(function (x, y) { return counts[y] - counts[x]; });
    var picked = [];
    for (var i = 0; i < keys.length && picked.length < limit; i++) {
      var k = keys[i];
      // Skip single words already covered by a picked phrase.
      if (k.indexOf(' ') < 0 && picked.some(function (p) { return p.key.split(' ').indexOf(k) >= 0; })) continue;
      picked.push({ key: k, term: display[k], weight: counts[k] });
    }
    return picked;
  }

  function hasTerm(resumeStems, key) {
    var parts = key.split(' ');
    if (parts.length === 1) return resumeStems.set.has(parts[0]);
    return resumeStems.joined.indexOf(' ' + key + ' ') >= 0;
  }

  function stemIndex(text) {
    var st = tokens(normalize(text)).map(stem);
    return { set: new Set(st), joined: ' ' + st.join(' ') + ' ' };
  }

  var SENIORITY = /\b(senior|sr\.?|junior|jr\.?|lead|principal|staff|head of|director of|associate|assistant|intern|i{1,3}|iv|entry[- ]level|mid[- ]level)\b/gi;

  var ROLE_WORD = /\b(manager|director|head|lead|engineer|developer|analyst|scientist|designer|specialist|coordinator|associate|executive|representative|consultant|architect|administrator|officer|president|vp|strategist|marketer|writer|editor|accountant|recruiter|nurse|technician|planner|partner|owner|advisor|producer|intern)\b/i;
  function detectTitle(jd) {
    var lines = normalize(jd).split('\n').map(function (l) { return l.replace(/^#+\s*/, '').trim(); }).filter(Boolean);
    for (var i = 0; i < Math.min(lines.length, 6); i++) {
      var l = lines[i].replace(/^(job title|title|position|role)\s*[:\-]\s*/i, '');
      var pieces = l.split(/\s+[|\u2022\u2013]\s+|\s+-\s+|\s+at\s+/);
      for (var j = 0; j < pieces.length; j++) {
        var p = pieces[j].replace(/\s*[\(\[].*$/, '').trim();
        if (p.length >= 4 && p.length <= 70 && ROLE_WORD.test(p) && !/[.!?]$/.test(p) && p.split(/\s+/).length <= 8) return p;
      }
    }
    return '';
  }

  function titleMatch(title, resume) {
    if (!title) return null;
    var r = ' ' + normalize(resume).toLowerCase().replace(/[^a-z0-9& ]/g, ' ').replace(/\s+/g, ' ') + ' ';
    var t = title.toLowerCase().replace(/[^a-z0-9& ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return null;
    if (r.indexOf(' ' + t + ' ') >= 0) return { level: 1, core: t };
    var core = t.replace(SENIORITY, ' ').replace(/\s+/g, ' ').trim();
    if (core && r.indexOf(' ' + core + ' ') >= 0) return { level: 0.75, core: core };
    var words = core.split(' ').filter(function (w) { return w.length > 2 && !STOP.has(w); });
    var hit = words.filter(function (w) { return r.indexOf(' ' + w) >= 0; }).length;
    return { level: words.length ? 0.5 * hit / words.length : 0, core: core };
  }

  function yearsRequired(jd) {
    var best = 0;
    weighJD(jd).forEach(function (l) {
      if (l.weight <= 0 || !/experience|background|track record/i.test(l.text)) return;
      var m, re = /(\d{1,2})\s*\+?\s*(?:-|to)?\s*(\d{1,2})?\s*\+?\s*years?/gi;
      while ((m = re.exec(l.text)) !== null) {
        var n = parseInt(m[1], 10);
        if (n > 0 && n <= 15) best = Math.max(best, n);
      }
    });
    return best || null;
  }

  function yearsOnResume(resume, now) {
    var t = normalize(resume);
    var years = [], re = /\b(19[7-9]\d|20[0-4]\d)\b/g, m;
    while ((m = re.exec(t)) !== null) years.push(parseInt(m[1], 10));
    var cur = (now || new Date()).getFullYear();
    if (/\b(present|current|now|today)\b/i.test(t)) years.push(cur);
    years = years.filter(function (y) { return y <= cur; });
    if (years.length < 2) return null;
    // Ignore an isolated graduation year far before the first job by trimming the earliest outlier.
    years.sort(function (a, b) { return a - b; });
    var span = years[years.length - 1] - years[0];
    if (years.length > 3 && years[1] - years[0] > 4) span = years[years.length - 1] - years[1];
    return span;
  }

  var DEGREES = [
    { key: 'phd', label: 'PhD', re: /(?<![a-z])(ph\.?d|doctorate|doctoral)(?![a-z])/i, rank: 4 },
    { key: 'master', label: "Master's or MBA", re: /(?<![a-z])(master'?s|m\.s\.|m\.a\.|msc|mba|master of)(?![a-z])/i, rank: 3 },
    { key: 'bachelor', label: "Bachelor's", re: /(?<![a-z])(bachelor'?s|b\.s\.|b\.a\.|bsc|ba\/bs|bs\/ba|bachelor of|undergraduate degree|4[- ]year degree|b\.?sc?\.?,|b\.?a\.?,)(?![a-z])/i, rank: 2 }
  ];
  function degreeLevel(text) {
    var t = normalize(text);
    for (var i = 0; i < DEGREES.length; i++) if (DEGREES[i].re.test(t)) return DEGREES[i];
    return null;
  }

  function hygiene(resume) {
    var t = normalize(resume);
    var lower = t.toLowerCase();
    var words = (t.match(/[A-Za-z][A-Za-z'\-]*/g) || []).length;
    var lines = t.split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
    var bullets = lines.filter(function (l) { return /^[•*\-◦o>]\s+/.test(l) || (l.length > 50 && /^[A-Z][a-z]+ed\b/.test(l)); });
    if (bullets.length < 3) bullets = lines.filter(function (l) { return l.length > 60; });
    var quantified = bullets.filter(function (l) { return /(\d[\d,.]*\s*(%|x\b|k\b|m\b|mm\b|percent|pts|points|hrs|hours|days|weeks)|[$£€]\s*\d|\b\d{2,}[\d,]*\b)/i.test(l); }).length;
    var starts = bullets.map(function (l) { return (l.replace(/^[•*\-◦o>]\s+/, '').split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z]/g, ''); });
    var actionStarts = starts.filter(function (w) { return ACTION_VERBS.has(w); }).length;

    function countPhrases(list) {
      var hits = [];
      list.forEach(function (p) {
        var re = new RegExp('(?<![a-z])' + escapeRe(p) + '(?![a-z])', 'g');
        var n = (lower.match(re) || []).length;
        if (n) hits.push({ phrase: p, count: n });
      });
      return hits;
    }
    var weak = countPhrases(WEAK_PHRASES);
    var cliches = countPhrases(CLICHES);
    var pronouns = (t.match(/(^|[\s(])(I|my|me|I'm|I've)(?=[\s,.)])/g) || []).length;

    var checks = [];
    function add(id, label, pass, detail, fix) { checks.push({ id: id, label: label, pass: pass, detail: detail, fix: fix }); }

    var email = /[\w.+-]+@[\w-]+\.[\w.-]+/.test(t);
    var phone = /(\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/.test(t);
    var linkedin = /linkedin\.com\/in\//i.test(t);
    add('contact', 'Contact details', email && phone,
      [email ? 'email found' : 'no email', phone ? 'phone found' : 'no phone', linkedin ? 'LinkedIn found' : 'no LinkedIn URL'].join(', '),
      'Put email, phone, city/state, and a linkedin.com/in/ URL in plain text at the top. Do not put them in a header or footer, because some ATS parsers skip those.');
    add('length', 'Length', words >= 350 && words <= 1300, words + ' words',
      words < 350 ? 'This reads thin. Most strong resumes run 450 to 1,100 words. Add scope, tools, and results to your top roles.' : 'Trim to about 1,100 words or two pages. Cut bullets that do not prove something this job asks for.');
    var qRatio = bullets.length ? quantified / bullets.length : 0;
    add('metrics', 'Quantified results', quantified >= 5 && qRatio >= 0.35,
      quantified + ' of ' + bullets.length + ' bullets contain a number',
      'Aim for at least 40% of bullets with a number: %, $, time saved, volume, team size, or rank. Example: "Cut onboarding time 30% (10 days to 7) by rebuilding the welcome flow."');
    var vRatio = bullets.length ? actionStarts / bullets.length : 0;
    add('verbs', 'Strong action verbs', vRatio >= 0.5,
      actionStarts + ' of ' + bullets.length + ' bullets start with a strong verb',
      'Start each bullet with a past-tense verb that shows ownership: Led, Built, Launched, Cut, Grew, Automated.');
    add('weak', 'Weak phrasing', weak.length === 0,
      weak.length ? weak.map(function (w) { return '"' + w.phrase + '" x' + w.count; }).join(', ') : 'none found',
      'Swap "responsible for" and "helped with" for the outcome itself: "Responsible for email" becomes "Ran a 2M-subscriber email program that drove 18% of revenue."');
    add('cliches', 'Cliches and filler', cliches.length === 0,
      cliches.length ? cliches.map(function (w) { return '"' + w.phrase + '"'; }).join(', ') : 'none found',
      'Recruiters skim past self-descriptions. Replace them with evidence: a result, a scope, or a named tool.');
    add('pronouns', 'No first-person pronouns', pronouns <= 1, pronouns + ' found',
      'Drop "I" and "my". Resume bullets are written in implied first person: "Built X", not "I built X".');
    var sections = {
      experience: /(^|\n)\s*(professional |work |relevant )?(experience|employment|work history|career history)\s*:?\s*(\n|$)/i.test(t),
      education: /(^|\n)\s*(education|academic background|education & certifications|education and certifications)\s*:?\s*(\n|$)/i.test(t),
      skills: /(^|\n)\s*((core |technical |key )?(skills|competencies|expertise|tools|technologies)|skills & tools|skills and tools)[^\n]{0,30}(\n|$)/i.test(t)
    };
    var missingSec = Object.keys(sections).filter(function (k) { return !sections[k]; });
    add('sections', 'Standard section headings', missingSec.length === 0,
      missingSec.length ? 'not detected: ' + missingSec.join(', ') : 'Experience, Education, and Skills found',
      'Use plain headings an ATS expects: "Experience", "Education", "Skills". Creative headings like "Where I\'ve Been" can get parsed into the wrong field.');
    // Pipes in a contact or title line are fine; repeated tab or pipe columns further down suggest a table.
    var tableish = lines.slice(4).filter(function (l) { return (l.match(/\t/g) || []).length >= 2 || (l.match(/\s\|\s/g) || []).length >= 2; }).length;
    add('format', 'Parse-friendly formatting', tableish < 4,
      tableish < 4 ? 'no table or column artifacts detected' : tableish + ' lines look like table or column layout',
      'Columns, tables, and text boxes often scramble in ATS parsing. Use a single-column layout with standard bullets.');

    return { words: words, bullets: bullets.length, quantified: quantified, checks: checks, linkedin: linkedin };
  }

  function placement(cat) {
    if (cat === 'cert') return 'Add to Education or a Certifications line, if you hold it.';
    if (cat === 'soft') return 'Show it in a bullet: the situation, what you did, and the result.';
    return 'Add to Skills, and use it in at least one bullet that shows where you applied it.';
  }

  function analyze(resume, jd, skills, opts) {
    opts = opts || {};
    var matchers = opts.matchers || buildMatchers(skills);
    var weighted = weighJD(jd);
    var jdSkills = {};
    weighted.forEach(function (l) {
      if (l.weight <= 0) return;
      var f = findSkills(l.text, matchers).found;
      Object.keys(f).forEach(function (k) {
        var s = jdSkills[k] || (jdSkills[k] = { skill: k, cat: f[k].cat, weight: 0, maxW: 0, count: 0 });
        s.count += f[k].count;
        s.weight += l.weight * Math.min(f[k].count, 2);
        s.maxW = Math.max(s.maxW, l.weight);
      });
    });
    var res = findSkills(resume, matchers).found;

    var groups = { hard: [], soft: [], cert: [] };
    Object.keys(jdSkills).forEach(function (k) {
      var s = jdSkills[k];
      s.weight = Math.min(s.weight, 9);
      s.priority = s.maxW >= 3 ? 'required' : (s.maxW >= 2 ? 'core' : 'preferred');
      s.inResume = !!res[k];
      s.resumeCount = res[k] ? res[k].count : 0;
      s.fix = placement(s.cat);
      groups[s.cat].push(s);
    });
    Object.keys(groups).forEach(function (g) { groups[g].sort(function (a, b) { return b.weight - a.weight || a.skill.localeCompare(b.skill); }); });

    function ratio(list) {
      if (!list.length) return null;
      var tot = 0, got = 0;
      list.forEach(function (s) { tot += s.weight; if (s.inResume) got += s.weight; });
      return tot ? got / tot : null;
    }

    var title = (opts.title || '').trim() || detectTitle(jd);
    var tm = titleMatch(title, resume);

    // Title words are scored separately, so keep them out of "other keywords".
    var titleStems = new Set(tokens(normalize(title)).map(stem));
    var other = otherTerms(weighted, matchers, (opts.otherLimit || 12) + 6).filter(function (o) {
      return !o.key.split(' ').every(function (w) { return titleStems.has(w); });
    }).slice(0, opts.otherLimit || 12);
    var idx = stemIndex(resume);
    other.forEach(function (o) { o.inResume = hasTerm(idx, o.key); });
    var otherRatio = other.length ? other.filter(function (o) { return o.inResume; }).length / other.length : null;

    var reqYears = yearsRequired(jd);
    var haveYears = yearsOnResume(resume, opts.now);
    var reqDeg = degreeLevel(weighted.map(function (l) { return l.weight > 0 ? l.text : ''; }).join('\n'));
    var haveDeg = degreeLevel(resume);

    var hy = hygiene(resume);
    var hyRatio = hy.checks.filter(function (c) { return c.pass; }).length / hy.checks.length;

    var parts = [
      { key: 'hard', label: 'Hard skills and tools', w: 50, v: ratio(groups.hard) },
      { key: 'soft', label: 'Soft skills', w: 10, v: ratio(groups.soft) },
      { key: 'cert', label: 'Degrees and certifications', w: 5, v: ratio(groups.cert) },
      { key: 'title', label: 'Job title match', w: 10, v: tm ? tm.level : null },
      { key: 'other', label: 'Other JD keywords', w: 10, v: otherRatio },
      { key: 'hygiene', label: 'Resume best practices', w: 15, v: hyRatio }
    ];
    var wsum = 0, acc = 0;
    parts.forEach(function (p) { if (p.v !== null) { wsum += p.w; acc += p.w * p.v; } });
    var score = wsum ? Math.round(100 * acc / wsum) : 0;
    var band = score >= 80 ? 'Strong match' : score >= 65 ? 'Good match, tailor a little' : score >= 50 ? 'Needs tailoring' : 'Weak match';

    var missing = [].concat(groups.hard, groups.cert, groups.soft).filter(function (s) { return !s.inResume; });
    missing.sort(function (a, b) {
      var pa = { required: 0, core: 1, preferred: 2 };
      return pa[a.priority] - pa[b.priority] || b.weight - a.weight;
    });

    return {
      score: score,
      band: band,
      parts: parts,
      groups: groups,
      missing: missing,
      other: other,
      title: { text: title, match: tm },
      years: { required: reqYears, resume: haveYears },
      degree: { required: reqDeg ? reqDeg.label : null, resume: haveDeg ? haveDeg.label : null, ok: !reqDeg || (haveDeg && haveDeg.rank >= reqDeg.rank) },
      hygiene: hy,
      stats: { jdSkills: Object.keys(jdSkills).length, resumeSkills: Object.keys(res).length }
    };
  }

  function report(r) {
    var L = [];
    L.push('TailorScan report: ' + r.score + '/100 (' + r.band + ')');
    if (r.title.text) L.push('Target title: ' + r.title.text);
    L.push('');
    r.parts.forEach(function (p) { if (p.v !== null) L.push('- ' + p.label + ': ' + Math.round(p.v * 100) + '%'); });
    L.push('');
    L.push('MISSING KEYWORDS (highest priority first)');
    r.missing.forEach(function (s) { L.push('- ' + s.skill + ' [' + s.priority + ']: ' + s.fix); });
    var om = r.other.filter(function (o) { return !o.inResume; });
    if (om.length) { L.push(''); L.push('OTHER JD TERMS NOT ON YOUR RESUME'); L.push(om.map(function (o) { return o.term; }).join(', ')); }
    L.push('');
    L.push('RESUME CHECKS');
    r.hygiene.checks.forEach(function (c) { L.push((c.pass ? '[pass] ' : '[fix]  ') + c.label + ': ' + c.detail + (c.pass ? '' : '\n        ' + c.fix)); });
    return L.join('\n');
  }

  return { analyze: analyze, report: report, buildMatchers: buildMatchers, findSkills: findSkills, weighJD: weighJD, detectTitle: detectTitle, yearsRequired: yearsRequired, yearsOnResume: yearsOnResume, normalize: normalize };
});
