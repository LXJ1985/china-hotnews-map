// 构建零依赖离线单文件：纯 SVG 自绘中国地图 + 内联底图 + 内联应用，无任何外部库/CDN/fetch
const fs = require('fs');
const path = require('path');

const geo = fs.readFileSync(path.join(__dirname, 'china-province.json'), 'utf8');

const app = [
'window.addEventListener("error", e=>{ var el=document.getElementById("loading"); if(el){ el.style.display="flex"; el.style.whiteSpace="pre-wrap"; el.style.padding="24px"; el.style.textAlign="left"; el.innerHTML="⚠️ 出错（请把这段发我）：\\n\\n"+(e.message||e.error||"未知错误"); } });',
'var CAT={"民生":"#185FA5","财经":"#3B6D11","突发":"#A32D2D","文娱":"#534AB7","体育":"#854F0B"};',
'var CAT_KEYS=Object.keys(CAT);',
'var SENT={pos:"#0F6E56",neu:"#5F5E5A",neg:"#A32D2D"};',
'var SENT_LABEL={pos:"正面",neu:"中性",neg:"负面"};',
'var SRCS=["weibo","news","spider"];',
'var SRC_LABEL={weibo:"热搜",news:"新闻",spider:"爬虫"};',
'var CITIES={"北京市":[116.41,39.90],"上海市":[121.47,31.23],"广州市":[113.26,23.13],"深圳市":[114.06,22.55],"杭州市":[120.15,30.27],"成都市":[104.07,30.57],"武汉市":[114.30,30.59],"西安市":[108.95,34.27],"重庆市":[106.55,29.56],"南京市":[118.80,32.06],"天津市":[117.20,39.13],"苏州市":[120.62,31.32],"青岛市":[120.38,36.07],"郑州市":[113.65,34.76],"长沙市":[112.94,28.23],"沈阳市":[123.43,41.80],"厦门市":[118.09,24.48],"昆明市":[102.71,25.04],"哈尔滨市":[126.53,45.80],"济南市":[117.00,36.65],"合肥市":[117.28,31.86],"福州市":[119.30,26.08],"贵阳市":[106.71,26.65],"南宁市":[108.37,22.82],"兰州市":[103.83,36.06],"太原市":[112.55,37.87],"长春市":[125.32,43.82],"海口市":[110.20,20.04],"乌鲁木齐市":[87.62,43.82],"拉萨市":[91.11,29.97],"呼和浩特市":[111.75,40.84],"东莞市":[113.75,23.04],"佛山市":[113.12,23.02],"宁波市":[121.55,29.88]};',
'var activeCats=new Set(CAT_KEYS);',
'var activeSrc=new Set(SRCS);',
'var W=900,H=720,PAD=26,MINLON=73,MINLAT=18,MAXLON=135,MAXLAT=54,NS="http://www.w3.org/2000/svg";',
'function pick(a){return a[Math.floor(Math.random()*a.length)];}',
'function genData(){var list=[];for(var c in CITIES){list.push({city:c,cat:pick(CAT_KEYS),sent:pick(["pos","neu","neg"]),src:pick(SRCS),heat:Math.round(40+Math.random()*60),title:c+"："+pick(["民生服务升级","重大项目落地","局部天气预警","文体活动启幕","消费回暖明显","交通优化提速"])});}return list;}',
'var DATA=genData();',
'function proj(lon,lat){return [PAD+(lon-MINLON)/(MAXLON-MINLON)*(W-2*PAD), H-PAD-(lat-MINLAT)/(MAXLAT-MINLAT)*(H-2*PAD)];}',
'function ring2path(ring){var d="";ring.forEach(function(pt,i){var p=proj(pt[0],pt[1]);d+=(i===0?"M":"L")+p[0].toFixed(1)+" "+p[1].toFixed(1)+" ";});return d+"Z ";}',
'var svg=document.getElementById("cn");',
'var tip=document.getElementById("tip");',
'function render(){',
'  while(svg.firstChild) svg.removeChild(svg.firstChild);',
'  if(window.__GEO__&&window.__GEO__.features){ window.__GEO__.features.forEach(function(f){ var g=f.geometry; if(!g) return;',
'    var polys=g.type==="Polygon"?[g.coordinates]:g.type==="MultiPolygon"?g.coordinates:[];',
'    var d=""; polys.forEach(function(poly){ poly.forEach(function(ring){ d+=ring2path(ring); }); });',
'    var path=document.createElementNS(NS,"path"); path.setAttribute("d",d);',
'    path.setAttribute("fill","#e8edf3"); path.setAttribute("stroke","#c3ccda"); path.setAttribute("stroke-width","0.6");',
'    svg.appendChild(path);',
'  }); }',
'  var shown=DATA.filter(function(d){return activeCats.has(d.cat)&&activeSrc.has(d.src);});',
'  shown.forEach(function(d){ var ll=CITIES[d.city]; if(!ll) return; var p=proj(ll[0],ll[1]);',
'    var circ=document.createElementNS(NS,"circle"); var r=5+d.heat/14;',
'    circ.setAttribute("cx",p[0]); circ.setAttribute("cy",p[1]); circ.setAttribute("r",r);',
'    circ.setAttribute("fill",CAT[d.cat]); circ.setAttribute("stroke",SENT[d.sent]); circ.setAttribute("stroke-width",d.sent==="neu"?1.2:2.6);',
'    circ.style.cursor="pointer";',
'    circ.addEventListener("mousemove",function(ev){ tip.style.display="block"; tip.style.left=(ev.clientX+12)+"px"; tip.style.top=(ev.clientY+12)+"px"; tip.innerHTML="<b>"+d.city+"</b> · "+d.cat+" · "+SENT_LABEL[d.sent]+"<br/>热度 "+d.heat+" · 来源 "+SRC_LABEL[d.src]+"<br/>"+d.title; });',
'    circ.addEventListener("mouseleave",function(){ tip.style.display="none"; });',
'    svg.appendChild(circ);',
'  });',
'  renderSide(shown);',
'}',
'function renderSide(shown){ var counts={}; shown.forEach(function(d){counts[d.city]=(counts[d.city]||0)+1;});',
'  var top=Object.entries(counts).sort(function(a,b){return b[1]-a[1];}).slice(0,12);',
'  var html="<h3 style=\\"margin:0 0 8px\\">热门城市 TOP "+top.length+"</h3>";',
'  html+=top.map(function(e){return "<div style=\\"padding:6px 8px;margin-bottom:4px;background:#1a2540;border:1px solid #2a3a5c;border-radius:6px;font-size:13px;display:flex;justify-content:space-between\\"><span>"+e[0]+"</span><span style=\\"background:#21314f;border-radius:10px;padding:0 8px\\">"+e[1]+"</span></div>";}).join("");',
'  html+="<p style=\\"font-size:12px;color:#6b7d9c;margin-top:8px\\">本页为离线示例数据（纯 SVG 自绘，零外部依赖）。运行 server.js 后用 localhost 打开可看实时数据。</p>";',
'  document.getElementById("side").innerHTML=html;',
'}',
'function buildLegend(){ var el=document.getElementById("legend"); var h="<div style=\\"margin-bottom:6px;color:#cfe0ff\\">分类（点击切换）</div>";',
'  CAT_KEYS.forEach(function(c){ h+="<div data-c=\\""+c+"\\" style=\\"display:flex;align-items:center;gap:6px;margin:3px 0;cursor:pointer;opacity:"+(activeCats.has(c)?1:0.35)+";text-decoration:"+(activeCats.has(c)?"none":"line-through")+"\\"><span style=\\"width:12px;height:12px;border-radius:50%;background:"+CAT[c]+"\\"></span>"+c+"</div>"; });',
'  h+="<div style=\\"margin-top:8px;color:#cfe0ff\\">情感外环</div><div style=\\"display:flex;align-items:center;gap:6px\\"><span style=\\"width:12px;height:12px;border-radius:50%;border:2px solid #A32D2D\\"></span>负面/风险</div><div style=\\"display:flex;align-items:center;gap:6px\\"><span style=\\"width:12px;height:12px;border-radius:50%;border:2px solid #0F6E56\\"></span>正面</div>";',
'  el.innerHTML=h;',
'  el.querySelectorAll("[data-c]").forEach(function(r){ r.onclick=function(){ var c=r.dataset.c; if(activeCats.has(c))activeCats.delete(c); else activeCats.add(c); buildLegend(); render(); }; });',
'}',
'function buildSrc(){ var el=document.getElementById("srcseg"); el.innerHTML=""; SRCS.forEach(function(s){ var b=document.createElement("button"); b.textContent=SRC_LABEL[s]; b.dataset.s=s; b.style.cssText="background:"+(activeSrc.has(s)?"#2b6cff":"transparent")+";color:"+(activeSrc.has(s)?"#fff":"#cfe0ff")+";border:1px solid #2a3a5c;border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px"; b.onclick=function(){ if(activeSrc.has(s))activeSrc.delete(s); else activeSrc.add(s); buildSrc(); render(); }; el.appendChild(b); }); }',
'try{',
'  if(!window.__GEO__){ throw new Error("底图数据未内联"); }',
'  buildLegend(); buildSrc(); render();',
'  document.getElementById("loading").style.display="none";',
'  document.getElementById("srcMode").textContent="数据：离线示例（纯 SVG 自绘，零依赖）";',
'}catch(err){ var el=document.getElementById("loading"); if(el){ el.style.display="flex"; el.style.whiteSpace="pre-wrap"; el.style.padding="24px"; el.style.textAlign="left"; el.innerHTML="⚠️ 初始化失败：\\n\\n"+((err&&err.stack)||err); } }',
].join("\n");

