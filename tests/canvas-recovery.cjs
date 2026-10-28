const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const name=req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0].slice(1);
  if(name==='storage-test.html'){res.setHeader('Content-Type','text/html');res.end('<script src="canvas-recovery.js"></script>');return}
  if(!['index.html','app.js','canvas-recovery.js','canvas-files.js','text-highlights.js','styles.css','favicon.svg'].includes(name)){res.writeHead(404).end();return}
  let body=fs.readFileSync(path.join(root,name),'utf8');
  if(name==='app.js')body=body.replace(/\}\)\(\);\s*$/,'window.__recoveryTest={state,save,flushSave,snapshotData,newBlankCanvas,deleteNote};})();');
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(body);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const url=`http://127.0.0.1:${server.address().port}`;
 try{
  const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://**/*',route=>route.request().url().includes('/marked@')?route.fulfill({path:path.join(path.dirname(require.resolve('marked')),'marked.umd.js'),contentType:'text/javascript'}):route.abort());
  await page.addInitScript(()=>{
   if(!sessionStorage.getItem('seeded')){
    localStorage.setItem('reflatex',JSON.stringify({x:12,y:34,scale:.75,nextId:3,groups:[{id:'group',name:'Physics',color:'#9bafcc',cards:[1,2],collapsed:true}],readingCards:[2],notes:[{id:1,md:'# One\n\nA reference.',x:0,y:0,w:600,font:'mono'},{id:2,md:'# Two\n\nAnother reference.',x:624,y:0,w:600,font:'mono'}]}));
    sessionStorage.setItem('seeded','true');
   }
   let factory;
   Object.defineProperty(window,'createCanvasRecovery',{get:()=>factory,set:create=>{
    factory=()=>{const store=create(),load=store.load;store.load=async()=>{await new Promise(r=>setTimeout(r,350));return load()};return store};
   }});
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  assert.ok(await page.evaluate(()=>document.body.inert),'Startup protects the canvas during asynchronous restoration');
  await page.evaluate(()=>{const data=new DataTransfer();data.setData('text/plain','# Pasted during recovery');document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))});
  await page.evaluate(()=>conceptcardsReady);
  await page.waitForFunction(()=>__recoveryTest.state.notes.length===3);
  assert.equal(await page.evaluate(()=>document.body.inert),false);
  assert.equal(await page.evaluate(()=>localStorage.getItem('reflatex')),null,'Legacy recovery is removed only after migration commits');
  assert.deepEqual(await page.evaluate(()=>__recoveryTest.state.notes.map(n=>n.md.split('\n')[0])),['# One','# Two','# Pasted during recovery']);
  assert.equal(await page.evaluate(()=>__recoveryTest.state.layoutMode),'reading');
  await page.evaluate(()=>__recoveryTest.flushSave());
  await page.evaluate(()=>{
   window.__cardWrites=0;window.__bulkLocalWrites=0;window.__wholeCanvasStrings=0;
   const put=IDBObjectStore.prototype.put,set=Storage.prototype.setItem,stringify=JSON.stringify;
   IDBObjectStore.prototype.put=function(...args){if(this.name==='cards')__cardWrites++;return put.apply(this,args)};
   Storage.prototype.setItem=function(key,...args){if(key==='reflatex')__bulkLocalWrites++;return set.call(this,key,...args)};
   JSON.stringify=function(value,...args){if(value?.notes)__wholeCanvasStrings++;return stringify.call(this,value,...args)};
  });
  const camera=await page.evaluate(async()=>{
   __recoveryTest.state.x+=100;await __recoveryTest.flushSave();
   return {cards:__cardWrites,local:__bulkLocalWrites,serialized:__wholeCanvasStrings,data:await conceptcardsRecovery.read()};
  });
  assert.equal(camera.cards,0,'Camera-only saves write no card records');
  assert.equal(camera.local,0,'Normal recovery writes never store the canvas in localStorage');
  assert.equal(camera.serialized,0,'Camera-only saves do not stringify the entire canvas');
  const changed=await page.evaluate(async()=>{
   const n=__recoveryTest.state.notes[0];n.md+='\n\nEdited';n.highlights.push({id:'highlight',start:0,end:3,color:'yellow'});
   await __recoveryTest.flushSave();return {writes:__cardWrites,data:await conceptcardsRecovery.read()};
  });
  assert.equal(changed.writes,1,'One edited card causes one card write');
  assert.ok(changed.data.notes[0].md.endsWith('Edited'));
  assert.equal(changed.data.notes[0].highlights[0].id,'highlight','In-place highlight changes persist');
  const queued=await page.evaluate(async()=>{
   const saves=[];
   for(let i=0;i<8;i++){__recoveryTest.state.notes[0].md='# Latest '+i;saves.push(conceptcardsRecovery.save(__recoveryTest.snapshotData()))}
   await Promise.all(saves);return (await conceptcardsRecovery.read()).notes[0].md;
  });
  assert.equal(queued,'# Latest 7','Queued saves coalesce without writing an older canvas last');
  await page.evaluate(async()=>{__recoveryTest.state.notes.reverse();__recoveryTest.deleteNote(__recoveryTest.state.notes[1]);await __recoveryTest.flushSave()});
  const saved=await page.evaluate(()=>conceptcardsRecovery.read());
  await page.reload({waitUntil:'networkidle'});await page.evaluate(()=>conceptcardsReady);
  assert.deepEqual(await page.evaluate(()=>__recoveryTest.state.notes.map(n=>n.id)),saved.notes.map(n=>n.id),'Reload preserves order and deletion');
  assert.equal(await page.locator('#empty').isVisible(),false);
  await page.evaluate(async()=>{__recoveryTest.newBlankCanvas();await __recoveryTest.flushSave()});
  await page.reload({waitUntil:'networkidle'});await page.evaluate(()=>conceptcardsReady);
  assert.equal(await page.locator('.card').count(),0,'New blank canvas replaces old recovery');
  assert.equal(await page.locator('#empty').isVisible(),true);
  assert.deepEqual(errors,[]);
  await context.close();

  const largeContext=await browser.newContext(),large=await largeContext.newPage();
  await large.goto(url+'/storage-test.html');
  const largeResult=await large.evaluate(async()=>{
   const store=createCanvasRecovery();await store.load();
   const data={x:0,y:0,scale:1,notes:Array.from({length:50},(_,i)=>({id:i+1,md:'# Large '+i+'\n'+'reference material '.repeat(8000),x:i*624,y:0,w:600,highlights:[]}))};
   const size=data.notes.reduce((sum,n)=>sum+n.md.length,0),saved=await store.save(data);
   let cardWrites=0;const put=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(...args){if(this.name==='cards')cardWrites++;return put.apply(this,args)};
   data.x=250;await store.save(data);const restored=await store.read();
   return {size,saved,cardWrites,count:restored.notes.length,lastLength:restored.notes.at(-1).md.length,local:localStorage.getItem('reflatex')};
  });
  assert.ok(largeResult.size>6e6&&largeResult.saved,'Recovery supports canvases larger than the usual localStorage quota');
  assert.equal(largeResult.count,50);assert.ok(largeResult.lastLength>140000);
  assert.equal(largeResult.cardWrites,0);assert.equal(largeResult.local,null);
  const consistency=await large.evaluate(async()=>{
   const first=createCanvasRecovery();await first.load();
   const data={x:0,y:0,scale:1,notes:[{id:1,md:'# Original one',highlights:[]},{id:2,md:'# Original two',highlights:[]}]};
   await first.save(data);
   const second=createCanvasRecovery(),other=await second.load();other.notes[0].md='# Other tab';other.notes.pop();await second.save(other);
   data.x=100;await first.save(data);const restored=await first.read();
   const put=IDBObjectStore.prototype.put;let fail=true;
   IDBObjectStore.prototype.put=function(...args){if(this.name==='cards'&&fail){fail=false;throw Error('Simulated transaction failure')}return put.apply(this,args)};
   data.notes[0].md='# Survives a failed transaction';const fallbackSaved=await first.save(data),backup=JSON.parse(localStorage.getItem('reflatex'));
   IDBObjectStore.prototype.put=put;
   const retry=await first.save(data);
   return {restored:restored.notes.map(n=>n.md),fallbackSaved,backup:backup.notes[0].md,retry,legacy:localStorage.getItem('reflatex'),latest:(await first.read()).notes[0].md};
  });
  assert.deepEqual(consistency.restored,['# Original one','# Original two'],'Another tab cannot leave metadata and card records from different canvases');
  assert.equal(consistency.fallbackSaved,true);assert.equal(consistency.backup,'# Survives a failed transaction');
  assert.equal(consistency.retry,true);assert.equal(consistency.legacy,null);assert.equal(consistency.latest,consistency.backup);
  await largeContext.close();

  const fallbackContext=await browser.newContext(),fallback=await fallbackContext.newPage();
  await fallback.addInitScript(()=>{Object.defineProperty(window,'indexedDB',{value:{open(){throw Error('Unavailable')}}});localStorage.setItem('reflatex',JSON.stringify({notes:[{id:1,md:'# Preserved legacy',highlights:[]}]}))});
  await fallback.goto(url+'/storage-test.html');
  const fallbackResult=await fallback.evaluate(async()=>{
   const store=createCanvasRecovery(),data=await store.load();
   const retained=!!localStorage.getItem('reflatex');data.notes[0].md='# Updated fallback';
   const saved=await store.save(data);return {retained,saved,markdown:(await store.read()).notes[0].md};
  });
  assert.deepEqual(fallbackResult,{retained:true,saved:true,markdown:'# Updated fallback'});
  await fallbackContext.close();
  console.log(JSON.stringify({passed:true,migration:true,incrementalWrites:true,coalescedWrites:true,largeRecoveryBytes:largeResult.size,reloadAndBlank:true,fallback:true}));
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(error=>{console.error(error);process.exitCode=1});
