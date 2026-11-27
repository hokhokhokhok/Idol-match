/* test_aromaticity.js — a molecule must score the same however it is spelled.
 *
 * PubChem's "Canonical SMILES" field is a Kekule string, so users paste both
 * forms. Before aromaticity perception existed, benzene scored a Tanimoto of
 * 0.000 against itself written the other way and bicalutamide moved 1.9 log,
 * which is the kind of defect that never shows up in a single-molecule test.
 */
'use strict';

const AR = require('../armodel.js');
const PR = require('../predict.js');

/* name, lower-case aromatic form, Kekule form */
const PAIRS = [
  ['benzene', 'c1ccccc1', 'C1=CC=CC=C1'],
  ['phenol', 'Oc1ccccc1', 'OC1=CC=CC=C1'],
  ['toluene', 'Cc1ccccc1', 'CC1=CC=CC=C1'],
  ['naphthalene', 'c1ccc2ccccc2c1', 'C1=CC2=CC=CC=C2C=C1'],
  ['biphenyl', 'c1ccccc1-c1ccccc1', 'c1ccccc1c1ccccc1'],
  ['pyridine', 'c1ccncc1', 'C1=CC=NC=C1'],
  ['pyrimidine', 'c1cncnc1', 'C1=CN=CN=C1'],
  ['pyrrole', 'c1cc[nH]c1', 'C1=CNC=C1'],
  ['furan', 'c1ccoc1', 'C1=COC=C1'],
  ['thiophene', 'c1ccsc1', 'C1=CSC=C1'],
  ['imidazole', 'c1c[nH]cn1', 'C1=CNC=N1'],
  ['indole', 'c1ccc2[nH]ccc2c1', 'C1=CC2=C(C=C1)NC=C2'],
  ['aniline', 'Nc1ccccc1', 'NC1=CC=CC=C1'],
  ['benzoic acid', 'OC(=O)c1ccccc1', 'OC(=O)C1=CC=CC=C1'],
  ['genistein',
   'Oc1ccc(cc1)c1coc2cc(O)cc(O)c2c1=O',
   'Oc1ccc(cc1)C1=COc2cc(O)cc(O)c2C1=O'],
  ['quercetin',
   'Oc1cc(O)c2c(c1)oc(-c1ccc(O)c(O)c1)c(O)c2=O',
   'OC1=CC(O)=C2C(=C1)OC(-C1=CC=C(O)C(O)=C1)=C(O)C2=O'],
  ['caffeine', 'Cn1cnc2c1c(=O)n(C)c(=O)n2C', 'CN1C=NC2=C1C(=O)N(C)C(=O)N2C'],
  ['estradiol',
   'CC12CCC3c4ccc(O)cc4CCC3C1CCC2O',
   'CC12CCC3C4=CC=C(O)C=C4CCC3C1CCC2O'],
  ['bicalutamide',
   'CC(O)(CS(=O)(=O)c1ccc(F)cc1)C(=O)Nc1ccc(C#N)c(c1)C(F)(F)F',
   'CC(O)(CS(=O)(=O)C1=CC=C(F)C=C1)C(=O)NC1=CC=C(C#N)C(=C1)C(F)(F)F'],
  ['enzalutamide',
   'CC1(C)C(=O)N(c2ccc(C(=O)NC)c(F)c2)C(=S)N1c1ccc(C#N)c(c1)C(F)(F)F',
   'CC1(C)C(=O)N(C2=CC=C(C(=O)NC)C(F)=C2)C(=S)N1C1=CC=C(C#N)C(=C1)C(F)(F)F'],
  ['niacinamide', 'NC(=O)c1ccncc1', 'NC(=O)C1=CC=NC=C1']
];

/* things that merely look aromatic and must not be flagged */
const NON_AROMATIC = [
  ['cyclohexane', 'C1CCCCC1', 0],
  ['cyclohexene', 'C1=CCCCC1', 0],
  ['1,4-benzoquinone', 'O=C1C=CC(=O)C=C1', 0],
  ['cyclopentadiene', 'C1=CCC=C1', 0],
  ['cyclooctatetraene', 'C1=CC=CC=CC=C1', 0],
  ['fulvene', 'C(=C1C=CC=C1)C', 0],
  ['piperidine', 'C1CCNCC1', 0],
  ['morpholine', 'C1COCCN1', 0],
  ['gamma-butyrolactone', 'O=C1CCCO1', 0],
  ['naphthalene (both rings)', 'C1=CC2=CC=CC=C2C=C1', 2],
  ['2-pyridinone', 'O=C1C=CC=CN1', 1],
  ['indole (both rings)', 'C1=CC2=C(C=C1)NC=C2', 2]
];

