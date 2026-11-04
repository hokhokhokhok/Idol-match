/* predict.js — read-across + pharmacophore rules + AR LBD contact mapping.
 *
 * The reference pKi values are competitive-binding literature values. They
 * carry +-0.5 to 1 log of inter-laboratory spread, which bounds how good any
 * model fitted to them can be.
 */
'use strict';

var AR = require('./armodel.js');

var POCKET_VOLUME = 400;          /* AR LBD cavity, Angstrom^3 */

/* ------------------------------------------------- reference library (28) */

var REFERENCE_DEFAULT = [
  { n: 'Metribolone (R1881)', p: 9.50, c: 'agonist',
    s: 'CC12C(C)(O)CCC2C3C(C=C1)=C5CCC(=O)C=C5CC3',
    note: '17a-methyl + 4,9,11-triene; C19H24O2' },
  { n: 'Trenbolone', p: 9.40, c: 'agonist',
    s: 'CC12C(O)CCC2C3C(C=C1)=C5CCC(=O)C=C5CC3',
    note: 'estra-4,9,11-trien-3-one' },
  { n: 'Dihydrotestosterone', p: 9.30, c: 'agonist',
    s: 'CC12CCC3C(CCC4C3CCC4O)C1(C)CCC(=O)C2',
    note: 'endogenous reference agonist' },
  { n: 'Nandrolone', p: 9.15, c: 'agonist',
    s: 'CC12CCC3C(CCC4=CC(=O)CCC34)C1CCC2O',
    note: '19-nortestosterone' },
  { n: 'Testosterone', p: 9.00, c: 'agonist',
    s: 'CC12CCC3C(CCC4=CC(=O)CCC34C)C1CCC2O',
    note: 'endogenous agonist' },
  { n: 'RU-59063', p: 9.00, c: 'antagonist',
    s: 'CC1(C)N(CCCCO)C(=O)N(c2ccc(C#N)c(c2)C(F)(F)F)C1=O',
    note: 'high-affinity non-steroidal ligand' },
  { n: 'Methyltestosterone', p: 8.90, c: 'agonist',
    s: 'CC12CCC3C(CCC4=CC(=O)CCC34C)C1CCC2(C)O',
    note: '17a-methyl testosterone' },
  { n: 'Medroxyprogesterone acetate', p: 8.50, c: 'partial',
    s: 'CC(=O)OC1(C(C)=O)CCC2C1(C)CCC1C2CC(C)C2=CC(=O)CCC12C',
    note: 'progestin with AR cross-reactivity' },
  { n: 'Darolutamide', p: 7.96, c: 'antagonist',
    s: 'CC(Cn1ccc(n1)c1ccc(C#N)c(Cl)c1)NC(=O)c1cc(C(C)O)[nH]n1',
    note: 'second-generation antagonist' },
  { n: 'Cyproterone acetate', p: 7.85, c: 'antagonist',
    s: 'CC(=O)OC1(C(C)=O)CCC2C1(C)CCC3C2C=C(Cl)C4=CC(=O)C5CC5C34C',
    note: 'steroidal antiandrogen' },
  { n: 'Apalutamide', p: 7.80, c: 'antagonist',
    s: 'CNC(=O)c1ccc(cc1F)N1C(=S)N(c2cnc(C#N)c(c2)C(F)(F)F)C(=O)C12CCC2',
    note: 'thiohydantoin antagonist' },
  { n: 'Enzalutamide', p: 7.60, c: 'antagonist',
    s: 'CC1(C)C(=O)N(c2ccc(C(=O)NC)c(F)c2)C(=S)N1c1ccc(C#N)c(c1)C(F)(F)F',
    note: 'thiohydantoin antagonist' },
  { n: 'Progesterone', p: 7.60, c: 'partial',
    s: 'CC(=O)C1CCC2C1(C)CCC1C2CCC2=CC(=O)CCC12C',
    note: 'weak partial agonist at AR' },
  { n: 'Hydroxyflutamide', p: 7.57, c: 'antagonist',
    s: 'CC(C)(O)C(=O)Nc1ccc([N+](=O)[O-])c(c1)C(F)(F)F',
    note: 'active metabolite of flutamide' },
  { n: 'Clascoterone', p: 7.50, c: 'antagonist',
    s: 'CCC(=O)OC1(C(=O)CO)CCC2C1(C)CCC1C2CCC2=CC(=O)CCC12C',
    note: 'topical androgen receptor inhibitor' },
  { n: 'Spironolactone', p: 7.20, c: 'antagonist',
    s: 'CC(=O)SC1CC2=CC(=O)CCC2(C)C2CCC3(C)C(CCC34CCC(=O)O4)C12',
    note: 'steroidal antagonist, spirolactone' },
  { n: 'Bicalutamide', p: 6.93, c: 'antagonist',
    s: 'CC(O)(CS(=O)(=O)c1ccc(F)cc1)C(=O)Nc1ccc(C#N)c(c1)C(F)(F)F',
    note: 'first-generation antagonist' },
  { n: 'Nilutamide', p: 6.60, c: 'antagonist',
    s: 'CC1(C)NC(=O)N(c2ccc([N+](=O)[O-])c(c2)C(F)(F)F)C1=O',
    note: 'hydantoin antagonist' },
  { n: 'Vinclozolin', p: 5.70, c: 'antagonist',
    s: 'C=CC1(C)OC(=O)N(c2cc(Cl)cc(Cl)c2)C1=O',
    note: 'dicarboximide fungicide, anti-androgenic' },
  { n: "p,p'-DDE", p: 5.50, c: 'antagonist',
    s: 'ClC(Cl)=C(c1ccc(Cl)cc1)c1ccc(Cl)cc1',
    note: 'persistent DDT metabolite' },
  { n: 'Estradiol', p: 5.50, c: 'weak',
    s: 'CC12CCC3c4ccc(O)cc4CCC3C1CCC2O',
    note: 'aromatic A-ring; weak at AR' },
  { n: 'Genistein', p: 5.30, c: 'weak',
    s: 'Oc1ccc(cc1)C1=COc2cc(O)cc(O)c2C1=O',
    note: 'isoflavone phyto-oestrogen' },
  { n: 'Flutamide', p: 5.20, c: 'weak',
    s: 'CC(C)C(=O)Nc1ccc([N+](=O)[O-])c(c1)C(F)(F)F',
    note: 'prodrug; activity resides in the metabolite' },
  { n: 'Butylparaben', p: 4.80, c: 'weak',
    s: 'CCCCOC(=O)c1ccc(O)cc1',
    note: 'preservative, weak AR interaction' },
  { n: 'Finasteride', p: 4.50, c: 'non-binder',
    s: 'CC(C)(C)NC(=O)C1CCC2C3CCC4NC(=O)C=CC4(C)C3CCC12C',
    note: '5a-reductase inhibitor, not an AR ligand' },
  { n: 'Niacinamide', p: 4.00, c: 'non-binder',
    s: 'NC(=O)c1ccncc1', note: 'cosmetic actives baseline' },
  { n: 'Caffeine', p: 4.00, c: 'non-binder',
    s: 'CN1C=NC2=C1C(=O)N(C)C(=O)N2C', note: 'cosmetic actives baseline' },
  { n: 'Panthenol', p: 4.00, c: 'non-binder',
    s: 'CC(C)(CO)C(O)C(=O)NCCCO', note: 'cosmetic actives baseline' }
];

