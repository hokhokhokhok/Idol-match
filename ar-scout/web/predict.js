/* predict.js — read-across + pharmacophore rules + AR LBD contact mapping.
 *
 * The reference pKi values are competitive-binding literature values. They
 * carry +-0.5 to 1 log of inter-laboratory spread, which bounds how good any
 * model fitted to them can be.
 */
'use strict';

var AR = require('./armodel.js');

/* The cut used for "too big to fit", in McGowan volume units.
 *
 * This was written as "AR LBD cavity, 400 A^3" and treated as a physical
 * constant - occupancy percentages all over the UI are computed against
 * it. It was never measured. A grid scan of the 2AM9 site gives 179 A^3
 * for the probe-accessible volume, which is a different quantity from a
 * McGowan ligand volume and cannot be compared to it directly, so that
 * does not settle the number either.
 *
 * What is measured is the cut. Over the 94 dictionary compounds with a
 * Tox21 verdict, no compound above this volume is active, and the result
 * is stable anywhere from 380 to 420: below 380 it starts discarding real
 * ligands, above 450 it starts letting false positives back in. But the
 * plateau is set by two molecules - the largest active is 376 and the
 * smallest inactive above it is 387 - so it is an empirical threshold with
 * an 11 A^3 margin, not a cavity measurement. "점유율" should be read as
 * "fraction of that cut", not as how full the pocket is. */
var POCKET_VOLUME = 400;

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
    s: 'NC(=O)c1ccncc1', note: 'nominal inactive floor; Tox21 AR assays measured inactive in all three' },
  { n: 'Caffeine', p: 4.00, c: 'non-binder',
    s: 'CN1C=NC2=C1C(=O)N(C)C(=O)N2C', note: 'nominal inactive floor; Tox21 AR assays measured inactive in all three' },
  { n: 'Panthenol', p: 4.00, c: 'non-binder',
    s: 'CC(C)(CO)C(O)C(=O)NCCCO', note: 'nominal inactive floor; Tox21 AR assays measured inactive in all three' }
];

/* ------------------------------------------- ingredient name dictionary */

