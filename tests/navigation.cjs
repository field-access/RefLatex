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
  if(!['canvas-recovery.js','text-highlights.js','index.html','app.js','styles.css','favicon.svg'].includes(name)){res.writeHead(404).end();return}
  let body=fs.readFileSync(path.join(root,name),'utf8');
  if(name==='app.js')body=body.replace(/\}\)\(\);\s*$/, 'window.__test={state,zoomPrecise,worldPoint,moveTo,layoutCards,setCameraImmediate,interruptCamera};})();');
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
  await page.evaluate(()=>window.conceptcardsReady);
  assert.equal(await page.evaluate(()=>__test.state.hand),false,'Scroll mode is the default');
  const pageOrigin=await page.evaluate(()=>__test.state.targetY);
  await page.evaluate(()=>document.activeElement?.blur());
  await page.keyboard.press('PageDown');
  assert.equal(await page.evaluate(()=>__test.state.targetY),pageOrigin-720);
  await page.keyboard.press('PageUp');
  assert.equal(await page.evaluate(()=>__test.state.targetY),pageOrigin);
  const pinchTransition=await page.evaluate(async()=>{
   const t=__test,el=document.querySelector('#canvas');t.interruptCamera();t.setCameraImmediate(100,70,1);
   const anchor=t.worldPoint(800,300);
   el.dispatchEvent(new WheelEvent('wheel',{deltaY:100,clientX:800,clientY:300,bubbles:true,cancelable:true}));
   el.dispatchEvent(new WheelEvent('wheel',{deltaY:-20,ctrlKey:true,clientX:800,clientY:300,bubbles:true,cancelable:true}));
   await new Promise(resolve=>setTimeout(resolve,350));
   const actual=t.worldPoint(800,300);
   return {error:Math.hypot(actual.x-anchor.x,actual.y-anchor.y),scale:t.state.scale};
  });
  assert.ok(pinchTransition.error<1e-7,'Scroll-to-pinch keeps the point under the cursor: '+JSON.stringify(pinchTransition));
  const pinchSensitivity=await page.evaluate(async()=>{
   const t=__test,el=document.querySelector('#canvas'),slider=document.querySelector('#nav-pinch'),results=[];
   for(const sensitivity of [.25,1,3]){
    slider.value=sensitivity;slider.dispatchEvent(new Event('input',{bubbles:true}));
    t.interruptCamera();t.setCameraImmediate(100,70,1);const anchor=t.worldPoint(800,300);
    for(let i=0;i<40;i++)el.dispatchEvent(new WheelEvent('wheel',{deltaY:-.5,ctrlKey:true,clientX:800,clientY:300,bubbles:true,cancelable:true}));
    const beforeFrame=t.state.scale;await new Promise(requestAnimationFrame);
    const point=t.worldPoint(800,300);results.push({sensitivity,beforeFrame,scale:t.state.scale,error:Math.hypot(point.x-anchor.x,point.y-anchor.y)});
   }
   // Starting a pinch during a fit animation must use the visible transform.
   t.moveTo(-1000,-900,2);const anchor=t.worldPoint(800,300);
   el.dispatchEvent(new WheelEvent('wheel',{deltaY:-1,ctrlKey:true,clientX:800,clientY:300,bubbles:true,cancelable:true}));
   await new Promise(requestAnimationFrame);const point=t.worldPoint(800,300);
   return {results,fitError:Math.hypot(point.x-anchor.x,point.y-anchor.y)};
  });
  for(const sample of pinchSensitivity.results){
   assert.equal(sample.beforeFrame,1,'Pinch input paints once per frame');
   assert.ok(Math.abs(sample.scale-2**(.08*sample.sensitivity))<1e-8,'Sensitivity scales actual pinch input: '+JSON.stringify(sample));
   assert.ok(sample.error<1e-7);
  }
  assert.ok(pinchSensitivity.fitError<1e-7,'Fit-to-pinch keeps the visible cursor anchor');
  page.once('dialog',dialog=>dialog.type()==='beforeunload'?dialog.accept():dialog.dismiss());
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('#nav-pinch').inputValue(),'3','Expanded pinch sensitivity survives reload');
  await page.evaluate(()=>{const slider=document.querySelector('#nav-pinch');slider.value=1;slider.dispatchEvent(new Event('input',{bubbles:true}));__test.interruptCamera();__test.setCameraImmediate(640,400,1)});

  const nativePinchBefore=await page.evaluate(()=>{
   __test.interruptCamera();__test.setCameraImmediate(100,70,1);
   document.querySelector('#canvas').addEventListener('wheel',event=>{window.__nativePinch={trusted:event.isTrusted,ctrl:event.ctrlKey,delta:event.deltaY}},{once:true,capture:true});
   return __test.worldPoint(800,300);
  });
  await page.mouse.move(800,300);await page.keyboard.down('Control');await page.mouse.wheel(0,-20);await page.keyboard.up('Control');
  await page.waitForFunction(()=>__test.state.scale>1);
  const nativePinch=await page.evaluate(()=>({event:__nativePinch,scale:__test.state.scale,point:__test.worldPoint(800,300)}));
  assert.ok(nativePinch.event.trusted&&nativePinch.event.ctrl,'Browser-delivered trackpad-style pinch reaches the camera');
  assert.ok(Math.abs(nativePinch.scale-2**.08)<1e-7);
  assert.ok(Math.hypot(nativePinch.point.x-nativePinchBefore.x,nativePinch.point.y-nativePinchBefore.y)<1e-7);
  await page.evaluate(()=>{__test.interruptCamera();__test.setCameraImmediate(640,400,1)});
  await page.locator('#hand').click();
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
   const noOverlap=s.notes.every((n,i)=>i===0||n.y!==s.notes[i-1].y||n.x>=s.notes[i-1].x+s.notes[i-1].el.offsetWidth);
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
   return {synchronousScale,burstScale,anchorError:Math.hypot(point.x-anchor.x,point.y-anchor.y),firstFrame,finalScale:t.state.scale,cache:document.querySelector('#world').style.willChange,computedCache:getComputedStyle(document.querySelector('#world')).willChange};
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
   const original=IDBObjectStore.prototype.put;
   IDBObjectStore.prototype.put=function(...args){if(this.name==='canvas')window.__dragSaves++;return original.apply(this,args)};
  });
  await page.mouse.move(700,350);
  const dragStart=await page.evaluate(()=>({x:__test.state.x,y:__test.state.y}));
  await page.mouse.down({button:'right'});
  const captured=await page.evaluate(()=>document.querySelector('#canvas').hasPointerCapture(__test.state.pan.pointerId));
  await page.mouse.move(1040,530,{steps:12});
  await page.waitForTimeout(240);
  const drag=await page.evaluate(()=>({x:__test.state.x,y:__test.state.y,scale:__test.state.scale,cache:document.querySelector('#world').style.willChange,translate:document.querySelector('#world').style.translate,left:document.querySelector('#world').getBoundingClientRect().left,saves:window.__dragSaves}));
  assert.equal(wheel.computedCache,'auto','Zoom completion releases the compositor cache for sharp text');
  assert.ok(captured);assert.ok(Math.abs(drag.x-dragStart.x-340)<1e-8);assert.ok(Math.abs(drag.y-dragStart.y-180)<1e-8);
  assert.equal(drag.scale,.75);assert.equal(drag.cache,'translate');assert.equal(drag.saves,0);
  assert.ok(Math.abs(drag.left-drag.x)<.001);
  await page.mouse.up({button:'right'});
  const released=await page.evaluate(()=>({pan:__test.state.pan,computedCache:getComputedStyle(document.querySelector('#world')).willChange,translate:document.querySelector('#world').style.translate,left:document.querySelector('#world').getBoundingClientRect().left,x:__test.state.x}));
  assert.equal(released.computedCache,'auto','Drag completion releases the compositor cache for sharp text');
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
  await page.locator('#settings').click();
  await page.locator('#nav-wheel').fill('1.5');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('reflatex-navigation')).wheel),1.5);
  await page.locator('#nav-scroll').fill('0.75');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('reflatex-navigation')).scroll),.75);
  await page.locator('#nav-drag').fill('1.25');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('reflatex-navigation')).drag),1.25);
  await page.locator('#nav-drag').focus();await page.keyboard.press('Escape');
  await page.locator('#hand').click();
  const scroll=await page.evaluate(async()=>{
   const s=__test.state,start={x:s.x,y:s.y};
   document.querySelector('#canvas').dispatchEvent(new WheelEvent('wheel',{deltaX:20,deltaY:100,clientX:700,clientY:300,bubbles:true,cancelable:true}));
   await new Promise(requestAnimationFrame);
   await new Promise(requestAnimationFrame);
   const early={dx:s.x-start.x,dy:s.y-start.y};
   while(s.raf)await new Promise(requestAnimationFrame);
   return {early,dx:s.x-start.x,dy:s.y-start.y};
  });
  assert.ok(Math.abs(scroll.early.dy)<75,'Scrolling eases toward the target');
  assert.ok(Math.abs(scroll.dx+15)<1e-8);assert.ok(Math.abs(scroll.dy+75)<1e-8);
  await page.locator('#hand').click();
  await page.mouse.move(700,350);
  const dragOrigin=await page.evaluate(()=>({x:__test.state.x,y:__test.state.y}));
  await page.mouse.down({button:'right'});await page.mouse.move(740,370,{steps:4});await page.mouse.up({button:'right'});
  const sensitiveDrag=await page.evaluate(()=>({x:__test.state.x,y:__test.state.y}));
  assert.ok(Math.abs(sensitiveDrag.x-dragOrigin.x-50)<1e-8);
  assert.ok(Math.abs(sensitiveDrag.y-dragOrigin.y-25)<1e-8);
  await page.locator('#settings').click();
  await page.locator('#nav-wheel').focus();await page.keyboard.press('Escape');
  assert.equal(await page.locator('#globalSettings').evaluate(el=>el.hidden),true);
  assert.ok(await page.locator('#settings').evaluate(el=>el===document.activeElement));
  await page.locator('#help').click();
  assert.equal(await page.locator('.help-group').count(),6,'All shortcut categories remain available');
  assert.equal(await page.locator('.help-group[open]').count(),1,'Help opens with only reading shortcuts expanded');
  const navigationHelp=page.locator('.help-group').filter({has:page.locator('summary', {hasText:'Canvas navigation'})});
  await navigationHelp.locator('summary').click();
  assert.ok(await navigationHelp.evaluate(el=>el.open),'Shortcut categories expand on demand');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#helpBackdrop').evaluate(el=>el.hidden),true);
  assert.deepEqual(await page.locator('#toolbar button').evaluateAll(buttons=>buttons.filter(button=>!button.title.trim()).map(button=>button.id)),[],'Every tray button has hover help');
  assert.match(await page.locator('#hand').getAttribute('title'),/H/,'Navigation hover help retains its shortcut after changing mode');
  assert.match(await page.locator('[data-edit]').first().getAttribute('title'),/\(E\)/);
  assert.match(await page.locator('[data-delete]').first().getAttribute('title'),/Delete/);
  if(process.env.TEST_ONLINE){
   assert.ok(await page.evaluate(()=>!!window.d3?.zoom),'D3 must load for the integration test');
   const before=await page.evaluate(()=>({p:__test.worldPoint(800,300),scale:__test.state.scale}));
   await page.mouse.move(800,300);await page.mouse.wheel(0,-30);await page.waitForTimeout(200);
   const after=await page.evaluate(()=>({p:__test.worldPoint(800,300),scale:__test.state.scale}));
   assert.ok(after.scale>before.scale);
   assert.ok(Math.hypot(after.p.x-before.p.x,after.p.y-before.p.y)<1e-7);
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,...result,pinchTransition,pinchSensitivity,nativePinch,wheel,drag:{captured,dx:drag.x-dragStart.x,dy:drag.y-dragStart.y,savesDuringDrag:drag.saves},touch,errors},null,2));
 }finally{await browser?.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
