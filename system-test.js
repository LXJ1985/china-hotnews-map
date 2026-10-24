// ========== 系统测试套件 v2：china-hotnews-map ==========
const BASE = 'http://localhost:8080';
const fs = require('fs');
let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name + (detail ? ` (${detail})` : '')); console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`); }
}

(async () => {
  // ---------- T1 API 层 ----------
  console.log('\n[T1] API 层：路由 / 安全 / 边界');
  const get = async (p) => { const r = await fetch(BASE + p); return { status: r.status, ctype: r.headers.get('content-type') || '', len: (await r.arrayBuffer()).byteLength }; };
  const checks = [
    ['/', 200], ['/index.html', 200], ['/echarts.min.js', 200], ['/geo-fallback.js', 200],
    ['/china-province.json', 200], ['/api/china-map', 200], ['/api/hotspots', 200],
    ['/api/no-such-api', 404], ['/config.json', 404], ['/server.js', 404], ['/history.json', 404],
    ['/../server.js', 404], ['/%2e%2e/server.js', 404], ['/echarts.min.js/../../server.js', 404],
  ];
  for (const [p, want] of checks) {
    const r = await get(p);
    ok(`GET ${p} → ${want}`, r.status === want, `got ${r.status}`);
  }
  // 并发：全部 200 且均为合法 JSON（实时数据内容逐次不同属预期）
  const conc = await Promise.all(Array.from({ length: 10 }, async () => {
    const r = await fetch(BASE + '/api/hotspots');
    const j = await r.json().catch(() => null);
    return { status: r.status, valid: !!(j && Array.isArray(j.latest) && j.latest.length > 0) };
  }));
  ok('并发：10 请求全部 200', conc.every(x => x.status === 200), conc.map(x => x.status).join(','));
  ok('并发：10 响应均为合法热点载荷', conc.every(x => x.valid));

  // ---------- T2 数据契约 ----------
  console.log('\n[T2] 数据契约：热点载荷结构');
  const j = await (await fetch(BASE + '/api/hotspots')).json();
  const CATS = ['民生','财经','突发','文娱','体育'], SENTS = ['pos','neu','neg'], SRCS = ['weibo','news','spider','sample'];
  const reqFields = ['city','cat','sent','sentScore','src','heat','rawHeat','title','url'];
  ok('顶层字段完整', ['updatedAt','sample','source','latest','history','syntheticHistory'].every(k => k in j), Object.keys(j).join(','));
  ok('latest 为非空数组', Array.isArray(j.latest) && j.latest.length > 0, `len=${j.latest?.length}`);
  ok('每条含全部必需字段', j.latest.every(d => reqFields.every(f => f in d)));
  ok('cat 枚举合法', j.latest.every(d => CATS.includes(d.cat)), [...new Set(j.latest.map(d => d.cat))].join(','));
  ok('sent 枚举合法', j.latest.every(d => SENTS.includes(d.sent)));
  ok('src 枚举合法', j.latest.every(d => SRCS.includes(d.src)), [...new Set(j.latest.map(d => d.src))].join(','));
  ok('heat 在 10-100', j.latest.every(d => d.heat >= 10 && d.heat <= 100));
  ok('sentScore 为数字', j.latest.every(d => typeof d.sentScore === 'number'));
  ok('title 非空字符串', j.latest.every(d => typeof d.title === 'string' && d.title.length > 0));
  ok('city 为字符串或 null', j.latest.every(d => d.city === null || (typeof d.city === 'string' && d.city.length > 0)));
  const unloc = j.latest.filter(d => d.city === null);
  ok('无地域条目 city=null', unloc.every(d => d.city === null), `unlocated=${unloc.length}`);
  ok('无地域条目全部来自 news（设计规则）', unloc.every(d => d.src === 'news'));
  const CITY_HINTS = ['北京','上海','广州','深圳','杭州','南京','成都','武汉','西安','重庆','天津','苏州','青岛','郑州','长沙','沈阳','大连','厦门','昆明','哈尔滨','济南','福州','合肥','南昌','贵阳','南宁','兰州','太原','石家庄','长春','海口','银川','西宁','乌鲁木齐','拉萨','呼和浩特','温州','东莞','佛山','宁波','无锡','泉州','洛阳'];
  const mism = j.latest.filter(d => d.title && (h => h && d.city && !d.city.includes(h))(CITY_HINTS.find(c => d.title.includes(c))));
  ok('地理归属：标题城市名与落点一致', mism.length <= 2, `mismatches=${mism.length}${mism.length ? ' e.g.' + mism[0].title + '→' + mism[0].city : ''}`);
  ok('history ≤24 快照且结构完整', Array.isArray(j.history) && j.history.length <= 24 && j.history.every(h => 't' in h && Array.isArray(h.data) && typeof h.synthetic === 'boolean'), `len=${j.history?.length}`);
  ok('history 末条为最新', j.history[j.history.length-1].t === Math.max(...j.history.map(h => h.t)));
  ok('syntheticHistory 标记一致', j.syntheticHistory === j.history.some(h => h.synthetic));
  ok('sample=false（真实数据通路）', j.sample === false);

  // ---------- T3 前端交互链路 + XSS ----------
  console.log('\n[T3] 前端交互链路 + XSS 断言');
  const html = fs.readFileSync(__dirname + '/index.html', 'utf8');
  const code = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  const XSS_TITLE = '<script>alert(1)</script><img src=x onerror=alert(2)>';
  const XSS_URL = 'javascript:alert(3)';
  const elements = {};
  const mkEl = () => ({ style:{}, innerHTML:'', textContent:'', value:'0', max:'0', dataset:{},
    classList:{toggle(){},add(){},remove(){}}, querySelector(){ return null; }, querySelectorAll(){ return []; },
    addEventListener(){}, removeAttribute(){}, setAttribute(){}, set onclick(v){},
    // 尺寸相关 API：应用里 geoInsets()/看门狗会用（返回 0 尺寸 → 走固定留白兜底分支）
    getBoundingClientRect(){ return { x:0, y:0, width:0, height:0, top:0, left:0, right:0, bottom:0 }; },
    clientWidth:0, clientHeight:0, scrollWidth:0, scrollHeight:0, children:[] });
  global.document = { getElementById(id){ if(!elements[id]) elements[id]=mkEl(); return elements[id]; },
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    addEventListener(){}, createElement(){ return mkEl(); },
    body: { contains(){ return true; } } };
  global.window = { addEventListener(){}, __CHINA_GEO_PROV__: { type:'FeatureCollection', features:[] }, __TEST_HOOKS__: {} };
  global.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  global.__setOptionCount = 0; global.__lastOption = null;
  const mkChart = () => ({ setOption(o){ global.__setOptionCount++; global.__lastOption = o; }, resize(){}, on(){}, off(){}, dispose(){}, isDisposed(){ return false; } });
  global.echarts = { init(){ return mkChart(); }, registerMap(){}, getInstanceByDom(){ return null; } };
  const mkItem = (o) => Object.assign({ city:'郑州市', cat:'民生', sent:'neg', sentScore:-1, src:'weibo', heat:90, rawHeat:1000000, title:'t', url:'#' }, o);
  const payload = { updatedAt: new Date().toISOString(), sample:false, source:'test', syntheticHistory:true,
    latest: [ mkItem({ title: XSS_TITLE, url: XSS_URL }), mkItem({ city:'香港', cat:'财经', sent:'pos', sentScore:2, src:'news', title:'香港经济数据', url:'https://x.com/a' }), mkItem({ city:null, cat:'突发', sent:'neu', sentScore:0, src:'news', title: XSS_TITLE }) ],
    history: [ { t: Date.now()-600000, data: [ mkItem({ title:'旧闻', heat:80 }) ], synthetic:true },
               { t: Date.now(), data: [ mkItem({ title: XSS_TITLE, url: XSS_URL }), mkItem({ city:'香港', cat:'财经', sent:'pos', sentScore:2, src:'news', title:'香港经济数据', url:'https://x.com/a' }), mkItem({ city:null, cat:'突发', sent:'neu', sentScore:0, src:'news', title: XSS_TITLE }) ], synthetic:false } ] };
  global.fetch = async (u) => {
    if (u.endsWith('/api/hotspots')) return { ok:true, json: async () => payload };
    if (u.endsWith('/api/china-map')) return { ok:true, json: async () => ({ type:'FeatureCollection', features: [] }) };
    throw new Error('unexpected fetch ' + u);
  };
  // 驱动器：eval 与应用同作用域执行；应用为 IIFE 封装，内部引用经 window.__TEST_HOOKS__ 暴露
  const driver = `