/* INGREDIENTS:BEGIN — generated by local/fetch_ingredients.py, do not hand-edit */
var INGREDIENTS = [
  ["메트리볼론", "Metribolone", "C[C@]1(O)CC[C@H]2[C@@H]3CCC4=CC(=O)CCC4=C3C=C[C@@]21C", ["R1881", "R-1881"]],
  ["트렌볼론", "Trenbolone", "C[C@]12C=CC3=C4CCC(=O)C=C4CCC3C1CC[C@@H]2O"],
  ["디하이드로테스토스테론", "Dihydrotestosterone", "CC12CCC3C(CCC4C3CCC4O)C1(C)CCC(=O)C2", ["DHT", "안드로스타놀론", "Androstanolone", "스타놀론"]],
  ["난드롤론", "Nandrolone", "C[C@]12CC[C@H]3[C@@H](CCC4=CC(=O)CC[C@@H]43)[C@@H]1CC[C@@H]2O", ["19-노르테스토스테론"]],
  ["테스토스테론", "Testosterone", "C[C@]12CC[C@H]3[C@@H](CCC4=CC(=O)CC[C@@]43C)[C@@H]1CC[C@@H]2O"],
  ["메틸테스토스테론", "Methyltestosterone", "C[C@]12CCC(=O)C=C1CC[C@@H]1[C@@H]2CC[C@@]2(C)[C@H]1CC[C@]2(C)O"],
  ["메스테롤론", "Mesterolone", "C[C@H]1CC(=O)C[C@@H]2CC[C@H]3[C@@H]4CC[C@H](O)[C@@]4(C)CC[C@@H]3[C@]21C"],
  ["볼데논", "Boldenone", "CC12C=CC(=O)C=C1CCC1C2CCC2(C)C(O)CCC12"],
  ["스타노졸올", "Stanozolol", "C[C@]12Cc3c[nH]nc3C[C@@H]1CC[C@@H]1[C@@H]2CC[C@@]2(C)[C@H]1CC[C@]2(C)O"],
  ["옥산드롤론", "Oxandrolone", "C[C@]12COC(=O)C[C@@H]1CC[C@@H]1[C@@H]2CC[C@@]2(C)[C@H]1CC[C@]2(C)O"],
  ["옥시메톨론", "Oxymetholone", "C[C@]12C/C(=C/O)C(=O)C[C@@H]1CC[C@@H]1[C@@H]2CC[C@@]2(C)[C@H]1CC[C@]2(C)O"],
  ["다나졸", "Danazol", "C#C[C@]1(O)CC[C@H]2[C@@H]3CCC4=Cc5oncc5C[C@]4(C)[C@H]3CC[C@@]21C"],
  ["안드로스테론", "Androsterone", "CC12CCC3C(CCC4CC(O)CCC43C)C1CCC2=O"],
  ["에피안드로스테론", "Epiandrosterone", "C[C@]12CC[C@H](O)C[C@@H]1CC[C@@H]1[C@H]2CC[C@]2(C)C(=O)CC[C@@H]12"],
  ["디에이치이에이", "DHEA", "C[C@]12CC[C@H](O)CC1=CC[C@@H]1[C@@H]2CC[C@]2(C)C(=O)CC[C@@H]12", ["Dehydroepiandrosterone", "데하이드로에피안드로스테론", "프라스테론"]],
  ["안드로스텐디온", "Androstenedione", "C[C@]12CCC(=O)C=C1CC[C@@H]1[C@@H]2CC[C@]2(C)C(=O)CC[C@@H]12"],
  ["아비라테론", "Abiraterone", "C[C@]12CC[C@H](O)CC1=CC[C@@H]1[C@@H]2CC[C@]2(C)C(c3cccnc3)=CC[C@@H]12"],
  ["알파트라디올", "Alfatradiol", "C[C@]12CC[C@@H]3c4ccc(O)cc4CC[C@H]3[C@@H]1CC[C@H]2O", ["17알파에스트라디올"]],
  ["비칼루타미드", "Bicalutamide", "CC(O)(CS(=O)(=O)c1ccc(F)cc1)C(=O)Nc1ccc(C#N)c(C(F)(F)F)c1"],
  ["엔잘루타미드", "Enzalutamide", "CNC(=O)c1ccc(N2C(=S)N(c3ccc(C#N)c(C(F)(F)F)c3)C(=O)C2(C)C)cc1F", ["MDV3100"]],
  ["아팔루타미드", "Apalutamide", "CNC(=O)c1ccc(N2C(=S)N(c3cnc(C#N)c(C(F)(F)F)c3)C(=O)C23CCC3)cc1F", ["ARN-509"]],
  ["다롤루타미드", "Darolutamide", "CC(O)c1cc(C(=O)N[C@@H](C)Cn2ccc(-c3ccc(C#N)c(Cl)c3)n2)n[nH]1", ["ODM-201"]],
  ["닐루타미드", "Nilutamide", "CC1(C)NC(=O)N(c2ccc([N+](=O)[O-])c(C(F)(F)F)c2)C1=O"],
  ["플루타마이드", "Flutamide", "CC(C)C(=O)Nc1ccc([N+](=O)[O-])c(C(F)(F)F)c1"],
  ["하이드록시플루타마이드", "Hydroxyflutamide", "CC(C)(O)C(=O)Nc1ccc([N+](=O)[O-])c(C(F)(F)F)c1", ["2-하이드록시플루타마이드"]],
  ["사이프로테론아세테이트", "Cyproterone acetate", "CC(=O)O[C@]1(C(C)=O)CC[C@H]2[C@@H]3C=C(Cl)C4=CC(=O)[C@@H]5C[C@@H]5[C@]4(C)C3CC[C@@]21C", ["CPA", "사이프로테론"]],
  ["스피로노락톤", "Spironolactone", "CC(=O)S[C@@H]1CC2=CC(=O)CC[C@]2(C)[C@H]2CC[C@@]3(C)[C@@H](CC[C@@]34CCC(=O)O4)[C@H]12"],
  ["클라스코테론", "Clascoterone", "CCC(=O)O[C@]1(C(=O)CO)CC[C@H]2[C@@H]3CCC4=CC(=O)CC[C@]4(C)[C@H]3CC[C@@]21C", ["코르텍솔론17알파프로피오네이트", "CB-03-01"]],
  ["피나스테리드", "Finasteride", "CC(C)(C)NC(=O)[C@H]1CC[C@H]2[C@H]3CC[C@H]4NC(=O)C=C[C@]4(C)[C@H]3CC[C@]12C"],
  ["두타스테리드", "Dutasteride", "C[C@]12C=CC(=O)N[C@@H]1CC[C@@H]1[C@@H]2CC[C@]2(C)[C@@H](C(=O)Nc3cc(C(F)(F)F)ccc3C(F)(F)F)CC[C@@H]12"],
  ["프로게스테론", "Progesterone", "CC(=O)[C@H]1CC[C@H]2[C@@H]3CCC4=CC(=O)CC[C@]4(C)[C@H]3CC[C@]12C"],
  ["메드록시프로게스테론아세테이트", "Medroxyprogesterone acetate", "CC(=O)O[C@]1(C(C)=O)CCC2C3C[C@H](C)C4=CC(=O)CCC4(C)C3CCC21C", ["MPA"]],
  ["메게스트롤아세테이트", "Megestrol acetate", "CC(=O)O[C@]1(C(C)=O)CC[C@H]2[C@@H]3C=C(C)C4=CC(=O)CC[C@]4(C)[C@H]3CC[C@@]21C"],
  ["클로르마디논아세테이트", "Chlormadinone acetate", "CC(=O)O[C@]1(C(C)=O)CC[C@H]2[C@@H]3C=C(Cl)C4=CC(=O)CC[C@]4(C)[C@H]3CC[C@@]21C"],
  ["드로스피레논", "Drospirenone", "C[C@]12CCC(=O)C=C1[C@@H]1C[C@@H]1[C@H]1[C@@H]3[C@@H]4C[C@@H]4[C@@]4(CCC(=O)O4)[C@@]3(C)CC[C@@H]12"],
  ["디에노게스트", "Dienogest", "C[C@]12CCC3=C4CCC(=O)C=C4CC[C@H]3[C@@H]1CC[C@@]2(O)CC#N"],
  ["노르에티스테론", "Norethisterone", "C#C[C@]1(O)CC[C@H]2[C@@H]3CCC4=CC(=O)CC[C@@H]4[C@H]3CC[C@@]21C", ["노르에틴드론", "Norethindrone"]],
  ["레보노르게스트렐", "Levonorgestrel", "C#C[C@]1(O)CC[C@H]2[C@@H]3CCC4=CC(=O)CC[C@@H]4[C@H]3CC[C@@]21CC"],
  ["티볼론", "Tibolone", "C#C[C@]1(O)CC[C@H]2[C@@H]3[C@H](C)CC4=C(CCC(=O)C4)[C@H]3CC[C@@]21C"],
  ["에스트라디올", "Estradiol", "CC12CCC3c4ccc(O)cc4CCC3C1CCC2O", ["17베타에스트라디올"]],
  ["에스트론", "Estrone", "CC12CCC3c4ccc(O)cc4CCC3C1CCC2=O"],
  ["에스트리올", "Estriol", "C[C@]12CC[C@@H]3c4ccc(O)cc4CC[C@H]3[C@@H]1C[C@@H](O)[C@@H]2O"],
  ["에티닐에스트라디올", "Ethinylestradiol", "C#C[C@]1(O)CC[C@H]2[C@@H]3CCc4cc(O)ccc4[C@H]3CC[C@@]21C"],
  ["하이드로코르티손", "Hydrocortisone", "OCC(=O)C1(O)CCC2C1(C)CC(O)C1C2CCC2=CC(=O)CCC12C", ["코르티솔"]],
  ["덱사메타손", "Dexamethasone", "C[C@@H]1C[C@H]2[C@@H]3CCC4=CC(=O)C=C[C@]4(C)[C@@]3(F)[C@@H](O)C[C@]2(C)[C@@]1(O)C(=O)CO"],
  ["프레드니솔론", "Prednisolone", "OCC(=O)C1(O)CCC2C1(C)CC(O)C1C2CCC2=CC(=O)C=CC12C"],
  ["코르티코스테론", "Corticosterone", "C[C@]12C[C@H](O)[C@H]3[C@@H](CCC4=CC(=O)CC[C@@]43C)[C@@H]1CC[C@@H]2C(=O)CO"],
  ["알도스테론", "Aldosterone", "CC12CCC(=O)C=C1CCC1C2C(O)CC2(C=O)C(C(=O)CO)CCC12"],
  ["프레그네놀론", "Pregnenolone", "CC(=O)C1CCC2C1(C)CCC1C2CC=C2CC(O)CCC12C"],
  ["콜레스테롤", "Cholesterol", "CC(C)CCCC(C)C1CCC2C3CC=C4CC(O)CCC4(C)C3CCC12C"],
  ["피세틴", "Fisetin", "O=c1c(O)c(-c2ccc(O)c(O)c2)oc2cc(O)ccc12"],
  ["퀘르세틴", "Quercetin", "O=c1c(O)c(-c2ccc(O)c(O)c2)oc2cc(O)cc(O)c12"],
  ["루테올린", "Luteolin", "O=c1cc(-c2ccc(O)c(O)c2)oc2cc(O)cc(O)c12"],
  ["아피제닌", "Apigenin", "O=c1cc(-c2ccc(O)cc2)oc2cc(O)cc(O)c12"],
  ["켐페롤", "Kaempferol", "O=c1c(O)c(-c2ccc(O)cc2)oc2cc(O)cc(O)c12", ["캠페롤"]],
  ["미리세틴", "Myricetin", "O=c1c(O)c(-c2cc(O)c(O)c(O)c2)oc2cc(O)cc(O)c12"],
  ["나린제닌", "Naringenin", "O=C1C[C@@H](c2ccc(O)cc2)Oc2cc(O)cc(O)c21"],
  ["헤스페레틴", "Hesperetin", "COc1ccc([C@@H]2CC(=O)c3c(O)cc(O)cc3O2)cc1O"],
  ["바이칼레인", "Baicalein", "O=c1cc(-c2ccccc2)oc2cc(O)c(O)c(O)c12"],
  ["크리신", "Chrysin", "O=c1cc(-c2ccccc2)oc2cc(O)cc(O)c12"],
  ["갈랑긴", "Galangin", "O=c1c(O)c(-c2ccccc2)oc2cc(O)cc(O)c12"],
  ["모린", "Morin", "O=c1c(O)c(-c2ccc(O)cc2O)oc2cc(O)cc(O)c12"],
  ["타실리폴린", "Taxifolin", "O=C1c2c(O)cc(O)cc2O[C@H](c2ccc(O)c(O)c2)[C@H]1O", ["디하이드로퀘르세틴"]],
  ["제니스테인", "Genistein", "O=c1c(-c2ccc(O)cc2)coc2cc(O)cc(O)c12"],
  ["다이드제인", "Daidzein", "O=c1c(-c2ccc(O)cc2)coc2cc(O)ccc12"],
  ["글리시테인", "Glycitein", "COc1cc2c(=O)c(-c3ccc(O)cc3)coc2cc1O"],
  ["비오카닌에이", "Biochanin A", "COc1ccc(-c2coc3cc(O)cc(O)c3c2=O)cc1", ["비오카닌A"]],
  ["포르모노네틴", "Formononetin", "COc1ccc(-c2coc3cc(O)ccc3c2=O)cc1"],
  ["에쿠올", "Equol", "Oc1ccc([C@H]2COc3cc(O)ccc3C2)cc1"],
  ["쿠메스트롤", "Coumestrol", "O=c1oc2cc(O)ccc2c2oc3cc(O)ccc3c12"],
  ["푸에라린", "Puerarin", "O=c1c(-c2ccc(O)cc2)coc2c([C@@H]3O[C@H](CO)[C@@H](O)[C@H](O)[C@H]3O)c(O)ccc12"],
  ["카테킨", "Catechin", "Oc1cc(O)c2c(c1)OC(c1ccc(O)c(O)c1)C(O)C2"],
  ["에피카테킨", "Epicatechin", "Oc1cc(O)c2c(c1)O[C@H](c1ccc(O)c(O)c1)[C@H](O)C2"],
  ["에피갈로카테킨갈레이트", "Epigallocatechin gallate", "O=C(O[C@@H]1Cc2c(O)cc(O)cc2O[C@@H]1c1cc(O)c(O)c(O)c1)c1cc(O)c(O)c(O)c1", ["EGCG"]],
  ["실리비닌", "Silibinin", "COc1cc([C@H]2Oc3cc([C@H]4Oc5cc(O)c(O)cc5C(=O)[C@@H]4O)ccc3O[C@@H]2CO)ccc1O", ["실리마린", "Silymarin"]],
  ["플로레틴", "Phloretin", "O=C(CCc1ccc(O)cc1)c1c(O)cc(O)cc1O"],
  ["레스베라트롤", "Resveratrol", "Oc1ccc(/C=C/c2cc(O)cc(O)c2)cc1"],
  ["프테로스틸벤", "Pterostilbene", "COc1cc(C=Cc2ccc(O)cc2)cc(OC)c1"],
  ["커큐민", "Curcumin", "COc1cc(/C=C/C(=O)CC(=O)/C=C/c2ccc(O)c(OC)c2)ccc1O"],
  ["갈산", "Gallic acid", "O=C(O)c1cc(O)c(O)c(O)c1", ["몰식자산"]],
  ["엘라그산", "Ellagic acid", "O=c1oc2c(O)c(O)cc3c(=O)oc4c(O)c(O)cc1c4c23"],
  ["클로로젠산", "Chlorogenic acid", "O=C(/C=C/c1ccc(O)c(O)c1)O[C@@H]1C[C@](O)(C(=O)O)C[C@@H](O)[C@H]1O"],
  ["로즈마린산", "Rosmarinic acid", "O=C(/C=C/c1ccc(O)c(O)c1)O[C@H](Cc1ccc(O)c(O)c1)C(=O)O"],
  ["카페산", "Caffeic acid", "O=C(O)/C=C/c1ccc(O)c(O)c1"],
  ["페룰산", "Ferulic acid", "COc1cc(/C=C/C(=O)O)ccc1O"],
  ["바쿠치올", "Bakuchiol", "C=C[C@@](C)(/C=C/c1ccc(O)cc1)CCC=C(C)C"],
  ["글리시레틴산", "Glycyrrhetinic acid", "CC1(C)[C@@H](O)CC[C@]2(C)[C@H]3C(=O)C=C4[C@H]5C[C@@](C)(C(=O)O)CC[C@]5(C)CC[C@@]4(C)[C@]3(C)CC[C@@H]12", ["엔녹솔론", "Enoxolone"]],
  ["아시아틱산", "Asiatic acid", "C[C@H]1[C@H](C)CC[C@]2(C(=O)O)CC[C@]3(C)C(=CC[C@@H]4[C@@]5(C)C[C@@H](O)[C@H](O)[C@@](C)(CO)[C@@H]5CC[C@]43C)[C@H]12"],
  ["우르솔산", "Ursolic acid", "C[C@H]1[C@H](C)CC[C@]2(C(=O)O)CC[C@]3(C)C(=CC[C@@H]4[C@@]5(C)CC[C@H](O)C(C)(C)[C@@H]5CC[C@]43C)[C@H]12"],
  ["베타시토스테롤", "beta-Sitosterol", "CC[C@H](CC[C@@H](C)[C@H]1CC[C@H]2[C@@H]3CC=C4C[C@@H](O)CC[C@]4(C)[C@H]3CC[C@]12C)C(C)C", ["시토스테롤"]],
  ["레티놀", "Retinol", "CC1=C(/C=C/C(C)=C/C=C/C(C)=C/CO)C(C)(C)CCC1", ["비타민A"]],
  ["레티날", "Retinal", "CC1=C(/C=C/C(C)=C/C=C\\C(C)=C\\C=O)C(C)(C)CCC1", ["레티날데하이드"]],
  ["트레티노인", "Tretinoin", "CC1=C(/C=C/C(C)=C/C=C/C(C)=C/C(=O)O)C(C)(C)CCC1", ["레티노산", "올트랜스레티노산"]],
  ["아이소트레티노인", "Isotretinoin", "CC1=C(/C=C/C(C)=C/C=C/C(C)=C\\C(=O)O)C(C)(C)CCC1"],
  ["아다팔렌", "Adapalene", "COc1ccc(-c2ccc3cc(C(=O)O)ccc3c2)cc1C12CC3CC(CC(C3)C1)C2"],
  ["타자로텐", "Tazarotene", "CCOC(=O)c1ccc(C#Cc2ccc3c(c2)C(C)(C)CCS3)nc1"],
  ["레티닐팔미테이트", "Retinyl palmitate", "CCCCCCCCCCCCCCCC(=O)OC/C=C(C)/C=C/C=C(C)/C=C/C1=C(C)CCCC1(C)C"],
  ["레티닐아세테이트", "Retinyl acetate", "CC(=O)OC/C=C(C)/C=C/C=C(C)/C=C/C1=C(C)CCCC1(C)C"],
  ["아스코브산", "Ascorbic acid", "O=C1O[C@H]([C@@H](O)CO)C(O)=C1O", ["비타민C", "아스코빅애씨드"]],
  ["아스코빌팔미테이트", "Ascorbyl palmitate", "CCCCCCCCCCCCCCCC(=O)OC[C@H](O)C1OC(=O)C(O)=C1O"],
  ["나이아신아마이드", "Niacinamide", "NC(=O)c1cccnc1", ["니코틴아마이드", "Nicotinamide", "비타민B3"]],
  ["판테놀", "Panthenol", "CC(C)(CO)[C@@H](O)C(=O)NCCCO", ["덱스판테놀", "프로비타민B5"]],
  ["비오틴", "Biotin", "O=C(O)CCCC[C@@H]1SC[C@@H]2NC(=O)N[C@@H]21", ["비타민B7"]],
  ["토코페롤", "alpha-Tocopherol", "Cc1c(C)c2c(c(C)c1O)CC[C@@](C)(CCC[C@H](C)CCC[C@H](C)CCCC(C)C)O2", ["비타민E", "알파토코페롤"]],
  ["유비퀴논", "Ubiquinone", "COC1=C(OC)C(=O)C(C)=C(CC=C(C)CCC=C(C)CCC=C(C)CCC=C(C)CCC=C(C)CCC=C(C)CCC=C(C)CCC=C(C)CCC=C(C)CCC=C(C)C)C1=O", ["코엔자임Q10", "CoQ10"]],
  ["멜라토닌", "Melatonin", "COc1ccc2[nH]cc(CCNC(C)=O)c2c1"],
  ["아데노신", "Adenosine", "Nc1ncnc2c1ncn2C1O[C@H](CO)[C@@H](O)[C@H]1O"],
  ["카페인", "Caffeine", "Cn1c(=O)c2c(ncn2C)n(C)c1=O"],
  ["하이드로퀴논", "Hydroquinone", "Oc1ccc(O)cc1"],
  ["알부틴", "Arbutin", "OC[C@H]1O[C@@H](Oc2ccc(O)cc2)[C@H](O)[C@@H](O)[C@@H]1O", ["베타아르부틴"]],
  ["알파알부틴", "alpha-Arbutin", "OCC1OC(Oc2ccc(O)cc2)C(O)C(O)C1O", ["알파아르부틴"]],
  ["데옥시알부틴", "Deoxyarbutin", "Oc1ccc(OC2CCCCO2)cc1"],
  ["코직산", "Kojic acid", "O=c1cc(CO)occ1O", ["코지산"]],
  ["트라넥삼산", "Tranexamic acid", "NC[C@H]1CC[C@H](C(=O)O)CC1", ["트라넥사민산"]],
  ["살리실산", "Salicylic acid", "O=C(O)c1ccccc1O", ["BHA", "살리실릭애씨드"]],
  ["글라이콜산", "Glycolic acid", "O=C(O)CO", ["글리콜산", "AHA"]],
  ["젖산", "Lactic acid", "CC(O)C(=O)O", ["락틱애씨드"]],
  ["만델산", "Mandelic acid", "O=C(O)C(O)c1ccccc1"],
  ["아젤라산", "Azelaic acid", "O=C(O)CCCCCCCC(=O)O", ["아젤라익애씨드"]],
  ["시트르산", "Citric acid", "O=C(O)CC(O)(CC(=O)O)C(=O)O", ["구연산"]],
  ["알란토인", "Allantoin", "NC(=O)NC1NC(=O)NC1=O"],
  ["우레아", "Urea", "NC(N)=O", ["요소"]],
  ["엑토인", "Ectoine", "C=C1NCC[C@@H](C(=O)O)N1"],
  ["나이아신", "Nicotinic acid", "O=C(O)c1cccnc1", ["니코틴산"]],
  ["미녹시딜", "Minoxidil", "Nc1cc(N2CCCCC2)nc(N)[n+]1[O-]"],
  ["케토코나졸", "Ketoconazole", "CC(=O)N1CCN(c2ccc(OC[C@@H]3CO[C@@](Cn4ccnc4)(c4ccc(Cl)cc4Cl)O3)cc2)CC1"],
  ["클림바졸", "Climbazole", "CC(C)(C)C(=O)C(Oc1ccc(Cl)cc1)n1ccnc1"],
  ["시클로피록스", "Ciclopirox", "Cc1cc(C2CCCCC2)n(O)c(=O)c1"],
  ["피록톤올아민", "Piroctone olamine", "Cc1cc(CC(C)CC(C)(C)C)n(O)c(=O)c1", ["옥토피록스"]],
  ["징크피리치온", "Zinc pyrithione", "[O-][n+]1ccccc1[S-].[O-][n+]1ccccc1[S-].[Zn+2]", ["ZPT"]],
  ["캡사이신", "Capsaicin", "COc1cc(CNC(=O)CCCC/C=C/C(C)C)ccc1O"],
  ["비마토프로스트", "Bimatoprost", "CCNC(=O)CCC/C=C\\C[C@@H]1[C@@H](/C=C/[C@@H](O)CCc2ccccc2)[C@H](O)C[C@@H]1O"],
  ["라타노프로스트", "Latanoprost", "CC(C)OC(=O)CCC/C=C\\C[C@@H]1[C@@H](CC[C@@H](O)CCc2ccccc2)[C@H](O)C[C@@H]1O"],
  ["세티리진", "Cetirizine", "O=C(O)COCCN1CCN([C@@H](c2ccccc2)c2ccc(Cl)cc2)CC1"],
  ["토파시티닙", "Tofacitinib", "CC1CCN(C(=O)CC#N)CC1N(C)c1ncnc2[nH]ccc12"],
  ["바리시티닙", "Baricitinib", "CCS(=O)(=O)N1CC(CC#N)(n2cc(-c3ncnc4[nH]ccc34)cn2)C1"],
  ["메틸파라벤", "Methylparaben", "COC(=O)c1ccc(O)cc1"],
  ["에틸파라벤", "Ethylparaben", "CCOC(=O)c1ccc(O)cc1"],
  ["프로필파라벤", "Propylparaben", "CCCOC(=O)c1ccc(O)cc1"],
  ["부틸파라벤", "Butylparaben", "CCCCOC(=O)c1ccc(O)cc1"],
  ["아이소부틸파라벤", "Isobutylparaben", "CC(C)COC(=O)c1ccc(O)cc1"],
  ["벤질파라벤", "Benzylparaben", "O=C(OCc1ccccc1)c1ccc(O)cc1"],
  ["페녹시에탄올", "Phenoxyethanol", "OCCOc1ccccc1"],
  ["벤질알코올", "Benzyl alcohol", "OCc1ccccc1"],
  ["벤조산", "Benzoic acid", "O=C(O)c1ccccc1"],
  ["소르브산", "Sorbic acid", "CC=CC=CC(=O)O", ["소르빈산"]],
  ["트리클로산", "Triclosan", "Oc1cc(Cl)ccc1Oc1ccc(Cl)cc1Cl"],
  ["트리클로카반", "Triclocarban", "O=C(Nc1ccc(Cl)cc1)Nc1ccc(Cl)c(Cl)c1"],
  ["메틸아이소티아졸리논", "Methylisothiazolinone", "CN1SC=CC1=O", ["MIT"]],
  ["유제놀", "Eugenol", "C=CCc1ccc(O)c(OC)c1"],
  ["티몰", "Thymol", "Cc1ccc(C(C)C)c(O)c1"],
  ["리날룰", "Linalool", "C=CC(C)(O)CCC=C(C)C"],
  ["제라니올", "Geraniol", "CC(C)=CCC/C(C)=C/CO"],
  ["시트로넬올", "Citronellol", "CC(C)=CCCC(C)CCO"],
  ["파네솔", "Farnesol", "CC(C)=CCC/C(C)=C/CC/C(C)=C/CO"],
  ["리모넨", "Limonene", "C=C(C)[C@H]1CC=C(C)CC1"],
  ["멘톨", "Menthol", "CC1CCC(C(C)C)C(O)C1"],
  ["캠퍼", "Camphor", "CC12CCC(CC1=O)C2(C)C"],
  ["비사보롤", "alpha-Bisabolol", "CC(C)=CCC[C@@](C)(O)[C@H]1CC=C(C)CC1", ["레보메놀"]],
  ["벤질살리실레이트", "Benzyl salicylate", "O=C(OCc1ccccc1)c1ccccc1O"],
  ["벤질벤조에이트", "Benzyl benzoate", "O=C(OCc1ccccc1)c1ccccc1"],
  ["벤조페논-3", "Benzophenone-3", "COc1ccc(C(=O)c2ccccc2)c(O)c1", ["옥시벤존", "Oxybenzone"]],
  ["벤조페논-4", "Benzophenone-4", "COc1cc(O)c(C(=O)c2ccccc2)cc1S(=O)(=O)O", ["술리소벤존"]],
  ["아보벤존", "Avobenzone", "COc1ccc(C(=O)CC(=O)c2ccc(C(C)(C)C)cc2)cc1"],
  ["옥토크릴렌", "Octocrylene", "CCCCC(CC)COC(=O)C(C#N)=C(c1ccccc1)c1ccccc1"],
  ["호모살레이트", "Homosalate", "CC1CC(OC(=O)c2ccccc2O)CC(C)(C)C1"],
  ["옥티노세이트", "Octinoxate", "CCCCC(CC)COC(=O)C=Cc1ccc(OC)cc1", ["에틸헥실메톡시신나메이트", "옥틸메톡시신나메이트"]],
  ["옥티살레이트", "Octisalate", "CCCCC(CC)COC(=O)c1ccccc1O", ["에틸헥실살리실레이트"]],
  ["엔자카멘", "Enzacamene", "Cc1ccc(/C=C2/C(=O)C3(C)CCC2C3(C)C)cc1", ["4-MBC"]],
  ["파디메이트오", "Padimate O", "CCCCC(CC)COC(=O)c1ccc(N(C)C)cc1"],
  ["비스페놀에이", "Bisphenol A", "CC(C)(c1ccc(O)cc1)c1ccc(O)cc1", ["BPA"]],
  ["비스페놀에스", "Bisphenol S", "Oc1ccc(cc1)S(=O)(=O)c1ccc(O)cc1", ["BPS"]],
  ["비스페놀에프", "Bisphenol F", "Oc1ccc(Cc2ccc(O)cc2)cc1", ["BPF"]],
  ["노닐페놀", "Nonylphenol", "CCCCCCCCCc1ccc(O)cc1"],
  ["옥틸페놀", "4-Octylphenol", "CCCCCCCCc1ccc(O)cc1"],
  ["디부틸프탈레이트", "Dibutyl phthalate", "CCCCOC(=O)c1ccccc1C(=O)OCCCC", ["DBP"]],
  ["디에틸프탈레이트", "Diethyl phthalate", "CCOC(=O)c1ccccc1C(=O)OCC", ["DEP"]],
  ["벤질부틸프탈레이트", "Benzyl butyl phthalate", "CCCCOC(=O)c1ccccc1C(=O)OCc1ccccc1", ["BBP"]],
  ["빈클로졸린", "Vinclozolin", "C=CC1(C)OC(=O)N(c2cc(Cl)cc(Cl)c2)C1=O"],
  ["프로시미돈", "Procymidone", "CC12CC1(C)C(=O)N(c1cc(Cl)cc(Cl)c1)C2=O"],
  ["리누론", "Linuron", "CON(C)C(=O)Nc1ccc(Cl)c(Cl)c1"],
  ["프로클로라즈", "Prochloraz", "CCCN(CCOc1c(Cl)cc(Cl)cc1Cl)C(=O)n1ccnc1"],
  ["아트라진", "Atrazine", "CCNc1nc(Cl)nc(NC(C)C)n1"],
  ["메톡시클로르", "Methoxychlor", "COc1ccc(C(c2ccc(OC)cc2)C(Cl)(Cl)Cl)cc1"],
  ["페니트로티온", "Fenitrothion", "COP(=S)(OC)Oc1ccc([N+](=O)[O-])c(C)c1"],
  ["에틸아스코빌에터", "3-O-Ethyl ascorbic acid", "CCOC1=C(O)C(=O)OC1C(O)CO", ["에틸아스코빅애씨드", "3-O-에틸아스코브산", "Ethyl ascorbic acid"]],
  ["아스코빌글루코사이드", "Ascorbyl glucoside", "OCC(O)C1OC(=O)C(OC2OC(CO)C(O)C(O)C2O)=C1O", ["AA2G", "아스코빌글루코사이드"]],
  ["테트라헥실데실아스코베이트", "Tetrahexyldecyl ascorbate", "CCCCCCCCC(CCCCCC)C(=O)OCC(OC(=O)C(CCCCCC)CCCCCCCC)C1OC(=O)C(OC(=O)C(CCCCCC)CCCCCCCC)=C1OC(=O)C(CCCCCC)CCCCCCCC", ["THDA", "비타민C유도체"]],
  ["하이드록시피나콜론레티노에이트", "Hydroxypinacolone retinoate", "CC1=C(C=CC(C)=CC=CC(C)=CC(=O)OCC(=O)C(C)(C)C)C(C)(C)CCC1", ["HPR", "그라나틱애씨드"]],
  ["레티닐프로피오네이트", "Retinyl propionate", "CC1=C(C=CC(C)=CC=CC(C)=CCOC(=O)CC)C(C)(C)CCC1"],
  ["토코페릴아세테이트", "Tocopheryl acetate", "CC(=O)Oc1c(C)c(C)c2c(c1C)CC[C@@](C)(CCC[C@H](C)CCC[C@H](C)CCCC(C)C)O2", ["비타민E아세테이트"]],
  ["마그네슘아스코빌포스페이트", "Magnesium ascorbyl phosphate", "O=C1O[C@H]([C@@H](O)CO)C(O)=C1OP(=O)([O-])[O-].[Mg+2]", ["MAP"]],
  ["다이포타슘글리시리제이트", "Dipotassium glycyrrhizate", "CC1(C)[C@@H](O[C@H]2O[C@H](C(=O)[O-])[C@@H](O)[C@H](O)[C@H]2O[C@@H]2O[C@H](C(=O)[O-])[C@@H](O)[C@H](O)[C@H]2O)CC[C@]2(C)[C@H]3C(=O)C=C4[C@@H]5C[C@@](C)(C(=O)O)CC[C@]5(C)CC[C@@]4(C)[C@]3(C)CC[C@@H]12.[K+].[K+]", ["글리시리진산이칼륨"]],
  ["글리세릴글루코사이드", "Glyceryl glucoside", "OCC(O)COC1OC(CO)C(O)C(O)C1O"],
  ["글리세린", "Glycerin", "OCC(O)CO", ["글리세롤"]],
  ["부틸렌글라이콜", "Butylene glycol", "CC(O)CCO", ["1,3-부틸렌글라이콜"]],
  ["프로판다이올", "Propanediol", "OCCCO"],
  ["프로필렌글라이콜", "Propylene glycol", "CC(O)CO"],
  ["스쿠알렌", "Squalene", "CC(C)=CCC/C(C)=C/CC/C(C)=C/CC/C=C(\\C)CC/C=C(\\C)CCC=C(C)C"],
  ["올레산", "Oleic acid", "CCCCCCCC/C=C\\CCCCCCCC(=O)O", ["올레익애씨드"]],
  ["리놀레산", "Linoleic acid", "CCCCC/C=C\\C/C=C\\CCCCCCCC(=O)O", ["리놀레익애씨드"]],
  ["팔미트산", "Palmitic acid", "CCCCCCCCCCCCCCCC(=O)O"],
  ["스테아르산", "Stearic acid", "CCCCCCCCCCCCCCCCCC(=O)O"],
  ["라우르산", "Lauric acid", "CCCCCCCCCCCC(=O)O", ["라우릭애씨드"]],
  ["미리스트산", "Myristic acid", "CCCCCCCCCCCCCC(=O)O"],
  ["페닐에틸레조르시놀", "Phenylethyl resorcinol",
   "CC(c1ccccc1)c1ccc(O)cc1O",
   ["페닐에틸레조시놀", "Symwhite 377", "4-(1-페닐에틸)-1,3-벤젠디올"]]
];
/* INGREDIENTS:END */

