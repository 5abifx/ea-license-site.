if(!CanvasRenderingContext2D.prototype.roundRect)CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h,r){r=Math.max(0,Math.min(typeof r==='number'?r:(r&&r[0])||0,Math.abs(w)/2,Math.abs(h)/2));this.moveTo(x+r,y);this.arcTo(x+w,y,x+w,y+h,r);this.arcTo(x+w,y+h,x,y+h,r);this.arcTo(x,y+h,x,y,r);this.arcTo(x,y,x+w,y,r);this.closePath();return this};

(function(){
const reduce=false; // phones with Reduce Motion on still get the loader and live graphics (owner's choice)
const ld=document.getElementById('ld'),ldn=document.getElementById('ldn'),ldt=document.getElementById('ldt');
const steps=['OPENING THE MARKET','OPENING THE MARKET','MARKET OPEN'];const ls=performance.now();const ldw=document.getElementById('ldw'),ldb=document.getElementById('ldb');
(function tick(n){const p=Math.min(1,(n-ls)/1700);ldn.textContent=String(Math.round(100*(1-Math.pow(1-p,2.2)))).padStart(3,'0');ldt.textContent=steps[Math.min(2,Math.floor(p*3))];{const e=1-Math.pow(1-p,3);ldw.style.height=(140*Math.min(1,e*1.15))+'px';ldb.style.height=(104*e)+'px'}ldt.classList.toggle('armed',p>.67);
 if(p<1&&!reduce)requestAnimationFrame(tick);else{ld.classList.add('out');document.documentElement.classList.add('ready')}})(ls);
const css=()=>getComputedStyle(document.documentElement);
let RGB=css().getPropertyValue('--glowRGB').trim();

function fit(c){const r=c.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);c.width=r.width*d;c.height=r.height*d;return d}

/* HERO: drifting liquidity bands (heatmap) with a live price line cutting through */
const H=document.getElementById('cv-hero'),hx=H.getContext('2d');let hd=fit(H);
let bands=[],pts=[],t0=performance.now(),py=0,pv=0,scr=0,lastH=0;
/* smooth random walk: momentum + pull back to the middle of the band, so the line never jumps */
function nextPt(){const h=H.height,mid=h*.79;pv=pv*.92+(Math.random()-.5)*1.6*hd+(mid-py)*.006;py+=pv;py=Math.max(h*.68,Math.min(h*.9,py));return py}
function seed(){const h=H.height;bands=[];const n=7;for(let i=0;i<n;i++)bands.push({y:h*(.16+.7*Math.random()),a:.18+Math.random()*.5,w:(6+Math.random()*22)*hd,sp:.2+Math.random()*.6,ph:Math.random()*6});
 pts=[];py=H.height*.8;pv=0;const np=Math.ceil(H.width*.82/(8*hd))+3;for(let i=0;i<np;i++)pts.push(nextPt());scr=0;lastH=0}
seed();addEventListener('resize',()=>{hd=fit(H);seed()});
function hero(now){const w=H.width,h=H.height,t=(now-t0)/1000;hx.globalCompositeOperation='source-over';hx.fillStyle='rgba(5,5,7,1)';hx.fillRect(0,0,w,h);
 hx.globalCompositeOperation='lighter';
 for(const b of bands){for(let x=0;x<w;x+=10*hd){const n=Math.sin(x/(90*hd)+t*b.sp+b.ph)*.5+.5,m=Math.sin(x/(23*hd)-t*.7+b.ph*2)*.5+.5;const a=b.a*(.25+.75*n*m)*(x/w*.8+.2);
   const g=hx.createLinearGradient(0,b.y-b.w,0,b.y+b.w);g.addColorStop(0,`rgba(${RGB},0)`);g.addColorStop(.5,`rgba(${RGB},${a.toFixed(3)})`);g.addColorStop(1,`rgba(${RGB},0)`);hx.fillStyle=g;hx.fillRect(x,b.y-b.w,10*hd,b.w*2)}}
 // price line: scrolls steadily left, new price is added at the live dot, never rewinds
 hx.globalCompositeOperation='source-over';const step=8*hd,dt=lastH?Math.min(50,now-lastH):16;lastH=now;
 if(!reduce){scr+=dt*.022*hd;while(scr>=step){scr-=step;pts.shift();pts.push(nextPt())}}
 const head=w*.82,n=pts.length;
 const lg=hx.createLinearGradient(0,0,head,0);lg.addColorStop(0,'rgba(242,242,244,0)');lg.addColorStop(.35,'rgba(242,242,244,.4)');lg.addColorStop(1,'rgba(242,242,244,.75)');
 hx.strokeStyle=lg;hx.lineWidth=1.4*hd;hx.lineJoin='round';hx.beginPath();
 for(let i=0;i<n-1;i++){const x=head-(n-2-i)*step-scr,y=pts[i];i?hx.lineTo(x,y):hx.moveTo(x,y)}
 const ya=pts[n-2],yb=pts[n-1],f=scr/step,hy=ya+(yb-ya)*f;hx.lineTo(head,hy);hx.stroke();
 hx.strokeStyle='rgba(255,255,255,.12)';hx.setLineDash([3*hd,5*hd]);hx.beginPath();hx.moveTo(head,hy);hx.lineTo(w,hy);hx.stroke();hx.setLineDash([]);
 hx.fillStyle=`rgba(${RGB},.35)`;hx.beginPath();hx.arc(head,hy,(7+2*Math.sin(t*3))*hd,0,7);hx.fill();
 hx.fillStyle='#fff';hx.beginPath();hx.arc(head,hy,3.2*hd,0,7);hx.fill();
 if(!reduce)requestAnimationFrame(hero)}
requestAnimationFrame(hero);

/* words light up one by one, gauges draw, numbers count, a word cycles */
const ws=[...document.querySelectorAll('#words div')];
const hc=document.querySelector('.hero .c'),wm=document.querySelector('.close .wm');
const LS=document.getElementById('learn');
function onScroll(){const vh=innerHeight;{const r=LS.getBoundingClientRect();const p=Math.max(0,Math.min(.999,(vh*.1-r.top)/(r.height-vh)));const act=Math.floor(p*ws.length);ws.forEach((d,i)=>d.classList.toggle('on',reduce||i<=act))}
 if(reduce)return;const y=scrollY;hc.style.transform=`translateY(${y*.35}px)`;hc.style.opacity=Math.max(0,1-y/(vh*.7));
 H.style.transform=`translateY(${y*.2}px) scale(${1+y/4000})`;
 if(wm){const r=wm.getBoundingClientRect();wm.style.transform=`translate(${Math.max(0,(r.top-vh*.35)*.3)}px,-12%)`}}
addEventListener('scroll',onScroll,{passive:true});onScroll();
document.documentElement.classList.add('js');
const rio=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in-view');rio.unobserve(e.target)}}),{threshold:.15,rootMargin:'0px 0px -8% 0px'});
document.querySelectorAll('.rv').forEach(el=>{if(!el.closest('.hero'))rio.observe(el)});
setTimeout(()=>document.querySelectorAll('.rv').forEach(el=>el.classList.add('in-view')),reduce?0:9000);
const io=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;e.target.querySelectorAll('.arc').forEach(a=>{a.style.transition=reduce?'none':'stroke-dashoffset 1.8s cubic-bezier(.2,.7,.2,1)';a.style.strokeDashoffset=578*(1-a.dataset.to)});
 e.target.querySelectorAll('[data-count]').forEach(b=>{if(reduce)return;const to=+b.dataset.count,s=performance.now();const f=n=>{const p=Math.min(1,(n-s)/1400);b.textContent=Math.round(to*(1-Math.pow(1-p,3)));p<1&&requestAnimationFrame(f)};requestAnimationFrame(f)});io.unobserve(e.target)}),{threshold:.3});
