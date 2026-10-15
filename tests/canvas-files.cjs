const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage();
  await page.goto('file:///'+path.resolve('index.html').replaceAll('\\','/'));
  await page.evaluate(()=>{window.onbeforeunload=null;document.body.innerHTML='<div class="canvas-save-picker"><button id="saveCanvas"></button><div id="canvasSaveMenu" hidden><p id="canvasSaveStatus"></p><button id="saveCurrentCanvas"></button><button id="saveCanvasAs"></button></div></div><div class="canvas-open-picker"><button id="openCanvas"></button><div id="canvasOpenMenu" hidden><button id="newBlankCanvas"></button><button id="openCanvasFile"></button><div id="recentCanvasOpens"></div></div></div><input id="canvasFile" type="file">';localStorage.removeItem('reflatex-recent-files');localStorage.removeItem('reflatex-active-file');localStorage.removeItem('reflatex-file-baseline')});
  await page.addScriptTag({path:path.resolve('canvas-files.js')});
  await page.evaluate(()=>{
   window.content={notes:[{markdown:'# Physics'}],camera:{x:0,y:0,scale:1}};window.files={};window.nextName='Physics.json';window.allowWrite=true;
   window.showSaveFilePicker=async()=>{
    const name=nextName;
    return files[name] ||= {name,queryPermission:async()=>allowWrite?'granted':'prompt',requestPermission:async()=>allowWrite?'granted':'denied',isSameEntry:async other=>other.name===name,
     createWritable:async()=>{let value;return {write:async text=>{value=text},close:async()=>{files[name].text=value;files[name].writes=(files[name].writes||0)+1},abort:async()=>{}}},
     getFile:async()=>new File([files[name].text||JSON.stringify(content)],name,{type:'application/json'})};
   };
   window.manager=createCanvasFileManager({payload:()=>({...content,savedAt:new Date().toISOString()}),hasContent:()=>content.notes.length>0,backup:()=>{},openFile:async file=>{content=JSON.parse(await file.text());return true},newCanvas:()=>{content={notes:[],camera:{x:0,y:0,scale:1}}}});
  });
  await page.evaluate(()=>manager.ready);
  await page.evaluate(()=>manager.saveAs());
  assert.equal(await page.evaluate(()=>files['Physics.json'].writes),1);
  await page.evaluate(()=>{content.notes[0].markdown='# Physics edited';manager.changed()});
  await page.waitForFunction(()=>window.files['Physics.json'].writes===2);
  assert.equal(await page.evaluate(()=>JSON.parse(files['Physics.json'].text).notes[0].markdown),'# Physics edited');
  await page.evaluate(()=>{nextName='Chemistry.json';content.notes=[{markdown:'# Chemistry'}]});
  await page.evaluate(()=>manager.saveAs());
  await page.evaluate(()=>manager.toggleOpenMenu());
  assert.ok((await page.locator('#recentCanvasOpens').innerText()).includes('Physics.json'));
  assert.ok((await page.locator('#recentCanvasOpens').innerText()).includes('Chemistry.json'));
  assert.equal(await page.locator('#canvasSaveMenu #recentCanvasOpens').count(),0,'Save menu has no recent destinations');
  await page.evaluate(()=>{content.notes[0].markdown='# Chemistry edited';manager.changed()});
  await page.waitForFunction(()=>window.files['Chemistry.json'].writes===2);
  assert.equal(await page.evaluate(()=>files['Physics.json'].writes),2,'Autosave does not overwrite a different subject');
  const dirty=await page.evaluate(()=>{allowWrite=false;content.notes[0].markdown='# Unsaved';manager.changed();const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented});
  assert.ok(dirty,'Unsaved changes trigger closing warning');
  await page.waitForTimeout(2200);
  assert.equal(await page.evaluate(()=>files['Chemistry.json'].writes),2,'Denied permission does not write');
  assert.ok((await page.locator('#canvasSaveStatus').innerText()).includes('reconnect'));
  await page.evaluate(()=>{allowWrite=true});await page.evaluate(()=>manager.save());
  assert.equal(await page.evaluate(()=>files['Chemistry.json'].writes),3);
  const clean=await page.evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented});
  assert.equal(clean,false,'Saved canvas does not prompt unnecessarily');
  await page.evaluate(()=>manager.toggleOpenMenu());
  await page.locator('#recentCanvasOpens button').filter({hasText:'Physics.json'}).click();
  await page.waitForFunction(()=>content.notes[0].markdown==='# Physics edited');
  assert.equal(await page.evaluate(()=>content.notes[0].markdown),'# Physics edited');
  await page.evaluate(()=>{content.notes[0].markdown='# Physics reopened';manager.changed()});
  await page.waitForFunction(()=>window.files['Physics.json'].writes===3);
  assert.equal(await page.evaluate(()=>files['Chemistry.json'].writes),3);
  await page.evaluate(()=>manager.newCanvas());
  assert.equal(await page.evaluate(()=>content.notes.length),0,'New canvas is empty');
  assert.equal(await page.evaluate(()=>localStorage.getItem('reflatex-active-file')),null,'New canvas is detached from previous files');
  await page.evaluate(()=>{content.notes=[{markdown:'# Fresh unsaved canvas'}];manager.changed()});
  await page.waitForTimeout(2200);
  assert.equal(await page.evaluate(()=>files['Physics.json'].writes),3,'New canvas never autosaves into the old file');
  assert.ok((await page.locator('#canvasSaveStatus').innerText()).includes('File autosave off'));
  console.log(JSON.stringify({passed:true,autosave:true,subjects:2,permissionRecovery:true,closeWarning:true}));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
