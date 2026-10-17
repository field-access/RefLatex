const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const name=req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0].slice(1);
  if(!['index.html','app.js','styles.css','text-highlights.js','canvas-files.js','favicon.svg'].includes(name)){res.writeHead(404).end();return}
  let body=fs.readFileSync(path.join(root,name),'utf8');
  if(name==='app.js')body=body.replace(/\}\)\(\);\s*$/,'window.__filesTest={state,save,makeNote,canvasFiles};})();');
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(body);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();const errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',async dialog=>{errors.push(dialog.message());await dialog.dismiss()});
  await page.route('https://**/*',route=>route.request().url().includes('/marked@')?route.fulfill({path:path.join(path.dirname(require.resolve('marked')),'marked.umd.js'),contentType:'text/javascript'}):route.abort());
  await page.addInitScript(()=>{
   localStorage.setItem('reflatex-active-file','old-file');localStorage.setItem('reflatex-file-baseline','old-baseline');
   window.savePrompts=0;window.writes=0;window.permissionModes=[];
   window.prompt=()=>{savePrompts++;throw Error('Custom save naming must not run')};
   window.confirm=()=>{savePrompts++;throw Error('Save confirmation must not run')};
   window.showSaveFilePicker=()=>{savePrompts++;throw Error('Save file picker must not run')};
   window.createTestHandle=name=>({name,isSameEntry:async other=>other.name===name,
    queryPermission:async options=>{permissionModes.push(options.mode);return 'granted'},requestPermission:async options=>{permissionModes.push(options.mode);return 'granted'},
    createWritable:async()=>{writes++;throw Error('File autosave must not write')},
    getFile:async()=>new File([JSON.stringify({notes:[{markdown:'# '+name.replace('.json',''),width:600}]})],name,{type:'application/json'})});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
  await page.evaluate(()=>__filesTest.canvasFiles.ready);
  assert.equal(await page.locator('#canvasSaveMenu').count(),0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('reflatex-active-file')),null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('reflatex-file-baseline')),null);
  await page.evaluate(async()=>{
   for(const name of ['Physics.json','Chemistry.json']){
    const handle=createTestHandle(name);await __filesTest.canvasFiles.importFile(await handle.getFile(),handle);
   }
  });
  await page.locator('#openCanvas').click();
  assert.ok((await page.locator('#recentCanvasOpens').innerText()).includes('Physics.json'));
  assert.ok((await page.locator('#recentCanvasOpens').innerText()).includes('Chemistry.json'));
  await page.getByRole('button',{name:'Physics.json',exact:true}).click();
  await page.waitForFunction(()=>__filesTest.state.notes[0].md==='# Physics');
  assert.ok(await page.evaluate(()=>permissionModes.every(mode=>mode==='read')));
  await page.evaluate(()=>{__filesTest.state.notes[0].md='# Physics edited';__filesTest.save();document.dispatchEvent(new Event('visibilitychange'))});
  await page.waitForTimeout(2200);
  assert.equal(await page.evaluate(()=>writes),0,'Edits and visibility changes never overwrite a file');
  assert.equal(await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented}),false,'Closing has no custom save warning');
  for(const action of [()=>page.locator('#saveCanvas').click(),()=>page.keyboard.press('Control+s')]){
   const pending=page.waitForEvent('download');await action();const download=await pending;
   assert.match(download.suggestedFilename(),/^reflatex-canvas-\d{4}-\d{2}-\d{2}\.json$/);
   const payload=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
   assert.equal(payload.notes[0].markdown,'# Physics edited');
  }
  assert.equal(await page.evaluate(()=>savePrompts),0,'Saving downloads immediately without naming dialogs');
  await page.locator('#openCanvas').click();await page.locator('#newBlankCanvas').click();
  await page.waitForFunction(()=>__filesTest.state.notes.length===0);
  assert.equal(await page.evaluate(()=>writes),0);assert.equal(await page.evaluate(()=>savePrompts),0);
  await page.locator('#openCanvas').click();assert.equal(await page.locator('#recentCanvasOpens button').count(),2);
  await page.keyboard.press('Escape');assert.ok(await page.locator('#canvasOpenMenu').evaluate(el=>el.hidden));
  await page.evaluate(async()=>{
   const file=new File([JSON.stringify({notes:[{markdown:'# Biology',width:600}]})],'Biology.json',{type:'application/json'});
   await __filesTest.canvasFiles.importFile(file);
   window.pickerCalls=[];
   window.showOpenFilePicker=async options=>{pickerCalls.push(options);return [createTestHandle('Biology.json')]};
  });
  await page.locator('#openCanvas').click();
  await page.locator('#recentCanvasOpens button').filter({hasText:'Biology.json'}).click();
  await page.waitForFunction(()=>pickerCalls.length===1&&__filesTest.state.notes[0].md==='# Biology');
  await page.locator('#openCanvas').click();
  assert.equal(await page.locator('#recentCanvasOpens button').count(),3,'Reconnecting updates the old entry without creating a duplicate');
  await page.locator('#recentCanvasOpens button').filter({hasText:'Biology.json'}).click();
  assert.equal(await page.evaluate(()=>pickerCalls.length),1,'Reconnected recent canvases open directly from their saved handles');
  await page.evaluate(()=>{window.showOpenFilePicker=async options=>{pickerCalls.push(options);throw new DOMException('Canceled','AbortError')}});
  await page.locator('#openCanvas').click();await page.locator('#openCanvasFile').click();
  assert.equal(await page.evaluate(()=>pickerCalls.at(-1).startIn.name),'Biology.json','General Open starts in the folder of the last opened canvas');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,manualDownloads:2,autosaveWrites:0,namingPrompts:0,recentCanvases:3,newCanvas:true,directReopen:true,rememberedFolder:true}));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
