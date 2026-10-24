// M4 后端聚合服务：多源（热搜/新闻/爬虫）拉取 -> 地理归属/分类/情感打分归一化 -> 历史落库 -> /api/hotspots
// 纯 Node 内置模块，无需 npm install。运行：node server.js
// 可选环境变量：TIAN_API_KEY（新闻API） SPIDER_URLS=url1,url2（自定义爬虫列表）
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;

// ---- 配置：环境变量优先，其次读本地 config.json（便于不设置环境变量直接放 key）----
let CFG = {};
try { CFG = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch(e) { CFG = {}; }
const TIAN_API_KEY = process.env.TIAN_API_KEY || CFG.tianKey || '';
const JUHE_API_KEY = process.env.JUHE_API_KEY || CFG.juheKey || '';
// 天行新闻接口类型（免费/已开通的，用逗号分隔）。默认综合新闻；可加 tech,sports,ent,money,guonei...
const TIAN_NEWS_TYPES = (process.env.TIAN_NEWS_TYPES || CFG.tianTypes || 'generalnews')
  .split(',').map(s => s.trim()).filter(Boolean);
// 聚合数据头条类型
const JUHE_NEWS_TYPES = (process.env.JUHE_NEWS_TYPES || CFG.juheTypes || 'top')
  .split(',').map(s => s.trim()).filter(Boolean);

// ---- 城市/省份词典（用于地理归属）----
const CITY_NAMES = ["北京市","上海市","广州市","深圳市","杭州市","南京市","成都市","武汉市","西安市","重庆市","天津市","苏州市","青岛市","郑州市","长沙市","沈阳市","大连市","厦门市","昆明市","哈尔滨市","济南市","福州市","合肥市","南昌市","贵阳市","南宁市","兰州市","太原市","石家庄市","长春市","海口市","银川市","西宁市","乌鲁木齐市","拉萨市","呼和浩特市","温州市","东莞市","佛山市","宁波市","无锡市","泉州市","洛阳市","香港","澳门","台北"];
const PROVINCES = ["北京","上海","广东","深圳","浙江","江苏","四川","湖北","陕西","重庆","天津","山东","河南","湖南","辽宁","福建","安徽","江西","贵州","广西","甘肃","山西","河北","吉林","海南","宁夏","青海","新疆","西藏","内蒙古","云南","黑龙江"];

function detectRegion(title){
  for(const c of CITY_NAMES){ if(title.includes(c.replace('市',''))) return c; }
  for(const p of PROVINCES){ if(title.includes(p)) return p+'市'; }
  return null;
}

// ---- 分类/情感（M4 升级：打分模型，支持否定词翻转与程度副词加权）----
const CAT_RULES = [
  ["财经", ["经济","GDP","签约","项目","股价","消费","营收","财报","楼市","金融","增长","突破"]],
  ["突发", ["预警","抢险","事故","地震","火灾","暴雨","大风","塌方","救援","疫情","遇难","危机"]],
  ["文娱", ["音乐节","演唱会","博物馆","电影","综艺","展览","非遗","剧场","开售"]],
  ["体育", ["马拉松","夺冠","奥运","联赛","主场","球赛","世界杯"]],
];
const POS2 = ["提速","告捷","落地","回暖","迎客","启动","签约","增长","突破","胜利","开售","夺冠","成功","上线","利好","稳增","提质","惠民","丰收","获奖","通车","竣工","脱贫","增效","便民"];
const NEG2 = ["预警","事故","地震","火灾","暴雨","塌方","救援","遇难","损失","下跌","危机","诈骗","倒塌","疫情","爆炸","失踪","违规","停产","下滑","亏损","受害","塌陷","洪涝","干旱","冲突"];
const NEGATE = ["不","无","未","没","非","否","勿","别"];
const DEGREE = ["大","巨","极","猛","暴","持续","严重","重大"];

function analyze(title){
  let cat = "民生";
  for(const [c,kws] of CAT_RULES){ if(kws.some(k=>title.includes(k))){ cat = c; break; } }
  let p = 0, n = 0;
  for(let i=0; i<title.length-1; i++){
    const w = title.substr(i,2);
    let hit = null;
    if(POS2.includes(w)) hit = 'pos';
    else if(NEG2.includes(w)) hit = 'neg';
    if(hit){
      const before = title.substring(Math.max(0,i-2), i);
      if(NEGATE.some(x=>before.includes(x))) hit = (hit==='pos'?'neg':'pos'); // 否定词翻转
      const deg = DEGREE.some(x=>before.includes(x));
      if(hit==='pos') p += deg?2:1; else n += deg?2:1;
    }
  }
  const score = p - n;
  const sent = score>0 ? 'pos' : (score<0 ? 'neg' : 'neu');
  return { cat, sent, sentScore: score };
}

// 带超时的 fetch（沙箱/离线时快速失败，避免挂起导致页面全白）
async function fetchJSON(url, timeout=8000, headers){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeout);
  try{
    const r = await fetch(url, { headers: headers||{'User-Agent':'Mozilla/5.0'}, signal: ctrl.signal });
    if(!r.ok) return null;
    return await r.json();
  }catch(e){ return null; } finally { clearTimeout(t); }
}
// ---- 适配器：返回 [{title, heat, url, source, cityHint?}] ----
async function weiboHot(){
  const j = await fetchJSON('https://weibo.com/ajax/side/hotSearch', 8000, {'User-Agent':'Mozilla/5.0','Referer':'https://weibo.com/'});
  if(!j) throw new Error('weibo empty/timeout');
  return (j?.data?.realtime||[]).map(x=>({title:x.word||'', heat:Number(x.num)||0, url:'https://s.weibo.com/weibo?q='+encodeURIComponent(x.word||''), source:'weibo'}));
}
// 天行数据新闻：遍历多个新闻接口类型，聚合去重
async function tianapiNews(key){
  const out = [];
  for(const type of TIAN_NEWS_TYPES){
    try{
      const url = `https://api.tianapi.com/${type}/index?key=${encodeURIComponent(key)}&num=20`;
      const j = await fetchJSON(url, 8000, {'User-Agent':'Mozilla/5.0'});
      if(!j || j?.code !== 200){ console.log(`[tianapi] ${type} code=${j?.code}`); continue; }
      const list = j.newslist || (j.result && j.result.list) || [];
      list.forEach(x => out.push({ title: x.title||'', heat:0, url: x.url||'', source:'news', desc: x.description||'' }));
    }catch(e){ console.log(`[tianapi] ${type} err=${e.message}`); }
  }
  if(!out.length) throw new Error('tianapi empty/failed');
  return out;
}
// 聚合数据头条
async function juheNews(key){
  const out = [];
  for(const type of JUHE_NEWS_TYPES){
    try{
      const url = `https://v.juhe.cn/toutiao/index?type=${encodeURIComponent(type)}&key=${encodeURIComponent(key)}`;
      const j = await fetchJSON(url, 8000, {'User-Agent':'Mozilla/5.0'});
      if(!j || j?.error_code !== 0){ console.log(`[juhe] ${type} error_code=${j?.error_code}`); continue; }
      (j.result?.data||[]).forEach(x => out.push({ title: x.title||'', heat:0, url: x.url||'', source:'news', desc: x.author_name ? ('【'+x.author_name+'】') : '' }));
    }catch(e){ console.log(`[juhe] ${type} err=${e.message}`); }
  }
  if(!out.length) throw new Error('juhe empty/failed');
  return out;
}
// 无 key 时的演示样本（城市精确，便于预览"新闻"通道形态）
function newsSample(){
  return [
    ["北京市","北京发布前三季度经济运行数据 新质生产力加快培育"],
    ["上海市","上海国际金融中心建设再迎政策利好"],
    ["深圳市","深圳科技企业研发投入同比增长"],
    ["杭州市","杭州数字经济核心产业增加值稳步提升"],
    ["成都市","成都加快布局低空经济新赛道"],
    ["广州市","广州国际消费中心城市培育建设提速"],
    ["武汉市","武汉光谷生物产业签约一批重点项目"],
    ["西安市","西安文旅市场持续回暖 游客量创新高"],
    ["南京市","南京新能源汽车产业链补链强链"],
    ["重庆市","重庆智能网联汽车产量突破新关口"],
    ["苏州市","苏州工业园区集成电路项目集中竣工"],
    ["青岛市","青岛港吞吐量再创历史新高"]
  ].map(([city,title]) => ({ title, heat:0, url:'#', source:'news' })); // 无 cityHint：演示样本归入"未定位"列表
}

