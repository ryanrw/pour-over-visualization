// Controls, timeline, panel text (narrate, verdict) and playback state.
import { DOSE, COMP, DRIPPERS, FILTERS, GRIND, PROCESS, simulate, shares } from './sim.js';
import { mix, rgba, clamp, reduceMotion, hueOf, load, frameAt, readTheme, resize, updateParticles, snapParticles, spawnFx, stepFx, draw, stepShort } from './render.js';

// ---------- helpers ----------
const $=id=>document.getElementById(id);
const fmtT=s=>{s=Math.max(0,Math.round(s));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
const fmtG=v=>(Math.round(v*10)/10).toString().replace(/\.0$/,'');

// ---------- state ----------
const state={dripper:'v60',filter:'v60',pours:3,grind:'medium',temp:90,bloom:2,ratio:15,process:'natural'};
let R;
let step=0, progress=0, playing=false, playAll=false, speed=1;

let last=performance.now(), hudT=0;
function loop(now){
  const dtR=Math.min(0.05,(now-last)/1000); last=now;
  if(playing && R){
    progress += dtR*speed/animDur(step);
    if(progress>=1){ if(playAll && step<R.steps.length-1){ step++; progress=0; onStep(false);} else { progress=1; playing=false; playAll=false; updatePlay(); } }
  }
  if(R){
    const F=frameAt(step,clamp(progress,0,1));
    const simDt = playing ? dtR*speed : dtR*0.4;
    updateParticles(F, reduceMotion? dtR*0.3 : simDt*1.2);
    spawnFx(F,playing?dtR:0,now,speed); stepFx(dtR*(playing?speed:0.5),F);
    draw(F,now);
    if(now-hudT>90){ hud(F); hudT=now; }
  }
  requestAnimationFrame(loop);
}
function animDur(si){ const st=R.steps[si]; return clamp((st.t1-st.t0)/3.5,8,26); }

// ---------- text ----------
function topNames(arr,k=2){ const s=shares(arr); return s.map((v,i)=>({v,i})).sort((a,b)=>b.v-a.v).slice(0,k).filter(o=>o.v>0.08).map(o=>COMP[o.i].th); }
function agitWord(a){ return a<0.55?'เบา':a<0.85?'ปานกลาง':'แรง'; }
function narrate(si){
  const st=R.steps[si], D=DRIPPERS[state.dripper]; const top=topNames(st.dExt).join(' กับ ');
  const mig=Math.round(st.migEnd*100), q=fmtG(st.qAvg);
  if(st.kind==='bloom'){
    let t=`น้ำ ${fmtG(st.water)} g (${state.bloom}× ของกาแฟ) ทำให้ผงเปียกและไล่ CO₂ ออก เห็นเป็นฟองและผิวที่พองเป็นโดม ผงแห้งยังดูดน้ำไว้ในตัว (ราว 2 เท่าของน้ำหนักกาแฟ)`;
    if(!st.imm) t+=` แต่ผงแห้งดูดน้ำได้ช้ากว่าที่เท น้ำบางส่วนจึงซึมผ่านเบดลงไปเป็นหยดก่อน (${fmtG(st.dDrained)} g)`;
    if(st.imm) t+=` วาล์วปิดอยู่ ช่วงนี้จึงเป็นการแช่ ผงทุกเม็ดได้เวลาสัมผัสน้ำเท่ากัน แล้วเปิดวาล์วที่ ${fmtT(st.valveOpenAt)}`;
    if(state.bloom<=1) t+=` น้ำบลูมน้อยกว่าที่ผงดูดได้ บางส่วนของเบดยังแห้งหรือจับตัวเป็นก้อน การสกัดทั้งแก้วจึงไม่สม่ำเสมอ`;
    else if(state.bloom>=3) t+=` น้ำบลูมเกินกว่าที่ผงดูดได้ ส่วนเกินเริ่มไหลผ่านเบดตั้งแต่บลูม`;
    return t+` สิ่งที่ละลายออกมาก่อนคือ${top||'กรด'} เพราะกรดอินทรีย์ละลายเร็วที่สุด`;
  }
  if(st.kind==='single') return `เทน้ำ ${fmtG(st.water)} g รวดเดียวโดยไม่มีบลูมแยก CO₂ ที่ยังค้างในผงจะกันน้ำไม่ให้ซึมเข้าบางจุด สายน้ำที่ต่อเนื่องนานทำให้ agitation ${agitWord(st.agitPour)} และดัน fines ลงไปกองก้นราว ${mig}% สเต็ปนี้ได้${top}ออกมาเป็นหลัก`;
  if(st.kind==='drawdown'){
    return `ไม่มีการเทเพิ่ม น้ำที่ค้างอยู่ไหลผ่านเบดจนหมด (${fmtT(st.t1-st.t0)}) เบดนิ่งลง fines ที่กองก้นทำตัวเหมือนกระดาษอีกชั้น ทำให้ช่วงท้ายไหลช้าลงเหลือราว ${q} g/s น้ำช่วงสุดท้ายผ่านผงที่รสหลักออกไปแล้ว จึงจางแต่มี${topNames(st.dExt).join('/')||'ขม/ฝาด'}ปน จบการดริปที่ ${fmtT(st.t1)}`;
  }
  const prev=R.steps[si-1]; const s1=shares(st.dExt), s0=shares(prev.dExt);
  let t=`เทน้ำ ${fmtG(st.water)} g (สะสม ${fmtG(st.cumWater)} g) agitation ${agitWord(st.agitPour)} สายน้ำกระแทกกลางเบด ดันผงลงตรงกลางแล้วม้วนขึ้นตามผนัง fines เบากว่าจึงลอยตามน้ำได้ไกลกว่าผงหยาบ แล้วค่อยๆ ถูกพาลงไปกองที่ก้นกระดาษ ตอนนี้กองอยู่ราว ${mig}% อัตราไหลเฉลี่ย ${q} g/s`;
  t+=` สเต็ปนี้สกัด${top}ออกมาเป็นหลัก`;
  const late=s1[2]+s1[3]+s1[4], lateP=s0[2]+s0[3]+s0[4];
  if(late>lateP+0.03) t+=` สังเกตว่าสัดส่วนขม/ฝาดเพิ่มขึ้นจากสเต็ปก่อน เพราะกรดกับน้ำตาลส่วนใหญ่ออกไปแล้ว ผงที่เหลือปล่อยสารที่ละลายช้ากว่า`;
  if(D.valve) t+=` วาล์วเปิดอยู่ ช่วงนี้ทำงานเหมือนดริปเปอร์ปกติ`;
  return t;
}
function verdict(){
  const ey=R.EY, sh=shares(R.cup), P=PROCESS[state.process];
  let head, txt;
  if(ey<17.5){ head='สกัดไม่พอ (under)'; txt='เปรี้ยวนำ บอดี้บาง ความหวานยังออกไม่สุด'; }
  else if(ey>22.5){ head='สกัดเกิน (over)'; txt='ขมและฝาดนำ ปลายแห้งติดลิ้น'; }
  else { head='อยู่ในช่วงสมดุล'; txt='หวานกับเปรี้ยวเกาะกันดี'; }
  const extra=[];
  if(sh[0]>0.42 && ey>=17.5) extra.push('ความเปรี้ยวยังเด่น');
  if(sh[3]>0.11) extra.push('มีความฝาดชัด มาจาก fines และเวลาสัมผัสน้ำที่นาน');
  if(sh[4]>0.07) extra.push('มีโทนไหม้/ควัน จากน้ำร้อนร่วมกับผงละเอียด');
  if(state.temp>P.temp+3) extra.push(`น้ำร้อนกว่าที่แนะนำสำหรับ ${P.name} (${P.temp}°C) ค่อนข้างมาก`);
  if(state.temp<P.temp-3) extra.push(`น้ำเย็นกว่าที่แนะนำสำหรับ ${P.name} (${P.temp}°C) ค่อนข้างมาก`);
  return {head, txt: txt+(extra.length?' · '+extra.join(' · '):'')};
}

// ---------- panel / HUD ----------
function stackHTML(arr){ const s=shares(arr); return s.map((v,i)=>`<i style="width:${(v*100).toFixed(1)}%;background:${COMP[i].color}" title="${COMP[i].th} ${(v*100).toFixed(0)}%"></i>`).join(''); }
function valsHTML(arr){ const s=shares(arr); return s.map((v,i)=>`<span>${COMP[i].th} <b>${Math.round(v*100)}%</b></span>`).join(''); }
function onStep(user){
  const st=R.steps[step];
  $('kick').textContent=`สเต็ป ${step+1} จาก ${R.steps.length} · ${fmtT(st.t0)}–${fmtT(st.t1)}`;
  $('stTitle').textContent = st.kind==='bloom'?`Bloom ${fmtG(st.water)} g`:st.kind==='drawdown'?'Drawdown':st.kind==='single'?`เทครั้งเดียว ${fmtG(st.water)} g`:`เทครั้งที่ ${st.i+1} · ${fmtG(st.water)} g`;
  $('stText').textContent=narrate(step);
  $('barStep').innerHTML=stackHTML(st.dExt); $('valStep').innerHTML=valsHTML(st.dExt);
  document.querySelectorAll('.seg').forEach((s,i)=>s.classList.toggle('on',i===step));
  $('prev').disabled=step===0; $('next').disabled=step===R.steps.length-1;
  if(user) snapParticles(frameAt(step,progress));
}
let lastCupKey='';
function hud(F){
  $('clk').textContent=fmtT(F.t);
  $('clks').textContent=`เทแล้ว ${Math.round(F.poured)} / ${Math.round(R.water)} g`;
  const v=$('valve');
  if(DRIPPERS[state.dripper].valve){ v.innerHTML=`<span class="valve ${F.valveOpen?'open':'closed'}">${F.valveOpen?'วาล์วเปิด':'วาล์วปิด · แช่'}</span>`; } else v.innerHTML='';
  $('mAg').textContent=agitWord(F.agit+0.001)+(F.agit<0.08?' (นิ่ง)':''); $('bAg').style.width=clamp(F.agit/1.1*100,0,100)+'%';
  $('mMg').textContent=Math.round(F.mig*100)+'%'; $('bMg').style.width=F.mig*100+'%';
  $('mQ').textContent=fmtG(F.q)+' g/s'; $('bQ').style.width=clamp(F.q/4.5*100,0,100)+'%';
  $('mSv').textContent=Math.round(F.drained)+' g'; $('bSv').style.width=clamp(F.drained/R.bev*100,0,100)+'%';
  const key=F.cup.map(v=>v.toFixed(2)).join();
  if(key!==lastCupKey){ lastCupKey=key; $('barCup').innerHTML=stackHTML(F.cup); $('valCup').innerHTML=valsHTML(F.cup);
    const segs=document.querySelectorAll('.seg .fill'); segs.forEach((f,i)=>{ f.style.width = i<step?'100%': i===step? (progress*100)+'%':'0%'; }); }
}
function renderResult(){
  const v=verdict();
  $('resBig').innerHTML=`<div>EY โดยประมาณ<b>${R.EY.toFixed(1)}%</b></div><div>TDS<b>${R.TDS.toFixed(2)}%</b></div><div>เวลารวม<b>${fmtT(R.totalTime)}</b></div><div>ได้กาแฟ<b>${Math.round(R.bev)} g</b></div>`;
  $('resTxt').innerHTML=`<span class="verdict">ผลทั้งแก้ว: ${v.head}</span> — ${v.txt}`;
}
function renderTimeline(){
  const tl=$('timeline'); tl.innerHTML='';
  R.steps.forEach((st,i)=>{
    const b=document.createElement('button'); b.className='seg'; b.style.flexGrow=Math.max(1,st.t1-st.t0);
    const col=mix(hueOf(st.dExt.some(v=>v>0)?st.dExt:[1,0,0,0,0]),[60,40,25],0.25); b.style.background=rgba(col,1);
    b.innerHTML=`<span class="fill"></span><span>${stepShort(i)}</span>`; b.setAttribute('aria-label',stepShort(i));
    b.onclick=()=>{ step=i; progress=0; playing=true; playAll=false; updatePlay(); onStep(true); };
    tl.appendChild(b);
  });
}
function renderLegend(){
  $('legend').innerHTML=COMP.map(c=>`<span><i style="background:${c.color}"></i>${c.th}</span>`).join('')+
   `<span class="sep"></span><span><i style="background:#5a3a24;width:12px;height:12px"></i>ผงหยาบ</span><span><i style="background:#3a2416;width:6px;height:6px;margin:0 3px"></i>fines</span>`;
}
function renderRecipe(){
  const n=state.pours, water=R.water; let s=`<b>${DOSE} g : ${Math.round(water)} g</b> · ${state.temp}°C · ${GRIND[state.grind].th}<br>`;
  if(n===1) s+=`เทครั้งเดียว ${Math.round(water)} g`; else s+=`บลูม ${fmtG(R.pours[0])} g แล้วเทอีก ${n-1} × ${fmtG(R.pours[1])} g`;
  $('recipe').innerHTML=s;
}

// ---------- controls ----------
const GROUPS=[
  {key:'dripper',label:'ดริปเปอร์',opts:Object.entries(DRIPPERS).map(([k,v])=>({v:k,l:v.name})),note:()=>DRIPPERS[state.dripper].desc},
  {key:'filter',label:'กระดาษกรอง',opts:Object.entries(FILTERS).map(([k,v])=>({v:k,l:v.name})),note:()=>FILTERS[state.filter].desc+((state.filter==='kalita'&&!['origami'].includes(state.dripper))?' · กระดาษก้นแบนในดริปเปอร์ทรงกรวยจะไม่แนบผนังทั้งหมด':'')},
  {key:'process',label:'Process กาแฟ',sub:'เลือกแล้วตั้งอุณหภูมิที่แนะนำให้',opts:Object.entries(PROCESS).map(([k,v])=>({v:k,l:`${v.name} ${v.temp}°`}))},
  {key:'temp',label:'อุณหภูมิน้ำ',sub:'จุดสี = ที่แนะนำสำหรับ process',opts:[86,88,90,92,94].map(v=>({v,l:v+'°C'})),rec:v=>v===PROCESS[state.process].temp,
    note:()=>{const r=PROCESS[state.process].temp; return state.temp===r?'':`ที่แนะนำสำหรับ ${PROCESS[state.process].name} คือ ${r}°C`;}, warn:()=>state.temp!==PROCESS[state.process].temp},
  {key:'grind',label:'Grind size',opts:Object.entries(GRIND).map(([k,v])=>({v:k,l:v.th}))},
  {key:'ratio',label:'Ratio',sub:`กาแฟ ${DOSE} g`,opts:[5,10,15,20].map(v=>({v,l:'1:'+v}))},
  {key:'bloom',label:'น้ำบลูม',sub:'เท่าของน้ำหนักกาแฟ',opts:[1,1.5,2,3,4].map(v=>({v,l:v+'×'}))},
  {key:'pours',label:'จำนวนการเท',sub:'รวมบลูม',range:[1,10]},
];
function renderControls(){
  const box=$('controls'); box.innerHTML='';
  GROUPS.forEach(g=>{
    const row=document.createElement('div'); row.className='row';
    const lab=document.createElement('div'); lab.className='lab'; lab.innerHTML=g.label+(g.sub?`<small>${g.sub}</small>`:''); row.appendChild(lab);
    const right=document.createElement('div');
    if(g.range){
      const w=document.createElement('div'); w.className='rangewrap';
      w.innerHTML=`<input type="range" min="${g.range[0]}" max="${g.range[1]}" step="1" value="${state[g.key]}" aria-label="${g.label}"><b>${state[g.key]}</b><span class="note" style="margin:0">${state[g.key]===1?'ไม่มีบลูมแยก':'บลูม + '+(state[g.key]-1)}</span>`;
      const inp=w.querySelector('input'); inp.oninput=()=>{ w.querySelector('b').textContent=inp.value; };
      inp.onchange=()=>{ state[g.key]=+inp.value; rebuild(); };
      right.appendChild(w);
    } else {
      const chips=document.createElement('div'); chips.className='chips';
      g.opts.forEach(o=>{ const b=document.createElement('button'); b.className='chip'; b.type='button';
        b.setAttribute('aria-pressed',String(state[g.key]===o.v)); b.innerHTML=o.l+(g.rec&&g.rec(o.v)?'<span class="rec" aria-label="แนะนำ"></span>':'');
        b.onclick=()=>{ state[g.key]=o.v; if(g.key==='process') state.temp=PROCESS[o.v].temp; rebuild(); };
        chips.appendChild(b); });
      right.appendChild(chips);
      const nt=g.note?g.note():''; if(nt){ const n=document.createElement('div'); n.className='note'+(g.warn&&g.warn()?' warn':''); n.textContent=nt; right.appendChild(n); }
    }
    row.appendChild(right); box.appendChild(row);
  });
}

// Every rebuild (first load, control change) waits on the play overlay.
function rebuild(){
  R=simulate(state); load(R,state);
  step=0; progress=0; playing=false; playAll=false; lastCupKey='';
  renderControls(); renderTimeline(); renderResult(); renderRecipe(); onStep(true); updatePlay();
}
function updatePlay(){ $('play').textContent=(playing&&playAll)?'หยุด':(step===R.steps.length-1&&progress>=1?'เล่นทั้งหมดใหม่':'เล่นทั้งหมด');
  // Overlay shows whenever playback rests at a step boundary (not when paused mid-step).
  $('playover').hidden=playing||(progress>0&&progress<1);
  $('playover').querySelector('.pl').textContent=(step===0&&progress===0)?'กดเพื่อเริ่มดูการดริป':'เล่นใหม่ตั้งแต่ต้น'; }
// Overlay plays every step from the start; prev/next/timeline play one step and stop.
$('playover').onclick=()=>{ step=0; progress=0; playing=true; playAll=true; onStep(true); updatePlay(); };
$('play').onclick=()=>{
  if(playing&&playAll){ playing=false; playAll=false; updatePlay(); return; }
  if(playing){ playAll=true; updatePlay(); return; }
  const lastI=R.steps.length-1;
  if(progress>=1){ if(step===lastI){ step=0; } else { step++; } progress=0; onStep(true); }
  playAll=true; playing=true; updatePlay(); };
$('prev').onclick=()=>{ if(step>0){ step--; progress=0; playing=true; playAll=false; updatePlay(); onStep(true);} };
$('next').onclick=()=>{ if(step<R.steps.length-1){ step++; progress=0; playing=true; playAll=false; updatePlay(); onStep(true);} };
$('speed').onchange=e=>{ speed=+e.target.value; };
document.addEventListener('keydown',e=>{ if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT') return;
  if(e.key==='ArrowRight') $('next').click(); else if(e.key==='ArrowLeft') $('prev').click(); else if(e.key===' '){ e.preventDefault(); $('play').click(); } });
window.addEventListener('resize',resize);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',readTheme);

readTheme(); resize(); renderLegend(); rebuild(); requestAnimationFrame(loop);
if(document.fonts) document.fonts.ready.then(()=>{});