document.querySelectorAll('.gauges').forEach(g=>io.observe(g));
const cw=['sizes','guards','journals','protects'];let ci=0;const ce=document.getElementById('cyc');
if(!reduce)setInterval(()=>{ce.classList.add('sw');setTimeout(()=>{ci=(ci+1)%cw.length;ce.textContent=cw[ci];ce.classList.remove('sw')},350)},2200);

/* ===== live graphics: story, footprint, replay tester, skill scenes ===== */
const mono='"JetBrains Mono",monospace',sans='Manrope,sans-serif';
const Rnd=(s=>()=>(s=(s*16807)%2147483647)/2147483647);
function fitc(c){const r=c.getBoundingClientRect(),d=Math.min(devicePixelRatio||1,2);c.width=Math.max(1,r.width*d);c.height=Math.max(1,r.height*d);c._d=d}
const vis=new Map();const vio=new IntersectionObserver(es=>es.forEach(e=>{const was=vis.get(e.target);vis.set(e.target,e.isIntersecting);if(e.isIntersecting&&!was&&e.target._enter)e.target._enter()}),{threshold:.25});
function canv(id){const c=document.getElementById(id);fitc(c);vio.observe(c);return [c,c.getContext('2d')]}
function box(x,d,X,Y,text,opt={}){x.save();x.font=`${opt.bold?700:500} ${(opt.size||12)*d}px ${sans}`;const tw=x.measureText(text).width,pw=tw+18*d,ph=26*d;const bx=opt.right?X-pw:X,by=Y-ph/2;
 x.fillStyle=opt.fill||'rgba(5,5,7,.92)';x.strokeStyle=opt.stroke||'rgba(255,255,255,.55)';x.lineWidth=1*d;x.fillRect(bx,by,pw,ph);x.strokeRect(bx+.5,by+.5,pw-1,ph-1);x.fillStyle=opt.color||'#f2f2f4';x.textBaseline='middle';x.fillText(text,bx+9*d,Y+.5*d);x.restore();return{bx,by,pw,ph}}