function run() {
  let pass = 0, fail = 0;

  console.log('  spelling invariance (aromatic form vs Kekule form)');
  for (const [name, aromatic, kekule] of PAIRS) {
    let problems = [];
    try {
      const ma = AR.parseSmiles(aromatic);
      const mb = AR.parseSmiles(kekule);
      const da = AR.computeDescriptors(ma);
      const db = AR.computeDescriptors(mb);
      const t = AR.tanimoto(AR.morganFingerprint(ma, 2), AR.morganFingerprint(mb, 2));

      if (da.formula !== db.formula) problems.push(`formula ${da.formula} vs ${db.formula}`);
      if (Math.abs(da.mw - db.mw) > 1e-6) problems.push('MW differs');
      if (da.aromRings !== db.aromRings) {
        problems.push(`aromatic rings ${da.aromRings} vs ${db.aromRings}`);
      }
      if (da.hbd !== db.hbd || da.hba !== db.hba) problems.push('H-bond counts differ');
      if (Math.abs(da.tpsa - db.tpsa) > 1e-6) {
        problems.push(`TPSA ${da.tpsa.toFixed(2)} vs ${db.tpsa.toFixed(2)}`);
      }
      if (Math.abs(da.clogp - db.clogp) > 1e-6) {
        problems.push(`clogP ${da.clogp.toFixed(2)} vs ${db.clogp.toFixed(2)}`);
      }
      if (t < 0.999) problems.push(`Tanimoto ${t.toFixed(3)} against itself`);

      /* the number the user actually reads */
      const pa = PR.predict(aromatic).pKi, pb = PR.predict(kekule).pKi;
      if (Math.abs(pa - pb) > 0.01) {
        problems.push(`pKi ${pa.toFixed(2)} vs ${pb.toFixed(2)}`);
      }
    } catch (err) {
      problems.push('threw: ' + err.message);
    }

    if (problems.length) {
      fail++;
      console.log(`  FAIL  ${name.padEnd(24)} ${problems.join(', ')}`);
    } else {
      pass++;
      console.log(`  ok    ${name.padEnd(24)} identical`);
    }
  }

  console.log('\n  aromatic ring perception');
  for (const [name, smiles, expected] of NON_AROMATIC) {
    try {
      const d = AR.computeDescriptors(AR.parseSmiles(smiles));
      if (d.aromRings === expected) {
        pass++;
        console.log(`  ok    ${name.padEnd(24)} ${d.aromRings} aromatic ring(s)`);
      } else {
        fail++;
        console.log(`  FAIL  ${name.padEnd(24)} ${d.aromRings}, expected ${expected}`);
      }
    } catch (err) {
      fail++;
      console.log(`  FAIL  ${name.padEnd(24)} threw: ${err.message}`);
    }
  }

  /* A bond between two aromatic rings is a plain single bond, so writing the
   * "-" or leaving it out must not change anything. */
  console.log('\n  inter-ring bonds');
  const withDash = AR.parseSmiles('c1ccccc1-c1ccccc1');
  const noDash = AR.parseSmiles('c1ccccc1c1ccccc1');
  const aromaticBonds = m => m.bonds.filter(b => b.arom).length;
  if (aromaticBonds(withDash) === 12 && aromaticBonds(noDash) === 12) {
    pass++;
    console.log('  ok    biphenyl has 12 aromatic bonds either way (not 13)');
  } else {
    fail++;
    console.log(`  FAIL  biphenyl aromatic bonds ${aromaticBonds(withDash)} / ${aromaticBonds(noDash)}`);
  }

  console.log(`\n  aromaticity: ${pass} passed, ${fail} failed`);
  return fail;
}

if (require.main === module) process.exit(run() ? 1 : 0);
module.exports = { run: run };
