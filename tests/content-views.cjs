const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
(async()=>{
 const server=http.createServer((req,res)=>{
  const name=req.url==='/'?'index.html':req.url.slice(1);
  if(!['text-highlights.js','index.html','app.js','styles.css'].includes(name)){res.writeHead(404).end();return}
  let body=fs.readFileSync(path.join(root,name),'utf8');
  if(name==='app.js')body=body.replace(/\}\)\(\);\s*$/,'window.__content={state,markmapOptions,snapshot,restore,undo,renderCardIndex,showTextHighlighter,canvasPayload,resizeSelectedWidth,setCameraImmediate,focusViewport,editNote,closeEditor,makeNote,makeMap,select,focusSelected,layoutCards,updateCardHeading,deleteNote,openMapTab,openCardTab,wrapCodeLines,enableMapCameraFrames,enablePenMapWheel,ensureFontLoaded};})();');
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');res.end(body);
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  await page.route('https://**/*',r=>r.request().url().includes('/marked@')?r.fulfill({path:path.join(path.dirname(require.resolve('marked')),'marked.umd.js'),contentType:'text/javascript'}):r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}`,{waitUntil:'networkidle'});
  assert.equal(await page.locator('#defaultCardFont').inputValue(),'poppins');
  const branchControls=await page.evaluate(async()=>{
   const n=__content.makeMap('# Branch controls\n\n## One\n### Nested\n#### Deep\n## Two',0,0,800,500,false);
   const leaf={payload:{}},deep={payload:{fold:1},children:[leaf]},branch={payload:{fold:0},children:[deep]},root={payload:{fold:0},children:[branch,{payload:{fold:1},children:[{payload:{}}]}]};
   let renders=0,fits=0;const map={setData:async()=>{renders++},fit:async()=>{fits++}};
   n.mapReady=Promise.resolve();n.mapIndexRoot=root;n.mapInstance=map;__content.select(n);
   const md=n.md,camera=[__content.state.x,__content.state.y,__content.state.scale];
   await n.el.querySelector('[data-map-fold="collapse"]').onclick();
   const collapsed=[root,branch,deep,root.children[1]].map(node=>node.payload.fold);
   await n.el.querySelector('[data-map-fold="expand"]').onclick();
   const expanded=[root,branch,deep,root.children[1]].map(node=>node.payload.fold);
   const result={collapsed,expanded,renders,fits,markdown:n.md===md,instance:n.mapInstance===map,camera:JSON.stringify(camera)===JSON.stringify([__content.state.x,__content.state.y,__content.state.scale]),enabled:!n.el.querySelector('[data-map-fold="expand"]').disabled};
   __content.deleteNote(n);return result;
  });
  assert.deepEqual(branchControls.collapsed,[1,1,1,1],'Collapse updates all branches, including hidden descendants');
  assert.deepEqual(branchControls.expanded,[0,0,0,0],'Expand opens every nested branch');
  assert.equal(branchControls.renders,2);assert.equal(branchControls.fits,0);
  assert.ok(branchControls.markdown&&branchControls.instance&&branchControls.camera&&branchControls.enabled,'Branch controls preserve Markdown, instance and camera');
  const hierarchyColors=await page.evaluate(()=>{
   const n=__content.makeMap('# Colored hierarchy',0,0,800,500,false,null,'ocean');
   const options=__content.markmapOptions(n),svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
   for(let depth=0;depth<6;depth++){
    const group=document.createElementNS(svg.namespaceURI,'g');group.classList.add('markmap-node');
    const circle=document.createElementNS(svg.namespaceURI,'circle');circle.setAttribute('stroke',options.color({state:{depth}}));circle.setAttribute('fill','#fff');group.append(circle);svg.append(group);
   }
   n.el.querySelector('.cardbody').append(svg);
   const circles=[...svg.querySelectorAll('circle')],light=circles.map(circle=>getComputedStyle(circle).stroke),fills=circles.map(circle=>getComputedStyle(circle).fill);
   document.body.classList.add('dark');const dark=circles.map(circle=>getComputedStyle(circle).stroke);document.body.classList.remove('dark');
   __content.deleteNote(n);return {light,dark,fills,sibling:options.color({state:{depth:2}})===options.color({state:{depth:2}})};
  });
  assert.equal(new Set(hierarchyColors.light).size,6,'Every tested hierarchy depth has a distinct branch color');
  assert.equal(new Set(hierarchyColors.dark).size,6,'Hierarchical colors remain distinct in dark mode');
  assert.ok(hierarchyColors.light.every((color,i)=>color!==hierarchyColors.dark[i]),'Light/dark branch contrast updates through CSS');
  assert.ok(hierarchyColors.fills.every(color=>color!=='rgb(255, 255, 255)'),'Light mode node markers have tinted fills');
  const customId=await page.evaluate(()=>{const n=__content.makeNote('# Custom color',0,0,600,false);__content.select(n);return n.id});
  const picker=page.locator(`[data-index-card-id="${customId}"]`);
  await page.locator('.card [data-card-color-button]').click();
  await page.locator('.card-color-dialog input[aria-label="Hex color"]').fill('#d14e8a');
  await page.locator('.card-color-dialog .color-apply').click();
  assert.equal(await page.evaluate(()=>__content.canvasPayload().notes[0].mapColor),'#d14e8a');
  assert.equal(await page.locator('.card').getAttribute('data-custom-color'),'true');
  assert.equal(await page.locator('.card').evaluate(el=>el.style.getPropertyValue('--card-accent')),'#d14e8a');
  const lightColor=await page.locator('.card').evaluate(el=>getComputedStyle(el).backgroundColor);
  await page.evaluate(()=>document.body.classList.add('dark'));
  const darkColor=await page.locator('.card').evaluate(el=>getComputedStyle(el).backgroundColor);
  assert.notEqual(darkColor,lightColor,'Custom card tint changes in dark mode');
  assert.equal(await page.locator('.card').evaluate(el=>el.style.getPropertyValue('--custom-card-color')),'#d14e8a','Dark mode preserves the chosen custom color');
  await page.evaluate(()=>document.body.classList.remove('dark'));
  await page.evaluate(()=>{__content.restore(__content.snapshot());__content.renderCardIndex()});
  assert.equal(await page.locator('.card input[data-card-color]').inputValue(),'#d14e8a','Custom color survives restoration');
  assert.equal(await page.locator('.index-entry').evaluate(el=>el.style.getPropertyValue('--card-accent')),'#d14e8a');
  await page.evaluate(()=>{__content.editNote(__content.state.notes[0])});
  assert.equal(await page.locator('#editorCardColor').inputValue(),'#d14e8a','Editor keeps custom colors');
  await page.evaluate(()=>__content.closeEditor());
  await page.locator('.card select[data-map-color]').evaluate(el=>{el.value='ocean';el.dispatchEvent(new Event('change',{bubbles:true}))});
  assert.equal(await page.locator('.card').getAttribute('data-custom-color'),'false','Preset clears custom overrides');
  assert.equal(await page.locator('.card').evaluate(el=>el.style.getPropertyValue('--card-accent')),'');
  await page.evaluate(()=>__content.select(__content.state.notes[0]));
  await page.locator('.card .custom-select[data-control="theme"] .custom-select-trigger').click();
  await page.locator('.custom-select-menu [data-value="custom"]').click();
  assert.equal(await page.locator('.card-color-dialog').count(),1,'Custom picker is always available from presets');
  await page.locator('.card-color-dialog input[aria-label="Hex color"]').press('Escape');
  await page.evaluate(()=>{__content.restore(JSON.stringify({notes:[]}));__content.renderCardIndex()});
  const groupCards=await page.evaluate(()=>{
   const a=__content.makeNote('# Group alpha',0,0,600,false),b=__content.makeNote('# Group beta',640,0,600,false);
   __content.renderCardIndex();return {ids:[a.id,b.id],stamp:a.createdAt};
  });
  assert.ok(Date.parse(groupCards.stamp));
  for(const id of groupCards.ids)await page.locator(`[data-index-card-id="${id}"] button[data-card-id]`).click({modifiers:['Control']});
  await page.keyboard.press('Control+g');
  const name=page.locator('.index-group-header input[aria-label="Group name"]');
  await name.fill('Physics');await name.press('Tab');
  await page.locator('.index-group-header input[type="color"]').evaluate(el=>{el.value='#2266aa';el.dispatchEvent(new Event('change',{bubbles:true}))});
  await page.locator('.index-group-toggle').click();
  assert.equal(await page.locator('.index-entry:not([hidden])').count(),0);
  await page.evaluate(()=>{__content.restore(__content.snapshot());__content.renderCardIndex()});
  assert.equal(await page.locator('.index-group-toggle').getAttribute('aria-expanded'),'false','Collapsed state survives restoration');
  assert.equal(await page.locator('.index-group-header:not([hidden])').count(),1);
  await page.locator('#canvasSearch').fill('Group alpha');
  await page.waitForFunction(()=>document.querySelectorAll('.index-entry:not([hidden])').length===1);
  assert.equal(await page.locator('.index-entry:not([hidden])').count(),1,'Search reveals matches in collapsed groups');
  await page.locator('#canvasSearch').fill('');
  assert.equal(await page.locator('.index-entry:not([hidden])').count(),0);
  await page.locator('.index-group-toggle').click();
  const grouped=await page.evaluate(()=>__content.canvasPayload());
  assert.equal(grouped.groups[0].name,'Physics');assert.equal(grouped.groups[0].color,'#2266aa');assert.deepEqual(grouped.groups[0].cards,groupCards.ids);
  await page.evaluate(()=>{const saved=__content.snapshot();__content.restore(saved);__content.renderCardIndex()});
  assert.equal(await name.inputValue(),'Physics');
  if(process.env.GROUP_SCREENSHOT)await page.screenshot({path:process.env.GROUP_SCREENSHOT});
  assert.equal(await page.evaluate(()=>__content.state.notes[0].createdAt),groupCards.stamp);
  await page.locator('[data-index-view="palette"]').click();
  assert.equal(await page.locator('.index-group-header').count(),1);
  const dragId=await page.evaluate(()=>{const n=__content.makeNote('# Drag into group',0,0,600,false);__content.renderCardIndex();return n.id});
  await page.locator(`[data-index-card-id="${dragId}"] button[data-card-id]`).dragTo(page.locator('.index-group-header[data-group-id]'));
  assert.ok(await page.evaluate(id=>__content.canvasPayload().groups[0].cards.includes(id),dragId),'Palette drag onto a group updates membership');
  await page.locator(`[data-index-card-id="${dragId}"] button[data-card-id]`).dragTo(page.locator(`[data-index-card-id="${groupCards.ids[1]}"] button[data-card-id]`),{targetPosition:{x:2,y:10}});
  assert.deepEqual(await page.evaluate(()=>__content.state.notes.map(n=>n.id)),[groupCards.ids[0],dragId,groupCards.ids[1]],'Palette dragging reorders grouped tiles');
  await page.locator(`[data-index-card-id="${groupCards.ids[0]}"] button[data-card-id]`).click({modifiers:['Control']});
  await page.locator(`[data-index-card-id="${groupCards.ids[1]}"] button[data-card-id]`).click({modifiers:['Shift']});
  assert.equal(await page.locator('.index-entry.group-picked').count(),3,'Shift selects the visual range in palette view');
  for(const id of [groupCards.ids[0],dragId,groupCards.ids[1]])await page.locator(`[data-index-card-id="${id}"] button[data-card-id]`).click({modifiers:['Control']});
  assert.equal(await page.locator('.index-entry.group-picked').count(),0,'Ctrl toggles individual entries out of a range');
  await page.locator(`[data-index-card-id="${dragId}"] button[data-card-id]`).click({modifiers:['Control']});
  await page.keyboard.press('Control+g');
  assert.ok(await page.evaluate(id=>!__content.canvasPayload().groups[0].cards.includes(id),dragId));
  await page.evaluate(id=>__content.deleteNote(__content.state.notes.find(n=>n.id===id)),dragId);
  await page.locator('#canvasSearch').fill('Group alpha');
  await page.waitForFunction(()=>document.querySelectorAll('.index-entry:not([hidden])').length===1);
  assert.equal(await page.locator('.index-entry:not([hidden])').count(),1);
  await page.locator('#canvasSearch').fill('');
  await page.locator('[data-index-view="list"]').click();
  await page.locator('.index-group-header .index-group-count').click();
  await page.keyboard.press('Control+g');
  assert.equal(await page.locator('[aria-label="Remove group"]').count(),0,'No accidental dismantle button');
  assert.equal(await page.evaluate(()=>__content.canvasPayload().groups.length),0);
  await page.evaluate(()=>{__content.undo();__content.renderCardIndex()});
  assert.equal(await name.inputValue(),'Physics');
  await page.evaluate(()=>{__content.restore(JSON.stringify({notes:[]}));__content.renderCardIndex()});

  assert.equal(await page.locator('.zoom-settings').count(),0,'Settings moved to the navigation tray');
  const deletionSelection=await page.evaluate(()=>{
   const cards=Array.from({length:5},(_,i)=>__content.makeNote(`# Visit ${i}`,0,0,600,false));
   const [a,b,c,d,unvisited]=cards,selected=()=>__content.state.selected?.id??null;
   __content.select(a);__content.select(b);__content.select(c);__content.select(a);
   __content.deleteNote(a);const first=selected();
   __content.select(d);__content.deleteNote(c);const unaffected=selected();
   __content.deleteNote(d);const next=selected();
   __content.select(null);__content.select(b);__content.deleteNote(b);const exhausted=selected();
   __content.deleteNote(unvisited);
   return {first,expectedFirst:c.id,unaffected,expectedUnaffected:d.id,next,expectedNext:b.id,exhausted};
  });
  assert.equal(deletionSelection.first,deletionSelection.expectedFirst,'Deleting a revisited card returns to the last visited card, not the final canvas card');
  assert.equal(deletionSelection.unaffected,deletionSelection.expectedUnaffected,'Deleting another card preserves the current selection');
  assert.equal(deletionSelection.next,deletionSelection.expectedNext,'Deleted visits are skipped');
  assert.equal(deletionSelection.exhausted,null,'No visited survivor leaves the canvas selected');
  const controlIds=await page.evaluate(()=>{
   const a=__content.makeNote('# Selected card\n\nReading.',350,100,400,false),b=__content.makeNote('# Other card\n\nReading.',780,100,400,false);
   a.el.dataset.testControls='selected';b.el.dataset.testControls='other';
   __content.select(a);__content.setCameraImmediate(0,0,1);return [a.id,b.id];
  });
  const selectedControls=page.locator('[data-test-controls="selected"] [data-edit]');
  const otherControls=page.locator('[data-test-controls="other"] [data-edit]');
  const otherBounds=await page.locator('[data-test-controls="other"] .cardbar').boundingBox();
  await page.mouse.move(otherBounds.x+100,otherBounds.y+10);
  assert.ok(await selectedControls.isVisible(),'Selected card controls stay visible');
  assert.ok(await otherControls.isHidden(),'Hovering an unselected card does not reveal controls');
  await page.mouse.click(1200,800);
  assert.equal(await page.evaluate(()=>__content.state.selected),null,'Clicking the canvas clears card selection');
  await page.mouse.move(400,110);
  assert.ok(await selectedControls.isHidden(),'Canvas selection hides controls even when hovering a card');
  assert.ok(await otherControls.isHidden());
  await page.evaluate(ids=>{for(const id of ids)__content.deleteNote(__content.state.notes.find(n=>n.id===id))},controlIds);
  const stableHeaders=await page.evaluate(()=>{
   const results=[];
   for(const dark of [false,true]){
    document.body.classList.toggle('dark',dark);
    for(const type of ['note','map'])for(const title of ['# Academic note\n\nReadable text.','Readable text.'])for(const width of [300,550,600,700]){
     const n=type==='note'?__content.makeNote(title,0,0,width,false):__content.makeMap(title,0,0,width,600,false);
     const measure=()=>({height:n.el.offsetHeight,header:n.el.querySelector('.cardbar').offsetHeight,body:n.el.querySelector('.cardbody').offsetTop});
     __content.select(null);const before=measure();__content.select(n);const after=measure(),style=getComputedStyle(n.el);
     results.push({type,dark,width,before,after,radius:style.borderRadius,shadow:style.boxShadow,outline:style.outlineStyle,font:n.font});
     __content.deleteNote(n);
    }
   }
   document.body.classList.remove('dark');return results;
  });
  for(const row of stableHeaders){
   assert.deepEqual(row.after,row.before,`Selection keeps reading position: ${JSON.stringify(row)}`);
   assert.equal(row.radius,'4px');assert.equal(row.shadow,'none');assert.equal(row.outline,'none');assert.equal(row.font,'poppins');
  }
  const legacyFonts=await page.evaluate(()=>['cinzel','mono-typewriter','mono-azeret'].map(font=>{
   const n=__content.makeNote('Legacy note',0,0,600,false,null,font),value=n.font;__content.deleteNote(n);return value;
  }));
  assert.deepEqual(legacyFonts,['poppins','mono','mono']);
  assert.ok(!(await page.locator('#defaultCardFont option').allTextContents()).some(name=>['Cinzel','Space Mono','Azeret Mono'].includes(name)));
  const flip=await page.evaluate(()=>{
   const md='# Flip test\n\nKeep **Markdown** and $x^2$ unchanged.',n=__content.makeNote(md,0,0,600,false);
   const button=n.el.querySelector('[data-view]');button.click();const map={type:n.type,label:button.getAttribute('aria-label')};
   button.click();const note={type:n.type,label:button.getAttribute('aria-label'),md:n.md,dropdowns:n.el.querySelectorAll('select[data-view]').length};
   __content.deleteNote(n);return {md,map,note};
  });
  assert.equal(flip.map.type,'map');assert.equal(flip.map.label,'Switch to Markdown (K)');
  assert.equal(flip.note.type,'note');assert.equal(flip.note.label,'Switch to Markmap (K)');assert.equal(flip.note.md,flip.md);assert.equal(flip.note.dropdowns,0);
  await page.locator('#settings').click();await page.locator('#defaultCardFont').selectOption('lora');
  assert.equal(await page.evaluate(()=>localStorage.getItem('reflatex-default-font')),'lora');
  await page.keyboard.press('Escape');assert.ok(await page.locator('#globalSettings').isHidden());
  await page.reload({waitUntil:'networkidle'});
  assert.equal(await page.locator('#defaultCardFont').inputValue(),'lora','Default font persists across reopening');
  const customDefaults=await page.evaluate(()=>{
   const note=__content.makeNote('New note',0,0,600,false),map=__content.makeMap('# New map',0,0,700,600,false);
   const select=document.querySelector('#defaultCardFont');select.value='poppins';select.dispatchEvent(new Event('change'));
   const result=[note.font,map.font];__content.deleteNote(note);__content.deleteNote(map);return result;
  });
  assert.deepEqual(customDefaults,['lora','lora'],'Saved default applies to new cards; changing it preserves existing fonts');
  await page.route('**/test-web-image.svg',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="20"><rect width="40" height="20" fill="blue"/></svg>'}));
  const highlightId=await page.evaluate(()=>{
   const n=__content.makeNote('# Highlights\n\nRemember this important idea.',0,0,600,false,null,'mono','80','ocean');__content.select(n);
   const text=n.el.querySelector('.cardbody p').firstChild,range=document.createRange();range.setStart(text,14);range.setEnd(text,28);
   getSelection().removeAllRanges();getSelection().addRange(range);n.el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));return n.id;
  });
  await page.waitForTimeout(60);
  assert.equal(await page.locator('#textHighlighter').isVisible(),true,'Text selection opens the compact palette');
  await page.locator('#textHighlighter').waitFor({state:'visible'});
  const paletteSize=await page.locator('#textHighlighter').boundingBox();
  assert.ok(paletteSize.width<=160&&paletteSize.height<=32,'The palette is compact');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#textHighlighter').isVisible(),false,'Escape dismisses the palette');
  assert.equal(await page.evaluate(()=>getSelection().toString()),'important idea','Dismissing the palette keeps the reading selection');
  assert.equal(await page.locator('.card [data-text-highlight]').count(),0,'Cards do not carry individual highlight buttons');
  assert.equal(await page.locator('#highlightText').count(),0,'The tray has no added highlight button');
  await page.keyboard.press('Control+Shift+H');
  await page.locator('#textHighlighter').waitFor({state:'visible'});
  await page.getByRole('button',{name:'Theme highlight',exact:true}).click();
  const themedMark=page.locator('.card.selected mark.card-text-highlight');
  assert.equal(await themedMark.textContent(),'important idea');
  assert.equal(await themedMark.getAttribute('data-highlight'),'theme');
  const persisted=await page.evaluate(id=>{
   const entry=__content.canvasPayload().notes.find(n=>n.id===id),copy=__content.makeNote(entry.markdown,0,0,600,false,null,entry.font,entry.size,entry.mapColor,entry.mapFont,null,null,entry.highlights);
   const result={saved:entry.highlights.length===1&&!entry.markdown.includes('<mark'),restored:copy.el.querySelector('mark.card-text-highlight')?.textContent};__content.deleteNote(copy);return result;
  },highlightId);
  assert.ok(persisted.saved);assert.equal(persisted.restored,'important idea');
  await page.evaluate(()=>{__content.editNote(__content.state.selected);const source=document.querySelector('#source');source.value='Editable';source.focus();source.setSelectionRange(8,8)});
  await page.keyboard.press('Backspace');
  assert.equal(await page.locator('#source').inputValue(),'Editabl','Backspace edits source normally');
  assert.equal(await page.evaluate(()=>__content.state.selected.highlights.length),1,'Typing does not clear card highlights');
  await page.evaluate(()=>__content.closeEditor());
  for(const action of ['Blue highlight','Remove highlight']){
   await themedMark.evaluate(mark=>{const range=document.createRange();range.selectNodeContents(mark);getSelection().removeAllRanges();getSelection().addRange(range);mark.closest('.card').dispatchEvent(new PointerEvent('pointerup',{bubbles:true}))});
   await page.keyboard.press('Control+Shift+H');
   await page.locator('#textHighlighter').waitFor({state:'visible'});
   if(action==='Remove highlight')await page.keyboard.press('Backspace');
   else await page.getByRole('button',{name:action,exact:true}).click();
   if(action==='Blue highlight')assert.equal(await themedMark.getAttribute('data-highlight'),'blue');
  }
  assert.equal(await themedMark.count(),0);
  assert.equal(await page.evaluate(()=>__content.state.selected.md),'# Highlights\n\nRemember this important idea.');
  await page.evaluate(id=>__content.deleteNote(__content.state.notes.find(n=>n.id===id)),highlightId);
  const integrityId=await page.evaluate(()=>{
   const md='# Highlight integrity\n\nKeep **bold words** and [linked words](https://example.com) unchanged.';
   const n=__content.makeNote(md,0,0,600,false,null,'mono','80','ocean');__content.select(n);
   const p=n.el.querySelector('.cardbody p'),range=document.createRange();range.setStart(p.querySelector('strong').firstChild,0);range.setEnd(p.querySelector('a').firstChild,6);
   getSelection().removeAllRanges();getSelection().addRange(range);__content.showTextHighlighter();return n.id;
  });
  await page.getByRole('button',{name:'Theme highlight',exact:true}).click();
  const integrityMark=page.locator('.card.selected mark.card-text-highlight').first();
  assert.equal(await page.locator('.card.selected .cardbody p').textContent(),'Keep bold words and linked words unchanged.');
  assert.equal(await page.locator('.card.selected strong').textContent(),'bold words');
  assert.equal(await page.locator('.card.selected .cardbody a').getAttribute('href'),'https://example.com');
  for(const dark of [false,true]){
   await page.evaluate(dark=>document.body.classList.toggle('dark',dark),dark);
   const backgrounds=[];
   for(const color of ['Theme','Yellow','Green','Blue','Pink']){
    await integrityMark.evaluate(mark=>{const range=document.createRange();range.setStart(mark.firstChild,0);range.collapse(true);getSelection().removeAllRanges();getSelection().addRange(range);__content.showTextHighlighter()});
    await page.getByRole('button',{name:color+' highlight',exact:true}).click();
    assert.equal(await integrityMark.getAttribute('data-highlight'),color.toLowerCase());
    backgrounds.push(await integrityMark.evaluate(mark=>getComputedStyle(mark).backgroundColor));
    assert.equal(await page.locator('.card.selected .cardbody p').textContent(),'Keep bold words and linked words unchanged.');
   }
   assert.equal(new Set(backgrounds).size,5,'All five highlight colors are distinct: '+JSON.stringify({dark,backgrounds}));
  }
  await page.evaluate(()=>document.body.classList.remove('dark'));
  await integrityMark.evaluate(mark=>{const range=document.createRange();range.setStart(mark.firstChild,0);range.collapse(true);getSelection().removeAllRanges();getSelection().addRange(range);__content.showTextHighlighter()});
  await page.getByRole('button',{name:'Remove highlight',exact:true}).click();
  assert.equal(await page.evaluate(()=>__content.state.selected.md),'# Highlight integrity\n\nKeep **bold words** and [linked words](https://example.com) unchanged.');
  await page.evaluate(id=>__content.deleteNote(__content.state.notes.find(n=>n.id===id)),integrityId);
  const pasted=await page.evaluate(()=>{
   const fence=String.fromCharCode(96).repeat(3);
   const md='# Pasted code\n\n<pre><code><span class="hljs-keyword">const</span> value = 42;\nreturn value;</code></pre>\n\n'+fence+'js\nconst value = 42;\nreturn value;\n'+fence+'\n\n    const value = 42;\n    return value;\n\n<pre>const value = 42;\nreturn value;</pre>';
   const n=__content.makeNote(md,0,0,600,false,null,'mono','80','ocean');__content.select(n);
   const blocks=[...n.el.querySelectorAll('pre')];
   const styles=[];
   for(const dark of [false,true]){
    document.body.classList.toggle('dark',dark);
    styles.push(blocks.map(pre=>({background:getComputedStyle(pre).backgroundColor,font:getComputedStyle(pre.querySelector('code')).fontSize,lines:pre.querySelectorAll('.code-line').length,numbered:pre.classList.contains('line-numbered')})));
   }
   document.body.classList.remove('dark');
   const token=blocks[0].querySelector('.hljs-keyword').firstChild,range=document.createRange();range.selectNodeContents(token);
   getSelection().removeAllRanges();getSelection().addRange(range);__content.showTextHighlighter();
   return {id:n.id,md,text:blocks[0].textContent,styles};
  });
  for(const styles of pasted.styles){
   assert.equal(styles.length,4,'HTML, fenced, indented, and plain preformatted pasted code render');
   assert.ok(styles.every(style=>style.numbered&&style.lines===2));
   assert.equal(new Set(styles.map(style=>style.background)).size,1,'All code formats share the current theme');
   assert.equal(new Set(styles.map(style=>style.font)).size,1);
  }
  await page.getByRole('button',{name:'Green highlight',exact:true}).click();
  assert.equal(await page.locator('.card.selected pre .hljs-keyword mark').textContent(),'const');
  assert.equal(await page.evaluate(()=>__content.state.selected.md),pasted.md);
  assert.equal(await page.locator('.card.selected pre').first().textContent(),pasted.text);
  const codeRestored=await page.evaluate(()=>{
   const entry=__content.canvasPayload().notes.find(n=>n.id===__content.state.selected.id);
   const copy=__content.makeNote(entry.markdown,0,0,600,false,null,entry.font,entry.size,entry.mapColor,entry.mapFont,null,null,entry.highlights);
   const result=copy.el.querySelector('pre .hljs-keyword mark')?.textContent;
   __content.deleteNote(copy);return result;
  });
  assert.equal(codeRestored,'const','Code annotations survive saving and reopening');
  await page.waitForTimeout(50);
  await page.locator('.card.selected pre mark').evaluate(mark=>{
   const range=document.createRange();range.selectNodeContents(mark);getSelection().removeAllRanges();getSelection().addRange(range);__content.showTextHighlighter();
  });
  await page.getByRole('button',{name:'Remove highlight',exact:true}).click();
  assert.equal(await page.locator('.card.selected pre mark').count(),0);
  assert.equal(await page.evaluate(()=>__content.state.selected.md),pasted.md);
  await page.evaluate(id=>__content.deleteNote(__content.state.notes.find(n=>n.id===id)),pasted.id);
  const equation=await page.evaluate(()=>{
   // KaTeX's dual accessibility/visual structure, independent of CDN availability.
   const fixture='<span class="katex"><span class="katex-mathml"><math><semantics><mi>x</mi><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span style="display:inline-block;width:40px;height:24px">x²</span></span></span>';
   const md='# Equation\n\n$$x^2$$';
   const n=__content.makeNote(md,0,0,600,false);__content.select(n);
   n.el.querySelector('.cardbody').innerHTML=fixture;
   const math=n.el.querySelector('.katex'),range=document.createRange();range.setStart(math.querySelector('.katex-html span').firstChild,0);range.collapse(true);
   getSelection().removeAllRanges();getSelection().addRange(range);__content.showTextHighlighter();
   const r=math.getBoundingClientRect();return {id:n.id,md,width:r.width,height:r.height};
  });
  await page.getByRole('button',{name:'Pink highlight',exact:true}).click();
  const mathMark=page.locator('.card.selected .card-equation-highlight');
  assert.equal(await mathMark.getAttribute('data-highlight'),'pink');
  const geometry=await mathMark.boundingBox();
  assert.equal(geometry.width,equation.width);assert.equal(geometry.height,equation.height);
  assert.equal(await page.evaluate(()=>__content.state.selected.md),equation.md);
  await mathMark.evaluate(math=>{const range=document.createRange();range.selectNodeContents(math);getSelection().removeAllRanges();getSelection().addRange(range);__content.showTextHighlighter()});
  await page.keyboard.press('Backspace');
  assert.equal(await mathMark.count(),0);
  assert.equal(await page.evaluate(()=>__content.state.selected.md),equation.md);
  await page.evaluate(id=>__content.deleteNote(__content.state.notes.find(n=>n.id===id)),equation.id);
  const tableLayout=await page.evaluate(()=>{
   const md='# Table highlights\n\n| Topic | Details |\n| --- | --- |\n| First | Several words close to wrapping onto another line. |\n| Second | Formula |';
   const n=__content.makeNote(md,0,0,320,false),body=n.el.querySelector('.cardbody'),table=body.querySelector('table');
   const cells=table.querySelectorAll('td');
   cells[3].innerHTML='<span class="katex-display">\n<span class="katex"><span class="katex-mathml"><math><semantics><mfrac><mi>x</mi><mn>2</mn></mfrac><annotation encoding="application/x-tex">\\frac{x}{2}</annotation></semantics></math></span><span class="katex-html"><span style="display:inline-block;width:30px;height:38px">x / 2</span></span></span>\n</span><math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>y</mi><mn>3</mn></mfrac></math>';
   const source=body.innerHTML,math=body.querySelector('.katex'),native=body.querySelector('td>math');
   const structure=root=>JSON.stringify([...root.querySelectorAll('table,thead,tbody,tr,th,td,.katex span,math>*')].map(el=>[el.tagName,el.parentElement.tagName]));
   const dimensions=root=>[...root.querySelectorAll('table,tr,th,td,.katex,.katex-html,td>math')].map(el=>{const r=el.getBoundingClientRect();return [r.width,r.height]});
   const before=dimensions(body),beforeStructure=structure(body),mathHTML=math.innerHTML,nativeHTML=native.innerHTML;
   const range=document.createRange();range.selectNodeContents(table);
   const selected=ConceptTextHighlights.selection(body,range),items=[ConceptTextHighlights.create(selected,'yellow')];
   ConceptTextHighlights.paint(body,items);
   const after=dimensions(body),afterStructure=structure(body);
   const result={before,after,beforeStructure,afterStructure,mathUnchanged:math.innerHTML===mathHTML,nativeUnchanged:native.innerHTML===nativeHTML,structuralMarks:body.querySelectorAll('table>mark,thead>mark,tbody>mark,tr>mark,.katex-display>mark,math mark').length,marksOutsideCells:[...table.querySelectorAll('mark')].filter(mark=>!mark.closest('td,th')).length,highlightCount:table.querySelectorAll('mark').length,mathHighlights:table.querySelectorAll('.card-equation-highlight').length,mdUnchanged:n.md===md};
   // Saved/exported HTML must also survive the browser's table parser.
   body.innerHTML=body.innerHTML;
   result.roundTripStructure=structure(body);result.roundTripDimensions=dimensions(body);
   for(const color of ['green','blue','pink','theme']){
    items[0].color=color;ConceptTextHighlights.paint(body,items);
   }
   result.recoloredDimensions=dimensions(body);
   ConceptTextHighlights.paint(body,[]);
   result.cleared=body.innerHTML===source;result.clearedDimensions=dimensions(body);
   __content.deleteNote(n);return result;
  });
  assert.ok(tableLayout.highlightCount>0);assert.equal(tableLayout.mathHighlights,2);
  assert.equal(tableLayout.structuralMarks,0);assert.equal(tableLayout.marksOutsideCells,0);
  assert.ok(tableLayout.mathUnchanged&&tableLayout.nativeUnchanged&&tableLayout.mdUnchanged&&tableLayout.cleared);
  for(const key of ['afterStructure','roundTripStructure'])assert.equal(tableLayout[key],tableLayout.beforeStructure,'Table and equation structure stays intact');
  for(const key of ['after','roundTripDimensions','recoloredDimensions','clearedDimensions'])assert.deepEqual(tableLayout[key],tableLayout.before,'Highlighting, saving, recoloring, and clearing preserve layout');
  const migration=await page.evaluate(()=>{
   const fence=String.fromCharCode(96).repeat(3),example='<mark class="card-text-highlight" data-highlight="blue">literal</mark>';
   const md='# Legacy\n\n<mark class="card-text-highlight" data-highlight="yellow">**old highlight**</mark>\n\n'+fence+'html\n'+example+'\n'+fence;
   const n=__content.makeNote(md,0,0,600,false);
   const result={md:n.md,expected:md.replace('<mark class="card-text-highlight" data-highlight="yellow">**old highlight**</mark>','**old highlight**'),text:n.el.querySelector('strong mark')?.textContent,count:n.highlights.length};
   __content.deleteNote(n);return result;
  });
  assert.equal(migration.md,migration.expected,'Legacy annotations migrate without changing code examples');
  assert.equal(migration.text,'old highlight');assert.equal(migration.count,1);
  const literalCode=await page.evaluate(()=>{
   const fence=String.fromCharCode(96).repeat(3);
   const source=String.raw`// Match slashes / and backslashes \\ without rewriting
const pattern = /\\\[.*?\\\]/g;
const replacement = "$& $' $`+'`'+String.raw` $$";
const latex = "\\(\\frac{a}{b}\\)";`;
   const mathExample=String.raw`const example = "\\(\\frac{a}{b}\\)";`;
   const escaped=source.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
   const md='# Literal code\n\n'+fence+'js\n'+source+'\n'+fence+'\n\n'+fence+'js\n'+mathExample+'\n'+fence+'\n\n    '+source.split('\n').join('\n    ')+'\n\n<pre><code>'+escaped+'</code></pre>\n\n`'+String.raw`\\[x\\]`+'`';
   const n=__content.makeNote(md,0,0,600,false);
   const result={source,mathExample,blocks:[...n.el.querySelectorAll('pre code')].map(code=>code.textContent),inline:n.el.querySelector('.cardbody p>code')?.textContent,mathBlocks:n.el.querySelectorAll('.ref-math-block').length};
   __content.deleteNote(n);return result;
  });
  assert.deepEqual(literalCode.blocks,[literalCode.source,literalCode.mathExample,literalCode.source,literalCode.source],'Fenced, indented and HTML code preserve slashes, backslashes and replacement sequences exactly');
  assert.equal(literalCode.inline,String.raw`\\[x\\]`,'Inline code bypasses equation cleanup');
  assert.equal(literalCode.mathBlocks,0,'Programming-language examples are never converted to equations');
  const windowsCode=await page.evaluate(()=>{
   const fence=String.fromCharCode(96).repeat(3);
   const source=String.raw`// ----- keep comment separators -----
const difference = left - right;
const option = "--output-file";
const latex = "\\(\\frac{a-b}{c}\\)";`;
   const md='# Windows paste\r\n\r\n'+fence+'js\r\n'+source.replace(/\n/g,'\r\n')+'\r\n'+fence+'\r\n';
   document.activeElement?.blur();
   const data=new DataTransfer();data.setData('text/plain',md);
   document.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
   const n=__content.state.selected,result={source,text:n.el.querySelector('pre code')?.textContent,md:n.md,expectedMarkdown:md};
   __content.deleteNote(n);return result;
  });
  assert.equal(windowsCode.text,windowsCode.source,'Pasted Windows code preserves dashes, flags and literal backslashes');
  assert.equal(windowsCode.md,windowsCode.expectedMarkdown,'Pasting keeps the original Markdown unchanged');
  const editorPosition=await page.evaluate(()=>{
   const md='# Edit selection\n\nRepeated target\n\n'+('Filler paragraph with enough text to make the editor scroll.\n\n'.repeat(80))+'Repeated target\n\nA **formatted** selection here';
   const n=__content.makeNote(md,0,0,600,false);__content.select(n);
   const paragraphs=[...n.el.querySelectorAll('.cardbody p')];
   const p=paragraphs.findLast(p=>p.textContent==='Repeated target');
   const range=document.createRange();range.selectNodeContents(p);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
   n.el.querySelector('[data-edit]').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
   n.el.querySelector('[data-edit]').click();
   const source=document.querySelector('#source');
   const result={start:source.selectionStart,end:source.selectionEnd,expected:md.lastIndexOf('Repeated target'),scroll:source.scrollTop};
   __content.closeEditor();
   const formatted=paragraphs.at(-1);range.setStart(formatted.querySelector('strong').firstChild,0);range.setEnd(formatted.lastChild,10);selection.removeAllRanges();selection.addRange(range);
   __content.editNote(n);result.formatted=source.value.slice(source.selectionStart,source.selectionEnd);
   __content.closeEditor();__content.deleteNote(n);return result;
  });
  assert.equal(editorPosition.start,editorPosition.expected);
  assert.equal(editorPosition.end-editorPosition.start,'Repeated target'.length);
  assert.ok(editorPosition.scroll>0,'Editor reveals the selected text in long cards');
  assert.equal(editorPosition.formatted,'formatted** selection');
  const imageId=await page.evaluate(()=>{
   const n=__content.makeNote('# Images\n\n[Website](https://example.com)\n\n![Web image]('+location.origin+'/test-web-image.svg)\n\nhttps://images.unsplash.com/photo-example?w=400',0,0,600,false);
   __content.select(n);return n.id;
  });
  const imageCard=page.locator('.card.selected');
  const toolbarFit=await imageCard.evaluate(card=>{
   const original=card.style.width,results=[];
   for(const width of [320,520,550,600]){
    card.style.width=width+'px';
    const bounds=card.getBoundingClientRect(),bar=card.querySelector('.cardbar').getBoundingClientRect();
    results.push([...card.querySelectorAll('.cardactions>button,.cardactions>.custom-select')].every(el=>{const r=el.getBoundingClientRect();return r.left>=bounds.left&&r.right<=bounds.right&&r.bottom<=bar.bottom}));
   }
   card.style.width=original;return results;
  });
  assert.ok(toolbarFit.every(Boolean),'Toolbar controls remain inside narrow and wide cards');
  assert.equal(await imageCard.getAttribute('data-font-size'),'80','New cards default to 80%');
  assert.deepEqual(await imageCard.locator('select[data-size] option').allTextContents(),['50%','60%','70%','80%','90%','100%','110%','125%','140%','160%']);
  await page.evaluate(()=>document.activeElement?.blur());
  for(const [key,size] of [['1','50'],['2','60'],['4','80'],['9','140'],['0','160']]){
   await page.keyboard.press(key);
   assert.equal(await imageCard.getAttribute('data-font-size'),size);
   assert.equal(await page.evaluate(()=>__content.state.selected.size),size);
  }
  await page.keyboard.press('4');
  assert.equal(await imageCard.locator('a').getAttribute('target'),'_blank');
  assert.equal(await imageCard.locator('a').getAttribute('rel'),'noopener noreferrer');
  assert.equal(await imageCard.locator('img').first().getAttribute('referrerpolicy'),'no-referrer');
  assert.equal(await imageCard.locator('img').first().getAttribute('loading'),'eager');
  await page.waitForFunction(()=>document.querySelector('.card.selected img').naturalWidth===40);
  assert.equal(await imageCard.locator('img').count(),2,'Extensionless direct image URL renders as an image');
  await page.evaluate(id=>__content.deleteNote(__content.state.notes.find(n=>n.id===id)),imageId);
  const switchIds=await page.evaluate(()=>{
   const a=__content.makeNote('# First context\n\n'+('Paragraph content.\n\n'.repeat(100)),0,0,600,false);
   const b=__content.makeNote('# Second context\n\nOther content',700,0,600,false);
   __content.select(a);
   const body=a.el.querySelector('.cardbody');body.style.maxHeight='300px';body.style.overflow='auto';body.scrollTop=180;
   __content.setCameraImmediate(110,-300,.75);document.activeElement?.blur();return [a.id,b.id];
  });
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(id=>__content.state.selected.id===id&&!__content.state.raf,switchIds[1]);
  await page.evaluate(()=>__content.setCameraImmediate(-560,-100,1.1));
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(id=>__content.state.selected.id===id&&!__content.state.raf,switchIds[0]);
  const restoredContext=await page.evaluate(()=>{
   const n=__content.state.selected,v=__content.focusViewport(),r=n.navigationView;
   return {scale:__content.state.scale,scroll:n.el.querySelector('.cardbody').scrollTop,error:Math.hypot(__content.state.x-(v.left+v.width/2-(n.x+r.localX)*r.scale),__content.state.y-(v.top+v.height/2-(n.y+r.localY)*r.scale))};
  });
  assert.equal(restoredContext.scale,.75);assert.equal(restoredContext.scroll,180);assert.ok(restoredContext.error<.01);
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(id=>__content.state.selected.id===id&&!__content.state.raf,switchIds[1]);
  assert.equal(await page.evaluate(()=>__content.state.scale),1.1,'Each card restores its own zoom');
  for(const id of switchIds)await page.evaluate(id=>__content.deleteNote(__content.state.notes.find(n=>n.id===id)),id);
  const narrowId=await page.evaluate(async()=>{
   const n=__content.makeNote('# Narrow card\n\nReadable content',0,0,400,false);__content.select(n);await __content.focusSelected('fit');return n.id;
  });
  await page.waitForFunction(()=>!__content.state.raf);
  const narrowHandle=await page.locator('.card.selected .resize.right').boundingBox();
  const narrowScale=await page.evaluate(()=>__content.state.scale);
  await page.mouse.move(narrowHandle.x+narrowHandle.width/2,narrowHandle.y+narrowHandle.height/2);
  await page.mouse.down();await page.mouse.move(narrowHandle.x+narrowHandle.width/2-160*narrowScale,narrowHandle.y+narrowHandle.height/2,{steps:5});await page.mouse.up();
  assert.equal(await page.evaluate(()=>__content.state.selected.el.offsetWidth),300,'Edge dragging can narrow cards below the old 520px limit');
  await page.evaluate(()=>__content.resizeSelectedWidth(1));
  assert.equal(await page.evaluate(()=>__content.state.selected.width),340);
  await page.evaluate(()=>__content.resizeSelectedWidth(-1));
  assert.equal(await page.evaluate(()=>__content.state.selected.width),300);
  await page.waitForFunction(()=>!__content.state.raf);
  await page.evaluate(id=>__content.deleteNote(__content.state.notes.find(n=>n.id===id)),narrowId);
  const searchCards=await page.evaluate(()=>[
   __content.makeNote('# Astronomy\nOrbit and stars',0,0,600,false,null,'sans','100','default').id,
   __content.makeNote('# Biology\nCells and tissues',700,0,600,false).id
  ]);
  await page.waitForFunction(()=>document.querySelectorAll('#indexEntries [data-card-id]').length>=2);
  const fontChoices=await page.locator('.card select[data-font]').first().locator('option').allTextContents();
  assert.ok(fontChoices.includes('Comic Sans'));
  for(const removed of ['Dancing Script','Sacramento','Satisfy','Marck Script','Bebas Neue','Editorial Serif','Josefin Sans','System Sans'])assert.ok(!fontChoices.includes(removed));
  const neutral=page.locator('.card[data-map-color="default"]').first();
  assert.equal(await neutral.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
  assert.equal(await neutral.locator('select[data-map-color] option[value="default"]').textContent(),'White');
  await page.locator('#theme').click();
  assert.equal(await neutral.locator('select[data-map-color] option[value="default"]').textContent(),'Midnight');
  assert.notEqual(await neutral.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
  await page.locator('#theme').click();
  assert.equal(await neutral.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(255, 255, 255)');
  await page.keyboard.press('Control+f');
  assert.equal(await page.locator('#canvasSearch').evaluate(el=>document.activeElement===el),true);
  await page.locator('#canvasSearch').fill('orbit');
  assert.equal(await page.locator('#indexEntries .index-entry:not([hidden])').count(),1);
  assert.equal(await page.locator('.card.search-muted').count(),0);
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('.card.selected mark.canvas-search-match')?.textContent==='Orbit');
  assert.equal(await page.locator('.card.selected mark.canvas-search-match').count(),1);
  await page.locator('#canvasSearch').focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('mark.canvas-search-match').count(),0);
  assert.equal(await page.locator('.card.search-muted').count(),0);
  for(const id of searchCards)await page.evaluate(id=>__content.deleteNote(__content.state.notes.find(n=>n.id===id)),id);
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
  const mapPinch=await page.evaluate(()=>{
   const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');document.body.append(svg);
   let delta;const zoom={on(){return arguments.length===1?()=>{}:this},wheelDelta(callback){delta=callback;return this}};
   const settings={pinch:3,wheel:.5},cleanup=__content.enableMapCameraFrames(svg,{zoom},settings);
   const high=delta({ctrlKey:true,deltaY:-20,deltaMode:0});settings.pinch=.25;
   const low=delta({ctrlKey:true,deltaY:-20,deltaMode:0}),wheel=delta({ctrlKey:false,deltaY:-20,deltaMode:0});
   cleanup();svg.remove();
   const original=window.d3;let captured;
   window.d3={pointer:event=>[event.clientX,event.clientY],select:()=>({call(fn,scale,point){captured={scale,point}}})};
   const card=document.createElement('article');card.className='card map-card selected';card.style.cssText='position:fixed;left:0;top:0;width:1000px;height:600px';
   card.innerHTML='<div class="map-pane"><svg style="width:100%;height:100%"></svg></div>';document.body.append(card);
   const pane=card.querySelector('.map-pane');__content.enablePenMapWheel(pane,card.querySelector('svg'),{zoom:{scaleBy(){}}});
   pane.dispatchEvent(new PointerEvent('pointermove',{pointerType:'pen',clientX:100,clientY:100,bubbles:true}));
   pane.dispatchEvent(new WheelEvent('wheel',{ctrlKey:true,deltaY:-20,clientX:600,clientY:400,bubbles:true,cancelable:true}));
   card.remove();window.d3=original;return {high,low,wheel,anchor:captured.point};
  });
  assert.ok(Math.abs(mapPinch.high/mapPinch.low-12)<1e-8,'Standalone maps honor the expanded pinch sensitivity');
  assert.ok(Math.abs(mapPinch.wheel-.044)<1e-8,'Ctrl pinch and wheel retain separate sensitivities');
  assert.deepEqual(mapPinch.anchor,[600,400],'A previous pen hover cannot replace the touchpad pinch anchor');

  const palette=await page.evaluate(async()=>{
   const notes=Array.from({length:90},(_,i)=>__content.makeNote(`# Subject ${i+1}: a longer card title`,0,0,600,false,null,'sans'));
   document.querySelector('[data-index-view="palette"]').click();
   __content.select(notes.at(-1));
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const selected=document.querySelector('#indexEntries [aria-current="true"]'),tile=selected.getBoundingClientRect();
   const list=document.querySelector('#indexEntries').getBoundingClientRect();
   selected.dispatchEvent(new PointerEvent('pointerover',{bubbles:true}));
   const tooltip=document.querySelector('#paletteTitleTooltip');
   const result={title:tooltip.textContent,titleVisible:!tooltip.hidden,fullyVisible:tile.top>=list.top-1&&tile.bottom<=list.bottom+1,compact:Math.abs(tile.width-tile.height)<1&&!selected.style.position&&getComputedStyle(selected.querySelector('span')).display==='none'};
   __content.select(notes[0]);
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const first=document.querySelector('#indexEntries [aria-current="true"]').getBoundingClientRect();
   result.firstVisible=first.top>=document.querySelector('#indexEntries').getBoundingClientRect().top-1;
   document.querySelector('[data-index-view="list"]').click();notes.forEach(__content.deleteNote);
   return result;
  });
  assert.equal(palette.title,'Subject 90: a longer card title');
  assert.ok(palette.titleVisible&&palette.fullyVisible&&palette.firstVisible&&palette.compact,'Numbered tiles stay square and reveal the title in a hover tooltip');
  const paletteThemes=await page.evaluate(async()=>{
   const notes=['default','purple','warm','ocean','forest','sunset','slate'].map(theme=>__content.makeNote('# '+theme,0,0,600,false,null,'mono','80',theme));
   document.querySelector('[data-index-view="palette"]').click();
   await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
   const rows=[];
   for(const dark of [false,true]){
    document.body.classList.toggle('dark',dark);
    for(const n of notes){
     const entry=document.querySelector(`[data-index-card-id="${n.id}"]`),style=getComputedStyle(entry),cardStyle=getComputedStyle(n.el);
     const expected=style.getPropertyValue(n.mapColor==='default'?'--ink':dark?'--card-accent-dark':'--card-accent').trim();
     __content.select(n);const selected=getComputedStyle(entry);
     rows.push({theme:entry.dataset.mapColor,expected,accent:style.getPropertyValue('--tile-accent').trim(),cardAccent:cardStyle.getPropertyValue(dark?'--card-accent-dark':'--card-accent').trim(),tileAccent:style.getPropertyValue(dark?'--card-accent-dark':'--card-accent').trim(),outline:selected.outlineStyle,shadow:selected.boxShadow,background:selected.backgroundColor});
    }
   }
   const select=notes[0].el.querySelector('[data-map-color]');select.value='ocean';select.dispatchEvent(new Event('change'));
   const updated=document.querySelector(`[data-index-card-id="${notes[0].id}"]`).dataset.mapColor;
   document.body.classList.remove('dark');document.querySelector('[data-index-view="list"]').click();notes.forEach(__content.deleteNote);
   return {rows,updated};
  });
  for(const row of paletteThemes.rows){assert.equal(row.accent,row.expected,'Palette follows the theme in both appearances');assert.equal(row.cardAccent,row.tileAccent,'Cards and tiles share theme colors');assert.equal(row.outline,'none');assert.ok(row.shadow.includes('inset'),'Selection uses an inset border');}
  assert.equal(paletteThemes.updated,'ocean','Changing a card theme updates its tile immediately');
  assert.equal(new Set(paletteThemes.rows.slice(0,7).map(row=>row.background)).size,7,'Themes have distinct tile fills');
  const typography=await page.evaluate(async()=>{
   const n=__content.makeNote('# Main heading\n\nBody text\n\n## Section\n\n### Topic\n\n#### Detail\n\n##### Minor\n\n###### Note',0,0,600,false,null,'sans','125');
   const headings=[...n.el.querySelectorAll('.cardbody h1,.cardbody h2,.cardbody h3,.cardbody h4,.cardbody h5,.cardbody h6')];
   const sizes=headings.map(el=>parseFloat(getComputedStyle(el).fontSize));
   const weights=headings.map(el=>getComputedStyle(el).fontWeight);
   const body=parseFloat(getComputedStyle(n.el.querySelector('.cardbody p')).fontSize);
   const first=headings[0].textContent;__content.deleteNote(n);
   const requests=[],original=document.fonts.load;
   document.fonts.load=async spec=>{requests.push(spec);return []};
   const a=__content.ensureFontLoaded('itim'),b=__content.ensureFontLoaded('itim');
   document.querySelector('#card-font-itim').dispatchEvent(new Event('load'));
   await a;document.fonts.load=original;
   return {first,sizes,weights,body,shared:a===b,links:document.querySelectorAll('#card-font-itim').length,requests};
  });
  assert.equal(typography.first,'Main heading');
  typography.sizes.forEach((size,i)=>assert.ok(Math.abs(size-typography.body*[1.6,1.4,1.25,1.15,1.1,1.05][i])<.01));
  assert.ok(typography.sizes.every(size=>size>typography.body));
  assert.ok(typography.weights.every(weight=>weight==='700'));
  assert.ok(typography.shared);assert.equal(typography.links,1);assert.equal(typography.requests.length,2);
  for(const count of [7,13]){
   const board=await page.evaluate(count=>{
    const notes=Array.from({length:count},(_,i)=>__content.makeNote(`# Card ${i}\n\n${'Readable content. '.repeat(12+i%3)}`,0,0,520+(i%3)*80,false,null,'sans'));
    __content.layoutCards();
    const rows=new Map();for(const n of notes){if(!rows.has(n.y))rows.set(n.y,[]);rows.get(n.y).push(n)}
    const result=[...rows.values()].map(cards=>({count:cards.length,center:(cards[0].x+cards.at(-1).x+cards.at(-1).el.offsetWidth)/2,overlap:cards.some((n,i)=>i&&n.x<cards[i-1].x+cards[i-1].el.offsetWidth)}));
    for(const n of notes)__content.deleteNote(n);return result;
   },count);
   assert.ok(board.length>1,'Larger boards use multiple rows');
   assert.ok(Math.max(...board.map(row=>row.count))-Math.min(...board.map(row=>row.count))<=1,'Cards are distributed evenly');
   assert.ok(board.every(row=>Math.abs(row.center)<.01&&!row.overlap),'Rows stay centered and separated');
  }
  const topicId=await page.evaluate(()=>__content.makeNote('# Topics\n\n## First\n\nText\n\n### Repeated\n\nText\n\n## Repeated\n\n```text\n## Not a topic\n```',0,0,600,false).id);
  const expand=page.getByRole('button',{name:'Subtopics: Topics',exact:true});
  await expand.click();
  assert.equal(await expand.getAttribute('aria-expanded'),'true');
  assert.deepEqual(await page.locator(`#index-topics-${topicId} .index-subtopic`).allTextContents(),['First','Repeated','Repeated']);
  assert.ok((await page.locator('#indexEntries [data-card-id] span').evaluateAll(labels=>labels.map(el=>getComputedStyle(el).fontWeight))).every(weight=>weight==='400'),'Index titles use regular weight');
  assert.ok((await page.locator(`#index-topics-${topicId} .index-subtopic`).evaluateAll(labels=>labels.map(el=>getComputedStyle(el).fontWeight))).every(weight=>weight==='400'),'Index subtitles use regular weight');
  assert.equal(await page.locator('#indexEntries [data-card-id] svg').count(),0,'Card type icons are removed');
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
  assert.equal(await card.evaluate(el=>getComputedStyle(el).borderRadius),'4px');
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
   if(type==='map'){
    const fitted=await page.evaluate(id=>{
     const n=__content.state.notes.find(n=>n.id===id),r=n.el.getBoundingClientRect(),v=__content.focusViewport();
     return {width:r.width,height:r.height,view:v};
    },frameId);
    assert.ok(Math.abs(fitted.width-fitted.view.width)<1.1&&Math.abs(fitted.height-fitted.view.height)<1.1,'Focused map fills both viewport dimensions');
    for(const indexWidth of [200,420]){
     await page.evaluate(async ({id,width})=>{
      document.querySelector('#cardIndex').style.width=width+'px';
      __content.select(__content.state.notes.find(n=>n.id===id));await __content.focusSelected('readable');
     },{id:frameId,width:indexWidth});
     const refitted=await page.evaluate(id=>{
      const r=__content.state.notes.find(n=>n.id===id).el.getBoundingClientRect(),v=__content.focusViewport();
      return {left:r.left,top:r.top,width:r.width,height:r.height,view:v,step:__content.state.spaceFocusStep};
     },frameId);
     assert.equal(refitted.step,1,'Map reading focus uses the fit action');
     assert.ok(Math.abs(refitted.left-refitted.view.left)<1.1&&Math.abs(refitted.top-refitted.view.top)<1.1&&Math.abs(refitted.width-refitted.view.width)<1.1&&Math.abs(refitted.height-refitted.view.height)<1.1,'Map refits when the index changes width');
    }
    await page.setViewportSize({width:2200,height:1200});
    await page.evaluate(async()=>__content.focusSelected());
    const wideFit=await page.evaluate(()=>{
     const n=__content.state.selected,r=n.el.getBoundingClientRect(),v=__content.focusViewport();
     return {width:r.width,height:r.height,view:v,cardWidth:n.mapWidth,cardHeight:n.mapHeight};
    });
    assert.ok(wideFit.cardWidth<=1600&&wideFit.cardHeight<=1200,'Focused map respects card size limits');
    assert.ok(Math.abs(wideFit.width-wideFit.view.width)<1.1&&Math.abs(wideFit.height-wideFit.view.height)<1.1,'Wide screens retain the viewport aspect ratio');
    await page.setViewportSize({width:1280,height:900});
    await page.evaluate(async()=>{document.querySelector('#cardIndex').style.width='';await __content.focusSelected('fit')});
    const header=await page.evaluate(id=>{
     const n=__content.state.notes.find(n=>n.id===id),bar=n.el.querySelector('.cardbar'),body=n.el.querySelector('.cardbody');
     return {height:bar.offsetHeight,body:body.offsetHeight,card:n.el.clientHeight};
    },frameId);
    assert.equal(header.height,56,'Selected map header stays compact');
    assert.equal(await page.evaluate(id=>__content.state.notes.find(n=>n.id===id).size,frameId),'80','New maps default to 80%');
    assert.ok(Math.abs(header.body+header.height-header.card)<=1,'Map body fills space below compact header');
   }
   const previousWidth=await page.evaluate(id=>{document.activeElement?.blur();return __content.state.notes.find(n=>n.id===id).el.offsetWidth},frameId);
   await page.keyboard.press(']');
   await page.waitForTimeout(400);
   const widened=await page.evaluate(id=>{
    const n=__content.state.notes.find(n=>n.id===id),r=n.el.getBoundingClientRect();
    return {width:n.el.offsetWidth,top:r.top,bottom:innerHeight-r.bottom,left:r.left,right:r.right,indexRight:document.querySelector('#cardIndex').getBoundingClientRect().right,trayLeft:document.querySelector('.toolbar').getBoundingClientRect().left,mode:__content.state.spaceFocusStep};
   },frameId);
   assert.equal(widened.width,previousWidth+40,`${type} keeps shortcut width after refocusing`);
   assert.equal(widened.mode,1,'Shortcut preserves fit view');
   assert.ok(Math.abs(widened.top-widened.bottom)<1.1&&widened.left>=widened.indexRight+23.9&&widened.right<=widened.trayLeft-23.9,`${type} stays fitted after width change`);
   if(type==='map')await page.evaluate(id=>__content.deleteNote(__content.state.notes.find(n=>n.id===id)),frameId);
  }
  const reorderIds=await page.evaluate(()=>['Second card','Third card'].map(title=>__content.makeNote('# '+title,0,0,600,false).id));
  await page.locator(`[data-index-card-id="${reorderIds[1]}"] .index-reorder`).dragTo(page.locator(`[data-index-card-id="${topicId}"] .index-row`),{targetPosition:{x:45,y:4}});
  assert.deepEqual(await page.evaluate(()=>__content.state.notes.map(n=>n.id)),[reorderIds[1],topicId,reorderIds[0]]);
  await page.locator(`[data-index-card-id="${reorderIds[1]}"] .index-reorder`).focus();
  await page.keyboard.press('Alt+ArrowDown');
  assert.deepEqual(await page.evaluate(()=>__content.state.notes.map(n=>n.id)),[topicId,reorderIds[1],reorderIds[0]]);
  const reorderTarget=page.locator(`[data-index-card-id="${reorderIds[0]}"] .index-row`);
  const reorderTargetBounds=await reorderTarget.boundingBox();
  await page.locator(`[data-index-card-id="${reorderIds[1]}"] .index-reorder`).dragTo(reorderTarget,{targetPosition:{x:45,y:reorderTargetBounds.height-4}});
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
   ['Intro\n\n### First *heading*\n\n# Later H1','First heading'],
   ['```md\n# Not a title\n```\n\n#### First H4\n\n## Later H2','First H4'],
   ['###### First H6\n\n# Later H1','First H6'],
   ['No heading here',`Card ${result.id}`]
  ]){
   await page.evaluate(md=>{const n=__content.state.notes[0];n.md=md;__content.updateCardHeading(n)},md);
   await page.waitForFunction(title=>document.querySelector('#indexEntries button[data-card-id] span').textContent===title,title);
   if(title!==`Card ${result.id}`)assert.equal(await page.locator('.card .map-title').textContent(),title,'Card and index use the same first heading');
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
  await page.locator('#indexEntries button[data-card-id]').dblclick();
  await page.getByRole('textbox',{name:'Edit card heading'}).fill('Index title');
  await page.getByRole('button',{name:'Save',exact:true}).click();
  assert.equal(await page.evaluate(()=>__content.state.notes[0].md),'# Index title\n\nNo heading here');
  await page.locator('#indexEntries button[data-card-id]').dblclick();
  await page.getByRole('textbox',{name:'Edit card heading'}).fill('Discard this');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#indexEntries button[data-card-id] span').textContent(),'Index title');
  await page.evaluate(()=>{const n=__content.state.notes[0];n.md='Intro\n\nOriginal\n--------\n\nBody stays';__content.updateCardHeading(n)});
  await page.waitForFunction(()=>document.querySelector('#indexEntries button[data-card-id] span').textContent==='Original');
  await page.locator('#indexEntries button[data-card-id]').dblclick();
  await page.getByRole('textbox',{name:'Edit card heading'}).fill('Revised');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>__content.state.notes[0].md),'Intro\n\n## Revised\n\nBody stays');
  await page.evaluate(()=>{const n=__content.state.notes[0];n.md='Intro\n\n### Early title\n\n# Later title\n\nBody stays';__content.updateCardHeading(n)});
  await page.waitForFunction(()=>document.querySelector('#indexEntries button[data-card-id] span').textContent==='Early title');
  await page.locator('#indexEntries button[data-card-id]').dblclick();
  await page.getByRole('textbox',{name:'Edit card heading'}).fill('Revised H3');await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>__content.state.notes[0].md),'Intro\n\n### Revised H3\n\n# Later title\n\nBody stays','Renaming preserves the title heading level and the rest of the Markdown');
  assert.equal(await page.locator('.index-rename').count(),0,'Index title edit buttons are removed');
  await page.locator('#indexViewFlip').click();
  await page.locator('#indexEntries button[data-card-id]').dblclick();
  assert.ok(await page.getByRole('textbox',{name:'Edit card heading'}).isVisible(),'Double-click edits palette titles too');
  await page.keyboard.press('Escape');await page.locator('#indexViewFlip').click();
  await page.setViewportSize({width:390,height:800});
  await page.locator('#indexEntries button[data-card-id]').evaluate(button=>{
   for(let i=0;i<2;i++){
    button.dispatchEvent(new PointerEvent('pointerup',{pointerType:'touch',bubbles:true}));
    button.dispatchEvent(new PointerEvent('click',{pointerType:'touch',detail:1,bubbles:true,cancelable:true}));
   }
  });
  assert.ok(await page.locator('#cardIndex').isVisible(),'Double-tap keeps the mobile index open');
  assert.ok(await page.getByRole('textbox',{name:'Edit card heading'}).isVisible(),'Double-tap opens the title editor');
  await page.keyboard.press('Escape');await page.setViewportSize({width:1280,height:900});
  for(const html of result.popups){
   for(const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))new vm.Script(script[1]);
   assert.ok(html.includes('data-font-size="125"'));assert.ok(html.includes('styles.css'));
   assert.ok(!html.includes('feTurbulence')&&!html.includes('feDisplacementMap'));
   if(html.includes('Markmap.create'))assert.ok(html.includes('enableMapCameraFrames(svg,map'));
  }
  const preview=await browser.newPage({viewport:{width:390,height:844}});
  await preview.route('https://**/*',r=>r.abort());
  // Inspect popup styling without relying on unavailable remote Markmap scripts.
  const strip=html=>html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
  const cardHtml=result.popups[20]; // dark ocean
  await preview.setContent(strip(cardHtml),{waitUntil:'networkidle'});
  assert.ok(await preview.evaluate(()=>document.querySelector('.card').getBoundingClientRect().right<=innerWidth));
  await preview.evaluate(()=>{
   const body=document.querySelector('.cardbody');
   for(let i=0;i<100;i++){const p=document.createElement('p');p.textContent=`Long document paragraph ${i+1}. Reading continues down the page.`;body.append(p)}
  });
  for(const width of [1280,390]){
   await preview.setViewportSize({width,height:844});
   const sizing=await preview.evaluate(()=>{
    const card=document.querySelector('.card'),body=card.querySelector('.cardbody');
    return {height:card.offsetHeight,viewport:innerHeight,cardLimit:getComputedStyle(card).maxHeight,bodyLimit:getComputedStyle(body).maxHeight,bodyOverflow:getComputedStyle(body).overflowY,pageHeight:document.scrollingElement.scrollHeight};
   });
   assert.equal(sizing.cardLimit,'none');assert.equal(sizing.bodyLimit,'none');assert.equal(sizing.bodyOverflow,'visible');
   assert.ok(sizing.height>sizing.viewport*3&&sizing.pageHeight>sizing.height,'Long Markdown uses full document height');
   await preview.evaluate(()=>window.scrollTo(0,document.scrollingElement.scrollHeight));
   assert.ok(await preview.evaluate(()=>{const r=document.querySelector('.cardbody').lastElementChild.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}),'Page scrolling reaches the last paragraph on desktop and mobile');
  }
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