/* ------------------------------------------- ingredient name dictionary */

var INGREDIENTS = [
  ['메트리볼론', 'Metribolone', 'CC12C(C)(O)CCC2C3C(C=C1)=C5CCC(=O)C=C5CC3'],
  ['트렌볼론', 'Trenbolone', 'CC12C(O)CCC2C3C(C=C1)=C5CCC(=O)C=C5CC3'],
  ['디하이드로테스토스테론', 'Dihydrotestosterone', 'CC12CCC3C(CCC4C3CCC4O)C1(C)CCC(=O)C2'],
  ['난드롤론', 'Nandrolone', 'CC12CCC3C(CCC4=CC(=O)CCC34)C1CCC2O'],
  ['테스토스테론', 'Testosterone', 'CC12CCC3C(CCC4=CC(=O)CCC34C)C1CCC2O'],
  ['메틸테스토스테론', 'Methyltestosterone', 'CC12CCC3C(CCC4=CC(=O)CCC34C)C1CCC2(C)O'],
  ['메드록시프로게스테론아세테이트', 'Medroxyprogesterone acetate',
   'CC(=O)OC1(C(C)=O)CCC2C1(C)CCC1C2CC(C)C2=CC(=O)CCC12C'],
  ['다롤루타미드', 'Darolutamide',
   'CC(Cn1ccc(n1)c1ccc(C#N)c(Cl)c1)NC(=O)c1cc(C(C)O)[nH]n1'],
  ['사이프로테론아세테이트', 'Cyproterone acetate',
   'CC(=O)OC1(C(C)=O)CCC2C1(C)CCC3C2C=C(Cl)C4=CC(=O)C5CC5C34C'],
  ['아팔루타미드', 'Apalutamide',
   'CNC(=O)c1ccc(cc1F)N1C(=S)N(c2cnc(C#N)c(c2)C(F)(F)F)C(=O)C12CCC2'],
  ['엔잘루타미드', 'Enzalutamide',
   'CC1(C)C(=O)N(c2ccc(C(=O)NC)c(F)c2)C(=S)N1c1ccc(C#N)c(c1)C(F)(F)F'],
  ['프로게스테론', 'Progesterone', 'CC(=O)C1CCC2C1(C)CCC1C2CCC2=CC(=O)CCC12C'],
  ['하이드록시플루타마이드', 'Hydroxyflutamide',
   'CC(C)(O)C(=O)Nc1ccc([N+](=O)[O-])c(c1)C(F)(F)F'],
  ['클라스코테론', 'Clascoterone',
   'CCC(=O)OC1(C(=O)CO)CCC2C1(C)CCC1C2CCC2=CC(=O)CCC12C'],
  ['스피로노락톤', 'Spironolactone',
   'CC(=O)SC1CC2=CC(=O)CCC2(C)C2CCC3(C)C(CCC34CCC(=O)O4)C12'],
  ['비칼루타미드', 'Bicalutamide',
   'CC(O)(CS(=O)(=O)c1ccc(F)cc1)C(=O)Nc1ccc(C#N)c(c1)C(F)(F)F'],
  ['닐루타미드', 'Nilutamide',
   'CC1(C)NC(=O)N(c2ccc([N+](=O)[O-])c(c2)C(F)(F)F)C1=O'],
  ['빈클로졸린', 'Vinclozolin', 'C=CC1(C)OC(=O)N(c2cc(Cl)cc(Cl)c2)C1=O'],
  ['디디이', "p,p'-DDE", 'ClC(Cl)=C(c1ccc(Cl)cc1)c1ccc(Cl)cc1'],
  ['디디티', "p,p'-DDT", 'ClC(Cl)(Cl)C(c1ccc(Cl)cc1)c1ccc(Cl)cc1'],
  ['에스트라디올', 'Estradiol', 'CC12CCC3c4ccc(O)cc4CCC3C1CCC2O'],
  ['에스트론', 'Estrone', 'CC12CCC3c4ccc(O)cc4CCC3C1CCC2=O'],
  ['에티닐에스트라디올', 'Ethinylestradiol', 'CC12CCC3c4ccc(O)cc4CCC3C1CCC2(O)C#C'],
  ['제니스테인', 'Genistein', 'Oc1ccc(cc1)C1=COc2cc(O)cc(O)c2C1=O'],
  ['다이드제인', 'Daidzein', 'Oc1ccc(cc1)C1=COc2cc(O)ccc2C1=O'],
  ['에쿠올', 'Equol', 'Oc1ccc(cc1)C1COc2cc(O)ccc2C1'],
  ['플루타마이드', 'Flutamide', 'CC(C)C(=O)Nc1ccc([N+](=O)[O-])c(c1)C(F)(F)F'],
  ['피나스테리드', 'Finasteride',
   'CC(C)(C)NC(=O)C1CCC2C3CCC4NC(=O)C=CC4(C)C3CCC12C'],
  ['두타스테리드', 'Dutasteride',
   'FC(F)(F)c1ccc(NC(=O)C2CCC3C4CCC5NC(=O)C=CC5(C)C4CCC23C)c(c1)C(F)(F)F'],
  ['디에이치이에이', 'DHEA', 'O=C1CCC2C1(C)CCC1C2CC=C2CC(O)CCC12C'],
  ['안드로스텐디온', 'Androstenedione', 'O=C1CCC2C1(C)CCC1C2CCC2=CC(=O)CCC12C'],
  ['하이드로코르티손', 'Hydrocortisone',
   'OCC(=O)C1(O)CCC2C1(C)CC(O)C1C2CCC2=CC(=O)CCC12C'],
  ['미녹시딜', 'Minoxidil', 'Nc1cc(N)[n+]([O-])c(n1)N1CCCCC1'],
  ['케토코나졸', 'Ketoconazole',
   'CC(=O)N1CCN(CC1)c1ccc(OCC2COC(Cn3ccnc3)(O2)c2ccc(Cl)cc2Cl)cc1'],
  ['베타시토스테롤', 'beta-Sitosterol',
   'CCC(CCC(C)C1CCC2C1(C)CCC1C2CC=C2CC(O)CCC12C)C(C)C'],
  ['레스베라트롤', 'Resveratrol', 'Oc1ccc(cc1)C=Cc1cc(O)cc(O)c1'],
  ['메틸파라벤', 'Methylparaben', 'COC(=O)c1ccc(O)cc1'],
  ['에틸파라벤', 'Ethylparaben', 'CCOC(=O)c1ccc(O)cc1'],
  ['프로필파라벤', 'Propylparaben', 'CCCOC(=O)c1ccc(O)cc1'],
  ['부틸파라벤', 'Butylparaben', 'CCCCOC(=O)c1ccc(O)cc1'],
  ['징크피리치온', 'Zinc pyrithione',
   '[Zn+2].[O-][n+]1ccccc1[S-].[O-][n+]1ccccc1[S-]'],
  ['피록톤올아민', 'Piroctone olamine',
   'CC(C)(C)CC(C)CC1=CC(C)=CC(=O)N1O'],
  ['살리실산', 'Salicylic acid', 'OC(=O)c1ccccc1O'],
  ['나이아신아마이드', 'Niacinamide', 'NC(=O)c1ccncc1'],
  ['아데노신', 'Adenosine', 'Nc1ncnc2c1ncn2C1OC(CO)C(O)C1O'],
  ['판테놀', 'Panthenol', 'CC(C)(CO)C(O)C(=O)NCCCO'],
  ['글리세린', 'Glycerin', 'OCC(O)CO'],
  ['부틸렌글라이콜', 'Butylene glycol', 'CCC(O)CO'],
  ['프로판다이올', 'Propanediol', 'OCCCO'],
  ['토코페롤', 'alpha-Tocopherol',
   'CC1=C(C)C2=C(CCC(C)(CCCC(C)CCCC(C)CCCC(C)C)O2)C(C)=C1O'],
  ['레티놀', 'Retinol', 'CC1=C(C=CC(C)=CC=CC(C)=CCO)C(C)(C)CCC1'],
  ['트레티노인', 'Tretinoin', 'CC1=C(C=CC(C)=CC=CC(C)=CC(=O)O)C(C)(C)CCC1'],
  ['아스코르브산', 'Ascorbic acid', 'OCC(O)C1OC(=O)C(O)=C1O'],
  ['카페인', 'Caffeine', 'CN1C=NC2=C1C(=O)N(C)C(=O)N2C'],
  ['비오틴', 'Biotin', 'OC(=O)CCCCC1SCC2NC(=O)NC12'],
  ['멘톨', 'Menthol', 'CC(C)C1CCC(C)CC1O'],
  ['캠퍼', 'Camphor', 'CC1(C)C2CCC1(C)C(=O)C2'],
  ['리모넨', 'Limonene', 'CC(=C)C1CCC(C)=CC1'],
  ['리날룰', 'Linalool', 'CC(C)=CCCC(C)(O)C=C'],
  ['제라니올', 'Geraniol', 'CC(C)=CCCC(C)=CCO'],
  ['유제놀', 'Eugenol', 'COc1ccc(CC=C)cc1O'],
  ['티몰', 'Thymol', 'CC(C)c1ccc(C)cc1O'],
  ['트리클로산', 'Triclosan', 'Oc1cc(Cl)ccc1Oc1ccc(Cl)cc1Cl'],
  ['벤조페논-3', 'Benzophenone-3', 'COc1ccc(C(=O)c2ccccc2)c(O)c1'],
  ['아보벤존', 'Avobenzone', 'COc1ccc(cc1)C(=O)CC(=O)c1ccc(cc1)C(C)(C)C'],
  ['옥토크릴렌', 'Octocrylene',
   'CCCCC(CC)COC(=O)C(=C(c1ccccc1)c1ccccc1)C#N'],
  ['호모살레이트', 'Homosalate', 'CC1CC(C)(C)CC(C1)OC(=O)c1ccccc1O'],
  ['비사보롤', 'alpha-Bisabolol', 'CC(C)=CCCC(C)(O)C1CCC(C)=CC1'],
  ['알란토인', 'Allantoin', 'NC(=O)NC1NC(=O)NC1=O'],
  ['우레아', 'Urea', 'NC(=O)N'],
  ['알부틴', 'Arbutin', 'OCC1OC(Oc2ccc(O)cc2)C(O)C(O)C1O'],
  ['코직산', 'Kojic acid', 'OCC1=CC(=O)C(O)=CO1'],
  ['하이드로퀴논', 'Hydroquinone', 'Oc1ccc(O)cc1'],
  ['트라넥사민산', 'Tranexamic acid', 'NCC1CCC(CC1)C(=O)O'],
  ['프로시미돈', 'Procymidone', 'CC12CC1(C)C(=O)N(c1cc(Cl)cc(Cl)c1)C2=O'],
  ['리누론', 'Linuron', 'CON(C)C(=O)Nc1ccc(Cl)c(Cl)c1'],
  ['비스페놀에이', 'Bisphenol A', 'CC(C)(c1ccc(O)cc1)c1ccc(O)cc1'],
  ['노닐페놀', 'Nonylphenol', 'CCCCCCCCCc1ccc(O)cc1'],
  ['다이부틸프탈레이트', 'Dibutyl phthalate',
   'CCCCOC(=O)c1ccccc1C(=O)OCCCC'],
  ['다이에틸헥실프탈레이트', 'DEHP',
   'CCCCC(CC)COC(=O)c1ccccc1C(=O)OCC(CC)CCCC'],
  ['메틸이소티아졸리논', 'Methylisothiazolinone', 'CN1SC=CC1=O'],
  ['페녹시에탄올', 'Phenoxyethanol', 'OCCOc1ccccc1'],
  ['벤질알코올', 'Benzyl alcohol', 'OCc1ccccc1'],
  ['소르빈산', 'Sorbic acid', 'CC=CC=CC(=O)O'],
  ['벤조산', 'Benzoic acid', 'OC(=O)c1ccccc1'],
  ['시트르산', 'Citric acid', 'OC(=O)CC(O)(CC(=O)O)C(=O)O'],
  ['젖산', 'Lactic acid', 'CC(O)C(=O)O'],
  ['글라이콜산', 'Glycolic acid', 'OCC(=O)O'],
  ['아젤라산', 'Azelaic acid', 'OC(=O)CCCCCCCC(=O)O'],
  ['스쿠알렌', 'Squalene',
   'CC(C)=CCCC(C)=CCCC(C)=CCCC=C(C)CCC=C(C)CCC=C(C)C'],
  ['올레산', 'Oleic acid', 'CCCCCCCCC=CCCCCCCCC(=O)O'],
  ['리놀레산', 'Linoleic acid', 'CCCCCC=CCC=CCCCCCCCC(=O)O'],
  ['팔미트산', 'Palmitic acid', 'CCCCCCCCCCCCCCCC(=O)O'],
  ['카페산', 'Caffeic acid', 'OC(=O)C=Cc1ccc(O)c(O)c1'],
  ['페룰산', 'Ferulic acid', 'COc1cc(C=CC(=O)O)ccc1O'],
  ['쿼세틴', 'Quercetin', 'Oc1cc(O)c2c(c1)oc(-c1ccc(O)c(O)c1)c(O)c2=O'],
  ['커큐민', 'Curcumin',
   'COc1cc(C=CC(=O)CC(=O)C=Cc2ccc(O)c(OC)c2)ccc1O']
];