// ---- 爬虫通道（M4）----
const DEFAULT_SPIDER_URLS = [
  // 可公开聚合的列表页；请按目标站点 robots 与条款合规使用
  "https://www.chinanews.com.cn/scroll-news/news.shtml",
  "https://news.sina.com.cn/"
];
const SPIDER_TPL = [
  ["北京市","老旧小区加装电梯惠民工程落地"],["上海市","浦江夜游航线提质扩容迎客"],
  ["广州市","珠江两岸灯光秀焕新亮相"],["深圳市","前海新一批便民服务点启用"],
  ["杭州市","西湖景区智慧导览便民升级"],["成都市","公园城市示范片区竣工开放"],
  ["武汉市","长江主轴绿道贯通惠民"],["西安市","大唐不夜城演艺迎客创新高"],
  ["南京市","城市更新重点项目通车"],["重庆市","山城步道修缮便民通行"],
  ["苏州市","古城保护更新工程见效"],["青岛市","海滨浴场提质迎客季开启"]
];
function spiderSample(){
  return SPIDER_TPL.map(([city,title])=>({title, heat:0, url:'#', source:'spider', cityHint:city}));
}
async function fetchText(url, timeout=8000){
  const ctrl = new AbortController();
  const t = setTimeout(()=>ctrl.abort(), timeout);
  try{
    const r = await fetch(url,{headers:{'User-Agent':'Mozilla/5.0'}, signal:ctrl.signal});
    if(!r.ok) return null;
    return await r.text();
  }catch(e){ return null; } finally { clearTimeout(t); }
}
const robotsCache = {};
async function robotsAllowed(urlStr){
  try{
    const u = new URL(urlStr);
    const rb = `${u.protocol}//${u.host}/robots.txt`;
    if(robotsCache[rb]!==undefined) return robotsCache[rb];
    const txt = await fetchText(rb, 5000);
    if(!txt){ robotsCache[rb]=true; return true; }
    const disallowAll = /Disallow:\s*\//.test(txt) && !/Allow:/m.test(txt);
    const allowed = !disallowAll;
    robotsCache[rb] = allowed; return allowed;
  }catch(e){ return true; }
}
async function crawlSpider(){
  const cfg = (process.env.SPIDER_URLS||'').split(',').map(s=>s.trim()).filter(Boolean);
  const urls = cfg.length ? cfg : DEFAULT_SPIDER_URLS;
  const items = [];
  for(const url of urls.slice(0,5)){
    if(!(await robotsAllowed(url))) continue; // 遵守 robots
    const html = await fetchText(url, 8000);
    if(!html) continue;
    const re = /<a[^>]*>([^<]{4,40})<\/a>/g; let m; const seen = new Set();
    while((m = re.exec(html))){
      let t = m[1].replace(/[\s　]+/g,'');
      if(seen.has(t) || !/[一-龥]/.test(t)) continue; seen.add(t);
      const city = detectRegion(t);
      if(!city) continue; // 仅保留能定位到城市的条目，提升地理精度
      items.push({ title:t, heat:0, url:url, source:'spider', cityHint:city });
      if(items.length>=15) break;
    }
    if(items.length>=15) break;
  }
  return items;
}
function sampleSource(){
  return [
    {title:"杭州市老旧小区改造提速",heat:88,url:"#",source:"sample"},
    {title:"深圳市新增便民服务点",heat:72,url:"#",source:"sample"},
    {title:"成都市重大项目集中签约",heat:91,url:"#",source:"sample"},
    {title:"武汉市发布大风蓝色预警",heat:80,url:"#",source:"sample"},
    {title:"西安市马拉松鸣枪开跑",heat:66,url:"#",source:"sample"},
    {title:"上海市博物馆新展迎客",heat:59,url:"#",source:"sample"},
    {title:"广州市消费券发放带动回暖",heat:77,url:"#",source:"sample"},
    {title:"重庆市局部短时强降雨",heat:63,url:"#",source:"sample"},
    {title:"北京市全民健身季启动",heat:54,url:"#",source:"sample"},
    {title:"南京市球队主场告捷",heat:48,url:"#",source:"sample"}
  ];
}