function dash(x,d,pts,col){x.save();x.strokeStyle=col||'rgba(255,255,255,.6)';x.lineWidth=1*d;x.setLineDash([4*d,4*d]);x.beginPath();pts.forEach((p,i)=>i?x.lineTo(p[0],p[1]):x.moveTo(p[0],p[1]));x.stroke();
 const [a,b]=pts.slice(-2);const ang=Math.atan2(b[1]-a[1],b[0]-a[0]);x.setLineDash([]);x.beginPath();x.moveTo(b[0],b[1]);x.lineTo(b[0]-7*d*Math.cos(ang-.4),b[1]-7*d*Math.sin(ang-.4));x.lineTo(b[0]-7*d*Math.cos(ang+.4),b[1]-7*d*Math.sin(ang+.4));x.closePath();x.fillStyle=col||'rgba(255,255,255,.6)';x.fill();x.restore()}
function tag(x,d,X,Y,text,dx,dy,col){col=col||'#ffffff';const LX=X+dx*d,LY=Y+dy*d;x.save();
 x.strokeStyle='rgba(255,255,255,.55)';x.lineWidth=1*d;x.beginPath();x.moveTo(X,Y);x.lineTo(LX,LY);x.stroke();
 x.fillStyle=col;x.beginPath();x.arc(X,Y,3*d,0,7);x.fill();
 x.font=`500 ${12*d}px ${sans}`;const tw=x.measureText(text).width,pw=tw+16*d,ph=22*d;let bx=dx<0?LX-pw:LX;bx=Math.max(4*d,Math.min(x.canvas.width-pw-4*d,bx));const by=LY-ph/2;
 x.fillStyle='rgba(5,5,7,.88)';x.strokeStyle='rgba(255,255,255,.22)';x.beginPath();x.roundRect(bx,by,pw,ph,ph/2);x.fill();x.stroke();
 x.fillStyle='#f2f2f4';x.textAlign='left';x.textBaseline='middle';x.fillText(text,bx+8*d,LY+.5*d);x.restore()}