/* Resistance-mutant rescue: claimed, re-measured, retracted.
 *
 * The claim was that docking a ligand into the T877A and W741L structures
 * and comparing against wild type separates antagonists from agonists by
 * 3.5 kcal/mol. It does not. Two independent findings killed it.
 *
 * 1. The original comparison ran across three different crystals - 2AM9,
 *    2OZ7 and 1Z95 - which cannot isolate a mutation. This repository had
 *    already measured that the choice of structure moves the ranking more
 *    than the choice of ligand, and that each receptor favours its own
 *    co-crystal ligand; 1Z95 ranks R-bicalutamide 1st of 22, and
 *    bicalutamide's headline "rescue" was measured in 1Z95. Re-running it
 *    properly - the same 2AM9 crystal with the side chain cut out in
 *    silico, every other residue byte-identical - collapses the separation
 *    from 3.14 to 0.53 kcal/mol for T877A and from 4.45 to 0.58 for W741.
 *    Bicalutamide goes -1.50 -> -0.10, spironolactone -3.10 -> -0.50,
 *    testosterone +2.40 -> +0.20.
 *
 * 2. What little remains is not about function. Split by scaffold instead,
 *    the same numbers separate steroids from non-steroids by 1.09 kcal/mol
 *    against 0.58 for agonist-vs-antagonist - and the six STEROIDAL
 *    antagonists (+0.83) behave like the steroidal agonists (+0.52), not
 *    like the non-steroidal antagonists (-0.55). If the shift measured
 *    antagonism, cyproterone and spironolactone would be negative. They
 *    are not. It is reading shape.
 *
 * So there is no reading to give, and the per-compound panel that gave one
 * is gone. The mutant scores stay in the repository as a measurement; what
 * has been withdrawn is the interpretation. */

/* ------------------------------------------------ functional reference *//* ------------------------------------------------ functional reference */

/* Known AR function, keyed by the dictionary's English name.
 *
 * This is deliberately separate from the pKi library. The pKi library's
 * class field carries whatever the loaded library uses, and the expanded
 * ChEMBL set labels entries by potency - "strong binder", "weak" - which
 * says nothing about agonism. Reading those as a function was wrong.
 *
 * Only well-established classifications are listed. Compounds whose AR
 * function is contested (abiraterone, ketoconazole, methoxychlor, bisphenol
 * A) are left out rather than guessed at. */
var FUNCTION_CLASS = {
  /* androgens */
  'Metribolone': 'agonist', 'Trenbolone': 'agonist',
  'Dihydrotestosterone': 'agonist', 'Nandrolone': 'agonist',
  'Testosterone': 'agonist', 'Methyltestosterone': 'agonist',
  'Mesterolone': 'agonist', 'Boldenone': 'agonist', 'Stanozolol': 'agonist',
  'Oxandrolone': 'agonist', 'Oxymetholone': 'agonist', 'Danazol': 'agonist',
  'Androsterone': 'agonist', 'Epiandrosterone': 'agonist',
  'DHEA': 'agonist', 'Androstenedione': 'agonist',
  /* antiandrogens */
  'Bicalutamide': 'antagonist', 'Enzalutamide': 'antagonist',
  'Apalutamide': 'antagonist', 'Darolutamide': 'antagonist',
  'Nilutamide': 'antagonist', 'Flutamide': 'antagonist',
  'Hydroxyflutamide': 'antagonist', 'Cyproterone acetate': 'antagonist',
  'Spironolactone': 'antagonist', 'Clascoterone': 'antagonist',
  'Drospirenone': 'antagonist', 'Dienogest': 'antagonist',
  'Chlormadinone acetate': 'antagonist',
  'Vinclozolin': 'antagonist', 'Procymidone': 'antagonist',
  'Linuron': 'antagonist', 'Prochloraz': 'antagonist',
  /* androgenic but not full agonists at AR */
  'Progesterone': 'partial', 'Medroxyprogesterone acetate': 'partial',
  'Norethisterone': 'partial', 'Levonorgestrel': 'partial',
  'Tibolone': 'partial'
};

var FUNCTIONAL_LABELS = { agonist: 1, antagonist: 1, partial: 1 };

/* Tox21 result codes, as emitted by local/build_tox21.py: one character per
 * assay, in the order [agonist BLA, antagonist MDA-kb2, antagonist BLA]. */
var TOX21_CODE = {
  '0': 'inactive', '1': 'active agonist', '2': 'active antagonist',
  '3': 'inconclusive', '4': 'cytotoxic', '9': 'not tested'
};
var TOX21_LABEL_KO = {
  'inactive': '비활성', 'active agonist': '작용제 활성',
  'active antagonist': '길항제 활성', 'inconclusive': '판정 보류',
  'cytotoxic': '세포독성으로 판정 보류', 'not tested': '미시험'
};

/* Read a Tox21 record into a verdict.
 *
 * This is a measurement, not a prediction, so it outranks everything else
 * the tool computes. Two things need care. Antagonist-mode signal in a
 * reporter assay is produced by anything that kills the cell, so a
 * "cytotoxic" call is explicitly NOT evidence of antiandrogen activity -
 * ketoconazole and triclosan land there. And a compound can genuinely read
 * active in both modes (spironolactone does); the antagonist call is
 * reported then, because that is the safety-relevant one. */
/* Which mode each code position was run in, matching assets/tox21_ar.json:
 * AID 743053 is the agonist-mode screen, 743054 and 743063 the two
 * antagonist-mode screens. The position is not cosmetic. An "active
 * agonist" outcome in the agonist-mode assay is agonism. The same two words
 * in an antagonist-mode co-treatment well mean only that the compound
 * raised the signal in a well built to measure a drop - suggestive, but not
 * what that assay answers.
 *
 * Pooling them regardless of mode is what this code used to do, and it
 * produced confidently wrong labels: formononetin was INACTIVE in the
 * agonist screen and still came out "agonist" on the strength of one
 * antagonist-mode well, then sat at similarity 0.39 from fisetin and
 * dragged it to "agonist" as well. Genistein and resveratrol lost real
 * antagonist calls the same way, their antagonist-mode activity cancelled
 * by an off-mode agonist flag. */
