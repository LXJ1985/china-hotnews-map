// 自包含应用逻辑：完全离线，不发起任何网络请求（底图/库/数据均内联）
window.addEventListener("error", e=>{
  const el=document.getElementById("loading");
  if(el){ el.style.display="flex"; el.style.whiteSpace="pre-wrap"; el.style.padding="24px"; el.style.textAlign="left";
    el.innerHTML="⚠️ 运行出错（请把这段发我）：\n\n"+(e.message||e.error||"未知错误")+"\n"+(e.filename||"")+":"+(e.lineno||""); }
});
const CATEGORIES={"民生":"#5470c6","财经":"#91cc75","突发":"#ee6666","文娱":"#9a60b4","体育":"#fac858"};
const CAT_KEYS=Object.keys(CATEGORIES);
const SENT_RING={pos:"#4ea1ff",neu:"#5a6b85",neg:"#ff5b5b"};
const SENT_LABEL={pos:"正面",neu:"中性",neg:"负面"};
const SRC_LABEL={weibo:"热搜",news:"新闻",spider:"爬虫",sample:"样本"};
const SRC_COLOR={weibo:"#ff5b5b",news:"#6ee7a8",spider:"#fac858",sample:"#b9c4d6"};

const CITIES={
  "北京市":[116.41,39.90],"上海市":[121.47,31.23],"广州市":[113.26,23.13],"深圳市":[114.06,22.55],
  "杭州市":[120.15,30.27],"南京市":[118.80,32.06],"成都市":[104.07,30.57],"武汉市":[114.30,30.59],
  "西安市":[108.95,34.27],"重庆市":[106.55,29.56],"天津市":[117.20,39.13],"苏州市":[120.62,31.32],
  "青岛市":[120.38,36.07],"郑州市":[113.65,34.76],"长沙市":[112.94,28.23],"沈阳市":[123.43,41.80],
  "大连市":[121.62,38.91],"厦门市":[118.09,24.48],"昆明市":[102.71,25.04],"哈尔滨市":[126.53,45.80],
  "济南市":[117.00,36.65],"福州市":[119.30,26.08],"合肥市":[117.28,31.86],"南昌市":[115.89,28.68],
  "贵阳市":[106.71,26.65],"南宁市":[108.37,22.82],"兰州市":[103.83,36.06],"太原市":[112.55,37.87],
  "石家庄市":[114.51,38.04],"长春市":[125.32,43.82],"海口市":[110.20,20.04],"银川市":[106.23,38.49],
  "西宁市":[101.78,36.62],"乌鲁木齐市":[87.62,43.82],"拉萨市":[91.11,29.97],"呼和浩特市":[111.75,40.84],
  "温州市":[120.70,28.00],"东莞市":[113.75,23.04],"佛山市":[113.12,23.02],"宁波市":[121.55,29.88],
  "无锡市":[120.30,31.57],"泉州市":[118.58,24.91],"洛阳市":[112.45,34.62]
};
const CITY_NAMES=Object.keys(CITIES);

let ALL=[],ALL_RAW=[],historyData=[],curIdx=0;
let activeCats=new Set(CAT_KEYS);
let activeSources=new Set(["weibo","news","spider"]);
let viewMode='scatter',drillCityName=null,drillCenter=null,drillZoom=1.15,autoTimer=null,chart;

function rand(a,b){return a+Math.random()*(b-a);}
function pick(arr){return arr[Math.floor(Math.random()*arr.length)];}
function fmtTime(t){const d=new Date(t);const p=n=>String(n).padStart(2,'0');return p(d.getHours())+":"+p(d.getMinutes());}
function srcTag(src){return '<span class="tag tag-src-'+src+'">'+(SRC_LABEL[src]||src)+'</span>';}