/* ---------------------------------------------------------- pocket layout */

var POCKET_RESIDUES = [
  { id: 'Leu704', role: 'hydrophobic' },
  { id: 'Asn705', role: 'D-ring anchor' },
  { id: 'Leu707', role: 'hydrophobic' },
  { id: 'Gln711', role: 'A-ring anchor' },
  { id: 'Met742', role: 'hydrophobic' },
  { id: 'Met745', role: 'hydrophobic' },
  { id: 'Arg752', role: 'A-ring anchor' },
  { id: 'Phe764', role: 'hydrophobic' },
  { id: 'Met787', role: 'hydrophobic' },
  { id: 'Leu873', role: 'hydrophobic' },
  { id: 'Thr877', role: 'D-ring / helix-12' },
  { id: 'Met895', role: 'helix-12 / AF-2' },
  { id: 'Ile899', role: 'helix-12 / AF-2' }
];

var ARING_ANCHORS = ['Gln711', 'Arg752'];
var DRING_ANCHORS = ['Asn705', 'Thr877'];
var HYDROPHOBIC_CORE = ['Leu704', 'Leu707', 'Met742', 'Met745'];
var HYDROPHOBIC_EXT = ['Met787', 'Phe764', 'Leu873'];
var H12_RESIDUES = ['Thr877', 'Met895', 'Ile899'];