var TOX21_MODES = ['agonist', 'antagonist', 'antagonist'];

function readTox21(code) {
  if (!code || code.length < 3) return null;
  var calls = [];
  for (var i = 0; i < 3; i++) calls.push(TOX21_CODE[code.charAt(i)] || 'not tested');
  var agonist = false, antagonist = false, offModeAgonist = false;
  var cytotoxic = false, inconclusive = false, tested = 0, informative = 0;
  for (var j = 0; j < calls.length; j++) {
    if (calls[j] === 'not tested') continue;
    tested++;
    var mode = TOX21_MODES[j] || 'antagonist';
    if (calls[j] === 'active agonist') {
      if (mode === 'agonist') { agonist = true; informative++; }
      else offModeAgonist = true;
    } else if (calls[j] === 'active antagonist') {
      if (mode === 'antagonist') { antagonist = true; informative++; }
      else offModeAgonist = true;   /* a drop in the agonist screen: odd, ignore */
    } else if (calls[j] === 'cytotoxic') cytotoxic = true;
    else if (calls[j] === 'inconclusive') inconclusive = true;
    else if (calls[j] === 'inactive') informative++;
  }
  if (!tested) return null;

  /* What each call actually means.
   *
   * Antagonist mode co-treats with a strong reference agonist and measures
   * the drop in signal, so anything that competes for the receptor scores
   * there - including weak and partial agonists. Measured over the labelled
   * set, Tox21 calls 11 of 12 known antagonists "active antagonist", but
   * also 5 of 5 known partial agonists and 2 of 8 full agonists. Taking the
   * antagonist call at face value dropped the functional accuracy from 84%
   * to 76%, flipping progesterone, levonorgestrel and the rest.
   *
   * So a verdict is only returned where the assay is unambiguous. Signal in
   * both modes means the compound does both, which is true of cyproterone
   * and progesterone alike; the assay is right to refuse and the structural
   * evidence breaks the tie instead. */
  var verdict = null;
  if (agonist && !antagonist) verdict = 'agonist';
  else if (antagonist && !agonist) verdict = 'antagonist';
  else if (calls.every(function (c) { return c === 'inactive' || c === 'not tested'; })) {
    verdict = 'inactive';
  }
  return {
    calls: calls, verdict: verdict, cytotoxic: cytotoxic,
    inconclusive: inconclusive, mixed: agonist && antagonist,
    offModeAgonist: offModeAgonist, informative: informative
  };
}

/* --- how far read-across may be trusted, measured ----------------------
 *
 * Leave-one-out over the 38 curated compounds, binned by the similarity of
 * the nearest reference:
 *
 *     nearest      n   correct
 *     0.15-0.25    3     100%
 *     0.25-0.35    1     100%
 *     0.35-0.50   11      64%
 *     0.50-1.00   23      87%
 *     below 0.15   0        -
 *
 * The last row is the important one. No curated compound sits below 0.15,
 * so a vote cast down there is not a weak call, it is an untested one. And
 * it is actively misleading, because 17 of the 38 references are
 * antagonists: a compound far from everything collects a unanimous
 * antagonist vote out of class imbalance alone. Fisetin did exactly that -
 * five antagonist neighbours, every similarity near 0.09 - which is why
 * "판단 불가" now has to say which of these cases it is. */
var SIM_CALL = 0.35;      /* assert a class */
var SIM_POSSIBLE = 0.20;  /* enough to raise a possibility, not to assert */
var SIM_FLOOR = 0.15;     /* below this, read-across has never been tested */

/* Compounds the Tox21 screen called unambiguously but that nobody curated
 * a label for. They are measurements, so they belong in the read-across
 * pool - and they are the only thing in it that lives in polyphenol space,
 * where the curated set (drugs and pesticides) has nothing to say.
 *
 * The first version of this admitted anything with an unambiguous code and
 * was never read by a human. That put hydrocortisone, prednisolone and
 * corticosterone into the pool as "measured AR AGONISTS", voting on other
 * compounds. They are glucocorticoids. One of the three screens is run in
 * MDA-kb2, whose reporter is MMTV-luc, and the MMTV promoter is a direct
 * GR response element in a line that expresses GR - so a GR agonist lights
 * it up without touching AR at all. The measurement is real; the label on
 * it was not.
 *
 * What a reporter number cannot tell you is which receptor produced it.
 * That takes pharmacology, so the exclusions are written out by hand with
 * a reason each, rather than inferred from the assay code. */
var POOL_EXCLUSIONS = {
  'Hydrocortisone':  'GR 작용제 — MMTV-luc은 GR 반응 프로모터라 AR 없이도 켜집니다',
  'Prednisolone':    'GR 작용제 — 위와 같음',
  'Corticosterone':  'GR 작용제 — 위와 같음',
  'Dexamethasone':   'GR 작용제 — 위와 같음',
  'Hydrocortisone acetate': 'GR 작용제 — 위와 같음',
  'Finasteride':     '5α-환원효소 억제제입니다. AR 리간드가 아니라 DHT 생성을 막습니다',
  'Dutasteride':     '5α-환원효소 억제제 — 위와 같음',
  'Pregnenolone':    '스테로이드 전구체 — 길항제 모드 신호는 경쟁으로 설명됩니다',
  'DHEA':            '안드로겐 전구체 — 레퍼런스 라벨도 작용제입니다',
  'Retinol':         'RAR 리간드이고 다른 웰에서 세포독성입니다',
  'Retinal':         'RAR 리간드 — 위와 같음',
  'Retinyl acetate': 'RAR 리간드 — 위와 같음',
  'Retinyl palmitate': 'RAR 리간드 — 위와 같음',
  'Retinyl propionate': 'RAR 리간드 — 위와 같음'
};

/* Kept, but these carry a caveat worth stating when they are the reason for
 * a call: their dominant pharmacology is ER, not AR. MMTV is not an
 * oestrogen-response element, so unlike the glucocorticoids they have no
 * direct route to the reporter, and weak AR competition is a real reading -
 * it is just not their day job. */
var POOL_CAVEATS = {
  'Estrone': 'ER 리간드 — AR 경쟁은 약합니다',
  'Estriol': 'ER 리간드 — AR 경쟁은 약합니다',
  'Estradiol': 'ER 리간드 — AR 경쟁은 약합니다',
  'Genistein': '파이토에스트로겐 — ER 활성이 더 강합니다',
  'Apigenin': '파이토에스트로겐 — ER 활성이 더 강합니다',
  'Resveratrol': '파이토에스트로겐 — ER 활성이 더 강합니다'
};

var measuredPool = null;
var excludedIds = null;

/* Keyed by structure, so the exclusion follows the molecule however its
 * SMILES was written and whatever the caller happens to know its name to
 * be. Built once, lazily, from the dictionary. */
var curatedIds = null;

/* The hand-curated functional label, reachable from a structure. It is the
 * most authoritative thing here - established pharmacology rather than one
 * reporter well - so it outranks both the assay and the read-across, and it
 * outranks a mechanism block: DHEA is on the exclusion list because its
 * antagonist-mode signal is competition, but the reference set already
 * knows it is an agonist, and refusing to say so would be throwing away the
 * better answer. */
function curatedStructureIds() {
  if (curatedIds) return curatedIds;
  curatedIds = {};
  for (var i = 0; i < INGREDIENTS.length; i++) {
    var cls = FUNCTION_CLASS[INGREDIENTS[i][1]];
    if (!cls) continue;
    try {
      curatedIds[AR.structureIdOf(AR.parseSmiles(INGREDIENTS[i][2]))] = cls;
    } catch (err) { /* unparsable, so unreachable anyway */ }
  }
  return curatedIds;
}

function excludedStructureIds() {
  if (excludedIds) return excludedIds;
  excludedIds = {};
  for (var i = 0; i < INGREDIENTS.length; i++) {
    var reason = POOL_EXCLUSIONS[INGREDIENTS[i][1]];
    if (!reason) continue;
    try {
      excludedIds[AR.structureIdOf(AR.parseSmiles(INGREDIENTS[i][2]))] = reason;
    } catch (err) { /* a structure that will not parse cannot be excluded */ }
  }
  return excludedIds;
}

function registerMeasured(toxTable) {
  measuredPool = [];
  if (!toxTable || !toxTable.calls) return 0;
  for (var i = 0; i < INGREDIENTS.length; i++) {
    var en = INGREDIENTS[i][1];
    if (FUNCTION_CLASS[en]) continue;          /* a hand label wins */
    var mol;
    try { mol = AR.parseSmiles(INGREDIENTS[i][2]); } catch (err) { continue; }
    var code = toxTable.calls[AR.structureIdOf(mol)];
    if (!code) continue;
    var read = readTox21(code);
    if (!read || !read.verdict || read.verdict === 'inactive') continue;
    /* another receptor explains this reporter better than AR does */
    if (POOL_EXCLUSIONS[en]) continue;
    /* a compound that kills cells lowers the signal; that is not antagonism
       and it must not be allowed to teach the read-across */
    if (read.cytotoxic && read.verdict === 'antagonist') continue;
    var informative = read.informative;
    /* A verdict resting on one assay out of three, with the other two
     * inconclusive, is not enough to let a compound vote on its
     * neighbours. Daidzein is the case that forced this: code 313, a lone
     * "active agonist" between two inconclusive wells, and at similarity
     * 0.46 it was the single strongest neighbour fisetin had. It is still
     * shown as a measured record for the compound itself; it just does not
     * get to carry the vote for anything else. */
    if (informative < 2) continue;
    measuredPool.push({
      n: en, c: read.verdict, measured: true, assays: informative,
      caveat: POOL_CAVEATS[en] || null,
      fp: AR.packFingerprint(AR.morganFingerprint(mol, 2))
    });
  }
  return measuredPool.length;
}

function functionPool() {
  var pool = ensureFunctionLibrary();
  return measuredPool && measuredPool.length ? pool.concat(measuredPool) : pool;
}

var functionLibrary = null;

function ensureFunctionLibrary() {
  if (functionLibrary) return functionLibrary;
  functionLibrary = [];
  for (var i = 0; i < INGREDIENTS.length; i++) {
    var cls = FUNCTION_CLASS[INGREDIENTS[i][1]];
    if (!cls) continue;
    try {
      var mol = AR.parseSmiles(INGREDIENTS[i][2]);
      functionLibrary.push({
        n: INGREDIENTS[i][1], c: cls,
        fp: AR.packFingerprint(AR.morganFingerprint(mol, 2))
      });
    } catch (err) { /* a structure that will not parse cannot vote */ }
  }
  return functionLibrary;
}

/* Agonist or antagonist, by read-across over the functional reference plus,
 * where a docked pose exists, whether that pose reaches Ile899.
 *
 * Ile899 sits at the far end of helix-12 and is only reached by a ligand
 * extending toward the AF-2 surface. Measured over the docked panel it is
 * the one helix-12 residue that separates the classes; Met895 lines the
 * pocket in the agonist conformation and is touched by almost anything. */