const css = [
'* { box-sizing: border-box; }',
'html,body { margin:0; height:100%; font-family:"PingFang SC","Microsoft YaHei",sans-serif; background:#0f1729; color:#e6edf6; }',
'#app { display:flex; height:100vh; }',
'#main { flex:1; position:relative; overflow:hidden; }',
'#side { width:320px; background:#131c30; border-left:1px solid #25324d; padding:16px; overflow-y:auto; }',
'header { position:absolute; top:14px; left:18px; z-index:5; }',
'header h1 { font-size:18px; margin:0 0 4px; font-weight:600; }',
'header p { font-size:12px; color:#8aa0c0; margin:0; }',
'#toolbar { position:absolute; top:14px; left:50%; transform:translateX(-50%); z-index:6; background:rgba(19,28,48,.9); border:1px solid #25324d; border-radius:10px; padding:8px 12px; display:flex; align-items:center; gap:14px; font-size:12px; max-width:72%; flex-wrap:wrap; }',
'#toolbar label { color:#8aa0c0; display:flex; align-items:center; gap:5px; }',
'#legend { position:absolute; top:90px; right:18px; z-index:5; background:rgba(19,28,48,.85); border:1px solid #25324d; border-radius:8px; padding:10px 12px; font-size:12px; }',
'#tip { position:fixed; z-index:20; display:none; pointer-events:none; background:#16213a; border:1px solid #2a3a5c; border-radius:6px; padding:8px 10px; font-size:12px; color:#e6edf6; max-width:240px; }',
'button { background:#2b6cff; color:#fff; border:0; border-radius:6px; padding:8px 14px; font-size:13px; cursor:pointer; }',
'#loading { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:14px; color:#8aa0c0; z-index:10; background:#0f1729; }',
].join("\n");