/* --------------------------------------------------------- library state */

/* experimental class labels used by the reference library */
var CLASS_LABELS = {
  agonist: '작용제',
  antagonist: '길항제',
  partial: '부분 작용제',
  weak: '약한 상호작용',
  'non-binder': '비결합',
  unknown: '판단 불가'
};

var library = null;

function compileEntry(entry) {
  var mol = AR.parseSmiles(entry.s);
  return {
    n: entry.n,
    s: entry.s,
    p: entry.p,
    c: entry.c || '',
    note: entry.note || '',
    mol: mol,
    fp: AR.morganFingerprint(mol, 2),
    desc: AR.computeDescriptors(mol)
  };
}

function ensureLibrary() {
  if (!library) {
    library = [];
    for (var i = 0; i < REFERENCE_DEFAULT.length; i++) {
      library.push(compileEntry(REFERENCE_DEFAULT[i]));
    }
  }
  return library;
}

function getLibrary() { return ensureLibrary(); }

function libraryAsJson() {
  return ensureLibrary().map(function (e) {
    return { n: e.n, s: e.s, p: e.p, c: e.c, note: e.note };
  });
}

/* Replace the library, skipping entries that fail to parse. */
function setLibrary(entries) {
  if (!Array.isArray(entries)) throw new Error('library must be a JSON array');
  var next = [], skipped = [];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    try {
      if (!e || typeof e.s !== 'string') throw new Error('missing "s" (SMILES)');
      var p = Number(e.p);
      if (!isFinite(p)) throw new Error('missing numeric "p" (pKi)');
      next.push(compileEntry({
        n: String(e.n || e.s), s: e.s, p: p,
        c: e.c || '', note: e.note || ''
      }));
    } catch (err) {
      skipped.push({ entry: e && (e.n || e.s) ? String(e.n || e.s) : '#' + i,
                     reason: err.message });
    }
  }
  if (!next.length) throw new Error('no valid entries in the supplied library');
  library = next;
  return { applied: next.length, skipped: skipped };
}