const draws=[];
/* ===== home page live graphics ===== */
/* 1. one bad day: without limits vs with KATANA */
(function(){const [C,X]=canv('bd');const note=document.getElementById('bd-now');
 const W=[0,-.5,-1.1,-.7,-1.6,-2.4,-3.3,-4.4,-5.1,-6.6,-7.8,-9.1];const LIM=-3,FIRM=-5,N=W.length;
 const K=W.map(v=>Math.max(v,LIM));let f=0,last=0;C._enter=()=>{f=0};
 const notes=[[0,'Same trader, same bad day. Two different endings.'],[3,'Two losses in a row. Frustration starts.'],[5,'Revenge trade, bigger lot. The stop gets moved.'],[6.2,'KATANA hits the daily limit and locks trading. Day over at −3%.'],[8,'Without limits the losses keep stacking.'],[10,'−5%: the prop firm\'s line is gone. Challenge failed.']];
 draws.push([C,t=>{const w=C.width,h=C.height,d=C._d,dt=last?Math.min(60,t-last):16;last=t;if(!reduce){f+=dt/480;if(f>N+6)f=0}else f=N;
  const s=Math.min(N-1,f);X.fillStyle='#050507';X.fillRect(0,0,w,h);
  const pad=28*d,R=w-120*d,top=40*d,bot=h-46*d,lo=-10,hi=1,Y=v=>top+(hi-v)/(hi-lo)*(bot-top),Xp=i=>pad+i/(N-1)*(R-pad);
  X.font=`${10*d}px ${mono}`;X.strokeStyle='rgba(255,255,255,.05)';X.lineWidth=d;for(let v=0;v>=-10;v-=2){X.beginPath();X.moveTo(pad,Y(v));X.lineTo(R,Y(v));X.stroke();X.fillStyle='#4a4a54';X.fillText((v?v:'0')+'%',R+8*d,Y(v)+3*d)}
  for(let i=0;i<N;i+=1){X.fillStyle='#4a4a54';if(i%2==0)X.fillText('T'+(i+1),Xp(i)-6*d,h-20*d)}
  X.fillStyle='#4a4a54';X.fillText('TRADES THROUGH THE DAY →',pad,h-6*d);X.fillText('ILLUSTRATION',pad,18*d);
  // limit lines
  X.setLineDash([6*d,5*d]);X.strokeStyle=`rgba(${RGB},.8)`;X.beginPath();X.moveTo(pad,Y(LIM));X.lineTo(R,Y(LIM));X.stroke();
  X.strokeStyle='rgba(255,77,90,.7)';X.beginPath();X.moveTo(pad,Y(FIRM));X.lineTo(R,Y(FIRM));X.stroke();X.setLineDash([]);
  X.font=`500 ${11*d}px ${sans}`;X.fillStyle=`rgb(${RGB})`;X.fillText('Your KATANA daily limit −3%',pad+6*d,Y(LIM)-7*d);X.fillStyle='#ff6b76';X.fillText('Prop firm limit −5%',pad+6*d,Y(FIRM)-7*d);
  const path=(a,col,lw,glow)=>{X.save();X.strokeStyle=col;X.lineWidth=lw*d;X.lineJoin='round';if(glow){X.shadowColor=col;X.shadowBlur=14*d}X.beginPath();const fl=Math.floor(s);for(let i=0;i<=fl;i++){const x=Xp(i),y=Y(a[i]);i?X.lineTo(x,y):X.moveTo(x,y)}if(fl<N-1){const p=s-fl;X.lineTo(Xp(fl)+(Xp(fl+1)-Xp(fl))*p,Y(a[fl]+(a[fl+1]-a[fl])*p))}X.stroke();X.restore();
   const fl2=Math.min(N-1,s),ii=Math.floor(fl2),pp=fl2-ii,yy=ii<N-1?a[ii]+(a[ii+1]-a[ii])*pp:a[ii];return [Xp(ii)+(ii<N-1?(Xp(ii+1)-Xp(ii))*pp:0),Y(yy),yy]};
  const a=path(W,'rgba(220,220,230,.55)',1.6,false);const b=path(K,`rgb(${RGB})`,2.6,true);
  // locked zone after the limit
  if(s>6){const x0=Xp(6);X.fillStyle=`rgba(${RGB},.06)`;X.fillRect(x0,top,Math.min(b[0],R)-x0,bot-top);X.font=`500 ${10.5*d}px ${mono}`;X.fillStyle=`rgb(${RGB})`;X.fillText('🔒 TRADING LOCKED',x0+8*d,top+14*d)}
  [[a,'#d0d0d8'],[b,`rgb(${RGB})`]].forEach(([p,c])=>{X.fillStyle=c;X.beginPath();X.arc(p[0],p[1],4*d,0,7);X.fill()});
  if(s>=N-1){tag(X,d,a[0],a[1],'Without limits: −9.1%, challenge failed',-20,-30,'#ff6b76');tag(X,d,b[0],b[1],'With KATANA: −3%, back tomorrow',-20,-30,`rgb(${RGB})`)}
  let n=notes[0][1];for(const [at,tx] of notes)if(f>=at)n=tx;if(note.textContent!==n)note.textContent=n;}]);
})();

