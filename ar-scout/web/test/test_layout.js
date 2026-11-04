/* test_layout.js — geometric quality of the generated 2D coordinates. */
'use strict';

const AR = require('../armodel.js');
const LY = require('../layout.js');

const CASES = [
  ['Benzene', 'c1ccccc1'],
  ['Naphthalene', 'c1ccc2ccccc2c1'],
  ['Caffeine', 'CN1C=NC2=C1C(=O)N(C)C(=O)N2C'],
  ['Dihydrotestosterone', 'CC12CCC3C(CCC4C3CCC4O)C1(C)CCC(=O)C2'],
  ['Bicalutamide', 'CC(O)(CS(=O)(=O)c1ccc(F)cc1)C(=O)Nc1ccc(C#N)c(c1)C(F)(F)F'],
  ['Enzalutamide',
   'CC1(C)C(=O)N(c2ccc(C(=O)NC)c(F)c2)C(=S)N1c1ccc(C#N)c(c1)C(F)(F)F'],
  ['Spironolactone',
   'CC(=O)SC1CC2=CC(=O)CCC2(C)C2CCC3(C)C(CCC34CCC(=O)O4)C12']
];

const MEAN_LO = 0.95, MEAN_HI = 1.05;
const SD_MAX = 0.20;
const MIN_SEP = 0.20;
const MAX_CROSS = 2;

function analyse(mol, pos) {
  const lens = [];
  for (const bd of mol.bonds) {
    const dx = pos.x[bd.b] - pos.x[bd.a];
    const dy = pos.y[bd.b] - pos.y[bd.a];
    lens.push(Math.sqrt(dx * dx + dy * dy));
  }
  const mean = lens.reduce((a, b) => a + b, 0) / (lens.length || 1);
  const sd = Math.sqrt(
    lens.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (lens.length || 1)
  );
  let minSep = Infinity;
  for (let a = 0; a < pos.x.length; a++) {
    for (let b = a + 1; b < pos.x.length; b++) {
      const dx = pos.x[b] - pos.x[a], dy = pos.y[b] - pos.y[a];
      minSep = Math.min(minSep, Math.sqrt(dx * dx + dy * dy));
    }
  }
  let finite = true;
  for (let i = 0; i < pos.x.length; i++) {
    if (!isFinite(pos.x[i]) || !isFinite(pos.y[i])) finite = false;
    if (Math.abs(pos.x[i]) > 1e6 || Math.abs(pos.y[i]) > 1e6) finite = false;
  }
  return { mean, sd, minSep, finite, crossings: LY.countCrossings(mol, pos) };
}

function run() {
  let pass = 0, fail = 0;
  for (const [name, smi] of CASES) {
    const mol = AR.parseSmiles(smi);
    const pos = LY.computeLayout(mol);
    const a = analyse(mol, pos);
    const problems = [];
    if (!a.finite) problems.push('non-finite coordinates');
    if (!(a.mean >= MEAN_LO && a.mean <= MEAN_HI)) problems.push(`mean ${a.mean.toFixed(3)}`);
    if (!(a.sd < SD_MAX)) problems.push(`sd ${a.sd.toFixed(3)}`);
    if (!(a.minSep > MIN_SEP)) problems.push(`minSep ${a.minSep.toFixed(3)}`);
    if (!(a.crossings <= MAX_CROSS)) problems.push(`crossings ${a.crossings}`);

    if (problems.length) {
      fail++;
      console.log(`  FAIL  ${name.padEnd(22)} ${problems.join(', ')}`);
    } else {
      pass++;
      console.log(`  ok    ${name.padEnd(22)} mean ${a.mean.toFixed(3)}  ` +
                  `sd ${a.sd.toFixed(3)}  minSep ${a.minSep.toFixed(3)}  ` +
                  `cross ${a.crossings}`);
    }
  }
  console.log(`\n  layout: ${pass} passed, ${fail} failed`);
  return fail;
}

if (require.main === module) process.exit(run() ? 1 : 0);
module.exports = { run: run };