function resetLibrary() { library = null; return ensureLibrary().length; }

/* -------------------------------------------------------------- rule score */

function ruleScore(desc, motifs, occupancy) {
  var score = 4.0;
  var reasons = [];

  function bump(delta, why) {
    score += delta;
    reasons.push({ delta: delta, why: why });
  }

  if (motifs.steroidKeto3) bump(3.4, '3-keto steroid core: both pocket anchors available');
  else if (motifs.steroid) bump(2.4, 'steroid-like fused ring core');

  if (motifs.steroid && motifs.steroidPolarTail) {
    bump(0.6, 'steroid with a terminal polar group (D-ring hydrogen bonding)');
  }

  var arylEWG = motifs.arylNitrile || motifs.nitro || motifs.arylCF3;
  var amideLike = motifs.amide || motifs.hydantoin || motifs.thiohydantoin;
  if (motifs.nonsteroidalAA) {
    bump(2.9, 'non-steroidal antiandrogen pharmacophore (aryl nitrile/nitro + aryl CF3)');
  } else if (arylEWG && amideLike) {
    bump(2.0, 'aryl electron-withdrawing group with an amide/hydantoin linker');
  }

  if (desc.mw >= 230 && desc.mw <= 480) bump(0.4, 'MW inside the 230-480 window');
  else bump(-0.8, 'MW outside the 230-480 window');

  if (desc.clogp >= 2 && desc.clogp <= 5.5) bump(0.4, 'logP inside the 2-5.5 window');
  if (desc.clogp < 1) bump(-1.0, 'logP below 1: too polar for the hydrophobic cavity');

  if (desc.tpsa > 140) bump(-1.0, 'TPSA above 140');
  if (desc.hbd > 4) bump(-0.8, 'more than 4 hydrogen-bond donors');
  if (desc.rotb > 9) bump(-0.6, 'more than 9 rotatable bonds');
  if (desc.rings === 0) bump(-1.2, 'no ring system');

  if (occupancy > 125) bump(-2.6, 'volume exceeds the cavity by more than 25%');
  else if (occupancy > 105) bump(-1.5, 'volume slightly exceeds the cavity');
  else if (occupancy < 45) bump(-1.1, 'fills less than 45% of the cavity');

  var clamped = Math.max(3.6, Math.min(9.8, score));
  return { score: clamped, raw: score, reasons: reasons };
}