const html =
'<!DOCTYPE html>\n' +
'<html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/>\n' +
'<title>数字化中国地图 · 实时热点新闻（离线零依赖版）</title>\n' +
'<style>\n' + css + '\n</style></head>\n' +
'<body>\n' +
'<div id="app"><div id="main">\n' +
'<header><h1>数字化中国地图 · 实时热点新闻</h1><p>公众资讯 · Web 端 · 非商用演示 · <span id="srcMode">加载中…</span></p></header>\n' +
'<div id="toolbar"><div style="color:#8aa0c0">来源</div><span id="srcseg" style="display:flex;gap:6px"></span><button onclick="location.reload()">↻ 刷新数据</button></div>\n' +
'<div id="legend"></div>\n' +
'<div id="loading">正在渲染底图…</div>\n' +
'<svg id="cn" viewBox="0 0 900 720" style="width:100%;height:100%;display:block;"></svg>\n' +
'</div>\n' +
'<div id="side"></div></div>\n' +
'<div id="tip"></div>\n' +
'<script>window.__GEO__=' + geo + ';</script>\n' +
'<script>\n' + app + '\n</script>\n' +
'</body></html>';

fs.writeFileSync(path.join(__dirname, 'china-map-offline.html'), html);
console.log('已生成 china-map-offline.html，体积(MB):', (Buffer.byteLength(html) / 1024 / 1024).toFixed(2));
console.log('app 含 fetch 调用(应为0):', (app.match(/fetch\(/g) || []).length);
console.log('app 语法检查:');
