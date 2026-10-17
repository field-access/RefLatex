const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const root=path.resolve(__dirname,'..');
const markedPath=path.join(path.dirname(require.resolve('marked')),'marked.umd.js');
const md=`# Working with reference material

A useful reference board keeps related ideas close together. This response explains a useful workflow for organizing research, reviewing code, and maintaining context while moving between topics. Each card should remain readable when you return to it.

## Recommended workflow

1. Collect the original source and identify the main question.
2. Separate observations from assumptions before drawing conclusions.
3. Compare the examples and record what changed.

> Keep the explanation concise, but retain the evidence needed to verify it.

| Stage | Action | Result |
| --- | --- | --- |
| Gather | Read the source | Context |
| Review | Compare examples | Findings |
| Finish | Save the summary | Reference |

\`\`\`javascript
function summarize(items) {
  return items.map(item => ({
    title: item.title,
    complete: Boolean(item.reviewed)
  }));
}
\`\`\`

Use **clear headings**, short paragraphs, and meaningful labels. Revisit the board as new evidence arrives.
`;
(async()=>{
 const server=http.createServer((req,res)=>{
  let name=req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0].slice(1);
  if(name==='assets/backgrounds/night_sky_background.webp'){res.setHeader('Content-Type','image/webp');res.end(fs.readFileSync(path.join(root,name)));return}
  if(!['text-highlights.js','index.html','styles.css','app.js'].includes(name)){res.writeHead(404).end();return}
  let body=fs.readFileSync(path.join(root,name),'utf8');
  if(name==='app.js')body=body.replace(/\}\)\(\);\s*$/,'window.__bench={state,zoomPrecise,apply};})();');
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(body);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 for(const cardCount of (process.env.BENCH_CARDS?[Number(process.env.BENCH_CARDS)]:[10,150]))for(const dark of (process.env.BENCH_DARK==='both'?[false,true]:[process.env.BENCH_DARK==='true']))for(const layers of (process.env.BENCH_LAYERS?[process.env.BENCH_LAYERS==='true']:[false,true])){
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.route('https://**/*',r=>r.request().url().includes('/marked@')?r.fulfill({path:markedPath,contentType:'text/javascript'}):r.abort());
 await page.addInitScript(({md,cardCount})=>localStorage.setItem('reflatex',JSON.stringify({x:100,y:70,scale:.36,notes:Array.from({length:cardCount},(_,i)=>({id:i+1,md,x:(i%5)*680,y:Math.floor(i/5)*1120,w:600,font:'sans'}))})),{md,cardCount});
 await page.addInitScript(background=>localStorage.setItem('reflatex-background',background),process.env.BENCH_BACKGROUND||'light');
 await page.addInitScript(dark=>{localStorage.setItem('reflatex-index-open','false');localStorage.setItem('reflatex-theme',dark?'dark':'light')},dark);
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
 if(process.env.BENCH_STYLE)await page.addStyleTag({content:fs.readFileSync(process.env.BENCH_STYLE,'utf8')});
 if(!layers)await page.addStyleTag({content:'#world{will-change:auto!important}'});
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
 let renderLayers=0;cdp.on('LayerTree.layerTreeDidChange',event=>{renderLayers=event.layers?.length||0});await cdp.send('LayerTree.enable');
 const metric=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
 const before=await metric();
 const stats=await page.evaluate(async()=>{
  const times=[];let last=performance.now();
  for(let i=0;i<180;i++){
   await new Promise(requestAnimationFrame);const now=performance.now();times.push(now-last);last=now;
   __bench.zoomPrecise(Math.exp(Math.sin(i/16)*.018),720,450);
  }
  times.sort((a,b)=>a-b);
  return {backdrop:getComputedStyle(document.querySelector('.cardbody pre')).backdropFilter,p95:times[Math.floor(times.length*.95)],slowFrames:times.filter(t=>t>25).length,nodes:document.querySelectorAll('*').length,tables:document.querySelectorAll('.cardbody table').length};
 });
 const after=await metric();
 console.log(JSON.stringify({cardCount,dark,layers,renderLayers,characters:md.length,...stats,taskMs:(after.TaskDuration-before.TaskDuration)*1000,layoutMs:(after.LayoutDuration-before.LayoutDuration)*1000,styleMs:(after.RecalcStyleDuration-before.RecalcStyleDuration)*1000}));
 await page.waitForTimeout(200);
 await page.mouse.move(700,350);await page.mouse.down({button:'right'});
 const panBefore=await metric();
 const pan=await page.evaluate(async()=>{
  const el=document.querySelector('#canvas'),start={x:__bench.state.x,y:__bench.state.y},times=[];
  let last=performance.now();
  for(let i=1;i<=120;i++){
   el.dispatchEvent(new PointerEvent('pointermove',{pointerId:__bench.state.pan.pointerId,pointerType:'mouse',buttons:2,clientX:700+i*2,clientY:350+i,bubbles:true,cancelable:true}));
   await new Promise(requestAnimationFrame);
   if(i===60)__bench.apply(); // A resize/repaint must not apply the drag twice.
   const now=performance.now();times.push(now-last);last=now;
  }
  times.sort((a,b)=>a-b);
  const rect=document.querySelector('#world').getBoundingClientRect();
  return {p95:times[114],slowFrames:times.filter(t=>t>25).length,dx:__bench.state.x-start.x,dy:__bench.state.y-start.y,positionError:Math.abs(rect.left-__bench.state.x)};
 });
 const panAfter=await metric();
 console.log(JSON.stringify({phase:'right-drag',cardCount,dark,layers,characters:md.length,...pan,taskMs:(panAfter.TaskDuration-panBefore.TaskDuration)*1000,layoutMs:(panAfter.LayoutDuration-panBefore.LayoutDuration)*1000}));
 await page.mouse.up({button:'right'});
 await page.close();
 }
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});