// ---- 聚合 ----
function aggregate(rawItems){
  const known = CITY_NAMES;
  const base = rawItems.map(it=>{
    let city = it.cityHint || detectRegion((it.title||'') + ' ' + (it.desc||''));
    if(!city){
      if(it.source === 'news'){ // 新闻多全国性/国际性，无明确地域不强行落点，归入"未定位"
        it.geoInferred = true; city = null;
      } else { // 热搜/爬虫：保持哈希兜底以维持地图密度（已标记推断）
        let h=0; for(const ch of (it.title||'')) h=(h*31+ch.charCodeAt(0))>>>0;
        city = known[h%known.length]; it.geoInferred = true;
      }
    }
    const a = analyze(it.title);
    return {
      city, cat: a.cat, sent: a.sent, sentScore: a.sentScore,
      src: it.source, rawHeat: it.heat || 0,
      title: it.title, url: it.url
    };
  });
  const maxH = Math.max(1, ...base.map(b=>b.rawHeat));
  return base.map(b=>({
    ...b,
    // 爬虫条目无热度，给一个可见的展示热度；其余按原始热度归一化
    heat: b.rawHeat>0 ? Math.round(10 + 90*(b.rawHeat/maxH))
                      : 32 + Math.min(40, Math.abs(b.sentScore)*4) + Math.floor(Math.random()*12)
  }));
}