// ---- 离线数据生成（示例，真实数据请运行 server.js 后用 localhost 打开）----
const TITLE_TPL={
  "民生":["老旧小区改造提速","新增便民服务点","夜间经济街区开街","社区食堂受热捧","全民健身季启动"],
  "财经":["前三季度经济数据出炉","重大项目集中签约","新质生产力企业落地","消费券发放带动回暖","集成电路项目集中竣工"],
  "突发":["发布大风蓝色预警","道路抢险保畅通","局部短时强降雨","消防演练提升应急力","发布暴雨橙色预警"],
  "文娱":["音乐节门票开售","博物馆新展迎客","城市光影秀启幕","非遗市集人气旺","演唱会门票开售"],
  "体育":["马拉松鸣枪开跑","球队主场告捷","青少年联赛落幕","全民健身季启动","国际赛事圆满收官"]
};
const SOURCES=["weibo","news","spider"];
const POSW=["提速","告捷","落地","回暖","迎客","启动","签约","增长","突破","胜利","开售","夺冠","成功","上线","利好","稳增","提质","惠民","丰收","获奖","通车","竣工","脱贫","增效","便民"];
const NEGW=["预警","事故","地震","火灾","暴雨","塌方","救援","遇难","损失","下跌","危机","诈骗","倒塌","疫情","爆炸","失踪","违规","停产","下滑","亏损","受害","塌陷","洪涝","干旱","冲突"];
function genSentScore(title){let p=0,n=0;for(let i=0;i<title.length-1;i++){const w=title.substr(i,2);if(POSW.includes(w))p++;else if(NEGW.includes(w))n++;}return p-n;}
function genHotspots(n){
  const list=[];
  for(let i=0;i<n;i++){
    const city=pick(CITY_NAMES),cat=pick(CAT_KEYS),sent=pick(["pos","neu","neg"]),src=pick(SOURCES),heat=Math.round(rand(20,100));
    const title=city+pick(TITLE_TPL[cat]);
    list.push({city,cat,sent,sentScore:genSentScore(title),src,heat,rawHeat:heat*12000,title,url:"#"});
  }
  return list;
}
function buildHistory(){
  const now=Date.now();
  const base=genHotspots(60);
  const hist=[];
  for(let i=11;i>=1;i--){
    const t=now-i*10*60*1000;
    hist.push({t,data:base.map(d=>({...d,heat:Math.max(10,Math.min(100,d.heat+Math.round(rand(-22,22)))),rawHeat:Math.max(0,Math.round(d.rawHeat*(0.6+Math.random()*0.8)))})),synthetic:true});
  }
  hist.push({t:now,data:base,synthetic:false});
  return hist;
}

// ---- 数据 -> 散点 / 热力 ----
function viewData(){return ALL.filter(d=>activeCats.has(d.cat)&&activeSources.has(d.src));}
function toScatter(data){
  return data.map(d=>{
    const ll=CITIES[d.city]||[Math.random()*120+80,Math.random()*40+20];
    return {name:d.city,value:[ll[0],ll[1],d.heat],raw:d,
      itemStyle:{color:CATEGORIES[d.cat],borderColor:SENT_RING[d.sent],borderWidth:d.sent==="neu"?1:3,shadowBlur:8,shadowColor:CATEGORIES[d.cat]}};
  });
}
function toHeat(data){
  return data.map(d=>{
    const ll=CITIES[d.city]||[Math.random()*120+80,Math.random()*40+20];
    return [ll[0],ll[1],d.heat];
  });
}
function renderScatter(){
  const data=toScatter(viewData());
  chart.setOption({
    tooltip:{trigger:"item",backgroundColor:"#16213a",borderColor:"#2a3a5c",textStyle:{color:"#e6edf6"},
      formatter:p=>{if(!p.data||!p.data.raw)return p.name;const d=p.data.raw;
        return '<b>'+d.title+'</b><br/>城市：'+d.city+'<br/>分类：'+d.cat+' ｜ 情感：'+d.sent+'（分'+(d.sentScore>=0?'+':'')+d.sentScore+'）<br/>热度：'+d.rawHeat+' ｜ 来源：'+d.src;}},
    geo:{map:"china",roam:true,zoom:drillZoom,center:drillCenter||null,itemStyle:{areaColor:"#16213a",borderColor:"#2a3a5c"},emphasis:{itemStyle:{areaColor:"#1f2e4d"},label:{show:false}},label:{show:false}},
    series:[
      {type:"map",map:"china",roam:true,zoom:drillZoom,center:drillCenter||null,itemStyle:{areaColor:"#16213a",borderColor:"#2a3a5c"},emphasis:{disabled:true},silent:true},
      {type:"effectScatter",coordinateSystem:"geo",data,symbolSize:v=>8+v[2]/6,rippleEffect:{scale:2.4,brushType:"stroke"},zlevel:2,showEffectOn:"render"}
    ]
  },true);
}
function renderHeat(){
  const data=toHeat(viewData());
  chart.setOption({
    tooltip:{trigger:"item",backgroundColor:"#16213a",borderColor:"#2a3a5c",textStyle:{color:"#e6edf6"},
      formatter:p=>'热度密度：'+p.value[2]+'<br/>坐标：'+p.value[0].toFixed(2)+', '+p.value[1].toFixed(2)},
    geo:{map:"china",roam:true,zoom:drillZoom,center:drillCenter||null,itemStyle:{areaColor:"#16213a",borderColor:"#2a3a5c"},emphasis:{itemStyle:{areaColor:"#1f2e4d"},label:{show:false}},label:{show:false}},
    visualMap:{min:10,max:100,calculable:true,left:18,bottom:24,seriesIndex:0,inRange:{color:["#1a3a6b","#2b6cff","#37d0c4","#fac858","#ee6666"]},textStyle:{color:"#8aa0c0"},text:["高","低"]},
    series:[{type:"heatmap",coordinateSystem:"geo",data,pointSize:16,blurSize:22,zlevel:2}]
  },true);
}
function renderView(){
  document.getElementById("viewModeLabel").textContent=viewMode==='scatter'?"气泡视图":"聚类热力";
  if(viewMode==='scatter')renderScatter();else renderHeat();
}

