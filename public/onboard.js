// Guided set-up after sign-up (served by src/onboard.js). One question per screen, answers saved as you go.
(function(){
const I={ // tiny line icons
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',bolt:'<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',wave:'<path d="M3 12c3-6 6 6 9 0s6 6 9 0"/>',mount:'<path d="m3 20 6-10 4 6 3-4 5 8z"/>',
 gold:'<path d="M4 18h16l-3-6H7z"/><path d="M8 12l2-5h4l2 5"/>',fx:'<path d="M4 8h13l-3-3M20 16H7l3 3"/>',idx:'<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',fut:'<path d="M3 17 9 11l4 4 8-8"/><path d="M15 7h6v6"/>',btc:'<path d="M8 4v16M8 6h6a3 3 0 0 1 0 6H8m0 0h7a3 3 0 0 1 0 6H8"/>',
 dots:'<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
 tgt:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',shield:'<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',up:'<path d="m3 17 6-6 4 4 8-8"/>',anchor:'<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M8 10h8"/>',fire:'<path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-4 2-7 2 1 3 3 4 4 0-3-1-5 0-8z"/>',chart:'<path d="M4 20V4M4 20h16M8 16l3-4 3 2 5-6"/>',star:'<path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
 cand:'<path d="M7 3v18M17 3v18"/><rect x="5" y="7" width="4" height="8"/><rect x="15" y="9" width="4" height="6"/>',bar:'<path d="M4 6h10M4 12h16M4 18h7"/>',ict:'<path d="M4 18 10 8l4 6 6-10"/><path d="M4 12h16" stroke-dasharray="2 3"/>',brk:'<path d="M4 14h16M8 18l4-12 4 8"/>',pen:'<path d="m4 20 4-1 11-11-3-3L5 16z"/>',q:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01"/>',
 no:'<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',eval:'<path d="M9 11 12 14 20 6"/><path d="M20 12v7H4V5h11"/>',fund:'<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M7 15h3"/>',both:'<rect x="3" y="4" width="8" height="16" rx="2"/><rect x="13" y="4" width="8" height="16" rx="2"/>',
 mt5:'<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M7 13l3-3 3 2 4-4"/>',nt:'<path d="M5 19V5l14 14V5"/>',tv:'<path d="M3 7h8v12M11 7h4l-2 6M15 7h6"/>',ctr:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 9h6v6H9z"/>'};
const ic=k=>`<svg viewBox="0 0 24 24">${I[k]||I.dots}</svg>`;
const D=JSON.parse(document.getElementById('ob-data').textContent);
const A=Object.assign({},D.a);A.name=A.name||D.name||'';
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const isProp=()=>D.prop.includes(A.acct);
const lab=(id,v)=>{if(id==='name')return v||'';if(id==='firm')return(D.firms.find(f=>f[0]===v)||[])[1]||'';const q=D.q.find(x=>x.id===id);return [].concat(v||[]).map(k=>(q.opts.find(o=>o[0]===k)||[])[1]).filter(Boolean).join(', ')};
const S=[{id:'name',k:'Name',type:'text'}].concat(D.q,[{id:'vs',type:'vs'}],D.card?[{id:'card',type:'card'}]:[]);
const REC=[['name','Name']].concat(D.q.map(q=>[q.id,q.k]));
let cur=0,prev={},lastStep=-1;
const $=id=>document.getElementById(id);
function body(done){const b=new URLSearchParams();if(A.name&&A.name!==D.name)b.set('name',A.name);D.q.forEach(q=>[].concat(A[q.id]||[]).forEach(v=>b.append(q.id,v)));if(A.firm)b.set('firm',A.firm);b.set('reset','1');if(done)b.set('done','1');return b}
function save(done){return fetch('/start',{method:'POST',headers:{accept:'application/json'},body:body(done),credentials:'same-origin'}).catch(()=>{})}
function recDraw(){$('rec').innerHTML='<h6>YOUR TRADER FILE</h6>'+REC.map(([id,l])=>{const v=lab(id,A[id])+(id==='acct'&&A.firm&&isProp()?' · '+lab('firm',A.firm):'');const isNew=v&&prev[id]!==v;prev[id]=v;return `<div class="r${S[cur].id===id?' on':''}${isNew?' new':''}"><small>${l.toUpperCase()}</small><span>${esc(v)}</span></div>`}).join('')}
function go(i){if(i>cur)save(false);cur=Math.max(0,Math.min(S.length-1,i));draw()}
function finish(to){save(true).then(()=>{location.href=to})}
function plan(){return isProp()?'pro':'katana'}
function draw(){
 const s=S[cur],q=$('q'),wide=s.type==='vs'||s.type==='card',w=document.querySelector('.wrap');
 const pw=((cur+1)/S.length*100)+'%';$('pb').style.width=pw;$('pt').style.left=pw;
 if(lastStep>=0&&lastStep<cur){const bu=$('pbu');bu.style.left=pw;bu.classList.remove('go');setTimeout(()=>bu.classList.add('go'),780)}
 $('rec').style.display=wide?'none':'';w.style.gridTemplateColumns=wide?'1fr':'';w.classList.toggle('wide',wide);
 recDraw();
 const back=cur?'<button class="back" data-back>‹ Back</button>':'';
 const last=cur===S.length-1;
 let h='';
 if(s.type==='text'){
  h=`${back}<p class="k">NAME</p><h1>First, what should we <em>call</em> you?</h1><input class="t" id="tx" maxlength="40" value="${esc(A.name)}" placeholder="Your first name" autocomplete="given-name">
  <p class="hint">${D.google?'From your Google account. Change it if you like.':'This is how the journal will greet you.'}</p>
  <div class="act"><button class="pill" data-next>Continue →</button></div>`;
 }else if(s.opts){
  const v=A[s.id],sel=k=>s.multi?(v||[]).includes(k):v===k,picked=s.multi?(v||[]).length:v;
  const hint=(s.opts.find(o=>sel(o[0]))||[])[3]||s.hint0||'';
  h=`${back}<p class="k">${s.k.toUpperCase()}</p><h1>${s.h}</h1><div class="chips">${s.opts.map(o=>`<button class="chip${sel(o[0])?' on':''}" data-pick="${o[0]}" aria-pressed="${sel(o[0])}">${ic(o[2])}${esc(o[1])}</button>`).join('')}</div>
  <p class="hint">${esc(hint)}</p>
  ${s.id==='acct'&&isProp()?`<p class="k" style="margin-top:22px">WHICH FIRM?</p><div class="row2">${D.firms.map(f=>`<button class="chip${A.firm===f[0]?' on':''}" data-firm="${f[0]}">${esc(f[1])}</button>`).join('')}</div><p class="hint">We fill in your daily and max loss guard when you add the account. Edit it any time.</p>`:''}
  <div class="act"><button class="pill" data-next ${picked?'':'disabled'}>Continue →</button><button class="ghost" data-skip>Skip this</button></div>`;
 }else if(s.type==='vs'){
  const prop=isProp();
  h=`${back}<p class="k">${esc((A.name||'trader').toUpperCase())}, HERE IS THE DIFFERENCE</p><h1>Same trader. <em>Different</em> rules.</h1>
  <div class="vs">
   <div class="side"><h5>WITHOUT A RISK TOOL</h5><div class="big rd">−40%</div><p class="sub">10 losses in a row at 5% risk a trade</p>
    <ul><li>Lot size guessed by feel</li><li>${prop?'One bad day breaks the daily loss rule':'One bad day undoes a good month'}</li><li>Revenge trade after a loss</li><li>Same mistakes, no record</li></ul></div>
   <div class="side w"><h5>WITH KATANA + JOURNAL</h5><div class="big te">−9.6%</div><p class="sub">The same 10 losses at 1% risk, sized for you</p>
    <ul><li>Lot size worked out from your stop</li><li>${prop?'Locks trading before the daily limit':'Daily loss lock, then you walk away'}</li><li>Cool-down after a loss</li><li>Every trade logged and graded</li></ul></div>
  </div>
  <div class="facts">
   <div class="f"><small>Climb back from</small><b>−40%</b><p>needs <b style="display:inline;font-size:inherit;color:var(--rd)">+67%</b> to get even. From −9.6% you need only +10.6%.</p><cite>Simple maths: gain needed = loss ÷ (1 − loss)</cite></div>
   <div class="f"><small>Retail CFD accounts that lose</small><b>74–89%</b><p>The figure brokers in Europe must show you. Most blow-ups come from size, not setups.</p><cite>Source: ESMA product intervention, 2018</cite></div>
   <div class="f"><small>Bank trading desks</small><b>Hard limits</b><p>Every desk trades under daily loss and position limits set by a separate risk team. KATANA is your risk team.</p><cite>Source: Basel Committee market-risk rules</cite></div>
  </div>
  <div class="prod"><span class="tag"><b>KATANA</b> risk manager EA</span><span class="tag"><b>Journal</b> EA + web app</span>${prop?'<span class="tag"><b>Prop guard</b> set for '+esc(lab('firm',A.firm)||'your firm')+'</span>':''}</div>
  <div class="act">${last?'<button class="pill" data-finish="/dashboard">Open my desk →</button>':'<button class="pill" data-next>Start my free trial →</button>'}</div>`;
 }else if(s.type==='card'){
  h=`${back}<p class="k">LAST STEP</p><h1>Turn it <em>on</em>.</h1>
  <div class="cardbox"><div class="ln"><span>Plan picked for you</span><b>${isProp()?'Pro':'KATANA'}</b></div>
  <div class="ln"><span>Free trial</span><b>${D.card} days</b></div><div class="ln"><span>Charged today</span><b style="color:var(--te)">$0</b></div>
  <p class="mut" style="font-size:13px;margin-top:12px">Add a card with Stripe to start. Cancel before the trial ends and you pay nothing.</p></div>
  <div class="act"><button class="pill" data-finish="/pricing?plan=${plan()}">Add card and start →</button><button class="ghost" data-finish="/pricing">See all plans</button></div>`;
 }
 const fresh=lastStep!==cur;lastStep=cur;
 q.innerHTML=`<div class="${fresh?'fade':''}">${h}</div>`;
 q.querySelectorAll('.chips>*,.vs>*,.facts>*').forEach((e,i)=>e.style.animationDelay=(.12+i*.04)+'s');
 const tx=$('tx');if(tx){tx.oninput=()=>{A.name=tx.value.trim();recDraw()};tx.onkeydown=e=>{if(e.key==='Enter')go(cur+1)};if(fresh)setTimeout(()=>tx.focus(),300)}
}
document.addEventListener('click',e=>{
 const t=e.target.closest('button');if(!t)return;const s=S[cur];
 if(t.dataset.pick){const k=t.dataset.pick;if(s.multi){A[s.id]=A[s.id]||[];const i=A[s.id].indexOf(k);i<0?A[s.id].push(k):A[s.id].splice(i,1)}else A[s.id]=k;if(s.id==='acct'&&!isProp())delete A.firm;draw()}
 else if(t.dataset.firm){A.firm=t.dataset.firm;draw()}
 else if('next' in t.dataset)go(cur+1);
 else if('skip' in t.dataset){delete A[s.id];if(s.id==='acct')delete A.firm;go(cur+1)}
 else if('back' in t.dataset)go(cur-1);
 else if(t.dataset.finish)finish(t.dataset.finish);
 else if('skipall' in t.dataset)finish('/dashboard');
});
draw();
})();