function callFunction(fp, options) {
  options = options || {};
  var pool = functionPool();
  var neighbours = [];
  for (var i = 0; i < pool.length; i++) {
    if (options.exclude && pool[i].n === options.exclude) continue;
    neighbours.push({ n: pool[i].n, c: pool[i].c, measured: !!pool[i].measured,
                      sim: AR.tanimotoPacked(fp, pool[i].fp) });
  }
  neighbours.sort(function (a, b) { return b.sim - a.sim; });
  var top = neighbours.slice(0, 5);
  var nearest = top.length ? top[0].sim : 0;

  /* What the reference set itself says, stated whether or not the engine
   * ends up willing to call it. The user asking "do the references treat
   * this as an antagonist?" should not have to infer it from a verdict. */
  var refCount = {}, refAnt = [];
  for (var r = 0; r < top.length; r++) {
    refCount[top[r].c] = (refCount[top[r].c] || 0) + 1;
    if (top[r].c === 'antagonist') refAnt.push(top[r].n);
  }

  var weights = {}, total = 0;
  for (var k = 0; k < top.length; k++) {
    var w = Math.pow(top[k].sim, 3);
    weights[top[k].c] = (weights[top[k].c] || 0) + w;
    total += w;
  }

  var dock = options.dock || null;
  var motifs = options.motifs || null;
  var evidence = [];

  function result(label, tier, reason) {
    var share = total > 1e-12 ? ((weights[label] || 0) / total) : 0;
    return {
      label: label, tier: tier, reason: reason || null,
      support: share, nearest: nearest, neighbours: top,
      evidence: evidence, weights: weights,
      refCount: refCount, refAntagonists: refAnt,
      measured: tier === 'measured',
      tox21: options.tox21 ? readTox21(options.tox21) : null
    };
  }

  /* A measured result ends the argument - unless another receptor explains
   * the reporter better than AR does. Excluding these from the read-across
   * pool was only half the fix: hydrocortisone still headlined its own page
   * as "AR 작용제 (실측)" on the strength of an MMTV-luc well that GR drives
   * directly. The assay rows are still shown; the verdict is withheld and
   * the reason is given. */
  var blockedReason = options.structureId
    ? (excludedStructureIds()[options.structureId] || null) : null;
  var tox = options.tox21 ? readTox21(options.tox21) : null;
  /* Never when a compound is being held out: leave-one-out exists to ask
   * what the engine says about a molecule it has not been told about, and
   * answering from the curated label would score 38/38 for free. */
  var curatedHere = (options.structureId && !options.exclude)
    ? (curatedStructureIds()[options.structureId] || null) : null;
  if (curatedHere) {
    evidence.push('기능 레퍼런스에 등재된 물질 — 예측이 아니라 입력입니다');
    if (tox) evidence.push('Tox21 실측도 있습니다 (표 참조)');
    var curatedOut = result(curatedHere, 'curated', null);
    curatedOut.tox21 = tox;
    return curatedOut;
  }
  if (blockedReason) {
    /* Falling through to read-across was the first attempt and it was worse:
     * hydrocortisone came back "길항제 가능성" because a glucocorticoid looks
     * like a steroid. When the one measurement is known to be confounded and
     * the structural route is known to mislead for this scaffold, the honest
     * output is no call, with the reason and the assay rows still shown. */
    if (tox) tox.blocked = blockedReason;
    evidence.push('AR 판정을 내리지 않습니다 — ' + blockedReason);
    var blockedOut = result('unknown', 'blocked', blockedReason);
    blockedOut.tox21 = tox;
    return blockedOut;
  }
  if (tox && tox.verdict) {
    var informative = tox.informative;
    var note = 'Tox21 리포터 어세이 실측';
    if (informative < 2) {
      note += ' — 단 1개 어세이만 유효 판정 (나머지는 보류/세포독성)';
    }
    if (tox.cytotoxic) note += ' (일부 어세이는 세포독성으로 판정 보류)';
    evidence.push(note);
    weights = {}; total = 0;
    var out = result(tox.verdict, 'measured', null);
    out.thin = informative < 2;
    return out;
  }

  if (total > 1e-12) {
    var measuredNear = 0;
    for (var m = 0; m < top.length; m++) if (top[m].measured) measuredNear++;
    evidence.push('유사 레퍼런스 ' + top.length + '종 (최근접 ' + nearest.toFixed(2) +
                  (measuredNear ? ', 실측 라벨 ' + measuredNear + '종' : '') + ')');
  }

  /* Steroidal antiandrogens sit right next to the androgens by 2D
   * similarity, so read-across alone calls them agonists. What separates
   * them is a bulky 17-alpha or spiro substituent where an androgen has a
   * small 17 group. */
  var structural = null;
  if (motifs && motifs.steroidBulky) {
    var motifWeight = 0.45 * (total > 1e-12 ? total : 1);
    weights.antagonist = (weights.antagonist || 0) + motifWeight;
    total += motifWeight;
    structural = '스테로이드 골격에 부피 큰 치환기' +
                 (motifs.steroidSpiro ? ' (스피로 고리)' :
                  (motifs.steroidEster ? ' (에스터)' : ' (나이트릴)'));
    evidence.push(structural);
  }
  if (dock && dock.placed) {
    /* an independent structural vote, weighted like a close neighbour */
    var dockWeight = 0.35 * (total > 1e-12 ? total : 1);
    if (dock.ile899) {
      weights.antagonist = (weights.antagonist || 0) + dockWeight;
      total += dockWeight;
      structural = structural || '도킹 포즈가 helix-12 말단(Ile899)에 접촉';
      evidence.push('도킹 포즈가 helix-12 말단(Ile899)에 접촉');
    } else {
      weights.agonist = (weights.agonist || 0) + dockWeight * 0.5;
      weights.partial = (weights.partial || 0) + dockWeight * 0.5;
      total += dockWeight;
      evidence.push('도킹 포즈가 helix-12 말단에 닿지 않음');
    }
  }

  var best = null, bestWeight = 0;
  for (var key in weights) {
    if (!Object.prototype.hasOwnProperty.call(weights, key)) continue;
    if (weights[key] > bestWeight) { bestWeight = weights[key]; best = key; }
  }
  if (tox) {
    if (tox.mixed) {
      evidence.push('Tox21에서 작용·길항 양쪽 신호 — 혼합 활성이므로 구조 증거로 판단');
    } else {
      evidence.push('Tox21 실측은 판정 보류' +
                    (tox.cytotoxic ? ' (세포독성)' : '') + ' — 아래는 예측입니다');
    }
  }

  /* --- the decision, with the criteria written out -------------------- */

  if (!top.length || total <= 1e-12) {
    return result('unknown', 'unknown', '비교할 레퍼런스가 없습니다.');
  }

  /* Below the floor the only honest answer is that the method has not been
   * tested here. Saying so, and saying that the antagonist-heavy reference
   * set makes a unanimous antagonist vote meaningless at this distance, is
   * more use than a verdict. */
  if (nearest < SIM_FLOOR) {
    var why = '최근접 레퍼런스 유사도가 ' + nearest.toFixed(2) +
              '뿐입니다. 라벨된 38종은 모두 0.16 이상에서 서로를 맞히므로 ' +
              '이 거리는 이 도구가 검증된 적 없는 범위입니다.';
    if (refAnt.length >= 3) {
      why += ' 최근접 ' + top.length + '종 중 ' + refAnt.length +
             '종이 길항제이지만, 레퍼런스 38종 중 17종이 길항제라서 ' +
             '이 거리에서는 만장일치가 구조 유사성이 아니라 ' +
             '레퍼런스 구성 편향에서 나옵니다.';
    }
    if (structural) {
      why += ' 다만 구조 신호가 하나 있습니다: ' + structural + '.';
      return result('antagonist', 'possible', why);
    }
    return result('unknown', 'unknown', why);
  }

  var share = bestWeight / total;

  /* A structural flag on its own is enough to raise the possibility even
   * when read-across is thin, because it is what the flag was added for. */
  if (nearest >= SIM_CALL && best && share >= 0.5) {
    return result(best, 'predicted', null);
  }
  if (best === 'antagonist' && (structural || nearest >= SIM_POSSIBLE)) {
    return result('antagonist', 'possible',
      '길항제 쪽 근거가 우세하지만(' + (100 * share).toFixed(0) + '%) ' +
      (nearest < SIM_CALL
        ? '최근접 유사도가 ' + nearest.toFixed(2) + '로 단정 기준(' +
          SIM_CALL.toFixed(2) + ')에 못 미칩니다.'
        : '증거가 갈립니다.'));
  }
  if (best && nearest >= SIM_POSSIBLE) {
    return result(best, 'possible',
      (100 * share).toFixed(0) + '%로 우세하지만 최근접 유사도 ' +
      nearest.toFixed(2) + '는 단정 기준(' + SIM_CALL.toFixed(2) + ') 미만입니다.');
  }
  return result('unknown', 'unknown',
    '최근접 유사도 ' + nearest.toFixed(2) + '에서 증거가 갈립니다 (' +
    (100 * share).toFixed(0) + '% 우세).');
}

/* ------------------------------------------------ measured potency ---
 *
 * The missing axis, as far as it can be filled. These screens report
 * AC50 and efficacy, not just a call, so for a compound that was tested
 * there is a real cellular potency and a real response size to show
 * instead of an affinity estimate standing in for both.
 *
 * It is shown, not voted on, and the reason is measured: over the 20
 * labelled compounds that have an efficacy value, taking "negative
 * efficacy in the antagonist-mode well" as the antagonist call scores
 * 14/20, because 5 of 8 known agonists also reduce the signal there. That
 * is the same co-treatment confound that already stops the activity call
 * being taken at face value, and it does not become a classifier just
 * because it now comes with a number attached.
 *
 * The viability margin is the part worth acting on. A compound whose AR
 * AC50 sits at or above the concentration that kills the cells has not
 * demonstrated antagonism. Prochloraz, a curated antagonist reference,
 * has a margin of 0.16 - its signal arrives at a sixth of the lethal
 * concentration. */
var MARGIN_SUSPECT = 2.0;

function readPotency(rec) {
  if (!rec) return null;
  var out = { ap: rec.ap, ae: rec.ae, vp: rec.vp, margin: rec.m,
              gp: rec.gp, ge: rec.ge, line: rec.l,
              lines: rec.lines || null, disagree: !!rec.disagree, notes: [] };
  /* The two antagonist-mode lines do not always point the same way.
   * Genistein drops the BLA signal by 85% and raises the MDA-kb2 signal by
   * 309%; apigenin, resveratrol and butylparaben do the same thing. Those
   * four are most of the polyphenol coverage in the read-across pool, so
   * the compounds that lean on them - fisetin, quercetin, phenylethyl
   * resorcinol - are leaning on contested evidence and should say so. */
  if (rec.disagree && rec.lines) {
    var parts = [];
    for (var k in rec.lines) {
      if (!Object.prototype.hasOwnProperty.call(rec.lines, k)) continue;
      parts.push(k + ' ' + rec.lines[k].p + ' µM / ' +
                 (rec.lines[k].e > 0 ? '+' : '') + rec.lines[k].e + '%');
    }
    out.notes.push('두 길항 세포주가 반대 방향입니다 — ' + parts.join(', ') +
                   '. 한쪽은 신호가 올라가고 한쪽은 내려갑니다.');
  }
  if (rec.ap != null) {
    out.notes.push('길항제 모드 AC50 ' + rec.ap + ' µM' +
                   (rec.l ? ' (' + rec.l + ')' : '') +
                   (rec.ae != null ? ', 효력 ' + rec.ae + '%' : ''));
  }
  if (rec.gp != null) {
    out.notes.push('작용제 모드 AC50 ' + rec.gp + ' µM' +
                   (rec.ge != null ? ', 효력 ' + rec.ge + '%' : ''));
  }
  if (rec.m != null) {
    out.cytoSuspect = rec.m < MARGIN_SUSPECT;
    out.notes.push(out.cytoSuspect
      ? '세포생존 AC50가 길항 AC50의 ' + rec.m + '배뿐입니다 — 신호가 ' +
        '세포 죽는 농도와 겹칩니다. 길항이 아니라 세포독성일 수 있습니다.'
      : '세포생존 AC50가 길항 AC50의 ' + rec.m + '배라 여유가 있습니다.');
  }
  return out;
}

/* ------------------------------------------- reference provenance ----
 *
 * The 28 affinities were carried with no record of assay, species or
 * source and an MAE was quoted against them as if they were one scale.
 * Asking ChEMBL directly: 273 of the AR activities behind these compounds
 * are human, 44 are rat and 11 mouse, 7 references have no human AR record
 * at all, and 4 could not be traced to an AR activity in ChEMBL - including
 * dihydrotestosterone, the single most important reference in the library.
 *
 * The numbers are not thereby wrong. What is wrong is quoting a 0.5 log
 * MAE against them without saying that rat prostate-cytosol binding and
 * human LBD assays are pooled in the same column, so the grade travels
 * with every reference the UI shows. */
var PROV_GRADE_KO = {
  human: { word: '사람 AR', note: 'ChEMBL AR 활성이 전부 사람입니다' },
  mixed: { word: '종 혼재', note: '사람 데이터가 주이지만 랫·마우스가 섞여 있습니다' },
  nonhuman: { word: '비사람', note: '사람 AR 기록이 없습니다 — 랫·마우스 데이터뿐입니다' },
  untraceable: { word: '추적 불가', note: 'ChEMBL에서 이 물질의 AR 활성을 찾지 못했습니다' }
};

/* Not a provenance problem but found in the same pass: a reference that is
 * not an AR ligand at all. */
var REFERENCE_NOTES = {
  'Vinclozolin': '프로안티안드로겐입니다. AR에 결합하는 것은 빈클로졸린이 아니라 ' +
                 '대사체 M1·M2이므로, 이 pKi를 직접 결합값으로 읽으면 안 됩니다.',
  'Dihydrotestosterone': '이 라이브러리의 기준점인데 ChEMBL에서 출처를 ' +
                 '되짚지 못했습니다. 값 자체는 교과서적이지만 추적은 안 됩니다.'
};

/* ------------------------------------------- usability for cosmetics -
 *
 * A ranked list of AR antagonists is not a sourcing list. Of the 25
 * compounds in the top band, 14 are prescription drugs and 4 are banned or
 * restricted pesticides; what is left that a formulator could actually put
 * in a product is six flavonoids, all of them long since commercialised.
 * That is the single most useful thing to tell someone looking for an
 * anti-androgen ingredient, and the tool was not telling them.
 *
 * Regulatory status is knowledge, not something derivable from a
 * structure, so it is written down with a reason per class. It is a
 * screening aid and not regulatory advice: limits differ by market and
 * change, and anything here has to be checked against the current KFDA /
 * EU annexes before it goes near a formulation. */
var USE_CLASSES = {
  cosmetic:   { word: '화장품 원료', note: '화장품에 쓰이는 원료입니다' },
  restricted: { word: '제한/규제',   note: '화장품에 쓰이지만 농도 제한이나 시장별 금지가 걸립니다' },
  drug:       { word: '의약품',      note: '처방·일반의약품 성분이라 화장품에 넣을 수 없습니다' },
  pesticide:  { word: '농약/살생물제', note: '농약 또는 살생물제입니다. 화장품 원료가 아닙니다' },
  pollutant:  { word: '환경오염물질', note: '산업 오염물질입니다. 발굴 대상이 아니라 회피 대상입니다' },
  endogenous: { word: '내인성',      note: '체내 호르몬·전구체입니다' }
};

var USE_CLASS = {
  /* drugs - the top of the antagonist list is mostly this */
  'Dienogest': 'drug', 'Drospirenone': 'drug', 'Megestrol acetate': 'drug',
  'Clascoterone': 'drug', 'Chlormadinone acetate': 'drug',
  'Cyproterone acetate': 'drug', 'Apalutamide': 'drug', 'Enzalutamide': 'drug',
  'Darolutamide': 'drug', 'Spironolactone': 'drug', 'Bicalutamide': 'drug',
  'Hydroxyflutamide': 'drug', 'Nilutamide': 'drug', 'Flutamide': 'drug',
  'Ethinylestradiol': 'drug', 'Estradiol': 'drug', 'Estrone': 'drug',
  'Estriol': 'drug', 'Finasteride': 'drug', 'Dutasteride': 'drug',
  'Minoxidil': 'drug', 'Tretinoin': 'drug', 'Adapalene': 'drug',
  /* alfatradiol is sold as a topical alopecia drug, not a cosmetic */
  'Alfatradiol': 'drug',
  /* ketoconazole shampoo is a quasi-drug in KR, a medicine elsewhere */
  'Ketoconazole': 'drug',

  'Vinclozolin': 'pesticide', 'Procymidone': 'pesticide', 'Linuron': 'pesticide',
  'Fenitrothion': 'pesticide', 'Prochloraz': 'pesticide',
  'Methoxychlor': 'pesticide', 'Triclocarban': 'pesticide',
  'Triclosan': 'pesticide', "p,p'-DDE": 'pesticide',

  'Bisphenol A': 'pollutant', 'Bisphenol S': 'pollutant', 'Bisphenol F': 'pollutant',
  '4-Octylphenol': 'pollutant', 'Nonylphenol': 'pollutant',

  'DHEA': 'endogenous', 'Androstenedione': 'endogenous', 'Pregnenolone': 'endogenous',
  'Testosterone': 'endogenous', 'Dihydrotestosterone': 'endogenous',
  'Progesterone': 'endogenous', 'Cholesterol': 'endogenous',
  'Corticosterone': 'endogenous', 'Hydrocortisone': 'endogenous',

  /* restricted: used in cosmetics but with limits or market bans */
  'Hydroquinone': 'restricted', 'Deoxyarbutin': 'restricted',
  'Benzophenone-3': 'restricted', 'Capsaicin': 'restricted',
  'Isobutylparaben': 'restricted', 'Propylparaben': 'restricted',
  'Butylparaben': 'restricted', 'Benzylparaben': 'restricted',
  'Octinoxate': 'restricted', 'Climbazole': 'restricted',

  'Kaempferol': 'cosmetic', 'Daidzein': 'cosmetic', 'Genistein': 'cosmetic',
  'Glycitein': 'cosmetic', 'Formononetin': 'cosmetic', 'Luteolin': 'cosmetic',
  'Apigenin': 'cosmetic', 'Biochanin A': 'cosmetic', 'Bakuchiol': 'cosmetic',
  'Ascorbyl glucoside': 'cosmetic', 'Glyceryl glucoside': 'cosmetic',
  'Octocrylene': 'cosmetic', 'Fisetin': 'cosmetic', 'Galangin': 'cosmetic',
  'Chrysin': 'cosmetic', 'Curcumin': 'cosmetic', 'Hesperetin': 'cosmetic',
  'Naringenin': 'cosmetic', 'Equol': 'cosmetic', 'Baicalein': 'cosmetic',
  'Pterostilbene': 'cosmetic', 'Phloretin': 'cosmetic', 'Padimate O': 'cosmetic',
  'Quercetin': 'cosmetic', 'Puerarin': 'cosmetic', 'Myricetin': 'cosmetic',
  'Morin': 'cosmetic', 'Hydroxypinacolone retinoate': 'cosmetic',
  'Methylparaben': 'cosmetic', 'Tetrahexyldecyl ascorbate': 'cosmetic',
  'Ferulic acid': 'cosmetic', 'Taxifolin': 'cosmetic', 'Caffeic acid': 'cosmetic',
  'Phenylethyl resorcinol': 'cosmetic', 'Resveratrol': 'cosmetic',
  'Epigallocatechin gallate': 'cosmetic', 'Benzyl salicylate': 'cosmetic',
  'Coumestrol': 'cosmetic', 'Linoleic acid': 'cosmetic', 'Lauric acid': 'cosmetic',
  'Myristic acid': 'cosmetic', 'Palmitic acid': 'cosmetic',
  'Stearic acid': 'cosmetic', 'Niacinamide': 'cosmetic'
};

