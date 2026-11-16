// /why page: compare menu, risk sliders with rings, count-ups and scroll reveals
const $=id=>document.getElementById(id);
const pct=x=>(x>0?'+':'')+x.toFixed(1)+'%';
const S={
 feel:[['After 10 losses in a row','−9.6%','instead of <s>−40.1%</s> at 5% a trade'],['To get back to even','+10.6%','instead of <s>+67%</s>'],['Lot size','Automatic','from your stop and risk %']],
 sheet:[['Trades logged','By itself','no typing, no missed trades'],['Chart saved','Every trade','real candles before and after'],['Leaks found','Named','each with a one-line fix']],
 prop:[['Daily loss rule','Locked','before the firm\'s limit, not after'],['Room left today','Live','shown before you place a trade'],['Consistency','Tracked','so one big day can\'t cost the payout']]
};
function stats(k){const el=$('stats');el.innerHTML=S[k].map(s=>`<div class="st fade"><small>${s[0]}</small><b>${s[1]}</b><span>${s[2]}</span></div>`).join('');requestAnimationFrame(()=>el.querySelectorAll('.st').forEach((e,i)=>setTimeout(()=>e.classList.remove('fade'),60+i*90)))}
stats('feel');
const dd=$('dd'),btn=$('cmp'),opts=[...dd.querySelectorAll('li')];
const tog=o=>{dd.classList.toggle('open',o);btn.setAttribute('aria-expanded',o)};
btn.onclick=e=>{e.stopPropagation();tog(!dd.classList.contains('open'))};
opts.forEach(li=>li.onclick=()=>{opts.forEach(o=>o.setAttribute('aria-selected',o===li));$('cmpv').textContent=li.firstChild.textContent;stats(li.dataset.v);tog(false)});
document.addEventListener('click',()=>tog(false));document.addEventListener('keydown',e=>{if(e.key==='Escape')tog(false)});

const C=515.2;
function lab(){
 const r=+$('rk').value/100,n=+$('ls').value,k=.01;
 $('rkv').textContent=(r*100)+'%';$('lsv').textContent=n;
 const a=Math.pow(1-r,n),b=Math.pow(1-k,n),m=s=>s.replace('-','−');
 $('wo').textContent=m(pct((a-1)*100));$('wi').textContent=m(pct((b-1)*100));
 $('wor').textContent=pct((1/a-1)*100);$('wir').textContent=pct((1/b-1)*100);
 if(window.seen){$('r1').style.strokeDashoffset=C*(1-a);$('r2').style.strokeDashoffset=C*(1-b)}
 $('r1t').textContent=Math.round(a*100)+'%';$('r2t').textContent=Math.round(b*100)+'%';
}
['rk','ls'].forEach(i=>$(i).oninput=lab);
// count-up for big numbers
function count(el){const t=el.textContent,mm=t.match(/^([^\d]*)([\d.,]+)(.*)$/);if(!mm||el.dataset.c)return;el.dataset.c=1;
 const v=parseFloat(mm[2].replace(/,/g,'')),dp=(mm[2].split('.')[1]||'').length,comma=mm[2].includes(','),t0=performance.now();
 const f=x=>{let s=x.toFixed(dp);if(comma)s=Number(s).toLocaleString('en-US',{minimumFractionDigits:dp});return s};
 (function step(now){const p=Math.min(1,(now-t0)/1100),e=1-Math.pow(1-p,3);el.textContent=mm[1]+f(v*e)+mm[3];if(p<1)requestAnimationFrame(step)})(t0)}
const io=new IntersectionObserver(es=>es.forEach(x=>{if(!x.isIntersecting)return;const t=x.target;io.unobserve(t);t.classList.remove('pre');
 if(t.id==='panel'){t.classList.add('up');t.querySelectorAll('.pc b').forEach(count);setTimeout(()=>t.querySelector('.track i').style.width='28%',300)}
 if(t.id==='ld')t.classList.add('on');
 if(t.classList.contains('lab')){window.seen=1;setTimeout(lab,200)}
 if(t.classList.contains('fact')){const b=t.querySelector('b');if(/\d/.test(b.textContent)&&!/–/.test(b.textContent))count(b)}
}),{threshold:.2});
document.querySelectorAll('.rv,#panel').forEach(e=>{if(e.getBoundingClientRect().top>innerHeight*.9)e.classList.add('pre');io.observe(e)});
document.querySelector('.track i').style.width='0';
// stats count when switching
const _st=stats;stats=k=>{_st(k);document.querySelectorAll('#stats b').forEach(b=>/\d/.test(b.textContent)&&count(b))};
// rings start at value if lab already in view
lab();