/* ------------------------------------------------------- contact mapping */

function mapContacts(desc, motifs) {
  var contact = {}, clash = {}, notes = [];

  var aringTrigger = motifs.steroidKeto3 || motifs.enone ||
                     motifs.arylNitrile || motifs.nitro || motifs.carboxyl;
  if (aringTrigger) {
    ARING_ANCHORS.forEach(function (r) { contact[r] = true; });
    notes.push('A-ring anchors (Gln711 / Arg752) reachable by the 3-keto enone, ' +
               'aryl nitrile/nitro or carboxyl group');
  }

  var dringTrigger = motifs.hydroxyl || motifs.phenol || motifs.amide ||
                     motifs.tertAlcohol || motifs.hydantoin;
  if (dringTrigger) {
    DRING_ANCHORS.forEach(function (r) { contact[r] = true; });
    notes.push('D-ring anchors (Asn705 / Thr877) reachable by a hydroxyl, ' +
               'phenol, amide, tertiary alcohol or hydantoin');
  }

  if (desc.clogp > 1.5) {
    HYDROPHOBIC_CORE.forEach(function (r) { contact[r] = true; });
    notes.push('lipophilic enough to pack against the Leu/Met hydrophobic wall');
  }
  if (desc.clogp > 2.5 || desc.rings >= 3) {
    HYDROPHOBIC_EXT.forEach(function (r) { contact[r] = true; });
    notes.push('extended hydrophobic contact (Met787 / Phe764 / Leu873)');
  }

  var h12 = false;
  if (motifs.nonsteroidalAA || motifs.thiohydantoin) {
    h12 = true;
    notes.push('helix-12 clash: a bulky non-steroidal scaffold displaces H12');
  } else if (motifs.steroid && (desc.mw > 390 || motifs.sulfonyl || motifs.carboxyl)) {
    h12 = true;
    notes.push('helix-12 clash: steric conflict from a bulky substituent');
  }
  if (h12) {
    H12_RESIDUES.forEach(function (r) { contact[r] = true; clash[r] = true; });
  }

  var aringMet = ARING_ANCHORS.every(function (r) { return contact[r]; });
  var dringMet = DRING_ANCHORS.every(function (r) { return contact[r]; });

  var verdict, verdictKey;
  if (motifs.steroidKeto3 && !h12) {
    verdictKey = 'agonist';
    verdict = '작용제 가능성';
  } else if (h12) {
    verdictKey = 'antagonist';
    verdict = '길항제 가능성';
  } else if (aringMet && dringMet) {
    verdictKey = 'binder';
    verdict = '결합 가능 · 기능 미정';
  } else {
    verdictKey = 'weak';
    verdict = '결합 가능성 낮음';
  }

  var residues = POCKET_RESIDUES.map(function (r) {
    return {
      id: r.id, role: r.role,
      contact: !!contact[r.id], clash: !!clash[r.id]
    };
  });

  return {
    residues: residues,
    contactCount: residues.filter(function (r) { return r.contact; }).length,
    h12Clash: h12,
    aringAnchored: aringMet,
    dringAnchored: dringMet,
    verdict: verdict,
    verdictKey: verdictKey,
    notes: notes
  };
}

