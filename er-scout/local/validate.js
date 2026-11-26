/* validate.js — leave-one-out over the loaded library and the functional
 * labels, plus a sanity pass over the crystal poses. Run after any change to
 * the rules: the model card quotes these numbers. */
'use strict';
var fs = require('fs'), path = require('path');
var WEB = path.join(__dirname, '../web');
var src = ['molmodel.js', 'ermotifs.js', 'layout.js', 'layout3d.js', 'predict.js']
  .map(function (n) { return fs.readFileSync(path.join(WEB, n), 'utf8'); }).join('\n');
var mods = new Function(src + '\nreturn { MOL: MOL, ERM: ERM, PR: PR };')();
var PR = mods.PR, MOL = mods.MOL;

var SCENE = JSON.parse(fs.readFileSync(path.join(WEB, 'assets/pocket_scene.json')));
var TOX21 = JSON.parse(fs.readFileSync(path.join(WEB, 'assets/tox21_er.json')));
PR.registerScene(SCENE);
PR.compilePoses();
var pooled = PR.registerMeasured(TOX21);

console.log('reference library: ' + PR.getLibrary().length +
            ', function labels: ' + PR.ensureFunctionLibrary().length +
            ', Tox21-labelled additions: ' + pooled);

var cv = PR.crossValidate();
console.log('\n--- pKi leave-one-out (n=' + cv.n + ')  MAE ' + cv.mae.toFixed(2) +
            '  RMSE ' + cv.rmse.toFixed(2));
cv.rows.slice().sort(function (a, b) { return Math.abs(b.error) - Math.abs(a.error); })
  .forEach(function (r) {
    console.log('  %s %s obs %s pred %s err %s  nearest %s %s',
      (r.n + '                        ').slice(0, 22), r.floor ? 'F' : ' ',
      r.observed.toFixed(2), r.predicted.toFixed(2),
      (r.error >= 0 ? '+' : '') + r.error.toFixed(2),
      r.nearest.toFixed(2), r.domain);
  });

var fv = PR.validateFunction();
console.log('\n--- function leave-one-out (n=' + fv.n + ')  correct ' + fv.correct +
            ', abstain ' + fv.abstain + ', accuracy ' +
            (100 * fv.accuracy).toFixed(0) + '% of decided');
fv.rows.forEach(function (r) {
  console.log('  %s truth %s  call %s (%s, nearest %s) %s',
    (r.n + '                        ').slice(0, 22),
    (r.truth + '          ').slice(0, 10), (r.call + '          ').slice(0, 10),
    r.tier, r.nearest.toFixed(2), r.ok ? '' : '  <-- MISS');
});

console.log('\n--- crystal poses');
SCENE.poses.forEach(function (p) {
  var keyed = p.key ? PR.poseForStructure(p.key) : null;
  console.log('  %s %s %s h12 %s  key %s',
    p.pdb, (p.lig + '    ').slice(0, 4), (p.conf + '           ').slice(0, 11),
    p.h12 === null ? '-' : String(p.h12), keyed ? 'ok' : 'none');
});

/* An independent check. The side-chain rule and the thresholds were set
 * using the curated labels, so the leave-one-out above is a fit, not a
 * holdout. These compounds carry a Tox21 verdict and no hand label, so the
 * structural call has never seen them: each is predicted with its own Tox21
 * record withheld and with itself removed from the pool. */
console.log('\n--- holdout: structure-only call vs Tox21 verdict');
var pool = PR.functionPool();
var held = pool.filter(function (p) { return p.measured; });
var hit = 0, miss = 0, abstain = 0;
held.forEach(function (p) {
  var entry = null;
  for (var i = 0; i < PR.INGREDIENTS.length; i++) {
    if (PR.INGREDIENTS[i][1] === p.n) { entry = PR.INGREDIENTS[i]; break; }
  }
  if (!entry) return;
  var r = PR.predict(entry[2], { exclude: p.n });
  var call = r.functionCall.label;
  if (call === 'unknown') abstain++;
  else if (call === p.c) hit++;
  else miss++;
  console.log('  %s tox21 %s  call %s (%s, nearest %s) %s',
    (p.n + '                        ').slice(0, 24),
    (p.c + '          ').slice(0, 10), (call + '          ').slice(0, 10),
    r.functionCall.tier, r.functionCall.nearest.toFixed(2),
    call === p.c ? '' : '  <-- MISS');
});
console.log('  hit %d, miss %d, abstain %d', hit, miss, abstain);
