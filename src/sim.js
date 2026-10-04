// Pure simulation: no DOM. Imported by the page and by test/sim.test.js.
export const DOSE = 15;
// Dry grounds soak up water at up to this rate (g/s), slowing as the bed saturates.
// Slower than the pour, so some water channels through and drips during bloom.
export const ABSORB_RATE = 4;
export const COMP = [
  {id:'sour',   th:'เปรี้ยว', color:'#E6C229', k:0.034,  sens:0.15, S:4.5},
  {id:'sweet',  th:'หวาน',   color:'#EC8A34', k:0.0115, sens:0.45, S:13},
  {id:'bitter', th:'ขม',     color:'#8B5CC7', k:0.0036, sens:0.95, S:4},
  {id:'astr',   th:'ฝาด',    color:'#4F9A6A', k:0.0011, sens:0.6,  S:1.6},
  {id:'burnt',  th:'ไหม้',   color:'#CC3F36', k:0.0010, sens:1.7,  S:1.6},
];
export const PERC = [2.2, 0.75, 1.6, 2.6, 2.6];

export const DRIPPERS = {
  v60:     {name:'Hario V60',            tan:0.577, H:180, t:9,  flow:1.00, valve:false, style:'v60',     desc:'กรวย 60° รูใหญ่รูเดียว น้ำไหลเร็ว รสขึ้นกับ grind และวิธีเทมาก'},
  switch:  {name:'Hario Switch',         tan:0.577, H:172, t:7,  flow:0.95, valve:true,  style:'switch',  desc:'กรวย V60 + วาล์วที่ฐาน ปิดวาล์ว = แช่ (immersion)'},
  ufo_sw:  {name:'UFO v3 (switch)',      tan:0.86,  H:138, t:10, flow:1.02, valve:true,  style:'ufo',     desc:'กรวยกว้างและตื้น เบดบาง + วาล์ว'},
  ufo:     {name:'UFO v3 (non-switch)',  tan:0.86,  H:138, t:10, flow:1.08, valve:false, style:'ufo',     desc:'กรวยกว้างและตื้น เบดบาง น้ำผ่านเร็ว'},
  ct62_sw: {name:'CT-62 Transit Switch', tan:0.60,  H:184, t:9,  flow:0.90, valve:true,  style:'ct62',    desc:'จำลองเป็นกรวยทรงลึก ไหลปานกลาง + วาล์ว'},
  ct62:    {name:'CT-62',                tan:0.60,  H:184, t:9,  flow:0.93, valve:false, style:'ct62',    desc:'จำลองเป็นกรวยทรงลึก ไหลปานกลาง'},
  origami: {name:'Origami',              tan:0.62,  H:166, t:8,  flow:1.12, valve:false, style:'origami', desc:'ครีบจีบรอบตัว กระดาษไม่แนบผนัง อากาศผ่านได้ ไหลเร็ว'},
};
export const FILTERS = {
  v60:    {name:'Hario V60 01 (กรวย)', b:3,  flow:1.00, desc:'ปลายแหลม เบดลึก น้ำรวมลงจุดเดียว'},
  kalita: {name:'Kalita Wave (ก้นแบน)', b:26, flow:0.82, desc:'ก้นแบน เบดตื้นกว่า ไหลช้ากว่า สกัดสม่ำเสมอกว่า'},
};
export const GRIND = {
  fine:   {th:'ละเอียด', finesFrac:.30, mainK:1.45, finesK:3.2, flow:.55, mainR:2.5, nMain:230, nFine:130},
  medium: {th:'กลาง',   finesFrac:.18, mainK:1.00, finesK:3.0, flow:1.0, mainR:3.3, nMain:170, nFine:95},
  coarse: {th:'หยาบ',   finesFrac:.10, mainK:0.66, finesK:2.8, flow:1.45, mainR:4.4, nMain:118, nFine:55},
};
export const PROCESS = {
  natural:   {name:'Natural',           temp:88, A:[0.85,1.20,0.95,0.90,0.90], rate:1.05},
  washed:    {name:'Washed',            temp:94, A:[1.30,0.95,0.90,1.00,0.80], rate:0.85},
  honey:     {name:'Honey',             temp:90, A:[1.05,1.15,0.95,0.95,0.85], rate:1.00},
  anaerobic: {name:'Anaerobic Natural', temp:86, A:[1.00,1.20,1.05,1.10,1.30], rate:1.20},
  yeast:     {name:'Yeast',             temp:86, A:[1.10,1.15,1.00,1.05,1.20], rate:1.15},
};

