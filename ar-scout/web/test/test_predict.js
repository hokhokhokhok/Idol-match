/* test_predict.js — leave-one-out performance and external sanity queries. */
'use strict';

const AR = require('../armodel.js');
const PR = require('../predict.js');

const MAE_MAX = 1.00;
const RMSE_MAX = 1.40;

/* name-or-SMILES, comparator, threshold */
const EXTERNAL = [
  ['Niacinamide', 'NC(=O)c1ccncc1', '<', 4.5],
  ['Glycerin', 'OCC(O)CO', '<', 4.5],
  ['Adenosine', 'Nc1ncnc2c1ncn2C1OC(CO)C(O)C1O', '<', 4.5],
  ['Dihydrotestosterone', 'CC12CCC3C(CCC4C3CCC4O)C1(C)CCC(=O)C2', '>', 8.5]
];

function run() {
  let pass = 0, fail = 0;

  /* every reference entry must parse */
  console.log('  reference library');
  let libBad = 0;
  for (const e of PR.REFERENCE_DEFAULT) {
    try {
      const mol = AR.parseSmiles(e.s);
      const d = AR.computeDescriptors(mol);
      if (!(d.mw > 0)) throw new Error('zero MW');
    } catch (err) {
      libBad++;
      console.log(`  FAIL  ${e.n}: ${err.message}`);
    }
  }
  if (libBad) fail += libBad;
  else { pass++; console.log(`  ok    all ${PR.REFERENCE_DEFAULT.length} reference entries parse`); }

  /* every dictionary entry must parse */
  let dictBad = 0;
  for (const [ko, en, smi] of PR.INGREDIENTS) {
    try { AR.computeDescriptors(AR.parseSmiles(smi)); }
    catch (err) { dictBad++; console.log(`  FAIL  dictionary ${ko} / ${en}: ${err.message}`); }
  }
  if (dictBad) fail += dictBad;
  else { pass++; console.log(`  ok    all ${PR.INGREDIENTS.length} dictionary entries parse`); }

  /* leave-one-out */
  console.log('\n  leave-one-out cross validation');
  const cv = PR.crossValidate();
  const worst = cv.rows.slice().sort((a, b) => Math.abs(b.error) - Math.abs(a.error));
  for (const r of worst.slice(0, 6)) {
    console.log(`        ${r.n.padEnd(28)} obs ${r.observed.toFixed(2)}  ` +
                `pred ${r.predicted.toFixed(2)}  err ${(r.error >= 0 ? '+' : '')}` +
                `${r.error.toFixed(2)}  (${r.domain}, nearest ${r.nearest.toFixed(2)})`);
  }
  console.log(`        n = ${cv.n}   MAE = ${cv.mae.toFixed(3)}   RMSE = ${cv.rmse.toFixed(3)}`);

  if (cv.mae < MAE_MAX) { pass++; console.log(`  ok    MAE ${cv.mae.toFixed(3)} < ${MAE_MAX}`); }
  else { fail++; console.log(`  FAIL  MAE ${cv.mae.toFixed(3)} >= ${MAE_MAX}`); }
  if (cv.rmse < RMSE_MAX) { pass++; console.log(`  ok    RMSE ${cv.rmse.toFixed(3)} < ${RMSE_MAX}`); }
  else { fail++; console.log(`  FAIL  RMSE ${cv.rmse.toFixed(3)} >= ${RMSE_MAX}`); }

  /* external queries */
  console.log('\n  external queries');
  for (const [name, smi, cmp, bound] of EXTERNAL) {
    const r = PR.predict(smi);
    const ok = cmp === '<' ? r.pKi < bound : r.pKi > bound;
    if (ok) {
      pass++;
      console.log(`  ok    ${name.padEnd(22)} pKi ${r.pKi.toFixed(2)} ${cmp} ${bound}` +
                  `  (${r.domain}, ${r.pocket.verdict})`);
    } else {
      fail++;
      console.log(`  FAIL  ${name.padEnd(22)} pKi ${r.pKi.toFixed(2)} not ${cmp} ${bound}`);
    }
  }

  /* --- name lookup must never silently resolve to the wrong compound ---
   *
   * A loose substring rule used to turn "페놀" into bisphenol A and "산"
   * into oxandrolone, then render a full prediction page for a molecule the
   * user never asked about. A miss that offers suggestions is fine; a
   * confident wrong hit is not. */
  console.log('\n  name lookup safety');
  const mustNotResolve = [
    ['페놀', 'a fragment of several unrelated names'],
    ['산', 'one syllable, inside dozens of names'],
    ['acid', 'the tail of 20 different acids'],
    ['아세테이트', 'the tail of several esters'],
    ['부틸', 'a fragment'],
    ['알코올', 'a fragment'],
    ['파라벤', 'matches five parabens equally'],
    ['메틸', 'a fragment'],
    ['프탈레이트', 'matches several phthalates'],
    ['스테론', 'a fragment of many steroids'],
    /* the single-edit pass must not reach these either */
    ['레조르시놀', 'the tail of the resorcinols'],
    ['에스트로', 'starts estrone, estradiol and estriol'],
    ['벤조페논', 'matches several benzophenones']
  ];
  let wrongHits = 0;
  for (const [q, why] of mustNotResolve) {
    const hit = PR.lookupName(q);
    if (hit) {
      wrongHits++;
      console.log(`  FAIL  "${q}" resolved to ${hit.en} — ${why}`);
    }
  }
  if (wrongHits) fail += wrongHits;
  else {
    pass++;
    console.log(`  ok    ${'generic fragments do not resolve'.padEnd(30)} ${mustNotResolve.length} queries`);
  }

  /* and each of those must still offer something useful */
  let noHelp = 0;
  for (const [q] of mustNotResolve) {
    if (q.length >= 2 && PR.suggestNames(q, 3).length === 0) {
      noHelp++;
      console.log(`  FAIL  "${q}" gives neither a hit nor a suggestion`);
    }
  }
  if (noHelp) fail += noHelp;
  else { pass++; console.log(`  ok    ${'misses still suggest'.padEnd(30)} all offer candidates`); }

  const mustResolve = [
    ['Fisetin', 'Fisetin'], ['피세틴', 'Fisetin'],
    ['벤조페논-3', 'Benzophenone-3'], ['옥시벤존', 'Benzophenone-3'],
    ['에틸헥실메톡시신나메이트', 'Octinoxate'], ['살리실릭애씨드', 'Salicylic acid'],
    ['R1881', 'Metribolone'], ['DHT', 'Dihydrotestosterone'],
    ['EGCG', 'Epigallocatechin gallate'], ['니코틴아마이드', 'Niacinamide'],
    ['레티닐 팔미테이트', 'Retinyl palmitate'], ['비타민C', 'Ascorbic acid'],
    ['알파아르부틴', 'alpha-Arbutin'], ['17베타에스트라디올', 'Estradiol'],
    ['citric acid', 'Citric acid'], ['THDA', 'Tetrahexyldecyl ascorbate'],
    /* both transliterations of -amide, both in daily use. The dictionary
     * stores 비칼루타미드 and 플루타마이드 - inconsistently - so a user typing
     * the other spelling used to get nothing for the single most important
     * antagonist in the tool. */
    ['비칼루타마이드', 'Bicalutamide'], ['비칼루타미드', 'Bicalutamide'],
    ['플루타마이드', 'Flutamide'], ['플루타미드', 'Flutamide'],
    ['엔잘루타마이드', 'Enzalutamide'], ['엔잘루타미드', 'Enzalutamide'],
    ['니코틴아미드', 'Niacinamide'], ['하이드록시플루타미드', 'Hydroxyflutamide'],
    /* one wrong syllable, resolved by the single-edit pass. Chasing these
     * with a rule each was losing: 케/퀘, -놀락톤/-노락톤, and the next one
     * nobody has typed yet. */
    ['케르세틴', 'Quercetin'], ['퀘르세틴', 'Quercetin'],
    ['스피로놀락톤', 'Spironolactone'], ['스피로노락톤', 'Spironolactone'],
    ['페닐에틸레조르시놀', 'Phenylethyl resorcinol'],
    ['Phenylethyl resorcinol', 'Phenylethyl resorcinol']
  ];
  let missed = 0;
  for (const [q, want] of mustResolve) {
    const hit = PR.lookupName(q);
    if (!hit || hit.en !== want) {
      missed++;
      console.log(`  FAIL  "${q}" -> ${hit ? hit.en : 'nothing'}, expected ${want}`);
    }
  }
  if (missed) fail += missed;
  else {
    pass++;
    console.log(`  ok    ${'real names and aliases resolve'.padEnd(30)} ${mustResolve.length} queries`);
  }

  /* the library tab must survive a replacement and a reset */
  console.log('\n  library replacement');
  try {
    const res = PR.setLibrary([
      { n: 'DHT', s: 'CC12CCC3C(CCC4C3CCC4O)C1(C)CCC(=O)C2', p: 9.3, c: 'agonist' },
      { n: 'broken', s: 'C1CC', p: 5.0 },
      { n: 'no pKi', s: 'c1ccccc1' }
    ]);
    if (res.applied === 1 && res.skipped.length === 2) {
      pass++;
      console.log(`  ok    applied ${res.applied}, skipped ${res.skipped.length} ` +
                  `(${res.skipped.map(s => s.entry).join(', ')})`);
    } else {
      fail++;
      console.log(`  FAIL  applied ${res.applied}, skipped ${res.skipped.length}`);
    }
    const n = PR.resetLibrary();
    if (n === PR.REFERENCE_DEFAULT.length) { pass++; console.log(`  ok    reset to ${n} entries`); }
    else { fail++; console.log(`  FAIL  reset gave ${n} entries`); }
  } catch (err) {
    fail++;
    console.log(`  FAIL  library replacement threw: ${err.message}`);
  }

  /* widening the normaliser must not merge two different compounds */
  const seenNorm = {};
  let collisions = 0;
  for (const e of PR.INGREDIENTS) {
    for (const nm of [e[0], e[1]].concat(e[3] || [])) {
      const k = PR.normalizeName(nm);
      if (seenNorm[k] && seenNorm[k] !== e[1]) {
        collisions++;
        console.log(`  FAIL  "${k}" is now shared by ${seenNorm[k]} and ${e[1]}`);
      }
      seenNorm[k] = e[1];
    }
  }
  if (collisions) fail += collisions;
  else {
    pass++;
    console.log(`  ok    ${'no two compounds share a name'.padEnd(30)} ${PR.INGREDIENTS.length} entries`);
  }

  /* --- what the red "helix-12" marking actually means -----------------
   *
   * It used to read "H12 충돌", which claimed a steric clash. Nothing here
   * computes overlap: both states come from the same 4.5 A cutoff, and the
   * red one only adds that the residue is on helix-12 in a pose that also
   * reached Ile899. The proof is that DHT touches Thr877 and Met895 exactly
   * as bicalutamide does and must NOT be marked, because it stops short of
   * Ile899. If that ever stops holding, the label is lying again. */
  console.log('\n  helix-12 marking');
  const scenePath = require('path').join(__dirname, '..', 'assets', 'pocket_scene.json');
  if (require('fs').existsSync(scenePath)) {
    const scene = JSON.parse(require('fs').readFileSync(scenePath, 'utf8'));
    const key = (mol) => {
      const d = AR.computeDescriptors(mol), f = AR.morganFingerprint(mol, 2);
      let bits = '';
      for (let i = 0; i < f.length; i++) if (f[i]) bits += i + ',';
      return d.formula + '|' + bits;
    };
    const look = (name) => {
      const e = PR.INGREDIENTS.find(x => x[1] === name);
      const mol = AR.parseSmiles(e[2]);
      const st = scene.poses[key(mol)];
      const dock = st && st.placed
        ? { placed: true, ile899: (st.c || []).indexOf('ILE899') >= 0,
            contacts: st.c || [], hbonds: st.hb || [] } : null;
      const p2 = PR.predict(e[2], { dock: dock }).pocket;
      const at = (id) => p2.residues.filter(r => r.id === id)[0];
      return { p: p2, at: at };
    };
    const bic = look('Bicalutamide'), dht = look('Dihydrotestosterone');
    const checks = [
      [bic.at('Ile899').contact, true, 'bicalutamide reaches Ile899'],
      [bic.at('Thr877').clash, true, 'so its Thr877 is marked'],
      [dht.at('Thr877').contact, true, 'DHT touches Thr877 just the same'],
      [dht.at('Thr877').clash, false, 'but is not marked, having missed Ile899'],
      [bic.at('Trp741').contact, true, 'Trp741 is contacted'],
      [bic.at('Trp741').clash, false, 'and never marked - it is not on helix-12'],
      [bic.at('Phe876').clash, false, 'nor is Phe876, resistance site though it is']
    ];
    let bad = 0;
    for (const [got, want, why] of checks) {
      if (got !== want) { bad++; console.log(`  FAIL  ${why}: got ${got}`); }
    }
    if (bad) fail += bad;
    else {
      pass++;
      console.log(`  ok    ${'red means helix-12, not a clash'.padEnd(30)} ${checks.length} assertions`);
      console.log('        DHT contacts Thr877/Met895 like bicalutamide; only Ile899 differs');
    }
  } else {
    console.log('  note  no pocket_scene.json in this build, skipping');
  }

  /* --- external validation on the actual use case --------------------
   *
   * Every performance number in this repository until now was measured on
   * the 28-compound reference library, which is drugs and steroids. The
   * tool is used on cosmetic ingredients, and 94 of those have a Tox21
   * verdict - a measurement from outside the model entirely. This is the
   * only test here that asks whether the tool is right about the things it
   * is actually pointed at. */
  console.log('\n  external validation (Tox21 verdicts)');
  const toxP = require('path').join(__dirname, '..', 'assets', 'tox21_ar.json');
  if (require('fs').existsSync(toxP)) {
    const tox = JSON.parse(require('fs').readFileSync(toxP, 'utf8'));
    const inactive = [], active = [];
    for (const [ko, en, smi] of PR.INGREDIENTS) {
      let mol;
      try { mol = AR.parseSmiles(smi); } catch (err) { continue; }
      const code = tox.calls[AR.structureIdOf(mol)];
      if (!code) continue;
      const read = PR.readTox21(code);
      if (!read || !read.verdict) continue;
      let r;
      try { r = PR.predict(smi, {}); } catch (err) { continue; }
      const row = { en: en, pKi: r.pKi, over: !!r.pocket.oversize };
      (read.verdict === 'inactive' ? inactive : active).push(row);
    }
    const binds = r => r.pKi >= 5.0 && !r.over;
    const tp = active.filter(binds).length;
    const fp = inactive.filter(binds).length;
    console.log(`        ${active.length} measured active, ${inactive.length} measured inactive`);
    console.log(`        pKi >= 5.0 and not oversize: ${tp}/${active.length} caught, ` +
                `${fp}/${inactive.length} false positives ` +
                `(${Math.round(100 * fp / inactive.length)}%)`);
    if (tp >= 22 && fp <= 6) {
      pass++;
      console.log(`  ok    ${'separates measured actives'.padEnd(34)} ` +
                  `${tp} caught, ${fp} false`);
    } else {
      fail++;
      console.log(`  FAIL  external validation slipped: ${tp} caught, ${fp} false`);
    }

    /* The oversize rule, which is what halved the false positives. The AR
       pocket is about 400 A^3; of the compounds over 100% occupancy in the
       measured set, none is active. Cholesterol (106%) and beta-sitosterol
       (114%) came back at pKi 6.4 and sitosterol was called a possible
       antagonist, because the model matches the steroid scaffold and does
       not notice the C17 tail leaves no room. */
    const over = inactive.concat(active).filter(r => r.over);
    const overActive = active.filter(r => r.over).length;
    if (over.length >= 5 && overActive === 0) {
      pass++;
      console.log(`  ok    ${'nothing oversized is active'.padEnd(34)} ` +
                  `${over.length} compounds over the cavity, 0 active`);
    } else {
      fail++;
      console.log(`  FAIL  ${overActive} of ${over.length} oversized compounds are active — ` +
                  'the rule needs re-examining');
    }
    for (const name of ['Cholesterol', 'beta-Sitosterol']) {
      const e = PR.INGREDIENTS.filter(x => x[1] === name)[0];
      if (!e) continue;
      const r = PR.predict(e[2], {});
      if (r.pocket.oversize && r.pocket.verdictKey === 'weak') {
        pass++;
        console.log(`  ok    ${(name + ' is refused on volume').padEnd(34)} ` +
                    `${Math.round(r.occupancy)}% of the cavity`);
      } else {
        fail++;
        console.log(`  FAIL  ${name} is not refused: ${r.pocket.verdict}`);
      }
    }
    /* and a real binder must not be caught by it */
    const dhtE = PR.INGREDIENTS.filter(x => x[1] === 'Dihydrotestosterone')[0];
    const dhtR = PR.predict(dhtE[2], {});
    if (!dhtR.pocket.oversize) {
      pass++;
      console.log(`  ok    ${'real ligands are not refused'.padEnd(34)} DHT at ` +
                  `${Math.round(dhtR.occupancy)}%`);
    } else {
      fail++;
      console.log('  FAIL  DHT refused on volume — the threshold is wrong');
    }
  }

  console.log(`\n  predict: ${pass} passed, ${fail} failed`);
  return fail;
}

if (require.main === module) process.exit(run() ? 1 : 0);
module.exports = { run: run };
