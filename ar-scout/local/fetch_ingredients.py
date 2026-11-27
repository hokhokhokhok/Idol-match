#!/usr/bin/env python3
"""Fetch ingredient structures from ChEMBL and regenerate the app's dictionary.

Writing SMILES from memory is how wrong structures get into a reference
library, and a wrong structure quietly corrupts every similarity it takes
part in. So names are resolved against ChEMBL, and every result is checked
against the expected molecular formula before it is accepted.

Rewrites the block between the INGREDIENTS markers in web/predict.js.

    python3 fetch_ingredients.py            # fetch, verify, rewrite
    python3 fetch_ingredients.py --dry-run  # report only
"""

import argparse
import json
import pathlib
import re
import sys
import time
import urllib.parse

try:
    import requests
except ImportError:
    requests = None

HERE = pathlib.Path(__file__).resolve().parent
WEB = HERE.parent / "web"
PREDICT = WEB / "predict.js"
CACHE = HERE / "ingredient_cache.json"

SEARCH = "https://www.ebi.ac.uk/chembl/api/data/molecule/search.json"

BEGIN = "/* INGREDIENTS:BEGIN"
END = "/* INGREDIENTS:END */"

# (korean, english, chembl query, expected formula or None, extra aliases)
# Expected formulas are the check on the lookup: a name that resolves to the
# wrong molecule in ChEMBL is caught here rather than in someone's screen.
WANTED = [
    # ---- reference androgens / antiandrogens (already curated, kept for names)
    ("메트리볼론", "Metribolone", "metribolone", "C19H24O2", ["R1881", "R-1881"]),
    ("트렌볼론", "Trenbolone", "trenbolone", "C18H22O2", []),
    ("디하이드로테스토스테론", "Dihydrotestosterone", "dihydrotestosterone", "C19H30O2",
     ["DHT", "안드로스타놀론", "Androstanolone", "스타놀론"]),
    ("난드롤론", "Nandrolone", "nandrolone", "C18H26O2", ["19-노르테스토스테론"]),
    ("테스토스테론", "Testosterone", "testosterone", "C19H28O2", []),
    ("메틸테스토스테론", "Methyltestosterone", "methyltestosterone", "C20H30O2", []),
    ("메스테롤론", "Mesterolone", "mesterolone", "C20H32O2", []),
    ("볼데논", "Boldenone", "boldenone", "C19H26O2", []),
    ("스타노졸올", "Stanozolol", "stanozolol", "C21H32N2O", []),
    ("옥산드롤론", "Oxandrolone", "oxandrolone", "C19H30O3", []),
    ("옥시메톨론", "Oxymetholone", "oxymetholone", "C21H32O3", []),
    ("다나졸", "Danazol", "danazol", "C22H27NO2", []),
    ("안드로스테론", "Androsterone", "androsterone", "C19H30O2", []),
    ("에피안드로스테론", "Epiandrosterone", "epiandrosterone", "C19H30O2", []),
    ("디에이치이에이", "DHEA", "prasterone", "C19H28O2",
     ["Dehydroepiandrosterone", "데하이드로에피안드로스테론", "프라스테론"]),
    ("안드로스텐디온", "Androstenedione", "androstenedione", "C19H26O2", []),
    ("아비라테론", "Abiraterone", "abiraterone", "C24H31NO", []),
    ("알파트라디올", "Alfatradiol", "alfatradiol", "C18H24O2", ["17알파에스트라디올"]),

    ("비칼루타미드", "Bicalutamide", "bicalutamide", "C18H14F4N2O4S", []),
    ("엔잘루타미드", "Enzalutamide", "enzalutamide", "C21H16F4N4O2S", ["MDV3100"]),
    ("아팔루타미드", "Apalutamide", "apalutamide", "C21H15F4N5O2S", ["ARN-509"]),
    ("다롤루타미드", "Darolutamide", "darolutamide", "C19H19ClN6O2", ["ODM-201"]),
    ("닐루타미드", "Nilutamide", "nilutamide", "C12H10F3N3O4", []),
    ("플루타마이드", "Flutamide", "flutamide", "C11H11F3N2O3", []),
    ("하이드록시플루타마이드", "Hydroxyflutamide", "hydroxyflutamide", "C11H11F3N2O4",
     ["2-하이드록시플루타마이드"]),
    ("사이프로테론아세테이트", "Cyproterone acetate", "cyproterone acetate", "C24H29ClO4",
     ["CPA", "사이프로테론"]),
    ("스피로노락톤", "Spironolactone", "spironolactone", "C24H32O4S", []),
    ("클라스코테론", "Clascoterone", "clascoterone", "C24H34O5",
     ["코르텍솔론17알파프로피오네이트", "CB-03-01"]),
    ("피나스테리드", "Finasteride", "finasteride", "C23H36N2O2", []),
    ("두타스테리드", "Dutasteride", "dutasteride", "C27H30F6N2O2", []),

    # ---- progestins / oestrogens / corticosteroids
    ("프로게스테론", "Progesterone", "progesterone", "C21H30O2", []),
    ("메드록시프로게스테론아세테이트", "Medroxyprogesterone acetate",
     "medroxyprogesterone acetate", "C24H34O4", ["MPA"]),
    ("메게스트롤아세테이트", "Megestrol acetate", "megestrol acetate", "C24H32O4", []),
    ("클로르마디논아세테이트", "Chlormadinone acetate", "chlormadinone acetate",
     "C23H29ClO4", []),
    ("드로스피레논", "Drospirenone", "drospirenone", "C24H30O3", []),
    ("디에노게스트", "Dienogest", "dienogest", "C20H25NO2", []),
    ("노르에티스테론", "Norethisterone", "norethisterone", "C20H26O2",
     ["노르에틴드론", "Norethindrone"]),
    ("레보노르게스트렐", "Levonorgestrel", "levonorgestrel", "C21H28O2", []),
    ("티볼론", "Tibolone", "tibolone", "C21H28O2", []),
    ("에스트라디올", "Estradiol", "estradiol", "C18H24O2", ["17베타에스트라디올"]),
    ("에스트론", "Estrone", "estrone", "C18H22O2", []),
    ("에스트리올", "Estriol", "estriol", "C18H24O3", []),
    ("에티닐에스트라디올", "Ethinylestradiol", "ethinylestradiol", "C20H24O2", []),
    ("하이드로코르티손", "Hydrocortisone", "hydrocortisone", "C21H30O5", ["코르티솔"]),
    ("덱사메타손", "Dexamethasone", "dexamethasone", "C22H29FO5", []),
    ("프레드니솔론", "Prednisolone", "prednisolone", "C21H28O5", []),
    ("코르티코스테론", "Corticosterone", "corticosterone", "C21H30O4", []),
    ("알도스테론", "Aldosterone", "aldosterone", "C21H28O5", []),
    ("프레그네놀론", "Pregnenolone", "pregnenolone", "C21H32O2", []),
    ("콜레스테롤", "Cholesterol", "cholesterol", "C27H46O", []),

    # ---- flavonoids and other polyphenols
    ("피세틴", "Fisetin", "fisetin", "C15H10O6", []),
    ("퀘르세틴", "Quercetin", "quercetin", "C15H10O7", []),
    ("루테올린", "Luteolin", "luteolin", "C15H10O6", []),
    ("아피제닌", "Apigenin", "apigenin", "C15H10O5", []),
    ("켐페롤", "Kaempferol", "kaempferol", "C15H10O6", ["캠페롤"]),
    ("미리세틴", "Myricetin", "myricetin", "C15H10O8", []),
    ("나린제닌", "Naringenin", "naringenin", "C15H12O5", []),
    ("헤스페레틴", "Hesperetin", "hesperetin", "C16H14O6", []),
    ("바이칼레인", "Baicalein", "baicalein", "C15H10O5", []),
    ("크리신", "Chrysin", "chrysin", "C15H10O4", []),
    ("갈랑긴", "Galangin", "galangin", "C15H10O5", []),
    ("모린", "Morin", "morin", "C15H10O7", []),
    ("타실리폴린", "Taxifolin", "taxifolin", "C15H12O7", ["디하이드로퀘르세틴"]),
    ("제니스테인", "Genistein", "genistein", "C15H10O5", []),
    ("다이드제인", "Daidzein", "daidzein", "C15H10O4", []),
    ("글리시테인", "Glycitein", "glycitein", "C16H12O5", []),
    ("비오카닌에이", "Biochanin A", "biochanin a", "C16H12O5", ["비오카닌A"]),
    ("포르모노네틴", "Formononetin", "formononetin", "C16H12O4", []),
    ("에쿠올", "Equol", "equol", "C15H14O3", []),
    ("쿠메스트롤", "Coumestrol", "coumestrol", "C15H8O5", []),
    ("푸에라린", "Puerarin", "puerarin", "C21H20O9", []),
    ("카테킨", "Catechin", "catechin", "C15H14O6", []),
    ("에피카테킨", "Epicatechin", "epicatechin", "C15H14O6", []),
    ("에피갈로카테킨갈레이트", "Epigallocatechin gallate",
     "epigallocatechin gallate", "C22H18O11", ["EGCG"]),
    ("실리비닌", "Silibinin", "silibinin", "C25H22O10", ["실리마린", "Silymarin"]),
    ("플로레틴", "Phloretin", "phloretin", "C15H14O5", []),
    ("레스베라트롤", "Resveratrol", "resveratrol", "C14H12O3", []),
    ("프테로스틸벤", "Pterostilbene", "pterostilbene", "C16H16O3", []),
    ("커큐민", "Curcumin", "curcumin", "C21H20O6", []),
    ("갈산", "Gallic acid", "gallic acid", "C7H6O5", ["몰식자산"]),
    ("엘라그산", "Ellagic acid", "ellagic acid", "C14H6O8", []),
    ("클로로젠산", "Chlorogenic acid", "chlorogenic acid", "C16H18O9", []),
    ("로즈마린산", "Rosmarinic acid", "rosmarinic acid", "C18H16O8", []),
    ("카페산", "Caffeic acid", "caffeic acid", "C9H8O4", []),
    ("페룰산", "Ferulic acid", "ferulic acid", "C10H10O4", []),
    ("바쿠치올", "Bakuchiol", "bakuchiol", "C18H24O", []),
    ("글리시레틴산", "Glycyrrhetinic acid", "glycyrrhetinic acid", "C30H46O4",
     ["엔녹솔론", "Enoxolone"]),
    ("아시아틱산", "Asiatic acid", "asiatic acid", "C30H48O5", []),
    ("우르솔산", "Ursolic acid", "ursolic acid", "C30H48O3", []),
    ("베타시토스테롤", "beta-Sitosterol", "sitosterol", "C29H50O", ["시토스테롤"]),

    # ---- vitamin derivatives, the long INCI names
    ("레티놀", "Retinol", "retinol", "C20H30O", ["비타민A"]),
    ("레티날", "Retinal", "retinal", "C20H28O", ["레티날데하이드"]),
    ("트레티노인", "Tretinoin", "tretinoin", "C20H28O2", ["레티노산", "올트랜스레티노산"]),
    ("아이소트레티노인", "Isotretinoin", "isotretinoin", "C20H28O2", []),
    ("아다팔렌", "Adapalene", "adapalene", "C28H28O3", []),
    ("타자로텐", "Tazarotene", "tazarotene", "C21H21NO2S", []),
    ("레티닐팔미테이트", "Retinyl palmitate", "retinyl palmitate", "C36H60O2", []),
    ("레티닐아세테이트", "Retinyl acetate", "retinyl acetate", "C22H32O2", []),
    ("아스코브산", "Ascorbic acid", "ascorbic acid", "C6H8O6", ["비타민C", "아스코빅애씨드"]),
    ("아스코빌팔미테이트", "Ascorbyl palmitate", "ascorbyl palmitate", "C22H38O7", []),
    ("나이아신아마이드", "Niacinamide", "niacinamide", "C6H6N2O",
     ["니코틴아마이드", "Nicotinamide", "비타민B3"]),
    ("판테놀", "Panthenol", "dexpanthenol", "C9H19NO4", ["덱스판테놀", "프로비타민B5"]),
    ("비오틴", "Biotin", "biotin", "C10H16N2O3S", ["비타민B7"]),
    ("토코페롤", "alpha-Tocopherol", "alpha-tocopherol", "C29H50O2",
     ["비타민E", "알파토코페롤"]),
    ("유비퀴논", "Ubiquinone", "ubiquinone", "C59H90O4", ["코엔자임Q10", "CoQ10"]),
    ("멜라토닌", "Melatonin", "melatonin", "C13H16N2O2", []),
    ("아데노신", "Adenosine", "adenosine", "C10H13N5O4", []),
    ("카페인", "Caffeine", "caffeine", "C8H10N4O2", []),

    # ---- brightening / exfoliating / barrier actives
    ("하이드로퀴논", "Hydroquinone", "hydroquinone", "C6H6O2", []),
    ("알부틴", "Arbutin", "arbutin", "C12H16O7", ["베타아르부틴"]),
    ("알파알부틴", "alpha-Arbutin", "alpha-arbutin", "C12H16O7", ["알파아르부틴"]),
    ("데옥시알부틴", "Deoxyarbutin", "deoxyarbutin", "C11H14O3", []),
    ("코직산", "Kojic acid", "kojic acid", "C6H6O4", ["코지산"]),
    ("트라넥삼산", "Tranexamic acid", "tranexamic acid", "C8H15NO2", ["트라넥사민산"]),
    ("살리실산", "Salicylic acid", "salicylic acid", "C7H6O3", ["BHA", "살리실릭애씨드"]),
    ("글라이콜산", "Glycolic acid", "glycolic acid", "C2H4O3", ["글리콜산", "AHA"]),
    ("젖산", "Lactic acid", "lactic acid", "C3H6O3", ["락틱애씨드"]),
    ("만델산", "Mandelic acid", "mandelic acid", "C8H8O3", []),
    ("아젤라산", "Azelaic acid", "azelaic acid", "C9H16O4", ["아젤라익애씨드"]),
    ("시트르산", "Citric acid", "citric acid", "C6H8O7", ["구연산"]),
    ("알란토인", "Allantoin", "allantoin", "C4H6N4O3", []),
    ("우레아", "Urea", "urea", "CH4N2O", ["요소"]),
    ("엑토인", "Ectoine", "ectoine", "C6H10N2O2", []),
    ("나이아신", "Nicotinic acid", "nicotinic acid", "C6H5NO2", ["니코틴산"]),

    # ---- scalp / antifungal / vasodilator
    ("미녹시딜", "Minoxidil", "minoxidil", "C9H15N5O", []),
    ("케토코나졸", "Ketoconazole", "ketoconazole", "C26H28Cl2N4O4", []),
    ("클림바졸", "Climbazole", "climbazole", "C15H17ClN2O2", []),
    ("시클로피록스", "Ciclopirox", "ciclopirox", "C12H17NO2", []),
    ("피록톤올아민", "Piroctone olamine", "piroctone", "C14H23NO2", ["옥토피록스"]),
    ("징크피리치온", "Zinc pyrithione", "pyrithione zinc", "C10H8N2O2S2Zn", ["ZPT"]),
    ("캡사이신", "Capsaicin", "capsaicin", "C18H27NO3", []),
    ("비마토프로스트", "Bimatoprost", "bimatoprost", "C25H37NO4", []),
    ("라타노프로스트", "Latanoprost", "latanoprost", "C26H40O5", []),
    ("세티리진", "Cetirizine", "cetirizine", "C21H25ClN2O3", []),
    ("토파시티닙", "Tofacitinib", "tofacitinib", "C16H20N6O", []),
    ("바리시티닙", "Baricitinib", "baricitinib", "C16H17N7O2S", []),

    # ---- preservatives, fragrance, surfactant-adjacent
    ("메틸파라벤", "Methylparaben", "methylparaben", "C8H8O3", []),
    ("에틸파라벤", "Ethylparaben", "ethylparaben", "C9H10O3", []),
    ("프로필파라벤", "Propylparaben", "propylparaben", "C10H12O3", []),
    ("부틸파라벤", "Butylparaben", "butylparaben", "C11H14O3", []),
    ("아이소부틸파라벤", "Isobutylparaben", "isobutylparaben", "C11H14O3", []),
    ("벤질파라벤", "Benzylparaben", "benzylparaben", "C14H12O3", []),
    ("페녹시에탄올", "Phenoxyethanol", "phenoxyethanol", "C8H10O2", []),
    ("벤질알코올", "Benzyl alcohol", "benzyl alcohol", "C7H8O", []),
    ("벤조산", "Benzoic acid", "benzoic acid", "C7H6O2", []),
    ("소르브산", "Sorbic acid", "sorbic acid", "C6H8O2", ["소르빈산"]),
    ("트리클로산", "Triclosan", "triclosan", "C12H7Cl3O2", []),
    ("트리클로카반", "Triclocarban", "triclocarban", "C13H9Cl3N2O", []),
    ("메틸아이소티아졸리논", "Methylisothiazolinone", "methylisothiazolinone",
     "C4H5NOS", ["MIT"]),
    ("유제놀", "Eugenol", "eugenol", "C10H12O2", []),
    ("티몰", "Thymol", "thymol", "C10H14O", []),
    ("리날룰", "Linalool", "linalool", "C10H18O", []),
    ("제라니올", "Geraniol", "geraniol", "C10H18O", []),
    ("시트로넬올", "Citronellol", "citronellol", "C10H20O", []),
    ("파네솔", "Farnesol", "farnesol", "C15H26O", []),
    ("리모넨", "Limonene", "limonene", "C10H16", []),
    ("멘톨", "Menthol", "menthol", "C10H20O", []),
    ("캠퍼", "Camphor", "camphor", "C10H16O", []),
    ("비사보롤", "alpha-Bisabolol", "bisabolol", "C15H26O", ["레보메놀"]),
    ("벤질살리실레이트", "Benzyl salicylate", "benzyl salicylate", "C14H12O3", []),
    ("벤질벤조에이트", "Benzyl benzoate", "benzyl benzoate", "C14H12O2", []),

    # ---- UV filters
    ("벤조페논-3", "Benzophenone-3", "oxybenzone", "C14H12O3",
     ["옥시벤존", "Oxybenzone"]),
    ("벤조페논-4", "Benzophenone-4", "sulisobenzone", "C14H12O6S", ["술리소벤존"]),
    ("아보벤존", "Avobenzone", "avobenzone", "C20H22O3", []),
    ("옥토크릴렌", "Octocrylene", "octocrylene", "C24H27NO2", []),
    ("호모살레이트", "Homosalate", "homosalate", "C16H22O3", []),
    ("옥티노세이트", "Octinoxate", "octinoxate", "C18H26O3",
     ["에틸헥실메톡시신나메이트", "옥틸메톡시신나메이트"]),
    ("옥티살레이트", "Octisalate", "octisalate", "C15H22O3", ["에틸헥실살리실레이트"]),
    ("엔자카멘", "Enzacamene", "enzacamene", "C18H22O", ["4-MBC"]),
    ("파디메이트오", "Padimate O", "padimate o", "C17H27NO2", []),

    # ---- endocrine-disrupting references
    ("비스페놀에이", "Bisphenol A", "bisphenol a", "C15H16O2", ["BPA"]),
    ("비스페놀에스", "Bisphenol S", "bisphenol s", "C12H10O4S", ["BPS"]),
    ("비스페놀에프", "Bisphenol F", "bisphenol f", "C13H12O2", ["BPF"]),
    ("노닐페놀", "Nonylphenol", "nonylphenol", "C15H24O", []),
    ("옥틸페놀", "4-Octylphenol", "4-octylphenol", "C14H22O", []),
    ("디부틸프탈레이트", "Dibutyl phthalate", "dibutyl phthalate", "C16H22O4", ["DBP"]),
    ("디에틸프탈레이트", "Diethyl phthalate", "diethyl phthalate", "C12H14O4", ["DEP"]),
    ("벤질부틸프탈레이트", "Benzyl butyl phthalate", "benzyl butyl phthalate",
     "C19H20O4", ["BBP"]),
    ("빈클로졸린", "Vinclozolin", "vinclozolin", "C12H9Cl2NO3", []),
    ("프로시미돈", "Procymidone", "procymidone", "C13H11Cl2NO2", []),
    ("리누론", "Linuron", "linuron", "C9H10Cl2N2O2", []),
    ("프로클로라즈", "Prochloraz", "prochloraz", "C15H16Cl3N3O2", []),
    ("아트라진", "Atrazine", "atrazine", "C8H14ClN5", []),
    ("메톡시클로르", "Methoxychlor", "methoxychlor", "C16H15Cl3O2", []),
    ("페니트로티온", "Fenitrothion", "fenitrothion", "C9H12NO5PS", []),

    # ---- long INCI derivative names, the ones people actually type
    ("에틸아스코빌에터", "3-O-Ethyl ascorbic acid", "3-o-ethylascorbic acid", "C8H12O6",
     ["에틸아스코빅애씨드", "3-O-에틸아스코브산", "Ethyl ascorbic acid"]),
    ("아스코빌글루코사이드", "Ascorbyl glucoside", "ascorbyl glucoside", "C12H18O11",
     ["AA2G", "아스코빌글루코사이드"]),
    ("테트라헥실데실아스코베이트", "Tetrahexyldecyl ascorbate",
     "tetrahexyldecyl ascorbate", "C70H128O10", ["THDA", "비타민C유도체"]),
    ("하이드록시피나콜론레티노에이트", "Hydroxypinacolone retinoate",
     "hydroxypinacolone retinoate", "C26H38O3", ["HPR", "그라나틱애씨드"]),
    ("레티닐프로피오네이트", "Retinyl propionate", "retinyl propionate", "C23H34O2", []),
    ("토코페릴아세테이트", "Tocopheryl acetate", "tocopheryl acetate", "C31H52O3",
     ["비타민E아세테이트"]),
    ("마그네슘아스코빌포스페이트", "Magnesium ascorbyl phosphate",
     "magnesium ascorbyl phosphate", "C6H7MgO9P", ["MAP"]),
    ("다이포타슘글리시리제이트", "Dipotassium glycyrrhizate",
     "dipotassium glycyrrhizinate", "C42H60K2O16", ["글리시리진산이칼륨"]),
    ("글리세릴글루코사이드", "Glyceryl glucoside", "glyceryl glucoside", "C9H18O8", []),

    # ---- bulk / emollient / simple
    ("글리세린", "Glycerin", "glycerol", "C3H8O3", ["글리세롤"]),
    ("부틸렌글라이콜", "Butylene glycol", "butylene glycol", "C4H10O2", ["1,3-부틸렌글라이콜"]),
    ("프로판다이올", "Propanediol", "1,3-propanediol", "C3H8O2", []),
    ("프로필렌글라이콜", "Propylene glycol", "propylene glycol", "C3H8O2", []),
    ("스쿠알렌", "Squalene", "squalene", "C30H50", []),
    ("올레산", "Oleic acid", "oleic acid", "C18H34O2", ["올레익애씨드"]),
    ("리놀레산", "Linoleic acid", "linoleic acid", "C18H32O2", ["리놀레익애씨드"]),
    ("팔미트산", "Palmitic acid", "palmitic acid", "C16H32O2", []),
    ("스테아르산", "Stearic acid", "stearic acid", "C18H36O2", []),
    ("라우르산", "Lauric acid", "lauric acid", "C12H24O2", ["라우릭애씨드"]),
    ("미리스트산", "Myristic acid", "myristic acid", "C14H28O2", []),
]


