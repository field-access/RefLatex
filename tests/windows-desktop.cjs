// Exercise the compiled Windows host through its test-only local CDP port.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),net=require('node:net'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),output=path.join(root,'dist/ConceptCards-Windows');
const run=path.join(root,'.desktop-cache/windows-tests',String(Date.now())),profile=path.join(run,'profile');
fs.mkdirSync(run,{recursive:true});
const canvas=path.join(run,'Physics canvas.json');
const markdown='# Physics\n\n## Equation\n\nEnergy is $E=mc^2$.\n\n```js\nconst energy = mass * speed ** 2;\n```\n\n| Quantity | Value |\n| --- | --- |\n| Mass | 42 |\n\n[Reference](https://example.com)';
fs.writeFileSync(canvas,JSON.stringify({format:'RefLatex Canvas',notes:[{id:1,markdown,x:0,y:0,width:600,font:'dm-sans',size:'80',mapColor:'default'}]}));
const errors=[],results={};
let host,browser,context,page;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function port(){const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const value=server.address().port;await new Promise(r=>server.close(r));return value}
async function connect(startup){
 const debug=await port();
 host=spawn(path.join(output,'ConceptCards.exe'),['--test-mode','--profile='+profile,'--debug-port='+debug,...(startup?[canvas]:[])],{windowsHide:true,stdio:'ignore'});
 let ready=false;
 for(let i=0;i<120;i++){
  if(host.exitCode!==null)throw Error('Windows host exited with '+host.exitCode);
  try{await new Promise((resolve,reject)=>{const req=http.get('http://127.0.0.1:'+debug+'/json/version',res=>{res.resume();res.statusCode===200?resolve():reject(Error('Not ready'))});req.on('error',reject)});ready=true;break}catch{await delay(250)}
 }
 assert.ok(ready,'WebView2 started');
 browser=await chromium.connectOverCDP('http://127.0.0.1:'+debug);
 context=browser.contexts()[0];
 context.on('page',observe);
 function observe(p){p.on('pageerror',error=>errors.push(error.message));p.on('dialog',async d=>{errors.push(d.message());await d.dismiss()})}
 for(const p of context.pages())observe(p);
 for(let i=0;i<100;i++){page=context.pages().find(p=>p.url().startsWith('https://conceptcards.local/'));if(page)break;await delay(100)}
 assert.ok(page,'Main native canvas appeared');
 await page.waitForFunction(()=>window.ConceptDesktop&&window.markmap&&window.marked&&window.katex);
}
async function stop(){
 if(page&&!page.isClosed())await page.evaluate(()=>window.dispatchEvent(new Event('pagehide'))).catch(()=>{});
 await delay(150);
 if(browser)await browser.close().catch(()=>{});
 if(host&&host.exitCode===null){const stopped=new Promise(resolve=>host.once('exit',resolve));host.kill();await stopped}
 browser=null;host=null;
 await delay(300);
}
async function native(method,args){return page.evaluate(({method,args})=>new Promise(resolve=>{
 const id=987654,listener=event=>{if(event.data.id===id){chrome.webview.removeEventListener('message',listener);resolve(event.data)}};
 chrome.webview.addEventListener('message',listener);chrome.webview.postMessage({id,method,args});
}),{method,args})}
async function windowWith(selector){
 // WebView2 hands a new native WebView to window.open(); CDP detaches the
 // provisional blank target. Same-origin opener access remains available.
 await page.waitForFunction(selector=>window.__nativeWindows?.some(tab=>!tab.closed&&tab.document.querySelector(selector)),selector,{timeout:15000});
 return page.evaluate(selector=>{const tab=__nativeWindows.find(tab=>!tab.closed&&tab.document.querySelector(selector));return{title:tab.document.title,text:tab.document.body.textContent,html:tab.document.documentElement.outerHTML}},selector);
}
async function closeWindows(){
 await page.evaluate(()=>__nativeWindows.forEach(tab=>{if(!tab.closed)tab.close()}));
 await delay(200);
}
(async()=>{
 try{
  await connect(true);
  await page.waitForFunction(()=>document.querySelector('.cardbody')?.textContent.includes('Energy is'));
  await page.waitForFunction(()=>document.querySelector('.cardbody .katex')&&document.querySelector('.cardbody .hljs-keyword'));
  assert.equal(await page.locator('.cardbody table').count(),1);
  assert.equal(await page.locator('.cardbody a').getAttribute('target'),'_blank');
  assert.equal(await page.locator('#canvas').getAttribute('data-background'),'light');
  results.nativeStartup=true;results.markdownMathCodeTables=true;
  await page.waitForFunction(()=>document.querySelector('#card-font-dm-sans')?.sheet);
  await page.locator('#openCanvas').click();
  await page.waitForFunction(()=>document.querySelector('#recentCanvasOpens')?.textContent.includes('Physics canvas.json'));
  await page.keyboard.press('Escape');
  const invalid=await native('readCanvas',{id:'not-approved',path:canvas});
  assert.equal(invalid.name,'NotAllowedError');
  assert.ok(invalid.error);results.approvedFileAccess=true;
  // Reconnect after a restart. New blank clears recovery but keeps recent files.
  await page.locator('#openCanvas').click();await page.locator('#newBlankCanvas').click();
  assert.equal(await page.locator('#world>.card').count(),0);
  await stop();await connect(false);
  assert.equal(await page.locator('#world>.card').count(),0);
  await page.locator('#openCanvas').click();
  await page.locator('#recentCanvasOpens button').filter({hasText:'Physics canvas.json'}).click();
  await page.waitForFunction(()=>document.querySelector('.cardbody .katex'));
  results.directRecentReopenAfterRestart=true;
  await native('testSaveNextDownload',{});
  await page.locator('#saveCanvas').click();
  const download=path.join(profile,'captures/saved-canvas.json');
  for(let i=0;i<100&&!fs.existsSync(download);i++)await delay(100);
  assert.equal(JSON.parse(fs.readFileSync(download,'utf8')).notes[0].markdown,markdown);
  results.nativeJsonDownload=true;
  const cdp=await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  const fonts=await page.locator('.card [data-font] option').evaluateAll(options=>options.map(option=>option.value));
  for(const key of fonts){
   await page.locator('.card [data-font]').evaluate((select,key)=>{select.value=key;select.dispatchEvent(new Event('change',{bubbles:true}))},key);
   if(!['mono','comic-sans'].includes(key))await page.waitForFunction(key=>!!document.querySelector('#card-font-'+key)?.sheet,key,{timeout:6000});
   await page.evaluate(()=>document.fonts.ready);
  }
  results.offlineFonts=fonts.length;
  await page.locator('.card [data-font]').evaluate(select=>{select.value='dm-sans';select.dispatchEvent(new Event('change',{bubbles:true}))});
  await page.evaluate(()=>{window.__nativeWindows=[];const open=window.open;window.open=(...args)=>{const tab=open(...args);__nativeWindows.push(tab);return tab}});
  await page.locator('.card [data-card-open]').evaluate(button=>button.click());
  const card=await windowWith('.card-window');
  assert.ok(card,'Card opened in another native window');
  assert.ok(card.html.includes('katex'));
  const capture=await native('testCaptureWindow',{format:'png'});assert.ok(capture.result,capture.error);
  fs.copyFileSync(capture.result.path,path.join(run,'card-window.png'));
  results.cardWindow=true;
  await closeWindows();
  await page.locator('.card [data-map-open]').evaluate(button=>button.click());
  const map=await windowWith('#map .markmap-node');
  assert.ok(map.text.includes('Physics'));
  const mapCapture=await native('testCaptureWindow',{format:'png'});assert.ok(mapCapture.result,mapCapture.error);
  fs.copyFileSync(mapCapture.result.path,path.join(run,'markmap-window.png'));
  results.offlineMarkmapWindow=true;
  await closeWindows();
  // Keep the native Print UI out of the automated test while validating the
  // actual exported document and selectable-text PDF through Chromium's API.
  await page.evaluate(()=>{const open=window.open;window.open=(...args)=>{const tab=open(...args);tab.print=()=>{tab.printRequested=true};return tab}});
  await page.locator('.card [data-card-pdf]').evaluate(button=>button.click());
  await windowWith('.pdf-card');
  await page.waitForFunction(()=>__nativeWindows.some(tab=>!tab.closed&&tab.printRequested),null,{timeout:15000});
  const print=await native('testCaptureWindow',{format:'pdf'});assert.ok(print.result,print.error);
  const pdfBytes=fs.readFileSync(print.result.path);
  fs.copyFileSync(print.result.path,path.join(run,'card.pdf'));
  const pdfjs=await import(require('node:url').pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  const doc=await pdfjs.getDocument({data:new Uint8Array(pdfBytes)}).promise;
  let text='';for(let i=1;i<=doc.numPages;i++)text+=(await(await doc.getPage(i)).getTextContent()).items.map(item=>item.str).join(' ');
  assert.ok(text.includes('Energy is')&&text.includes('Mass')&&text.includes('42'));
  results.selectablePdf=true;results.pdfBytes=pdfBytes.length;
  await closeWindows();
  await page.locator('.card .cardbody').click({position:{x:70,y:35}});
  await page.keyboard.press('Space');await delay(600);
  const point=await page.locator('#canvas').evaluate(el=>{const r=el.getBoundingClientRect();return{x:r.left+r.width*.55,y:r.top+r.height*.45}});
  const matrix=()=>page.locator('#world').evaluate(el=>{const m=new DOMMatrix(getComputedStyle(el).transform);return{x:m.e,y:m.f,scale:m.a}});
  const before=await matrix();
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:point.x,y:point.y,deltaX:0,deltaY:-24,modifiers:2});
  await delay(400);const after=await matrix();
  assert.ok(after.scale>before.scale,'Ctrl-wheel reaches the app instead of browser zoom');
  const anchorError=Math.hypot((point.x-before.x)/before.scale-(point.x-after.x)/after.scale,(point.y-before.y)/before.scale-(point.y-after.y)/after.scale);
  assert.ok(anchorError<1,'Pinch anchor stays fixed: '+anchorError);
  const ratio1=Math.log(after.scale/before.scale);
  await page.locator('#nav-pinch').evaluate(slider=>{slider.value=3;slider.dispatchEvent(new Event('input',{bubbles:true}))});
  const beforeHigh=await matrix();
  await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:point.x,y:point.y,deltaX:0,deltaY:-24,modifiers:2});
  await delay(400);const afterHigh=await matrix();
  const ratio3=Math.log(afterHigh.scale/beforeHigh.scale);
  assert.ok(ratio3/ratio1>2.8&&ratio3/ratio1<3.2,'Native pinch sensitivity scales correctly');
  results.nativePinchSensitivity=true;results.pinchAnchorError=anchorError;
  await page.locator('#theme').click();
  await page.screenshot({path:path.join(run,'native-dark-canvas.png')});
  assert.deepEqual(errors,[]);
  assert.equal(fs.readFileSync(canvas,'utf8'),JSON.stringify({format:'RefLatex Canvas',notes:[{id:1,markdown,x:0,y:0,width:600,font:'dm-sans',size:'80',mapColor:'default'}]}),'The opened file was never autosaved or overwritten');
  results.noAutomaticFileWrites=true;
  results.passed=true;results.artifacts=run;
  fs.writeFileSync(path.join(run,'report.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify(results));
 }finally{await stop()}
})().catch(error=>{console.error(error);console.error({errors,results,run});process.exitCode=1});
