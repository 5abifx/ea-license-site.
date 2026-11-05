if(!CanvasRenderingContext2D.prototype.roundRect)CanvasRenderingContext2D.prototype.roundRect=function(x,y,w,h,r){r=Math.max(0,Math.min(typeof r==='number'?r:(r&&r[0])||0,Math.abs(w)/2,Math.abs(h)/2));this.moveTo(x+r,y);this.arcTo(x+w,y,x+w,y+h,r);this.arcTo(x+w,y+h,x,y+h,r);this.arcTo(x,y+h,x,y,r);this.arcTo(x,y,x+w,y,r);this.closePath();return this};

(function(){
const reduce=false; // phones with Reduce Motion on still get the loader and live graphics (owner's choice)
const ld=document.getElementById('ld'),ldn=document.getElementById('ldn'),ldt=document.getElementById('ldt');
const steps=['INITIALISING SESSION','LOADING MARKET DATA','CONNECTING TO THE OPEN'];const ls=performance.now();
(function tick(n){const p=Math.min(1,(n-ls)/1700);ldn.textContent=String(Math.round(100*(1-Math.pow(1-p,2.2)))).padStart(3,'0');ldt.textContent=steps[Math.min(2,Math.floor(p*3))];
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
const cw=['read','decode','trade','plan'];let ci=0;const ce=document.getElementById('cyc');
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

/* 1. story: price action trader sells the break, volume trader buys the strength */
(function(){const [C,X]=canv('story');
const K=[[60,62,57,58],[58,59,53,54],[54,56,50,51],[51,55,49,54],[54,58,53,57],[57,58,52,53],[53,54,48,49],[49,50,44.5,46],[46,47.5,43,46.6],[46.6,51,46,50.5],[50.5,55,50,54.5],[54.5,60,54,59.3],[59.3,64,58.5,63.4],[63.4,68,62.5,67.2]];
const B=[[],[[55,.3,0]],[[51,.35,0],[50.5,.25,0]],[[49.5,.3,1]],[[56,.25,1]],[[53,.3,0]],[[49,.4,0],[48.5,.3,0]],[[45.2,.6,1],[44.8,.85,1],[46,.45,1],[45.6,.3,0]],[[43.6,1,1],[45,.7,1],[44.2,.55,1]],[[48,.6,1],[50,.5,1]],[[52,.55,1],[54,.45,1]],[[56,.5,1],[58.8,.4,1]],[[61,.45,1],[63,.35,0]],[[66,.4,1]]];
const SWING=49,notes=[[0,'Price is falling. Both traders are watching.'],[3,'Price bounces from a low. That is the level everyone watches.'],[6,'Price breaks below it. Price action calls this a break of structure.'],[7,'The price action trader sells the break, with a stop above.'],[8,'But the circles are big trades: huge buy orders absorbing every sell.'],[9,'The volume trader sees the strength and buys.'],[11,'Price turns up hard. Sellers who sold the break are trapped.'],[12,'The price action trader is stopped out. The volume trader is in profit.']];
const now=document.getElementById('st-now');const N=K.length,STEP=560;let f=reduce?(N+2)*STEP:0,last=0;C._enter=()=>{if(!reduce)f=0};
draws.push([C,t=>{const w=C.width,h=C.height,d=C._d,dt=last?Math.min(60,t-last):16;last=t;if(!reduce){f+=dt;if(f>(N+7)*STEP)f=0}
 const shown=Math.min(N,f/STEP),full=Math.floor(shown),part=shown-full;X.fillStyle='#050507';X.fillRect(0,0,w,h);
 const lo=40,hi=70,pad=24*d,right=w-70*d,cw=(right-pad)/N,Y=p=>h-30*d-(p-lo)/(hi-lo)*(h-70*d);
 X.strokeStyle='rgba(255,255,255,.04)';X.lineWidth=d;X.font=`${10*d}px ${mono}`;for(let p=lo;p<=hi;p+=5){X.beginPath();X.moveTo(0,Y(p));X.lineTo(w,Y(p));X.stroke();X.fillStyle='#4a4a54';X.fillText((2380+p*.5).toFixed(1),w-50*d,Y(p)-3*d)}
 if(full>=3){X.save();X.strokeStyle='rgba(255,255,255,.35)';X.setLineDash([6*d,5*d]);X.beginPath();X.moveTo(pad+3*cw,Y(SWING));X.lineTo(pad+(Math.min(full,8)+1)*cw,Y(SWING));X.stroke();X.restore();
  X.font=`600 ${11*d}px ${mono}`;X.fillStyle='rgba(255,255,255,.7)';X.fillText('LOW',pad+3*cw,Y(SWING)-7*d);if(full>=6)X.fillText('BOS ↓',pad+6.1*cw,Y(SWING)+16*d)}
 for(let i=0;i<=Math.min(full,N-1);i++){let [o,hh,l,c]=K[i];if(i===full){if(shown>=N)break;c=o+(c-o)*part;hh=Math.max(o,c,o+(hh-o)*part);l=Math.min(o,c,o+(l-o)*part)}
  const x0=pad+i*cw+cw*.2,bw=cw*.6,up=c>=o;X.fillStyle=up?'#9aa3ad':'#3a3f47';X.strokeStyle=X.fillStyle;X.lineWidth=1.2*d;X.beginPath();X.moveTo(x0+bw/2,Y(hh));X.lineTo(x0+bw/2,Y(l));X.stroke();X.fillRect(x0,Y(Math.max(o,c)),bw,Math.max(2*d,Math.abs(Y(o)-Y(c))))}
 X.save();for(let i=0;i<=Math.min(full,N-1);i++){const prog=i<full?1:part;B[i].forEach(([p,s,buy],j)=>{const a=Math.min(1,Math.max(0,prog*3-j*.5));if(a<=0)return;const rr=(4+s*s*24)*d*(.6+.4*a);const cx=pad+i*cw+cw*.5,cy=Y(p);
  X.globalAlpha=a;X.beginPath();X.arc(cx,cy,rr,0,7);X.fillStyle=buy?'rgba(63,185,80,.42)':'rgba(255,77,90,.38)';X.fill();X.lineWidth=1.3*d;X.strokeStyle=buy?'#5fd36f':'#ff6b76';X.stroke()})}X.restore();
 const cx=i=>pad+i*cw+cw*.5,L=pad*.5;
 if(full>=7){const b=box(X,d,L,Y(66),'Price action trader: SELL the break',{size:w<560*d?11:12,color:'#ffb3b9',stroke:'rgba(255,77,90,.8)'});dash(X,d,[[b.bx+b.pw,Y(66)],[cx(7)-8*d,Y(66)],[cx(7)-8*d,Y(47)]],'rgba(255,107,118,.9)');
  X.fillStyle='#ff4d5a';X.font=`700 ${11*d}px ${mono}`;X.fillText('SELL',cx(7)+10*d,Y(46.5));X.strokeStyle='rgba(255,77,90,.7)';X.setLineDash([3*d,3*d]);X.beginPath();X.moveTo(cx(7),Y(52.5));X.lineTo(right,Y(52.5));X.stroke();X.setLineDash([]);X.fillText('STOP',right+6*d,Y(52.5)+4*d)}
 if(full>=8){const b=box(X,d,L,Y(41.5),'Big buyers absorbing every sell',{size:w<560*d?11:12,color:'#c9f5cf',stroke:'rgba(95,211,111,.8)'});dash(X,d,[[b.bx+b.pw,Y(41.5)],[cx(8)-22*d,Y(43.4)]],'rgba(95,211,111,.9)')}
 if(full>=9){X.fillStyle='#5fd36f';X.font=`700 ${11*d}px ${mono}`;X.fillText('BUY',cx(9)-cw*.5-28*d,Y(48)+14*d);const nar=w<560*d,vy=nar?Y(60):Y(42);const b=box(X,d,right,vy,'Volume trader: BUY on strength',{right:1,size:nar?11:12,color:'#c9f5cf',stroke:'rgba(95,211,111,.8)'});dash(X,d,[[b.bx+b.pw*.3,nar?b.by+b.ph:b.by],[cx(9)+8*d,Y(nar?49:47.2)]],'rgba(95,211,111,.9)');
  X.strokeStyle='rgba(255,255,255,.5)';X.setLineDash([6*d,4*d]);X.beginPath();X.moveTo(cx(9),Y(48));X.lineTo(right,Y(48));X.stroke();X.setLineDash([]);X.fillStyle='#f2f2f4';X.font=`700 ${11*d}px ${mono}`;X.fillText('ENTRY',right+6*d,Y(48)+4*d)}
 if(full>=12){box(X,d,cx(10.5),Y(69),'Stopped out',{right:1,color:'#ffb3b9',stroke:'rgba(255,77,90,.8)',bold:1});box(X,d,cx(10.9),Y(69),'In profit',{color:'#c9f5cf',stroke:'rgba(95,211,111,.8)',bold:1})}
 let n=notes[0][1];for(const [at,tx] of notes)if(full>=at)n=tx;if(now.textContent!==n)now.textContent=n;
 X.font=`${10*d}px ${mono}`;X.fillStyle='#4a4a54';X.fillText('ILLUSTRATION',pad*.5,16*d);}]);
})();

/* 2. footprint: sellers x buyers at every price inside each candle */
(function(){const [c,x]=canv('fp');const r=Rnd(23);const N=6,L=9;let cs=[];
 function mk(base){const lv=[];for(let k=0;k<L;k++){const m=Math.exp(-Math.pow((k-4+(r()-.5)*2)/2.2,2));lv.push({s:Math.round(m*(40+r()*260)),b:Math.round(m*(40+r()*260))})}const up=r()<.55;return{base,lv,up,o:up?1+Math.floor(r()*2):L-2-Math.floor(r()*2),c:up?L-2-Math.floor(r()*2):1+Math.floor(r()*2),grow:1}}
 let b=0;for(let i=0;i<N;i++){cs.push(mk(b));b+=Math.round((r()-.45)*3)}let last=0,acc=0;
 draws.push([c,t=>{const w=c.width,h=c.height,d=c._d;const dt=last?Math.min(60,t-last):16;last=t;acc+=dt;const cur=cs[N-1];
  if(!reduce){cur.grow=Math.min(1,cur.grow+dt/2600);if(cur.grow>=1&&acc>3200){acc=0;cs.shift();const n=mk(cs[cs.length-1].base+Math.round((r()-.45)*3));n.grow=0;cs.push(n)}}
  x.fillStyle='#050507';x.fillRect(0,0,w,h);const pad=14*d,colw=(w-pad*2-50*d)/N,rh=(h-pad*2-20*d)/(L+4);
  const minB=Math.min(...cs.map(k=>k.base)),maxB=Math.max(...cs.map(k=>k.base))+L;const yOf=lvl=>pad+30*d+(maxB-lvl)*rh*.92;
  x.font=`${Math.max(8,Math.min(11,colw/d/8.5))*d}px ${mono}`;x.textBaseline='middle';
  cs.forEach((k,i)=>{const X=pad+i*colw+6*d,cw=colw*.84;const g=i===N-1?k.grow:1;const mx=Math.max(...k.lv.map(l=>l.s+l.b));
   k.lv.forEach((l,j)=>{const Y=yOf(k.base+j);const S=Math.round(l.s*g),Bv=Math.round(l.b*g);const dom=Bv>S;const inten=Math.min(1,(l.s+l.b)/mx);
    x.fillStyle=dom?`rgba(47,211,176,${(.06+inten*.32)*g})`:`rgba(255,77,90,${(.06+inten*.32)*g})`;x.fillRect(X,Y-rh/2+1,cw,rh-2);
    if(l.s+l.b===mx&&g>.6){x.strokeStyle=`rgba(${RGB},1)`;x.lineWidth=1.4*d;x.strokeRect(X+.5,Y-rh/2+1,cw-1,rh-2)}
    x.fillStyle=dom?'#9a9aa5':'#ffd2d6';x.textAlign='right';x.fillText(S,X+cw/2-5*d,Y);x.fillStyle='#4a4a54';x.textAlign='center';x.fillText('×',X+cw/2,Y);x.fillStyle=dom?'#c9fff0':'#9a9aa5';x.textAlign='left';x.fillText(Bv,X+cw/2+5*d,Y)});
   const yo=yOf(k.base+k.o),yc=yOf(k.base+k.c);x.fillStyle=k.up?'#2fd3b0':'#ff4d5a';x.fillRect(X-4*d,Math.min(yo,yc)-rh/2,2.5*d,Math.abs(yc-yo)+rh);
   const delta=k.lv.reduce((a,l)=>a+l.b-l.s,0)*g;x.textAlign='center';x.fillStyle=delta>0?'#2fd3b0':'#ff4d5a';x.fillText((delta>0?'+':'')+Math.round(delta),X+cw/2,h-pad)});
  x.fillStyle='#5a5a64';x.textAlign='left';for(let lv=minB;lv<maxB;lv+=2)x.fillText((2400+lv*.25).toFixed(2),w-46*d,yOf(lv));
  x.fillText('BUYERS − SELLERS',pad,h-pad-16*d);
  {const k=cs[1],X=pad+colw+6*d,cw=colw*.84;const mx=Math.max(...k.lv.map(l=>l.s+l.b));const j=k.lv.findIndex(l=>l.s+l.b===mx);tag(x,d,X+cw,yOf(k.base+j),'Most trading at this price',20,-34,`rgb(${RGB})`);
   const k4=cs[4];tag(x,d,pad+4*colw+6*d+colw*.42,yOf(k4.base+L-1),'Sellers × buyers',-10,-22);
   let bi=0,bd=-1e9;cs.forEach((q,i)=>{const dd=q.lv.reduce((a,l)=>a+l.b-l.s,0);if(i<N-1&&dd>bd){bd=dd;bi=i}});tag(x,d,pad+bi*colw+6*d+colw*.42,h-pad-6*d,'Buyers won this candle',14,-30,'#2fd3b0')}}]);
})();

/* 3. replay tester: the same break, 20 times */
(function(){const [T,TX]=canv('tester');const r=Rnd(91),RUNS=20,LEN=120;const runs=[];
 for(let k=0;k<RUNS;k++){let v=0;const a=[0];const bias=(r()-.62)*.35;for(let i=1;i<LEN;i++){v+=bias+(r()-.5)*2.2;if(i>30&&r()<.02)v+=(r()-.6)*6;a.push(v)}runs.push(a)}
 const star=[0];{let v=0;for(let i=1;i<LEN;i++){v+=(i<14?-.55:i<30?.35:.62)+(r()-.5)*1.6;if(i===16)v-=3;star.push(v)}}
 const avg=[...Array(LEN)].map((_,i)=>runs.reduce((s,a)=>s+a[i],0)/RUNS);const all=[...runs.flat(),...star];const mn=Math.min(...all)-2,mx=Math.max(...all)+2;
 let gt=0,gl=0;T._enter=()=>{gt=0};
 draws.push([T,t=>{const w=T.width,h=T.height,d=T._d,dt=gl?Math.min(60,t-gl):16;gl=t;if(!reduce){gt+=dt;if(gt>6500)gt=0}const prog=reduce?1:Math.min(1,gt/3200);const n=Math.max(2,Math.floor(prog*LEN));
  TX.fillStyle='#050507';TX.fillRect(0,0,w,h);const L=14*d,Rr=w-62*d,top=16*d,bot=h-28*d;const Y=v=>bot-(v-mn)/(mx-mn)*(bot-top),Xp=i=>L+i/(LEN-1)*(Rr-L);
  TX.strokeStyle='rgba(255,255,255,.06)';TX.lineWidth=d;TX.setLineDash([2*d,4*d]);for(let i=0;i<=12;i++){const x=L+i/12*(Rr-L);TX.beginPath();TX.moveTo(x,top);TX.lineTo(x,bot);TX.stroke()}for(let v=Math.ceil(mn/10)*10;v<mx;v+=10){TX.beginPath();TX.moveTo(L,Y(v));TX.lineTo(Rr,Y(v));TX.stroke()}TX.setLineDash([]);
  TX.font=`${10*d}px ${mono}`;TX.fillStyle='#5a5a64';for(let i=0;i<=6;i+=2)TX.fillText(`+${i*20}m`,L+i/6*(Rr-L)-10*d,h-10*d);
  const line=(a,col,lw)=>{TX.strokeStyle=col;TX.lineWidth=lw*d;TX.beginPath();for(let i=0;i<n;i++){const x=Xp(i),y=Y(a[i]);i?TX.lineTo(x,y):TX.moveTo(x,y)}TX.stroke()};
  runs.forEach(a=>line(a,'rgba(220,220,230,.24)',1));line(avg,'#e5484d',1.4);line(star,`rgb(${RGB})`,2.4);
  TX.strokeStyle='rgba(255,255,255,.3)';TX.beginPath();TX.moveTo(L,Y(0));TX.lineTo(Rr,Y(0));TX.stroke();TX.fillStyle='#9a9aa5';TX.fillText('BREAK PRICE',L+4*d,Y(0)-5*d);
  const tags=runs.map(a=>({v:a[n-1],c:'#16161b',t:'#9a9aa5'}));tags.push({v:avg[n-1],c:'#e5484d',t:'#fff'},{v:star[n-1],c:`rgb(${RGB})`,t:'#120700'});tags.sort((a,b)=>b.v-a.v);let ly=-1e9;
  tags.forEach(g=>{let y=Y(g.v);if(y-ly<12*d)y=ly+12*d;ly=y;TX.fillStyle=g.c;TX.fillRect(Rr+5*d,y-5.5*d,54*d,11*d);TX.fillStyle=g.t;TX.font=`${9*d}px ${mono}`;TX.fillText((g.v>0?'+':'')+g.v.toFixed(1),Rr+9*d,y+3.5*d)});
  TX.font=`500 ${12*d}px ${sans}`;
  if(n>40){const i=Math.min(n-1,60);const s='Break with strong buyers: price went up';const tw=TX.measureText(s).width;const bx=Math.max(L,Xp(i)-tw-24*d),by=Y(star[i])-40*d;TX.fillStyle='rgba(5,5,7,.92)';TX.strokeStyle=`rgb(${RGB})`;TX.fillRect(bx,by,tw+16*d,24*d);TX.strokeRect(bx,by,tw+16*d,24*d);TX.fillStyle='#ffd2b8';TX.fillText(s,bx+8*d,by+16*d)}
  if(n>80){const i=Math.min(n-1,100);const s='Most plain breaks drifted back';const tw=TX.measureText(s).width;const bx=Xp(i)-tw-10*d,by=Y(avg[i])+22*d;TX.fillStyle='rgba(5,5,7,.92)';TX.strokeStyle='#e5484d';TX.fillRect(bx,by,tw+16*d,24*d);TX.strokeRect(bx,by,tw+16*d,24*d);TX.fillStyle='#ffd0d3';TX.fillText(s,bx+8*d,by+16*d)}}]);
})();

/* 4. what you learn: a small live chart for the highlighted skill */
(function(){const [c,x]=canv('scene');const st=document.getElementById('scene-t');const r=Rnd(7);
 const mk=(cl)=>{const o=[];let p=cl[0];for(let i=1;i<cl.length;i++){const a=p,b=cl[i];o.push([a,Math.max(a,b)+.4+r()*.9,Math.min(a,b)-.4-r()*.9,b]);p=b}return o};
 const S=[
  {t:'Every circle is a big trade. Green buyers keep showing up bigger, so buyers are in control.',k:mk([50,49,51,50.5,53,52,55,54.5,57,56,59,58.6,61,62.5])},
  {t:'Price keeps coming back to the same zone. That is the fair price. Far from it, price is cheap or expensive.',k:mk([52,54,51.5,53.5,56,57.5,54,52,49.5,48,51,53,55,53,52])},
  {t:'Levels are marked before the open. When price gets there, you already know what to do.',k:mk([55,54.5,55.5,55,54.8,53,51,49,47.2,46.6,48,50.5,52.5,55,57.2])},
  {t:'Wait for price to come back to your level. Enter there, not in the middle of the move.',k:mk([46,48,50.5,53,55.5,57,55.5,54,52.6,54,56.5,58.5,60.5,62])},
  {t:'Your stop decides your size. The loss is the same small amount on every trade.',k:mk([46,48,50.5,53,55.5,57,55.5,54,52.6,54,56.5,58.5,60.5,62])},
  {t:'Your journal shows the habit that costs you. Fix it, and the red weeks shrink.',k:[]}];
 let cur=-1,t0=0;const ws=[...document.querySelectorAll('#words div')];
 function pick(){let a=0;ws.forEach((d,i)=>{if(d.classList.contains('on'))a=i});return a}
 draws.push([c,t=>{const w=c.width,h=c.height,d=c._d;const a=pick();if(a!==cur){cur=a;t0=t;st.textContent=S[a].t}const e=reduce?99:(t-t0)/1000;
  x.fillStyle='#050507';x.fillRect(0,0,w,h);const pad=22*d,bot=h-56*d,top=52*d;
  x.font=`${10*d}px ${mono}`;x.fillStyle=`rgb(${RGB})`;x.fillText(`0${a+1} / 06`,pad,28*d);x.fillStyle='#4a4a54';x.fillText('ILLUSTRATION',w-pad-84*d,28*d);
  if(a===5){// habits: weekly results
   const wk=[-3,-4.5,2,-2.5,3,-1,4,5.5],bw=(w-pad*2)/wk.length,z=(top+bot)/2,sc=(bot-top)/12;
   x.strokeStyle='rgba(255,255,255,.2)';x.beginPath();x.moveTo(pad,z);x.lineTo(w-pad,z);x.stroke();
   wk.forEach((v,i)=>{const g=Math.min(1,Math.max(0,e*2.2-i*.35));const hh=v*sc*g;x.fillStyle=v>0?'#2fd3b0':'#ff4d5a';x.globalAlpha=v>0?1:.75;x.fillRect(pad+i*bw+bw*.22,z-Math.max(0,hh),bw*.56,Math.abs(hh));x.globalAlpha=1;
    x.fillStyle='#5a5a64';x.textAlign='center';x.fillText('W'+(i+1),pad+i*bw+bw/2,bot+18*d);x.textAlign='left'});
   if(e>1.2)tag(x,d,pad+1.5*bw,z+4.5*sc,'Revenge trades after a loss',30,26,'#ff4d5a');if(e>2.6)tag(x,d,pad+6.5*bw,z-4*sc,'Habit fixed',-30,-24,'#2fd3b0');return}
  const K=S[a].k,n=K.length;let lo=1e9,hi=-1e9;K.forEach(k=>{lo=Math.min(lo,k[2]);hi=Math.max(hi,k[1])});lo-=2;hi+=2;
  const right=w-pad-(a===4?150*d:0),cw=(right-pad)/n,Y=p=>bot-(p-lo)/(hi-lo)*(bot-top),cx=i=>pad+i*cw+cw/2;
  const vis=Math.min(n,reduce?n:e/.22);
  // backgrounds per skill
  if(a===1){const g=Math.min(1,e/1.2);x.fillStyle=`rgba(${RGB},${.12*g})`;x.fillRect(pad,Y(55),(right-pad)*g,Y(51)-Y(55));x.strokeStyle=`rgba(${RGB},${.5*g})`;x.setLineDash([4*d,4*d]);[51,55].forEach(p=>{x.beginPath();x.moveTo(pad,Y(p));x.lineTo(pad+(right-pad)*g,Y(p));x.stroke()});x.setLineDash([])}
  if(a===2){const ox=pad+5*cw;x.strokeStyle='rgba(255,255,255,.4)';x.beginPath();x.moveTo(ox,top-10*d);x.lineTo(ox,bot);x.stroke();x.fillStyle='#9a9aa5';x.fillText('00:00 OPEN',ox+6*d,top);
   const g=Math.min(1,e/.9);[[47,'#2fd3b0'],[57,'#ff4d5a']].forEach(([p,col])=>{x.strokeStyle=col;x.globalAlpha=.8;x.setLineDash([6*d,4*d]);x.beginPath();x.moveTo(pad,Y(p));x.lineTo(pad+(right-pad)*g,Y(p));x.stroke();x.setLineDash([]);x.globalAlpha=1});
   if(e>.9){tag(x,d,pad+2*cw,Y(47),'Buy zone, planned before the open',10,30,'#2fd3b0');tag(x,d,pad+2*cw,Y(57),'Sell zone',10,-24,'#ff4d5a')}}
  if(a===3||a===4){x.strokeStyle='rgba(255,255,255,.35)';x.setLineDash([6*d,4*d]);x.beginPath();x.moveTo(pad,Y(53));x.lineTo(right,Y(53));x.stroke();x.setLineDash([])}
  for(let i=0;i<Math.min(n,Math.ceil(vis));i++){let [o,hh,l,cc]=K[i];const p=Math.min(1,vis-i);cc=o+(cc-o)*p;hh=Math.max(o,cc,o+(hh-o)*p);l=Math.min(o,cc,o+(l-o)*p);const up=cc>=o;
   x.strokeStyle=x.fillStyle=up?'#9aa3ad':'#3a3f47';x.lineWidth=1.2*d;x.beginPath();x.moveTo(cx(i),Y(hh));x.lineTo(cx(i),Y(l));x.stroke();x.fillRect(cx(i)-cw*.3,Y(Math.max(o,cc)),cw*.6,Math.max(2*d,Math.abs(Y(o)-Y(cc))))}
  if(a===0){// bubbles + control meter
   const bb=[[1,49,.4,0],[2,50.5,.5,1],[3,50,.35,0],[4,52,.7,1],[5,52.5,.3,0],[6,54.5,.8,1],[8,56,.9,1],[9,56.5,.3,0],[10,58.5,1,1],[12,61,.85,1]];
   bb.forEach(([i,p,s,buy])=>{if(i>vis)return;const g=Math.min(1,(vis-i)*1.5);const rr=(4+s*s*20)*d*g;x.beginPath();x.arc(cx(i),Y(p),rr,0,7);x.fillStyle=buy?'rgba(63,185,80,.4)':'rgba(255,77,90,.36)';x.fill();x.strokeStyle=buy?'#5fd36f':'#ff6b76';x.lineWidth=1.2*d;x.stroke()});
   const sh=.5+.2*Math.min(1,e/3),mw=w-pad*2,my=bot+34*d;x.fillStyle='#ff4d5a';x.globalAlpha=.7;x.fillRect(pad+mw*sh,my,mw*(1-sh),8*d);x.globalAlpha=1;x.fillStyle='#2fd3b0';x.fillRect(pad,my,mw*sh,8*d);
   x.font=`600 ${11*d}px ${mono}`;x.fillStyle='#2fd3b0';x.fillText(`BUYERS ${Math.round(sh*100)}%`,pad,my-8*d);x.fillStyle='#ff6b76';x.textAlign='right';x.fillText(`SELLERS ${Math.round(100-sh*100)}%`,w-pad,my-8*d);x.textAlign='left';
   if(vis>10)tag(x,d,cx(10),Y(58.5),'Bigger buyers each push',-30,-40,'#2fd3b0')}
  if(a===1&&e>1.4){tag(x,d,cx(6),Y(57.5),'Expensive: price got pushed away',-20,-26);tag(x,d,cx(9),Y(48),'Cheap: buyers step back in',16,28);tag(x,d,pad+8*d,Y(53),'Fair price',30,0,`rgb(${RGB})`)}
  if((a===3||a===4)&&vis>8.6){const ex=cx(8),ey=Y(52.6);x.fillStyle='#2fd3b0';x.beginPath();x.moveTo(ex,ey+6*d);x.lineTo(ex-6*d,ey+16*d);x.lineTo(ex+6*d,ey+16*d);x.closePath();x.fill();
   if(a===3)tag(x,d,ex,ey+16*d,'Enter here, at your level',20,28,'#2fd3b0');
   if(a===3&&vis>4)tag(x,d,cx(4),Y(55.5),'Not here, mid-move',-20,-30,'#ff6b76')}
  if(a===4&&vis>8.6){const sy=Y(51),ey=Y(52.6),ty=Y(60);x.fillStyle='rgba(255,77,90,.14)';x.fillRect(cx(8),ey,right-cx(8),sy-ey);x.fillStyle='rgba(47,211,176,.12)';x.fillRect(cx(8),ty,right-cx(8),ey-ty);
   x.font=`600 ${10*d}px ${mono}`;x.fillStyle='#ff6b76';x.fillText('STOP',right-40*d,sy+12*d);x.fillStyle='#2fd3b0';x.fillText('TARGET',right-52*d,ty-6*d);
   const px=right+16*d,py=top+10*d,rows=[['Account','$10,000'],['Risk per trade','0.5%'],['Max loss','$50'],['Stop distance','16 pips'],['Lot size','0.31']];
   x.strokeStyle='rgba(255,255,255,.14)';x.strokeRect(px,py,134*d,rows.length*34*d+12*d);rows.forEach(([k,v],i)=>{const g=Math.min(1,Math.max(0,e*2-i*.4-1));x.globalAlpha=g;x.font=`${9.5*d}px ${mono}`;x.fillStyle='#5a5a64';x.fillText(k.toUpperCase(),px+10*d,py+22*d+i*34*d);x.font=`600 ${13*d}px ${sans}`;x.fillStyle=i===4?`rgb(${RGB})`:'#f2f2f4';x.fillText(v,px+10*d,py+37*d+i*34*d);x.globalAlpha=1})}
 }]);
})();

addEventListener('resize',()=>draws.forEach(([c])=>fitc(c)));
function gloop(t){for(const [c,fn] of draws)if(vis.get(c)||reduce)fn(t);if(!reduce)requestAnimationFrame(gloop)}
requestAnimationFrame(t=>{draws.forEach(([c,fn])=>fn(t));gloop(t)});

/* pricing preview toggle, bill counter, mystery note */
const PR=document.getElementById('price');
const bn=document.getElementById('billn');const bio=new IntersectionObserver(es=>es.forEach(e=>{if(!e.isIntersecting)return;bio.disconnect();const to=6960,s0=performance.now();const f=n=>{const p=reduce?1:Math.min(1,(n-s0-700)/1600);bn.textContent='~$'+Math.max(0,Math.round(to*(1-Math.pow(1-Math.max(0,p),3)))).toLocaleString('en-US');if(p<1)requestAnimationFrame(f);else setTimeout(()=>bn.classList.add('x'),400)};requestAnimationFrame(f)}),{threshold:.4});bio.observe(document.getElementById('bill'));
const MY=document.getElementById('mys');
let seen=false;try{seen=localStorage.getItem('mys_seen')==='1'}catch(e){}
if(MY&&!seen){let myDone=false;const mio=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting&&!myDone){myDone=true;setTimeout(()=>{MY.hidden=false;try{localStorage.setItem('mys_seen','1')}catch(e){}},900)}}),{threshold:.2});mio.observe(PR);MY.querySelector('[data-x]').addEventListener('click',()=>{MY.hidden=true})}
document.querySelectorAll('[data-ends]').forEach(el=>{const end=new Date(el.dataset.ends).getTime();const f=()=>{let s=Math.max(0,Math.floor((end-Date.now())/1000));const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60);el.textContent=s?(d?d+'d '+h+'h '+m+'m':h+'h '+m+'m '+(s%60)+'s'):'ended'};f();setInterval(f,1000)});
})();

(function(){const n=document.querySelector('nav');const f=()=>n.classList.toggle('sc',scrollY>40);addEventListener('scroll',f,{passive:true});f()})();