# ChEMBL's text search returns esters and salts for several of these - asking
# for "estradiol" gives ESTRADIOL VALERATE - and a few are simply absent. The
# formula check above catches that; these are the verified parent structures
# to use instead. Every one is validated against its expected formula below.
FALLBACK = {
    "dihydrotestosterone": "CC12CCC3C(CCC4C3CCC4O)C1(C)CCC(=O)C2",
    "estradiol": "CC12CCC3c4ccc(O)cc4CCC3C1CCC2O",
    "estrone": "CC12CCC3c4ccc(O)cc4CCC3C1CCC2=O",
    "hydrocortisone": "OCC(=O)C1(O)CCC2C1(C)CC(O)C1C2CCC2=CC(=O)CCC12C",
    "prednisolone": "OCC(=O)C1(O)CCC2C1(C)CC(O)C1C2CCC2=CC(=O)C=CC12C",
    "pregnenolone": "CC(=O)C1CCC2C1(C)CCC1C2CC=C2CC(O)CCC12C",
    "bisphenol s": "Oc1ccc(cc1)S(=O)(=O)c1ccc(O)cc1",
    "benzyl butyl phthalate": "CCCCOC(=O)c1ccccc1C(=O)OCc1ccccc1",
    "butylene glycol": "CC(O)CCO",
    "isobutylparaben": "CC(C)COC(=O)c1ccc(O)cc1",
    "methylisothiazolinone": "CN1SC=CC1=O",
    "3-o-ethylascorbic acid": "CCOC1=C(O)C(=O)OC1C(O)CO",
    "ascorbyl glucoside": "OCC(O)C1OC(=O)C(OC2OC(CO)C(O)C(O)C2O)=C1O",
    "retinyl propionate": "CC1=C(C=CC(C)=CC=CC(C)=CCOC(=O)CC)C(C)(C)CCC1",
    "glyceryl glucoside": "OCC(O)COC1OC(CO)C(O)C(O)C1O",
    "hydroxypinacolone retinoate":
        "CC1=C(C=CC(C)=CC=CC(C)=CC(=O)OCC(=O)C(C)(C)C)C(C)(C)CCC1",
    "ubiquinone":
        "COC1=C(OC)C(=O)C(C)=C(CC=C(C)CCC=C(C)CCC=C(C)CCC=C(C)CCC=C(C)CCC=C(C)"
        "CCC=C(C)CCC=C(C)CCC=C(C)CCC=C(C)C)C1=O",
    "tetrahexyldecyl ascorbate":
        "CCCCCCCCC(CCCCCC)C(=O)OCC(OC(=O)C(CCCCCC)CCCCCCCC)C1OC(=O)"
        "C(OC(=O)C(CCCCCC)CCCCCCCC)=C1OC(=O)C(CCCCCC)CCCCCCCC",
}


