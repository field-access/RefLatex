const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const name=req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0].slice(1);
  if(!['index.html','app.js','styles.css','canvas-recovery.js','text-highlights.js','canvas-files.js','favicon.svg'].includes(name)){res.writeHead(404).end();return}
  let body=fs.readFileSync(path.join(root,name),'utf8');
  if(name==='app.js')body=body.replace(/\}\)\(\);\s*$/,'window.__importTest={state,canvasFiles,importMarkdownFiles,canvasPayload};})();');
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(body);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://**/*',route=>route.request().url().includes('/marked@')?route.fulfill({path:path.join(path.dirname(require.resolve('marked')),'marked.umd.js'),contentType:'text/javascript'}):route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
  await page.evaluate(()=>window.conceptcardsReady);
  await page.evaluate(async()=>{
   await __importTest.canvasFiles.importFile(new File([JSON.stringify({notes:[{id:1,markdown:'# Existing card\n\nKeep this.',width:600}]})],'Existing.json'));
  });
  const inputs=[
   {name:'Physics.md',text:'# Energy\r\n\r\n$E=mc^2$\r\n\r\n```js\r\nconst x = 42;\r\n```\r\n'},
   {name:'Reading notes.markdown',text:'\uFEFFUnicode: λ, 中文, हिंदी.\n\n| Topic | Value |\n| --- | --- |\n| One | Two |\n'},
   {name:'Blank.md',text:''},
   {name:'Notes & <b>.md',text:'Filename is plain text.'}
  ];
  await page.locator('#openCanvas').click();
  const chooser=page.waitForEvent('filechooser');await page.locator('#importMarkdownFiles').click();
  const picker=await chooser;assert.ok(picker.isMultiple());
  await picker.setFiles([...inputs.map(({name,text})=>({name,mimeType:'text/markdown',buffer:Buffer.from(text)})),{name:'Ignore.txt',mimeType:'text/plain',buffer:Buffer.from('Not Markdown')}]);
  await page.waitForFunction(()=>__importTest.state.notes.length===5&&!document.querySelector('#importMarkdownFiles').disabled);
  await page.waitForTimeout(150);
  assert.ok(await page.locator('#canvasOpenMenu').evaluate(el=>el.hidden));
  const cards=await page.evaluate(()=>__importTest.state.notes.map(n=>({md:n.md,name:n.sourceName,title:n.el.querySelector('.map-title').textContent,index:n.indexTitle,x:n.x,y:n.y,w:n.el.offsetWidth,h:n.el.offsetHeight})));
  assert.equal(cards[0].md,'# Existing card\n\nKeep this.');
  assert.deepEqual(cards.slice(1).map(card=>({name:card.name,text:card.md})),inputs);
  assert.deepEqual(cards.slice(1).map(card=>card.title),['Energy','Reading notes','Blank','Notes & <b>']);
  assert.deepEqual(cards.slice(1).map(card=>card.index),['Energy','Reading notes','Blank','Notes & <b>']);
  assert.equal(await page.locator('.card .map-title b').count(),0,'Filenames never become HTML');
  assert.equal(await page.locator('.card table').count(),1,'Markdown tables render after file import');
  for(let i=0;i<cards.length;i++)for(let j=i+1;j<cards.length;j++){
   const a=cards[i],b=cards[j];assert.ok(a.x+a.w<=b.x||b.x+b.w<=a.x||a.y+a.h<=b.y||b.y+b.h<=a.y,'Imported cards are arranged without overlaps');
  }
  await page.keyboard.press('Control+z');
  assert.equal(await page.locator('#world>.card').count(),1,'One undo removes the entire imported batch');
  await page.keyboard.press('Control+Shift+z');
  assert.equal(await page.locator('#world>.card').count(),5);
  assert.equal(await page.locator('.card .map-title').nth(2).textContent(),'Reading notes');
  const downloading=page.waitForEvent('download');await page.locator('#saveCanvas').click();const download=await downloading;
  const saved=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.deepEqual(saved.notes.slice(1).map(n=>({name:n.sourceName,text:n.markdown})),inputs,'Saving preserves exact Markdown and source filenames');
  await page.locator('#canvasFile').setInputFiles({name:'Saved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
  await page.waitForFunction(()=>document.querySelector('#hint').textContent==='Opened Saved.json');
  assert.equal(await page.locator('.card .map-title').nth(2).textContent(),'Reading notes');
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  const recoveryDialog=dialog=>dialog.type()==='beforeunload'?dialog.accept():dialog.dismiss();
  page.on('dialog',recoveryDialog);
  await page.reload({waitUntil:'networkidle'});
  page.off('dialog',recoveryDialog);
  assert.equal(await page.locator('#world>.card').count(),5);
  assert.equal(await page.locator('.card .map-title').nth(2).textContent(),'Reading notes','Recovery keeps source filenames');
  // Reading failures should not prevent successful files from being imported.
  const messages=[];page.on('dialog',async dialog=>{messages.push(dialog.message());await dialog.accept()});
  await page.evaluate(()=>__importTest.importMarkdownFiles([
   {name:'Unavailable.md',arrayBuffer:async()=>{throw Error('Unavailable')}},
   new File(['Survives a neighboring read failure.'],'Working.md'),
   new File([new Uint16Array([0xfeff,...Array.from('Windows notes',letter=>letter.charCodeAt(0))])],'Windows.md')
  ]));
  assert.equal(await page.locator('#world>.card').count(),7);
  assert.equal(await page.evaluate(()=>__importTest.state.notes.at(-1).md),'\uFEFFWindows notes','Windows UTF-16 Markdown is decoded correctly');
  assert.ok(messages[0].includes('Unavailable.md'));
  await page.locator('#openCanvas').click();await page.locator('#newBlankCanvas').click();
  assert.equal(await page.locator('#world>.card').count(),0);
  const bulk=Array.from({length:48},(_,i)=>({name:`Topic ${i+1}.md`,mimeType:'text/markdown',buffer:Buffer.from(`# Topic ${i+1}\n\nStudy notes ${i+1}.`)}));
  await page.locator('#markdownFiles').setInputFiles(bulk);
  await page.waitForFunction(()=>__importTest.state.notes.length===48&&!document.querySelector('#importMarkdownFiles').disabled);
  await page.keyboard.press('Control+z');assert.equal(await page.locator('#world>.card').count(),0);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,multiFilePicker:true,exactMarkdown:true,filenameTitles:true,saveReopen:true,recovery:true,batchUndo:true,partialReadFailure:true,bulkCards:48}));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
