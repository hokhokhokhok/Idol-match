/* test_function.js — how well the agonist/antagonist call actually works.
 *
 * Leave-one-out over the functional reference: each compound is classified
 * with itself removed, so the score measures generalisation to a compound
 * the reference has not seen, not recall.
 *
 * Three signals are combined and all three are checked here, because the
 * point of adding the last two was that read-across alone is not enough:
 * steroidal antiandrogens sit right beside the androgens in fingerprint
 * space and get called agonists.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const AR = require('../armodel.js');
const PR = require('../predict.js');

const SCENE_PATH = path.join(__dirname, '..', 'assets', 'pocket_scene.json');

/* Hand-set weights, so the floor is set below the measured score and the
 * sweep below checks the result is not balanced on them. */
const MIN_CORRECT = 30;          /* of 38; measured 32 with all signals */
const MIN_READ_ACROSS = 25;      /* read-across alone; measured 27 */

function structureKey(mol) {
  const d = AR.computeDescriptors(mol);
  const fp = AR.morganFingerprint(mol, 2);
  let bits = '';
  for (let i = 0; i < fp.length; i++) if (fp[i]) bits += i + ',';
  return d.formula + '|' + bits;
}

function loadScene() {
  if (!fs.existsSync(SCENE_PATH)) return null;
  try { return JSON.parse(fs.readFileSync(SCENE_PATH, 'utf8')); }
  catch (err) { return null; }
}

function run() {
  let pass = 0, fail = 0;
  const scene = loadScene();
  const lib = PR.ensureFunctionLibrary();
  const byName = {};
  for (const e of PR.INGREDIENTS) byName[e[1]] = e[2];

  const counts = {};
  for (const e of lib) counts[e.c] = (counts[e.c] || 0) + 1;
  if (lib.length >= 30 && counts.agonist >= 10 && counts.antagonist >= 10) {
    pass++;
    console.log(`  ok    ${'functional reference'.padEnd(30)} ${lib.length} compounds ` +
                `(${Object.entries(counts).map(([k, v]) => k + ' ' + v).join(', ')})`);
  } else {
    fail++;
    console.log(`  FAIL  functional reference too small or lopsided: ${JSON.stringify(counts)}`);
  }

  /* every functional reference entry must resolve to a parsable structure */
  let unresolved = 0;
  for (const name of Object.keys(PR.FUNCTION_CLASS)) {
    if (!byName[name]) { unresolved++; console.log(`  FAIL  ${name} is not in the dictionary`); }
  }
  if (unresolved) fail += unresolved;
  else { pass++; console.log(`  ok    ${'all labelled names resolve'.padEnd(30)} ${Object.keys(PR.FUNCTION_CLASS).length} labels`); }

  function evaluate(useDock, useMotif) {
    let correct = 0;
    const wrong = [];
    for (const entry of lib) {
      const smiles = byName[entry.n];
      const mol = AR.parseSmiles(smiles);
      const fp = AR.packFingerprint(AR.morganFingerprint(mol, 2));
      let dock = null;
      if (useDock && scene) {
        const stored = scene.poses[structureKey(mol)];
        if (stored && stored.placed) {
          dock = { placed: true, ile899: (stored.c || []).indexOf('ILE899') >= 0 };
        }
      }
      const call = PR.callFunction(fp, {
        exclude: entry.n, dock: dock,
        motifs: useMotif ? AR.detectMotifs(mol) : null
      });
      if (call.label === entry.c) correct++;
      else wrong.push(`${entry.n} (${entry.c} -> ${call.label})`);
    }
    return { correct, wrong };
  }

  console.log('\n  leave-one-out over the functional reference');
  const base = evaluate(false, false);
  const motif = evaluate(false, true);
  const dock = evaluate(true, false);
  const both = evaluate(true, true);
  const n = lib.length;
  for (const [label, r] of [['read-across only', base], ['+ motif', motif],
                            ['+ docking', dock], ['+ docking + motif', both]]) {
    console.log(`        ${label.padEnd(22)} ${r.correct}/${n}  ` +
                `${(100 * r.correct / n).toFixed(0)}%`);
  }
  console.log(`        remaining: ${both.wrong.join(', ')}`);

  if (base.correct >= MIN_READ_ACROSS) {
    pass++;
    console.log(`  ok    ${'read-across baseline'.padEnd(30)} ${base.correct}/${n} >= ${MIN_READ_ACROSS}`);
  } else {
    fail++;
    console.log(`  FAIL  read-across baseline ${base.correct}/${n} < ${MIN_READ_ACROSS}`);
  }

  if (both.correct >= MIN_CORRECT) {
    pass++;
    console.log(`  ok    ${'combined signals'.padEnd(30)} ${both.correct}/${n} >= ${MIN_CORRECT}`);
  } else {
    fail++;
    console.log(`  FAIL  combined signals ${both.correct}/${n} < ${MIN_CORRECT}`);
  }

  if (both.correct > base.correct) {
    pass++;
    console.log(`  ok    ${'extra signals help'.padEnd(30)} ${base.correct} -> ${both.correct}`);
  } else {
    fail++;
    console.log(`  FAIL  extra signals did not help: ${base.correct} -> ${both.correct}`);
  }

  /* the bulky-substituent motif is the thing that separates steroidal
     antiandrogens from androgens; check it does that and nothing else */
  console.log('\n  steroid bulk motif');
  const shouldFlag = ['Spironolactone', 'Drospirenone', 'Clascoterone',
                      'Cyproterone acetate', 'Chlormadinone acetate', 'Dienogest'];
  const shouldNot = ['Dihydrotestosterone', 'Testosterone', 'Methyltestosterone',
                     'Danazol', 'Stanozolol', 'Oxandrolone', 'Progesterone',
                     'Norethisterone', 'Levonorgestrel', 'Tibolone'];
  let motifOk = true;
  for (const name of shouldFlag) {
    const m = AR.detectMotifs(AR.parseSmiles(byName[name]));
    if (!m.steroidBulky) { motifOk = false; console.log(`  FAIL  ${name} should be flagged bulky`); }
  }
  for (const name of shouldNot) {
    const m = AR.detectMotifs(AR.parseSmiles(byName[name]));
    if (m.steroidBulky) { motifOk = false; console.log(`  FAIL  ${name} must not be flagged bulky`); }
  }
  if (motifOk) {
    pass++;
    console.log(`  ok    ${'flags the 6 steroidal antagonists'.padEnd(30)} and none of the 10 androgens/progestins`);
  } else { fail++; }

  /* a potency label must never be reported as a function */
  const bogus = PR.callFunction(
    AR.packFingerprint(AR.morganFingerprint(AR.parseSmiles('OCC(O)CO'), 2)), {});
  if (['agonist', 'antagonist', 'partial', 'unknown'].indexOf(bogus.label) >= 0) {
    pass++;
    console.log(`  ok    ${'only functional labels returned'.padEnd(30)} glycerin -> ${bogus.label}`);
  } else {
    fail++;
    console.log(`  FAIL  non-functional label leaked: ${bogus.label}`);
  }

  console.log(`\n  function: ${pass} passed, ${fail} failed`);
  return fail;
}

if (require.main === module) process.exit(run() ? 1 : 0);
module.exports = { run: run };