/* 2. KATANA panel plays a trading day */
(function(){const P=document.getElementById('kp');if(!P)return;const $=id=>document.getElementById(id);const LIMIT=3000;
 const day=[{t:'09:31 XAUUSD buy',v:-500,sl:18,lot:2.77},{t:'10:05 XAUUSD sell',v:+840,sl:22,lot:2.27},{t:'10:48 NAS100 buy',v:-500,sl:30,lot:1.66},{t:'11:20 XAUUSD buy',v:-500,sl:15,lot:3.33},{t:'11:42 XAUUSD sell',v:-500,sl:20,lot:2.50},{t:'12:03 XAUUSD buy',v:-500,sl:16,lot:3.12},{t:'12:10 XAUUSD buy',v:-500,sl:12,lot:4.16}];
 let i=0,used=0,bal=100000,timer=null,on=false;
 const money=v=>'$'+Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:0});
 function reset(){i=0;used=0;bal=100000;$('kp-log').innerHTML='';P.classList.remove('locked');$('kp-st').className='st';$('kp-st').innerHTML='<i></i>Armed';paint()}
 function paint(){$('kp-used').textContent=money(used);$('kp-bar').style.width=Math.min(100,used/LIMIT*100)+'%';$('kp-bar').style.setProperty('--bs',(P.querySelector('.kb').clientWidth||300)+'px');$('kp-bal').textContent='$'+bal.toLocaleString('en-US',{minimumFractionDigits:2})}
 function log(html,cls){const li=document.createElement('li');if(cls)li.className=cls;li.innerHTML=html;const L=$('kp-log');L.prepend(li);while(L.children.length>4)L.lastChild.remove()}
 function step(){if(!on)return;if(used>=LIMIT){log('<span>12:15 XAUUSD buy</span><span>Blocked by KATANA</span>','blk');P.classList.add('locked');$('kp-st').className='st lock';$('kp-st').innerHTML='<i></i>Locked';timer=setTimeout(()=>{reset();timer=setTimeout(step,900)},4200);return}
  const d=day[i++];$('kp-sl').textContent=d.sl.toFixed(1);$('kp-lot').textContent=d.lot.toFixed(2);
  timer=setTimeout(()=>{bal+=d.v;if(d.v<0)used+=-d.v;else used=Math.max(0,used-d.v*0);paint();log(`<span>${d.t} · ${d.lot.toFixed(2)} lots</span><span class="${d.v>0?'up':'dn'}">${d.v>0?'+':'−'}${money(d.v)}</span>`);timer=setTimeout(step,1100)},700)}
 reset();new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting&&!on){on=true;reset();step()}else if(!e.isIntersecting&&on){on=false;clearTimeout(timer)}}),{threshold:.3}).observe(P);
 if(reduce){used=3000;paint();P.classList.add('locked')}
})();

