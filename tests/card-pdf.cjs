const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const name=req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0].slice(1);
  if(!['canvas-recovery.js','text-highlights.js','index.html','app.js','styles.css','card-pdf.js','village.js','favicon.svg','assets/backgrounds/village-pdf.js'].includes(name)){res.writeHead(404).end();return}
  let body=fs.readFileSync(path.join(root,name),'utf8');
  if(name==='app.js')body=body.replace(/\}\)\(\);\s*$/,'window.__pdfTest={makeNote,select};})();');
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(body);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext();
  await context.addInitScript(()=>{window.print=()=>{window.printRequested=true}});
  await context.route('https://**',r=>r.request().url().includes('/marked@')?r.fulfill({path:path.join(path.dirname(require.resolve('marked')),'marked.umd.js'),contentType:'text/javascript'}):r.abort());
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{errors.push(d.message());await d.dismiss()});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.evaluate(()=>window.conceptcardsReady);
  if(!await page.evaluate(()=>!!window.marked))await page.addScriptTag({path:path.join(path.dirname(require.resolve('marked')),'marked.umd.js')});
  assert.equal(await page.locator('script[src*="card-pdf.js"]').count(),0,'Export loads only on demand');
  await page.evaluate(()=>{
   const n=__pdfTest.makeNote('# My card\n\n## Section\n\nReadable **bold** text.\n\n| Name | Value |\n| --- | --- |\n| Item | 42 |\n\n'+Array.from({length:30},(_,i)=>`Paragraph ${i}: full card content.`).join('\n\n')+'\n\nFinal paragraph survives pagination.',0,0,600,false,null,'sans','100','slate');
   __pdfTest.select(n);
  });
  const opened=page.waitForEvent('popup');
  await page.evaluate(()=>{
   const open=window.open;window.open=(...args)=>{const tab=open(...args);tab.print=()=>{tab.printRequested=true};return tab};
   document.querySelector('[data-card-pdf]').click();
  });
  const popup=await opened;
  await popup.waitForFunction(()=>window.printRequested,null,{timeout:10000}).catch(async error=>{
   console.log(await popup.evaluate(()=>({title:document.title,body:document.body.innerHTML.slice(0,100),fonts:document.fonts.status,links:[...document.querySelectorAll('link')].map(link=>({href:link.href,sheet:!!link.sheet})),print:String(window.print)})),errors);throw error;
  });
  assert.equal(await popup.locator('.cardactions').count(),0);
  assert.equal(await popup.locator('canvas').count(),0,'No rasterization');
  assert.equal(await popup.locator('.pdf-background').count(),1,'Village is an independent backdrop');
  await popup.emulateMedia({media:'print'});
  assert.equal(await popup.locator('.pdf-card').evaluate(el=>getComputedStyle(el).paddingLeft),'24px','Print retains inner padding');
  assert.equal(await popup.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
  assert.equal(await page.locator('#canvas').getAttribute('data-background'),'light');
  assert.equal(await page.locator('#saveCanvas').getAttribute('aria-label'),'Save canvas');
  const data=await popup.pdf({preferCSSPageSize:true,printBackground:false});
  const pdfjs=await import(require('node:url').pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.mjs')).href);
  const pdf=await pdfjs.getDocument({data:new Uint8Array(data)}).promise;
  let text='';
  for(let i=1;i<=pdf.numPages;i++)text+=(await (await pdf.getPage(i)).getTextContent()).items.map(item=>item.str).join(' ');
  assert.ok(text.includes('Readable')&&text.includes('bold')&&text.includes('text.'),'Text remains selectable');
  assert.ok(text.includes('Final paragraph survives pagination.'),'Full content exported');
  assert.ok(text.includes('Item')&&text.includes('42'),'Table exported');
  assert.ok(pdf.numPages>1,'Long cards paginate');
  const firstPage=await pdf.getPage(1),firstText=await firstPage.getTextContent();
  assert.ok(firstText.items.filter(item=>item.str.trim()).every(item=>item.transform[4]>=60),'Text has page margin plus inner padding');
  assert.ok(data.length<500000,'Only the background is an image; text stays compact');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({passed:true,bytes:data.length,pages:pdf.numPages,selectableText:true}));
  if(process.env.PDF_OUTPUT)fs.writeFileSync(process.env.PDF_OUTPUT,data);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve))}
})().catch(error=>{console.error(error);process.exitCode=1});