function buildLegend(){
  const el=document.getElementById("legend");
  let html="<div style='margin-bottom:6px;color:#cfe0ff'>分类（点击切换）</div>";
  CAT_KEYS.forEach(c=>{html+="<div class=\"row "+(activeCats.has(c)?'':'off')+"\" data-c=\""+c+"\"><span class=\"dot\" style=\"background:"+CATEGORIES[c]+"\"></span>"+c+"</div>";});
  html+="<div style=\"margin-top:8px;color:#cfe0ff\">情感外环</div><div class=\"row\"><span class=\"ring\"></span>负面/风险</div><div class=\"row\"><span class=\"dot\" style=\"background:#4ea1ff\"></span>正面</div>";
  el.innerHTML=html;
  el.querySelectorAll(".row[data-c]").forEach(r=>{r.onclick=()=>{const c=r.dataset.c;if(activeCats.has(c))activeCats.delete(c);else activeCats.add(c);buildLegend();renderView();};});
}

function renderSideDefault(){
  document.getElementById("sideHead").innerHTML="<h2>热门城市 TOP</h2>";
  const counts={};viewData().forEach(d=>counts[d.city]=(counts[d.city]||0)+1);
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,12);
  const box=document.getElementById("newsList");
  box.innerHTML=top.map(([c,n])=>'<div class="city-row" data-c="'+c+'"><span>'+c+'</span><span class="cnt">'+n+'</span></div>').join("")
    +'<p class="hint">点击城市查看下钻详情（缩放+分类/情感/来源拆解+新闻）。本页为离线示例数据；运行 server.js 后用 localhost 打开可看实时数据。</p>';
  box.querySelectorAll(".city-row").forEach(r=>r.onclick=()=>drillCity(r.dataset.c));
  const unloc=ALL_RAW.filter(d=>(!d.city)&&activeSources.has(d.src));
  if(unloc.length){
    box.innerHTML+='<div class="sect" style="margin-top:14px">未定位热点（无明确地域）· '+unloc.length+'</div>';
    box.innerHTML+=unloc.slice(0,10).map(d=>'<div class="news-item"><div class="t">'+d.title+'</div><div class="meta">'+srcTag(d.src)+'<span class="tag tag-cat">'+d.cat+'</span></div></div>').join("");
  }
}
function renderSideNews(city){
  const items=viewData().filter(d=>d.city===city);
  document.getElementById("sideHead").innerHTML='<h2>'+city+' · 热点新闻</h2><button class="ghost back" onclick="drillUp()">← 返回全国</button>';
  const box=document.getElementById("newsList");
  if(!items.length){box.innerHTML="<p class='hint'>该城市当前筛选下暂无热点。</p>";return;}
  box.innerHTML=items.map(d=>'<div class="news-item"><div class="t">'+d.title+'</div><div class="meta"><span class="tag tag-cat">'+d.cat+'</span><span class="tag tag-sent-'+d.sent+'">'+SENT_LABEL[d.sent]+'</span>'+srcTag(d.src)+'<span>热度 '+d.rawHeat+'</span><span>情分 '+(d.sentScore>=0?'+':'')+d.sentScore+'</span></div></div>').join("");
}

