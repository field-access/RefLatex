const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const name=req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0].slice(1);
  if(!['index.html','app.js','styles.css','text-highlights.js','canvas-files.js','favicon.svg'].includes(name)){res.writeHead(404).end();return}
  let body=fs.readFileSync(path.join(root,name),'utf8');
  if(name==='app.js')body=body.replace('function layoutCards(){','function layoutCards(){window.__layoutRuns=(window.__layoutRuns||0)+1;').replace(/\}\)\(\);\s*$/,'window.__layout={state,readingSession,makeNote,makeMap,select,focusViewport,cardBounds,setCameraImmediate,zoomPrecise,snapshot,restore,canvasPayload,openCanvasFile,deleteNote};})();');
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(body);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://**/*',route=>route.request().url().includes('/marked@')?route.fulfill({path:path.join(path.dirname(require.resolve('marked')),'marked.umd.js'),contentType:'text/javascript'}):route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
  // Long documents previously persuaded Arrange to use one horizontal row.
  for(const width of [1440,900])for(const count of [3,12]){
   await page.setViewportSize({width,height:900});
   await page.evaluate(count=>{
    for(let i=0;i<count;i++)__layout.makeNote(`# Long document ${i+1}\n\n`+Array(60).fill('Academic reading material.').join('\n\n'),0,0,540+i%3*40,false,null,'mono');
   },count);
   await page.keyboard.press('a');await page.waitForTimeout(150);
   const board=await page.evaluate(()=>{
    const t=__layout,rows=new Map();
    for(const n of t.state.notes){if(!rows.has(n.y))rows.set(n.y,[]);rows.get(n.y).push(n)}
    return [...rows.values()].map(row=>row.map(n=>({id:n.id,x:n.x,y:n.y,w:n.el.offsetWidth,h:n.el.offsetHeight})));
   });
   assert.ok(board.length>=2,'Long cards wrap into multiple rows');
   const rowCounts=board.map(row=>row.length);
   assert.ok(Math.max(...rowCounts)-Math.min(...rowCounts)<=1,'Rows distribute cards evenly');
   const ids=await page.evaluate(()=>__layout.state.notes.map(n=>n.id));
   assert.deepEqual(board.flat().map(n=>n.id),ids,'Wrapped rows preserve index order');
   for(let r=0;r<board.length;r++){
    const row=board[r];
    for(let i=1;i<row.length;i++)assert.equal(row[i].x-row[i-1].x-row[i-1].w,24);
    if(r)assert.equal(row[0].y-board[r-1][0].y-Math.max(...board[r-1].map(n=>n.h)),24);
   }
   await page.evaluate(()=>{for(const n of [...__layout.state.notes])__layout.deleteNote(n);__layout.state.nextId=1});
  }
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>{
   const t=__layout;
   for(let i=0;i<24;i++)t.makeNote(`# Card ${i+1}\n\n`+Array(2+i%4).fill('Readable Markdown content.').join('\n\n'),i*2000,0,480+(i%3)*80,false,null,'mono');
   t.makeNote('# Tall card\n\n'+Array(40).fill('A paragraph in a long document.').join('\n\n'),0,0,600,false);
   const map=t.makeMap('# Map\n\n## Branch',0,0,800,500,false);
   map.mapReady=Promise.resolve();map.mapInstance={fit:async()=>{window.__mapFits++},setData:async()=>{},destroy:()=>{window.__mapDestroyed=true}};
   window.__mapFits=0;window.__mapRef=map.mapInstance;
   window.__cardRefs=t.state.notes.map(n=>n.el);
  });
  await page.keyboard.press('a');await page.waitForTimeout(400);
  const inspect=()=>page.evaluate(()=>{
   const t=__layout,b=t.cardBounds(),rows=new Map();
   for(const n of t.state.notes){if(!rows.has(n.y))rows.set(n.y,[]);rows.get(n.y).push(n)}
   return{mode:t.state.layoutMode,reading:[...t.readingSession.cards.keys()],runs:window.__layoutRuns||0,positions:t.state.notes.map(n=>({id:n.id,x:n.x,y:n.y})),area:(b.maxX-b.minX)*(b.maxY-b.minY),rows:[...rows.values()].map(row=>row.map(n=>({id:n.id,x:n.x,y:n.y,w:n.el.offsetWidth,h:n.el.offsetHeight}))),viewport:t.focusViewport(),rects:t.state.notes.map(n=>{const r=n.el.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom}})};
  });
  const compact=await inspect();assert.equal(compact.mode,'compact');
  assert.equal(await page.locator('#world').evaluate(el=>el.style.willChange),'transform','Overview keeps its bitmap cache after settling');
  assert.deepEqual(compact.rows.flat().map(n=>n.id),Array.from({length:26},(_,i)=>i+1),'Compact view follows index order');
  for(const row of compact.rows)for(let i=1;i<row.length;i++)assert.ok(Math.abs(row[i].x-row[i-1].x-row[i-1].w-24)<.01,'Compact horizontal gap is 24px');
  for(let i=1;i<compact.rows.length;i++){
   const previous=compact.rows[i-1];assert.ok(Math.abs(compact.rows[i][0].y-previous[0].y-Math.max(...previous.map(n=>n.h))-24)<.01,'Compact row gap is 24px');
  }
  const v=compact.viewport;
  assert.ok(compact.rects.every(r=>r.left>=v.left-1&&r.right<=v.left+v.width+1&&r.top>=v.top-1&&r.bottom<=v.top+v.height+1),'Overview fits between the index and tray');
  await page.evaluate(()=>__layout.select(__layout.state.notes[0]));
  await page.keyboard.press('Space');await page.waitForTimeout(400);
  const reading=await inspect();assert.equal(reading.mode,'reading');
  assert.deepEqual(reading.reading,[1]);
  assert.deepEqual(reading.positions[0],compact.positions[0],'The first card stays first, rather than moving to the end');
  assert.deepEqual(reading.rows.flat().map(n=>n.id),compact.rows.flat().map(n=>n.id),'Reading spacing preserves visual index order');
  assert.ok(reading.rows[0][1].x-reading.rows[0][0].x-reading.rows[0][0].w>24,'Reading spacing is inserted between neighbours');
  assert.equal(reading.runs,compact.runs,'Space never arranges the board');
  assert.equal(await page.locator('#world').evaluate(el=>el.style.willChange),'','Reading releases the bitmap cache to sharpen text');
  assert.ok(await page.evaluate(()=>__layout.state.notes.every((n,i)=>n.el===__cardRefs[i])&&__layout.state.notes.at(-1).mapInstance===__mapRef),'Spacing switches preserve every card and map instance');
  assert.equal(await page.evaluate(()=>__mapFits),0,'Overview and Markdown focus do not refit Markmaps');
  await page.keyboard.press('Space');await page.waitForTimeout(350);
  assert.deepEqual((await inspect()).positions,reading.positions,'Revisiting a card does not move cards');
  const remembered=await page.evaluate(()=>{
   const t=__layout,s=t.state;t.setCameraImmediate(s.x+35,s.y-28,s.scale*1.07);const n=s.selected,v=t.focusViewport();
   return{scale:s.scale,x:(v.left+v.width/2-s.x)/s.scale-n.x,y:(v.top+v.height/2-s.y)/s.scale-n.y};
  });
  await page.keyboard.press('c');await page.waitForTimeout(350);
  const overview=await inspect();assert.equal(overview.mode,'reading');
  assert.deepEqual(overview.positions,reading.positions,'C preserves the affected layout');
  assert.deepEqual(overview.reading,[1],'C preserves the reading session');
  assert.equal(overview.runs,compact.runs,'C does not arrange cards');
  await page.keyboard.press('ArrowRight');await page.waitForTimeout(300);
  await page.keyboard.press('ArrowLeft');await page.waitForTimeout(350);
  const restored=await page.evaluate(()=>{const t=__layout,s=t.state,n=s.selected,v=t.focusViewport();return{mode:s.layoutMode,scale:s.scale,x:(v.left+v.width/2-s.x)/s.scale-n.x,y:(v.top+v.height/2-s.y)/s.scale-n.y}});
  assert.equal(restored.mode,'reading');assert.ok(Math.abs(restored.scale-remembered.scale)<1e-5&&Math.hypot(restored.x-remembered.x,restored.y-remembered.y)<.01,'Reading view survives an overview detour');
  await page.evaluate(()=>__layout.select(__layout.state.notes[1]));
  await page.keyboard.press('Space');await page.waitForTimeout(350);
  const second=await inspect();assert.deepEqual(second.reading,[1,2]);
  assert.deepEqual(second.positions[0],reading.positions[0],'A second working card leaves the first stable');
  assert.deepEqual(second.rows.flat().map(n=>n.id),compact.rows.flat().map(n=>n.id),'Focusing the next card keeps all cards in visual order');
  assert.ok(second.rows[0][2].x-second.rows[0][1].x-second.rows[0][1].w>24,'Reading spacing follows the selected card, in place');
  assert.equal(second.runs,compact.runs,'Neither Space nor arrows arrange the board');
  await page.evaluate(()=>__layout.select(__layout.state.notes[4]));
  await page.keyboard.press('Space');await page.waitForTimeout(300);
  await page.evaluate(()=>__layout.select(__layout.state.notes[2]));
  await page.keyboard.press('Space');await page.waitForTimeout(300);
  assert.deepEqual((await inspect()).rows.flat().map(n=>n.id),compact.rows.flat().map(n=>n.id),'Reading visits out of sequence never reorder the board');
  await page.keyboard.press('c');await page.waitForTimeout(250);
  await page.evaluate(()=>__layout.select(__layout.state.notes.at(-1)));
  await page.keyboard.press('Space');await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>__mapFits),1,'Space fits the selected Markmap once');
  const session=await inspect();assert.deepEqual(session.reading,[1,2,5,3,26]);
  await page.evaluate(()=>{const t=__layout;t.restore(t.snapshot())});
  assert.deepEqual((await inspect()).positions,session.positions,'Undo snapshot restores card positions');
  assert.deepEqual((await inspect()).reading,session.reading,'Undo snapshot restores the reading session');
  await page.evaluate(async()=>{const t=__layout;t.openCanvasFile(new File([JSON.stringify(t.canvasPayload())],'session.json'));await new Promise(resolve=>setTimeout(resolve,150))});
  assert.deepEqual((await inspect()).positions,session.positions,'JSON open restores card positions');
  assert.deepEqual((await inspect()).reading,session.reading,'JSON open restores the reading session');
  await page.keyboard.press('a');await page.waitForTimeout(300);
  assert.deepEqual((await inspect()).reading,[],'Only Arrange resets the reading session');
  assert.equal((await inspect()).mode,'compact');
  for(const row of (await inspect()).rows)for(let i=1;i<row.length;i++)assert.ok(Math.abs(row[i].x-row[i-1].x-row[i-1].w-24)<.01,'A removes reading gaps');
  await page.evaluate(()=>{
   for(let i=26;i<500;i++)__layout.makeNote(`# Card ${i+1}\n\nA useful reference.\n\nSecond paragraph.`,0,0,600,false,null,'mono');
   document.body.classList.add('dark');
  });
  await page.keyboard.press('a');await page.waitForTimeout(400);
  const largeCompact=await inspect();
  await page.evaluate(()=>__layout.select(__layout.state.notes[350]));
  const spaceMs=await page.evaluate(()=>{const start=performance.now();window.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}));return performance.now()-start});
  await page.waitForTimeout(400);
  const largeReading=await inspect();
  assert.equal(largeReading.runs,largeCompact.runs,'500-card Space performs no layout');
  assert.deepEqual(largeReading.rows.flat().map(n=>n.id),largeCompact.rows.flat().map(n=>n.id),'500-card Space preserves visual order');
  const readingRow=largeCompact.rows.findIndex(row=>row.some(n=>n.id===351));
  for(let i=0;i<Math.max(0,readingRow-1);i++)assert.deepEqual(largeReading.rows[i],largeCompact.rows[i],'Rows before the affected neighbours stay untouched');
  const layoutMs=await page.evaluate(()=>{const start=performance.now();document.querySelector('#center').click();return performance.now()-start});
  const largeOverview=await inspect();
  assert.deepEqual(largeOverview.positions,largeReading.positions,'500-card overview preserves the current board');
  assert.equal(largeOverview.runs,largeReading.runs,'500-card overview performs no layout');
  await page.waitForTimeout(500);
  const camera=await page.evaluate(async()=>{
   const runs=__layoutRuns,times=[];let last=performance.now();
   for(let i=0;i<90;i++){
    __layout.zoomPrecise(Math.exp(Math.sin(i/16)*.012),720,450);
    await new Promise(requestAnimationFrame);const now=performance.now();times.push(now-last);last=now;
   }
   times.sort((a,b)=>a-b);return{extraLayouts:__layoutRuns-runs,p95:times[Math.floor(times.length*.95)]};
  });
  assert.equal(camera.extraLayouts,0,'Zoom frames never rearrange cards');
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#world').evaluate(el=>el.style.willChange),'transform','Settled overview zoom never releases the cache');
  await page.mouse.move(720,450);await page.mouse.down({button:'right'});await page.mouse.move(790,480,{steps:8});await page.mouse.up({button:'right'});
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#world').evaluate(el=>el.style.willChange),'transform','Overview pan also keeps the cache on release');
  const saved=await inspect();
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  page.once('dialog',dialog=>dialog.type()==='beforeunload'?dialog.accept():dialog.dismiss());
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('#world').evaluate(el=>el.style.willChange),'transform','Reopening an overview retains overview rendering');
  assert.equal(await page.evaluate(()=>__layout.state.overviewActive),true);
  assert.deepEqual((await inspect()).reading,saved.reading,'Recovery keeps the reading session in overview');
  assert.deepEqual((await inspect()).positions,saved.positions,'Recovery keeps the affected positions');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,orderedArrange:true,localizedReading:true,overviewPreservesLayout:true,preservedCardViews:true,preservedMapInstances:true,cachedOverview:true,cards:500,overviewMs:layoutMs,spaceMs,zoomP95:camera.p95,layoutsDuringZoom:camera.extraLayouts}));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