/* ------------------------------------------------------------- prediction */

function predict(smiles, options) {
  options = options || {};
  var lib = ensureLibrary();
  var exclude = options.exclude || null;

  var mol = AR.parseSmiles(smiles);
  var desc = AR.computeDescriptors(mol);
  var motifs = AR.detectMotifs(mol);
  var fp = AR.morganFingerprint(mol, 2);

  var volume = AR.mcGowanVolume(mol);
  var occupancy = volume / POCKET_VOLUME * 100;

  var neighbours = [];
  for (var i = 0; i < lib.length; i++) {
    if (exclude && lib[i].n === exclude) continue;
    neighbours.push({
      n: lib[i].n, p: lib[i].p, c: lib[i].c, s: lib[i].s,
      sim: AR.tanimoto(fp, lib[i].fp)
    });
  }
  neighbours.sort(function (a, b) { return b.sim - a.sim; });
  var top = neighbours.slice(0, 5);

  var wsum = 0, psum = 0;
  for (var k = 0; k < top.length; k++) {
    var w = Math.pow(top[k].sim, 3);
    wsum += w; psum += w * top[k].p;
  }
  var readAcross = wsum > 1e-12 ? psum / wsum : 4.0;

  var rules = ruleScore(desc, motifs, occupancy);
  var nearest = top.length ? top[0].sim : 0;

  /* Functional class by read-across. The pocket rules below infer agonism
   * from structure alone; this instead carries over what the neighbours were
   * measured to do, which is the only evidence of function this tool has. */
  var classWeights = {}, classTotal = 0;
  for (var c = 0; c < top.length; c++) {
    var cls = top[c].c || 'unknown';
    var cw = Math.pow(top[c].sim, 3);
    classWeights[cls] = (classWeights[cls] || 0) + cw;
    classTotal += cw;
  }
  var bestClass = null, bestWeight = 0;
  for (var key in classWeights) {
    if (!Object.prototype.hasOwnProperty.call(classWeights, key)) continue;
    if (classWeights[key] > bestWeight) { bestWeight = classWeights[key]; bestClass = key; }
  }
  var functionCall = {
    label: (nearest >= 0.35 && bestClass) ? bestClass : 'unknown',
    support: classTotal > 1e-12 ? bestWeight / classTotal : 0,
    weights: classWeights
  };

  var wRead = nearest >= 0.55 ? 0.78 : (nearest >= 0.35 ? 0.50 : 0.20);
  var pKi = wRead * readAcross + (1 - wRead) * rules.score;

  var domain, ci;
  if (nearest >= 0.55) { domain = 'in'; ci = 0.7; }
  else if (nearest >= 0.35) { domain = 'edge'; ci = 1.1; }
  else { domain = 'out'; ci = 1.6; }

  var pocket = mapContacts(desc, motifs);

  return {
    smiles: smiles,
    mol: mol,
    desc: desc,
    motifs: motifs,
    volume: volume,
    occupancy: occupancy,
    pKi: pKi,
    kiNM: Math.pow(10, 9 - pKi),
    ci: ci,
    domain: domain,
    nearestSim: nearest,
    readAcross: readAcross,
    ruleScore: rules.score,
    ruleRawScore: rules.raw,
    reasons: rules.reasons,
    weightReadAcross: wRead,
    neighbours: top,
    functionCall: functionCall,
    pocket: pocket
  };
}