function bars(map,keys,colorFn,total){
  return keys.map(k=>{const v=map[k]||0;const pct=total?Math.round(v/total*100):0;
    return '<div class="bar-row"><span class="name">'+k+'</span><span class="track"><span class="fill" style="width:'+pct+'%;background:'+colorFn(k)+'"></span></span><span class="val">'+v+'</span></div>';}).join("");
}
function drillCity(city){
  drillCityName=city;drillCenter=CITIES[city]||null;drillZoom=4;renderView();renderSideNews(city);
  const items=viewData().filter(d=>d.city===city);
  const total=items.length;
  const avg=total?Math.round(items.reduce((s,d)=>s+d.heat,0)/total):0;
  const avgScore=total?(items.reduce((s,d)=>s+d.sentScore,0)/total):0;
  const catCount={};CAT_KEYS.forEach(c=>catCount[c]=0);items.forEach(d=>catCount[d.cat]++);
  const sentCount={pos:0,neu:0,neg:0};items.forEach(d=>sentCount[d.sent]++);
  const srcCount={weibo:0,news:0,spider:0};items.forEach(d=>{if(srcCount[d.src]!==undefined)srcCount[d.src]++;});
  document.getElementById("dCity").textContent=city;
  document.getElementById("dSub").textContent=historyData[curIdx]?.synthetic?"（含模拟历史时段）":fmtTime(historyData[curIdx]?.t)+" 时段";
  document.getElementById("dCount").textContent=total;
  document.getElementById("dAvg").textContent=avg;
  document.getElementById("dScore").textContent=(avgScore>=0?'+':'')+avgScore.toFixed(1);
  document.getElementById("dScore").style.color=avgScore>0?"#6ee7a8":avgScore<0?"#ff9a9a":"#b9c4d6";
  document.getElementById("dCat").innerHTML=bars(catCount,CAT_KEYS,k=>CATEGORIES[k],total);
  document.getElementById("dSent").innerHTML=bars(sentCount,["pos","neu","neg"],k=>({pos:"#4ea1ff",neu:"#5a6b85",neg:"#ff5b5b"})[k],total);
  document.getElementById("dSrc").innerHTML=bars(srcCount,["weibo","news","spider"],k=>SRC_COLOR[k],total);
  document.getElementById("detail").style.display="block";
}
function drillUp(){
  drillCityName=null;drillCenter=null;drillZoom=1.15;
  document.getElementById("detail").style.display="none";
  renderView();renderSideDefault();
}

function buildSlider(){
  const sl=document.getElementById("timeSlider");
  sl.max=String(Math.max(0,historyData.length-1));sl.value=String(historyData.length-1);curIdx=historyData.length-1;
  updateTimeLabel();
}
function updateTimeLabel(){
  const sl=document.getElementById("timeSlider");curIdx=Number(sl.value);
  const snap=historyData[curIdx];
  const lab=document.getElementById("timeLabel");
  if(snap)lab.textContent=(curIdx===historyData.length-1?"现在 ":"")+fmtTime(snap.t)+(snap.synthetic?" · 模拟":"");
  ALL_RAW=snap?.data||[];
  ALL=ALL_RAW.filter(d=>CITIES[d.city]);
  renderView();
  if(drillCityName)drillCity(drillCityName);else renderSideDefault();
}

document.getElementById("viewSeg").addEventListener("click",e=>{const b=e.target.closest("button[data-v]");if(!b)return;
  viewMode=b.dataset.v;document.querySelectorAll("#viewSeg button").forEach(x=>x.classList.toggle("active",x===b));renderView();});
document.getElementById("srcSeg").addEventListener("click",e=>{const b=e.target.closest("button[data-s]");if(!b)return;
  const s=b.dataset.s;if(activeSources.has(s))activeSources.delete(s);else activeSources.add(s);
  b.classList.toggle("active",activeSources.has(s));renderView();if(drillCityName)drillCity(drillCityName);else renderSideDefault();});
document.getElementById("timeSlider").addEventListener("input",updateTimeLabel);
document.getElementById("autoRefresh").addEventListener("change",e=>{if(autoTimer){clearInterval(autoTimer);autoTimer=null;}if(e.target.checked)autoTimer=setInterval(()=>{historyData=buildHistory();buildSlider();},30000);});

// ---- 初始化（完全离线）----
(function(){
 try{
  if(!window.__CHINA_GEO__){throw new Error("底图数据未内联");}
  echarts.registerMap("china",window.__CHINA_GEO__);
  chart=echarts.init(document.getElementById("main"));
  window.addEventListener("resize",()=>chart.resize());
  historyData=buildHistory();
  document.getElementById("srcMode").textContent="数据：离线示例（运行 server.js 后 localhost 打开看实时）";
  buildSlider();buildLegend();renderView();renderSideDefault();
  document.getElementById("loading").style.display="none";
  chart.on("click",params=>{if(params.data&&params.data.raw)drillCity(params.data.raw.city);});
 }catch(err){
  const el=document.getElementById("loading");
  if(el){el.style.display="flex";el.style.whiteSpace="pre-wrap";el.style.padding="24px";el.style.textAlign="left";
    el.innerHTML="⚠️ 初始化失败（请把这段发我）：\n\n"+((err&&err.stack)||err);}
 }
})();
