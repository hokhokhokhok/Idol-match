/* test_rank.js — the dictionary-wide antagonist ranking.
 *
 * The ordering rule is the whole feature, so what is pinned here is not a
 * score but the judgements: which compounds may sit at the top, which must
 * be demoted and for what stated reason, and that nothing is silently
 * dropped. Every rule below was written because the first draft of the list
 * got that case wrong.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const AR = require('../armodel.js');
const PR = require('../predict.js');

const SCENE_PATH = path.join(__dirname, '..', 'assets', 'pocket_scene.json');
const TOX_PATH = path.join(__dirname, '..', 'assets', 'tox21_ar.json');

function structureKey(mol) {
  const d = AR.computeDescriptors(mol);
  const fp = AR.morganFingerprint(mol, 2);
  let bits = '';
  for (let i = 0; i < fp.length; i++) if (fp[i]) bits += i + ',';
  return d.formula + '|' + bits;
}

function run() {
  let pass = 0, fail = 0;

  const haveScene = fs.existsSync(SCENE_PATH), haveTox = fs.existsSync(TOX_PATH);
  const scene = haveScene ? JSON.parse(fs.readFileSync(SCENE_PATH, 'utf8')) : null;
  const tox = haveTox ? JSON.parse(fs.readFileSync(TOX_PATH, 'utf8')) : null;
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

  const rows = PR.rankAntagonists(evidenceFor);
  const by = {};
  for (const r of rows) by[r.en] = r;
  const bands = {};
  for (const r of rows) bands[r.band] = (bands[r.band] || 0) + 1;
  console.log(`        ${rows.length} antagonist candidates of ${PR.INGREDIENTS.length} ` +
              `(${Object.keys(bands).sort().map(k => k + ' ' + bands[k]).join(', ')})`);

  /* ranks are dense, start at 1, and nothing is dropped on the way */
  let seq = true;
  for (let i = 0; i < rows.length; i++) if (rows[i].rank !== i + 1) seq = false;
  if (seq && rows.length > 40) {
    pass++;
    console.log(`  ok    ${'ranks are 1..N with no gaps'.padEnd(34)} N = ${rows.length}`);
  } else {
    fail++;
    console.log(`  FAIL  ranking is not a dense 1..N sequence (${rows.length} rows)`);
  }

  /* only antagonist calls are listed */
  const strays = rows.filter(r => !r.band || !PR.RANK_BANDS[r.band]);
  if (!strays.length) {
    pass++;
    console.log(`  ok    ${'every row lands in a known band'.padEnd(34)} ${Object.keys(bands).length} bands used`);
  } else { fail++; console.log(`  FAIL  ${strays.length} rows have no band`); }

  /* --- the top of the list must be the real antiandrogens ------------ */
  const topNames = rows.slice(0, 12).map(r => r.en);
  const mustBeTop = ['Bicalutamide', 'Enzalutamide', 'Cyproterone acetate',
                     'Apalutamide', 'Dienogest'];
  const missing = mustBeTop.filter(n => topNames.indexOf(n) < 0);
  if (!missing.length) {
    pass++;
    console.log(`  ok    ${'known antiandrogens lead'.padEnd(34)} ${mustBeTop.length} in the top 12`);
  } else {
    fail++;
    console.log(`  FAIL  missing from the top 12: ${missing.join(', ')}`);
    console.log(`        top 12 was: ${topNames.join(', ')}`);
  }

  /* --- DHEA, and the three answers it got ---------------------------
   *
   * Draft 1 ranked it #1: Tox21 calls it an antagonist. It is an androgen
   * precursor, the structure reads agonist, and the reference set carries
   * it as an AGONIST.
   *
   * Draft 2 made it worse. Badging reference compounds as 문헌 promoted it
   * to #2 wearing a label that reads "the literature calls this an
   * antagonist" - the exact opposite of its reference label.
   *
   * Draft 3, which is this one: the curated label wins outright, so DHEA is
   * an agonist and simply is not an antagonist candidate. Demoting-and-
   * flagging was still answering the wrong question. */
  if (by['DHEA']) {
    fail++;
    console.log(`  FAIL  DHEA is ranked as an antagonist (#${by['DHEA'].rank}); ` +
                'its curated label is agonist and must win');
  } else {
    pass++;
    console.log(`  ok    ${'DHEA is not an antagonist at all'.padEnd(34)} curated label wins`);
  }

  /* --- mechanism blocks keep off-target compounds out ---------------- */
  const blocked = ['Finasteride', 'Dutasteride', 'Retinol', 'Pregnenolone',
                   'Hydrocortisone', 'Prednisolone', 'Dexamethasone'];
  const stillHere = blocked.filter(n => by[n]);
  if (!stillHere.length) {
    pass++;
    console.log(`  ok    ${'off-target mechanisms excluded'.padEnd(34)} ` +
                `${blocked.length} compounds (5AR, GR, RAR)`);
  } else {
    fail++;
    console.log(`  FAIL  still ranked as antagonists: ${stillHere.join(', ')}`);
  }

  /* a reference label pointing the other way always demotes */
  const wrongWay = rows.filter(r => r.curatedLabel && r.curatedLabel !== 'antagonist');
  const promoted = wrongWay.filter(r => r.band === 'high' || r.tier === 'curated');
  if (!promoted.length) {
    pass++;
    console.log(`  ok    ${'opposite reference labels demote'.padEnd(34)} ` +
                `${wrongWay.map(r => r.en + ' (' + r.curatedLabel + ')').join(', ')}`);
  } else {
    fail++;
    console.log(`  FAIL  promoted despite an opposite label: ${promoted.map(r => r.en).join(', ')}`);
  }

  /* --- non-binders are kept but sunk -------------------------------- */
  const fats = ['Palmitic acid', 'Stearic acid', 'Lauric acid', 'Myristic acid'];
  const present = fats.filter(n => by[n]);
  const sunk = present.filter(n => by[n].band === 'low' && by[n].nonBinder &&
                                   by[n].flags.length);
  if (present.length && sunk.length === present.length) {
    pass++;
    console.log(`  ok    ${'non-binders sink with a reason'.padEnd(34)} ${present.length} fatty acids`);
  } else {
    fail++;
    console.log(`  FAIL  fatty acids not demoted: ` +
                present.filter(n => sunk.indexOf(n) < 0)
                       .map(n => n + ' (' + by[n].band + ')').join(', '));
  }

  /* --- a curated reference must not be sold as a prediction ---------- */
  const miscast = rows.filter(r => PR.FUNCTION_CLASS[r.en] === 'antagonist' &&
                                   r.tier !== 'curated');
  if (!miscast.length) {
    const curatedN = rows.filter(r => r.curated).length;
    pass++;
    console.log(`  ok    ${'library entries read as input'.padEnd(34)} ${curatedN} marked 문헌`);
  } else {
    fail++;
    console.log(`  FAIL  curated antagonists shown as predictions: ${miscast.map(r => r.en).join(', ')}`);
  }

  /* every demoted row must say why, and nothing may be flagged silently */
  const silent = rows.filter(r => (r.conflict || r.nonBinder) && !r.flags.length);
  if (!silent.length) {
    const flagged = rows.filter(r => r.flags.length).length;
    pass++;
    console.log(`  ok    ${'every demotion states a reason'.padEnd(34)} ${flagged} rows carry notes`);
  } else {
    fail++;
    console.log(`  FAIL  ${silent.length} rows demoted without a reason`);
  }

  /* --- the ordering rule itself -------------------------------------- */
  const order = { high: 3, medium: 2, low: 1 };
  let monotone = true, within = true;
  for (let i = 1; i < rows.length; i++) {
    if (order[rows[i].band] > order[rows[i - 1].band]) monotone = false;
    if (rows[i].band === rows[i - 1].band && rows[i].pKi > rows[i - 1].pKi + 1e-9) within = false;
  }
  if (monotone && within) {
    pass++;
    console.log(`  ok    ${'band first, then potency'.padEnd(34)} holds across all ${rows.length}`);
  } else {
    fail++;
    console.log(`  FAIL  ordering broken (band monotone ${monotone}, pKi within band ${within})`);
  }

  /* a compound ranked here must agree with what its own lookup shows */
  let drift = 0;
  for (const r of rows.slice(0, 25)) {
    const mol = AR.parseSmiles(r.smiles);
    const single = PR.predict(r.smiles, evidenceFor(r.smiles, mol));
    if (single.functionCall.label !== 'antagonist' ||
        Math.abs(single.pKi - r.pKi) > 1e-9) drift++;
  }
  if (!drift) {
    pass++;
    console.log(`  ok    ${'ranking matches single lookup'.padEnd(34)} top 25 re-checked`);
  } else {
    fail++;
    console.log(`  FAIL  ${drift} of the top 25 disagree with their own lookup`);
  }

  console.log(`\n  rank: ${pass} passed, ${fail} failed`);
  return fail;
}

if (require.main === module) process.exit(run() ? 1 : 0);
module.exports = { run: run };
