// 궁합 계산 로직. 브라우저에서는 전역(window.Match), Node 테스트에서는 module.exports로 쓴다.
(function(root){
const TYPES="ISTJ ISFJ INFJ INTJ ISTP ISFP INFP INTP ESTP ESFP ENFP ENTP ESTJ ESFJ ENFJ ENTJ".split(" ");
const NICK={
  ko:{ISTJ:"청렴결백 논리주의자",ISFJ:"용감한 수호자",INFJ:"선의의 옹호자",INTJ:"용의주도한 전략가",ISTP:"만능 재주꾼",ISFP:"호기심 많은 예술가",INFP:"열정적인 중재자",INTP:"논리적인 사색가",ESTP:"모험을 즐기는 사업가",ESFP:"자유로운 영혼의 연예인",ENFP:"재기발랄한 활동가",ENTP:"뜨거운 논쟁을 즐기는 변론가",ESTJ:"엄격한 관리자",ESFJ:"사교적인 외교관",ENFJ:"정의로운 사회운동가",ENTJ:"대담한 통솔자"},
  en:{ISTJ:"Logistician",ISFJ:"Defender",INFJ:"Advocate",INTJ:"Architect",ISTP:"Virtuoso",ISFP:"Adventurer",INFP:"Mediator",INTP:"Logician",ESTP:"Entrepreneur",ESFP:"Entertainer",ENFP:"Campaigner",ENTP:"Debater",ESTJ:"Executive",ESFJ:"Consul",ENFJ:"Protagonist",ENTJ:"Commander"}
};
const GOLD={INFP:["ENFJ","ENTJ"],ENFP:["INFJ","INTJ"],INFJ:["ENFP","ENTP"],ENFJ:["INFP","ISFP"],INTJ:["ENFP","ENTP"],ENTJ:["INFP","INTP"],INTP:["ENTJ","ESTJ"],ENTP:["INFJ","INTJ"],ISFP:["ENFJ","ESFJ","ESTJ"],ESFP:["ISFJ","ISTJ"],ISTP:["ESFJ","ESTJ"],ESTP:["ISFJ","ISTJ"],ISFJ:["ESFP","ESTP"],ESFJ:["ISFP","ISTP"],ISTJ:["ESFP","ESTP"],ESTJ:["ISTP","ISFP","INTP"]};

function score(a,b){
  let s=0;
  s+= a[1]===b[1]?26:6;      // S/N 같으면 대화가 통함
  s+= a[0]!==b[0]?18:10;     // E/I 다르면 에너지 보완
  s+= a[2]===b[2]?16:10;     // T/F 같으면 가치관 공감
  s+= a[3]!==b[3]?15:10;     // J/P 다르면 생활 리듬 보완
  if((GOLD[a]||[]).includes(b)) s+=14;
  if(a===b) s+=3;
  return Math.min(99,s);
}
const WHY={
  ko:{gold:"국내에서 '찰떡'으로 꼽히는 조합",n:"상상·아이디어 대화가 잘 통함",s:"현실 감각이 비슷해 편안함",sn:"보는 관점이 달라 서로 새로움",ei:"한 명은 끌고 한 명은 받쳐 주는 에너지",ee:"텐션이 비슷해 지치지 않음",jp:"계획형·즉흥형이 서로 빈틈을 채움",jj:"생활 리듬이 비슷함"},
  en:{gold:"A classic 'perfect match' pairing in Korea",n:"Ideas and imagination flow easily",s:"Similar down-to-earth sense, easy to be around",sn:"Different viewpoints keep things fresh",ei:"One leads, the other supports",ee:"Matching energy, no burnout",jp:"Planner and improviser fill each other's gaps",jj:"Similar daily rhythm"}
};
function why(a,b,lang){
  const w=WHY[lang]||WHY.ko, r=[];
  if((GOLD[a]||[]).includes(b)) r.push(w.gold);
  r.push(a[1]===b[1]?(a[1]==="N"?w.n:w.s):w.sn);
  r.push(a[0]!==b[0]?w.ei:w.ee);
  r.push(a[3]!==b[3]?w.jp:w.jj);
  return r.join(" · ");
}
const api={TYPES,NICK,GOLD,score,why};
if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.Match=api;
})(typeof self!=="undefined"?self:this);
