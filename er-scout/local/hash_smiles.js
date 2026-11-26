/* hash_smiles.js — stdin: one SMILES per line, stdout: "<hash>\t<formula>" or
 * "-\t<error>". The data builders key their tables by the same structure hash
 * the browser computes, so the two have to come from this one engine. */
'use strict';
var fs = require('fs');
var path = require('path');
var src = fs.readFileSync(path.join(__dirname, '../web/molmodel.js'), 'utf8');
/* eslint-disable no-new-func */
var load = new Function(src + '\nreturn MOL;');
var MOL = load();

var lines = fs.readFileSync(0, 'utf8').split('\n');
var out = [];
for (var i = 0; i < lines.length; i++) {
  var smi = lines[i].trim();
  if (!smi) { continue; }
  try {
    var mol = MOL.parseSmiles(smi);
    out.push(MOL.structureIdOf(mol) + '\t' + MOL.molecularFormula(mol));
  } catch (err) {
    out.push('-\t' + err.message);
  }
}
process.stdout.write(out.join('\n') + '\n');