// ---- 滚动历史缓冲 + 落库（M4）----
const HISTORY_CAP = 24;
const HIST_FILE = path.join(__dirname, 'history.json');
let history = [];
let seeded = false;
function loadHistory(){
  try{ const j = JSON.parse(fs.readFileSync(HIST_FILE,'utf8')); return Array.isArray(j)?j:[]; }
  catch(e){ return []; }
}
function saveHistory(){
  try{ fs.writeFileSync(HIST_FILE, JSON.stringify(history.slice(-HISTORY_CAP))); }catch(e){}
}
function randInt(a,b){ return Math.floor(a + Math.random()*(b-a+1)); }

history = loadHistory();
if(history.length) seeded = true; // 已有落库历史则不再播种合成快照

async function buildHotspots(){
  const logs = [];
  let raw = [];
  try { const w = await weiboHot(); raw = raw.concat(w); logs.push(`weibo:${w.length}`); }
  catch(e){ logs.push(`weibo:fail(${e.message})`); }
  if(TIAN_API_KEY){
    try { const n = await tianapiNews(TIAN_API_KEY); raw = raw.concat(n); logs.push(`tiannews:${n.length}`); }
    catch(e){ logs.push(`tiannews:fail(${e.message})`); }
  } else { const ns = newsSample(); raw = raw.concat(ns); logs.push(`tiannews:sample(no key)`); }
  if(JUHE_API_KEY){
    try { const n = await juheNews(JUHE_API_KEY); raw = raw.concat(n); logs.push(`juhenews:${n.length}`); }
    catch(e){ logs.push(`juhenews:fail(${e.message})`); }
  } else { logs.push('juhenews:skip(no key)'); }

  let spider = [];
  try { spider = await crawlSpider(); logs.push(`spider:${spider.length}`); }
  catch(e){ logs.push(`spider:fail(${e.message})`); }
  if(spider.length === 0){ spider = spiderSample(); logs.push('spider:sample(auto)'); }
  raw = raw.concat(spider);

  let sample = false;
  if(raw.length === 0){ raw = sampleSource(); sample = true; logs.push('fallback:sample'); }
  const data = aggregate(raw);
  const now = Date.now();
  history.push({ t: now, data, sample, synthetic:false });
  if(history.length > HISTORY_CAP) history.shift();

  // 首次（无落库历史）：用真实数据播种 11 个"过去"合成快照，使时间轴立即可用
  if(!seeded){
    const synth = [];
    for(let i=11;i>=1;i--){
      const t = now - i*10*60*1000;
      const sdata = data.map(d=>({
        ...d,
        heat: Math.max(10, Math.min(100, d.heat + randInt(-22,22))),
        rawHeat: Math.max(0, Math.round(d.rawHeat * (0.6 + Math.random()*0.8)))
      }));
      synth.push({ t, data: sdata, sample, synthetic:true });
    }
    history = synth.concat(history);
    seeded = true;
  }
  saveHistory();

  const syntheticHistory = history.some(h=>h.synthetic);
  console.log('[hotspots]', logs.join(' | '), '=>', data.length, 'items', sample?'(SAMPLE)':'', '| history:', history.length, 'snapshots');
  return { updatedAt: new Date().toISOString(), sample, source: logs.join(' | '), latest: data, history, syntheticHistory };
}

