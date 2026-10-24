// 构建真正自包含的单文件：echarts + 省级底图 + 离线应用，全部内联，运行时零网络请求
const fs = require('fs');
const path = require('path');

const echarts = fs.readFileSync(path.join(__dirname, 'echarts.min.js'), 'utf8');
const geo = fs.readFileSync(path.join(__dirname, 'china-province.json'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, 'app-standalone.js'), 'utf8');
let shell = fs.readFileSync(path.join(__dirname, 'shell.html'), 'utf8');

// 防止内联 JS 中的 </script> 截断外层 <script>
const safe = s => s.replace(/<\/script>/gi, '<\\/script>');

const echartsTag = '<script>' + safe(echarts) + '</script>';
const geoTpl = '<script>window.__CHINA_GEO__=' + geo + ';</script>';
const appTag = '<script>' + safe(app) + '</script>';

shell = shell
  .replace('<!--__ECHARTS__-->', echartsTag)
  .replace('<!--__GEO__-->', geoTpl)
  .replace('<!--__APP__-->', appTag);

const out = path.join(__dirname, 'china-map-standalone.html');
fs.writeFileSync(out, shell);
console.log('已生成自包含文件:', out);
console.log('体积(字节):', Buffer.byteLength(shell, 'utf8'), '约', (Buffer.byteLength(shell, 'utf8') / 1024 / 1024).toFixed(2), 'MB');
console.log('含 fetch 调用(应为0):', (app.match(/fetch\(/g) || []).length);
