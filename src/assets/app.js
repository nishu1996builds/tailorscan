(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var resumeEl = $('resume'), jdEl = $('jd'), titleEl = $('title'), out = $('results');
  if (!resumeEl) return;
  var ROOT = document.body.getAttribute('data-root') || '';
  var KIT = window.TS_KIT || {};
  var matchers = TailorScan.buildMatchers(window.TS_SKILLS);
  var last = null;

  function store(k, v) { try { localStorage.setItem('ts_' + k, v); } catch (e) { } }
  function load(k) { try { return localStorage.getItem('ts_' + k) || ''; } catch (e) { return ''; } }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.add('on'); setTimeout(function () { t.classList.remove('on'); }, 1600); }
  function track(name) { try { if (window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: name, event: true }); } catch (e) { } }
  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { toast('Copied'); }, function () { toast('Copy failed'); });
    var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Copied'); } catch (e) { toast('Copy failed'); }
    document.body.removeChild(ta);
  }

  resumeEl.value = load('resume');
  jdEl.value = load('jd');
  titleEl.value = load('title');
  [['resume', resumeEl], ['jd', jdEl], ['title', titleEl]].forEach(function (p) { p[1].addEventListener('input', function () { store(p[0], p[1].value); }); });

  // Preload a role's benchmark JD from a keyword page: index.html#role=data-analyst
  var m = /role=([a-z0-9-]+)/.exec(location.hash);
  if (m) {
    fetch(ROOT + 'keywords/' + m[1] + '/jd.txt').then(function (r) { return r.ok ? r.text() : ''; }).then(function (t) {
      if (t) { jdEl.value = t; titleEl.value = ''; $('jd-status').textContent = 'Loaded a benchmark posting for this role. Paste a real posting for the best results.'; }
    }).catch(function () { });
  }

  function loadScript(src) {
    return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('Could not load ' + src)); }; document.head.appendChild(s); });
  }
  var PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
  var MAMMOTH = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js';

  function pdfText(buf) {
    return (window.pdfjsLib ? Promise.resolve() : loadScript(PDFJS + 'pdf.min.js')).then(function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js';
      return window.pdfjsLib.getDocument({ data: buf }).promise;
    }).then(function (pdf) {
      var pages = [];
      for (var i = 1; i <= pdf.numPages; i++) pages.push(pdf.getPage(i).then(function (p) { return p.getTextContent(); }));
      return Promise.all(pages);
    }).then(function (contents) {
      // Rebuild lines from text items using their y position.
      return contents.map(function (c) {
        var lines = [], lastY = null, cur = '';
        c.items.forEach(function (it) {
          var y = Math.round(it.transform[5]);
          if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(cur); cur = ''; }
          cur += (cur && !/\s$/.test(cur) && !/^\s/.test(it.str) ? ' ' : '') + it.str;
          lastY = y;
          if (it.hasEOL) { lines.push(cur); cur = ''; lastY = null; }
        });
        if (cur) lines.push(cur);
        return lines.map(function (l) { return l.replace(/\s+/g, ' ').trim(); }).filter(Boolean).join('\n');
      }).join('\n');
    });
  }
  function docxText(buf) {
    return (window.mammoth ? Promise.resolve() : loadScript(MAMMOTH)).then(function () {
      return window.mammoth.extractRawText({ arrayBuffer: buf });
    }).then(function (r) { return r.value.replace(/\n{3,}/g, '\n\n'); });
  }

  $('file').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0];
    var st = $('resume-status');
    if (!f) return;
    st.textContent = 'Reading ' + f.name + '...';
    var name = f.name.toLowerCase();
    var p;
    if (/\.txt$|\.md$/.test(name)) p = f.text();
    else if (/\.pdf$/.test(name)) p = f.arrayBuffer().then(pdfText);
    else if (/\.docx$/.test(name)) p = f.arrayBuffer().then(docxText);
    else { st.textContent = 'Use a PDF, DOCX, or TXT file. For .doc or Pages files, export to PDF first.'; return; }
    p.then(function (t) {
      resumeEl.value = t; store('resume', t);
      var words = (t.match(/\S+/g) || []).length;
      st.textContent = words < 60
        ? 'Only ' + words + ' words came out of that file. If it is a scanned image, an ATS cannot read it either. Export a text-based PDF.'
        : 'Read ' + words + ' words from ' + f.name + '. This is roughly what an ATS parser sees.';
      track('upload-' + name.split('.').pop());
    }).catch(function (err) { st.textContent = 'Could not read that file (' + err.message + '). Try pasting the text instead.'; });
    e.target.value = '';
  });

  $('example').addEventListener('click', function () {
    resumeEl.value = window.TS_EXAMPLE.resume; jdEl.value = window.TS_EXAMPLE.jd; titleEl.value = '';
    scan();
  });
  $('clear').addEventListener('click', function () {
    resumeEl.value = ''; jdEl.value = ''; titleEl.value = ''; ['resume', 'jd', 'title'].forEach(function (k) { store(k, ''); });
    out.innerHTML = ''; out.classList.add('hidden');
  });
  $('scan').addEventListener('click', scan);

  function ring(score) {
    var r = 62, c = 2 * Math.PI * r, off = c * (1 - score / 100);
    var col = score >= 80 ? 'var(--good)' : score >= 65 ? 'var(--accent)' : score >= 50 ? 'var(--warn)' : 'var(--bad)';
    return '<svg class="ring" viewBox="0 0 150 150" role="img" aria-label="Match score ' + score + ' out of 100">' +
      '<circle cx="75" cy="75" r="' + r + '" fill="none" stroke="var(--chip)" stroke-width="12"/>' +
      '<circle cx="75" cy="75" r="' + r + '" fill="none" stroke="' + col + '" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 75 75)"/>' +
      '<text x="75" y="84" text-anchor="middle" font-size="38">' + score + '</text></svg>';
  }

  function scan() {
    var resume = resumeEl.value.trim(), jd = jdEl.value.trim();
    if (resume.length < 100 || jd.length < 100) { toast('Paste both your resume and the job description'); return; }
    var r = TailorScan.analyze(resume, jd, window.TS_SKILLS, { matchers: matchers, title: titleEl.value });
    last = r;
    render(r);
    track('scan');
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function render(r) {
    var h = [];
    h.push('<div class="card score-card">' + ring(r.score) + '<div><p class="band">' + esc(r.band) + '</p>');
    h.push('<p class="muted" style="margin:0">' + (r.title.text ? 'Target role: <b>' + esc(r.title.text) + '</b>. ' : '') +
      r.stats.jdSkills + ' skills found in the posting, ' + (r.stats.jdSkills - r.missing.length) + ' of them on your resume.</p>');
    h.push('<div class="bars">');
    r.parts.forEach(function (p) {
      if (p.v === null) return;
      var pct = Math.round(p.v * 100);
      h.push('<div class="bar"><span>' + esc(p.label) + '</span><span class="track"><span class="fill" style="width:' + pct + '%"></span></span><b>' + pct + '%</b></div>');
    });
    h.push('</div><div class="row" style="margin-top:14px"><button class="btn small" id="copy-report">Copy full report</button><button class="btn small" id="copy-missing">Copy missing keywords</button></div></div></div>');

    if (r.missing.length) {
      h.push('<h2 class="section-h">Missing from your resume <span class="muted" style="font-weight:400;font-size:.9rem">(highest impact first)</span></h2>');
      h.push('<div class="card" style="padding:6px 12px;overflow-x:auto"><table class="miss"><thead><tr><th>Keyword</th><th>Priority</th><th>In posting</th><th>Where to add it</th></tr></thead><tbody>');
      r.missing.forEach(function (s) {
        h.push('<tr><td><b>' + esc(s.skill) + '</b></td><td><span class="pill ' + s.priority + '">' + s.priority + '</span></td><td>' + s.count + 'x</td><td class="muted">' + esc(s.fix) + '</td></tr>');
      });
      h.push('</tbody></table></div>');
      h.push('<p class="muted" style="font-size:.88rem">Only add skills you really have. Recruiters ask about every keyword in interviews.</p>');
    } else {
      h.push('<h2 class="section-h">No missing skills found</h2><p class="muted">Every skill we detected in the posting is on your resume. Focus on the checks below.</p>');
    }

    var hits = [].concat(r.groups.hard, r.groups.cert, r.groups.soft).filter(function (s) { return s.inResume; });
    if (hits.length) {
      h.push('<h2 class="section-h">Already matched</h2><div class="chips">');
      hits.forEach(function (s) { h.push('<span class="chip hit">' + esc(s.skill) + '</span>'); });
      h.push('</div>');
    }
    if (r.other.length) {
      h.push('<h2 class="section-h">Other phrases the posting repeats</h2><p class="muted" style="margin-top:0">Domain words and phrases that show up often. Mirror the ones that describe your real experience.</p><div class="chips">');
      r.other.forEach(function (o) { h.push('<button class="chip ' + (o.inResume ? 'hit' : 'miss') + '" data-copy="' + esc(o.term) + '">' + esc(o.term) + (o.inResume ? '' : '<span class="tag">missing</span>') + '</button>'); });
      h.push('</div>');
    }

    h.push('<h2 class="section-h">Requirements check</h2><div class="facts">');
    function fact(k, v, ok) { h.push('<div class="fact"><div class="k">' + k + '</div><div class="v" style="color:' + (ok === false ? 'var(--warn)' : 'inherit') + '">' + v + '</div></div>'); }
    var tm = r.title.match;
    fact('Job title on resume', !r.title.text ? 'No title detected' : tm.level >= 1 ? 'Exact match' : tm.level >= 0.75 ? 'Close match' : 'Not found: add "' + esc(r.title.text) + '" to your summary or headline if it fits', !r.title.text ? null : tm.level >= 0.75);
    if (r.years.required) fact('Experience asked for', r.years.required + '+ years. Your resume spans about ' + (r.years.resume === null ? '?' : r.years.resume) + ' years', r.years.resume === null ? null : r.years.resume >= r.years.required);
    if (r.degree.required) fact('Education', r.degree.required + ' asked for. ' + (r.degree.resume ? r.degree.resume + ' found' : 'None detected'), r.degree.ok);
    fact('Resume length', r.hygiene.words + ' words, ' + r.hygiene.bullets + ' bullets');
    h.push('</div>');

    h.push('<h2 class="section-h">Resume best practices</h2><ul class="checks">');
    r.hygiene.checks.forEach(function (c) {
      h.push('<li class="' + (c.pass ? 'pass' : 'fail') + '"><span class="ic">' + (c.pass ? '&#10003;' : '!') + '</span><div><b>' + esc(c.label) + '</b><span class="muted">' + esc(c.detail) + '</span>' + (c.pass ? '' : '<p class="fix">' + esc(c.fix) + '</p>') + '</div></li>');
    });
    h.push('</ul>');

    var launchOn = !!KIT.launch_price && Date.now() < Date.parse(KIT.launch_ends);
    if (KIT.url || KIT.page) {
      h.push('<div class="cta"><h3>Fix the gaps faster with ' + esc(KIT.name) + '</h3><p style="margin:0">Everything from this report, turned into a repeatable system you can run for every application:</p><ul>' +
        '<li>3 ATS-safe resume templates (Word and Google Docs) that parse cleanly</li>' +
        '<li>A 15-minute tailoring playbook with a bullet formula and 150+ action verbs</li>' +
        '<li>An application tracker that schedules your follow-ups and shows your funnel</li>' +
        '<li>Copy-paste scripts for referrals, recruiter outreach, follow-ups, and salary talks</li></ul>' +
        '<a class="btn primary big" href="' + esc(KIT.page) + '" data-track="cta-results">See what is inside, ' + (launchOn ? esc(KIT.launch_price) + ' launch price (normally ' + esc(KIT.price) + ')' : esc(KIT.price) + ' one time') + '</a>' +
        (KIT.free_url ? '<p style="margin:12px 0 0;font-size:.92rem">Not ready to buy? <a href="' + esc(KIT.free_url) + '" data-track="free-results">Get the free 15-minute tailoring checklist</a>.</p>' : '') + '</div>');
    }
    out.innerHTML = h.join('');
    if (window.TS_UTM) out.querySelectorAll('a[href*="gumroad.com"]').forEach(function (a) { var x = new URL(a.href); Object.keys(window.TS_UTM).forEach(function (k) { x.searchParams.set(k, window.TS_UTM[k]); }); a.href = x.toString(); });
    out.classList.remove('hidden');
    $('copy-report').addEventListener('click', function () { copy(TailorScan.report(last)); track('copy-report'); });
    $('copy-missing').addEventListener('click', function () { copy(last.missing.map(function (s) { return s.skill; }).join(', ')); });
    out.querySelectorAll('[data-copy]').forEach(function (b) { b.addEventListener('click', function () { copy(b.getAttribute('data-copy')); }); });
    out.querySelectorAll('[data-track]').forEach(function (b) { b.addEventListener('click', function () { track(b.getAttribute('data-track')); }); });
  }
})();