/* Whether a molecule has any chance of reaching the androgen receptor in
 * the dermal papilla, which sits below the epidermis. This is the crudest
 * possible screen - the 500 Dalton rule with a lipophilicity window - and
 * it is here because the tool had nothing at all: 26 of the 85 antagonist
 * candidates are too lipophilic to cross, and a hit that cannot get there
 * is not a lead however well it scores. It says nothing about formulation,
 * penetration enhancers or follicular delivery. */
function dermalScreen(desc) {
  var reasons = [];
  if (desc.mw > 500) reasons.push('MW ' + Math.round(desc.mw) + ' > 500');
  if (desc.clogp > 4) reasons.push('clogP ' + desc.clogp.toFixed(1) + ' > 4 — 각질층에 갇힙니다');
  else if (desc.clogp < 1) reasons.push('clogP ' + desc.clogp.toFixed(1) + ' < 1 — 지질층을 못 지납니다');
  return { pass: reasons.length === 0, reasons: reasons };
}

function useClassOf(name) {
  var key = USE_CLASS[name] || null;
  if (!key) return null;
  return { key: key, word: USE_CLASSES[key].word, note: USE_CLASSES[key].note,
           actionable: key === 'cosmetic' || key === 'restricted' };
}

/* --------------------------------------------- affinity ranking ------
 *
 * Potency first, function second: the whole dictionary ordered by predicted
 * pKi, with the agonist/antagonist call carried alongside so the two
 * questions stay separate. They are separate. A compound can bind hard and
 * do nothing, and the tool answers "how tightly" and "which direction" with
 * different evidence and different reliability, so blending them into one
 * list would misrepresent both.
 *
 * The applicability-domain tag matters more here than anywhere else. A pKi
 * for a compound with no close reference is an extrapolation, and sorting
 * by it puts the least trustworthy numbers wherever they happen to land -
 * so the tag travels with every row and can be filtered on. */
function rankAffinity(evidenceFor) {
  var rows = [];
  for (var i = 0; i < INGREDIENTS.length; i++) {
    var ko = INGREDIENTS[i][0], en = INGREDIENTS[i][1], smi = INGREDIENTS[i][2];
    var mol;
    try { mol = AR.parseSmiles(smi); } catch (err) { continue; }
    var ev = {};
    try { ev = evidenceFor(smi, mol) || {}; } catch (err) { ev = {}; }
    var res;
    try { res = predict(smi, ev); } catch (err) { continue; }
    var fc = res.functionCall;
    var curatedLabel = FUNCTION_CLASS[en] || null;
    rows.push({
      ko: ko, en: en, smiles: smi,
      pKi: res.pKi, ci: res.ci, kiNM: res.kiNM, domain: res.domain,
      label: fc.label, tier: curatedLabel === fc.label ? 'curated' : fc.tier,
      callTier: fc.tier, curatedLabel: curatedLabel,
      nearest: res.nearestSim, pocketVerdict: res.pocket.verdict,
      pocketKey: res.pocket.verdictKey, occupancy: res.occupancy, mw: res.mw
    });
  }
  rows.sort(function (a, b) {
    if (b.pKi !== a.pKi) return b.pKi - a.pKi;
    return a.en < b.en ? -1 : 1;
  });
  for (var r = 0; r < rows.length; r++) rows[r].rank = r + 1;
  return rows;
}

/* --------------------------------------------- analogue design -------
 *
 * There is no SMILES writer in this engine, so analogues are made by
 * editing the parent's SMILES text at a position the graph picked, then
 * re-parsing. That is fragile, and the guard against it is the same one
 * that caught the ChEMBL ester/salt mix-ups: every rule declares the exact
 * formula change it should produce, and any product whose measured formula
 * does not match is thrown away rather than shown.
 *
 * The substituents are not invented. Each is a group that the known
 * non-steroidal antiandrogens actually carry - aryl-CF3 in bicalutamide,
 * enzalutamide, flutamide and nilutamide; aryl nitrile in bicalutamide,
 * enzalutamide and apalutamide; aryl nitro in flutamide and nilutamide;
 * the methylsulfonyl of bicalutamide. Methyl, hydroxyl and the halogens
 * are included as controls: if the ranking cannot tell a pharmacophore
 * from a methyl group, it is not reading SAR, it is reading noise.
 */
var DESIGN_RULES = [
  { id: 'cf3',  frag: 'C(F)(F)F',      add: { C: 1, F: 3 },
    name: '트리플루오로메틸 (-CF3)',
    why: '비칼루타마이드·엔잘루타미드·플루타마이드·닐루타미드가 모두 방향족 CF3를 갖습니다' },
  { id: 'cn',   frag: 'C#N',           add: { C: 1, N: 1 },
    name: '나이트릴 (-C≡N)',
    why: '비칼루타마이드·엔잘루타미드·아팔루타미드의 공통 치환기' },
  { id: 'no2',  frag: '[N+](=O)[O-]',  add: { N: 1, O: 2 },
    name: '나이트로 (-NO2)',
    why: '플루타마이드·닐루타미드의 전자끌개' },
  { id: 'so2me', frag: 'S(=O)(=O)C',   add: { S: 1, O: 2, C: 1 },
    name: '메틸설포닐 (-SO2CH3)',
    why: '비칼루타마이드의 설폰' },
  { id: 'f',    frag: 'F',             add: { F: 1 }, control: true,
    name: '불소 (-F)',          why: '할로겐 스캔 — 대조군' },
  { id: 'cl',   frag: 'Cl',            add: { Cl: 1 }, control: true,
    name: '염소 (-Cl)',         why: '할로겐 스캔 — 대조군' },
  { id: 'me',   frag: 'C',             add: { C: 1 }, control: true,
    name: '메틸 (-CH3)',        why: '소수성만 올리는 대조군' },
  { id: 'oh',   frag: 'O',             add: { O: 1 }, control: true,
    name: '하이드록실 (-OH)',   why: '극성만 올리는 대조군' }
];

/* Where a branch may be opened after an atom's own token: past any
 * ring-closure markers that belong to it, so "c1" becomes "c1(X)". */
function branchPointAfter(smi, atom) {
  var k = atom.pos + atom.len;
  while (k < smi.length) {
    var c = smi.charAt(k);
    if (c >= '0' && c <= '9') { k++; continue; }
    if (c === '%') {
      k++;
      while (k < smi.length && smi.charAt(k) >= '0' && smi.charAt(k) <= '9') k++;
      continue;
    }
    /* a bond symbol only counts when it is marking a ring closure */
    if ('-=#:/\\'.indexOf(c) >= 0 && k + 1 < smi.length) {
      var n = smi.charAt(k + 1);
      if ((n >= '0' && n <= '9') || n === '%') { k += 2; continue; }
    }
    break;
  }
  return k;
}

function countElements(mol) {
  var out = {};
  for (var i = 0; i < mol.atoms.length; i++) {
    var el = mol.atoms[i].el;
    out[el] = (out[el] || 0) + 1;
  }
  return out;
}

/* The open aromatic CH positions on six-membered rings - the only sites
 * these rules are allowed to touch. */
function substitutionSites(mol) {
  var sites = [];
  for (var i = 0; i < mol.atoms.length; i++) {
    var a = mol.atoms[i];
    if (!a.arom || a.el !== 'C' || a.bracket) continue;
    if (a.nH < 1 || !a.inRing) continue;
    if ((a.ringSizes || []).indexOf(6) < 0) continue;
    sites.push(i);
  }
  return sites;
}

function designAnalogues(parentSmiles, evidenceFor, options) {
  options = options || {};
  var parent = AR.parseSmiles(parentSmiles);
  var parentCounts = countElements(parent);
  var sites = substitutionSites(parent);
  var parentRes = predict(parentSmiles, evidenceFor(parentSmiles, parent) || {});
  var parentFp = AR.packFingerprint(AR.morganFingerprint(parent, 2));

  var out = [], rejected = 0, seen = {};
  for (var r = 0; r < DESIGN_RULES.length; r++) {
    var rule = DESIGN_RULES[r];
    for (var s = 0; s < sites.length; s++) {
      var atom = parent.atoms[sites[s]];
      var cut = branchPointAfter(parentSmiles, atom);
      var smi = parentSmiles.slice(0, cut) + '(' + rule.frag + ')' +
                parentSmiles.slice(cut);

      var mol;
      try { mol = AR.parseSmiles(smi); } catch (err) { rejected++; continue; }

      /* the formula must have moved by exactly what the rule promised, and
         by nothing else - this is what catches a bad string edit */
      var got = countElements(mol), ok = true, el;
      for (el in got) {
        if (!Object.prototype.hasOwnProperty.call(got, el)) continue;
        var want = (parentCounts[el] || 0) + (rule.add[el] || 0);
        if (got[el] !== want) { ok = false; break; }
      }
      for (el in parentCounts) {
        if (!Object.prototype.hasOwnProperty.call(parentCounts, el)) continue;
        if (got[el] === undefined) { ok = false; break; }
      }
      /* and it must not have created or destroyed a ring */
      if (ok && mol.ringCount !== parent.ringCount) ok = false;
      if (!ok) { rejected++; continue; }

      var id = AR.structureIdOf(mol);
      if (seen[id]) continue;          /* symmetry gives the same product */
      seen[id] = true;

      var res;
      try { res = predict(smi, evidenceFor(smi, mol) || {}); }
      catch (err) { rejected++; continue; }

      out.push({
        smiles: smi, rule: rule.id, ruleName: rule.name, why: rule.why,
        control: !!rule.control, site: sites[s],
        pKi: res.pKi, dPKi: res.pKi - parentRes.pKi,
        domain: res.domain, nearest: res.nearestSim,
        label: res.functionCall.label, tier: res.functionCall.tier,
        support: res.functionCall.support,
        fnNearest: res.functionCall.nearest,
        refAntagonists: res.functionCall.refAntagonists || [],
        pocketVerdict: res.pocket.verdict,
        occupancy: res.occupancy,
        parentSim: AR.tanimotoPacked(
          parentFp, AR.packFingerprint(AR.morganFingerprint(mol, 2))),
        mw: res.mw
      });
    }
  }

  /* An analogue whose own applicability-domain tag is "out" is not a worse
     candidate, it is an unscored one: the pKi it carries is an
     extrapolation from references that look nothing like it. Those are
     separated rather than ranked, so a big meaningless number cannot sit
     at the top of the list. */
  var scored = [], unscored = [];
  for (var i = 0; i < out.length; i++) {
    (out[i].domain === 'out' ? unscored : scored).push(out[i]);
  }
  var rank = { antagonist: 2, partial: 1, unknown: 0, agonist: -1, inactive: -1 };
  scored.sort(function (a, b) {
    var ra = rank[a.label] === undefined ? 0 : rank[a.label];
    var rb = rank[b.label] === undefined ? 0 : rank[b.label];
    if (rb !== ra) return rb - ra;
    return b.pKi - a.pKi;
  });
  unscored.sort(function (a, b) { return b.pKi - a.pKi; });
  for (var j = 0; j < scored.length; j++) scored[j].rank = j + 1;

  return {
    parent: {
      smiles: parentSmiles, pKi: parentRes.pKi, domain: parentRes.domain,
      label: parentRes.functionCall.label, tier: parentRes.functionCall.tier,
      pocketVerdict: parentRes.pocket.verdict, mw: parentRes.mw,
      occupancy: parentRes.occupancy
    },
    sites: sites.length,
    scored: scored,
    unscored: unscored,
    rejected: rejected,
    rules: DESIGN_RULES
  };
}

/* ------------------------------------------- antagonist ranking ------
 *
 * Ranking the whole dictionary needs one ordering out of evidence that does
 * not share a scale: a Tox21 verdict, a read-across tier, a predicted pKi.
 * Collapsing them into one number would hide exactly the disagreements that
 * matter, so the order is lexicographic over a priority band and then
 * potency, and every input stays visible as its own column.
 *
 * Two demotions, both from signals the engine already computes, and both
 * found by looking at what the first draft of this list put on top:
 *
 *  - DHEA came out #1. Tox21 calls it an antagonist (inactive in the
 *    agonist screen, active in both antagonist screens) but the structure
 *    says agonist: a 3-keto steroid with no bulky substituent, anchored at
 *    both ends. DHEA is an androgen precursor. This is the documented
 *    antagonist-mode confound - co-treatment with a strong reference
 *    agonist means any competitor lowers the signal, and the screen flags
 *    5 of 5 known partial agonists that way. When the measured call and the
 *    structural call disagree like this, the compound is not promoted on
 *    the strength of the assay alone; the conflict is shown instead.
 *
 *  - The saturated fatty acids landed in the list at nearest 0.28, trailing
 *    butylparaben. Their pocket verdict is 결합 가능성 낮음: the structure
 *    says they do not occupy the cavity at all. Something that does not
 *    bind cannot be an antagonist, whatever it resembles.
 */