/* 3. how a trade flows: one small picture per step */
(function(){const [c,x]=canv('scene');const st=document.getElementById('scene-t');const ws=[...document.querySelectorAll('#words div')];let cur=-1,t0=0;
 const T=['You set risk per trade, daily loss and max drawdown once. KATANA remembers them on every chart.','You pick the trade. KATANA works out the lot size from your risk and places the stop for you.','Hit the daily limit and new trades are blocked until tomorrow. No "one more trade".','Every closed trade lands in your calendar by day and account, with no spreadsheet.','Turn a real trade into a 9:16 story card with the real candles and your R.'];
 const pick=()=>{let a=0;ws.forEach((d,i)=>{if(d.classList.contains('on'))a=i});return a};
 const ease=p=>1-Math.pow(1-Math.max(0,Math.min(1,p)),3);
 draws.push([c,t=>{const w=c.width,h=c.height,d=c._d;const a=pick();if(a!==cur){cur=a;t0=t;st.textContent=T[a]}const e=reduce?99:(t-t0)/1000;
  x.fillStyle='#050507';x.fillRect(0,0,w,h);const pad=26*d;x.font=`${10*d}px ${mono}`;x.fillStyle=`rgb(${RGB})`;x.fillText(`0${a+1} / 05`,pad,28*d);
  x.textBaseline='alphabetic';
  if(a===0){[['Risk per trade',.5,1,'%'],['Daily loss limit',3,5,'%'],['Max drawdown',8,10,'%']].forEach(([n,v,mx,u],i)=>{const y=h*.28+i*h*.2,p=ease(e*1.4-i*.35),cv=v*p;const L=pad,R=w-pad;
    x.font=`500 ${13*d}px ${sans}`;x.fillStyle='#c9c9cf';x.fillText(n,L,y-14*d);x.font=`400 ${15*d}px ${mono}`;x.fillStyle='#f2f2f4';x.textAlign='right';x.fillText(cv.toFixed(1)+u,R,y-14*d);x.textAlign='left';
    x.fillStyle='rgba(255,255,255,.08)';x.fillRect(L,y,R-L,4*d);x.fillStyle=`rgb(${RGB})`;x.fillRect(L,y,(R-L)*cv/mx,4*d);x.beginPath();x.arc(L+(R-L)*cv/mx,y+2*d,8*d,0,7);x.fillStyle='#f2f2f4';x.fill()});
   if(e>1.8){x.font=`500 ${11*d}px ${mono}`;x.fillStyle='#26c6a0';x.fillText('✓ SAVED. APPLIES TO EVERY TRADE',pad,h-30*d)}}
  if(a===1){const cl=[54,53,55,54.5,56,55.2,57,56.4,58],n=cl.length,L=pad,R=w*.54,top=h*.18,bot=h*.78,lo=50,hi=62,Y=p=>bot-(p-lo)/(hi-lo)*(bot-top),cw=(R-L)/n;
   cl.forEach((v,i)=>{const o=i?cl[i-1]:v-.6,up=v>=o;x.strokeStyle=x.fillStyle=up?'#9aa3ad':'#3a3f47';x.fillRect(L+i*cw+cw*.2,Y(Math.max(o,v)),cw*.6,Math.max(2*d,Math.abs(Y(o)-Y(v))));x.beginPath();x.moveTo(L+i*cw+cw*.5,Y(Math.max(o,v)+.6));x.lineTo(L+i*cw+cw*.5,Y(Math.min(o,v)-.6));x.stroke()});
   const p=ease(e*1.2);x.setLineDash([5*d,4*d]);x.lineWidth=d;x.strokeStyle='rgba(255,255,255,.6)';x.beginPath();x.moveTo(L,Y(58));x.lineTo(L+(w*.58-L)*p,Y(58));x.stroke();x.strokeStyle='#ff6b76';x.beginPath();x.moveTo(L,Y(56.2));x.lineTo(L+(w*.58-L)*p,Y(56.2));x.stroke();x.setLineDash([]);
   x.font=`600 ${10.5*d}px ${mono}`;x.fillStyle='#f2f2f4';x.fillText('ENTRY',L+4*d,Y(58)-6*d);x.fillStyle='#ff6b76';x.fillText('STOP · SET BY KATANA',L+4*d,Y(56.2)+15*d);
   const bx=w*.6,by=h*.24,bw=w-pad-bx,rows=[['Risk','0.5% = $500'],['Stop','18 pips'],['Lot size',(2.77*ease(e*1.2-.6)).toFixed(2)]];x.strokeStyle='rgba(255,255,255,.14)';x.strokeRect(bx,by,bw,rows.length*46*d+16*d);
   rows.forEach(([k,v],i)=>{x.globalAlpha=ease(e*2-i*.4);x.font=`${10*d}px ${mono}`;x.fillStyle='#5a5a64';x.fillText(k.toUpperCase(),bx+12*d,by+26*d+i*46*d);x.font=`500 ${17*d}px ${mono}`;x.fillStyle=i===2?`rgb(${RGB})`:'#f2f2f4';x.fillText(v,bx+12*d,by+46*d+i*46*d);x.globalAlpha=1})}
  if(a===2){const L=pad,R=w-pad,y=h*.32,p=ease(e*.7);x.font=`500 ${13*d}px ${sans}`;x.fillStyle='#c9c9cf';x.fillText('Daily loss used',L,y-14*d);x.font=`400 ${14*d}px ${mono}`;x.textAlign='right';x.fillStyle=p>=.999?'#ff6b76':'#f2f2f4';x.fillText('$'+Math.round(3000*p).toLocaleString('en-US')+' / $3,000',R,y-14*d);x.textAlign='left';
   const g=x.createLinearGradient(L,0,R,0);g.addColorStop(0,'#26c6a0');g.addColorStop(.6,'#f5a524');g.addColorStop(1,'#ff4d5a');x.fillStyle='rgba(255,255,255,.08)';x.fillRect(L,y,R-L,8*d);x.fillStyle=g;x.fillRect(L,y,(R-L)*p,8*d);
   if(p>=.999){const bw=Math.min(260*d,R-L),bx=(w-bw)/2,by=h*.5;x.fillStyle='rgba(255,77,90,.08)';x.strokeStyle='rgba(255,77,90,.7)';x.fillRect(bx,by,bw,54*d);x.strokeRect(bx,by,bw,54*d);x.font=`600 ${12*d}px ${mono}`;x.fillStyle='#ff6b76';x.textAlign='center';x.fillText('BUY  ✕  BLOCKED',w/2,by+24*d);x.font=`400 ${12*d}px ${sans}`;x.fillStyle='#f0d0d2';x.fillText('New trades locked until tomorrow',w/2,by+42*d);x.textAlign='left'}}
  if(a===3){const v=[312,-140,488,0,226,-95,640,175,-210,390,128,0,-60,515,244,402,-180,96,310,-45],cols=5,L=pad,R=w-pad,top=h*.16,cw=(R-L)/cols,ch=Math.min(cw*.62,(h*.7)/4);let tot=0;
   v.forEach((n,i)=>{const show=e*6>i;const X0=L+(i%cols)*cw,Y0=top+Math.floor(i/cols)*(ch+6*d);if(show)tot+=n;x.fillStyle=!show||!n?'rgba(255,255,255,.03)':n>0?'rgba(38,198,160,.2)':'rgba(240,70,75,.2)';x.strokeStyle=!show||!n?'rgba(255,255,255,.08)':n>0?'rgba(38,198,160,.5)':'rgba(240,70,75,.5)';x.fillRect(X0+3*d,Y0,cw-6*d,ch);x.strokeRect(X0+3*d,Y0,cw-6*d,ch);
    if(show&&n){x.font=`400 ${13*d}px ${sans}`;x.fillStyle=n>0?'#5fe3c0':'#ff7b80';x.fillText((n>0?'+':'−')+Math.abs(n),X0+10*d,Y0+ch-10*d)}});
   x.font=`300 ${24*d}px ${sans}`;x.fillStyle='#26c6a0';x.fillText('+$'+tot.toLocaleString('en-US'),pad,h-26*d)}
  if(a===4){const ch=h*.78,cw=ch*9/16,X0=(w-cw)/2,Y0=h*.12,p=ease(e*1.1);x.save();x.translate(w/2,Y0+ch/2);x.rotate((1-p)*-.12);x.scale(.9+.1*p,.9+.1*p);x.translate(-w/2,-(Y0+ch/2));
   const g=x.createRadialGradient(w/2,Y0,0,w/2,Y0,ch*.8);g.addColorStop(0,`rgba(${RGB},.3)`);g.addColorStop(1,'rgba(10,10,13,1)');x.fillStyle=g;x.beginPath();x.roundRect(X0,Y0,cw,ch,18*d);x.fill();x.strokeStyle='rgba(255,255,255,.18)';x.stroke();
   x.font=`500 ${10*d}px ${mono}`;x.fillStyle='#f2f2f4';x.fillText('5ABI.FX',X0+14*d,Y0+24*d);x.fillStyle='#7d7d88';x.textAlign='right';x.fillText('XAUUSD · BUY',X0+cw-14*d,Y0+24*d);x.textAlign='left';
   const pts=[52,50,56,48,44,46,34,30,22,24,14,10,6];x.strokeStyle='#26c6a0';x.lineWidth=1.8*d;x.beginPath();pts.slice(0,Math.max(2,Math.ceil(pts.length*p))).forEach((v,i)=>{const px=X0+14*d+i/(pts.length-1)*(cw-28*d),py=Y0+ch*.2+v/70*ch*.32;i?x.lineTo(px,py):x.moveTo(px,py)});x.stroke();
   x.font=`200 ${44*d}px ${sans}`;x.fillStyle='#5fe3c0';x.fillText('+'+(2.4*p).toFixed(1)+'R',X0+14*d,Y0+ch*.72);x.font=`400 ${11*d}px ${sans}`;x.fillStyle='#7d7d88';x.fillText('London open',X0+14*d,Y0+ch*.72+20*d);
   x.font=`400 ${9*d}px ${mono}`;x.strokeStyle=`rgba(${RGB},.7)`;x.beginPath();x.roundRect(X0+14*d,Y0+ch-38*d,118*d,22*d,11*d);x.stroke();x.fillStyle='#ffb07a';x.fillText('KATANA PROTECTED',X0+24*d,Y0+ch-23*d);x.restore()}
 }]);
})();

