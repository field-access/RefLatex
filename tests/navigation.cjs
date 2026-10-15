// Run with Node.js and Playwright available (no production dependencies added).
const {chromium}=require('playwright');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const name=req.url==='/'?'index.html':req.url.slice(1);
  if(!['index.html','app.js','styles.css','favicon.svg'].includes(name)){res.writeHead(404).end();return}
  let body=fs.readFileSync(path.join(root,name),'utf8');
  if(name==='app.js')body=body.replace(/\}\)\(\);\s*$/, 'window.__test={state,zoomPrecise,worldPoint,moveTo,layoutCards};})();');
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(body);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 let browser;
 try{
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Offline regression exercises camera/layout independently of CDN availability.
  if(!process.env.TEST_ONLINE)await page.route('https://**/*',route=>route.request().url().includes('/marked@')
   ?route.fulfill({path:path.join(path.dirname(require.resolve('marked')),'marked.umd.js'),contentType:'text/javascript'})
   :route.abort());
  await page.addInitScript(()=>localStorage.setItem('reflatex',JSON.stringify({x:640,y:400,scale:1,notes:Array.from({length:150},(_,i)=>({id:i+1,md:'# Card '+i+'\n\nReadable text '.repeat(20),x:(i%10)*700,y:Math.floor(i/10)*500,w:600,font:'sans'}))})));
  await page.addInitScript(()=>localStorage.setItem('reflatex-index-open','false'));
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__test);
  const result=await page.evaluate(()=>{
   const t=__test,s=t.state;
   const before=t.worldPoint(400,300);
   t.moveTo(0,0,2);t.zoomPrecise(1.2,400,300);
   const after=t.worldPoint(400,300);
   const anchored=Math.hypot(before.x-after.x,before.y-after.y)<1e-8;
   const interrupted=s.raf===0;
   t.zoomPrecise(1/1.2,400,300);
   const reciprocal=Math.abs(s.scale-1)<1e-8;
   t.zoomPrecise(1e8);const maximum=s.scale;t.zoomPrecise(1e-8);const minimum=s.scale;
   const start=performance.now();t.layoutCards();const arrangeMs=performance.now()-start;
   const noOverlap=s.notes.every((n,i)=>i%10===0||n.x>=s.notes[i-1].x+s.notes[i-1].el.offsetWidth);
   t.zoomPrecise(100);
   return{anchored,interrupted,reciprocal,maximum,minimum,arrangeMs,noOverlap,cards:s.notes.length};
  });
  assert.ok(result.anchored&&result.interrupted&&result.reciprocal&&result.noOverlap);
  assert.equal(result.maximum,8);assert.equal(result.minimum,.01);assert.equal(result.cards,150);
  await page.locator('#zoomLabel').fill('250');await page.locator('#zoomLabel').press('Enter');
  assert.equal(await page.evaluate(()=>__test.state.scale),2.5);
  await page.waitForTimeout(100);
  assert.ok(await page.locator('.card.offscreen').count()>100);
  const wheel=await page.evaluate(async()=>{
   const el=document.querySelector('#canvas'),t=__test;
   t.zoomPrecise(1/t.state.scale);const anchor=t.worldPoint(700,300);
   // High-frequency precision input must accumulate without synchronous paints.
   for(let i=0;i<100;i++)el.dispatchEvent(new WheelEvent('wheel',{deltaY:-.25,clientX:700,clientY:300,bubbles:true,cancelable:true}));
   const synchronousScale=t.state.scale;
   await new Promise(requestAnimationFrame);
   const burstScale=t.state.scale,point=t.worldPoint(700,300);
   await new Promise(r=>setTimeout(r,200));
   t.zoomPrecise(1/t.state.scale);
   el.dispatchEvent(new WheelEvent('wheel',{deltaY:-100,clientX:700,clientY:300,bubbles:true,cancelable:true}));
   await new Promise(requestAnimationFrame);const firstFrame=t.state.scale;
   await new Promise(r=>setTimeout(r,400));
   return {synchronousScale,burstScale,anchorError:Math.hypot(point.x-anchor.x,point.y-anchor.y),firstFrame,finalScale:t.state.scale,cache:document.querySelector('#world').style.willChange};
  });
  assert.equal(wheel.synchronousScale,1);
  assert.ok(Math.abs(wheel.burstScale-2**.1)<1e-8);
  assert.ok(wheel.anchorError<1e-8);
  assert.ok(wheel.firstFrame>1&&wheel.firstFrame<2**.4);
  assert.ok(Math.abs(wheel.finalScale-2**.4)<1e-8);
  assert.equal(wheel.cache,'');
  await page.evaluate(()=>__test.zoomPrecise(2.5/__test.state.scale));
  // Real mouse input: pointer capture, a zoom timer expiring mid-drag, and
  // exact screen-space translation at a non-1:1 zoom.
  await page.evaluate(()=>{
   __test.zoomPrecise(.75/__test.state.scale);
   window.__dragSaves=0;
   const original=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,value){if(key==='reflatex')window.__dragSaves++;return original.call(this,key,value)};
  });
  await page.mouse.move(700,350);
  const dragStart=await page.evaluate(()=>({x:__test.state.x,y:__test.state.y}));
  await page.mouse.down({button:'right'});
  const captured=await page.evaluate(()=>document.querySelector('#canvas').hasPointerCapture(__test.state.pan.pointerId));
  await page.mouse.move(1040,530,{steps:12});
  await page.waitForTimeout(240);
  const drag=await page.evaluate(()=>({x:__test.state.x,y:__test.state.y,scale:__test.state.scale,cache:document.querySelector('#world').style.willChange,translate:document.querySelector('#world').style.translate,left:document.querySelector('#world').getBoundingClientRect().left,saves:window.__dragSaves}));
  assert.ok(captured);assert.ok(Math.abs(drag.x-dragStart.x-340)<1e-8);assert.ok(Math.abs(drag.y-dragStart.y-180)<1e-8);
  assert.equal(drag.scale,.75);assert.equal(drag.cache,'translate');assert.equal(drag.saves,0);
  assert.ok(Math.abs(drag.left-drag.x)<.001);
  await page.mouse.up({button:'right'});
  const released=await page.evaluate(()=>({pan:__test.state.pan,translate:document.querySelector('#world').style.translate,left:document.querySelector('#world').getBoundingClientRect().left,x:__test.state.x}));
  assert.equal(released.pan,null);assert.equal(released.translate,'');assert.ok(Math.abs(released.left-released.x)<.001);
  // Losing capture must not leave a stuck drag or a retained texture.
  await page.mouse.move(700,350);await page.mouse.down({button:'right'});await page.mouse.move(1080,540);
  await page.evaluate(()=>document.querySelector('#canvas').releasePointerCapture(__test.state.pan.pointerId));
  await page.mouse.move(1090,540);
  assert.equal(await page.evaluate(()=>__test.state.pan),null);
  await page.mouse.up({button:'right'});
  await page.evaluate(()=>__test.zoomPrecise(2.5/__test.state.scale));
  // Synthetic touch events verify frame batching and two-to-one finger handoff.
  const touch=await page.evaluate(async()=>{
   const el=document.querySelector('#canvas');
   const send=(type,id,x,y)=>el.dispatchEvent(new PointerEvent(type,{pointerType:'touch',pointerId:id,clientX:x,clientY:y,bubbles:true}));
   send('pointerdown',1,200,200);send('pointerdown',2,400,200);
   send('pointermove',2,600,200);
   await new Promise(requestAnimationFrame);
   const pinch=__test.state.scale;
   send('pointerup',2,600,200);const x=__test.state.x;
   send('pointermove',1,230,200);await new Promise(requestAnimationFrame);
   const pan=__test.state.x-x;send('pointercancel',1,230,200);
   return{pinch,pan};
  });
  assert.equal(touch.pinch,5);assert.equal(touch.pan,30);
  await page.locator('.zoom-settings summary').click();
  await page.locator('#nav-wheel').fill('1.5');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('reflatex-navigation')).wheel),1.5);
  await page.locator('#nav-wheel').focus();await page.keyboard.press('Escape');
  assert.equal(await page.locator('.zoom-settings').evaluate(el=>el.open),false);
  assert.ok(await page.locator('.zoom-settings summary').evaluate(el=>el===document.activeElement));
  if(process.env.TEST_ONLINE){
   assert.ok(await page.evaluate(()=>!!window.d3?.zoom),'D3 must load for the integration test');
   const before=await page.evaluate(()=>({p:__test.worldPoint(800,300),scale:__test.state.scale}));
   await page.mouse.move(800,300);await page.mouse.wheel(0,-30);await page.waitForTimeout(200);
   const after=await page.evaluate(()=>({p:__test.worldPoint(800,300),scale:__test.state.scale}));
   assert.ok(after.scale>before.scale);
   assert.ok(Math.hypot(after.p.x-before.p.x,after.p.y-before.p.y)<1e-7);
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,...result,wheel,drag:{captured,dx:drag.x-dragStart.x,dy:drag.y-dragStart.y,savesDuringDrag:drag.saves},touch,errors},null,2));
 }finally{await browser?.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