;(async ()=>{
  const R = { err:null, calls:0, html:{}, checks:{} };
  const H = window.__TEST_HOOKS__;
  global.__T = R;
  try{
    await new Promise(r => setTimeout(r, 400));      // 等应用初始化 IIFE 完成
    H.drillCity('郑州市');                             // 下钻 → 侧栏新闻列表（XSS 标题）
    H.renderSideDefault();                              // 未定位列表（XSS 标题）
    H.viewMode='heat'; H.renderView();                    // 热力图
    H.viewMode='scatter'; H.renderView();                 // 回到气泡
    H.activeCats.delete('民生'); H.renderView(); H.activeCats.add('民生');   // 分类开关
    H.activeSources.delete('news'); H.renderView(); H.activeSources.add('news'); // 来源筛选
    document.getElementById('timeSlider').value='0'; H.updateTimeLabel(); // 时间轴回拖
    H.drillUp();                                        // 返回全国
    await H.refreshData();                              // 刷新路径
    R.calls = global.__setOptionCount;
    R.html = { newsList: document.getElementById('newsList').innerHTML, sideHead: document.getElementById('sideHead').innerHTML, loading: document.getElementById('loading').innerHTML, legend: document.getElementById('legend').innerHTML, srcMode: document.getElementById('srcMode').textContent };
    R.checks.filter = (()=>{ H.activeCats=new Set(['民生']); H.activeSources=new Set(['weibo']); const v=H.viewData(); const g=v.every(d=>d.cat==='民生'&&d.src==='weibo'); H.activeCats=new Set(['民生','财经','突发','文娱','体育']); H.activeSources=new Set(['weibo','news','spider']); return g; })();
    R.checks.allFiltered = H.ALL.every(d=>H.CITIES[d.city]);
    R.checks.rawHasNull = H.ALL_RAW.some(d=>d.city===null);
    R.checks.drillEmpty = (()=>{ try{ H.drillCity('不存在市'); return true; }catch(e){ return false; } })();
    R.checks.fmtUndef = H.fmtTime(undefined)==='—' && H.fmtTime(null)==='—';
    R.checks.fmtNow = /^\\d{2}:\\d{2}$/.test(H.fmtTime(Date.now()));
    R.checks.fallbackCoord = H.toScatter([{city:'不存在',cat:'民生',sent:'neu',sentScore:0,src:'weibo',heat:50,rawHeat:1,title:'t',url:'#'}])[0].value[0]===105.0;
    R.checks.tooltipEscaped = (()=>{ const p={data:{raw:{title:'<script>alert(1)</script>',city:'郑州市',cat:'民生',sent:'neg',sentScore:-1,rawHeat:1,src:'weibo'}}}; const o=(global.__lastOption&&global.__lastOption.tooltip&&global.__lastOption.tooltip.formatter)?global.__lastOption.tooltip.formatter(p):''; return !/<script>alert/i.test(o)&&o.indexOf('&lt;script&gt;')>=0; })();
    R.checks.srcMode = document.getElementById('srcMode').textContent.indexOf('实时接入')>=0;
  }catch(e){ R.err = (e&&e.stack)||String(e); }
  global.__done = true;
})();
`;
  global.__done = false;
  try { eval(code + driver); } catch (e) { ok('前端：eval 编译+启动无错误', false, e.message); }
  const t0 = Date.now();
  while (!global.__done && Date.now() - t0 < 5000) await new Promise(r => setTimeout(r, 100));
  const T = global.__T || {};
  ok('前端：初始化+全交互链路无运行时错误', !T.err, T.err ? String(T.err).split('\n')[0] : '');
  ok('前端：setOption 被调用（地图持续渲染）', (T.calls || 0) > 0, `calls=${T.calls}`);
  ok('前端：#loading 无错误信息残留', !/运行出错|初始化失败|底图加载失败/.test(T.html?.loading || ''), (T.html?.loading || '').slice(0, 80));
  ok('前端：srcMode 状态行正确（实时接入）', T.checks?.srcMode === true, T.html?.srcMode);
  const allHtml = [T.html?.newsList, T.html?.sideHead, T.html?.legend].join('\n');
  ok('XSS：页面无未转义 <script 标签', !/<script/i.test(allHtml));
  ok('XSS：页面无未转义 <img 标签', !/<img/i.test(allHtml));
  ok('XSS：页面无真实事件属性标签（<... onerror=...>）', !/<[a-z][^>]*\sonerror=/i.test(allHtml));
  ok('XSS：<script> 已转义为 &lt;script&gt;', allHtml.includes('&lt;script&gt;'));
  ok('XSS：javascript: 伪协议被拒绝（无该 href）', !/href="javascript:/i.test(allHtml));
  ok('安全：tooltip formatter 输出已转义', T.checks?.tooltipEscaped === true);
  ok('交互：分类/来源过滤正确', T.checks?.filter === true);
  ok('边界：ALL 仅含有坐标城市', T.checks?.allFiltered === true);
  ok('边界：ALL_RAW 保留无地域条目', T.checks?.rawHasNull === true);
  ok('边界：drillCity 空数据不抛错', T.checks?.drillEmpty === true);
  ok('边界：fmtTime 无效输入返回 —', T.checks?.fmtUndef === true);
  ok('边界：fmtTime 正常输入 HH:MM', T.checks?.fmtNow === true);
  ok('边界：未知城市落固定中心点', T.checks?.fallbackCoord === true);

  // ---------- T4 性能与交付物 ----------
  console.log('\n[T4] 性能与交付物完整性');
  const t1 = Date.now();
  await (await fetch(BASE + '/api/hotspots')).json();
  const dt = Date.now() - t1;
  ok('性能：/api/hotspots < 8s（超时保护生效）', dt < 8000, `${dt}ms`);
  const off = fs.readFileSync(__dirname + '/china-map-offline.html', 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  ok('交付物：offline 无 fetch 调用', !/fetch\s*\(/.test(off));
  ok('交付物：offline 无 http(s) 外链资源', !/(src|href)\s*=\s*"https?:/.test(off));
  ok('交付物：offline 底图已内联', off.includes('window.__GEO__'));
  const sa = fs.readFileSync(__dirname + '/china-map-standalone.html', 'utf8');
  const open = (sa.match(/<script/g) || []).length, close = (sa.match(/<\/script>/g) || []).length;
  ok('交付物：standalone script 标签平衡', open === close && open >= 3, `open=${open} close=${close}`);
  const idx = fs.readFileSync(__dirname + '/index.html', 'utf8');
  ok('交付物：index.html 无绝对路径资源引用', !/(src|href)\s*=\s*"\//.test(idx));
  ok('交付物：index.html 关键修复在位', idx.includes('esc(d.title)') && idx.includes('window.__CHINA_GEO_PROV__ || null; // 离线双击') && idx.includes('"香港":[114.17,22.32]'));
  const bat = fs.readFileSync(__dirname + '/start-server.bat', 'utf8');
  ok('交付物：start-server.bat 含端口占用检测', /netstat -ano \| findstr :8080/.test(bat));

  // ---------- 汇总 ----------
  console.log(`\n========== 测试汇总 ==========`);
  console.log(`PASS: ${pass}  FAIL: ${fail}  总计: ${pass + fail}`);
  if (failures.length) { console.log('失败项：'); failures.forEach(f => console.log('  - ' + f)); }
  console.log(fail === 0 ? '全部通过 ✅' : '存在失败项 ❌');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.log('测试执行器崩溃：', e); process.exit(1); });