/* 4. journal calendar fills in */
(function(){const G=document.getElementById('jc-g'),T=document.getElementById('jc-tot');const v=[312,-140,488,0,226,-95,640,175,-210,390,128,0,-60,515,244,402,-180,96,310,-45];
 const cells=v.map((n,i)=>{const el=document.createElement('i');el.innerHTML=`<span>${i+1+Math.floor(i/5)*2}</span><b>${n?(n>0?'+':'−')+Math.abs(n):'·'}</b>`;G.appendChild(el);return el});
 let done=false;new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting||done)return;done=true;let tot=0;v.forEach((n,i)=>setTimeout(()=>{if(n)cells[i].className=n>0?'w':'l';tot+=n;T.textContent='+$'+tot.toLocaleString('en-US')},reduce?0:300+i*110))}),{threshold:.35}).observe(G);
})();

/* 5. edge score ring + number */
(function(){const I=document.getElementById('ins');const b=I.querySelector('.ring b'),r=I.querySelector('.ra');let done=false;
 new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting||done)return;done=true;r.style.strokeDashoffset=327*(1-r.dataset.to);const s=performance.now();const f=n=>{const p=reduce?1:Math.min(1,(n-s-200)/1800);b.textContent=Math.max(0,Math.round(72*(1-Math.pow(1-Math.max(0,p),3))));if(p<1)requestAnimationFrame(f)};requestAnimationFrame(f)}),{threshold:.3}).observe(I);
})();