var RANK_BANDS = {
  high:   { word: '우선 확인', note: '실측 또는 예측 등급 + pKi 5.0 이상 + 구조와 모순 없음' },
  medium: { word: '참고',      note: '가능성 등급이거나, 결합이 약하거나(pKi 4–5), 증거가 엇갈림' },
  low:    { word: '낮음',      note: '포켓에 결합할 구조가 아니거나 pKi 4.0 미만' }
};

function rankAntagonists(evidenceFor) {
  var rows = [];
  for (var i = 0; i < INGREDIENTS.length; i++) {
    var ko = INGREDIENTS[i][0], en = INGREDIENTS[i][1], smi = INGREDIENTS[i][2];
    var mol;
    try { mol = AR.parseSmiles(smi); } catch (err) { continue; }
    var ev = {};
    try { ev = evidenceFor(smi, mol) || {}; } catch (err) { ev = {}; }
    var res;
    try { res = predict(smi, ev); } catch (err) { continue; }
    var fc = res.functionCall;
    if (fc.label !== 'antagonist') continue;

    var pocket = res.pocket;
    var motifs = AR.detectMotifs(mol);
    /* A compound that is itself one of the 38 curated references matches
     * itself at similarity 1.00, so calling that a "prediction" would dress
     * an input up as a finding and put it at the top of the list for a
     * circular reason. Its label is established pharmacology; say so, and
     * let the reader filter these out to see what the tool actually
     * flagged on its own.
     *
     * But only when the curated label actually says antagonist. DHEA is in
     * the reference set as an AGONIST, and a Tox21 antagonist-mode hit was
     * enough to put it in this list at #2 wearing a "문헌" badge - which
     * reads as "the literature calls this an antagonist", the exact
     * opposite of the truth. A curated label pointing the other way is the
     * strongest disagreement available here, so it demotes. */
    var curatedLabel = FUNCTION_CLASS[en] || null;
    var curated = curatedLabel === 'antagonist';
    var curatedConflict = !!curatedLabel && curatedLabel !== 'antagonist';
    var flags = [];
    /* The measured call and the structure point opposite ways.
     *
     * A bare steroid counts as a disagreement even when the pocket verdict
     * stops short of "agonist", because the bulky 17-substituent is the one
     * thing that separates a steroidal antagonist from an androgen - it is
     * already the motif the functional call uses for exactly that. Without
     * it, an antagonist-mode hit on a steroid is far more likely to be
     * competition than antagonism. This catches DHEA, pregnenolone, estrone
     * and finasteride, and leaves cyproterone, megestrol and chlormadinone
     * alone. */
    var bareSteroid = !!motifs.steroid && !motifs.steroidBulky;
    var conflict = curatedConflict ||
                   (fc.tier === 'measured' &&
                    (pocket.verdictKey === 'agonist' || bareSteroid));
    if (curatedConflict) {
      flags.push('이 도구의 기능 레퍼런스는 이 물질을 ' +
                 (CLASS_LABELS[curatedLabel] || curatedLabel) +
                 '로 싣고 있습니다 — 어세이의 길항 신호와 정면으로 어긋납니다');
    } else if (conflict) {
      flags.push(pocket.verdictKey === 'agonist'
        ? '실측은 길항, 구조는 작용제 — 길항제 모드는 경쟁만 해도 신호가 ' +
          '내려가므로 부분작용제가 이렇게 잡힙니다'
        : '부피 큰 치환기가 없는 스테로이드 — 스테로이드계 길항제를 ' +
          '안드로겐과 가르는 특징이 없으므로, 길항이 아니라 경쟁일 수 있습니다');
    }
    var nonBinder = pocket.verdictKey === 'weak' || res.pKi < 4.0;
    if (nonBinder) {
      flags.push('포켓 결합 근거가 약합니다 — 길항 이전에 결합 자체가 의심스럽습니다');
    }
    if (res.domain === 'out') {
      flags.push('적용영역 밖 — pKi 수치는 신뢰하지 마세요');
    }
    /* The binary cytotoxic flag was shown and never acted on, because
       bicalutamide is cytotoxic in one of its three wells and demoting on
       it would bury the canonical antagonist. With AC50s there is a real
       number instead of a flag: how far the antagonist signal sits below
       the concentration that kills the cells. Bicalutamide's margin is
       2.5x, prochloraz's is 0.16x. */
    var toxRead = ev.tox21 ? readTox21(ev.tox21) : null;
    if (fc.tier === 'measured' && toxRead && toxRead.cytotoxic) {
      flags.push('다른 어세이에서 세포독성 — 세포를 죽여도 신호가 내려가므로 ' +
                 '길항 활성이 과대평가될 수 있습니다');
    }
    var pot = ev.potencyFor ? ev.potencyFor(mol) : null;
    var cytoMeasured = false, agonistStronger = false;
    if (pot) {
      if (pot.margin != null && pot.margin < MARGIN_SUSPECT) {
        cytoMeasured = true;
        flags.push('세포생존 AC50가 길항 AC50의 ' + pot.margin + '배뿐입니다 — ' +
                   '신호가 세포 죽는 농도와 겹치므로 길항이 아니라 세포독성일 ' +
                   '수 있습니다 (실측)');
      }
      /* It activates the receptor at a far lower concentration than it
         silences it. Alfatradiol: agonist AC50 1.08 uM at +96.5% efficacy
         against an antagonist AC50 of 44.9 uM. That is an agonist. */
      if (pot.gp != null && pot.ap != null && pot.gp * 5 < pot.ap &&
          pot.ge != null && pot.ge > 20) {
        agonistStronger = true;
        flags.push('작용제 모드 AC50 ' + pot.gp + ' µM (효력 ' + pot.ge +
                   '%)가 길항제 모드 ' + pot.ap + ' µM보다 ' +
                   Math.round(pot.ap / pot.gp) + '배 낮습니다 — 실측으로는 ' +
                   '작용제 쪽입니다');
      }
    }

    /* A curated antagonist label is established pharmacology and outranks
       an inference drawn from two AC50s. Spironolactone and drospirenone
       both show agonist-mode activity in these screens - spironolactone is
       an AR antagonist that is also a progesterone-receptor agonist - and
       sinking them to the bottom of an antagonist list on that basis would
       be the assay overruling what is known. The disagreement is still
       worth showing, so it stays in the flags. */
    var band;
    if (curated) band = res.pKi < 5.0 ? 'medium' : 'high';
    else if (nonBinder || agonistStronger) band = 'low';
    else if (cytoMeasured) band = 'medium';
    else if (curatedConflict) band = 'medium';
    else if (fc.tier === 'possible' || conflict || res.pKi < 5.0) band = 'medium';
    else band = 'high';

    rows.push({
      ko: ko, en: en, smiles: smi, curated: curated,
      use: useClassOf(en), dermal: dermalScreen(AR.computeDescriptors(mol)),
      curatedLabel: curatedLabel,
      tier: curated ? 'curated' : fc.tier, callTier: fc.tier,
      pKi: res.pKi, domain: res.domain,
      nearest: fc.nearest, support: fc.support,
      pocketVerdict: pocket.verdict, occupancy: res.occupancy,
      band: band, conflict: conflict, nonBinder: nonBinder,
      cytoMeasured: cytoMeasured, agonistStronger: agonistStronger,
      potency: pot || null,
      cytotoxic: !!(toxRead && toxRead.cytotoxic),
      flags: flags, evidence: fc.evidence || [],
      refAntagonists: fc.refAntagonists || [],
      mutantShift: res.mutantShift || null
    });
  }

  /* Band first, then potency. Evidence quality is already baked into the
     band, so ordering by tier inside it only pushed a measured pKi 5.0
     above a predicted pKi 9.0, which is not the order anyone screening
     ingredients wants. The tier stays visible as its own column. */
  var bandOrder = { high: 3, medium: 2, low: 1 };
  rows.sort(function (a, b) {
    if (bandOrder[b.band] !== bandOrder[a.band]) return bandOrder[b.band] - bandOrder[a.band];
    if (b.pKi !== a.pKi) return b.pKi - a.pKi;
    return a.en < b.en ? -1 : 1;
  });
  for (var r = 0; r < rows.length; r++) rows[r].rank = r + 1;
  return rows;
}

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
  { id: 'Trp741', role: '입체 관문 (W741L 내성)' },
  { id: 'Phe876', role: '입체 관문 (F876L 내성)' },
  { id: 'Thr877', role: 'D-ring / helix-12 (T877A 내성)' },
  { id: 'Met895', role: 'helix-12 / AF-2' },
  { id: 'Ile899', role: 'helix-12 / AF-2' }
];

/* Trp741, Phe876 and Thr877 are where the classic resistance mutations sit:
 * W741L turns bicalutamide into an agonist, T877A does the same for
 * hydroxyflutamide and cyproterone, F876L for enzalutamide. They are
 * reported, and the role text says why they matter, but they are NOT used
 * to call antagonism. Measured over the docked panel they do not separate
 * the classes at all - Trp741 is touched by 75% of agonists and 87% of
 * antagonists, Phe876 by 88% and 93%, Thr877 by every compound. They line
 * the pocket, so everything touches them. What the mutation evidence is
 * really about is the side chain being *gone*, which is measured by docking
 * the same ligand into the mutant structure, not by counting contacts. */
var RESISTANCE_SITES = ['Trp741', 'Phe876', 'Thr877'];

var ARING_ANCHORS = ['Gln711', 'Arg752'];
var DRING_ANCHORS = ['Asn705', 'Thr877'];
var HYDROPHOBIC_CORE = ['Leu704', 'Leu707', 'Met742', 'Met745'];
var HYDROPHOBIC_EXT = ['Met787', 'Phe764', 'Leu873'];
var H12_RESIDUES = ['Thr877', 'Met895', 'Ile899'];

/* --------------------------------------------------------- library state */

/* experimental class labels used by the reference library */
/* How sure the functional call is, in words, with the rule next to it so
 * the label and the criterion can never drift apart. */
var TIER_LABELS = {
  blocked:   { word: '판정 보류',   note: 'AR 외의 수용체가 이 신호를 더 잘 설명합니다 — 아래 이유 참조' },
  curated:   { word: '문헌',        note: '이 도구의 기능 레퍼런스에 등재된 물질 — 예측이 아니라 입력' },
  measured:  { word: '실측',        note: 'Tox21 리포터 어세이에서 한쪽 모드만 활성' },
  predicted: { word: '예측',        note: '최근접 레퍼런스 유사도 0.35 이상, 한쪽 근거가 50% 이상' },
  possible:  { word: '가능성',      note: '근거 방향은 한쪽이지만 유사도가 0.35 미만' },
  unknown:   { word: '판단 불가',   note: '검증된 유사도 범위를 벗어났거나 근거가 갈림' }
};

function tierPhrase(tier, label) {
  var t = TIER_LABELS[tier];
  var cls = CLASS_LABELS[label] || label;
  if (!t) return cls;
  if (tier === 'unknown' || tier === 'blocked') return t.word;
  if (tier === 'possible') return cls + ' 가능성';
  /* CLASS_LABELS.inactive already carries "(실측)"; do not say it twice */
  if (cls.indexOf('(' + t.word + ')') >= 0) return cls;
  return cls + ' (' + t.word + ')';
}