def fetch(name, attempts=3):
    url = SEARCH + "?q=" + urllib.parse.quote(name) + "&limit=5"
    delay = 2.0
    for i in range(attempts):
        try:
            resp = requests.get(url, timeout=60)
            resp.raise_for_status()
            return resp.json().get("molecules", [])
        except Exception as exc:
            if i == attempts - 1:
                raise RuntimeError(str(exc))
            time.sleep(delay)
            delay *= 2
    return []


def pick(molecules, want_formula):
    """First hit whose formula matches; otherwise the first hit with a structure."""
    fallback = None
    for m in molecules:
        st = m.get("molecule_structures") or {}
        smi = st.get("canonical_smiles")
        if not smi:
            continue
        props = m.get("molecule_properties") or {}
        formula = props.get("full_molformula")
        if want_formula and formula == want_formula:
            return smi, formula, m.get("pref_name")
        if fallback is None:
            fallback = (smi, formula, m.get("pref_name"))
    return fallback if fallback else (None, None, None)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--cache", action="store_true", help="reuse the fetch cache")
    args = ap.parse_args()

    cache = {}
    if CACHE.exists():
        cache = json.loads(CACHE.read_text(encoding="utf-8"))
    if requests is None and not cache:
        raise SystemExit("requests not installed and no cache available")

    rows, bad, mismatched, used_fallback = [], [], [], []
    for i, (ko, en, query, formula, aliases) in enumerate(WANTED, 1):
        hit = cache.get(query) if (args.cache or query in cache) else None
        if hit is None:
            try:
                hit = pick(fetch(query), formula)
            except RuntimeError as exc:
                bad.append("%s: %s" % (en, exc))
                continue
            cache[query] = hit
            CACHE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
        smi, got_formula, pref = hit if hit else (None, None, None)
        if (not smi or (formula and got_formula != formula)) and query in FALLBACK:
            smi, got_formula, pref = FALLBACK[query], formula, "verified fallback"
            used_fallback.append(en)
        elif not smi:
            bad.append("%s: no structure in ChEMBL for %r" % (en, query))
            continue
        elif formula and got_formula != formula:
            mismatched.append("%s: wanted %s, ChEMBL %r gave %s"
                              % (en, formula, pref, got_formula))
            continue
        rows.append((ko, en, smi, aliases))
        if i % 25 == 0:
            print("  resolved %d/%d" % (i, len(WANTED)))

    print("\nresolved        %d" % len(rows))
    if used_fallback:
        print("verified fallback %d: %s" % (len(used_fallback), ", ".join(used_fallback)))
    if mismatched:
        print("formula mismatch %d" % len(mismatched))
        for m in mismatched:
            print("   " + m)
    if bad:
        print("unresolved      %d" % len(bad))
        for b in bad:
            print("   " + b)

    if args.dry_run:
        return 1 if (bad or mismatched) else 0

    lines = []
    for ko, en, smi, aliases in rows:
        parts = [json.dumps(ko, ensure_ascii=False), json.dumps(en, ensure_ascii=False),
                 json.dumps(smi)]
        if aliases:
            parts.append("[" + ", ".join(json.dumps(a, ensure_ascii=False)
                                         for a in aliases) + "]")
        lines.append("  [" + ", ".join(parts) + "]")
    block = (BEGIN + " — generated by local/fetch_ingredients.py, do not hand-edit */\n"
             "var INGREDIENTS = [\n" + ",\n".join(lines) + "\n];\n" + END)

    src = PREDICT.read_text(encoding="utf-8")
    start, finish = src.find(BEGIN), src.find(END)
    if start < 0 or finish < 0:
        raise SystemExit("INGREDIENTS markers not found in predict.js")
    PREDICT.write_text(src[:start] + block + src[finish + len(END):], encoding="utf-8")
    print("rewrote %s with %d entries" % (PREDICT, len(rows)))
    return 1 if (bad or mismatched) else 0


if __name__ == "__main__":
    sys.exit(main())
