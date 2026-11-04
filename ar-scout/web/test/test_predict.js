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

  console.log(`\n  predict: ${pass} passed, ${fail} failed`);
  return fail;
}

if (require.main === module) process.exit(run() ? 1 : 0);
module.exports = { run: run };
