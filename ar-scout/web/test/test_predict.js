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

  console.log(`\n  predict: ${pass} passed, ${fail} failed`);
  return fail;
}

if (require.main === module) process.exit(run() ? 1 : 0);
module.exports = { run: run };