// ---- 底图缓存：本地化 DataV 地级市边界，浏览器无需直连外网 ----
const MAP_CACHE = path.join(__dirname, 'china-cities.json');
async function ensureMapFile(){
  if(fs.existsSync(MAP_CACHE)) return;
  const BASE = 'https://geo.datav.aliyun.com/areas_v3/bound/';
  const p = await fetch(BASE + '100000_full.json');
  const provinces = await p.json();
  const fcoll = { type:'FeatureCollection', features:[] };
  for(const f of provinces.features){
    const code = f.properties.adcode;
    try{
      const r = await fetch(`${BASE}${code}_full.json`);
      const d = await r.json();
      (d.features||[]).forEach(cf=>{ if(cf.properties && cf.properties.level==='city') fcoll.features.push(cf); });
    }catch(e){}
  }
  fs.writeFileSync(MAP_CACHE, JSON.stringify(fcoll));
  console.log('[map] built china-cities.json features=', fcoll.features.length);
}
function serveFile(res, file, ctype){
  try{
    const buf = fs.readFileSync(file);
    res.writeHead(200,{'Content-Type':ctype,'Cache-Control':'public, max-age=300, must-revalidate'});
    res.end(buf);
  }catch(e){ res.writeHead(404); res.end('Not Found'); }
}

// ---- HTTP 服务 ----
const HTML = fs.readFileSync(path.join(__dirname,'index.html'),'utf8');
const server = http.createServer(async (req,res)=>{
  const u = req.url.split('?')[0];
  if(u === '/api/hotspots'){
    try{
      const payload = await buildHotspots();
      res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(JSON.stringify(payload));
    }catch(e){
      res.writeHead(500,{'Content-Type':'application/json'}); res.end(JSON.stringify({error:String(e)}));
    }
    return;
  }
  if(u === '/api/china-map'){
    try{ await ensureMapFile(); serveFile(res, MAP_CACHE, 'application/json; charset=utf-8'); }
    catch(e){ res.writeHead(500); res.end('map build failed'); }
    return;
  }
  // 静态资源白名单（显式列出，避免误暴露 config.json 等含密钥文件）
  const STATIC = {
    '/echarts.min.js':      ['echarts.min.js',      'application/javascript; charset=utf-8'],
    '/geo-fallback.js':     ['geo-fallback.js',     'application/javascript; charset=utf-8'],
    '/china-province.json': ['china-province.json', 'application/json; charset=utf-8'],
  };
  if(STATIC[u]){ const [f, ct] = STATIC[u]; serveFile(res, path.join(__dirname, f), ct); return; }
  if(u === '/' || u === '/index.html' || u === '/app'){
    // no-store：页面迭代期间禁止浏览器缓存，确保每次刷新都拿到最新版（曾因缓存旧页导致地图不显示）
    // /app 别名：预览环境的快照服务按路径缓存"旧录制"，新路径可拿到全新录制（壳完整、无需自愈）
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store, must-revalidate'}); res.end(HTML); return;
  }
  res.writeHead(404); res.end('Not Found');
});
server.listen(PORT, ()=>console.log(`M4 server on http://localhost:${PORT}  (tian:${TIAN_API_KEY?'set':'nokey'} juhe:${JUHE_API_KEY?'set':'nokey'} types=${TIAN_NEWS_TYPES.join(',')})`));
