const assert = require('assert');
const fs = require('fs');
const path = require('path');
const T = require('../src/assets/engine.js');
const skills = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/skills.json'), 'utf8'));
const jd = fs.readFileSync(path.join(__dirname, 'fixtures/jd.txt'), 'utf8');
const resume = fs.readFileSync(path.join(__dirname, 'fixtures/resume.txt'), 'utf8');
const M = T.buildMatchers(skills);
const names = (t) => Object.keys(T.findSkills(t, M).found).sort();
let n = 0;
function test(name, fn) { fn(); n++; console.log('ok', name); }

test('case-sensitive aliases avoid false positives', () => {
  assert.deepStrictEqual(names('We go to market fast and excel at R&D'), []);
  assert.ok(names('Built models in R and Go').includes('R'));
  assert.ok(names('Built models in R and Go').includes('Go'));
});
test('longest alias wins its span', () => {
  const f = names('Led customer segmentation using Python');
  assert.ok(f.includes('Segmentation') && f.includes('Python'));
});
test('symbols in skill names', () => {
  const f = names('Wrote C++ and C# services; ran A/B tests; Node.js APIs');
  ['C++', 'C#|c sharp|.net|dotnet'.split('|')[0], 'A/B Testing', 'Node.js', 'REST APIs'].forEach(s => assert.ok(f.includes(s), s + ' missing from ' + f));
});
test('boilerplate is ignored', () => {
  const w = T.weighJD('Benefits\nWe offer dental and a 401(k).\nEqual opportunity employer.');
  assert.strictEqual(w.filter(l => l.weight > 0).length, 0);
});
test('full analysis is sensible', () => {
  const r = T.analyze(resume, jd, skills, { matchers: M, now: new Date('2026-11-01') });
  assert.ok(r.score > 30 && r.score < 85, 'score ' + r.score);
  const miss = r.missing.map(s => s.skill);
  ['Braze', 'SQL', 'Looker'].forEach(s => assert.ok(miss.includes(s), s + ' should be missing'));
  assert.ok(!miss.includes('Iterable') && !miss.includes('Tableau'));
  assert.strictEqual(r.title.text, 'Senior Lifecycle Marketing Manager');
  assert.ok(r.title.match.level >= 0.75);
  assert.strictEqual(r.years.required, 5);
  assert.ok(r.years.resume >= 5);
  assert.ok(r.degree.ok);
  const fails = r.hygiene.checks.filter(c => !c.pass).map(c => c.id);
  assert.ok(fails.includes('weak') && fails.includes('cliches'));
  assert.ok(!miss.includes('DEI Programs'));
  assert.ok(T.report(r).includes('MISSING KEYWORDS'));
});
console.log(n + ' tests passed');