export function simulate(cfg){
  const D=DRIPPERS[cfg.dripper], F=FILTERS[cfg.filter], G=GRIND[cfg.grind], P=PROCESS[cfg.process];
  const water=DOSE*cfg.ratio, absorbCap=DOSE*2, n=cfg.pours;
  let pours;
  if(n===1) pours=[water];
  else { const b=Math.min(DOSE*cfg.bloom, water*0.6); const r=(water-b)/(n-1); pours=[b].concat(Array(n-1).fill(r)); }
  const even = n===1 ? 0.86 : ({1:0.8,1.5:0.9,2:1,3:1.03,4:1.04})[cfg.bloom];
  const tF = COMP.map(c=>Math.exp(c.sens*(cfg.temp-90)/10));
  const baseFlow = 3.1*D.flow*F.flow*G.flow;
  const frac = {main:1-G.finesFrac, fine:G.finesFrac};
  const S={t:0,free:0,abs:0,drained:0,poured:0,agit:0,mig:0,q:0,
    E:{main:[0,0,0,0,0],fine:[0,0,0,0,0]}, liq:[0,0,0,0,0], cup:[0,0,0,0,0], ext:[0,0,0,0,0]};
  const frames=[], steps=[], dt=0.5;
  const pw=COMP.map((c,i)=>c.S*P.A[i]*PERC[i]);
  function snap(si,pouring,valveOpen){
    const pr=frames[frames.length-1];
    const rm = pr ? S.E.main.map((e,c)=>Math.max(0,(e-pr.Em[c]))*pw[c]*frac.main/dt) : [0,0,0,0,0];
    const rf = pr ? S.E.fine.map((e,c)=>Math.max(0,(e-pr.Ef[c]))*pw[c]*frac.fine/dt) : [0,0,0,0,0];
    frames.push({t:S.t,free:S.free,abs:S.abs,drained:S.drained,poured:S.poured,agit:S.agit,mig:S.mig,q:S.q,
      pouring,valveOpen,step:si,Em:S.E.main.slice(),Ef:S.E.fine.slice(),liq:S.liq.slice(),cup:S.cup.slice(),rm,rf});
  }
  function tick(add,agitTarget,valveOpen,immersion){
    S.free+=add; S.poured+=add;
    const ab=Math.min(S.free, absorbCap-S.abs, ABSORB_RATE*dt*(1-S.abs/absorbCap)); S.abs+=ab; S.free-=ab;
    if(add>0) S.agit += (agitTarget-S.agit)*0.45; else S.agit *= Math.exp(-dt/4.5);
    S.mig = Math.min(1, S.mig + S.agit*dt*0.0065*(valveOpen?1:0.3)*Math.sqrt(G.finesFrac/0.18));
    const clog = 1 - S.mig*(0.2+G.finesFrac*0.9);
    const head = 0.35 + 0.65*Math.min(1,S.free/70);
    S.q = (valveOpen && S.free>0.01) ? baseFlow*clog*head : 0;
    const dr = Math.min(S.free, S.q*dt);
    const wet = Math.min(1, S.abs/absorbCap);
    if(wet>0){
      for(let c=0;c<5;c++) for(const ty of ['main','fine']){
        let k = COMP[c].k*tF[c]*P.rate*(ty==='fine'?G.finesK:G.mainK)*(1+0.7*S.agit)*wet*even*(immersion?1.1:1);
        if(c===3) k *= 1 + 2.2*S.E[ty][1];
        const e=S.E[ty][c], d=(1-e)*(1-Math.exp(-k*dt));
        S.E[ty][c]+=d;
        const m=COMP[c].S*P.A[c]*d*frac[ty];
        S.liq[c]+=m; S.ext[c]+=m;
      }
    }
    const lm=S.free+S.abs;
    if(dr>0 && lm>0){ const f=dr/lm; for(let c=0;c<5;c++){ const m=S.liq[c]*f; S.liq[c]-=m; S.cup[c]+=m; } }
    S.free-=dr; S.drained+=dr; S.t+=dt;
  }
  const agitOf=(w,bloom,imm)=>((bloom?0.42:0.5)+0.55*Math.min(1,w/90))*(imm?0.55:1);
  function begin(kind,extra){
    return Object.assign({kind, f0:frames.length, t0:S.t, ext0:S.ext.slice(), cup0:S.cup.slice(), drained0:S.drained, poured0:S.poured}, extra);
  }
  function finish(st){
    st.t1=S.t; st.f1=frames.length-1;
    st.dExt=S.ext.map((v,i)=>v-st.ext0[i]); st.dCup=S.cup.map((v,i)=>v-st.cup0[i]);
    st.dDrained=S.drained-st.drained0; st.migEnd=S.mig; st.qEnd=frames[st.f1].q; st.cumWater=S.poured;
    st.qAvg = st.dDrained/Math.max(1,st.t1-st.t0);
  }
  pours.forEach((w,i)=>{
    const isBloom=(i===0 && n>1), imm=D.valve && isBloom;
    const st=begin(n===1?'single':(isBloom?'bloom':'pour'), {i, water:w, imm, agitPour:agitOf(w,isBloom,imm)});
    snap(steps.length,false,!imm);
    const rate=isBloom?3:4; let rem=w, peak=0;
    while(rem>1e-6){ const a=Math.min(rate*dt,rem); rem-=a; tick(a,st.agitPour,!imm,imm); peak=Math.max(peak,S.free); snap(steps.length,true,!imm); }
    st.pourDur=S.t-st.t0;
    if(imm){ while(S.t-st.t0<45){ tick(0,0,false,true); snap(steps.length,false,false);} st.valveOpenAt=S.t; }
    const minT=isBloom?40:st.pourDur+5;
    let g=0;
    while(((S.free>Math.max(6,0.3*peak)) || (S.t-st.t0<minT)) && g++<1400){ tick(0,0,true,false); snap(steps.length,false,true); }
    st.peak=peak; finish(st); steps.push(st);
  });
  const dd=begin('drawdown',{i:n, water:0, agitPour:0});
  snap(steps.length,false,true);
  let g=0; while(S.free>0.3 && g++<1800){ tick(0,0,true,false); snap(steps.length,false,true); }
  for(let k=0;k<8;k++){ tick(0,0,true,false); snap(steps.length,false,true); }
  finish(dd); steps.push(dd);
  let maxRate=1e-6; frames.forEach(f=>{ const s=f.rm.reduce((a,b)=>a+b,0)+f.rf.reduce((a,b)=>a+b,0); if(s>maxRate) maxRate=s; });
  const EY=S.cup.reduce((a,b)=>a+b,0);
  return {cfg:Object.assign({},cfg), water, pours, steps, frames, maxRate, EY, bev:S.drained,
    TDS:(EY/100*DOSE)/S.drained*100, totalTime:S.t, cup:S.cup.slice(), Em:S.E.main.slice(), Ef:S.E.fine.slice()};
}
export function shares(arr){ const p=arr.map((v,i)=>Math.max(0,v)*PERC[i]); const s=p.reduce((a,b)=>a+b,0)||1; return p.map(v=>v/s); }