function lookupName(query) {
  if (!query) return null;
  var q = String(query).trim().toLowerCase().replace(/\s+/g, '');
  for (var i = 0; i < INGREDIENTS.length; i++) {
    var ko = INGREDIENTS[i][0].toLowerCase().replace(/\s+/g, '');
    var en = INGREDIENTS[i][1].toLowerCase().replace(/\s+/g, '');
    if (ko === q || en === q) {
      return { ko: INGREDIENTS[i][0], en: INGREDIENTS[i][1], s: INGREDIENTS[i][2] };
    }
  }
  for (var j = 0; j < INGREDIENTS.length; j++) {
    var ko2 = INGREDIENTS[j][0].toLowerCase().replace(/\s+/g, '');
    var en2 = INGREDIENTS[j][1].toLowerCase().replace(/\s+/g, '');
    if (ko2.indexOf(q) >= 0 || en2.indexOf(q) >= 0) {
      return { ko: INGREDIENTS[j][0], en: INGREDIENTS[j][1], s: INGREDIENTS[j][2] };
    }
  }
  return null;
}

/* Leave-one-out cross validation over the active library. */
function crossValidate() {
  var lib = ensureLibrary();
  var rows = [], sumAbs = 0, sumSq = 0;
  for (var i = 0; i < lib.length; i++) {
    var r = predict(lib[i].s, { exclude: lib[i].n });
    var err = r.pKi - lib[i].p;
    sumAbs += Math.abs(err);
    sumSq += err * err;
    rows.push({ n: lib[i].n, observed: lib[i].p, predicted: r.pKi, error: err,
                domain: r.domain, nearest: r.nearestSim });
  }
  return {
    rows: rows,
    n: rows.length,
    mae: sumAbs / rows.length,
    rmse: Math.sqrt(sumSq / rows.length)
  };
}

module.exports = {
  predict: predict,
  lookupName: lookupName,
  crossValidate: crossValidate,
  getLibrary: getLibrary,
  libraryAsJson: libraryAsJson,
  setLibrary: setLibrary,
  resetLibrary: resetLibrary,
  REFERENCE_DEFAULT: REFERENCE_DEFAULT,
  CLASS_LABELS: CLASS_LABELS,
  INGREDIENTS: INGREDIENTS,
  POCKET_RESIDUES: POCKET_RESIDUES,
  POCKET_VOLUME: POCKET_VOLUME
};
