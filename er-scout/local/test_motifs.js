/* test_motifs.js — motif and span readout over the curated reference set. */
'use strict';
var fs = require('fs'), path = require('path');
function load(names) {
  var src = names.map(function (n) {
    return fs.readFileSync(path.join(__dirname, '../web/' + n), 'utf8');
  }).join('\n');
  /* eslint-disable no-new-func */
  return new Function(src + '\nreturn { MOL: MOL, LY3: LY3, ERM: ERM };');
}
var mods = load(['molmodel.js', 'layout3d.js', 'ermotifs.js'])();
var MOL = mods.MOL, ERM = mods.ERM;
var lib = JSON.parse(fs.readFileSync(path.join(__dirname, '../web/assets/er_reference.json')));
var curated = lib.filter(function (e) { return e.curated; });
var flags = ['aromaticSteroid', 'phenolRings', 'resorcinol', 'bisphenolLike', 'stilbene',
             'triaryl', 'flavonoid', 'sermTail', 'basicAmine', 'alkylPhenol', 'macrolactone'];
console.log(['name', 'pKi', 'class', 'span', 'src', 'ok'].concat(flags).join('\t'));
curated.forEach(function (e) {
  var mol = MOL.parseSmiles(e.s);
  var m = ERM.erMotifs(mol);
  var row = [e.en || e.n, e.p, e.c,
             m.span === null ? '-' : m.span.toFixed(1), m.spanSource || '-', m.spanOk ? 'Y' : 'n'];
  flags.forEach(function (f) { row.push(m[f] === true ? 'Y' : (m[f] || '')); });
  console.log(row.join('\t'));
});
