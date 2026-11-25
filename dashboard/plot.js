'use strict';
// Logarithmic TVL on x, actual seven-day change on y. The list below also exposes every plotted point.
window.paintRadar = function(canvas, rows, universe, t, money, open) {
  const holder = canvas.parentElement;
  const tip = holder.querySelector('.plottip');
  let hits = [];
  function draw() {
    if (!canvas.isConnected) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(w*dpr); canvas.height = Math.round(h*dpr);
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr,dpr);
    const left=33, right=w-15, top=12, bottom=h-24;
    const tvls = universe.map(p=>p.tvl_usd);
    const min = Math.min(...tvls), max = Math.max(...tvls);
    const origin = Math.floor(Math.log10(min/5));
    const end = Math.max(origin+1,Math.ceil(Math.log10(max/5)));
    const x = tvl => left + (Math.log10(tvl/5)-origin)/(end-origin)*(right-left);
    const y = v => bottom - (Math.max(-40,Math.min(40,v))+40)/80*(bottom-top);
    ctx.font='10px ui-monospace,monospace'; ctx.fillStyle='#c3d4d8'; ctx.lineWidth=1;
    for (const v of [-40,0,40]) {
      const yy=y(v);
      ctx.strokeStyle=v===0?'#65808b':'#425d69'; ctx.setLineDash(v===0?[]:[2,4]);
      ctx.beginPath(); ctx.moveTo(left,yy); ctx.lineTo(right,yy); ctx.stroke();
      ctx.textAlign='right';ctx.fillText((v>0?'+':'')+v+'%',left-5,yy+3);
    }
    for (let i=origin;i<=end;i++) {
      const v=5*10**i, xx=x(v);
      ctx.strokeStyle='#48616c';ctx.setLineDash([2,4]);ctx.beginPath();ctx.moveTo(xx,top);ctx.lineTo(xx,bottom);ctx.stroke();
      ctx.textAlign=i===origin?'left':i===end?'right':'center';ctx.fillText(money(v),xx,h-5);
    }
    ctx.setLineDash([]);hits=[];
    const points=rows.filter(p=>p.change_7d!==null).slice().sort((a,b)=>Number(a.official)-Number(b.official));
    for (const p of points) {
      const xx=x(p.tvl_usd), yy=y(p.change_7d);
      ctx.fillStyle=p.official?'#ffcb78':'#82d5c8';ctx.globalAlpha=p.official?0.95:0.78;
      ctx.beginPath();
      if(p.official){ctx.moveTo(xx,yy-4.6);ctx.lineTo(xx+4.6,yy);ctx.lineTo(xx,yy+4.6);ctx.lineTo(xx-4.6,yy);ctx.closePath();}
      else ctx.arc(xx,yy,2.8,0,Math.PI*2);
      ctx.fill();hits.push({x:xx,y:yy,p});
    }
    ctx.globalAlpha=1;
    if(!points.length) {ctx.fillStyle='#d6e7e7';ctx.textAlign='center';ctx.font='12px system-ui';
      ctx.fillText(t('当前筛选无可绘制数据','No observations for this filter'),(left+right)/2,(top+bottom)/2-10);}
  }
  function hit(e) {
    const r=canvas.getBoundingClientRect(), px=e.clientX-r.left, py=e.clientY-r.top;
    let best=null, dist=90;
    for(const h of hits) {const d=(h.x-px)**2+(h.y-py)**2;if(d<dist){dist=d;best=h;}}
    return best;
  }
  canvas.onpointermove=e=>{
    const h=hit(e);tip.hidden=!h;canvas.style.cursor=h?'pointer':'default';
    if(!h) return;
    tip.textContent=h.p.name+' · '+money(h.p.tvl_usd)+' · '+(h.p.change_7d>0?'+':'')+h.p.change_7d.toFixed(1)+'%';
    tip.style.left=Math.max(2,Math.min(canvas.clientWidth-tip.offsetWidth-2,h.x+6))+'px';
    tip.style.top=Math.max(0,h.y-28)+'px';
  };
  canvas.onpointerleave=()=>{tip.hidden=true;};
  canvas.onclick=e=>{const row=hit(e);if(row)open(row.p.slug);};
  draw();
  const observer=new ResizeObserver(draw);observer.observe(canvas);
  return ()=>observer.disconnect();
};

