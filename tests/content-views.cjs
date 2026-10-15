const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const name=req.url==='/'?'index.html':req.url.slice(1);
  if(!['index.html','app.js','styles.css'].includes(name)){res.writeHead(404).end();return}
  let body=fs.readFileSync(path.join(root,name),'utf8');
  if(name==='app.js')body=body.replace(/\}\)\(\);\s*$/,'window.__content={state,makeNote,makeMap,select,focusSelected,layoutCards,updateCardHeading,deleteNote,openMapTab,openCardTab,wrapCodeLines,enableMapCameraFrames,ensureFontLoaded};})();');
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(body);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.route('https://**/*',r=>r.request().url().includes('/marked@')?r.fulfill({path:path.join(path.dirname(require.resolve('marked')),'marked.umd.js'),contentType:'text/javascript'}):r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
  const cameraFrames=await page.evaluate(async()=>{
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');document.body.append(svg);
   let paints=0,last=null,listener=function(event){paints++;last=event.transform;};
   const zoom={on(name,handler){if(arguments.length===1)return listener;listener=handler;return this}};
   const cleanup=__content.enableMapCameraFrames(svg,{zoom});
   for(let i=0;i<120;i++)listener.call(svg,{transform:i});
   const immediate=paints;
   await new Promise(requestAnimationFrame);
   const committed={paints,last};
   listener.call(svg,{transform:999});cleanup();
   await new Promise(requestAnimationFrame);svg.remove();
   return {immediate,...committed,afterCleanup:paints};
  });
  assert.deepEqual(cameraFrames,{immediate:0,paints:1,last:119,afterCleanup:1});
  const typography=await page.evaluate(async()=>{
   const n=__content.makeNote('# Main heading\n\nBody text\n\n## Section\n\n### Topic\n\n#### Detail\n\n##### Minor\n\n###### Note',0,0,600,false,null,'sans','125');
   const headings=[...n.el.querySelectorAll('.cardbody h1,.cardbody h2,.cardbody h3,.cardbody h4,.cardbody h5,.cardbody h6')];
   const sizes=headings.map(el=>parseFloat(getComputedStyle(el).fontSize));
   const weights=headings.map(el=>getComputedStyle(el).fontWeight);
   const body=parseFloat(getComputedStyle(n.el.querySelector('.cardbody p')).fontSize);
   const first=headings[0].textContent;__content.deleteNote(n);
   const requests=[],original=document.fonts.load;
   document.fonts.load=async spec=>{requests.push(spec);return []};
   const a=__content.ensureFontLoaded('sacramento'),b=__content.ensureFontLoaded('sacramento');
   document.querySelector('#card-font-sacramento').dispatchEvent(new Event('load'));
   await a;document.fonts.load=original;
   return {first,sizes,weights,body,shared:a===b,links:document.querySelectorAll('#card-font-sacramento').length,requests};
  });
  assert.equal(typography.first,'Main heading');
  assert.deepEqual(typography.sizes,[45,36.25,31.25,27.5,25,23.75]);
  assert.ok(typography.sizes.every(size=>size>typography.body));
  assert.ok(typography.weights.every(weight=>weight==='700'));
  assert.ok(typography.shared);assert.equal(typography.links,1);assert.equal(typography.requests.length,2);
  const topicId=await page.evaluate(()=>__content.makeNote('# Topics\n\n## First\n\nText\n\n### Repeated\n\nText\n\n## Repeated\n\n```text\n## Not a topic\n```',0,0,600,false).id);
  const expand=page.getByRole('button',{name:'Subtopics: Topics',exact:true});
  await expand.click();
  assert.equal(await expand.getAttribute('aria-expanded'),'true');
  assert.deepEqual(await page.locator(`#index-topics-${topicId} .index-subtopic`).allTextContents(),['First','Repeated','Repeated']);
  const nestedExpand=page.getByRole('button',{name:'Subtopics: First',exact:true});
  assert.equal(await nestedExpand.getAttribute('aria-expanded'),'false');
  await nestedExpand.click();assert.equal(await nestedExpand.getAttribute('aria-expanded'),'true');
  assert.ok(await page.locator(`#index-topics-${topicId} .index-topic-children .index-subtopic`).isVisible());
  await nestedExpand.click();assert.ok(await page.locator(`#index-topics-${topicId} .index-topic-children`).isHidden());
  await page.locator(`#index-topics-${topicId} .index-subtopic`).last().click();
  await page.waitForTimeout(500);
  const topicPosition=await page.evaluate(()=>document.querySelector('.index-target').getBoundingClientRect().top);
  assert.ok(Math.abs(topicPosition-110)<1,`Subtopic position: ${topicPosition}`);
  await expand.click();assert.equal(await expand.getAttribute('aria-expanded'),'false');
  await page.evaluate(()=>{
   Object.assign(__content.state,{x:80,y:70,scale:1,targetX:80,targetY:70,targetScale:1});
   document.querySelector('#world').style.transform='translate(80px,70px) scale(1)';
   document.body.classList.add('toolbar-hidden');
  });
  await page.evaluate(id=>__content.state.notes.find(n=>n.id===id).el.dataset.testCard='header',topicId);
  const card=page.locator('[data-test-card="header"]');
  const resize=card.locator('.resize.right');
  assert.ok(await resize.isVisible(),'Resize stays available with toolbar hidden');
  const beforeResize=await card.boundingBox(),handle=await resize.boundingBox();
  await page.mouse.move(handle.x+handle.width/2,handle.y+60);await page.mouse.down();
  await page.mouse.move(handle.x+handle.width/2+80,handle.y+60,{steps:8});await page.mouse.up();
  assert.equal(Math.round((await card.boundingBox()).width),Math.round(beforeResize.width+80));
  await page.evaluate(()=>document.body.classList.remove('toolbar-hidden'));
  const header=await card.locator('.cardbar').boundingBox(),actions=await card.locator('.cardactions').boundingBox();
  assert.ok(actions.y+actions.height<=header.y+header.height,'Controls fit inside header');
  assert.equal(await card.evaluate(el=>getComputedStyle(el).borderRadius),'16px');
  if(process.env.HEADER_SCREENSHOT){
   await page.evaluate(id=>{
    const n=__content.state.notes.find(n=>n.id===id),s=__content.state;
    Object.assign(s,{x:100-n.x,y:70-n.y,scale:1});
    document.querySelector('#world').style.transform=`translate(${s.x}px,${s.y}px) scale(1)`;
   },topicId);
   await page.waitForTimeout(150);
   await page.screenshot({path:process.env.HEADER_SCREENSHOT});
  }
  for(const type of ['note','map']){
   await page.evaluate(()=>document.body.classList.remove('controls-hidden','toolbar-hidden'));
   await page.waitForTimeout(300);
   const frameId=type==='note'?topicId:await page.evaluate(()=>__content.makeMap('# Map\n\n## Branch',0,0,700,600,false).id);
   await page.evaluate(async id=>{const n=__content.state.notes.find(n=>n.id===id);__content.select(n);await __content.focusSelected('fit')},frameId);
   await page.waitForFunction(()=>!__content.state.raf);
   const frame=await page.evaluate(id=>{
    const r=__content.state.notes.find(n=>n.id===id).el.getBoundingClientRect();
    return {top:r.top,bottom:innerHeight-r.bottom,left:r.left,indexRight:document.querySelector('#cardIndex').getBoundingClientRect().right,right:r.right,trayLeft:document.querySelector('.toolbar').getBoundingClientRect().left};
   },frameId);
   assert.ok(Math.abs(frame.top-frame.bottom)<1.1,`${type} vertical fit is balanced: ${JSON.stringify(frame)}`);
   assert.ok(frame.top>=23.9&&frame.left>=frame.indexRight+23.9&&frame.right<=frame.trayLeft-23.9,`${type} fits between panels: ${JSON.stringify(frame)}`);
   if(type==='map')await page.evaluate(id=>__content.deleteNote(__content.state.notes.find(n=>n.id===id)),frameId);
  }
  const reorderIds=await page.evaluate(()=>['Second card','Third card'].map(title=>__content.makeNote('# '+title,0,0,600,false).id));
  await page.locator(`[data-index-card-id="${reorderIds[1]}"] .index-reorder`).dragTo(page.locator(`[data-index-card-id="${topicId}"] .index-row`),{targetPosition:{x:45,y:4}});
  assert.deepEqual(await page.evaluate(()=>__content.state.notes.map(n=>n.id)),[reorderIds[1],topicId,reorderIds[0]]);
  await page.locator(`[data-index-card-id="${reorderIds[1]}"] .index-reorder`).focus();
  await page.keyboard.press('Alt+ArrowDown');
  assert.deepEqual(await page.evaluate(()=>__content.state.notes.map(n=>n.id)),[topicId,reorderIds[1],reorderIds[0]]);
  await page.locator(`[data-index-card-id="${reorderIds[1]}"] .index-reorder`).dragTo(page.locator(`[data-index-card-id="${reorderIds[0]}"] .index-row`),{targetPosition:{x:45,y:45}});
  assert.deepEqual(await page.evaluate(()=>__content.state.notes.map(n=>n.id)),[topicId,...reorderIds]);
  await page.waitForFunction(ids=>JSON.parse(localStorage.getItem('reflatex')).notes.map(n=>n.id).join(',')===ids.join(','),[topicId,...reorderIds]);
  for(const id of reorderIds)await page.evaluate(id=>__content.deleteNote(__content.state.notes.find(n=>n.id===id)),id);
  await page.evaluate(id=>__content.deleteNote(__content.state.notes.find(n=>n.id===id)),topicId);
  const result=await page.evaluate(()=>{
   const t=__content;
   const long='const message = "'+'long_word_'.repeat(40)+'";';
   const table='| '+Array.from({length:25},(_,i)=>'Column'+i).join(' | ')+' |\n| '+Array(25).fill('---').join(' | ')+' |\n| '+Array(25).fill('value').join(' | ')+' |';
   const md='```text\n# Fake heading\n```\n\n## Actual **heading**\n\n```js\n'+long+'\n  return message;\n```\n\n'+table;
   const n=t.makeNote(md,0,0,600,false,null,'sans','125','ocean');
   t.layoutCards();
   const pre=n.el.querySelectorAll('pre')[1],code=pre.querySelector('code'),lines=code.querySelectorAll('.code-line');
   const width=n.el.offsetWidth;
   n.el.style.width='540px';n.width=540;t.layoutCards();
   const wrapped=lines[0].offsetHeight>parseFloat(getComputedStyle(code).lineHeight)*2;
   const tableRegion=n.el.querySelector('.table-scroll');
   const copy=code.textContent;
   const nested=document.createElement('code');nested.innerHTML='<span class="hljs-string">first\nsecond</span>\nthird';t.wrapCodeLines(nested);
   window.__popups=[];window.open=()=>({document:{write:html=>__popups.push(html),close(){}}});
   const themes=['default','purple','warm','ocean','forest','sunset','slate'];
   for(const dark of [false,true])for(const theme of themes){
    document.body.classList.toggle('dark',dark);n.mapColor=theme;n.el.dataset.mapColor=theme;
    t.openCardTab(n);t.openMapTab(n);
   }
   return {id:n.id,width,resized:n.el.offsetWidth,wrapped,codeFits:code.scrollWidth<=code.clientWidth+1,tableContained:tableRegion.clientWidth<n.el.clientWidth,tableScrolls:tableRegion.scrollWidth>tableRegion.clientWidth,copy,source:long+'\n  return message;',nestedText:nested.textContent,nestedSpans:nested.querySelectorAll('.code-line .hljs-string').length,popups:__popups};
  });
  assert.equal(result.width,600);assert.equal(result.resized,540);assert.ok(result.wrapped&&result.codeFits&&result.tableContained&&result.tableScrolls);
  assert.equal(result.copy.trimEnd(),result.source);assert.equal(result.nestedText,'first\nsecond\nthird');assert.equal(result.nestedSpans,2);
  await page.waitForFunction(()=>document.querySelector('#indexEntries button[data-card-id]'));
  assert.equal(await page.locator('#indexEntries button[data-card-id] span').textContent(),'Actual heading');
  await page.locator('#indexEntries button[data-card-id]').click();
  assert.equal(await page.evaluate(()=>__content.state.selected.id),result.id);
  assert.equal(await page.evaluate(()=>__content.state.spaceFocusStep),2);
  await page.keyboard.press('b');
  assert.ok(await page.locator('#cardIndex').isHidden());
  assert.ok(await page.locator('#toolbar').isHidden());
  assert.ok(await page.locator('.zoom').isHidden());
  await page.keyboard.press('b');
  assert.ok(await page.locator('#cardIndex').isVisible());
  await page.evaluate(()=>{const n=__content.state.notes[0];n.md='# Renamed';__content.updateCardHeading(n)});
  await page.waitForFunction(()=>document.querySelector('#indexEntries button[data-card-id] span').textContent==='Renamed');
  for(const [md,title] of [
   ['Overview\n========\n\n## Details','Overview'],
   ['Intro paragraph\n\nSecond-level *heading*\n----------------------','Second-level heading'],
   ['#\n\n## Useful title','Useful title'],
   ['    # Code only\n\n```md\n## Also code\n```\n\n## Real title','Real title'],
   ['No heading here',`Card ${result.id}`]
  ]){
   await page.evaluate(md=>{const n=__content.state.notes[0];n.md=md;__content.updateCardHeading(n)},md);
   await page.waitForFunction(title=>document.querySelector('#indexEntries button[data-card-id] span').textContent===title,title);
  }
  await page.locator('#closeIndex').click();assert.ok(await page.locator('#cardIndex').isHidden());
  await page.locator('#toggleIndex').click();assert.ok(await page.locator('#cardIndex').isVisible());
  await page.keyboard.press('Tab');assert.ok(await page.locator('#cardIndex').isHidden());
  await page.keyboard.press('Tab');assert.ok(await page.locator('#cardIndex').isVisible());
  assert.ok(await page.locator('#indexEntries button[data-card-id]').evaluate(el=>el===document.activeElement));
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>__content.state.selected.id),result.id);
  await page.keyboard.press('Escape');assert.ok(await page.locator('#cardIndex').isHidden());
  await page.locator('#toggleIndex').click();
  await page.locator('.index-rename').click();
  await page.getByRole('textbox',{name:'Edit card heading'}).fill('Index title');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  assert.equal(await page.evaluate(()=>__content.state.notes[0].md),'# Index title\n\nNo heading here');
  await page.locator('.index-rename').click();
  await page.getByRole('textbox',{name:'Edit card heading'}).fill('Discard this');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#indexEntries button[data-card-id] span').textContent(),'Index title');
  await page.evaluate(()=>{const n=__content.state.notes[0];n.md='Intro\n\nOriginal\n--------\n\nBody stays';__content.updateCardHeading(n)});
  await page.waitForFunction(()=>document.querySelector('#indexEntries button[data-card-id] span').textContent==='Original');
  await page.locator('.index-rename').click();
  await page.getByRole('textbox',{name:'Edit card heading'}).fill('Revised');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>__content.state.notes[0].md),'Intro\n\n## Revised\n\nBody stays');
  for(const html of result.popups){
   for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
   assert.ok(html.includes('data-font-size="125"'));assert.ok(html.includes('styles.css'));
   assert.ok(!html.includes('feTurbulence')&&!html.includes('feDisplacementMap'));
   if(html.includes('Markmap.create'))assert.ok(html.includes('enableMapCameraFrames(svg,map)'));
  }
  const preview=await browser.newPage({viewport:{width:390,height:844}});
  await preview.route('https://**/*',r=>r.abort());
  // Inspect popup styling without relying on unavailable remote Markmap scripts.
  const strip=html=>html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  const cardHtml=result.popups[20]; // dark ocean
  await preview.setContent(strip(cardHtml),{waitUntil:'networkidle'});
  assert.ok(await preview.evaluate(()=>document.querySelector('.card').getBoundingClientRect().right<=innerWidth));
  if(process.env.TEST_SCREENSHOT)await preview.screenshot({path:process.env.TEST_SCREENSHOT});
  const mapHtml=result.popups[21];
  await preview.setContent(strip(mapHtml),{waitUntil:'networkidle'});
  const mapStyle=await preview.evaluate(()=>{
   const div=document.createElement('div');div.className='markmap-node';div.innerHTML='<pre><code>long_code_line_'.repeat(1)+'<span class="hljs-string">"value"</span></code></pre>';
   document.querySelector('.map-pane').appendChild(div);
   const pre=div.querySelector('pre'),code=div.querySelector('code');
   return{dark:document.body.classList.contains('dark'),background:getComputedStyle(pre).backgroundColor,color:getComputedStyle(code).color,wrap:getComputedStyle(code).whiteSpace,theme:document.querySelector('.card').dataset.mapColor};
  });
  assert.ok(mapStyle.dark);assert.equal(mapStyle.theme,'ocean');assert.equal(mapStyle.wrap,'pre-wrap');assert.equal(mapStyle.color,'rgb(228, 234, 243)');
  for(const context of [page,preview]){
   const tableSizing=await context.evaluate(()=>{
    const card=document.createElement('article');card.className='card map-card';
    card.style.cssText='width:1400px;height:600px;position:fixed;top:0;left:0';
    const cols=Array.from({length:6},(_,i)=>`<th>Column ${i+1}</th>`).join('');
    const cells=Array.from({length:6},()=>'<td>Readable table cell with several words</td>').join('');
    card.innerHTML=`<div class="cardbody"><svg xmlns="http://www.w3.org/2000/svg" style="--markmap-max-width:300px;width:1400px;height:600px"><style>.markmap-foreign>div{width:var(--markmap-max-width)}.markmap-foreign>div>div{display:inline-block}</style><g class="markmap-node"><foreignObject class="markmap-foreign" width="1400" height="500"><div xmlns="http://www.w3.org/1999/xhtml"><div><table><thead><tr>${cols}</tr></thead><tbody><tr>${cells}</tr></tbody></table></div></div></foreignObject></g><g class="markmap-node"><foreignObject class="markmap-foreign" width="300" height="100"><div xmlns="http://www.w3.org/1999/xhtml"><div>Ordinary branch</div></div></foreignObject></g></svg></div>`;
    document.body.append(card);
    const nodes=card.querySelectorAll('foreignObject');
    const result={width:nodes[0].firstElementChild.firstElementChild.scrollWidth,allowance:getComputedStyle(nodes[0].firstElementChild).width,textAllowance:getComputedStyle(nodes[1].firstElementChild).width,cellWidth:card.querySelector('td').getBoundingClientRect().width};
    card.remove();return result;
   });
   assert.ok(tableSizing.width>=800,`Table node has room: ${JSON.stringify(tableSizing)}`);
   assert.equal(tableSizing.allowance,'1200px');assert.equal(tableSizing.textAllowance,'300px');assert.ok(tableSizing.cellWidth>=120);
  }
  await page.evaluate(()=>__content.deleteNote(__content.state.notes[0]));
  await page.waitForFunction(()=>!document.querySelector('#indexEntries button[data-card-id]'));
  console.log(JSON.stringify({passed:true,width:result.width,resized:result.resized,wrapped:result.wrapped,themePopups:result.popups.length,mapStyle,index:'create/select/rename/delete/collapse passed'}));
 }finally{await browser.close();await new Promise(r=>server.close(r))}
})().catch(e=>{console.error(e);process.exitCode=1});