var CLASS_LABELS = {
  agonist: '작용제',
  antagonist: '길항제',
  partial: '부분 작용제',
  weak: '약한 상호작용',
  'non-binder': '비결합',
  inactive: '비활성 (실측)',
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
    fp: AR.packFingerprint(AR.morganFingerprint(mol, 2)),
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

function mapContacts(desc, motifs, dock) {
  var contact = {}, clash = {}, notes = [];

  /* When a real docked pose exists, use what it actually touches. The rules
   * below are an inference from structure for compounds with no pose; they
   * cannot know, for instance, that Trp741 and Phe876 line the cavity and
   * are touched by almost every ligand that binds at all. */
  var measured = !!(dock && dock.placed && dock.contacts && dock.contacts.length);
  if (measured) {
    var byId = {};
    for (var pi = 0; pi < POCKET_RESIDUES.length; pi++) {
      byId[POCKET_RESIDUES[pi].id.toUpperCase()] = POCKET_RESIDUES[pi].id;
    }
    for (var ci = 0; ci < dock.contacts.length; ci++) {
      var hit = byId[String(dock.contacts[ci]).toUpperCase()];
      if (hit) contact[hit] = true;
    }
    var h12measured = !!dock.ile899;
    if (h12measured) {
      for (var hi = 0; hi < H12_RESIDUES.length; hi++) {
        if (contact[H12_RESIDUES[hi]]) clash[H12_RESIDUES[hi]] = true;
      }
      /* Worth stating what this can and cannot mean. 2AM9 is the agonist
     * conformation: helix-12 is already folded over the pocket like a lid,
     * and the receptor is rigid during docking. A real antagonist works by
     * pushing that helix out, which is a motion this calculation cannot
     * perform - enzalutamide does not even place here. So "touches Ile899"
     * is not a detection of antagonism; it is a detection of a ligand long
     * enough to reach the closed lid. It fired on 4 of 22 with no false
     * positives, and n = 4. */
    notes.push('도킹 포즈가 helix-12 말단(Ile899)에 닿음 — AF-2 교란 가능. ' +
               '다만 2AM9는 작용제 형태라 helix-12가 이미 닫혀 있고 도킹 중 ' +
               '수용체는 고정입니다. 진짜 길항제가 하는 helix-12 밀어내기는 ' +
               '이 계산이 재현할 수 없는 동작이라(엔잘루타미드는 배치조차 실패), ' +
               '이 신호는 길항성 탐지가 아니라 「닫힌 뚜껑에 닿을 만큼 긴 분자」 ' +
               '탐지에 가깝습니다. 22종 중 4종에서 발동했고 위양성은 0이었습니다.');
    }
    var hbs = [];
    for (var bi = 0; bi < (dock.hbonds || []).length; bi++) {
      var hb = byId[String(dock.hbonds[bi]).toUpperCase()];
      if (hb) hbs.push(hb);
    }
    if (hbs.length) notes.push('수소결합 후보: ' + hbs.join(', '));

    var aMet = ARING_ANCHORS.every(function (r) { return contact[r]; });
    var dMet = DRING_ANCHORS.every(function (r) { return contact[r]; });
    var verdictM, keyM;
    if (h12measured) { keyM = 'antagonist'; verdictM = '길항제 가능성'; }
    else if (aMet && dMet && motifs.steroidKeto3) { keyM = 'agonist'; verdictM = '작용제 가능성'; }
    else if (aMet && dMet) { keyM = 'binder'; verdictM = '결합 가능 · 기능 미정'; }
    else { keyM = 'weak'; verdictM = '결합 가능성 낮음'; }

    return {
      residues: POCKET_RESIDUES.map(function (r) {
        return { id: r.id, role: r.role,
                 contact: !!contact[r.id], clash: !!clash[r.id] };
      }),
      contactCount: Object.keys(contact).length,
      h12Clash: h12measured,
      aringAnchored: aMet,
      dringAnchored: dMet,
      verdict: verdictM,
      verdictKey: keyM,
      measured: true,
      notes: notes
    };
  }

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
    measured: false,
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
  var fp = AR.packFingerprint(AR.morganFingerprint(mol, 2));

  var volume = AR.mcGowanVolume(mol);
  var occupancy = volume / POCKET_VOLUME * 100;

  var neighbours = [];
  for (var i = 0; i < lib.length; i++) {
    if (exclude && lib[i].n === exclude) continue;
    neighbours.push({
      n: lib[i].n, p: lib[i].p, c: lib[i].c, s: lib[i].s,
      sim: AR.tanimotoPacked(fp, lib[i].fp)
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

  var functionCall = callFunction(fp, {
    exclude: exclude, dock: options.dock || null, motifs: motifs,
    tox21: options.tox21 || null,
    structureId: AR.structureIdOf(mol)
  });

  var wRead = nearest >= 0.55 ? 0.78 : (nearest >= 0.35 ? 0.50 : 0.20);
  var pKi = wRead * readAcross + (1 - wRead) * rules.score;

  var domain, ci;
  if (nearest >= 0.55) { domain = 'in'; ci = 0.7; }
  else if (nearest >= 0.35) { domain = 'edge'; ci = 1.1; }
  else { domain = 'out'; ci = 1.6; }

  var pocket = mapContacts(desc, motifs, options.dock || null);

  /* A molecule bigger than the cavity is not going into it.
   *
   * The AR pocket is about 400 A^3 and it is one of the smaller nuclear
   * receptor sites. Checked against the 94 dictionary compounds with a
   * Tox21 verdict, the bands run 0-60% occupancy 24% active, 60-85% 60%,
   * 85-100% 80%, and over 100% - eight compounds - zero active. Not one.
   *
   * The read-across does not know this, and it was the tool's two worst
   * false positives: cholesterol at 106% of the cavity and beta-sitosterol
   * at 114% came back at pKi 6.4, measured inactive, and sitosterol was
   * even labelled a possible antagonist. They score well because they are
   * steroids, and the model matches the scaffold without noticing that the
   * C17 tail leaves no room for the rest of the molecule.
   *
   * The number is not quietly adjusted - that would hide the disagreement.
   * The structural verdict is forced down and says why. */
  if (volume > POCKET_VOLUME) {
    pocket.verdictKey = 'weak';
    pocket.verdict = '부피 기준 초과 — 결합 어려움';
    pocket.oversize = true;
    pocket.notes = (pocket.notes || []).concat(
      '분자 부피 ' + Math.round(volume) + ' Å³가 기준 ' + POCKET_VOLUME +
      ' Å³를 넘습니다. 이 기준은 <b>측정된 공동 부피가 아니라 경험적 컷</b>입니다 — ' +
      'Tox21 판정이 있는 94종에서 이 선을 넘는 8종이 하나도 활성이 아니었고, ' +
      '380~420 Å³ 어디에 놓아도 결과가 같습니다. 다만 그 평탄구간은 ' +
      '활성 최대 376 Å³과 비활성 최소 387 Å³ 사이 11 Å³ 틈이 만든 것이라 ' +
      '얇습니다. 아래 pKi는 들어가기 어려운 자리에 대한 유사도 추정이므로 ' +
      '읽지 마세요.');
  }

  /* Keep the two verdicts from contradicting each other. The anchor rules
   * answer "could the polar groups reach the anchors", which a tetra-alanine
   * satisfies on paper; saying "binding plausible" next to a predicted Ki of
   * 100 uM is incoherent, so the weaker reading wins. */
  if (pocket.verdictKey === 'binder' && pKi < 5.0) {
    pocket.verdictKey = 'weak';
    pocket.verdict = '결합 가능성 낮음';
    pocket.notes = pocket.notes.concat(
      ['앵커 조건은 형식상 충족하나 예측 친화도가 낮아 결합 주장으로 보지 않음']);
  }

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

/* Ingredient names arrive with spaces, hyphens, dots, Greek letters spelled
 * out, and the Korean INCI habit of writing "-산" as "-애씨드". Strip all of
 * that before comparing, or "Benzophenone-3" and "벤조페논 3" miss. */
function normalizeName(value) {
  var v = String(value === null || value === undefined ? '' : value)
    .toLowerCase()
    .replace(/[\s\-_.,()\[\]{}'"/\\+·・]/g, '');
  v = v.replace(/애씨드/g, '산').replace(/액시드/g, '산');
  /* The same drug is transliterated two ways and both are in daily use. The
   * dictionary itself is inconsistent - it has 플루타마이드 but 비칼루타미드 -
   * so collapsing the variants is better than chasing aliases one at a time.
   * "비칼루타마이드" missing entirely is how this was found. */
  v = v.replace(/마이드/g, '미드');
  v = v.replace(/퀘/g, '케').replace(/놀락톤/g, '노락톤');
  v = v.replace(/하이드록시/g, '히드록시').replace(/하이드로/g, '히드로');
  v = v.replace(/카르복/g, '카복').replace(/술폰/g, '설폰').replace(/술페이트/g, '설페이트');
  v = v.replace(/alpha/g, 'a').replace(/beta/g, 'b').replace(/gamma/g, 'g');
  v = v.replace(/알파/g, 'a').replace(/베타/g, 'b').replace(/감마/g, 'g');
  return v;
}

/* every searchable spelling of an entry */
function entryNames(entry) {
  var names = [entry[0], entry[1]];
  if (entry[3]) for (var i = 0; i < entry[3].length; i++) names.push(entry[3][i]);
  return names;
}

function asResult(entry) {
  return { ko: entry[0], en: entry[1], s: entry[2], aliases: entry[3] || [] };
}

/* Dice coefficient over character bigrams. Works on Korean and English
 * alike, which a word-token score does not. */
function bigramScore(a, b) {
  if (!a.length || !b.length) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  var grams = {}, total = 0, i;
  for (i = 0; i < a.length - 1; i++) {
    var g = a.substr(i, 2);
    grams[g] = (grams[g] || 0) + 1;
    total++;
  }
  var hit = 0, count = 0;
  for (i = 0; i < b.length - 1; i++) {
    var h = b.substr(i, 2);
    count++;
    if (grams[h]) { grams[h]--; hit++; }
  }
  return (2 * hit) / (total + count);
}

/* A partial match must be at least this long, and cover at least this much
 * of the name it matched. Both were tuned so that every real alias in the
 * dictionary still resolves by exact match, and the generic fragments that
 * used to mis-resolve now fall through to suggestions. */
/* One wrong syllable should not look like an unknown compound.
 *
 * The transliteration variants are endless - 비칼루타마이드/미드,
 * 케르세틴/퀘르세틴, 스피로놀락톤/노락톤 - and patching them one rule at a
 * time was losing. So after the exact and prefix passes fail, allow a
 * single edit, but only where it cannot invent a match: the query must be
 * long, and exactly one dictionary name may be within that one edit. Two
 * candidates means ambiguity and the query falls through to suggestions,
 * which is the behaviour the generic-fragment guard already enforces. */
var FUZZY_MIN_CHARS = 5;

function editDistanceAtMost1(a, b) {
  if (a === b) return true;
  var la = a.length, lb = b.length;
  if (Math.abs(la - lb) > 1) return false;
  var i = 0, j = 0, edits = 0;
  while (i < la && j < lb) {
    if (a.charAt(i) === b.charAt(j)) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (la === lb) { i++; j++; }
    else if (la > lb) { i++; }
    else { j++; }
  }
  if (i < la || j < lb) edits++;
  return edits <= 1;
}

function fuzzyUnique(q) {
  if (q.length < FUZZY_MIN_CHARS) return null;
  var hit = null;
  for (var i = 0; i < INGREDIENTS.length; i++) {
    var names = entryNames(INGREDIENTS[i]);
    var matched = false;
    for (var j = 0; j < names.length; j++) {
      var n = normalizeName(names[j]);
      if (n.length < FUZZY_MIN_CHARS) continue;
      if (editDistanceAtMost1(q, n)) { matched = true; break; }
    }
    if (!matched) continue;
    if (hit && hit !== INGREDIENTS[i]) return null;   /* ambiguous */
    hit = INGREDIENTS[i];
  }
  return hit ? asResult(hit) : null;
}

var PARTIAL_MIN_CHARS = 4;
var PARTIAL_MIN_COVER = 0.7;

function lookupName(query) {
  if (!query) return null;
  var q = normalizeName(query);
  if (!q) return null;
  var i, j, names, n;

  for (i = 0; i < INGREDIENTS.length; i++) {
    names = entryNames(INGREDIENTS[i]);
    for (j = 0; j < names.length; j++) {
      if (normalizeName(names[j]) === q) return asResult(INGREDIENTS[i]);
    }
  }
  /* Partial matching, deliberately strict.
   *
   * A loose substring rule silently resolves a generic fragment to an
   * arbitrary compound and then renders a full, authoritative-looking
   * prediction for a molecule the user never asked about: "페놀" came back
   * as bisphenol A, "산" as oxandrolone, "acid" as gallic acid. That is the
   * worst failure this tool can have. So a partial match has to be long
   * enough to mean something, has to cover most of the name it matches, and
   * has to be unambiguous - otherwise the caller gets nothing and the UI
   * offers suggestions instead of picking one. */
  if (q.length < PARTIAL_MIN_CHARS) return null;

  var hits = [];
  for (i = 0; i < INGREDIENTS.length; i++) {
    names = entryNames(INGREDIENTS[i]);
    var bestCover = 0;
    for (j = 0; j < names.length; j++) {
      n = normalizeName(names[j]);
      if (n.length < PARTIAL_MIN_CHARS) continue;
      var longer = n.length >= q.length ? n : q;
      var shorter = n.length >= q.length ? q : n;
      if (longer.indexOf(shorter) < 0) continue;
      var cover = shorter.length / longer.length;
      if (cover > bestCover) bestCover = cover;
    }
    if (bestCover >= PARTIAL_MIN_COVER) {
      hits.push({ entry: INGREDIENTS[i], cover: bestCover });
    }
  }
  if (!hits.length) return fuzzyUnique(q);

  /* A query that begins several names is ambiguous however well it covers
   * one of them: "estro" starts estrone, estradiol and estriol, and
   * silently picking the shortest is the same silent wrong answer. */
  var prefixOf = 0;
  for (i = 0; i < INGREDIENTS.length; i++) {
    names = entryNames(INGREDIENTS[i]);
    for (j = 0; j < names.length; j++) {
      if (normalizeName(names[j]).indexOf(q) === 0) { prefixOf++; break; }
    }
  }
  if (prefixOf > 1) return null;

  hits.sort(function (a, b) { return b.cover - a.cover; });
  /* a clear winner only; a near-tie means the query was ambiguous */
  if (hits.length > 1 && hits[1].cover >= hits[0].cover - 1e-9) return null;
  return asResult(hits[0].entry);
}

/* Closest names, for when the lookup fails and the input is not a SMILES
 * either. Returning nothing but an error leaves the user guessing at
 * spelling; this at least offers the neighbourhood. */
function suggestNames(query, limit) {
  limit = limit || 5;
  var q = normalizeName(query);
  if (q.length < 2) return [];
  var scored = [];
  for (var i = 0; i < INGREDIENTS.length; i++) {
    var names = entryNames(INGREDIENTS[i]), best = 0;
    for (var j = 0; j < names.length; j++) {
      var sc = bigramScore(q, normalizeName(names[j]));
      if (sc > best) best = sc;
    }
    if (best > 0.3) scored.push({ entry: INGREDIENTS[i], score: best });
  }
  scored.sort(function (a, b) { return b.score - a.score; });
  return scored.slice(0, limit).map(function (r) {
    var out = asResult(r.entry);
    out.score = r.score;
    return out;
  });
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
  suggestNames: suggestNames,
  normalizeName: normalizeName,
  crossValidate: crossValidate,
  getLibrary: getLibrary,
  libraryAsJson: libraryAsJson,
  setLibrary: setLibrary,
  resetLibrary: resetLibrary,
  REFERENCE_DEFAULT: REFERENCE_DEFAULT,
  CLASS_LABELS: CLASS_LABELS,
  readPotency: readPotency,
  MARGIN_SUSPECT: MARGIN_SUSPECT,
  PROV_GRADE_KO: PROV_GRADE_KO,
  REFERENCE_NOTES: REFERENCE_NOTES,
  TIER_LABELS: TIER_LABELS,
  tierPhrase: tierPhrase,
  FUNCTION_CLASS: FUNCTION_CLASS,
  callFunction: callFunction,
  rankAntagonists: rankAntagonists,
  USE_CLASS: USE_CLASS,
  USE_CLASSES: USE_CLASSES,
  useClassOf: useClassOf,
  dermalScreen: dermalScreen,
  rankAffinity: rankAffinity,
  designAnalogues: designAnalogues,
  DESIGN_RULES: DESIGN_RULES,
  substitutionSites: substitutionSites,
  RANK_BANDS: RANK_BANDS,
  TOX21_MODES: TOX21_MODES,
  registerMeasured: registerMeasured,
  POOL_EXCLUSIONS: POOL_EXCLUSIONS,
  POOL_CAVEATS: POOL_CAVEATS,
  functionPool: functionPool,
  SIM_CALL: SIM_CALL,
  SIM_POSSIBLE: SIM_POSSIBLE,
  SIM_FLOOR: SIM_FLOOR,
  readTox21: readTox21,
  TOX21_CODE: TOX21_CODE,
  TOX21_LABEL_KO: TOX21_LABEL_KO,
  ensureFunctionLibrary: ensureFunctionLibrary,
  INGREDIENTS: INGREDIENTS,
  POCKET_RESIDUES: POCKET_RESIDUES,
  RESISTANCE_SITES: RESISTANCE_SITES,
  POCKET_VOLUME: POCKET_VOLUME
};
