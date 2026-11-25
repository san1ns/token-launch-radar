'use strict';
const {meta, rows, market} = window.LAUNCH_ATLAS;
const candidateBySlug = new Map(rows.map(p=>[p.slug,p]));
const marketBySlug = new Map(market.map(p=>[p.slug,p]));
const main = document.querySelector('main'), nav=document.querySelector('nav');
const pageSize = 12;
let s, stopPlot;
const categories = {
  'Risk Curators':'风险管理','Onchain Capital Allocator':'链上资金配置','CDP':'抵押债仓','Chain':'公链',
  'Dexs':'去中心化交易所','Yield':'收益策略','Yield Aggregator':'收益聚合','RWA':'现实资产','Lending':'借贷',
  'Uncollateralized Lending':'无抵押借贷','Derivatives':'衍生品','Basis Trading':'基差交易','Liquidity Manager':'流动性管理',
  'CEX':'中心化交易所','Insurance':'保险','Liquid Staking':'流动性质押','Staking Pool':'质押池','Restaking':'再质押',
  'Stablecoin Wrapper':'稳定币封装','Collateral Markets':'抵押品市场','Governance Incentives':'治理激励',
  'Bridge':'跨链桥','Canonical Bridge':'原生桥','Cross Chain Bridge':'跨链桥（多链）','Payments':'支付',
  'Privacy':'隐私','CeDeFi':'混合金融','Prediction Market':'预测市场','Leveraged Farming':'杠杆策略','Indexes':'指数',
  'Dual-Token Stablecoin':'双代币稳定币','Stablecoin Issuer':'稳定币发行','Collateral Management':'抵押品管理',
  'Options':'期权','Synthetics':'合成资产','AI Agents':'AI 智能体','Restaked BTC':'比特币再质押','Liquid Restaking':'流动性再质押',
  'Token Locker':'代币锁仓','CDP Manager':'债仓管理','Farm':'流动性激励','Launchpad':'发行平台','Algo-Stables':'算法稳定币',
  'Crypto Card Issuer':'加密卡发行','Unclassified':'未分类','Decentralized BTC':'去中心化比特币','NFT Marketplace':'NFT 市场',
  'Options Vault':'期权金库','Interest Rate Derivatives':'利率衍生品','Reserve Currency':'储备货币','Anchor BTC':'锚定比特币',
  'Decentralized AI':'去中心化 AI','OTC Marketplace':'场外市场'
};
const t=(zh,en)=>s.lang==='en'?en:zh;
const e=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const category=p=>p.category||'Unclassified';
const cname=c=>t(categories[c]||c,c);
const f=(n,d=2)=>n.toLocaleString(s.lang==='en'?'en-US':'zh-CN',{maximumFractionDigits:d});
const multiple=n=>n==null?'—':f(n,3)+'×';
const pct=n=>n==null?'—':(n>0?'+':'')+f(n,1)+'%';
const exact=n=>n==null?'—':'$'+f(n,0);
function money(n) {
  if(n==null)return '—';
  const units=s.lang==='en'?[[1e9,'B'],[1e6,'M'],[1e3,'K']]:[[1e8,'亿'],[1e4,'万']];
  for(const [k,suffix] of units)if(Math.abs(n)>=k)return '$'+f(n/k,Math.abs(n/k)>=100?0:Math.abs(n/k)>=10?1:2)+suffix;
  return exact(n);
}
const take=(pair)=>pair[s.lang==='en'?1:0];
const escUri=(p)=>e('#'+new URLSearchParams(p).toString());
function normalized(hash) {
  const params=new URLSearchParams(hash.replace(/^#/,''));
  const get=k=>params.get(k)||'';
  const view=['market','method'].includes(get('view'))?get('view'):'board';
  const scope=(view==='market'?['all','priced','used','unpriced']:['all','official','early']).includes(get('scope'))?get('scope'):'all';
  const validSort=view==='market'?['cap','tvl','week']:['value','tvl','week'];
  return {view,lang:get('lang')==='en'?'en':'zh',q:get('q').slice(0,140),cat:get('cat'),chain:get('chain'),scope,
    sort:validSort.includes(get('sort'))?get('sort'):validSort[0],dir:get('dir')==='asc'?'asc':'desc',
    page:Math.min(999,Math.max(1,parseInt(get('page'),10)||1)),asset:get('asset')};
}
function params(state) {
  const defSort=state.view==='market'?'cap':'value';
  return Object.fromEntries(Object.entries(state).filter(([k,v])=>v && !(k==='scope'&&v==='all') &&
    !(k==='sort'&&v===defSort) && !(k==='page'&&v===1) && !(k==='dir'&&v==='desc')));
}
function link(changes={}) {return escUri(params({...s,...changes}));}
function viewState(view) {return {view,lang:s.lang,q:'',cat:'',chain:'',scope:'all',dir:'desc',sort:view==='market'?'cap':'value',page:1,asset:''};}
function rawHash(changes){return '#'+new URLSearchParams(params({...s,...changes}));}
function change(changes,partial=false) {
  s={...s,...changes};
  history.replaceState(null,'',rawHash({}));
  if(partial) refreshList(); else render();
}
function symbolLink(slug,label) {return `<a class="name-link" href="${link({asset:slug})}">${e(label)}</a>`;}
function shell() {
  const names=[['board',t('候选榜','Radar board')],['market',t('市场参照','Token market')],['method',t('估值方法','Method')]];
  nav.innerHTML=names.map(([v,label])=>`<a href="${escUri(params(viewState(v)))}" ${s.view===v?'class="active" aria-current="page"':''}>${label}</a>`).join('');
  nav.setAttribute('aria-label',t('主导航','Main navigation'));
  document.querySelector('#brand').setAttribute('href','#'+new URLSearchParams(params(viewState('board'))));
  document.querySelector('#lang').textContent=t('EN','中文');document.querySelector('#lang').setAttribute('aria-label',t('Switch to English','切换到中文'));
  document.documentElement.lang=t('zh-CN','en');document.querySelector('#skip').textContent=t('跳到内容','Skip to content');
  document.querySelector('#foot').innerHTML=`<span>DefiLlama · make.fun · ${e(meta.asOf)} UTC</span><span>${t('金额单位为美元。发行与空投资格均未确认。','Amounts in USD. Issuance and airdrop eligibility are unconfirmed.')}</span>`;
}
function hero() {
  return `<section class="hero"><div class="frame hero-grid"><div><div class="snapshot"><span class="dot"></span>DefiLlama &nbsp; / &nbsp; ${t('封存快照','Sealed snapshot')} &nbsp; ${e(meta.asOf)}</div>
    <h1>${t('代币发行雷达','Token launch radar')}</h1><p class="dek">${t('哪些协议在快照中还没有代币记录？按模拟发行市值排序，点开排名可以追溯每一项估值。','Discover protocols with no token on record. Rank them by implied circulating market cap and trace each estimate to its inputs.')}</p>
    <div class="hero-stats">${[[rows.length,t('候选协议','Candidates')],[meta.watch,t('官方观察名单','Official watchlist')],[meta.early,t('门槛以下候选','Below-floor candidates')]].map(([v,l])=>`<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}</div></div>
    <figure class="plotbox"><figcaption class="plot-head"><h2>${t('协议分布','Protocol map')}</h2><span>${t('纵轴 · 7 天锁仓变化','Y · 7-day TVL change')}</span></figcaption>
    <div class="plotwrap"><canvas id="plot" role="img" aria-label="${t('当前筛选的锁仓金额和七天变化散点图，数据可在下方表格中查阅。','TVL and weekly change for the filtered protocols. Each point is also listed in the table.')}"></canvas><span class="plottip" hidden></span></div>
    <div class="plot-footer"><div class="legend"><span><i class="diamond"></i>${t('观察名单','Watchlist')}</span><span><i class="point"></i>${t('门槛以下','Below floor')}</span></div><span>${t('横轴 · 锁仓金额（对数）','X · TVL (log)')}</span></div></figure></div></section>`;
}
function pageTop(title,desc) {
  return `<section class="page-top"><div class="frame"><div class="snapshot"><span class="dot"></span>DefiLlama · ${e(meta.asOf)}</div><h1 class="page-title">${title}</h1><p class="sub">${desc}</p></div></section>`;
}
function option(v,label,selected) {return `<option value="${e(v)}"${v===selected?' selected':''}>${e(label)}</option>`;}
function distinct(items){return [...new Set(items)].sort((a,b)=>a<b?-1:a>b?1:0);}
function select(id,name,items,value,extra='') {
  return `<label class="sr" for="${id}">${name}</label><select id="${id}" class="control-select ${extra}">${items.map(([k,v])=>option(k,v,value)).join('')}</select>`;
}
function scopes() {
  return s.view==='market'?[['all',t('全部','All')],['priced',t('有市值','Priced')],['used',t('估值样本','Model peers')],['unpriced',t('缺市值','Unpriced')]]:
    [['all',t('全部','All')],['official',t('观察名单','Watchlist')],['early',t('门槛以下','Below floor')]];
}
function listShell() {
  const isMarket=s.view==='market', items=isMarket?market:rows;
  const title=isMarket?t('市场参照','Token market'):t('候选协议榜','Candidate board');
  const lead=isMarket?t('查看快照里的代币标识、市值记录，以及哪些协议被选入估值样本。','Inspect recorded token identifiers, observed caps and the sample used to calibrate the model.'):
    t('排名依据为模拟流通市值。选择协议可查看估值算式、参照样本和调研步骤。','Ranked by implied circulating market cap. Open a protocol for its calculation, comparables and paper plan.');
  const cats=distinct(items.map(category)), chains=distinct(items.flatMap(p=>p.chains));
  const leadView=isMarket?pageTop(title,lead):hero();
  const sorts=[[isMarket?'cap':'value',isMarket?t('记录市值','Observed cap'):t('模拟市值','Implied cap')],['tvl',t('锁仓金额','TVL')],['week',t('7 天变化','7-day change')]];
  const sorting=sorts.flatMap(([k,v])=>[['desc',t('高到低','high to low')],['asc',t('低到高','low to high')]].map(([d,l])=>[k+'-'+d,v+' · '+l]));
  return leadView+`<section class="frame workspace"><div class="list-head"><div><h2>${isMarket?t('代币记录','Token records'):title}</h2><p class="sub">${isMarket?t('有代币标识但没有市值的记录单独标记。','Records with an identifier and missing market cap have a separate label.'):lead}</p></div>
    <span class="capsule">${isMarket?meta.peers+' '+t('个估值样本','model peers'):meta.watch+' / '+meta.watch+' '+t('名单覆盖','covered')}</span></div>
    <div class="boardbox"><div class="controls"><label class="search"><span class="sr">${t('搜索协议','Search protocols')}</span><input type="search" id="query" maxlength="140" value="${e(s.q)}" placeholder="${t('搜索名称或协议编号','Search name or protocol ID')}" autocomplete="off"></label>
    ${select('category',t('协议类别','Category'),[['',t('全部类别','All sectors')],...cats.map(c=>[c,cname(c)])],s.cat)}
    ${select('chain',t('所属网络','Network'),[['',t('全部网络','All networks')],...chains.map(c=>[c,c])],s.chain)}
    ${select('sort',t('排序','Sort'),sorting,s.sort+'-'+s.dir,'sort-select')}
    </div><div class="result-line"><div class="chips" id="chips"></div><span class="matches" id="matches" aria-live="polite"></span></div>
    <div class="table-scroll"><table><thead id="head"></thead><tbody id="body"></tbody></table></div><div class="no-result" id="empty" hidden></div><div class="page-controls" id="pages"></div>
    </div></section>`;
}
function selectedList(){
  const isMarket=s.view==='market', q=s.q.trim().toLowerCase();
  const items=(isMarket?market:rows).filter(p=>{
    if(q && ![p.name,p.slug,p.symbol||''].some(v=>v.toLowerCase().includes(q)))return false;
    if(s.cat&&category(p)!==s.cat || s.chain&&!p.chains.includes(s.chain))return false;
    if(s.scope==='official')return p.official;if(s.scope==='early')return !p.official;
    if(s.scope==='used')return p.used;if(s.scope==='priced')return p.mcap_usd>0;if(s.scope==='unpriced')return !(p.mcap_usd>0);
    return true;
  });
  const field={value:'implied_value_usd',cap:'mcap_usd',tvl:'tvl_usd',week:'change_7d'}[s.sort];
  items.sort((a,b)=>{
    const av=a[field],bv=b[field];
    if(av==null&&bv!=null)return 1;if(bv==null&&av!=null)return -1;
    const diff=(av??0)-(bv??0);
    return (s.dir==='desc'?-diff:diff) || ((a.rank??0)-(b.rank??0)) || (a.slug<b.slug?-1:a.slug>b.slug?1:0);
  });
  return items;
}
function sortable(key,label,cls) {
  const active=s.sort===key;
  return `<th scope="col" class="${cls}"${active?' aria-sort="'+(s.dir==='desc'?'descending':'ascending')+'"':''}><button data-sort="${key}">${label} ${active?(s.dir==='desc'?'↓':'↑'):'↕'}</button></th>`;
}
function refreshList() {
  const isMarket=s.view==='market', items=selectedList(), all=isMarket?market:rows;
  const nPages=Math.max(1,Math.ceil(items.length/pageSize));
  if(s.page>nPages){s.page=nPages;history.replaceState(null,'',rawHash({}));}
  const start=(s.page-1)*pageSize;
  document.querySelector('#chips').innerHTML=scopes().map(([k,label])=>`<button type="button" class="chip ${s.scope===k?'current':''}" data-scope="${k}" aria-pressed="${s.scope===k}">${label}</button>`).join('');
  const count=`${items.length} / ${all.length} ${t('个协议','protocols')}`;
  document.querySelector('#matches').textContent=count;
  document.querySelector('#sort').value=s.sort+'-'+s.dir;
  document.querySelector('#head').innerHTML=`<tr><th class="rank-head" scope="col">${isMarket?'':t('排名','Rank')}</th><th scope="col">${t('协议','Protocol')}</th>
    <th class="hide-md" scope="col">${t('网络','Network')}</th>${sortable('tvl',t('锁仓金额','TVL'),'num hide-sm')}
    ${sortable('week',t('7 天','7D'),'num')}${sortable(isMarket?'cap':'value',isMarket?t('记录市值','Market cap'):t('模拟市值','Implied cap'),'num')}
    <th class="hide-sm" scope="col">${t('来源','Status')}</th><th class="open-cell" scope="col"><span class="sr">${t('详情','Detail')}</span></th></tr>`;
  document.querySelector('#body').innerHTML=items.slice(start,start+pageSize).map(p=>{
    const badge=isMarket?p.used?t('估值样本','Model peer'):p.mcap_usd>0?t('有市值','Priced'):t('缺市值','No cap'):p.official?t('观察名单','Watchlist'):t('门槛以下','Below floor');
    const network=p.chains.length?e(s.chain||p.chains[0])+(p.chains.length>1?' +'+(p.chains.length-1):''):'—';
    const val=isMarket?p.mcap_usd:p.implied_value_usd;
    return `<tr><td class="rank">${isMarket?'·':String(p.rank).padStart(2,'0')}</td><td class="name-cell">${symbolLink(p.slug,p.name)}<div class="meta">${e(cname(category(p)))}${isMarket&&p.symbol?' · '+e(p.symbol):''}</div></td>
    <td class="chain-cell hide-md">${network}</td><td class="num hide-sm" title="${exact(p.tvl_usd)}">${money(p.tvl_usd)}</td>
    <td class="num ${p.change_7d==null?'unknown':p.change_7d>=0?'up':'down'}">${pct(p.change_7d)}</td><td class="num emval" title="${exact(val)}">${money(val)}</td>
    <td class="hide-sm"><span class="tag ${p.official?'watch':''}">${badge}</span></td><td class="open-cell"><a class="open-link" aria-label="${e(t('打开 ','Open ')+p.name)}" href="${link({asset:p.slug})}">›</a></td></tr>`;
  }).join('');
  const empty=document.querySelector('#empty');empty.hidden=!!items.length;
  if(!items.length)empty.innerHTML=`<h3>${t('没有匹配的协议','No matching protocols')}</h3><button class="plainbtn" data-reset>${t('清除筛选','Clear filters')}</button>`;
  document.querySelector('#pages').innerHTML=`<span>${items.length?start+1:0}–${Math.min(start+pageSize,items.length)} / ${items.length}</span><div class="pager"><button data-page="-1" ${s.page<=1?'disabled':''} aria-label="${t('上一页','Previous page')}">‹</button><span>${s.page}/${nPages}</span><button data-page="1" ${s.page>=nPages?'disabled':''} aria-label="${t('下一页','Next page')}">›</button></div>`;
  if(stopPlot){stopPlot();stopPlot=null;}
  if(!isMarket&&rows.length)stopPlot=window.paintRadar(document.querySelector('#plot'),items,rows,t,money,slug=>{location.hash=rawHash({asset:slug});});
}

function crumb(){
  const label=s.view==='market'?t('市场参照','Token market'):t('候选榜','Radar board');
  return `<div class="crumb"><a href="${link({asset:''})}">← ${label}</a><span>/</span><span>${t('协议详情','Protocol detail')}</span></div>`;
}
function line(label,value,hint='',sum=false) {
  return `<div class="formula-row${sum?' sum':''}"><span>${e(label)}${hint?'<small>'+e(hint)+'</small>':''}</span><b>${e(value)}</b></div>`;
}
function identifierBlock(p) {
  return `<section class="panel"><h2>${t('快照原始字段','Snapshot evidence')}</h2>
    ${line(t('协议编号','Protocol ID'),p.slug)}${line(t('代币代码','Ticker'),p.symbol||'—')}${line('CoinGecko ID',p.gecko_id||'—')}
    ${line(t('记录市值','Observed cap'),exact(p.mcap_usd))}
    <p class="note">${t('数据收录日','First tracked')}: ${e(p.listed_at||'—')} · ${t('网络','Networks')}: ${e(p.chains.join(', ')||'—')}</p></section>`;
}
function detail(p) {
  const m=p.model, item=p.official?t('官方观察名单','Official watchlist'):t('门槛以下候选','Below-floor candidate');
  const band=p.low_usd===null?'—':money(p.low_usd)+' – '+money(p.high_usd);
  const evidence=m.count?t('同类别样本','Same-sector peers')+' · '+m.count:t('无同类别样本，采用全市场','Pooled sample (no same-sector peers)');
  const nHint=m.count?t('类别权重 ','Sector weight ')+f(100*m.weight,1)+'%':t('使用全市场中位数','Uses the pooled median');
  const marketRows=p.peers.map(slug=>marketBySlug.get(slug)).filter(Boolean);
  return `<div class="frame detail-page">${crumb()}<section class="detail-heading"><div>
    <div class="snapshot"><span class="dot"></span>${t('候选排名','Candidate rank')} #${p.rank} / ${rows.length} &nbsp;·&nbsp; ${item}</div>
    <h1 class="page-title">${e(p.name)}</h1><p class="sub">${e(cname(category(p)))} · ${e(p.chains.slice(0,3).join(' / ')||'—')}${p.chains.length>3?' +'+(p.chains.length-3):''}</p></div>
    <div class="head-value"><div class="micro">${t('模拟流通市值','Implied circulating cap')} · USD</div><div class="big-num">${money(p.implied_value_usd)}</div>
    <p class="sub">${t('按留一误差换算的参考范围','Range using held-out errors')} &nbsp; ${band}</p></div></section>
    <div class="detail-grid"><section class="panel"><div class="pane-head"><h2>${t('估值怎么算','Valuation bridge')}</h2><span class="tag">${evidence}</span></div>
    ${line(t('锁仓金额','Locked value'),exact(p.tvl_usd),'TVL')}
    ${line(t('可比协议倍数','Peer multiple'),multiple(m.multiple),nHint)}
    ${line(t('规模修正','Size adjustment'),multiple(m.size),'β = '+f(meta.beta,3))}
    ${line(t('七天变化修正','Momentum adjustment'),multiple(m.growth),p.change_7d==null?t('变化缺失，取中性值','Missing change, neutral'):pct(p.change_7d))}
    ${line(t('收录时长修正','Age adjustment'),multiple(m.maturity),m.age==null?t('收录日期缺失','Tracking date missing'):m.age+' '+t('天','days'))}
    ${line(t('乘积，取整到美元','Product, rounded to USD'),exact(p.implied_value_usd),'',true)}
    <h3 class="minor-head">${t('按锁仓规模最接近的参照','Nearest peers by TVL')}</h3>
    ${marketRows.map(a=>`<div class="peer-row"><a href="${link({asset:a.slug})}">${e(a.name)}</a><span class="tabular">${t('市值 / TVL','Cap / TVL')} ${multiple(a.mcap_usd/a.tvl_usd)}</span></div>`).join('')||'—'}
    <p class="note">${t('参考范围取自有市值样本的横截面误差，未来发行可能落在范围之外。','The range uses cross-sectional errors on priced tokens. Future launches can fall outside it.')}</p></section>
    <section class="panel"><div class="pane-head"><h2>${t('纸上调研计划','Paper farm plan')}</h2><span class="tag">${t('实际支出','Actual spend')} $0</span></div>
    <ol class="plan">${p.plan.map(step=>`<li><div class="steptitle"><h3>${e(take(step.title))}</h3><span>~${step.minutes} ${t('分钟','min')}</span></div><p>${e(take(step.text))}</p></li>`).join('')}</ol>
    <p class="note">${t('快照未提供积分计划、发币日期或空投资格。'+p.plan.length+'步都可以用公开资料和虚拟记录完成。','The snapshot supplies no points program, launch date or claim criteria. All '+p.plan.length+' steps use public records and paper balances.')}</p></section>
    ${identifierBlock(p)}
    <section class="panel"><h2>${t('入选依据','Why it is on the board')}</h2><p class="sub">${p.official?t('这项协议列在官方观察名单中。主办方在制作快照时核查过母协议字段及封装、质押、桥接等筛选条件。','The sealed official watchlist includes this protocol. Its upstream selection checked parent protocol, wrapper, staking and bridge flags.'):
    t('它低于官方观察门槛，且未记录代币代码、CoinGecko 标识或市值。程序按名称、类别与已记录的代币家族做了二次筛选。快照没有母协议字段，归属仍需复核。','It falls below the watch floor, with no ticker, CoinGecko ID or market cap. Name, category and token-family screens passed. The snapshot omits parent links, so affiliation still needs verification.')}</p>
    <p class="note">${e(meta.asOf)} UTC · ${t('观察门槛','Watch floor')} ${money(meta.floor)} TVL</p><a class="panel-foot" href="${escUri(params(viewState('method')))}">${t('查看样本与误差检验','View model validation')} →</a></section></div></div>`;
}
function marketDetail(p) {
  const value=p.mcap_usd>0?money(p.mcap_usd):'—';
  return `<div class="frame detail-page">${crumb()}<section class="detail-heading"><div><div class="snapshot"><span class="dot"></span>${t('市场代币记录','Recorded token')} · ${e(meta.asOf)}</div><h1 class="page-title">${e(p.name)}</h1><p class="sub">${e(cname(category(p)))} · ${e(p.symbol||p.gecko_id||'—')}</p></div>
    <div class="head-value"><div class="micro">${t('快照记录的流通市值','Recorded circulating market cap')} · USD</div><div class="big-num">${value}</div>
    <p class="sub">${p.used?t('用于估计候选协议的可比倍数','Included in peer calibration'):t('此条记录未用于估计候选协议的可比倍数','Outside the model calibration sample')}</p></div></section>
    <div class="detail-grid">${identifierBlock(p)}<section class="panel"><h2>${t('可比数据','Market observations')}</h2>
    ${line(t('锁仓金额','Locked value'),exact(p.tvl_usd))}${line(t('七天变化','7-day move'),pct(p.change_7d))}${line(t('市值 / 锁仓金额','Market cap / TVL'),p.mcap_usd>0?multiple(p.mcap_usd/p.tvl_usd):'—')}
    <p class="note">${t('模型样本要求正市值、可识别的代币和正锁仓额，剔除交易所、封装或衍生产品及版本记录，并按代币去重。','Calibration requires a positive cap, identifiable token and positive TVL. Product, exchange and version screens are applied before deduplicating by token.')}</p></section></div></div>`;
}
function methodology(){
  const v=meta.validation, excluded=Object.values(meta.excluded).reduce((a,b)=>a+b,0);
  const composition=[[t('官方观察名单','Official watchlist'),meta.watch],[t('门槛以下候选','Below-floor candidates'),meta.early],[t('已有代币记录','With a token record'),meta.market],[t('其余未入榜','Other screened records'),excluded]];
  const title=t('估值方法','Inside the model');
  return pageTop(title,t('所有估值使用同一份封存快照。每个输入、样本量和误差都可以复算。','Every estimate uses the same sealed snapshot. Inputs, sample sizes and errors can all be reproduced.'))+
    `<div class="frame method-page"><div class="method-grid"><section class="method-card"><h2>${t('误差有多大？','How wide is the error?')}</h2>
    <div class="validation"><div><b class="large">${v.error==null?'—':f(v.error,2)+'×'}</b><small>${t('模型典型误差','Model median error factor')}</small></div><div><b class="large">${v.baseline==null?'—':f(v.baseline,2)+'×'}</b><small>${t('仅用锁仓金额的基线','TVL-only baseline')}</small></div></div>
    <p>${t('把 '+v.count+' 个有市值的样本逐个拿出来，用其余样本重新拟合，再用估值对照被拿出的真实市值。每项误差取“较大者 ÷ 较小者”，最后取中位数。','Hold out each of '+v.count+' priced peers in turn. Refit the full model on the others, then compare its estimate with the omitted cap. The statistic is the median of larger ÷ smaller.')}</p>
    <h3>${t('怎样读范围','Reading the range')}</h3><p>${t('逐个留出时，真实市值 ÷ 估值的第 10、90 百分位用于生成参考区间。它描述同一时点已发行资产的误差。未来发行价格和个人收益仍然未知。','The 10th and 90th percentiles of held-out observed / estimated cap scale the reference range. It measures same-date errors on existing assets. Future launches and individual returns remain unknown.')}</p></section>
    <section class="method-card"><h2>${t('协议如何入选','Coverage and exclusions')}</h2><div class="coverage-line" aria-hidden="true">${composition.map(([,n])=>`<i style="width:${100*n/meta.total}%"></i>`).join('')}</div>
    <ul class="meth-list">${composition.map(([l,n])=>`<li><span>${l}</span><b>${n}</b></li>`).join('')}</ul>
    <p>${t('共 '+meta.total+' 条记录。低于 '+money(meta.floor)+' TVL 的协议，要同时缺少代币代码、CoinGecko ID 和市值，并通过类别、版本、封装及已知代币家族筛查。名单外的母协议关系无法逐项验证。','Across '+meta.total+' records, a below-'+money(meta.floor)+' TVL candidate needs a missing ticker, CoinGecko ID and market cap. Category, version, product-name and known-token-family checks follow. Parent links are unavailable outside the official list.')}</p></section>
    <section class="method-card"><h2>${t('从可比市值推算','From observed caps to estimates')}</h2>
    <h3>${t('规模与可比倍数','Size and peer multiples')}</h3>
    <p>${t('取锁仓相差至少两倍的样本对，计算“市值对数差 ÷ 锁仓对数差”，取中位数，限制在 0.25 至 1。由此得到规模弹性 β = '+f(meta.beta,3)+'。把所有样本倍数归一到锁仓中位数 '+money(meta.pivot)+'，再混合类别与全市场的对数中位数。','Across pairs at least 2× apart in TVL, take the median log-cap difference / log-TVL difference and bound it to 0.25–1. This gives size elasticity β = '+f(meta.beta,3)+'. Normalize each cap/TVL ratio to median TVL ('+money(meta.pivot)+'), then blend sector and pooled log medians.')}</p>
    <p>${t('类别有 n 个样本时，类别权重为 n/(n+6)。缺少同类别样本时使用全部样本。规模修正为 (协议锁仓 / 样本锁仓中位数)^(β−1)。','For n same-sector peers, the sector weight is n/(n+6). Empty sectors use the pooled median. Size adjustment is (protocol TVL / median peer TVL)^(β−1).')}</p></section>
    <section class="method-card"><h2>${t('增长、时长与缺失值','Growth, age and missing data')}</h2>
    <p>${t('估值 = TVL × 可比倍数 × 规模修正 × 七天变化修正 × 收录时长修正。金额四舍五入到美元。','Implied cap = TVL × peer multiple × size adjustment × momentum × age adjustment, rounded to a whole dollar.')}</p>
    <h3>${t('七天变化','7-day change')}</h3><p>${t('把变化率限制在 −50% 到 +50% 之间，每个百分点让估值变动 0.2%。缺失时倍率为 1。分布图的纵轴边缘显示超出 ±40% 的值，列表保留原值。','Clamp weekly change to ±50%. Each percentage point moves the estimate by 0.2%. Missing change gives a factor of 1. Map points beyond ±40% sit on its edge. The table keeps the actual changes.')}</p>
    <h3>${t('收录时长','Days tracked')}</h3><p>${t('从被收录首日起，倍率在第一年内从 0.85 线性增长到 1，此后保持为 1。缺日期按 182.5 天计算。','From the first tracking date, the factor rises linearly from 0.85 to 1 over 365 days, then stays at 1. A missing date uses 182.5 days.')}</p></section></div></div>`;
}
function render() {
  if(stopPlot){stopPlot();stopPlot=null;}shell();
  const found=candidateBySlug.get(s.asset)||marketBySlug.get(s.asset);
  if(s.asset && !found) {
    main.innerHTML=`<div class="frame detail-page">${crumb()}<h1>${t('快照中没有这个协议','Protocol absent from this snapshot')}</h1></div>`;
  } else if(found) main.innerHTML=candidateBySlug.has(s.asset)?detail(found):marketDetail(found);
  else if(s.view==='method')main.innerHTML=methodology();
  else {main.innerHTML=listShell();refreshList();}
  document.title=(found?found.name:s.view==='market'?t('市场参照','Token market'):s.view==='method'?t('估值方法','Method'):t('代币发行雷达','Token launch radar'))+' · Launch Atlas';
}
document.querySelector('#lang').addEventListener('click',()=>change({lang:t('en','zh')}));
document.querySelector('#skip').addEventListener('click',ev=>{ev.preventDefault();main.focus();});
main.addEventListener('input',ev=>{if(ev.target.id==='query')change({q:ev.target.value,page:1},true);});
main.addEventListener('change',ev=>{
  const id=ev.target.id, value=ev.target.value;
  if(id==='category'||id==='chain')change({[id==='category'?'cat':'chain']:value,page:1},true);
  if(id==='sort'){const [sort,dir]=value.split('-');change({sort,dir,page:1},true);}
});
main.addEventListener('click',ev=>{
  const b=ev.target.closest('button');if(!b)return;
  if('scope' in b.dataset){change({scope:b.dataset.scope,page:1},true);document.querySelector('[data-scope="'+s.scope+'"]').focus({preventScroll:true});}
  if('sort' in b.dataset)change({sort:b.dataset.sort,dir:s.sort===b.dataset.sort&&s.dir==='desc'?'asc':'desc',page:1},true);
  if('page' in b.dataset){change({page:s.page+Number(b.dataset.page)},true);document.querySelector('.list-head').scrollIntoView({block:'start'});}
  if('reset' in b.dataset)change(viewState(s.view));
});
window.addEventListener('hashchange',()=>{s=normalized(location.hash);render();window.scrollTo(0,0);});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&s.asset)location.hash=rawHash({asset:''});});
s=normalized(location.hash);render();