/* 6. mentorship band: slow heatmap glow */
(function(){const [c,x]=canv('cv-m');const r=Rnd(3);const B=[...Array(6)].map(()=>({y:.15+r()*.7,a:.12+r()*.3,w:8+r()*20,sp:.15+r()*.4,ph:r()*6}));
 draws.push([c,t=>{const w=c.width,h=c.height,d=c._d,s=t/1000;x.globalCompositeOperation='source-over';x.fillStyle='#050507';x.fillRect(0,0,w,h);x.globalCompositeOperation='lighter';
  for(const b of B){for(let X0=w*.35;X0<w;X0+=10*d){const n=Math.sin(X0/(90*d)+s*b.sp+b.ph)*.5+.5;const a=b.a*n*((X0-w*.35)/(w*.65));const y=b.y*h,bw=b.w*d;const g=x.createLinearGradient(0,y-bw,0,y+bw);g.addColorStop(0,`rgba(${RGB},0)`);g.addColorStop(.5,`rgba(${RGB},${a.toFixed(3)})`);g.addColorStop(1,`rgba(${RGB},0)`);x.fillStyle=g;x.fillRect(X0,y-bw,10*d,bw*2)}}
  x.globalCompositeOperation='source-over'}]);
})();

/* 7. billing toggle */
document.querySelectorAll('#price .view button').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('#price .view button').forEach(q=>q.setAttribute('aria-pressed',String(q===b)));
 document.querySelectorAll('#tiers .amt b').forEach(el=>{el.textContent=el.dataset[b.dataset.b]});document.querySelectorAll('#tiers .amt i').forEach(el=>{el.textContent=b.dataset.b==='y'?'/ month, billed yearly':'/ month'})}));

addEventListener('resize',()=>draws.forEach(([c])=>fitc(c)));
function gloop(t){for(const [c,fn] of draws)if(vis.get(c)||reduce)fn(t);if(!reduce)requestAnimationFrame(gloop)}
requestAnimationFrame(t=>{draws.forEach(([c,fn])=>fn(t));gloop(t)});

})();

(function(){const n=document.querySelector('nav');const f=()=>n.classList.toggle('sc',scrollY>40);addEventListener('scroll',f,{passive:true});f()})();
