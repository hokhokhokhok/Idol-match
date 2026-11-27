/* test_design.js — the affinity ranking and the analogue generator.
 *
 * The generator edits SMILES text because this engine has no writer, so
 * most of what is pinned here is that a bad edit cannot reach the user: a
 * product must re-parse, must change the formula by exactly what its rule
 * promised, and must not gain or lose a ring.
 *
 * The rest pins honesty rather than capability. The generator is scored by
 * the same model that ranks it, and measured over 376 analogues 80% of the
 * deltas land inside the model's own error bar. The controls - methyl,
 * hydroxyl, F, Cl, none of them AR pharmacophores - exist so that this
 * stays visible, and the tests check they are still generated and still
 * labelled, because quietly dropping them would make the tab look far more
 * authoritative than it is.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const AR = require('../armodel.js');
const PR = require('../predict.js');

const SCENE_PATH = path.join(__dirname, '..', 'assets', 'pocket_scene.json');
const TOX_PATH = path.join(__dirname, '..', 'assets', 'tox21_ar.json');
const NOISE = 0.7;

function structureKey(mol) {
  const d = AR.computeDescriptors(mol);
  const fp = AR.morganFingerprint(mol, 2);
  let bits = '';
  for (let i = 0; i < fp.length; i++) if (fp[i]) bits += i + ',';
  return d.formula + '|' + bits;
}

function run() {
  let pass = 0, fail = 0;
  const scene = fs.existsSync(SCENE_PATH) ? JSON.parse(fs.readFileSync(SCENE_PATH, 'utf8')) : null;
  const tox = fs.existsSync(TOX_PATH) ? JSON.parse(fs.readFileSync(TOX_PATH, 'utf8')) : null;
  if (tox) PR.registerMeasured(tox);
  const evidenceFor = (smiles, mol) => {
    const out = { dock: null, tox21: null };
    if (scene) {
      const st = scene.poses[structureKey(mol)];
      if (st && st.placed) {
        out.dock = { placed: true, affinity: st.aff,
                     ile899: (st.c || []).indexOf('ILE899') >= 0,
                     contacts: st.c || [], hbonds: st.hb || [] };
      }
    }
    if (tox) out.tox21 = tox.calls[AR.structureIdOf(mol)] || null;
    return out;
  };
  const byName = {};
  for (const e of PR.INGREDIENTS) byName[e[1]] = e[2];

  /* --- affinity ranking --------------------------------------------- */
  console.log('  affinity ranking');
  const aff = PR.rankAffinity(evidenceFor);
  let ordered = true;
  for (let i = 1; i < aff.length; i++) if (aff[i].pKi > aff[i - 1].pKi + 1e-9) ordered = false;
  const dense = aff.every((r, i) => r.rank === i + 1);
  if (ordered && dense && aff.length === PR.INGREDIENTS.length) {
    pass++;
    console.log(`  ok    ${'every compound, pKi descending'.padEnd(34)} ${aff.length} rows`);
  } else {
    fail++;
    console.log(`  FAIL  ranking broken (ordered ${ordered}, dense ${dense}, ${aff.length} rows)`);
  }

  /* the strongest AR binders are androgens and must lead */
  const top10 = aff.slice(0, 10).map(r => r.en);
  const wanted = ['Metribolone', 'Dihydrotestosterone', 'Trenbolone'];
  const absent = wanted.filter(n => top10.indexOf(n) < 0);
  if (!absent.length) {
    pass++;
    console.log(`  ok    ${'known high-affinity ligands lead'.padEnd(34)} ${wanted.join(', ')}`);
  } else {
    fail++;
    console.log(`  FAIL  missing from the top 10: ${absent.join(', ')}; got ${top10.join(', ')}`);
  }

  /* affinity and function are separate answers and must not be merged */
  const strongAgonists = aff.filter(r => r.pKi >= 8 && r.label === 'agonist').length;
  const strongAnta = aff.filter(r => r.pKi >= 8 && r.label === 'antagonist').length;
  if (strongAgonists > 0 && strongAnta > 0) {
    pass++;
    console.log(`  ok    ${'both calls appear at high pKi'.padEnd(34)} ` +
                `${strongAgonists} agonist / ${strongAnta} antagonist at pKi >= 8`);
  } else {
    fail++;
    console.log(`  FAIL  high-affinity band is single-class (${strongAgonists}/${strongAnta})`);
  }

  /* a row must agree with its own single lookup */
  let drift = 0;
  for (const r of aff.slice(0, 20)) {
    const single = PR.predict(r.smiles, evidenceFor(r.smiles, AR.parseSmiles(r.smiles)));
    if (Math.abs(single.pKi - r.pKi) > 1e-9) drift++;
  }
  if (!drift) {
    pass++;
    console.log(`  ok    ${'matches single lookup'.padEnd(34)} top 20 re-checked`);
  } else { fail++; console.log(`  FAIL  ${drift} of the top 20 disagree with their lookup`); }

  /* --- analogue generation: correctness ------------------------------ */
  console.log('\n  analogue generation');
  const parents = ['Bicalutamide', 'Enzalutamide', 'Flutamide', 'Nilutamide',
                   'Genistein', 'Fisetin', 'Linuron', 'Vinclozolin'];
  let total = 0, badFormula = 0, badRing = 0, badParse = 0, dup = 0;
  const seenAll = {};
  for (const name of parents) {
    const smi = byName[name];
    if (!smi) continue;
    const parent = AR.parseSmiles(smi);
    const pc = {};
    for (const a of parent.atoms) pc[a.el] = (pc[a.el] || 0) + 1;
    const d = PR.designAnalogues(smi, evidenceFor);
    const rule = {};
    for (const r of PR.DESIGN_RULES) rule[r.id] = r;
    const ids = {};
    for (const a of d.scored.concat(d.unscored)) {
      total++;
      let mol;
      try { mol = AR.parseSmiles(a.smiles); } catch (err) { badParse++; continue; }
      const gc = {};
      for (const at of mol.atoms) gc[at.el] = (gc[at.el] || 0) + 1;
      const add = rule[a.rule].add;
      const els = new Set(Object.keys(gc).concat(Object.keys(pc)));
      for (const el of els) {
        if ((gc[el] || 0) !== (pc[el] || 0) + (add[el] || 0)) { badFormula++; break; }
      }
      if (mol.ringCount !== parent.ringCount) badRing++;
      const id = AR.structureIdOf(mol);
      if (ids[id]) dup++;
      ids[id] = 1;
    }
  }
  console.log(`        ${total} analogues from ${parents.length} parents`);
  if (!badParse && !badFormula && !badRing && !dup) {
    pass++;
    console.log(`  ok    ${'every product verifies'.padEnd(34)} formula, ring count, uniqueness`);
  } else {
    fail++;
    console.log(`  FAIL  parse ${badParse}, formula ${badFormula}, rings ${badRing}, dupes ${dup}`);
  }

  /* a deliberately wrong rule must be thrown out, not shown */
  const planted = { id: 'bad', frag: 'C(F)(F)F', add: { C: 1, F: 2 },
                    name: 'planted', why: 'declares one F too few' };
  PR.DESIGN_RULES.push(planted);
  let leaked = 0;
  try {
    const d = PR.designAnalogues(byName['Flutamide'], evidenceFor);
    leaked = d.scored.concat(d.unscored).filter(a => a.rule === 'bad').length;
  } finally {
    PR.DESIGN_RULES.pop();
  }
  if (!leaked) {
    pass++;
    console.log(`  ok    ${'a rule that lies is rejected'.padEnd(34)} planted CF3/-1F discarded`);
  } else {
    fail++;
    console.log(`  FAIL  ${leaked} products slipped through a wrong formula declaration`);
  }

  /* only aromatic CH on six-rings may be touched */
  const dht = byName['Dihydrotestosterone'];
  const sites = PR.substitutionSites(AR.parseSmiles(dht));
  if (!sites.length) {
    pass++;
    console.log(`  ok    ${'no aromatic site, no analogues'.padEnd(34)} DHT yields nothing`);
  } else {
    fail++;
    console.log(`  FAIL  DHT reported ${sites.length} aromatic substitution sites`);
  }

  /* --- analogue generation: honesty ---------------------------------- */
  console.log('\n  honesty guards');
  const bic = PR.designAnalogues(byName['Bicalutamide'], evidenceFor);
  const all = bic.scored.concat(bic.unscored);
  const ctl = all.filter(a => a.control);
  if (ctl.length >= 4) {
    pass++;
    console.log(`  ok    ${'controls are generated'.padEnd(34)} ${ctl.length} non-pharmacophore analogues`);
  } else {
    fail++;
    console.log(`  FAIL  only ${ctl.length} controls — the null model must stay visible`);
  }
  const unlabelled = ctl.filter(a => !a.control || !a.ruleName);
  if (!unlabelled.length) {
    pass++;
    console.log(`  ok    ${'controls are labelled as such'.padEnd(34)} none can pass as a lead`);
  } else { fail++; console.log(`  FAIL  ${unlabelled.length} controls are unmarked`); }

  /* out-of-domain analogues are separated, never ranked among the rest */
  let misplaced = bic.scored.filter(a => a.domain === 'out').length;
  for (const name of parents) {
    const d = PR.designAnalogues(byName[name], evidenceFor);
    misplaced += d.scored.filter(a => a.domain === 'out').length;
    if (d.unscored.some(a => a.rank)) misplaced++;
  }
  if (!misplaced) {
    pass++;
    console.log(`  ok    ${'out-of-domain kept out of the rank'.padEnd(34)} unscored, not ranked`);
  } else {
    fail++;
    console.log(`  FAIL  ${misplaced} out-of-domain analogues were ranked`);
  }

  /* the measured fact this tab is built around: most deltas are noise */
  let n = 0, inNoise = 0;
  for (const name of parents) {
    const d = PR.designAnalogues(byName[name], evidenceFor);
    for (const a of d.scored.concat(d.unscored)) {
      n++;
      if (Math.abs(a.dPKi) <= NOISE) inNoise++;
    }
  }
  const frac = inNoise / Math.max(1, n);
  console.log(`        ${inNoise}/${n} analogues (${Math.round(100 * frac)}%) fall inside ±${NOISE}`);
  if (frac > 0.5) {
    pass++;
    console.log(`  ok    ${'the noise floor is real'.padEnd(34)} the tab must keep saying so`);
  } else {
    fail++;
    console.log(`  FAIL  only ${Math.round(100 * frac)}% inside the error bar — re-check the warning text`);
  }

  console.log(`\n  design: ${pass} passed, ${fail} failed`);
  return fail;
}

if (require.main === module) process.exit(run() ? 1 : 0);
module.exports = { run: run };
