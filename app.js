(() => {
"use strict";

const $=s=>document.querySelector(s);
const canvas=$("#canvas"),world=$("#world"),editor=$("#editor"),source=$("#source"),context=$("#context");
const MIN_SCALE=.01;
let canvasFiles=null;
let savedCanvasContent='';
const MAX_SCALE=8;
const navigation={wheel:1,scroll:1,pinch:1,drag:1,step:1.2};
try{
 const saved=JSON.parse(localStorage.getItem("reflatex-navigation")||"{}");
 for(const key of ["wheel","scroll","drag"])if(Number.isFinite(saved[key]))navigation[key]=saved[key]>1.5?1:Math.max(.5,saved[key]);
 if(Number.isFinite(saved.pinch))navigation.pinch=Math.max(.25,Math.min(3,saved.pinch));
 if(Number.isFinite(saved.step))navigation.step=saved.step>1.35?1.2:Math.max(1.05,saved.step);
}catch{}
const zoomLabel=$("#zoomLabel");
let lastZoomLabel="";
let cameraInputFrame=0,indexFrame=0,wheelScrollTimer=0;
// Skip offscreen paint but retain accurate layout for fit, arrange and editing.
if(window.IntersectionObserver){
 const visibility=new IntersectionObserver(entries=>{
  for(const {target,isIntersecting} of entries)target.classList.toggle("offscreen",!isIntersecting);
 },{root:canvas,rootMargin:"400px"});
 new MutationObserver(records=>{
  for(const record of records){
   for(const el of record.addedNodes)if(el.nodeType===1)visibility.observe(el);
   for(const el of record.removedNodes)if(el.nodeType===1)visibility.unobserve(el);
  }
 }).observe(world,{childList:true});
}
if(window.marked?.setOptions) marked.setOptions({gfm:true,breaks:true});

const state={
 x:innerWidth/2,y:innerHeight/2,scale:1,
 targetX:innerWidth/2,targetY:innerHeight/2,targetScale:1,
 notes:[],selected:null,nextId:1,
 hand:false,controlsVisible:true,pan:null,rightPan:null,resize:null,editId:null,editorMode:"note",
 spaceFocusStep:0,layoutMode:'compact',overviewActive:false,
 undo:[],redo:[],historyLock:false,raf:0,saveTimer:0,hideTimer:0,
};
const readingSession={cards:new Map(),rows:[]};
const cardVisits=new Set();
function resetReadingSession(){readingSession.cards.clear();readingSession.rows=[];state.layoutMode='compact'}
function restoreReadingSession(ids=[]){
 readingSession.cards.clear();readingSession.rows=[];
 const notes=new Map(state.notes.map(n=>[n.id,n]));
 for(const id of Array.isArray(ids)?ids:[]){const n=notes.get(id);if(n)readingSession.cards.set(id,n)}
 state.layoutMode=readingSession.cards.size?'reading':'compact';
}
function readingPadding(w,h,view){
 const scale=clampScale(Math.min(1.2,view.width/w,view.height/h));
 return {x:Math.max(24,(view.width/scale-w)/2)+64/scale,y:Math.max(24,(view.height/scale-h)/2)+64/scale};
}
function cacheReadingRows(rows,dimensions){
 readingSession.rows=rows.map(row=>({cards:row.cards,dimensions,height:Math.max(...row.cards.map(n=>dimensions.get(n).h)),padding:Math.max(0,...row.cards.map(n=>dimensions.get(n).beforeY||0))}));
}
function ensureReadingRows(){
 if(readingSession.rows.length)return;
 const groups=new Map(),dimensions=new Map(),view=focusViewport();
 for(const n of state.notes){
  if(!groups.has(n.y))groups.set(n.y,[]);groups.get(n.y).push(n);
  const w=n.el.offsetWidth,h=n.el.offsetHeight,p=readingSession.cards.has(n.id)?readingPadding(w,h,view):{x:0,y:0};
  dimensions.set(n,{w,h,beforeX:p.x,afterX:p.x,beforeY:p.y,afterY:p.y});
 }
 cacheReadingRows([...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([,cards])=>({cards})),dimensions);
}
function addReadingCard(n){
 ensureReadingRows();
 const rows=readingSession.rows,index=rows.findIndex(row=>row.cards.includes(n));
 if(index<0)return;
 const row=rows[index],dimensions=row.dimensions,d=dimensions.get(n),w=n.el.offsetWidth,h=n.el.offsetHeight,p=readingPadding(w,h,focusViewport());
 if(readingSession.cards.has(n.id)&&d.w===w&&d.h===h&&d.beforeX===p.x&&d.beforeY===p.y)return;
 d.w=w;d.h=h;d.beforeX=d.afterX=p.x;d.beforeY=d.afterY=p.y;
 // Insert gaps in the existing row. Only its necessary suffix moves; cards
 // keep their index order and every earlier row stays in place.
 let right=row.cards[0].x;
 for(let i=0;i<row.cards.length;i++){
  const card=row.cards[i];
  if(i){const previous=row.cards[i-1];right+=Math.max(24,dimensions.get(previous).afterX,dimensions.get(card).beforeX)}
  const x=Math.max(card.x,right);
  if(x!==card.x){card.x=x;card.el.style.left=x+'px'}
  right=card.x+dimensions.get(card).w;
 }
 row.height=Math.max(...row.cards.map(card=>dimensions.get(card).h));
 row.padding=Math.max(row.padding,p.y);
 for(let i=Math.max(1,index);i<rows.length;i++){
  const previous=rows[i-1],current=rows[i],gap=Math.max(24,previous.padding,current.padding);
  const top=previous.cards[0].y+previous.height+gap,delta=Math.max(0,top-current.cards[0].y);
  if(delta)for(const card of current.cards){card.y+=delta;card.el.style.top=card.y+'px'}
 }
 readingSession.cards.set(n.id,n);state.layoutMode='reading';
}
const MAP_COLORS=["default","purple","warm","ocean","forest","sunset","slate"];
function randomCardTheme(){return MAP_COLORS[1+Math.floor(Math.random()*(MAP_COLORS.length-1))]}
const ICON_PATHS={
 flip:'<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
 highlight:'<path d="m14 4 6 6-8 8-6-6 8-8Zm-8 8-2 7 7-2M3 22h12"/>',
 zoom:'<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5M8 10.5h5m-2.5-2.5v5"/>',
 pan:'<path d="M12 4v16M4 12h16m-11-5 3-3 3 3m-6 10 3 3 3-3M7 9l-3 3 3 3m10-6 3 3-3 3"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 minus:'<path d="M5 12h14"/>',
 center:'<path d="M8 4H4v4m12-4h4v4M4 16v4h4m12-4v4h-4"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
 arrange:'<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
 background:'<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m4 17 5-5 4 4 3-3 4 4"/>',
 moon:'<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z"/>',
 sun:'<circle cx="12" cy="12" r="3.5"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17m10-10 1.4-1.4"/>',
 save:'<path d="M12 4v11m-4-4 4 4 4-4M5 16v4h14v-4"/>',
 open:'<path d="M4 8V5h6l2 3h7a1 1 0 0 1 1 1v2M4 20l2-9h15l-2 9H4Z"/>',
 fullscreen:'<path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',
 map:'<rect x="4" y="9" width="5" height="6" rx="1"/><path d="M9 12h4M13 6v12m0-12h3m-3 12h3"/><rect x="16" y="4" width="4" height="4" rx="1"/><rect x="16" y="16" width="4" height="4" rx="1"/>',
 file:'<path d="M14 4H6v16h12V8l-4-4Zm0 0v4h4M9 12h6m-6 4h6"/>',
 mapOpen:'<path d="M4 6v12m0-12h6M4 12h6m-6 6h6M14 4h6v6m0-6-8 8"/>',
 cardOpen:'<path d="M10 5H5v14h14v-5M14 4h6v6m0-6-9 9"/>',
 edit:'<path d="m15 5 4 4M5 15l-1 5 5-1L20 8a2.8 2.8 0 0 0-4-4L5 15Z"/>',
 duplicate:'<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V4H4v12h4"/>',
 copy:'<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V4H4v12h4"/>',
 delete:'<path d="M5 7h14M9 7V4h6v3M7 7v13h10V7m-7 4v5m4-5v5"/>',
 sidebar:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16m4-11h3m-3 6h3"/>',
 collapse:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v16m7-11-3 3 3 3"/>',
 help:'<circle cx="12" cy="12" r="8"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/>',
 settings:'<path d="M4 7h3m4 0h9M4 17h9m4 0h3"/><circle cx="9" cy="7" r="2"/><circle cx="15" cy="17" r="2"/>',
 chevron:'<path d="m9 6 6 6-6 6"/>',
 grip:'<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>'
};
const ICONS=Object.fromEntries(Object.entries(ICON_PATHS).map(([name,paths])=>[name,`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`]));
// Static controls and generated card controls use the same local icon set.
for(const [id,name] of Object.entries({new:'plus',hand:'zoom',center:'center',arrange:'arrange',background:'background',theme:'moon',saveCanvas:'save',openCanvas:'open',full:'fullscreen',toggleIndex:'sidebar',help:'help',settings:'settings',closeIndex:'collapse',minus:'minus',plus:'plus',close:'close',edit:'edit',duplicate:'duplicate',copy:'copy',remove:'delete',edge:'sidebar'})){
 const svg=document.getElementById(id)?.querySelector('svg');
 if(svg)svg.outerHTML=ICONS[name];
}
function setButtonIcon(button,name,label){
 if(!button)return;
 button.innerHTML=ICONS[name];
 if(label){button.title=label;button.setAttribute("aria-label",label)}
}
function updateViewButton(el,type){
 const button=el.querySelector("[data-view]");
 setButtonIcon(button,"flip",type==="map"?"Switch to Markdown (K)":"Switch to Markmap (K)");
 if(button)button.dataset.view=type;
}
function setCardActionIcons(el,type){
 updateViewButton(el,type);
 const mapOpen=el.querySelector("[data-map-open]");
 setButtonIcon(mapOpen,"mapOpen","Open Markmap in new window (M)");
 mapOpen?.classList.remove("map-only");
 setButtonIcon(el.querySelector("[data-card-open]"),"cardOpen","Open card in new window (O)");
 let pdfButton=el.querySelector("[data-card-pdf]");
 if(!pdfButton){
  pdfButton=document.createElement("button");pdfButton.type="button";pdfButton.dataset.cardPdf="";
  el.querySelector("[data-edit]").before(pdfButton);
  pdfButton.onclick=()=>downloadCardPdf(state.notes.find(n=>n.el===el));
 }
 setButtonIcon(pdfButton,"save","Save card as PDF");
 setButtonIcon(el.querySelector("[data-edit]"),"edit","Edit card");
 setButtonIcon(el.querySelector("[data-delete]"),"delete",type==="map"?"Delete map":"Delete card");
}
const LEGACY_MAP_FONTS={modern:"dm-sans",editorial:"lora",geometric:"comfortaa",humanist:"nunito",mono:"mono",rounded:"quicksand",handwritten:"hand-patrick"};
const MAP_PALETTES={
 default:["#5b57b7","#7c78c8","#9b98d8","#bbb9e8","#d5d3f2"],
 purple:["#6846b5","#825fca","#a07fdb","#bca4e8","#d9c9f3"],
 warm:["#b86b32","#d18a45","#dfa76a","#ecc697","#f3dec0"],
 ocean:["#087e8b","#159a9c","#38b2ac","#73c8bd","#a8ddd2"],
 forest:["#39734f","#4e9360","#73aa70","#9bc48a","#c1d9ac"],
 sunset:["#bf4d68","#dc6b66","#eb8e68","#f1b070","#f5d08b"],
 slate:["#475569","#5c6b7d","#788697","#9ba7b2","#c1c8ce"]
};
const CARD_FONT_GROUPS=[
 ["Monospace",[
  ["mono","Mono"],["mono-code","JetBrains Mono"],["mono-fira","Fira Code"],["mono-courier","Courier Prime"],
  ["mono-dm","DM Mono"],["mono-victor","Victor Mono"]
 ]],
 ["Sans serif",[
  ["dm-sans","DM Sans"],["poppins","Poppins"],["raleway","Raleway"],
  ["nunito","Nunito"],["quicksand","Quicksand"],["league-spartan","League Spartan"]
 ]],
 ["Serif",[
  ["slab","Roboto Slab"],["lora","Lora"],
  ["alegreya","Alegreya"],["cormorant","Cormorant Garamond"],["fraunces","Fraunces"],
  ["bodoni","Bodoni Moda"]
 ]],
 ["Rounded",[["comfortaa","Comfortaa"],["fredoka","Fredoka"],["varela-round","Varela Round"]]],
 ["Handwritten",[
  ["comic-sans","Comic Sans"],
  ["comic-neue","Comic Neue"],["coming-soon","Coming Soon"],["itim","Itim"],
  ["hand-kalam","Kalam"],["hand-patrick","Patrick Hand"],

 ]]
];
const CARD_FONTS=CARD_FONT_GROUPS.flatMap(([,fonts])=>fonts);
const MAP_FONTS=CARD_FONTS.map(([value])=>value);
let defaultFontPreference="poppins";
function newCardFont(){return defaultFontPreference}
const LEGACY_CARD_FONTS={
 cinzel:"poppins","mono-typewriter":"mono","mono-azeret":"mono",
 sans:"dm-sans","josefin-sans":"nunito","editorial-serif":"lora","bebas-neue":"poppins",
 "dancing-script":"hand-patrick",sacramento:"hand-patrick",satisfy:"comic-sans","marck-script":"hand-patrick",
 hand:"hand-patrick",caveat:"hand-patrick","hand-caveat":"hand-patrick","hand-script":"hand-patrick",
 "hand-soft":"hand-patrick","hand-bold":"hand-kalam","hand-marker":"hand-kalam",
 "mono-terminal":"mono","mono-inconsolata":"mono-fira","mono-roboto":"mono-code","mono-source":"mono-code","mono-ubuntu":"mono",
 serif:"lora",editorial:"lora",humanist:"nunito",maiandra:"nunito",inter:"dm-sans",
 "nunito-sans":"nunito",manrope:"dm-sans","space-grotesk":"league-spartan",outfit:"poppins",rubik:"dm-sans",archivo:"dm-sans",rounded:"quicksand",
 montserrat:"dm-sans",playfair:"fraunces",merriweather:"lora",
 oswald:"league-spartan","dm-serif-display":"fraunces",anton:"poppins",shrikhand:"poppins","abril-fatface":"poppins"
};

const GOOGLE_FONT_SPECS={
 "mono-code":["JetBrains+Mono","wght@400;500;600"],
 "mono-fira":["Fira+Code","wght@400;500;600"],"mono-courier":["Courier+Prime","wght@400;700"],
 "mono-dm":["DM+Mono","wght@400;500"],"mono-victor":["Victor+Mono","wght@400;500;600"],
 "dm-sans":["DM+Sans","wght@400;500;600;700"],poppins:["Poppins","wght@400;500;600;700"],
 raleway:["Raleway","wght@400;500;600;700"],"josefin-sans":["Josefin+Sans","wght@400;500;600;700"],nunito:["Nunito","wght@400;500;600;700"],
 quicksand:["Quicksand","wght@400;500;600;700"],"league-spartan":["League+Spartan","wght@400;500;600;700"],
 slab:["Roboto+Slab","wght@400;500;600;700"],lora:["Lora","wght@400;500;600;700"],
 alegreya:["Alegreya","wght@400;500;600;700"],cormorant:["Cormorant+Garamond","wght@400;500;600;700"],
 fraunces:["Fraunces","wght@400;500;600;700"],bodoni:["Bodoni+Moda","wght@400;500;600;700"],
 comfortaa:["Comfortaa","wght@400;500;600;700"],fredoka:["Fredoka","wght@400;500;600;700"],"varela-round":["Varela+Round","wght@400"],
 "bebas-neue":["Bebas+Neue","wght@400"],
 "comic-neue":["Comic+Neue","wght@400;700"],"coming-soon":["Coming+Soon","wght@400"],itim:["Itim","wght@400"],
 "hand-kalam":["Kalam","wght@300;400;700"],"hand-patrick":["Patrick+Hand","wght@400"],"dancing-script":["Dancing+Script","wght@400;500;600;700"],
 sacramento:["Sacramento","wght@400"],satisfy:["Satisfy","wght@400"],"marck-script":["Marck+Script","wght@400"]
};
function googleFontStylesheetUrl(font){
 const key=normalizeCardFont(font),spec=GOOGLE_FONT_SPECS[key];
 return spec?`https://fonts.googleapis.com/css2?family=${spec[0]}:${spec[1]}&display=swap`:"";
}
const cardFontLoads=new Map();
function ensureFontLoaded(font){
 const key=normalizeCardFont(font),href=googleFontStylesheetUrl(key);
 if(!href)return Promise.resolve();
 if(cardFontLoads.has(key))return cardFontLoads.get(key);
 const link=document.createElement("link");
 link.id=`card-font-${key}`;link.rel="stylesheet";link.dataset.cardFont=key;link.href=href;
 const loaded=new Promise(resolve=>{
  link.onload=async()=>{
   try{
    const family=mapFontStack(key).split(",")[0];
    await Promise.all([document.fonts.load(`400 18px ${family}`),document.fonts.load(`700 28px ${family}`)]);
   }catch{}
   resolve();
  };
  link.onerror=()=>resolve();
 });
 cardFontLoads.set(key,loaded);
 document.head.appendChild(link);
 return loaded;
}

function normalizeCardFont(font){
 const value=LEGACY_CARD_FONTS[font]||LEGACY_MAP_FONTS[font]||font;
 return CARD_FONTS.some(([key])=>key===value)?value:"mono";
}

function normalizeMapFont(font){
 return normalizeCardFont(font);
}
function createCardFontGroups(){
 return CARD_FONT_GROUPS.map(([label,fonts])=>{
  const group=document.createElement("optgroup");group.label=label;
  group.append(...fonts.map(([value,name])=>new Option(name,value)));
  return group;
 });
}
function mapFontStack(font){
 const stacks={
  mono:'ui-monospace,SFMono-Regular,Consolas,monospace',
  "mono-code":'"JetBrains Mono","Cascadia Code","Fira Code",Consolas,ui-monospace,monospace',"mono-fira":'"Fira Code",ui-monospace,monospace',"mono-courier":'"Courier Prime","Courier New",Courier,monospace',
  "mono-dm":'"DM Mono",ui-monospace,monospace',"mono-victor":'"Victor Mono",ui-monospace,monospace',
  sans:'ui-sans-serif,system-ui,sans-serif',"dm-sans":'"DM Sans",ui-sans-serif,system-ui,sans-serif',poppins:'"Poppins",ui-sans-serif,system-ui,sans-serif',
  comfortaa:'"Comfortaa",ui-sans-serif,system-ui,sans-serif',fredoka:'"Fredoka",ui-sans-serif,system-ui,sans-serif',"varela-round":'"Varela Round",ui-sans-serif,system-ui,sans-serif',
  raleway:'"Raleway",ui-sans-serif,system-ui,sans-serif',"josefin-sans":'"Josefin Sans",ui-sans-serif,system-ui,sans-serif',
  nunito:'"Nunito",ui-sans-serif,system-ui,sans-serif',quicksand:'"Quicksand",ui-sans-serif,system-ui,sans-serif',"league-spartan":'"League Spartan",ui-sans-serif,system-ui,sans-serif',
  slab:'"Roboto Slab",Georgia,serif',"editorial-serif":'Cambria,Georgia,"Times New Roman",serif',
  lora:'"Lora",Georgia,serif',alegreya:'"Alegreya",Georgia,serif',
  cormorant:'"Cormorant Garamond",Georgia,serif',fraunces:'"Fraunces",Georgia,serif',bodoni:'"Bodoni Moda",Georgia,serif',
  "bebas-neue":'"Bebas Neue",Impact,sans-serif',
  "comic-sans":'"Comic Sans MS","Comic Sans",cursive',
  "comic-neue":'"Comic Neue","Comic Sans MS",cursive',"coming-soon":'"Coming Soon","Comic Sans MS",cursive',itim:'"Itim","Comic Sans MS",cursive',
  "hand-kalam":'"Kalam",cursive',"hand-patrick":'"Patrick Hand",cursive',"dancing-script":'"Dancing Script",cursive',
  sacramento:'"Sacramento",cursive',satisfy:'"Satisfy",cursive',"marck-script":'"Marck Script",cursive',
 };
 return stacks[normalizeMapFont(font)]||stacks["dm-sans"];
}
function applyMapFont(n,font=n.mapFont){
 const value=normalizeCardFont(font);
 n.font=value;n.mapFont=value;
 ensureFontLoaded(value);
 if(n.el){
  n.el.dataset.font=value;n.el.dataset.mapFont=value;
  n.el.style.setProperty("--card-font-family",mapFontStack(value));
  n.el.style.setProperty("--map-font-family",mapFontStack(value));
 }
}

function populateCardFontSelect(el,font){
 const selectEl=el.querySelector("[data-font]");
 selectEl.replaceChildren(...createCardFontGroups());
 selectEl.value=normalizeCardFont(font);
 syncCardSelect(selectEl);
 ensureFontLoaded(selectEl.value);
}
function applyCardFont(n,font=n.font){
 n.font=normalizeCardFont(font);
 n.mapFont=n.font;
 ensureFontLoaded(n.font);
 if(n.el){
  n.el.dataset.font=n.font;
  n.el.dataset.mapFont=n.font;
  n.el.style.setProperty("--card-font-family",mapFontStack(n.font));
  n.el.style.setProperty("--map-font-family",mapFontStack(n.font));
 }
}

let activeCardMenu=null;
let cardMenuId=0;
function syncCardSelect(select){
 if(select?.matches('[data-map-color],#mapColor')){
  const neutral=select.querySelector('option[value="default"]');
  if(neutral)neutral.textContent=document.body.classList.contains('dark')?'Midnight':'White';
 }

 const wrap=select?.closest(".custom-select");
 if(!wrap)return;
 const option=select.selectedOptions[0];
 const trigger=wrap.querySelector(".custom-select-trigger");
 if(trigger){
  const label=option?.textContent||select.value||select.getAttribute("aria-label")||"Select";
  trigger.querySelector(".custom-select-label").textContent=label;
  trigger.setAttribute("aria-label",`${select.getAttribute("aria-label")||"Option"}: ${label}`);
 }
 wrap.querySelectorAll(".custom-select-option").forEach(item=>{
  const selected=item.dataset.value===select.value;
  item.setAttribute("aria-selected",String(selected));
  item.classList.toggle("is-selected",selected);
 });
}
function closeCardMenu(restoreFocus=false){
 if(!activeCardMenu)return;
 const {wrap,trigger}=activeCardMenu;
 activeCardMenu.fontObserver?.disconnect();
 activeCardMenu.menu.remove();
 trigger.setAttribute("aria-expanded","false");
 wrap.classList.remove("menu-open");
 activeCardMenu=null;
 if(restoreFocus)trigger.focus();
}
function placeCardMenu(menu,trigger){
 const rect=trigger.getBoundingClientRect();
 const gap=6,margin=8;
 const below=innerHeight-rect.bottom-margin;
 const above=rect.top-margin;
 const placeAbove=below<210&&above>below;
 const available=placeAbove?above:below;
 const height=Math.min(menu.scrollHeight,280,Math.max(100,available-gap));
 menu.style.maxHeight=`${height}px`;
 menu.style.minWidth=`${Math.max(154,rect.width)}px`;
 menu.style.left=`${Math.max(margin,Math.min(rect.left,innerWidth-margin-menu.offsetWidth))}px`;
 menu.style.top=placeAbove?`${Math.max(margin,rect.top-gap-height)}px`:`${Math.min(innerHeight-margin-height,rect.bottom+gap)}px`;
}
function openCardMenu(wrap){
 if(activeCardMenu?.wrap===wrap){closeCardMenu();return}
 closeCardMenu();
 const select=wrap.querySelector("select"),trigger=wrap.querySelector(".custom-select-trigger");
 const menu=document.createElement("div");
 menu.className="custom-select-menu";menu.id=`card-select-menu-${++cardMenuId}`;
 menu.setAttribute("role","listbox");menu.setAttribute("aria-label",select.getAttribute("aria-label")||"Choose an option");
 const card=wrap.closest(".card");
 if(card){
  const styles=getComputedStyle(card);
  menu.style.setProperty("--menu-accent",styles.getPropertyValue(document.body.classList.contains("dark")?"--card-accent-dark":"--card-accent").trim()||"#7669d3");
 }
 let previousGroup="";
 for(const option of select.options){
  const group=option.parentElement?.tagName==="OPTGROUP"?option.parentElement.label:"";
  if(group&&group!==previousGroup){
   const heading=document.createElement("div");heading.className="custom-select-group";
   heading.setAttribute("role","presentation");heading.textContent=group;menu.appendChild(heading);
  }
  previousGroup=group;
  const item=document.createElement("button");
  item.type="button";item.className="custom-select-option";item.setAttribute("role","option");
  item.dataset.value=option.value;item.textContent=option.textContent;
  if(select.matches("[data-font],#mapFont")){
   const warm=()=>ensureFontLoaded(option.value);
   item.addEventListener("pointerenter",warm,{once:true});
   item.addEventListener("focus",warm,{once:true});
  }
  item.setAttribute("aria-selected",String(option.value===select.value));
  item.classList.toggle("is-selected",option.value===select.value);
  item.addEventListener("click",()=>{
   select.value=option.value;
   select.dispatchEvent(new Event("change",{bubbles:true}));
   syncCardSelect(select);closeCardMenu();trigger.focus();
  });
  menu.appendChild(item);
 }
 document.body.appendChild(menu);
 trigger.setAttribute("aria-expanded","true");trigger.setAttribute("aria-controls",menu.id);
 wrap.classList.add("menu-open");
 activeCardMenu={wrap,trigger,menu};
 placeCardMenu(menu,trigger);
 const current=menu.querySelector('[aria-selected="true"]')||menu.firstElementChild;
 current?.focus({preventScroll:true});
 current?.scrollIntoView({block:"nearest"});
 if(select.matches("[data-font],#mapFont")&&window.IntersectionObserver){
  const observer=new IntersectionObserver(entries=>{
   for(const entry of entries)if(entry.isIntersecting){ensureFontLoaded(entry.target.dataset.value);observer.unobserve(entry.target)}
  },{root:menu});
  for(const item of menu.querySelectorAll(".custom-select-option"))observer.observe(item);
  activeCardMenu.fontObserver=observer;
 }
 menu.addEventListener("keydown",e=>{
  const options=[...menu.querySelectorAll(".custom-select-option")];
  const index=options.indexOf(document.activeElement);
  let next=null;
  if(e.key==="ArrowDown")next=options[(index+1)%options.length];
  else if(e.key==="ArrowUp")next=options[(index-1+options.length)%options.length];
  else if(e.key==="Home")next=options[0];
  else if(e.key==="End")next=options.at(-1);
  else if(e.key==="Escape"){e.preventDefault();closeCardMenu(true);return}
  else if(e.key==="Tab"){closeCardMenu();return}
  if(next){e.preventDefault();next.focus();next.scrollIntoView({block:"nearest"})}
 });
}
function enhanceCustomSelect(select){
  if(select.closest(".custom-select"))return;
  const wrap=document.createElement("div");
  wrap.className=`custom-select ${select.className}`;
  wrap.dataset.control=select.hasAttribute("data-view")?"view":(select.hasAttribute("data-map-color")||select.id==="mapColor")?"theme":(select.hasAttribute("data-map-font")||select.id==="mapFont")?"map-font":select.hasAttribute("data-font")?"font":"size";
  const trigger=document.createElement("button");
  trigger.type="button";trigger.className="custom-select-trigger";
  trigger.setAttribute("aria-haspopup","listbox");trigger.setAttribute("aria-expanded","false");
  trigger.title=select.title||select.getAttribute("aria-label")||"Choose an option";
  trigger.innerHTML='<span class="custom-select-label"></span><svg class="custom-select-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg>';
  trigger.addEventListener("click",()=>openCardMenu(wrap));
  trigger.addEventListener("keydown",e=>{
   if(["ArrowDown","ArrowUp","Enter"," "].includes(e.key)){
    e.preventDefault();openCardMenu(wrap);
   }
  });
  select.classList.add("native-card-select");select.tabIndex=-1;select.setAttribute("aria-hidden","true");
  select.addEventListener("change",()=>syncCardSelect(select));
  select.before(wrap);wrap.append(trigger,select);
  syncCardSelect(select);
}
function enhanceCardSelects(card){
 card.querySelectorAll(".cardactions select").forEach(enhanceCustomSelect);
}
document.addEventListener("click",e=>{
 if(activeCardMenu&&!activeCardMenu.menu.contains(e.target)&&!activeCardMenu.wrap.contains(e.target))closeCardMenu();
});
window.addEventListener("resize",()=>{if(activeCardMenu)placeCardMenu(activeCardMenu.menu,activeCardMenu.trigger)});
const editorMapFont=$("#mapFont");
editorMapFont.replaceChildren(...createCardFontGroups());
const globalSettings=$("#globalSettings"),settingsButton=$("#settings"),defaultCardFont=$("#defaultCardFont");
try{const saved=localStorage.getItem("reflatex-default-font");if(saved)defaultFontPreference=normalizeCardFont(saved)}catch{}
defaultCardFont.replaceChildren(...createCardFontGroups());
defaultCardFont.value=defaultFontPreference;
ensureFontLoaded(defaultFontPreference);
defaultCardFont.addEventListener("change",()=>{
 defaultFontPreference=normalizeCardFont(defaultCardFont.value);
 try{localStorage.setItem("reflatex-default-font",defaultFontPreference)}catch{}
 ensureFontLoaded(defaultFontPreference);
});
function closeGlobalSettings(){
 globalSettings.hidden=true;settingsButton.setAttribute("aria-expanded","false");
 settingsButton.focus({preventScroll:true});showControls();
}
settingsButton.onclick=()=>{
 if(!globalSettings.hidden){closeGlobalSettings();return}
 closeCardMenu();globalSettings.hidden=false;settingsButton.setAttribute("aria-expanded","true");
 showControls();defaultCardFont.focus({preventScroll:true});
};
$("#closeGlobalSettings").onclick=closeGlobalSettings;
document.addEventListener("pointerdown",e=>{
 if(!globalSettings.hidden&&!globalSettings.contains(e.target)&&!settingsButton.contains(e.target))closeGlobalSettings();
});

editor.querySelectorAll(".map-options select").forEach(enhanceCustomSelect);

function showControls(){
  document.body.classList.remove("controls-hidden");
  state.controlsVisible=true;
  clearTimeout(state.hideTimer);
  state.hideTimer=setTimeout(()=>{
    if(!editor.classList.contains("open") && !context.classList.contains("open") && globalSettings.hidden){
      document.body.classList.add("controls-hidden");
      state.controlsVisible=false;
    }
  },3200);
}
let lastPointerWake=0;
function wakeControls(){
 if(state.pan)return;
 const now=performance.now();
 if(state.controlsVisible&&now-lastPointerWake<500)return;
 lastPointerWake=now;showControls();
}
document.querySelectorAll(".toolbar,.zoom,.editor,#globalSettings").forEach(panel=>{
 panel.addEventListener("pointerenter",showControls);
 panel.addEventListener("focusin",showControls);
});
function safeMarkdown(md){
 let out;
 try{
   out=window.marked?marked.parse(md):`<p>${escapeHtml(md)}</p>`;
 }catch{out=`<p>${escapeHtml(md)}</p>`}
 try{if(window.DOMPurify)out=DOMPurify.sanitize(out)}catch{}
 const content=document.createElement('template');content.innerHTML=out;
 content.content.querySelectorAll('a[href]').forEach(link=>{link.target='_blank';link.rel='noopener noreferrer'});
 content.content.querySelectorAll('img').forEach(image=>{image.referrerPolicy='no-referrer'});
 return content.innerHTML;
}
world.addEventListener('click',e=>{
 const link=e.target.closest('a[href]');
 if(link){link.setAttribute('target','_blank');link.setAttribute('rel','noopener noreferrer')}
},true);
function publicImageUrl(value){
 try{
  const url=new URL(value);
  const direct=/\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(url.pathname)||['images.unsplash.com','images.pexels.com'].includes(url.hostname);
  return ["http:","https:"].includes(url.protocol)&&direct
   ?url.href:"";
 }catch{return ""}
}
function escapeHtml(s){
 return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function showRuntimeError(message){
 const emptyMessage=$("#empty");
 if(emptyMessage){
  emptyMessage.innerHTML=`<div><b>ConceptCards could not start</b><span>${escapeHtml(message)}</span></div>`;
  emptyMessage.style.display="grid";
 }
 console.error("ConceptCards:",message);
}
function normalizeEscapedLatex(s){
  let text=String(s);

  /*
   * AI/chat exports sometimes escape LaTeX delimiters:
   *   \\( ... \\)  -> \( ... \)
   *   \\[ ... \\]  -> \[ ... \]
   *
   * They may also escape commands:
   *   \\frac -> \frac
   *   \\lambda -> \lambda
   *
   * Only collapse a DOUBLE backslash when it is clearly LaTeX syntax.
   * Genuine LaTeX line breaks `\\` are preserved.
   */
  text=text
    .replace(/\\\\(?=\(|\))/g,"\\")
    .replace(/\\\\(?=\[|\])/g,"\\");

  // Inside probable LaTeX regions, normalize doubled command slashes.
  // This deliberately excludes a bare `\\` so matrix/line-break syntax survives.
  text=text.replace(
    /(?:\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$)/g,
    region=>region.replace(/\\\\(?=[A-Za-z])/g,"\\")
  );

  // Also support common AI output where a whole math command was escaped
  // but delimiters are already correct, e.g. \(\\frac{a}{b}\).
  text=text.replace(
    /\\\(([\s\S]*?)\\\)/g,
    (_,body)=>`\\(${body.replace(/\\\\(?=[A-Za-z])/g,"\\")}\\)`
  );
  text=text.replace(
    /\\\[([\s\S]*?)\\\]/g,
    (_,body)=>`\\[${body.replace(/\\\\(?=[A-Za-z])/g,"\\")}\\]`
  );
  text=text.replace(
    /\$\$([\s\S]*?)\$\$/g,
    (_,body)=>`$$${body.replace(/\\\\(?=[A-Za-z])/g,"\\")}$$`
  );

  return text;
}

function normalizeBareMath(s){
  const atom=String.raw`(?:`+
    String.raw`[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9{}]+)?(?:\([^()\n]*\))?`+
    String.raw`|\[[A-Za-z0-9_,\s]+\]`+
    String.raw`|[⟨⟩α-ωΑ-ΩλμσΣπ∞√]`+
  String.raw`)`;

  const operator=String.raw`(?:=|≈|≃|≅|≥|≤|≠|∝|:=|→|←)`;

  const mathCue=/(?:\^|_[A-Za-z0-9{]|\\(?:frac|dfrac|tfrac|sqrt|sum|prod|log|ln|sin|cos|tan|lim|infty|alpha|beta|gamma|lambda|mu|sigma|pi)|[×÷±∑∫√∞≈≤≥≠∝]|[A-Za-z]\([^)\n]+\)|\[[A-Za-z0-9_,\s]+\])/;

  function symbols(expr){
    return expr
      .replace(/×/g,"\\times ")
      .replace(/÷/g,"\\div ")
      .replace(/±/g,"\\pm ")
      .replace(/≈/g,"\\approx ")
      .replace(/≃/g,"\\simeq ")
      .replace(/≅/g,"\\cong ")
      .replace(/≥/g,"\\ge ")
      .replace(/≤/g,"\\le ")
      .replace(/≠/g,"\\ne ")
      .replace(/∝/g,"\\propto ")
      .replace(/∞/g,"\\infty ")
      .replace(/√\s*\(([^()\n]+)\)/g,"\\sqrt{$1}")
      .replace(/Σ/g,"\\Sigma ")
      .replace(/∑/g,"\\sum ")
      .replace(/∫/g,"\\int ")
      .replace(/α/g,"\\alpha ")
      .replace(/β/g,"\\beta ")
      .replace(/γ/g,"\\gamma ")
      .replace(/δ/g,"\\delta ")
      .replace(/λ/g,"\\lambda ")
      .replace(/μ/g,"\\mu ")
      .replace(/σ/g,"\\sigma ")
      .replace(/π/g,"\\pi ")
      .replace(/⟨/g,"\\langle ")
      .replace(/⟩/g,"\\rangle ");
  }

  function transformLine(line){
    if(!line.trim())return line;

    // Exceptions: Markdown structure, URLs, code-ish lines and table rows.
    if(/^\s*(?:#{1,6}\s|>|```|~~~|\|)/.test(line))return line;
    if(/^\s*(?:https?:\/\/|www\.)/.test(line))return line;
    if(/^\s{4,}\S/.test(line))return line;

    const prefixMatch=/^(\s*(?:[-*+]\s+|\d+[.)]\s+))/.exec(line);
    const prefix=prefixMatch?prefixMatch[1]:"";
    const body=prefix?line.slice(prefix.length):line;

    const rx=new RegExp(`(${atom}\\s*${operator}\\s*)`,"g");
    let out="",pos=0,match;

    while((match=rx.exec(body))){
      const start=match.index;
      const before=body.slice(0,start);

      // Don't touch an expression already inside explicit math.
      const dollarCount=(before.match(/(?<!\\)\$/g)||[]).length;
      if(dollarCount%2===1)continue;

      let rest=body.slice(start+match[0].length);
      let depth=0,end=rest.length;

      for(let i=0;i<rest.length;i++){
        const c=rest[i];
        if(c==="("||c==="["||c==="{")depth++;
        else if(c===")"||c==="]"||c==="}")depth=Math.max(0,depth-1);

        if(depth===0){
          if(/[.!?]/.test(c)&&/\s/.test(rest[i+1]||"")){
            end=i;break;
          }
          if(i>5 && /^\s+(?:for|where|with|which|that|this|the|is|are|means|represents|denotes|and|or|but)\b/i.test(rest.slice(i))){
            end=i;break;
          }
        }
      }

      let expr=(match[0]+rest.slice(0,end)).trim();
      if(expr.length<4||expr.length>260||!mathCue.test(expr))continue;

      expr=expr.replace(/[,:;]\s*$/,"").trim();
      out+=body.slice(pos,start);
      out+=`\\(${symbols(expr)}\\)`;
      pos=start+expr.length;
      rx.lastIndex=pos;
    }

    return prefix+out+body.slice(pos);
  }

  return s.split("\n").map(transformLine).join("\n");
}

function looksLikeMathBlock(code){
  const s=String(code).trim();
  if(/^\s*(?:\/\/|\/\*|(?:const|let|var|function|return|import|export|class|def|print|if|for|while)\b)/m.test(s))return false;

  // A fenced block is treated as mathematical content when it contains
  // explicit LaTeX display/inline delimiters or several strong LaTeX cues.
  // Ordinary programming blocks remain untouched.
  const hasDelimiter =
    /(?:\\\\)?\\\[[\s\S]*?(?:\\\\)?\\\]/.test(s) ||
    /(?:\\\\)?\\\([\s\S]*?(?:\\\\)?\\\)/.test(s) ||
    /\$\$[\s\S]*?\$\$/.test(s);

  const latexCommands =
    /\\(?:frac|dfrac|tfrac|begin|end|text|mathbf|mathrm|operatorname|sum|prod|int|infty|alpha|beta|gamma|lambda|mu|sigma|pi|deg|quad|left|right|cdot|times|cases)\b/.test(s);

  const matrixCues =
    /\\begin\s*\{(?:cases|matrix|pmatrix|bmatrix|aligned|array)\}/.test(s);

  if(hasDelimiter && (latexCommands || matrixCues)) return true;

  // Also catch AI output where a complete equation was accidentally put
  // between triple backticks without explicit $ delimiters.
  const equationLines=s.split(/\n+/).filter(Boolean);
  const equationCount=equationLines.filter(line=>
    /(?:=|≈|≤|≥|≠|∝)/.test(line) &&
    /(?:\^|_|\\[A-Za-z]+|[A-Za-z]\([^)]*\)|[×÷∑∫√∞])/.test(line)
  ).length;

  return equationLines.length>0 &&
         equationCount/equationLines.length>=0.7 &&
         /\\[A-Za-z]+/.test(s);
}

function renderMathBlockSource(code){
  let s=normalizeEscapedLatex(String(code).trim());

  // If the whole accidental code block is a LaTeX display, use its source.
  // If it contains a mix of explanatory text and LaTeX, wrap the complete
  // block as display math only when it is clearly equation-oriented.
  if(!/(?:\$\$|\\\[|\\\(|\\\\\[|\\\\\()/.test(s)){
    s=`$$${s}$$`;
  }
  return s;
}

// Split highlighted content into logical lines without losing nested token
// styles. Each line owns its number, so wrapped lines keep the gutter aligned.
function wrapCodeLines(code){
 const fragment=document.createDocumentFragment();
 let line,clones;
 const nextLine=()=>{
  if(line)fragment.appendChild(document.createTextNode("\n"));
  line=document.createElement("span");line.className="code-line";
  fragment.appendChild(line);clones=new Map();
 };
 nextLine();
 function visit(node,ancestors){
  if(node.nodeType===3){
   node.textContent.split("\n").forEach((part,index)=>{
    if(index)nextLine();
    let parent=line;
    for(const ancestor of ancestors){
     if(!clones.has(ancestor)){
      const clone=ancestor.cloneNode(false);parent.appendChild(clone);clones.set(ancestor,clone);
     }
     parent=clones.get(ancestor);
    }
    parent.appendChild(document.createTextNode(part));
   });
  }else if(node.nodeType===1){
   for(const child of node.childNodes)visit(child,[...ancestors,node]);
  }
 }
 for(const child of code.childNodes)visit(child,[]);
 code.replaceChildren(fragment);
}
function textHighlightSpans(md){
 const stack=[],spans=[];
 if(!String(md).includes('card-text-highlight'))return spans;
 // Ignore literal examples inside code while keeping source offsets intact.
 const source=String(md)
  .replace(/(^|\n)([ \t]*)(```+|~~~+)([^\n]*)\n([\s\S]*?)(?:\n[ \t]*\3[ \t]*)(?=\n|$)/g,block=>block.replace(/[^\n]/g,' '))
  .replace(/(^|\n)((?:[ \t]{4}.*(?:\n|$))+)/g,block=>block.replace(/[^\n]/g,' '))
  .replace(/(`+)[\s\S]*?\1/g,code=>code.replace(/[^\n]/g,' '));
 for(const match of source.matchAll(/<mark\b[^>]*>|<\/mark\s*>/gi)){
  if(/^<mark/i.test(match[0])){
   const color=/data-highlight=["'](theme|yellow|green|blue|pink)["']/i.exec(match[0]);
   stack.push({start:match.index,contentStart:match.index+match[0].length,color:color?.[1],ours:/card-text-highlight/.test(match[0])});
  }else{
   const opening=stack.pop();if(opening?.ours&&opening.color)spans.push({...opening,contentEnd:match.index,end:match.index+match[0].length});
  }
 }
 return spans.sort((a,b)=>a.start-b.start);
}

function render(md){
  let text=String(md);
  const blockCodes=[];
  const inlineCodes=[];
  const math=[];
  const highlightTokens=[];

  function listContentIndentBefore(offset,source){
    const indentWidth=value=>[...value].reduce((width,char)=>
      char==="\t"?width+(4-width%4):width+1,0);
    const stack=[];
    for(const line of source.slice(0,offset).split("\n")){
      if(!line.trim())continue;
      const item=/^([ \t]*)(?:[-+*]|\d+[.)])([ \t]+)/.exec(line);
      if(item){
        const indent=indentWidth(item[1]);
        while(stack.length&&stack.at(-1).indent>=indent)stack.pop();
        stack.push({indent,content:indentWidth(item[0])});
        continue;
      }
      const lineIndent=indentWidth(/^[ \t]*/.exec(line)[0]);
      while(stack.length&&lineIndent<stack.at(-1).content)stack.pop();
    }
    return stack.at(-1)?.content||0;
  }

  // Protect fenced code blocks first. Some AI responses accidentally fence
  // LaTeX equations; those are classified after extraction.
  text=text.replace(
    /(^|\n)([ \t]*)(```+|~~~+)([^\n]*)\n([\s\S]*?)(?:\n[ \t]*\3[ \t]*)(?=\n|$)/g,
    (whole,lead,indent,fence,info,code)=>{
      const id=blockCodes.length;
      const language=(info||"").trim().split(/\s+/)[0]||"";
      blockCodes.push({code,language,math:(!language||/^(?:math|latex|tex|katex)$/i.test(language))&&looksLikeMathBlock(code)});
      return `${lead}@@REFLATEX_BLOCK_${id}@@`;
    }
  );

  // Raw HTML code examples also bypass Markdown and equation cleanup.
  text=text.replace(/(^|\n)([ \t]{0,3})(<pre\b[^>]*>[\s\S]*?<\/pre\s*>)/gi,(_,lead,indent,html)=>{
    const id=blockCodes.length;blockCodes.push({html});
    return `${lead}${indent}@@REFLATEX_BLOCK_${id}@@\n`;
  });

  // Protect indented code blocks.
  text=text.replace(
    /(^|\n)((?:[ \t]{4}.*(?:\n|$))+)/g,
    (whole,lead,block,offset,source)=>{
      const listIndent=listContentIndentBefore(offset,source);
      const threshold=listIndent?listIndent+4:4;
      const lines=block.split("\n").filter(line=>line.trim());
      const minimumIndent=line=>{
        const prefix=/^[ \t]*/.exec(line)[0];
        return [...prefix].reduce((width,char)=>char==="\t"?width+(4-width%4):width+1,0);
      };
      if(listIndent&&lines.some(line=>minimumIndent(line)<threshold))return whole;
      const id=blockCodes.length;
      const code=block.replace(/^[ \t]{4}/gm,"").replace(/\n$/,"");
      blockCodes.push({code,language:"",math:looksLikeMathBlock(code)});
      return `${lead}@@REFLATEX_BLOCK_${id}@@${block.endsWith('\n')?'\n':''}`;
    }
  );

  // Protect inline code.
  text=text.replace(/`([^`\n]+)`/g,(whole,code,offset,source)=>{
    const lineStart=source.lastIndexOf("\n",offset-1)+1;
    if(/^[ \t]{4,}$/.test(source.slice(lineStart,offset)))return whole;
    const id=inlineCodes.length;
    inlineCodes.push(code);
    return `@@REFLATEX_INLINE_${id}@@`;
  });

  // Normalize prose equations only after literal code is protected.
  text=normalizeEscapedLatex(text);

  const highlights=textHighlightSpans(text);
  const outerHighlights=highlights.filter(span=>!highlights.some(parent=>parent.start<span.start&&parent.end>span.end));
  for(const span of outerHighlights.reverse()){
   let content=text.slice(span.contentStart,span.contentEnd);
   inlineCodes.forEach((code,i)=>{content=content.split('@@REFLATEX_INLINE_'+i+'@@').join(String.fromCharCode(96)+code+String.fromCharCode(96))});
   const html=render(content).replace(/^<p>([\s\S]*)<\/p>\s*$/,(_,inner)=>inner);
   const token='@@REFLATEX_HIGHLIGHT_'+highlightTokens.length+'@@';
   highlightTokens.push('<mark class="card-text-highlight" data-highlight="'+span.color+'">'+html+'</mark>');
   text=text.slice(0,span.start)+token+text.slice(span.end);
  }

  // Explicit LaTeX delimiters. Long/display forms first.
  const mathPatterns=[
    /\$\$[\s\S]*?\$\$/g,
    /\\\[[\s\S]*?\\\]/g,
    /\\\([\s\S]*?\\\)/g,
    /(?<!\$)\$(?!\$)(?=\S)(?:\\.|[^$\\\n])+(?<=\S)\$(?!\$)/g
  ];

  for(const rx of mathPatterns){
    text=text.replace(rx,match=>{
      const id=math.length;
      math.push(match);
      return `@@REFLATEX_MATH_${id}@@`;
    });
  }

  // Bare AI equations.
  text=normalizeBareMath(text);

  // Treat a standalone direct image URL as Markdown image syntax. This keeps
  // ordinary links as links and avoids rewriting fenced or inline code, which
  // has already been replaced with protected tokens above.
  text=text.replace(/(^|\n)([ \t]*)(https?:\/\/[^\s<>]+)([ \t]*)(?=\n|$)/g,(whole,lead,before,rawUrl,after)=>{
    const url=publicImageUrl(rawUrl.replace(/[.,!?;:]+$/,""));
    if(!url)return whole;
    const trailing=rawUrl.slice(rawUrl.replace(/[.,!?;:]+$/," ").trimEnd().length);
    return `${lead}${before}![Public image](<${url}>)${trailing||after}`;
  });

  let out=safeMarkdown(text);

  // Restore fenced blocks. Math-like blocks become actual KaTeX display
  // instead of literal dark code blocks.
  blockCodes.forEach((item,i)=>{
    const token=`@@REFLATEX_BLOCK_${i}@@`;

    if(item.html){
      const html=safeMarkdown(item.html);
      out=out.replace(`<p>${token}</p>`,()=>html).split(token).join(html);
      return;
    }

    if(item.math){
      const mathSource=renderMathBlockSource(item.code);
      out=out.replace(
        `<p>${token}</p>`,
        ()=>`<div class="ref-math-block">${mathSource}</div>`
      );
      out=out.split(token).join(
        `<div class="ref-math-block">${mathSource}</div>`
      );
    }else{
      const escaped=escapeHtml(item.code);
      const lang=item.language
        ? ` class="language-${escapeHtml(item.language)}"`:"";
      const lineCount=item.code.split("\n").length;
      const codeHtml=`<pre class="line-numbered" data-line-count="${lineCount}"><code${lang}>${escaped}</code></pre>`;
      out=out.replace(`<p>${token}</p>`,()=>codeHtml);
      out=out.split(token).join(codeHtml);
    }
  });

  inlineCodes.forEach((code,i)=>{
    out=out.split(`@@REFLATEX_INLINE_${i}@@`)
      .join(`<code>${escapeHtml(code)}</code>`);
  });

  math.forEach((value,i)=>{
    out=out.split(`@@REFLATEX_MATH_${i}@@`).join(value);
  });

  highlightTokens.forEach((html,i)=>{out=out.split('@@REFLATEX_HIGHLIGHT_'+i+'@@').join(html)});
  const box=document.createElement("div");
  box.innerHTML=out;
  const sourceHighlights=textHighlightSpans(md);
  box.querySelectorAll('mark.card-text-highlight').forEach((mark,i)=>{
   const span=sourceHighlights[i];if(span){mark.dataset.highlightStart=span.start;mark.dataset.highlightEnd=span.end}
  });

  box.querySelectorAll("pre").forEach(pre=>{
    let code=pre.querySelector("code");
    if(!code){code=document.createElement("code");code.append(...pre.childNodes);pre.append(code)}
    pre.classList.add("line-numbered");pre.dataset.lineCount=code.textContent.split("\n").length;
    if(window.hljs){
      const languageClass=[...code.classList].find(name=>name.startsWith("language-"));
      const language=languageClass?.slice("language-".length);
      if(language&&!hljs.getLanguage(language))code.classList.remove(languageClass);
      try{hljs.highlightElement(code)}catch{}
    }
    wrapCodeLines(code);
  });

  try{
    if(window.renderMathInElement){
      renderMathInElement(box,{
        delimiters:[
          {left:"$$",right:"$$",display:true},
          {left:"\\[",right:"\\]",display:true},
          {left:"\\(",right:"\\)",display:false},
          {left:"$",right:"$",display:false}
        ],
        throwOnError:false,
        strict:"ignore",
        trust:false,
        ignoredTags:["script","noscript","style","textarea","pre","code"]
      });
    }
  }catch(err){
    console.warn("KaTeX rendering:",err);
  }

  box.querySelectorAll("img").forEach(image=>{
    image.loading="lazy";
    image.decoding="async";
    image.draggable=false;
    image.classList.add("card-image");
  });

  box.querySelectorAll("table").forEach(table=>{
   const scroll=document.createElement("div");scroll.className="table-scroll";
   scroll.tabIndex=0;scroll.setAttribute("role","region");scroll.setAttribute("aria-label","Scrollable table");
   table.replaceWith(scroll);scroll.appendChild(table);
  });
  return box.innerHTML;
}
function cardMarkdownParts(md){
 const source=String(md).replace(/^\uFEFF/,"");
 if(window.marked?.lexer){
  const heading=marked.lexer(source).find(token=>token.type==="heading"&&token.text.trim());
  return {title:heading?.text.trim()||"",body:source};
 }
 const match=/^(?:[ \t]*\r?\n)*[ \t]*#{1,6}\s+([^\r\n]+?)[ \t]*#*[ \t]*(?:\r?\n|$)/.exec(source);
 return match
  ? {title:match[1].trim(),body:source.slice(match[0].length)}
  : {title:"",body:source};
}
function sourceTitle(n){return typeof n.sourceName==='string'?n.sourceName.replace(/\.(?:md|markdown)$/i,''):''}
function updateCardHeading(n){
 const title=n.el?.querySelector(".map-title");
 if(!title)return;
 const heading=cardMarkdownParts(n.md).title;
 if(heading){
  const parsed=document.createElement("div");
  parsed.innerHTML=render(`# ${heading}`);
  title.innerHTML=parsed.querySelector("h1")?.innerHTML||escapeHtml(heading);
 }else title.textContent=sourceTitle(n);
 n.el.classList.toggle("has-title",Boolean(heading||sourceTitle(n)));
 scheduleCardIndex();
}
function renderCardMarkdown(md,highlights=[]){
 const html=render(String(md));if(!highlights?.length)return html;
 const root=document.createElement('div');root.innerHTML=html;ConceptTextHighlights.paint(root,highlights);return root.innerHTML;
}
function migrateCardHighlights(n){
 n.highlights=ConceptTextHighlights.normalize(n.highlights);
 if(!n.md.includes('card-text-highlight'))return;
 const root=document.createElement('div');root.innerHTML=render(n.md);
 for(const mark of root.querySelectorAll('mark.card-text-highlight')){
  const range=document.createRange();range.selectNodeContents(mark);
  const selected=ConceptTextHighlights.selection(root,range);if(selected)n.highlights.push(ConceptTextHighlights.create(selected,mark.dataset.highlight||'theme'));
 }
 const edits=textHighlightSpans(n.md).flatMap(span=>[{start:span.start,end:span.contentStart},{start:span.contentEnd,end:span.end}]);
 for(const edit of edits.sort((a,b)=>b.start-a.start))n.md=n.md.slice(0,edit.start)+n.md.slice(edit.end);
}
function markmapOptions(n){
 const colors=MAP_PALETTES[n.mapColor]||MAP_PALETTES.default;
 const depth=node=>node.state?.depth||0;
 return {
  color:node=>colors[depth(node)%colors.length],
  // Give the main limbs more weight, then let child branches taper naturally.
  lineWidth:node=>depth(node)===1?3.6:depth(node)===2?2.25:1.55,
  style:id=>`#${id} .markmap-link{stroke-linecap:round;stroke-linejoin:round}`,
  duration:350,maxWidth:300,spacingVertical:15,spacingHorizontal:82
 };
}
function mapViewportSize(){
 const view=focusViewport();
 const scale=Math.max(1,view.width/1600,view.height/1200);
 return {
  // Match the usable viewport's aspect ratio, including the index and tray.
  // Scale both dimensions together when the card size limit is reached.
  width:Math.max(Math.min(300,Math.max(200,innerWidth-24)),Math.min(1600,Math.round(view.width/scale))),
  height:Math.max(320,Math.min(1200,Math.round(view.height/scale)))
 };
}
const PEN_PAN_GAIN=1.7;
// Keep D3 gesture bookkeeping immediate, but paint the latest SVG transform
// once per frame instead of redrawing rich map content for every input event.
function enableMapCameraFrames(svg,map,settings={drag:1}){
 const zoom=map.zoom,paint=zoom?.on("zoom");
 if(!paint)return;
 zoom.wheelDelta?.(e=>{
  const unit=e.deltaMode===1?.05:e.deltaMode===2?1:.002;
  const sensitivity=e.ctrlKey?Math.max(.25,Math.min(3,Number(settings.pinch)||1)):Math.max(.5,Math.min(1.5,Number(settings.wheel)||1));
  return Math.max(-4,Math.min(4,-e.deltaY*unit*2.2*sensitivity));
 });
 let frame=0,pending=null,dragOrigin=null;
 zoom.on("start.drag-sensitivity",e=>{
  dragOrigin=e.sourceEvent?.type==="mousedown"?{transform:window.d3.zoomTransform(svg),gain:Math.max(.5,Math.min(1.5,Number(settings.drag)||1))}:null;
 });
 zoom.on("end.drag-sensitivity",()=>{dragOrigin=null});
 const flush=()=>{
  frame=0;
  const next=pending;pending=null;
  if(next&&svg.isConnected)paint.apply(next.context,next.args);
 };
 zoom.on("zoom",function(...args){
  const event=args[0];
  if(dragOrigin&&event.sourceEvent?.type==="mousemove"){
   const t=event.transform,origin=dragOrigin.transform,gain=dragOrigin.gain;
   const transform=t.translate((t.x-origin.x)*(gain-1)/t.k,(t.y-origin.y)*(gain-1)/t.k);
   svg.__zoom=transform;args[0]={...event,transform};
  }
  pending={context:this,args};
  if(!frame)frame=requestAnimationFrame(flush);
 });
 return()=>{if(frame)cancelAnimationFrame(frame);frame=0;pending=null};
}
function enablePenMapWheel(pane,svg,map){
 let lastPointer=null;
 const rememberPointer=e=>{
  if(!Number.isFinite(e.clientX)||!Number.isFinite(e.clientY))return;
  // Pointer events identify the active device; compatibility mouse wheel
  // events may need this recent position when a tablet driver omits it.
  lastPointer={x:e.clientX,y:e.clientY,type:e.pointerType||"mouse",time:e.timeStamp};
 };
 pane.addEventListener("pointermove",rememberPointer,true);
 pane.addEventListener("pointerdown",rememberPointer,true);
 pane.addEventListener("wheel",e=>{
  const card=pane.closest(".map-card");
  if(!card?.classList.contains("selected")){
   e.preventDefault();e.stopImmediatePropagation();return;
  }
  // Pen-tablet wheel events can carry a stale (often 0,0) client position.
  // Use their valid event position when available, otherwise the latest pen
  // hover point, and finally the map center instead of a stale mouse point.
  e.preventDefault();e.stopImmediatePropagation();
  const rect=svg.getBoundingClientRect();
  const inside=(x,y)=>x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom;
  let clientX=e.clientX,clientY=e.clientY;
  // Tablet drivers often expose wheel as a compatibility MouseEvent, so its
  // coordinates can be stale even when they are nonzero and inside the map.
  // Pen pointermove is the reliable source of the current stylus position.
  const recentPointer=lastPointer&&e.timeStamp-lastPointer.time>=0&&e.timeStamp-lastPointer.time<500;
  if(!e.ctrlKey&&recentPointer&&lastPointer.type==="pen"&&inside(lastPointer.x,lastPointer.y)){
   clientX=lastPointer.x;clientY=lastPointer.y;
  }else if((clientX===0&&clientY===0)||!inside(clientX,clientY)){
   clientX=recentPointer&&inside(lastPointer.x,lastPointer.y)?lastPointer.x:rect.left+rect.width/2;
   clientY=recentPointer&&inside(lastPointer.x,lastPointer.y)?lastPointer.y:rect.top+rect.height/2;
  }
  const point=window.d3?.pointer?.({clientX,clientY},svg)||[rect.width/2,rect.height/2];
  const unit=e.deltaMode===1?0.05:e.deltaMode===2?1:0.002;
  const exponent=-e.deltaY*unit*(e.ctrlKey?navigation.pinch:navigation.wheel)*2.2;
  if(!Number.isFinite(exponent)||!window.d3||!map.zoom?.scaleBy)return;
  window.d3.select(svg).call(map.zoom.scaleBy,2**Math.max(-4,Math.min(4,exponent)),point);
 },{capture:true,passive:false});
}
function enablePenMapPan(pane,svg,map){
 let drag=null,suppressClickUntil=0,compatMouseUntil=0,panFrame=0,glideFrame=0;
 let pendingX=0,pendingY=0,velocityX=0,velocityY=0;
 const translate=(dx,dy)=>{
  const scale=window.d3?.zoomTransform?.(svg)?.k||1;
  if(window.d3&&map.zoom?.translateBy)window.d3.select(svg).call(map.zoom.translateBy,dx*PEN_PAN_GAIN*navigation.drag/scale,dy*PEN_PAN_GAIN*navigation.drag/scale);
 };
 const flush=()=>{
  panFrame=0;
  if(!pendingX&&!pendingY)return;
  const dx=pendingX,dy=pendingY;pendingX=pendingY=0;translate(dx,dy);
 };
 const queuePan=(dx,dy)=>{
  pendingX+=dx;pendingY+=dy;
  if(!panFrame)panFrame=requestAnimationFrame(flush);
 };
 const glide=()=>{
  if(glideFrame)cancelAnimationFrame(glideFrame);
  let previous=performance.now();
  const step=now=>{
   const elapsed=Math.min(32,Math.max(1,now-previous));previous=now;
   translate(velocityX*elapsed,velocityY*elapsed);
   const friction=Math.exp(-elapsed/105);
   velocityX*=friction;velocityY*=friction;
   if(Math.hypot(velocityX,velocityY)>.012)glideFrame=requestAnimationFrame(step);
   else glideFrame=0;
  };
  glideFrame=requestAnimationFrame(step);
 };
 pane.addEventListener("pointerdown",e=>{
  if(e.pointerType!=="pen"||e.button!==0||!pane.closest(".map-card")?.classList.contains("selected")||e.target.closest(".cardactions,.resize"))return;
  if(glideFrame){cancelAnimationFrame(glideFrame);glideFrame=0}
  velocityX=velocityY=0;
  drag={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,lastTime:e.timeStamp,moved:false};
  compatMouseUntil=performance.now()+140;
  try{pane.setPointerCapture(e.pointerId)}catch{}
 },true);
 pane.addEventListener("mousedown",e=>{
  if(performance.now()>compatMouseUntil)return;
  e.preventDefault();e.stopImmediatePropagation();
 },true);
 pane.addEventListener("pointermove",e=>{
  if(!drag||drag.id!==e.pointerId)return;
  const coalesced=e.getCoalescedEvents?.();
  const events=coalesced?.length?coalesced:[e];
  for(const point of events){
   if(!drag.moved&&Math.hypot(point.clientX-drag.x,point.clientY-drag.y)<4)continue;
   drag.moved=true;
   const dx=point.clientX-drag.lastX,dy=point.clientY-drag.lastY;
   const elapsed=Math.max(1,point.timeStamp-drag.lastTime);
   const blend=1-Math.exp(-elapsed/42);
   velocityX+=(dx/elapsed-velocityX)*blend;velocityY+=(dy/elapsed-velocityY)*blend;
   queuePan(dx,dy);drag.lastX=point.clientX;drag.lastY=point.clientY;drag.lastTime=point.timeStamp;
  }
  if(drag.moved){e.preventDefault();pane.classList.add("pen-panning")}
 },{passive:false});
 const finish=e=>{
  if(!drag||drag.id!==e.pointerId)return;
  const moved=drag.moved;
  if(panFrame){cancelAnimationFrame(panFrame);flush()}
  if(moved){
   suppressClickUntil=performance.now()+400;
   if(e.type==="pointerup"){
    const speed=Math.hypot(velocityX,velocityY),limit=.32;
    if(speed>limit){velocityX*=limit/speed;velocityY*=limit/speed}
    if(speed>.035)glide();
   }
  }
  drag=null;pane.classList.remove("pen-panning");
 };
 pane.addEventListener("pointerup",finish,true);
 pane.addEventListener("pointercancel",finish,true);
 pane.addEventListener("click",e=>{
  if(performance.now()>suppressClickUntil)return;
  e.preventDefault();e.stopImmediatePropagation();
 },true);
}
function prepareMarkmapMarkdown(markdown){
 const code=[];
 let source=String(markdown).replace(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g,match=>{
  const id=code.length;code.push(match);return `@@REFLATEX_MARKMAP_CODE_${id}@@`;
 });
 source=normalizeEscapedLatex(source)
  .replace(/\\\[([\s\S]*?)\\\]/g,(_,math)=>`$$\n${math}\n$$`)
  .replace(/\\\(([\s\S]*?)\\\)/g,(_,math)=>`$${math}$`);
 code.forEach((value,id)=>{source=source.replace(`@@REFLATEX_MARKMAP_CODE_${id}@@`,value)});
 return source;
}
async function renderMap(n){
 const body=n.el?.querySelector(".cardbody");
 if(!body)return;
 const renderId=(n.mapRenderId||0)+1;
 n.mapRenderId=renderId;
 n.mapCameraCleanup?.();n.mapCameraCleanup=null;
 try{n.mapInstance?.destroy?.()}catch{}
 n.mapInstance=null;
 applyMapFont(n);
 if(!window.markmap?.Transformer||!window.markmap?.Markmap){
  body.innerHTML='<div class="map-error">Markmap could not load. Check your connection, then reopen this map.</div>';
  return;
 }
 try{
  const transformer=new window.markmap.Transformer();
  const {root}=transformer.transform(prepareMarkmapMarkdown(n.md));
  body.innerHTML='<div class="map-pane"></div>';
  const pane=body.querySelector(".map-pane");
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  pane.appendChild(svg);
  const options=markmapOptions(n);
  options.initialExpandLevel=6;
  // renderMap performs one explicit fit after the SVG has finished laying out.
  // Disable Markmap's implicit setData fit so there is only one initial transform.
  options.autoFit=false;
  const map=window.markmap.Markmap.create(svg,options);
  n.mapCameraCleanup=enableMapCameraFrames(svg,map,navigation);
  const defaultZoomFilter=map.zoom?.filter?.();
  if(defaultZoomFilter)map.zoom.filter(function(event){
   return n.el.classList.contains("selected")&&defaultZoomFilter.call(this,event);
  });
  // Handle wheel zoom ourselves so pen-tablet events use a reliable anchor.
  enablePenMapWheel(pane,svg,map);
  n.mapInstance=map;
  await map.setData(root);
  if(n.mapRenderId!==renderId||n.type!=="map")return;
  n.mapIndexRoot=root;scheduleCardIndex();
  const spans=textHighlightSpans(n.md);
  pane.querySelectorAll('mark.card-text-highlight').forEach((mark,i)=>{const span=spans[i];if(span){mark.dataset.highlightStart=span.start;mark.dataset.highlightEnd=span.end}});
  pane.querySelectorAll(".markmap-node pre").forEach(pre=>{
   pre.classList.add("map-codeblock");
   const code=pre.querySelector("code");
   if(!code||!window.hljs)return;
   const languageClass=[...code.classList].find(name=>name.startsWith("language-"));
   const language=languageClass?.slice("language-".length);
   if(language&&!hljs.getLanguage(language))code.classList.remove(languageClass);
   try{hljs.highlightElement(code)}catch{}
  });
  ConceptTextHighlights.paint(pane,n.highlights);
  enablePenMapPan(pane,svg,map);
  await map.fit();
 }catch(err){
  if(n.mapRenderId!==renderId||n.type!=="map")return;
  body.innerHTML=`<div class="map-error">${escapeHtml(err.message||"Could not render this map.")}</div>`;
 }
}
function setCardType(n,type,record=true){
 if(n.type===type)return;
 if(record)history();
 n.mapRenderId=(n.mapRenderId||0)+1;
 try{n.mapInstance?.destroy?.()}catch{}
 n.mapInstance=null;
 n.type=type;
 state.spaceFocusStep=0;
 n.el.classList.toggle("map-card",type==="map");
 if(type==="map"){
  n.mapColor=MAP_COLORS.includes(n.mapColor)?n.mapColor:"default";
  applyMapFont(n);
  const size=mapViewportSize();
  n.mapWidth=size.width;
  n.mapHeight=size.height;
  n.el.style.width=n.mapWidth+"px";
  n.el.style.height=n.mapHeight+"px";
  applyMapFont(n);
 }else{
  n.el.style.width=(n.width||n.el.offsetWidth)+"px";
  n.el.style.height="";
 }
 n.el.dataset.mapColor=n.mapColor||"default";
 updateCardHeading(n);
 updateViewButton(n.el,type);
 const body=n.el.querySelector(".cardbody");
 if(type==="map"){
  n.mapReady=renderMap(n);
 }else{
  body.innerHTML=renderCardMarkdown(n.md,n.highlights);
 }
 layoutCards();
 if(state.selected===n){
  requestAnimationFrame(async()=>{
   await focusSelected("readable");
   if(state.selected===n)state.spaceFocusStep=0;
  });
  save();
  return;
 }
 const scale=clampScale(Number.isFinite(state.targetScale)?state.targetScale:state.scale||1);
 const rect=n.el.getBoundingClientRect();
 const cx=(rect.left+rect.width/2-state.x)/state.scale;
 const cy=(rect.top+rect.height/2-state.y)/state.scale;
 moveTo(innerWidth/2-cx*scale,innerHeight/2-cy*scale,scale);
 save();
}
function apply(){
 if(state.pan){paintCanvasDrag();return}
 if(!Number.isFinite(state.x)||!Number.isFinite(state.y)||!Number.isFinite(state.scale)){
  state.x=innerWidth/2;state.y=innerHeight/2;state.scale=1;
  state.targetX=state.x;state.targetY=state.y;state.targetScale=state.scale;
 }
 world.style.transform=`translate(${state.x}px,${state.y}px) scale(${state.scale})`;
 const label=String(Math.round(state.scale*1000)/10);
 if(label!==lastZoomLabel){
  if(document.activeElement!==zoomLabel)zoomLabel.value=label;
  lastZoomLabel=label;
 }
}
function clampScale(scale){return Math.max(MIN_SCALE,Math.min(MAX_SCALE,scale))}
function worldPointAt(x,y,cameraX=state.x,cameraY=state.y,cameraScale=state.scale){
 return{x:(x-cameraX)/cameraScale,y:(y-cameraY)/cameraScale}
}
function worldPoint(x,y){return worldPointAt(x,y)}
function setCameraImmediate(x,y,s){
 state.x=x;state.y=y;state.scale=s;
 state.targetX=x;state.targetY=y;state.targetScale=s;
 apply();
}

function interruptCamera(){
 clearTimeout(wheelScrollTimer);wheelScrollTimer=0;
 clearTimeout(fallbackWheelTimer);fallbackWheelTimer=0;wheelZoomKind=null;
 if(wheelFrame){cancelAnimationFrame(wheelFrame);wheelFrame=0}
 panWheelX=panWheelY=0;
 if(cameraInputFrame){cancelAnimationFrame(cameraInputFrame);cameraInputFrame=0}
 if(state.raf){cancelAnimationFrame(state.raf);state.raf=0}
 sync();
}
function zoomPrecise(f,cx=innerWidth/2,cy=innerHeight/2){
 interruptCamera();
 if(!Number.isFinite(f)||!Number.isFinite(state.scale)||state.scale<=0){
  setCameraImmediate(innerWidth/2,innerHeight/2,1);
  return;
 }
 // Anchor to the transform actually rendered beneath the pointer. Using a
 // pending animation target here makes zoom drift away from pen/tablet input.
 const wx=(cx-state.x)/state.scale;
 const wy=(cy-state.y)/state.scale;
 const ns=clampScale(state.scale*f);
 state.targetX=cx-wx*ns;
 state.targetY=cy-wy*ns;
 state.targetScale=ns;
 state.x=state.targetX;
 state.y=state.targetY;
 state.scale=ns;
 markCameraMoving();
 apply();
}

function cardBounds(){
 if(!state.notes.length)return null;
 let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
 state.notes.forEach(n=>{
  const w=n.el.offsetWidth;
  const h=n.el.offsetHeight;
  left=Math.min(left,n.x);
  top=Math.min(top,n.y);
  right=Math.max(right,n.x+w);
  bottom=Math.max(bottom,n.y+h);
 });
 return {minX:left,minY:top,maxX:right,maxY:bottom};
}

function sync(){state.targetX=state.x;state.targetY=state.y;state.targetScale=state.scale}
let motionHintTimer=0;
// Keep overview bitmaps cached, including after navigation settles. Reading
// releases the cache so HTML/SVG text can rasterize at its final reading scale.
function beginCameraMotion(){
 const hint=state.overviewActive?'transform':state.pan?'translate':'transform';
 if(world.style.willChange!==hint)world.style.willChange=hint;
 if(!document.body.classList.contains("camera-moving")){
  document.body.classList.add("camera-moving");
  hideTextHighlighter();
 }
}
function markCameraMoving(){
 beginCameraMotion();
 clearTimeout(motionHintTimer);
 motionHintTimer=setTimeout(()=>{
  motionHintTimer=0;
  if(!state.raf&&!cameraInputFrame)finishCameraMotion();
 },120);
}
function finishCameraMotion(){
 if(state.pan||state.raf||cameraInputFrame||fallbackWheelTimer)return;
 clearTimeout(motionHintTimer);motionHintTimer=0;
 document.body.classList.remove("camera-moving");
 if(!state.overviewActive&&world.style.willChange)world.style.willChange="";
 save();
}
function animate(responseMs=32){
 beginCameraMotion();
 clearTimeout(motionHintTimer);motionHintTimer=0;
 if(state.raf)return;
 let lastFrame=0;
 const tick=()=>{
  const now=performance.now();
  const elapsed=lastFrame?Math.min(50,now-lastFrame):1000/60;
  lastFrame=now;
  const response=1-Math.exp(-elapsed/responseMs);
  state.x+=(state.targetX-state.x)*response;
  state.y+=(state.targetY-state.y)*response;
  state.scale+=(state.targetScale-state.scale)*response;
  apply();
  if(Math.abs(state.x-state.targetX)<.08&&Math.abs(state.y-state.targetY)<.08&&Math.abs(state.scale-state.targetScale)<.0005){
   state.x=state.targetX;state.y=state.targetY;state.scale=state.targetScale;state.raf=0;apply();finishCameraMotion();return;
  }
  state.raf=requestAnimationFrame(tick);
 };
 state.raf=requestAnimationFrame(tick);
}
function queueCamera(x,y,scale,smooth=false){
 state.targetX=x;state.targetY=y;state.targetScale=clampScale(scale);
 if(smooth){
  if(cameraInputFrame){cancelAnimationFrame(cameraInputFrame);cameraInputFrame=0}
  animate(typeof smooth==="number"?smooth:32);return
 }
 if(state.raf){cancelAnimationFrame(state.raf);state.raf=0}
 if(cameraInputFrame)return;
 cameraInputFrame=requestAnimationFrame(()=>{
  cameraInputFrame=0;
  state.x=state.targetX;state.y=state.targetY;state.scale=state.targetScale;
  markCameraMoving();apply();
 });
}
function queueWheelZoom(exponent,cx,cy,smooth){
 const s=state.targetScale,scale=clampScale(s*2**exponent);
 const wx=(cx-state.targetX)/s,wy=(cy-state.targetY)/s;
 queueCamera(cx-wx*scale,cy-wy*scale,scale,smooth);
}
function canvasWheelExponent(e){
 // Same logarithmic mapping as D3, with twice its default mouse gain.
 const unit=e.deltaMode===1?.05:e.deltaMode===2?1:.002;
 return Math.max(-2,Math.min(2,-e.deltaY*unit*2*(e.ctrlKey?navigation.pinch:navigation.wheel)));
}
function moveTo(x,y,s=state.targetScale){
 if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(s))return;
 interruptCamera();
 state.targetX=x;state.targetY=y;state.targetScale=clampScale(s);animate()
}
function zoom(f,cx=innerWidth/2,cy=innerHeight/2){
 zoomPrecise(f,cx,cy);
 clearTimeout(state.saveTimer);state.saveTimer=setTimeout(save,180);
}
function snapshot(){return JSON.stringify({x:state.x,y:state.y,scale:state.scale,nextId:state.nextId,layoutMode:state.layoutMode,overviewActive:state.overviewActive,readingCards:[...readingSession.cards.keys()],notes:state.notes.map(n=>({id:n.id,md:n.md,x:n.x,y:n.y,w:n.type==="map"?(n.mapWidth||n.width||n.el.offsetWidth):(n.width||n.el.offsetWidth),h:n.mapHeight,mapWidth:n.mapWidth,mapHeight:n.mapHeight,font:n.font||"mono",size:n.size||"80",type:n.type||"note",mapColor:n.mapColor||"default",highlights:n.highlights||[],mapFont:n.mapFont||"modern",sourceName:n.sourceName||undefined}))})}
function history(){
 if(state.historyLock)return;
 const s=snapshot();
 if(state.undo.at(-1)!==s){state.undo.push(s);if(state.undo.length>80)state.undo.shift();state.redo=[]}
}
function restore(s){
 const d=JSON.parse(s);state.historyLock=true;
 state.layoutMode=d.layoutMode==='reading'?'reading':'compact';state.overviewActive=d.overviewActive===true;
 state.notes.forEach(disposeCard);state.notes=[];state.selected=null;
 (d.notes||[]).forEach(n=>n.type==="map"
  ? makeMap(n.md,n.x,n.y,n.w,n.h,false,n.id,n.mapColor,n.mapFont,n.size,n.highlights,n.sourceName)
  : makeNote(n.md,n.x,n.y,n.w,false,n.id,n.font,n.size,n.mapColor,n.mapFont,n.mapWidth,n.mapHeight,n.highlights,n.sourceName));
 state.x=Number.isFinite(d.x)?d.x:innerWidth/2;
 state.y=Number.isFinite(d.y)?d.y:innerHeight/2;
 state.scale=clampScale(Number.isFinite(d.scale)?d.scale:1);
 restoreReadingSession(d.readingCards);
 state.nextId=d.nextId||state.nextId;sync();apply();world.style.willChange=state.overviewActive?'transform':'';
 state.historyLock=false;save();empty();
}
function undo(){if(!state.undo.length)return;state.redo.push(snapshot());restore(state.undo.pop())}
function redo(){if(!state.redo.length)return;state.undo.push(snapshot());restore(state.redo.pop())}
function save(){
 clearTimeout(state.saveTimer);
 state.saveTimer=setTimeout(()=>{
  try{localStorage.setItem("reflatex",snapshot())}catch{}
 },80);
}
function flushSave(){
 clearTimeout(state.saveTimer);
 try{localStorage.setItem("reflatex",snapshot())}catch{}
}
function empty(){$("#empty").style.display=state.notes.length?"none":"grid";scheduleCardIndex()}


function indexHeading(md,id,fallback=''){
 // Use the same Markdown parser as the cards, including Setext headings.
 // A template keeps images and other embedded content inert during indexing.
 if(window.marked){
  const content=document.createElement("template");
  content.innerHTML=safeMarkdown(String(md));
  for(const heading of content.content.querySelectorAll("h1,h2,h3,h4,h5,h6")){
   const label=heading.textContent.trim();
   if(label)return label;
  }
  return fallback||`Card ${id}`;
 }
 let fence=null;
 for(const line of String(md).split(/\r?\n/)){
  const delimiter=/^ {0,3}(`{3,}|~{3,})/.exec(line);
  if(delimiter){
   const run=delimiter[1];
   if(!fence)fence=run;
   else if(run[0]===fence[0]&&run.length>=fence.length)fence=null;
   continue;
  }
  if(fence)continue;
  const heading=/^ {0,3}#{1,6}\s+(.+?)(?:\s+#+)?\s*$/.exec(line);
  if(heading){
   const text=document.createElement("div");text.innerHTML=safeMarkdown(heading[1]);
   return text.textContent.trim()||`Card ${id}`;
  }
 }
 return fallback||`Card ${id}`;
}
function scheduleCardIndex(){
 if(indexFrame)return;
 indexFrame=requestAnimationFrame(()=>{indexFrame=0;renderCardIndex()});
}
function editIndexHeading(n){
 const row=[...$("#indexEntries").children].find(row=>row.querySelector("[data-card-id]")?.dataset.cardId===String(n.id));
 if(!row)return;
 const tokens=window.marked?.lexer(String(n.md))||[];
 let offset=0,range=null;
 for(const token of tokens){
  if(token.type==="heading"&&token.text.trim()){
   range={start:offset,end:offset+token.raw.length,depth:token.depth,ending:token.raw.match(/(?:\r?\n)+$/)?.[0]||""};break;
  }
  offset+=token.raw.length;
 }
 // Nested or HTML headings are best edited with their surrounding source.
 if(!range&&indexHeading(n.md,n.id)!==`Card ${n.id}`){editNote(n);return}
 const input=document.createElement("input");input.type="text";
 input.setAttribute("aria-label","Edit card heading");
 input.value=range?n.indexTitle:"";input.placeholder="Card heading";
 const form=document.createElement("form");form.className="index-edit";
 const saveButton=document.createElement("button");saveButton.type="submit";saveButton.textContent="Save";
 const cancel=document.createElement("button");cancel.type="button";cancel.textContent="Cancel";
 const finish=()=>{
  renderCardIndex();
  [...$("#indexEntries [data-card-id]")].find(button=>button.dataset.cardId===String(n.id))?.focus();
 };
 cancel.onclick=finish;
 form.onkeydown=e=>{e.stopPropagation();if(e.key==="Escape"){e.preventDefault();finish()}};
 form.onsubmit=e=>{
  e.preventDefault();const title=input.value.trim();
  if(!title){input.setCustomValidity("Enter a heading.");input.reportValidity();return}
  if(!range||title!==n.indexTitle){
   history();
   const heading=`${"#".repeat(range?.depth||1)} ${title}${range?range.ending:"\n"}`;
   n.md=range?n.md.slice(0,range.start)+heading+n.md.slice(range.end):heading+"\n"+n.md;
   if(n.type==="map")n.mapReady=renderMap(n);
   else n.el.querySelector(".cardbody").innerHTML=renderCardMarkdown(n.md,n.highlights);
   updateCardHeading(n);layoutCards();save();
  }
  if(indexFrame){cancelAnimationFrame(indexFrame);indexFrame=0}
  finish();
 };
 input.oninput=()=>input.setCustomValidity("");
 form.append(input,saveButton,cancel);row.replaceChildren(form);input.focus();input.select();
}
function indexSubtopics(n){
 if(n.type!=="map"){
  const headings=[...n.el.querySelectorAll(".cardbody h1,.cardbody h2,.cardbody h3,.cardbody h4,.cardbody h5,.cardbody h6")];
  const title=headings.find(el=>el.textContent.trim());
  return headings.filter(el=>el!==title&&el.textContent.trim()).map(el=>({label:el.textContent.trim(),depth:Number(el.tagName.slice(1))-1,el}));
 }
 if(!n.mapInstance||!n.mapIndexRoot)return [];
 const topics=[];
 const visit=(node,ancestors)=>{
  const text=document.createElement("div");text.innerHTML=node.content||"";
  if(ancestors.length&&text.textContent.trim())topics.push({label:text.textContent.trim(),depth:ancestors.length-1,node,ancestors});
  for(const child of node.children||[])visit(child,[...ancestors,node]);
 };
 visit(n.mapIndexRoot,[]);return topics;
}
async function focusIndexSubtopic(n,topic){
 select(n);
 if(n.type==="map"){
  const map=n.mapInstance;
  if(!map)return;
  for(const ancestor of topic.ancestors)if(ancestor.payload)ancestor.payload.fold=0;
  await map.setData();
  if(state.selected!==n||n.mapInstance!==map)return;
  const svg=n.el.querySelector(".map-pane svg");
  const target=[...svg.querySelectorAll(".markmap-node")].find(el=>el.__data__===topic.node||(topic.node.state?.id!==undefined&&el.__data__?.state?.id===topic.node.state.id));
  if(!target)return;
  const r=target.getBoundingClientRect(),pane=svg.getBoundingClientRect();
  const transform=d3.zoomTransform(svg);
  const center=transform.invert([(r.left+r.width/2-pane.left)/state.scale,(r.top+r.height/2-pane.top)/state.scale]);
  const width=r.width/(state.scale*transform.k),height=r.height/(state.scale*transform.k);
  await focusSelected("readable");
  if(state.selected!==n||n.mapInstance!==map)return;
  // Compensate for the board's final zoom so branch text remains readable.
  // Fit the chosen label, rather than retaining the whole-map overview scale.
  const paneWidth=svg.clientWidth,paneHeight=svg.clientHeight;
  const zoomScale=Math.min(1.5/state.targetScale,paneWidth*.85/Math.max(1,width),paneHeight*.75/Math.max(1,height));
  const focused=d3.zoomIdentity.translate(paneWidth/2,paneHeight/2).scale(zoomScale).translate(-center[0],-center[1]);
  d3.select(svg).call(map.zoom.transform,focused);
  return;
 }
 const el=topic.el;if(!el?.isConnected)return;
 const rect=el.getBoundingClientRect();
 const point=worldPoint(rect.left,rect.top);
 const viewportWidth=innerWidth-($("#cardIndex").hidden?0:$("#cardIndex").offsetWidth+28);
 const scale=clampScale(Math.max(.5,Math.min(1.5,(viewportWidth-80)/n.el.offsetWidth)));
 moveTo(innerWidth-viewportWidth/2-(n.x+n.el.offsetWidth/2)*scale,110-point.y*scale,scale);
 el.classList.remove("index-target");void el.offsetWidth;el.classList.add("index-target");
 setTimeout(()=>el.classList.remove("index-target"),1800);
}
function renderIndexTopics(n,topics,container){
 const roots=[],stack=[];
 for(const [i,topic] of topics.entries()){
  const item={topic,key:String(topic.node?.state?.path||i),children:[]};
  while(stack.length&&stack.at(-1).topic.depth>=topic.depth)stack.pop();
  (stack.length?stack.at(-1).children:roots).push(item);stack.push(item);
 }
 n.indexTopicExpanded??=new Set();
 let count=0;
 const append=(items,parent)=>{
  for(const item of items){
   const {topic,key}=item;
   const group=document.createElement("div"),row=document.createElement("div");row.className="index-topic-row";
   const link=document.createElement("button");link.type="button";link.className="index-subtopic";link.textContent=topic.label;link.title=topic.label;
   link.onclick=()=>{if(innerWidth<700)setIndexOpen(false);focusIndexSubtopic(n,topic)};
   row.append(link);group.append(row);parent.append(group);
   if(item.children.length){
    const toggle=document.createElement("button");toggle.type="button";toggle.className="index-topic-expand";toggle.innerHTML=ICONS.chevron;
    toggle.setAttribute("aria-label",`Subtopics: ${topic.label}`);
    const children=document.createElement("div");children.className="index-topic-children";children.id=`index-topic-${n.id}-${count++}`;children.hidden=!n.indexTopicExpanded.has(key);
    toggle.setAttribute("aria-controls",children.id);toggle.setAttribute("aria-expanded",String(!children.hidden));
    toggle.onclick=()=>{children.hidden=!children.hidden;if(children.hidden)n.indexTopicExpanded.delete(key);else n.indexTopicExpanded.add(key);toggle.setAttribute("aria-expanded",String(!children.hidden))};
    row.prepend(toggle);group.append(children);append(item.children,children);
   }else row.classList.add("index-topic-leaf");
  }
 };
 append(roots,container);
}
function reorderIndexCard(id,targetId,after=false){
 const source=state.notes.find(n=>String(n.id)===String(id)),target=state.notes.find(n=>String(n.id)===String(targetId));
 if(!source||!target||source===target)return;
 const notes=state.notes.filter(n=>n!==source),position=notes.indexOf(target)+(after?1:0);
 notes.splice(position,0,source);
 if(notes.every((n,i)=>n===state.notes[i]))return;
 history();state.notes=notes;layoutCards();save();
 if(indexFrame){cancelAnimationFrame(indexFrame);indexFrame=0}
 renderCardIndex();
}
function renderCardIndex(){
 hidePaletteTitle();
 const list=$("#indexEntries"),fragment=document.createDocumentFragment();
 for(const [i,n] of state.notes.entries()){
  if(n.indexSource!==n.md){n.indexSource=n.md;n.indexTitle=indexHeading(n.md,n.id,sourceTitle(n))}
  const button=document.createElement("button");button.type="button";button.dataset.cardId=n.id;
  button.dataset.indexNumber=String(i+1);
  const label=document.createElement("span");label.textContent=n.indexTitle;button.title=n.indexTitle;
  button.dataset.cardTitle=n.indexTitle;button.setAttribute("aria-label",`${i+1}: ${n.indexTitle}`);
  if($("#cardIndex").dataset.view==="palette")button.removeAttribute("title");
  button.append(label);button.setAttribute("aria-current",String(state.selected===n));
  const row=document.createElement("div");row.className="index-row";row.draggable=true;
  const edit=document.createElement("button");edit.type="button";edit.className="index-rename";
  edit.innerHTML=ICONS.edit;edit.title="Edit heading";edit.setAttribute("aria-label",`Edit heading: ${n.indexTitle}`);
  edit.onclick=()=>editIndexHeading(n);
  row.append(button,edit);
  const entry=document.createElement("div");entry.className="index-entry";entry.dataset.indexCardId=n.id;entry.append(row);
  entry.dataset.mapColor=n.mapColor||"default";
  const grip=document.createElement("button");grip.type="button";grip.className="index-reorder";grip.draggable=true;grip.innerHTML=ICONS.grip;
  grip.setAttribute("aria-label",`Reorder: ${n.indexTitle}`);grip.title="Drag to reorder · Alt + ↑ / ↓";
  row.append(grip);
  const topics=indexSubtopics(n);
  if(topics.length){
   const toggle=document.createElement("button");toggle.type="button";toggle.className="index-expand";
   toggle.innerHTML=ICONS.chevron;toggle.setAttribute("aria-label",`Subtopics: ${n.indexTitle}`);
   const children=document.createElement("div");children.className="index-subtopics";children.id=`index-topics-${n.id}`;children.hidden=!n.indexExpanded;
   toggle.setAttribute("aria-controls",children.id);toggle.setAttribute("aria-expanded",String(Boolean(n.indexExpanded)));
   toggle.onclick=()=>{n.indexExpanded=!n.indexExpanded;children.hidden=!n.indexExpanded;toggle.setAttribute("aria-expanded",String(n.indexExpanded))};
   renderIndexTopics(n,topics,children);
   row.prepend(toggle);entry.append(children);
  }
  fragment.appendChild(entry);
 }
 list.replaceChildren(fragment);$("#indexCount").textContent=state.notes.length;
 $("#indexEmpty").hidden=state.notes.length>0;
 applyCanvasSearch();
 revealIndexSelection();
}

function highlightCanvasSearch(reveal=false){
 const previous=highlightCanvasSearch.card;
 if(previous){
  let restoreHighlights=false;
  for(const mark of previous.querySelectorAll('mark.canvas-search-match')){
   if(mark.querySelector('[data-highlight-id]'))restoreHighlights=true;
   const parent=mark.parentNode;mark.replaceWith(document.createTextNode(mark.textContent));parent.normalize();
  }
  for(const text of previous.querySelectorAll('.canvas-search-map-match'))text.classList.remove('canvas-search-map-match');
  const note=restoreHighlights&&state.notes.find(note=>note.el===previous);if(note?.highlights?.length)ConceptTextHighlights.paint(previous.querySelector('.cardbody'),note.highlights);
 }
 const n=state.selected,query=$("#canvasSearch").value.trim();
 highlightCanvasSearch.card=n?.el||null;
 if(!n||!query)return;
 const terms=[...new Set(query.split(/\s+/).filter(Boolean))].sort((a,b)=>b.length-a.length);
 const pattern=terms.map(term=>term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
 const expression=new RegExp(pattern,'gi');
 const root=n.el.querySelector('.cardbody');if(!root)return;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){
  return node.parentElement.closest('script,style,svg,.katex,.canvas-search-match')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT;
 }});
 const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
 for(const node of nodes){
  const source=node.nodeValue;expression.lastIndex=0;
  const matches=[...source.matchAll(expression)];if(!matches.length)continue;
  const fragment=document.createDocumentFragment();let offset=0;
  for(const match of matches){
   fragment.append(document.createTextNode(source.slice(offset,match.index)));
   const mark=document.createElement('mark');mark.className='canvas-search-match';mark.textContent=match[0];fragment.append(mark);offset=match.index+match[0].length;
  }
  fragment.append(document.createTextNode(source.slice(offset)));node.replaceWith(fragment);
 }
 for(const text of root.querySelectorAll('svg text')){expression.lastIndex=0;if(expression.test(text.textContent))text.classList.add('canvas-search-map-match')}
 if(reveal&&n.type!=='map'){
  const first=root.querySelector('mark.canvas-search-match');
  if(first){const box=root.getBoundingClientRect(),hit=first.getBoundingClientRect();root.scrollTop+=(hit.top-box.top)/state.scale-root.clientHeight/3}
 }
}

function applyCanvasSearch(){
 const query=$("#canvasSearch").value.trim().toLocaleLowerCase();
 const terms=query.split(/\s+/).filter(Boolean);
 highlightCanvasSearch();
 const entries=$("#indexEntries").children;
 let matches=0;
 if(!terms.length){
  for(const entry of entries)if(entry.hidden)entry.hidden=false;
  $("#searchStatus").hidden=true;return;
 }
 const notes=new Map(state.notes.map(n=>[String(n.id),n]));
 for(const entry of entries){
  const n=notes.get(entry.dataset.indexCardId);if(!n)continue;
  if(n.searchSource!==n.md){n.searchSource=n.md;n.searchText=String(n.md).toLocaleLowerCase()}
  const match=terms.every(term=>n.searchText.includes(term));
  if(entry.hidden===match)entry.hidden=!match;
  if(match)matches++;
 }
 const status=$("#searchStatus");status.hidden=false;
 status.textContent=matches?matches+' of '+state.notes.length+' cards':'No matching cards';
 hidePaletteTitle();
}
$("#canvasSearch").addEventListener('input',applyCanvasSearch);
$("#canvasSearch").addEventListener('keydown',e=>{
 e.stopPropagation();
 if(e.key==='Escape'){e.preventDefault();e.target.value='';applyCanvasSearch();e.target.blur()}
 if(e.key==='Enter'){
  e.preventDefault();
  const button=$("#indexEntries .index-entry:not([hidden]) button[data-card-id]");
  if(button)button.click();
 }
});

let indexDragId=null,indexDropTarget=null,indexDropAfter=false;
let indexRevealFrame=0;
const paletteTitleTooltip=document.createElement("div");
paletteTitleTooltip.id="paletteTitleTooltip";paletteTitleTooltip.className="palette-title-tooltip";paletteTitleTooltip.role="tooltip";paletteTitleTooltip.hidden=true;document.body.append(paletteTitleTooltip);
let paletteTooltipButton=null;
function hidePaletteTitle(){
 paletteTitleTooltip.hidden=true;paletteTooltipButton?.removeAttribute("aria-describedby");paletteTooltipButton=null;
}
function showPaletteTitle(button){
 if($("#cardIndex").dataset.view!=="palette"||!button)return;
 hidePaletteTitle();paletteTooltipButton=button;
 paletteTitleTooltip.textContent=button.dataset.cardTitle;paletteTitleTooltip.hidden=false;
 button.setAttribute("aria-describedby",paletteTitleTooltip.id);
 const rect=button.getBoundingClientRect(),width=paletteTitleTooltip.offsetWidth,height=paletteTitleTooltip.offsetHeight;
 paletteTitleTooltip.style.left=Math.max(8,Math.min(innerWidth-width-8,rect.left+(rect.width-width)/2))+"px";
 paletteTitleTooltip.style.top=(rect.bottom+height+15<=innerHeight?rect.bottom+7:Math.max(8,rect.top-height-7))+"px";
}
$("#indexEntries").addEventListener("pointerover",e=>showPaletteTitle(e.target.closest("[data-card-id]")));
$("#indexEntries").addEventListener("pointerout",e=>{if(paletteTooltipButton&&!paletteTooltipButton.contains(e.relatedTarget))hidePaletteTitle()});
$("#indexEntries").addEventListener("focusin",e=>showPaletteTitle(e.target.closest("[data-card-id]")));
$("#indexEntries").addEventListener("focusout",hidePaletteTitle);
$("#indexEntries").addEventListener("scroll",hidePaletteTitle);
window.addEventListener("resize",hidePaletteTitle);
function setIndexView(view){
 hidePaletteTitle();
 const mode=view==="palette"?"palette":"list";
 $("#cardIndex").dataset.view=mode;
 document.querySelectorAll("[data-index-view]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.indexView===mode)));
 $("#indexEntries").querySelectorAll("[data-card-id]").forEach(button=>{if(mode==="palette")button.removeAttribute("title");else button.title=button.dataset.cardTitle});
 try{localStorage.setItem("reflatex-index-view",mode)}catch{}
 revealIndexSelection();
}
document.querySelectorAll("[data-index-view]").forEach(button=>button.onclick=()=>setIndexView(button.dataset.indexView));
try{setIndexView(localStorage.getItem("reflatex-index-view"))}catch{setIndexView("list")}
function clearIndexDrop(){
 indexDropTarget?.classList.remove("index-drop-before","index-drop-after");indexDropTarget=null;
}
$("#indexEntries").addEventListener("dragstart",e=>{
 const entry=e.target.closest(".index-entry");
 if(!entry||e.target.closest(".index-edit,.index-subtopics")){e.preventDefault();return}
 indexDragId=entry.dataset.indexCardId;e.dataTransfer.effectAllowed="move";
 e.dataTransfer.setData("text/plain",indexDragId);entry.classList.add("index-dragging");
});
$("#indexEntries").addEventListener("dragover",e=>{
 if(indexDragId===null)return;
 const entry=e.target.closest(".index-entry");
 if(!entry||entry.dataset.indexCardId===indexDragId){clearIndexDrop();return}
 e.preventDefault();e.dataTransfer.dropEffect="move";clearIndexDrop();
 const rect=entry.querySelector(".index-row").getBoundingClientRect();
 indexDropAfter=$("#cardIndex").dataset.view==="palette"?e.clientX>rect.left+rect.width/2:e.clientY>rect.top+rect.height/2;indexDropTarget=entry;
 entry.classList.add(indexDropAfter?"index-drop-after":"index-drop-before");
});
$("#indexEntries").addEventListener("drop",e=>{
 if(indexDragId===null||!indexDropTarget)return;
 e.preventDefault();const target=indexDropTarget.dataset.indexCardId,after=indexDropAfter,id=indexDragId;
 clearIndexDrop();indexDragId=null;reorderIndexCard(id,target,after);
});
$("#indexEntries").addEventListener("dragend",()=>{
 indexDragId=null;clearIndexDrop();$("#indexEntries .index-dragging")?.classList.remove("index-dragging");
});
$("#indexEntries").addEventListener("dragleave",e=>{
 if(!e.currentTarget.contains(e.relatedTarget))clearIndexDrop();
});
function revealIndexSelection(){
 if(indexRevealFrame)cancelAnimationFrame(indexRevealFrame);
 if($("#cardIndex").hidden)return;
 indexRevealFrame=requestAnimationFrame(()=>{
  indexRevealFrame=0;
  const list=$("#indexEntries"),entry=list.querySelector("[aria-current='true']")?.closest(".index-entry");
  if(!entry||$("#cardIndex").hidden)return;
  const bounds=list.getBoundingClientRect(),tile=($("#cardIndex").dataset.view==="palette"?entry.querySelector("[aria-current='true']"):entry).getBoundingClientRect(),margin=8;
  // Scroll just the index, after its grid and selected-title area have settled.
  if(tile.top<bounds.top+margin)list.scrollTop+=tile.top-bounds.top-margin;
  else if(tile.bottom>bounds.bottom-margin)list.scrollTop+=tile.bottom-bounds.bottom+margin;
 });
}
function setIndexOpen(open){
 if(!open)hidePaletteTitle();
 $("#cardIndex").hidden=!open;$("#toggleIndex").setAttribute("aria-expanded",String(open));
 if(open)revealIndexSelection();
 try{localStorage.setItem("reflatex-index-open",String(open))}catch{}
}
const indexResize=$('#indexResize');
let indexResizeDrag=null,indexResizeFrame=0,indexWidth=260;
function indexWidthLimits(){const max=Math.max(120,Math.min(520,innerWidth-90));return {min:Math.min(200,max),max}}
function setIndexWidth(width,persist=false){
 const {min,max}=indexWidthLimits();indexWidth=Math.round(Math.max(min,Math.min(max,width)));
 $('#cardIndex').style.setProperty('--index-width',indexWidth+'px');
 indexResize.setAttribute('aria-valuemin',min);indexResize.setAttribute('aria-valuemax',max);indexResize.setAttribute('aria-valuenow',indexWidth);
 if(persist)try{localStorage.setItem('reflatex-index-width',String(indexWidth))}catch{}
}
try{const saved=Number(localStorage.getItem('reflatex-index-width')||260);setIndexWidth(Number.isFinite(saved)?saved:260)}catch{setIndexWidth(260)}
indexResize.addEventListener('pointerdown',e=>{
 if(e.button!==0)return;
 e.preventDefault();e.stopPropagation();hidePaletteTitle();
 indexResizeDrag={id:e.pointerId,start:e.clientX,width:indexWidth,next:indexWidth};
 indexResize.setPointerCapture(e.pointerId);document.body.classList.add('index-resizing');
});
indexResize.addEventListener('pointermove',e=>{
 if(indexResizeDrag?.id!==e.pointerId)return;
 indexResizeDrag.next=indexResizeDrag.width+e.clientX-indexResizeDrag.start;
 if(!indexResizeFrame)indexResizeFrame=requestAnimationFrame(()=>{indexResizeFrame=0;if(indexResizeDrag)setIndexWidth(indexResizeDrag.next)});
});
function finishIndexResize(){
 if(!indexResizeDrag)return;
 if(indexResizeFrame){cancelAnimationFrame(indexResizeFrame);indexResizeFrame=0}
 const drag=indexResizeDrag;indexResizeDrag=null;setIndexWidth(drag.next,true);
 document.body.classList.remove('index-resizing');
 if(indexResize.hasPointerCapture(drag.id))indexResize.releasePointerCapture(drag.id);
}
indexResize.addEventListener('pointerup',finishIndexResize);
indexResize.addEventListener('pointercancel',finishIndexResize);
indexResize.addEventListener('lostpointercapture',finishIndexResize);
window.addEventListener('blur',finishIndexResize);
indexResize.addEventListener('keydown',e=>{
 const {min,max}=indexWidthLimits(),step=e.shiftKey?40:20;
 const width=e.key==='ArrowLeft'?indexWidth-step:e.key==='ArrowRight'?indexWidth+step:e.key==='Home'?min:e.key==='End'?max:null;
 if(width===null)return;
 e.preventDefault();e.stopPropagation();setIndexWidth(width,true);
});
window.addEventListener('resize',()=>setIndexWidth(indexWidth));
$("#toggleIndex").onclick=()=>setIndexOpen($("#cardIndex").hidden);
$("#closeIndex").onclick=()=>{setIndexOpen(false);$("#toggleIndex").focus()};
$("#cardIndex").addEventListener("keydown",e=>{
 e.stopPropagation();
 if($("#cardIndex").dataset.view==="palette"&&!e.altKey&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)){
  const buttons=[...$("#indexEntries").querySelectorAll("button[data-card-id]")];
  const index=buttons.indexOf(document.activeElement);
  if(index>=0){
   e.preventDefault();const columns=getComputedStyle($("#indexEntries")).gridTemplateColumns.split(" ").length;
   const offset=e.key==="ArrowLeft"?-1:e.key==="ArrowRight"?1:e.key==="ArrowUp"?-columns:columns;
   buttons[Math.max(0,Math.min(buttons.length-1,index+offset))]?.focus();return;
  }
 }
 const grip=e.target.closest(".index-reorder");
 if(grip&&e.altKey&&(e.key==="ArrowUp"||e.key==="ArrowDown")){
  e.preventDefault();const id=grip.closest(".index-entry").dataset.indexCardId;
  const i=state.notes.findIndex(n=>String(n.id)===id),direction=e.key==="ArrowUp"?-1:1;
  const target=state.notes[i+direction];if(target){reorderIndexCard(id,target.id,direction>0);$("#indexEntries").querySelector(`[data-index-card-id="${id}"] .index-reorder`)?.focus()}
  return;
 }
 if(!e.altKey&&(e.key==="ArrowRight"||e.key==="ArrowLeft")&&e.target.matches("[data-card-id],.index-subtopic")){
  e.preventDefault();
  const row=e.target.closest(".index-row,.index-topic-row"),toggle=row.querySelector(".index-expand,.index-topic-expand");
  if(toggle&&toggle.getAttribute("aria-expanded")!==(e.key==="ArrowRight"?"true":"false"))toggle.click();
  else if(e.key==="ArrowRight")row.parentElement.querySelector(".index-subtopics .index-subtopic,.index-topic-children .index-subtopic")?.focus();
  else{
   const parent=e.target.closest(".index-topic-children,.index-subtopics");
   parent?.parentElement.querySelector(":scope > .index-topic-row > .index-subtopic,:scope > .index-row > [data-card-id]")?.focus();
  }
  return;
 }
 if(e.key.toLowerCase()==="b"&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
  e.preventDefault();if(!e.repeat)toggleToolbar();return;
 }
 if(e.key==="Escape"||(!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&e.key==="Tab")){
  e.preventDefault();if(!e.repeat)$("#closeIndex").click();return;
 }
 const entries=[...$("#indexEntries").querySelectorAll("button[data-card-id],.index-subtopic")].filter(button=>!button.closest("[hidden]")&&button.getClientRects().length);
 const current=entries.indexOf(document.activeElement);
 const next=e.key==="ArrowDown"?Math.min(entries.length-1,current+1):
  e.key==="ArrowUp"?Math.max(0,current-1):e.key==="Home"?0:e.key==="End"?entries.length-1:null;
 if(next!==null){e.preventDefault();entries[next]?.focus()}
});
$("#indexEntries").addEventListener("click",e=>{
 const button=e.target.closest("button[data-card-id]");if(!button)return;
 const n=state.notes.find(note=>String(note.id)===button.dataset.cardId);if(!n)return;
 if(innerWidth<700)setIndexOpen(false);
 select(n);focusSelected("readable").then(()=>{if(state.selected===n)highlightCanvasSearch(true)});
});
try{$("#cardIndex").hidden=localStorage.getItem("reflatex-index-open")==="false"}catch{}
$("#toggleIndex").setAttribute("aria-expanded",String(!$("#cardIndex").hidden));

function rememberCardView(n){
 if(!n||state.overviewActive)return;
 const view=focusViewport(),moving=Boolean(state.raf||cameraInputFrame);
 const scale=moving?state.targetScale:state.scale;
 const x=moving?state.targetX:state.x,y=moving?state.targetY:state.y;
 if(!Number.isFinite(scale)||scale<=0)return;
 const body=n.el.querySelector('.cardbody');
 n.navigationView={scale,localX:(view.left+view.width/2-x)/scale-n.x,localY:(view.top+view.height/2-y)/scale-n.y,scrollTop:body?.scrollTop||0,scrollLeft:body?.scrollLeft||0,focusStep:state.spaceFocusStep,layoutMode:state.layoutMode};
}
function select(n){
 if(state.selected===n&&(!n||n.el.classList.contains("selected")))return;
 if(state.selected!==n)rememberCardView(state.selected);
 if(state.selected!==n)state.spaceFocusStep=0;
 state.selected?.el.classList.remove("selected");
 state.selected=n;if(n){
  cardVisits.delete(n);cardVisits.add(n);
  n.el.classList.add("selected");
  n.el.querySelectorAll('img').forEach(image=>{if(image.loading==='lazy')image.loading='eager'});
 }
 highlightCanvasSearch();
 const current=$("#indexEntries [aria-current='true']");current?.setAttribute("aria-current","false");
 if(n)for(const button of $("#indexEntries").querySelectorAll("[data-card-id]")){if(button.dataset.cardId===String(n.id)){button.setAttribute("aria-current","true");break}}
 revealIndexSelection();
 context.classList.remove("open");
}

function canvasPayload(){
 return {
  format:"RefLatex Canvas",
  version:1,
  createdWith:"refLatex PureRef-style canvas",
  savedAt:new Date().toISOString(),
  camera:{
   x:state.x,y:state.y,scale:state.scale
  },
  nextId:state.nextId,
  layoutMode:state.layoutMode,
  overviewActive:state.overviewActive,
  readingCards:[...readingSession.cards.keys()],
  notes:state.notes.map(n=>({
   id:n.id,
   markdown:n.md,
   type:n.type||"note",
   x:n.x,
   y:n.y,
   width:n.type==="map"?(n.mapWidth||n.width||n.el.offsetWidth):(n.width||n.el.offsetWidth),
   height:n.type==="map"?(n.mapHeight||n.el.offsetHeight):undefined,
   mapWidth:n.mapWidth,
   mapHeight:n.mapHeight,
   font:n.font||"mono",
   size:n.size||"80",
   mapColor:n.mapColor||"default",
   highlights:n.highlights||[],mapFont:n.mapFont||"modern",sourceName:n.sourceName||undefined
  }))
 };
}
function canvasContentSignature(data=canvasPayload()){
 // Navigation alone does not make a saved canvas dirty.
 const content=JSON.stringify({notes:data.notes,readingCards:data.readingCards});
 // Store a compact fingerprint instead of duplicating large canvases in
 // localStorage. This runs only when saving, opening or leaving the page.
 let a=2166136261,b=2654435761;
 for(let i=0;i<content.length;i++){const code=content.charCodeAt(i);a=Math.imul(a^code,16777619);b=Math.imul(b^code,2246822519)}
 return content.length+':'+(a>>>0).toString(16)+':'+(b>>>0).toString(16);
}
function markCanvasSaved(data=canvasPayload()){
 savedCanvasContent=canvasContentSignature(data);
 try{localStorage.setItem('reflatex-saved-content',savedCanvasContent)}catch{}
}
function hasUnsavedCanvasWork(){
 if(editor.classList.contains('open')){
  const original=state.editId===null?'':state.notes.find(n=>n.id===state.editId)?.md||'';
  if(source.value!==original)return true;
 }
 return canvasContentSignature()!==savedCanvasContent;
}

function downloadCanvas(){
 const data=canvasPayload();
 const blob=new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
 const url=URL.createObjectURL(blob);
 const a=document.createElement("a");
 const stamp=new Date().toISOString().slice(0,10);
 a.href=url;
 a.download=`reflatex-canvas-${stamp}.json`;
 document.body.appendChild(a);
 a.click();
 a.remove();
 markCanvasSaved(data);flushSave();
 setTimeout(()=>URL.revokeObjectURL(url),1000);

 $("#hint").textContent="Canvas saved";
 setTimeout(()=>$("#hint").textContent="",1800);
}

function openCanvasFile(file){
 if(!file)return;
 return new Promise(resolve=>{

 const reader=new FileReader();

 reader.onload=()=>{
  try{
   const data=JSON.parse(reader.result);

   if(!data || !Array.isArray(data.notes)){
    throw new Error("Invalid ConceptCards canvas file");
   }
   state.layoutMode=data.layoutMode==='reading'?'reading':'compact';state.overviewActive=data.overviewActive===true;

   state.historyLock=true;
   state.notes.forEach(disposeCard);
   state.notes=[];
   state.selected=null;

   data.notes.forEach(n=>{
    if(typeof n.markdown!=="string")return;
    const x=Number.isFinite(n.x)?n.x:0,y=Number.isFinite(n.y)?n.y:0;
    const width=Number.isFinite(n.width)?n.width:600,id=Number.isFinite(n.id)?n.id:null;
    n.type==="map"
      ? makeMap(n.markdown,x,y,width,Number.isFinite(n.height)?n.height:640,false,id,n.mapColor,n.mapFont,n.size,n.highlights,n.sourceName)
      : makeNote(n.markdown,x,y,width,false,id,typeof n.font==="string"?n.font:"mono",n.size,n.mapColor,n.mapFont,n.mapWidth,n.mapHeight,n.highlights,n.sourceName);
   });

   state.nextId=Number.isFinite(data.nextId)
    ? data.nextId
    : Math.max(0,...state.notes.map(n=>n.id||0))+1;
   restoreReadingSession(data.readingCards);

   if(data.camera){
    state.x=Number.isFinite(data.camera.x)?data.camera.x:innerWidth/2;
    state.y=Number.isFinite(data.camera.y)?data.camera.y:innerHeight/2;
    state.scale=Number.isFinite(data.camera.scale)?data.camera.scale:1;
   }else{
    state.x=innerWidth/2;
    state.y=innerHeight/2;
    state.scale=1;
   }

   state.undo=[];
   state.redo=[];
   state.historyLock=false;

   sync();
   apply();
   world.style.willChange=state.overviewActive?'transform':'';
   empty();
   markCanvasSaved();
   save();

   $("#hint").textContent=`Opened ${file.name}`;
   setTimeout(()=>$("#hint").textContent="",2200);
   resolve(true);

  }catch(err){
   state.historyLock=false;
   alert("Could not open this canvas file.\\n\\n"+err.message);
   resolve(false);
  }
 };

 reader.onerror=()=>{alert("Could not read the selected canvas file.");resolve(false)};
 reader.readAsText(file);
 });
}
function newBlankCanvas(){
 interruptCamera();clearTimeout(state.saveTimer);closeEditor();
 state.notes.forEach(disposeCard);state.notes=[];state.selected=null;
 state.nextId=1;state.undo=[];state.redo=[];state.historyLock=false;state.spaceFocusStep=0;
 state.layoutMode='compact';state.overviewActive=false;
 resetReadingSession();
 state.x=innerWidth/2;state.y=innerHeight/2;state.scale=1;
 sync();apply();empty();markCanvasSaved();finishCameraMotion();flushSave();
}

let importingMarkdown=false;
async function readMarkdownFile(file){
 const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer);
 const encoding=bytes[0]===0xff&&bytes[1]===0xfe?'utf-16le':bytes[0]===0xfe&&bytes[1]===0xff?'utf-16be':'utf-8';
 return new TextDecoder(encoding,{ignoreBOM:true}).decode(buffer);
}
async function importMarkdownFiles(fileList){
 if(importingMarkdown)return;
 const files=Array.from(fileList||[]).filter(file=>/\.(md|markdown)$/i.test(file.name));
 if(!files.length)return;
 const button=$("#importMarkdownFiles");
 importingMarkdown=true;button.disabled=true;button.setAttribute('aria-busy','true');
 $("#hint").textContent=`Reading ${files.length} Markdown file${files.length===1?'':'s'}…`;
 try{
  const contents=[];
  // Keep disk reads bounded and arrange the completed batch only once.
  for(let i=0;i<files.length;i+=8)contents.push(...await Promise.allSettled(files.slice(i,i+8).map(readMarkdownFile)));
  const readable=contents.some(result=>result.status==='fulfilled');
  if(readable){
   history();
   const font=newCardFont();
   for(const [i,result] of contents.entries())if(result.status==='fulfilled'){
    makeNote(result.value,0,0,600,false,null,font,'80',randomCardTheme(),'modern',null,null,[],files[i].name);
   }
   select(state.notes.at(-1));arrange(false,false);
  }
  const failures=contents.flatMap((result,i)=>result.status==='rejected'?[files[i].name]:[]);
  const count=files.length-failures.length;
  $("#hint").textContent=`Imported ${count} Markdown file${count===1?'':'s'}`;
  setTimeout(()=>$("#hint").textContent='',2600);
  if(failures.length)alert(`Could not read: ${failures.join(', ')}`);
 }catch(error){alert(`Could not import Markdown files: ${error.message}`)}
 finally{importingMarkdown=false;button.disabled=false;button.removeAttribute('aria-busy')}
}

function normalizeCardSize(size){
 const value=String(size??'80');
 if(value==='180')return '160';
 return ['50','60','70','80','90','100','110','125','140','160'].includes(value)?value:'80';
}
function makeNote(md,x,y,w=600,record=true,id=null,font=newCardFont(),size="80",mapColor=randomCardTheme(),mapFont="modern",mapWidth=null,mapHeight=null,highlights=[],sourceName=''){
 if(record)history();
 const minWidth=Math.min(300,Math.max(200,innerWidth-24));
 const width=Math.max(minWidth,Math.min(1200,w||600));
const n={id:id??state.nextId++,md,x,y,font:normalizeCardFont(font),size:normalizeCardSize(size),width,type:"note",mapColor:MAP_COLORS.includes(mapColor)?mapColor:"default",mapFont:normalizeCardFont(font),mapWidth:Number.isFinite(mapWidth)?Math.max(minWidth,Math.min(1600,mapWidth)):null,mapHeight:Number.isFinite(mapHeight)?Math.max(320,Math.min(1200,mapHeight)):null,highlights,sourceName:typeof sourceName==='string'?sourceName:'',el:null};
 migrateCardHighlights(n);
 state.nextId=Math.max(state.nextId,n.id+1);
 const el=document.createElement("article");
 el.className="card";el.style.left=x+"px";el.style.top=y+"px";el.style.width=width+"px";
 el.innerHTML=`<div class="cardbar"><div class="map-title"></div></div><div class="cardactions"><button type="button" data-view></button><select data-map-color aria-label="Card color theme" title="Card color theme"><option value="default">Midnight</option><option value="purple">Amethyst</option><option value="warm">Terracotta</option><option value="ocean">Ocean</option><option value="forest">Forest</option><option value="sunset">Sunset</option><option value="slate">Slate</option></select><select data-font aria-label="Font" title="Font (V)"><option value="serif">Serif</option><option value="sans">Sans</option><option value="mono">Mono</option><option value="slab">Slab</option><option value="humanist">Humanist</option><option value="rounded">Rounded</option><option value="editorial">Editorial</option><option value="hand">Handwritten</option><option value="hand-soft">Hand Soft</option><option value="hand-bold">Hand Bold</option><option value="hand-marker">Hand Marker</option><option value="hand-script">Hand Script</option></select><select data-size aria-label="Card font size" title="Card font size"><option value="50">50%</option><option value="60">60%</option><option value="70">70%</option><option value="80">80%</option><option value="90">90%</option><option value="100">100%</option><option value="110">110%</option><option value="125">125%</option><option value="140">140%</option><option value="160">160%</option></select><button data-map-open class="map-only"></button><button data-card-open></button><button data-edit></button><button data-delete></button></div>
 <div class="resize right" data-side="right"></div><div class="resize bottom" data-side="bottom" title="Resize map height"></div>
 <div class="cardbody">${renderCardMarkdown(n.md,n.highlights)}</div>`;
 setCardActionIcons(el,"note");
 el.dataset.font=n.font;
 el.style.setProperty("--card-font-family",mapFontStack(n.font));
 el.dataset.mapColor=n.mapColor||"default";
 applyMapFont(n);
 el.querySelector("[data-map-color]").value=n.mapColor||"default";
 populateCardFontSelect(el,font);
 el.dataset.fontSize=normalizeCardSize(size);
 el.querySelector("[data-size]").value=el.dataset.fontSize;
 n.el=el;applyCardFont(n,n.font);updateCardHeading(n);
 enhanceCardSelects(el);world.appendChild(el);state.notes.push(n);readingSession.rows=[];

 el.addEventListener("pointerdown",e=>{
  if(e.target.closest(".cardactions"))return;
  if(e.button===0&&!e.target.closest(".resize"))select(n);
 });
 el.addEventListener("mousedown",e=>{
  if(e.button!==0||e.target.closest(".cardactions,.resize,a,button"))return;
  select(n);
 });
 el.addEventListener("dblclick",e=>{
  if(e.target.closest(".cardactions,.resize"))return;
  e.preventDefault();e.stopPropagation();editNote(n);
 });
 el.querySelector("[data-edit]").onclick=()=>editNote(n);
 el.querySelector("[data-delete]").onclick=()=>deleteNote(n);
 el.querySelector("[data-map-open]").onclick=()=>openMapTab(n);
 el.querySelector("[data-card-open]").onclick=()=>openCardTab(n);
 el.querySelector("[data-view]").onclick=()=>setCardType(n,n.type==="map"?"note":"map");
 el.querySelector("[data-map-color]").onchange=e=>{
  setCardColorTheme(n,e.target.value);
 };
 el.querySelector("[data-font]").onchange=e=>{
  history();applyCardFont(n,e.target.value);save();
 };
 el.querySelector("[data-font]").onfocus=()=>select(n);
 el.querySelector("[data-size]").onchange=e=>{
  history();n.size=e.target.value;el.dataset.fontSize=n.size;save();
 };
 el.querySelector("[data-size]").onfocus=()=>select(n);
 el.querySelectorAll(".resize").forEach(r=>r.onpointerdown=e=>{
  if(e.button!==0)return;
  startResize(e,n,r.dataset.side);
 });
 empty();
 return n;
}
function makeMap(md,x,y,w=null,h=null,record=true,id=null,mapColor=randomCardTheme(),mapFont=newCardFont(),size="80",highlights=[],sourceName=''){
 if(record)history();
 const viewport=mapViewportSize();
 const width=Math.max(Math.min(300,Math.max(200,innerWidth-24)),Math.min(1600,w||viewport.width));
 const height=Math.max(320,h||viewport.height);
const n={id:id??state.nextId++,md,x,y,width,mapWidth:width,mapHeight:height,type:"map",mapColor:MAP_COLORS.includes(mapColor)?mapColor:"default",mapFont:normalizeCardFont(mapFont),font:normalizeCardFont(mapFont),size:normalizeCardSize(size),highlights,sourceName:typeof sourceName==='string'?sourceName:'',el:null,mapInstance:null};
 migrateCardHighlights(n);
 state.nextId=Math.max(state.nextId,n.id+1);
 const el=document.createElement("article");
 el.className="card map-card";el.style.left=x+"px";el.style.top=y+"px";el.style.width=width+"px";el.style.height=height+"px";
 el.dataset.mapColor=n.mapColor;
 applyMapFont(n);
 el.dataset.font=n.font;
 el.innerHTML=`<div class="cardbar"><div class="map-title"></div></div><div class="cardactions"><button type="button" data-view></button><select data-map-color aria-label="Card color theme" title="Card color theme"><option value="default">Midnight</option><option value="purple">Amethyst</option><option value="warm">Terracotta</option><option value="ocean">Ocean</option><option value="forest">Forest</option><option value="sunset">Sunset</option><option value="slate">Slate</option></select><select data-font aria-label="Font" title="Font (V)"><option value="serif">Serif</option><option value="sans">Sans</option><option value="mono">Mono</option></select><select data-size aria-label="Card font size" title="Card font size (1–9, 0)"><option value="50">50%</option><option value="60">60%</option><option value="70">70%</option><option value="80">80%</option><option value="90">90%</option><option value="100">100%</option><option value="110">110%</option><option value="125">125%</option><option value="140">140%</option><option value="160">160%</option></select><button data-map-open></button><button data-card-open></button><button data-edit></button><button data-delete></button></div><div class="resize right" data-side="right"></div><div class="resize bottom" data-side="bottom" title="Resize map height"></div><div class="cardbody"><div class="map-loading">Rendering mind map…</div></div>`;
 setCardActionIcons(el,"map");
 n.el=el;applyCardFont(n,n.font);updateCardHeading(n);world.appendChild(el);state.notes.push(n);readingSession.rows=[];
 el.querySelector("[data-map-color]").value=n.mapColor;
 populateCardFontSelect(el,n.font);
 el.querySelector("[data-size]").value=n.size;
 el.dataset.fontSize=n.size;
 enhanceCardSelects(el);
 el.querySelector(".cardbody").style.setProperty("--card-font-scale",String(Number(n.size)/100));
 el.addEventListener("pointerdown",e=>{
  if(e.target.closest(".cardactions"))return;
  if(e.button===0&&!e.target.closest(".resize"))select(n);
 });
 el.addEventListener("mousedown",e=>{
  if(e.button!==0||e.target.closest(".cardactions,.resize,a,button"))return;
  select(n);
 });
 el.addEventListener("dblclick",e=>{if(!e.target.closest(".cardactions,.resize")){e.preventDefault();e.stopPropagation();editNote(n)}});
 el.querySelector("[data-map-open]").onclick=()=>openMapTab(n);
 el.querySelector("[data-card-open]").onclick=()=>openCardTab(n);
 el.querySelector("[data-edit]").onclick=()=>editNote(n);
 el.querySelector("[data-delete]").onclick=()=>deleteNote(n);
 el.querySelector("[data-view]").onclick=()=>setCardType(n,n.type==="map"?"note":"map");
 el.querySelector("[data-map-color]").onchange=e=>{
  setCardColorTheme(n,e.target.value);
 };
 el.querySelector("[data-font]").onchange=e=>{history();applyCardFont(n,e.target.value);save()};
 el.querySelector("[data-size]").onchange=e=>{history();n.size=e.target.value;el.dataset.fontSize=n.size;el.querySelector(".cardbody").style.setProperty("--card-font-scale",String(Number(n.size)/100));save()};
 el.querySelectorAll(".resize").forEach(r=>r.onpointerdown=e=>{if(e.button===0)startResize(e,n,r.dataset.side)});
 n.mapReady=renderMap(n);empty();return n;
}
let panApplyFrame=0,pendingPenCanvasPan=null,suppressCanvasClickUntil=0;
window.addEventListener("pointermove",e=>{
 if(state.resize){
  const r=state.resize,dx=(e.clientX-r.sx)/state.scale;
  if(r.side==="bottom"){
   const h=Math.max(320,r.h+(e.clientY-r.sy)/state.scale);
   r.n.el.style.height=h+"px";
   r.n.mapHeight=h;
  }else{
   const minWidth=Math.min(300,Math.max(200,innerWidth-24));
   const w=Math.max(minWidth,Math.min(1600,r.w+dx));
   r.n.el.style.width=w+"px";
   if(r.n.type==="map")r.n.mapWidth=w;
   else r.n.width=w;
  }
  // Reflow the board once on release; resize only this card during the drag.
 }

});
// During a drag the scale/base transform stays fixed. Only this independent
// screen-space translation changes, keeping zoom bookkeeping off the hot path.
function paintCanvasDrag(){
 panApplyFrame=0;
 const pan=state.pan;
 if(pan)world.style.translate=`${state.x-pan.x}px ${state.y-pan.y}px`;
}
function updateCanvasDrag(e){
 const pan=state.pan;
 if(!pan||pan.pointerId!==e.pointerId)return;
 const gain=pan.gain||1;
 state.x=pan.x+(e.clientX-pan.sx)*gain;
 state.y=pan.y+(e.clientY-pan.sy)*gain;
 if(!pan.moved&&Math.hypot(e.clientX-pan.sx,e.clientY-pan.sy)>=5){
  pan.moved=true;suppressCanvasClickUntil=performance.now()+500;
 }
 if(!panApplyFrame)panApplyFrame=requestAnimationFrame(paintCanvasDrag);
}
function finishCanvasDrag(pointerId=null){
 if(pointerId!==null&&(state.pan||state.resize)?.pointerId!==pointerId)return;
 const resized=state.resize,panned=state.pan;
 if(!resized&&!panned)return;
 if(resized?.n.type==="map")resized.n.mapInstance?.fit();
 if(panApplyFrame){cancelAnimationFrame(panApplyFrame);panApplyFrame=0}
 if(panned){
  // Commit the final position and remove the temporary translation atomically.
  state.pan=null;sync();apply();world.style.translate="";
  if(panned.moved)suppressCanvasClickUntil=performance.now()+500;
 }
 state.resize=null;state.pan=null;
 if(panned&&canvas.hasPointerCapture?.(panned.pointerId))canvas.releasePointerCapture(panned.pointerId);
 if(resized&&canvas.hasPointerCapture?.(resized.pointerId))canvas.releasePointerCapture(resized.pointerId);
 canvas.style.cursor=state.hand?"grab":"default";
 document.body.classList.remove("canvas-panning");
 if(resized){
  suppressCanvasClickUntil=performance.now()+500;
  const x=resized.n.x,y=resized.n.y;
  layoutCards();
  state.x+=(x-resized.n.x)*state.scale;state.y+=(y-resized.n.y)*state.scale;
  sync();apply();save();
 }
 else finishCameraMotion();
}
window.addEventListener("mouseup",()=>{if(state.resize)finishCanvasDrag()});
window.addEventListener("pointerup",e=>{
 if(state.resize?.pointerId===e.pointerId){finishCanvasDrag(e.pointerId);return}
 if(state.pan?.pointerId!==e.pointerId)return;
 updateCanvasDrag(e);finishCanvasDrag(e.pointerId);
});
window.addEventListener("pointercancel",e=>finishCanvasDrag(e.pointerId));
canvas.addEventListener("lostpointercapture",e=>finishCanvasDrag(e.pointerId));
window.addEventListener("blur",()=>{
 pendingPenCanvasPan=null;
 finishCanvasDrag();
});
function startResize(e,n,side){
 if(side!=="right"&&side!=="bottom")return;
 e.preventDefault();e.stopPropagation();select(n);history();
 interruptCamera();
 state.resize={n,side,sx:e.clientX,sy:e.clientY,w:n.el.offsetWidth,h:n.el.offsetHeight,x:n.x,pointerId:e.pointerId};
 try{canvas.setPointerCapture(e.pointerId)}catch{}
 canvas.style.cursor=side==="bottom"?"ns-resize":"ew-resize";
}
function startPan(e){
 if(e.button!==1&&e.button!==2)return;
 e.preventDefault();
 e.stopPropagation();
 if(e.target===canvas||e.target===world)select(null);
 interruptCamera();
 state.pan={sx:e.clientX,sy:e.clientY,x:state.x,y:state.y,pointerId:e.pointerId,gain:navigation.drag};
 clearTimeout(motionHintTimer);motionHintTimer=0;
 clearTimeout(state.saveTimer);state.saveTimer=0;
 if(wheelFrame){cancelAnimationFrame(wheelFrame);wheelFrame=0;panWheelX=panWheelY=0}
 beginCameraMotion();document.body.classList.add("canvas-panning");
 canvas.style.cursor="grabbing";
 try{canvas.setPointerCapture(e.pointerId)}catch{}
}
canvas.addEventListener("pointerdown",e=>{
 if(e.pointerType==="mouse"){startPan(e);return}
 if(e.pointerType!=="pen")return;
 const rightButton=e.button===2||(e.buttons&2);
 const leftCanvasBackground=e.button===0&&e.target===canvas;
 const mapPane=e.target.closest?.(".map-pane");
 const mapIsUnselected=mapPane&&!mapPane.closest(".map-card")?.classList.contains("selected");
 const leftCardSurface=e.button===0&&e.target.closest?.(".card")&&
  (!mapPane||mapIsUnselected)&&
  !e.target.closest(".cardactions,.resize,button,a,select,input,textarea,[contenteditable='true']");
 if(leftCardSurface){
  pendingPenCanvasPan={pointerId:e.pointerId,x:e.clientX,y:e.clientY};
  try{canvas.setPointerCapture(e.pointerId)}catch{}
  return;
 }
 if(!rightButton&&!leftCanvasBackground)return;
 if(leftCanvasBackground)select(null);
 e.preventDefault();e.stopPropagation();
 interruptCamera();
 state.pan={sx:e.clientX,sy:e.clientY,x:state.x,y:state.y,pointerId:e.pointerId,gain:PEN_PAN_GAIN*navigation.drag};
 clearTimeout(motionHintTimer);motionHintTimer=0;
 clearTimeout(state.saveTimer);state.saveTimer=0;
 if(wheelFrame){cancelAnimationFrame(wheelFrame);wheelFrame=0;panWheelX=panWheelY=0}
 beginCameraMotion();document.body.classList.add("canvas-panning");
 canvas.style.cursor="grabbing";
 try{canvas.setPointerCapture(e.pointerId)}catch{}
},true);
window.addEventListener("pointermove",e=>{
 const pending=pendingPenCanvasPan;
 if(!pending||e.pointerType!=="pen"||pending.pointerId!==e.pointerId)return;
 if(Math.hypot(e.clientX-pending.x,e.clientY-pending.y)<6)return;
 e.preventDefault();
 pendingPenCanvasPan=null;
 window.getSelection()?.removeAllRanges();
 interruptCamera();
 state.pan={sx:pending.x,sy:pending.y,x:state.x,y:state.y,pointerId:e.pointerId,gain:PEN_PAN_GAIN*navigation.drag,moved:true};
 suppressCanvasClickUntil=performance.now()+500;
 clearTimeout(motionHintTimer);motionHintTimer=0;
 clearTimeout(state.saveTimer);state.saveTimer=0;
 if(wheelFrame){cancelAnimationFrame(wheelFrame);wheelFrame=0;panWheelX=panWheelY=0}
 beginCameraMotion();document.body.classList.add("canvas-panning");
 canvas.style.cursor="grabbing";
},{capture:true,passive:false});
window.addEventListener("pointerup",e=>{
 if(pendingPenCanvasPan?.pointerId===e.pointerId)pendingPenCanvasPan=null;
},true);
window.addEventListener("pointercancel",e=>{
 if(pendingPenCanvasPan?.pointerId===e.pointerId)pendingPenCanvasPan=null;
},true);
window.addEventListener("pointermove",e=>{
 if(state.pan?.pointerId!==e.pointerId)return;
 e.preventDefault();
 updateCanvasDrag(e);
},{passive:false});
canvas.addEventListener("click",e=>{
 if(e.target!==canvas&&e.target!==world)return;
 if(performance.now()<suppressCanvasClickUntil)return;
 select(null);
});

canvas.addEventListener("contextmenu",e=>e.preventDefault());
canvas.addEventListener("pointermove",wakeControls,{passive:true});
canvas.addEventListener("wheel",wakeControls,{passive:true});
canvas.addEventListener("mousedown",wakeControls);
window.addEventListener("keydown",wakeControls);


/*
 * Trackpad / wheel navigation
 * HAND ON  -> wheel/trackpad zoom, anchored to the pointer.
 * HAND OFF -> two-axis canvas scrolling/panning.
 *
 * Trackpads emit many small WheelEvents. Accumulate them per animation frame
 * and use the existing camera interpolator for smooth motion.
 */
let wheelFrame=0,panWheelX=0,panWheelY=0,fallbackWheelTimer=0,wheelZoomKind=null;
function wheelUnitDelta(e){
 const unit=e.deltaMode===1?16:e.deltaMode===2?innerHeight:1;
 return {x:e.deltaX*unit,y:e.deltaY*unit};
}
function scheduleWheelFrame(){
 if(wheelFrame)return;
 wheelFrame=requestAnimationFrame(()=>{
  wheelFrame=0;
  const x=state.targetX-panWheelX,y=state.targetY-panWheelY;
  panWheelX=panWheelY=0;
  queueCamera(x,y,state.targetScale,48);
 });
}

// A wheel over an unselected Markmap must not fall through to either
// Markmap's own zoom behavior or the canvas camera. Selected maps keep their
// local wheel zoom; the canvas wheel handler below ignores them.
canvas.addEventListener("wheel",e=>{
 if(state.pan){e.preventDefault();return}
 const mapCard=e.target.closest?.(".map-card");
 if(!mapCard||mapCard.classList.contains("selected"))return;
 e.preventDefault();
 e.stopImmediatePropagation();
},{capture:true,passive:false});

// One frame-batched camera owns canvas scrolling and pinch zoom, so switching
// input types cannot leave D3's gesture transform ahead of the rendered view.

canvas.addEventListener("wheel",e=>{
 if(state.pan){e.preventDefault();return}
 const mapCard=e.target.closest?.(".map-card");
 if(mapCard?.classList.contains("selected"))return;
 e.preventDefault();

 const pinch=e.ctrlKey&&e.deltaMode===0;
 if(pinch||state.hand){
  const kind=pinch?"pinch":"wheel";
  if(!fallbackWheelTimer||wheelZoomKind!==kind||(pinch&&state.raf))interruptCamera();
  wheelZoomKind=kind;
  clearTimeout(fallbackWheelTimer);
  fallbackWheelTimer=setTimeout(()=>{fallbackWheelTimer=0;wheelZoomKind=null;finishCameraMotion()},160);
  queueWheelZoom(canvasWheelExponent(e),e.clientX,e.clientY,!pinch&&(e.deltaMode!==0||Math.abs(e.deltaY)>=40));
  return;
 }
 const d=wheelUnitDelta(e);
 if(!wheelScrollTimer)interruptCamera();
 clearTimeout(wheelScrollTimer);
 wheelScrollTimer=setTimeout(()=>{wheelScrollTimer=0},240);
 let dx=d.x,dy=d.y;
 if(e.shiftKey&&Math.abs(dx)<Math.abs(dy)){dx+=dy;dy=0}
 panWheelX+=dx*navigation.scroll;panWheelY+=dy*navigation.scroll;

 scheduleWheelFrame();
},{passive:false});

function updateHandUI(){
 showControls();
 const button=$("#hand");
 button.classList.toggle("active",state.hand);
 document.body.classList.toggle("hand-mode",state.hand);
 button.innerHTML=state.hand?ICONS.zoom:ICONS.pan;
 button.title=state.hand?"Hand ON · trackpad zoom":"Hand OFF · trackpad pan";
 canvas.style.cursor=state.hand?"grab":"default";
}

const touches=new Map();let gesture=null,touchFrame=0;
function beginTouchGesture(){
 const points=[...touches.values()];
 if(points.length===1){const p=points[0];gesture={type:"pan",x:p.x,y:p.y,ox:state.x,oy:state.y}}
 else if(points.length>=2){
  const[a,b]=points,cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
  gesture={type:"pinch",d:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),s:state.scale,w:worldPoint(cx,cy)};
 }else gesture=null;
}
function flushTouch(){
 touchFrame=0;
 const points=[...touches.values()];
 if(points.length===1&&gesture?.type==="pan"){
  state.x=gesture.ox+(points[0].x-gesture.x)*navigation.drag;state.y=gesture.oy+(points[0].y-gesture.y)*navigation.drag;
 }else if(points.length>=2&&gesture?.type==="pinch"){
  const[a,b]=points,cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
  state.scale=clampScale(gesture.s*(Math.hypot(a.x-b.x,a.y-b.y)/gesture.d)**navigation.pinch);
  state.x=cx-gesture.w.x*state.scale;state.y=cy-gesture.w.y*state.scale;
 }
 sync();markCameraMoving();apply();
}
function flushPendingTouch(){if(touchFrame){cancelAnimationFrame(touchFrame);flushTouch()}}
canvas.addEventListener("pointerdown",e=>{
 if(e.pointerType!=="touch"||e.target.closest(".cardactions,.resize,button,input,select,textarea"))return;
 interruptCamera();flushPendingTouch();
 touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
 try{canvas.setPointerCapture(e.pointerId)}catch{}
 beginTouchGesture();
});
canvas.addEventListener("pointermove",e=>{
 if(e.pointerType!=="touch"||!touches.has(e.pointerId))return;
 touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(!touchFrame)touchFrame=requestAnimationFrame(flushTouch);
});
function touchEnd(e){
 if(e.pointerType!=="touch"||!touches.has(e.pointerId))return;
 flushPendingTouch();touches.delete(e.pointerId);beginTouchGesture();
 if(!touches.size){save();finishCameraMotion()}
}
canvas.addEventListener("pointerup",touchEnd);canvas.addEventListener("pointercancel",touchEnd);
canvas.addEventListener("lostpointercapture",touchEnd);

const textHighlighter=document.createElement('div');
textHighlighter.id='textHighlighter';textHighlighter.className='text-highlighter';textHighlighter.hidden=true;
textHighlighter.setAttribute('role','toolbar');textHighlighter.setAttribute('aria-label','Highlight selected text');
const highlightColors={theme:'Theme',yellow:'Yellow',green:'Green',blue:'Blue',pink:'Pink'};
for(const [color,label] of Object.entries(highlightColors)){
 const button=document.createElement('button');button.type='button';button.dataset.highlightColor=color;
 button.className='highlight-swatch';button.title=label+' highlight';button.setAttribute('aria-label',label+' highlight');
 textHighlighter.append(button);
}
const clearHighlight=document.createElement('button');clearHighlight.type='button';clearHighlight.className='highlight-clear';clearHighlight.innerHTML=ICONS.close;clearHighlight.title='Remove highlight';clearHighlight.setAttribute('aria-label','Remove highlight');textHighlighter.append(clearHighlight);
document.body.append(textHighlighter);
textHighlighter.addEventListener('pointerdown',e=>e.preventDefault());
function hideTextHighlighter(){textHighlighter.hidden=true}
function clearSelectedTextHighlight(){
 showTextHighlighter(false);
 if(!textHighlighter.sourceRange||!textHighlighter.existing?.length)return false;
 clearHighlight.click();return true;
}
function showTextHighlighter(reveal=true){
 textHighlighter.card=null;textHighlighter.sourceRange=null;textHighlighter.existing=[];
 const selection=getSelection();
 if(!selection?.rangeCount||state.pan){hideTextHighlighter();return}
 let range=selection.getRangeAt(0);
 const element=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
 if(selection.isCollapsed){
  const mark=element?.closest('[data-highlight-id],.katex,math,mjx-container');if(!mark){hideTextHighlighter();return}
  range=document.createRange();range.selectNodeContents(mark);selection.removeAllRanges();selection.addRange(range);
 }
 const card=element?.closest('.card'),body=card?.querySelector('.cardbody');
 if(!body||!body.contains(range.endContainer)||element.closest('.code-gutter,script,style')||!range.toString().trim()){hideTextHighlighter();return}
 rememberCardTextSelection();
 const n=state.notes.find(note=>note.el===card);if(!n)return;
 textHighlighter.card=n;
 textHighlighter.source=n.md;
 textHighlighter.sourceRange=ConceptTextHighlights.selection(body,range);
 textHighlighter.range=range.cloneRange();
 if(!textHighlighter.sourceRange){hideTextHighlighter();return}
 textHighlighter.existing=[...new Set([...body.querySelectorAll("[data-highlight-id]")].filter(mark=>range.intersectsNode(mark)).map(mark=>mark.dataset.highlightId))];
 if(!reveal){hideTextHighlighter();return}
 const style=getComputedStyle(card);
 textHighlighter.style.setProperty('--highlight-theme',style.getPropertyValue(document.body.classList.contains('dark')?'--card-accent-dark':'--card-accent'));
 const bounds=range.getBoundingClientRect();textHighlighter.hidden=false;
 const width=textHighlighter.offsetWidth,height=textHighlighter.offsetHeight;
 textHighlighter.style.left=Math.max(8,Math.min(innerWidth-width-8,bounds.left+(bounds.width-width)/2))+'px';
 textHighlighter.style.top=(bounds.top-height-6>=8?bounds.top-height-6:Math.min(innerHeight-height-8,bounds.bottom+6))+'px';
}
world.addEventListener('pointerup',()=>{if(!state.pan)setTimeout(showTextHighlighter,0)});
world.addEventListener('keyup',()=>showTextHighlighter());
document.addEventListener('pointerdown',e=>{if(!textHighlighter.contains(e.target))hideTextHighlighter()});
document.addEventListener('selectionchange',()=>{
 if(textHighlighter.hidden)return;
 const selection=getSelection(),saved=textHighlighter.range,current=selection?.rangeCount?selection.getRangeAt(0):null;
 if(!saved||!current||saved.startContainer!==current.startContainer||saved.startOffset!==current.startOffset||saved.endContainer!==current.endContainer||saved.endOffset!==current.endOffset)hideTextHighlighter();
});
textHighlighter.addEventListener('keydown',e=>{
 e.stopPropagation();
 if(e.key==='Escape')hideTextHighlighter();
 if(e.key==='Backspace'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!e.shiftKey&&clearSelectedTextHighlight())e.preventDefault();
});
textHighlighter.addEventListener('click',e=>{
 const button=e.target.closest('button'),n=textHighlighter.card;if(!button||!n)return;
 if(textHighlighter.source!==n.md){hideTextHighlighter();return}
 const selected=textHighlighter.sourceRange,ids=textHighlighter.existing,color=button.dataset.highlightColor;
 if(!selected||(!color&&!ids.length)){hideTextHighlighter();return}
 history();
 if(color){
  if(ids.length)n.highlights=n.highlights.map(item=>ids.includes(item.id)?{...item,color}:item);
  else n.highlights.push(ConceptTextHighlights.create(selected,color));
 }else n.highlights=n.highlights.filter(item=>!ids.includes(item.id));
 ConceptTextHighlights.paint(n.el.querySelector('.cardbody'),n.highlights);
 save();hideTextHighlighter();getSelection()?.removeAllRanges();rememberCardTextSelection.current=null;
});

function rememberCardTextSelection(){
 const selection=window.getSelection();
 if(!selection?.rangeCount||selection.isCollapsed)return;
 const range=selection.getRangeAt(0),element=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
 const card=element?.closest('.card'),body=card?.querySelector('.cardbody');
 if(!body||!body.contains(range.startContainer)||!body.contains(range.endContainer))return;
 const prefix=range.cloneRange();prefix.selectNodeContents(body);prefix.setEnd(range.startContainer,range.startOffset);
 rememberCardTextSelection.current={card,text:range.toString(),before:prefix.toString()};
}
// Capture before clicking Edit transfers focus away from the rendered selection.
world.addEventListener('pointerdown',rememberCardTextSelection,true);
document.addEventListener('selectionchange',rememberCardTextSelection);
function editorSelectionRange(n){
 rememberCardTextSelection();
 const selection=rememberCardTextSelection.current;
 if(!selection||selection.card!==n.el||!selection.text)return {start:0,end:0};
 const text=selection.text,md=n.md;
 const occurrence=selection.before.split(text).length-1;
 const escape=char=>char.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');
 const separator='(?:[*_~'+String.fromCharCode(96)+']|<[^>]+>|\\]\\([^\\n)]*\\)|\\[)*';
 const pattern=[...text].map(char=>/\s/.test(char)?'\\s+':escape(char)).join(separator);
 const hidden=[];
 for(const tag of md.matchAll(/<\/?[a-z][^>]*>/gi))hidden.push([tag.index,tag.index+tag[0].length]);
 for(const link of md.matchAll(/\[[^\]\n]*\]\(([^)]*)\)/g)){const start=link.index+link[0].lastIndexOf('](')+2;hidden.push([start,link.index+link[0].length])}
 const matches=[...md.matchAll(new RegExp(pattern,'g'))].filter(match=>!hidden.some(([start,end])=>match.index>=start&&match.index<end));
 const match=matches[occurrence];
 return match?{start:match.index,end:match.index+match[0].length}:{start:0,end:0};
}
function revealEditorSelection(start){
 const styles=getComputedStyle(source),mirror=document.createElement('div');
 for(const key of ['fontFamily','fontSize','fontWeight','fontStyle','lineHeight','letterSpacing','padding','boxSizing','tabSize'])mirror.style[key]=styles[key];
 Object.assign(mirror.style,{position:'fixed',left:'-10000px',top:'0',width:source.clientWidth+'px',whiteSpace:'pre-wrap',overflowWrap:'break-word',visibility:'hidden'});
 mirror.append(document.createTextNode(source.value.slice(0,start)));
 const marker=document.createElement('span');marker.textContent='\u200b';mirror.append(marker);document.body.append(mirror);
 const top=marker.getBoundingClientRect().top-mirror.getBoundingClientRect().top;
 source.scrollTop=Math.max(0,top-source.clientHeight/3);mirror.remove();
}

function openEditor(mode="note",n=null){
 state.editId=n?.id??null;
 state.editorMode=mode;
 source.value=n?.md||"";
 $("#mapColor").value=n?.mapColor||randomCardTheme();
 $("#mapFont").value=normalizeCardFont(n?.font||n?.mapFont||newCardFont());
 syncCardSelect($("#mapColor"));
 syncCardSelect($("#mapFont"));
 $("#applyCard").textContent=n?"Update card":"Place card";
 $("#applyMap").textContent=n?"Update map":"Place map";
 editor.dataset.mode=mode;
 editor.classList.add("open");
 source.focus();
}
function editNote(n){
 const range=editorSelectionRange(n);
 openEditor(n.type==="map"?"map":"note",n);
 source.setSelectionRange(range.start,range.end);
 revealEditorSelection(range.start);
 rememberCardTextSelection.current=null;
}
function closeEditor(){
 editor.classList.remove("open");
 state.editId=null;
 state.editorMode="note";
 editor.dataset.mode="note";
}
function applyEditor(type=state.editorMode){
 const md=source.value.trim();if(!md)return;
 let inserted=false;
 if(state.editId!==null){
  const n=state.notes.find(x=>x.id===state.editId);if(!n)return;
  history();n.md=md;n.mapColor=$("#mapColor").value;applyMapFont(n,$("#mapFont").value);
  if(n.type!==type)setCardType(n,type,false);
  else if(type==="map")n.mapReady=renderMap(n);
  else n.el.querySelector(".cardbody").innerHTML=renderCardMarkdown(n.md,n.highlights);
  updateCardHeading(n);
  n.el.dataset.mapColor=n.mapColor;
  applyMapFont(n);

  select(n);
 }else{
  const p=worldPoint(innerWidth/2,innerHeight/2);
  const size=mapViewportSize();
  const n=type==="map"
   ? makeMap(md,p.x-size.width/2,p.y-size.height/2,size.width,size.height,true,null,$("#mapColor").value,$("#mapFont").value)
   : makeNote(md,p.x-300,p.y-150,600,true,null,$("#mapFont").value,"80",$("#mapColor").value,$("#mapFont").value);
  select(n);inserted=true;
 }
 closeEditor();
 if(inserted)scheduleArrange();
 save()
}
function openMapTab(n){
  const payload=JSON.stringify(prepareMarkmapMarkdown(n.md)).replace(/</g,"\\u003c");
  const title=escapeHtml((n.md.match(/^#\s+(.+)$/m)||[])[1]||sourceTitle(n)||"ConceptCards mind map");
  const fontStack=mapFontStack(n.mapFont);
  const stylesheet=escapeHtml(new URL("styles.css",location.href).href);
  const size=normalizeCardSize(n.size);
  const darkMode=document.body.classList.contains("dark");
  const theme=MAP_COLORS.includes(n.mapColor)?n.mapColor:"default";
  const fontStylesheet=googleFontStylesheetUrl(n.mapFont);
  const fontLink=fontStylesheet?`<link rel="stylesheet" href="${fontStylesheet}">`:"";
  const rainbow=["#e76f51","#f4a261","#e9c46a","#6b9b67","#299c97","#4e7bc5","#a16bb3","#d5668a"];
  const colors=(MAP_PALETTES[theme]||MAP_PALETTES.default);
  const colorPayload=JSON.stringify(colors);
  const highlightPayload=JSON.stringify(n.highlights||[]).replace(/</g,"\\u003c");
  const highlightScript=escapeHtml(new URL("text-highlights.js",location.href).href);
  const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>${fontLink}<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css"><link rel="stylesheet" href="${stylesheet}"><style>html,body{height:100%;margin:0}.card.map-window{position:fixed;inset:0;width:100%;height:100%;min-width:0;max-width:none;min-height:0;border:0;border-radius:0}.map-window .cardbody{height:100%;padding:0}.map-window .map-pane{height:100%;background:transparent}.map-window .map-pane>svg{width:100%;height:100%}</style></head><body class="${darkMode?"dark":""}"><article class="card map-card map-window" data-map-color="${theme}" data-font="${normalizeCardFont(n.mapFont)}" data-font-size="${size}" style="--card-font-family:${escapeHtml(fontStack)};--map-font-family:${escapeHtml(fontStack)}"><div class="cardbody"><div class="map-pane"><svg id="map"></svg></div></div></article><script src="https://cdn.jsdelivr.net/npm/d3@7"><\/script><script src="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js"><\/script><script src="https://cdn.jsdelivr.net/npm/markmap-lib@0.18.12"><\/script><script src="https://cdn.jsdelivr.net/npm/markmap-view@0.18.12"><\/script><script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.12.0/highlight.min.js"><\/script><script src="${highlightScript}"><\/script><script>const md=${payload};const colors=${colorPayload};const highlights=${highlightPayload};const root=new markmap.Transformer().transform(md).root;const depth=node=>node.state?.depth||0;const svg=document.querySelector("#map");const map=markmap.Markmap.create(svg,{autoFit:false,duration:350,maxWidth:300,spacingHorizontal:82,spacingVertical:15,color:node=>colors[depth(node)%colors.length],lineWidth:node=>depth(node)===1?3.6:depth(node)===2?2.25:1.55,style:id=>"#"+id+" .markmap-link{stroke-linecap:round;stroke-linejoin:round}"});${enableMapCameraFrames.toString()};let mapNavigation={drag:1};try{mapNavigation=JSON.parse(localStorage.getItem("reflatex-navigation")||"{}")}catch{}enableMapCameraFrames(svg,map,mapNavigation);(async()=>{await document.fonts.ready;await map.setData(root);svg.querySelectorAll("pre code").forEach(code=>{if(window.hljs){try{hljs.highlightElement(code)}catch{}}});ConceptTextHighlights.paint(document.querySelector(".map-pane"),highlights);await map.fit()})().catch(error=>{document.querySelector(".map-pane").textContent="Could not render this map: "+error.message});<\/script></body></html>`;
  const tab=window.open();if(!tab){alert("Allow pop-ups to open this mind map.");return}
  tab.document.write(html);tab.document.close();
}
async function quickPaste(){
 if(document.activeElement===source){return}
 try{
  const md=await navigator.clipboard.readText();
  if(!md.trim())return;
  source.value=md;
  editor.classList.add("open");
  source.focus();
 }catch{
  editor.classList.add("open");source.value="";source.focus();
 }
}
function disposeCard(n){
 cardVisits.delete(n);
 readingSession.cards.delete(n.id);
 readingSession.rows=[];
 n.mapCameraCleanup?.();n.mapCameraCleanup=null;
 n.mapRenderId=(n.mapRenderId||0)+1;
 try{n.mapInstance?.destroy?.()}catch{}
 n.mapInstance=null;n.el.remove();
}
function deleteNote(n){
 history();
 const wasSelected=state.selected===n;
 if(wasSelected)select(null);
 disposeCard(n);state.notes=state.notes.filter(x=>x!==n);
 if(wasSelected)select([...cardVisits].at(-1)||null);
 empty();save();
}
async function copyNote(){
 if(!state.selected)return;
 try{await navigator.clipboard.writeText(state.selected.md)}catch{}
}
function duplicate(){
 if(!state.selected)return;
 const n=state.selected;
 const c=n.type==="map"
  ? makeMap(n.md,n.x+45,n.y+45,n.mapWidth||n.el.offsetWidth,n.mapHeight||n.el.offsetHeight,true,null,n.mapColor,n.mapFont,n.size,n.highlights,n.sourceName)
  : makeNote(n.md,n.x+45,n.y+45,n.el.offsetWidth,true,null,n.font,n.size,n.mapColor,n.mapFont,n.mapWidth,n.mapHeight,n.highlights,n.sourceName);
 select(c);save()
}
function fit(widthOnly=false){
 const b=cardBounds();
 if(!b){moveTo(innerWidth/2,innerHeight/2,1);return}
 const w=Math.max(1,b.maxX-b.minX),h=Math.max(1,b.maxY-b.minY),p=24,view=focusViewport();
 const s=Math.max(MIN_SCALE,Math.min(1.5,widthOnly
  ? Math.max(1,view.width-2*p)/w
  : Math.min(Math.max(1,view.width-2*p)/w,Math.max(1,view.height-2*p)/h)));
 const cx=b.minX+w/2,cy=b.minY+h/2;
 const x=view.left+view.width/2-cx*s,y=widthOnly?state.targetY:view.top+view.height/2-cy*s;
 if(state.overviewActive){
  // Establish the overview at its small scale before caching it. Caching a
  // reading-scale bitmap first makes a large overview unnecessarily costly.
  interruptCamera();setCameraImmediate(x,y,s);beginCameraMotion();finishCameraMotion();
 }else moveTo(x,y,s);
}
function showOverview(){
 rememberCardView(state.selected);
 state.overviewActive=true;state.spaceFocusStep=0;
 fit(false);save();
}
function layoutCards(){
 if(!state.notes.length)return;
 const notes=state.notes;
 const minimumGap=24,extraGap=0;

 notes.forEach(n=>{
  const width=n.type==="map"?(n.mapWidth||n.width||n.el.offsetWidth):(n.width||n.el.offsetWidth);
  if(n.el.style.width!==width+'px')n.el.style.width=width+'px';
  if(n.type==="map"&&n.mapHeight&&n.el.style.height!==n.mapHeight+'px')n.el.style.height=n.mapHeight+'px';
 });

 const dimensions=new Map(notes.map(n=>[n,{w:n.el.offsetWidth,h:n.el.offsetHeight}]));
 for(const [n,d] of dimensions){if(n.type==='map')n.mapWidth=d.w;else n.width=d.w}
 const count=notes.length,viewport=focusViewport();
 for(const [n,d] of dimensions){const p=readingSession.cards.has(n.id)?readingPadding(d.w,d.h,viewport):{x:0,y:0};d.beforeX=d.afterX=p.x;d.beforeY=d.afterY=p.y}
 const aspect=Math.max(.6,Math.min(1.6,viewport.width/viewport.height));
 const average=[...dimensions.values()].reduce((sum,d)=>({
  w:sum.w+d.w+Math.max(minimumGap,d.beforeX,d.afterX)+extraGap,
  h:sum.h+d.h+Math.max(minimumGap,d.beforeY,d.afterY)+extraGap
 }),{w:0,h:0});
 const idealRows=Math.sqrt(count*average.w/(aspect*average.h));
 // Long documents must not turn the board into a single horizontal strip.
 // Bound the row length by card count and the usable viewport, then retain
 // the dimension-based choice among the remaining balanced layouts.
 const maximumColumns=Math.max(2,Math.ceil(Math.sqrt(count*aspect)));
 const minimumRows=count>2?Math.max(2,Math.ceil(count/maximumColumns)):1;
 let best=null;
 const firstCandidate=Math.max(minimumRows,Math.floor(idealRows)-2);
 const candidates=new Set(Array.from({length:6},(_,i)=>Math.min(count,firstCandidate+i)));
 for(const rowCount of candidates){
  const base=Math.floor(count/rowCount),extra=count%rowCount;
  let start=0;
  const rows=Array.from({length:rowCount},(_,i)=>{
   const cards=notes.slice(start,start+base+(i<extra?1:0));start+=cards.length;
   const gaps=cards.map((n,j)=>j===cards.length-1?0:Math.max(minimumGap,dimensions.get(n).afterX,dimensions.get(cards[j+1]).beforeX)+extraGap);
   return {cards,gaps,width:cards.reduce((w,n,j)=>w+dimensions.get(n).w+gaps[j],0),height:Math.max(...cards.map(n=>dimensions.get(n).h))};
  });
  for(const [i,row] of rows.entries())row.gap=i===rows.length-1?0:Math.max(minimumGap,...row.cards.map(n=>dimensions.get(n).afterY),...rows[i+1].cards.map(n=>dimensions.get(n).beforeY))+extraGap;
  const width=Math.max(...rows.map(row=>row.width)),height=rows.reduce((h,row)=>h+row.height+row.gap,0);
  const score=Math.abs(Math.log(width/height/aspect));
  if(!best||score<best.score)best={rows,height,score};
 }
 let rowTop=-best.height/2;
 for(const row of best.rows){
  let columnLeft=-row.width/2;
  for(const [i,n] of row.cards.entries()){
   n.x=columnLeft;
   n.y=rowTop;
   if(n.el.style.left!==n.x+'px')n.el.style.left=n.x+'px';
   if(n.el.style.top!==n.y+'px')n.el.style.top=n.y+'px';
   columnLeft+=dimensions.get(n).w+row.gaps[i];
  }

  rowTop+=row.height+row.gap;
 }
 cacheReadingRows(best.rows,dimensions);
}
function arrange(record=true,reset=true){
 if(!state.notes.length)return;
 if(record)history();
 if(state.spaceFocusStep)rememberCardView(state.selected);
 if(reset)resetReadingSession();
 state.overviewActive=true;state.spaceFocusStep=0;
 layoutCards();
 requestAnimationFrame(()=>{
  // Arrange changes canvas card positions, not the map's internal viewport.
  // Re-fitting every Markmap here resets its zoom transform and can make the
  // content jump toward a corner. Each map is fitted once when it renders;
  // preserve that view while arranging the cards around it.
  fit(false);
  save();
 });
}
function scheduleArrange(){
 requestAnimationFrame(()=>arrange(false,false));
}
const backgrounds=["light","cream","sand","sun","ocean","stars","village"];
const backgroundLabels={
 light:"Light",
 cream:"Cream",sand:"Sand",
 sun:"Sun",
 stars:"Stars",
 ocean:"Ocean",
 village:"Village"
};
// CSS handles motion; hidden tabs retain their position without animating.
document.addEventListener("visibilitychange",()=>{
 canvas.classList.toggle("background-paused",document.hidden);
});
function setBackground(name){
 const background=name==="dots"?"stars":backgrounds.includes(name)?name:"light";
 canvas.dataset.background=background;
 localStorage.setItem("reflatex-background",background);
 $("#background").title=`Background: ${backgroundLabels[background]} (S cycles backgrounds)`;
 document.querySelectorAll("[data-background-choice]").forEach(button=>{
  button.classList.toggle("active",button.dataset.backgroundChoice===background);
 });
}
function cycleBackground(){
 const current=backgrounds.indexOf(canvas.dataset.background||"light");
 setBackground(backgrounds[(current+1)%backgrounds.length]);
 showControls();
}
function toggleToolbar(force){
 const hidden=force===undefined
  ? !document.body.classList.contains("toolbar-hidden")
  : !force;
 document.body.classList.toggle("toolbar-hidden",hidden);
 localStorage.setItem("reflatex-toolbar-hidden",hidden?"1":"0");
 $("#toolbar").setAttribute("aria-hidden",String(hidden));
 setIndexOpen(!hidden);
 if(hidden){
  closeCardMenu();toggleBackgroundMenu(false);
  if(document.activeElement?.closest(".toolbar,.zoom,.card-index,.cardactions"))document.activeElement.blur();
 }
}
function toggleBackgroundMenu(force){
 const menu=$("#backgroundMenu");
 const open=force===undefined?!menu.classList.contains("open"):force;
 menu.classList.toggle("open",open);
 $("#background").setAttribute("aria-expanded",String(open));
}
function updateThemeIcon(){
 const dark=document.body.classList.contains("dark");
 closeCardMenu();
 document.querySelectorAll('select[data-map-color],select#mapColor').forEach(syncCardSelect);
 setButtonIcon($("#theme"),dark?"sun":"moon",dark?"Switch to light mode (T)":"Switch to dark mode (T)");
}
function toggleTheme(){document.body.classList.toggle("dark");localStorage.setItem("reflatex-theme",document.body.classList.contains("dark")?"dark":"light");updateThemeIcon()}
function revealControls(){
 showControls();clearTimeout(state.hideTimer);
 state.hideTimer=setTimeout(()=>{if(!editor.classList.contains("open"))document.body.classList.remove("controls")},2200)
}
async function toggleFull(){
 try{
  if(document.fullscreenElement)await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
 }catch{}
}
document.addEventListener("mousemove",e=>{if(document.body.classList.contains("fullscreen")&&(e.clientY<80||e.clientX>innerWidth-25))revealControls()});
document.addEventListener("fullscreenchange",()=>{
 const active=!!document.fullscreenElement;
 document.body.classList.toggle("fullscreen",active);
});

const helpBackdrop=$("#helpBackdrop");
function openHelp(){
 helpBackdrop.hidden=false;
 $("#closeHelp").focus();
}
function closeHelp(){
 if(helpBackdrop.hidden)return;
 helpBackdrop.hidden=true;
 $("#help").focus();
}
$("#help").onclick=openHelp;
$("#closeHelp").onclick=closeHelp;
helpBackdrop.addEventListener("click",e=>{if(e.target===helpBackdrop)closeHelp()});

$("#hand").onclick=()=>{
 state.hand=!state.hand;
 updateHandUI();
showControls();
}
$("#new").onclick=()=>openEditor("note")
$("#center").onclick=showOverview;
$("#arrange").onclick=arrange
$("#background").onclick=e=>{e.stopPropagation();toggleBackgroundMenu()}
document.querySelectorAll("[data-background-choice]").forEach(button=>{
 button.onclick=e=>{
  e.stopPropagation();
  setBackground(button.dataset.backgroundChoice);
  toggleBackgroundMenu(false);
  showControls();
 };
});
$("#theme").onclick=toggleTheme
$("#saveCanvas").onclick=downloadCanvas;
let pdfExportLoader;
async function downloadCardPdf(n){
 if(!n)return;
 const pdfWindow=window.open("","_blank");
 if(!pdfWindow){alert("Allow pop-ups to save this card as PDF.");return}
 pdfWindow.document.title="Preparing PDF…";
 const button=n.el.querySelector("[data-card-pdf]");button.disabled=true;
 try{
  pdfExportLoader ||= new Promise((resolve,reject)=>{
   const script=document.createElement("script");script.src="./card-pdf.js?v=3";
   script.onload=resolve;script.onerror=()=>{pdfExportLoader=null;reject(new Error("Could not load PDF export"))};document.head.append(script);
  });
  await pdfExportLoader;
  await window.downloadConceptCardPdf({
   window:pdfWindow,baseURL:location.href,
   css:[...document.styleSheets].flatMap(sheet=>{try{return [...sheet.cssRules].map(rule=>rule.cssText)}catch{return []}}).join("\n"),
   stylesheets:[...new Set([
    new URL("styles.css",location.href).href,
    ...[...document.querySelectorAll('link[rel="stylesheet"]')].filter(link=>link.hasAttribute("data-ui-fonts")||link.href.includes("katex.min.css")).map(link=>link.href),
    googleFontStylesheetUrl(n.type==="map"?n.mapFont:n.font)
   ].filter(Boolean))],
   title:cardMarkdownParts(n.md).title||sourceTitle(n)||"ConceptCards card",html:renderCardMarkdown(n.md,n.highlights),
   width:Math.max(300,Math.min(1600,n.el.offsetWidth||600)),
   font:normalizeCardFont(n.type==="map"?n.mapFont:n.font),fontStack:mapFontStack(n.type==="map"?n.mapFont:n.font),
   size:String(n.size||"80"),theme:n.mapColor||"default",dark:document.body.classList.contains("dark")
  });
 }catch(error){pdfWindow.close();alert("Could not export this card: "+error.message)}
 finally{button.disabled=false}
}
$("#openCanvas").onclick=()=>canvasFiles?canvasFiles.toggleOpenMenu():$("#canvasFile").click()
$("#canvasFile").addEventListener("change",e=>{
 const file=e.target.files?.[0];
 if(canvasFiles)canvasFiles.importFile(file);else openCanvasFile(file);
 e.target.value="";
})
$("#markdownFiles").addEventListener('change',e=>{
 const files=Array.from(e.target.files||[]);e.target.value='';
 importMarkdownFiles(files);
});
$("#full").onclick=toggleFull
$("#edge").onclick=()=>{toggleToolbar(true);revealControls()}
$("#minus").onclick=()=>zoom(1/navigation.step);$("#plus").onclick=()=>zoom(navigation.step);
zoomLabel.addEventListener("change",()=>{
 const percent=Number(zoomLabel.value);
 if(Number.isFinite(percent)&&percent>0)zoom(clampScale(percent/100)/state.scale);
 zoomLabel.value=String(Math.round(state.scale*1000)/10);
});
zoomLabel.addEventListener("blur",()=>{zoomLabel.value=String(Math.round(state.scale*1000)/10)});
zoomLabel.addEventListener("keydown",e=>{if(e.key==="Enter")zoomLabel.blur();e.stopPropagation()});
$("#actualSize").onclick=()=>zoom(1/state.scale);
$("#fitView").onclick=showOverview;
for(const key of ["wheel","scroll","pinch","drag","step"]){
 const input=$("#nav-"+key),output=$("#nav-"+key+"-value");
 input.value=navigation[key];
 const refresh=()=>{output.textContent=key==="step"?Math.round((navigation[key]-1)*100)+"%":navigation[key]+"×"};
 refresh();
 input.addEventListener("input",()=>{
  navigation[key]=Number(input.value);refresh();
  try{localStorage.setItem("reflatex-navigation",JSON.stringify(navigation))}catch{}
 });
}
$("#close").onclick=closeEditor;$("#cancel").onclick=closeEditor;$("#applyCard").onclick=()=>applyEditor("note");$("#applyMap").onclick=()=>applyEditor("map")
$("#edit").onclick=()=>state.selected&&editNote(state.selected)
$("#duplicate").onclick=duplicate
$("#copy").onclick=copyNote
$("#remove").onclick=()=>state.selected&&deleteNote(state.selected)
document.addEventListener("click",e=>{
 if(!context.contains(e.target))context.classList.remove("open");
 if(!e.target.closest(".background-picker"))toggleBackgroundMenu(false);
})
document.addEventListener("paste",e=>{
 if(document.activeElement===source)return;
 const md=e.clipboardData?.getData("text/plain");if(!md?.trim())return;
 e.preventDefault();
 const p=worldPoint(innerWidth/2,innerHeight/2);
 const n=makeNote(md,p.x-300,p.y-150,600,true);
 select(n);
 scheduleArrange();
});

function focusViewport(){
 const margin=24;
 const index=$("#cardIndex"),tray=$(".toolbar");
 const left=index.hidden?margin:index.getBoundingClientRect().right+margin;
 const trayVisible=!document.body.classList.contains("toolbar-hidden")&&!document.body.classList.contains("controls-hidden");
 const trayInset=parseFloat(getComputedStyle(tray).right)||0;
 const right=trayVisible?innerWidth-trayInset-tray.offsetWidth-margin:innerWidth-margin;
 return {left,top:margin,width:Math.max(1,right-left),height:Math.max(1,innerHeight-margin*2)};
}
async function focusSelected(mode="readable",options={}){
  const n=state.selected;
  if(!n)return;
  if(n.type==="map")mode="fit";
  state.overviewActive=false;
  state.spaceFocusStep=mode==="fit"?1:2;
  const fitMap=n.type==="map"&&mode==="fit";

  if(n.type==="map"){
   // Wait for the initial render before measuring or centering this map.
   try{await n.mapReady}catch{}
   if(state.selected!==n||n.type!=="map")return;
  }

  if(fitMap&&!options.preserveSize){
   const size=mapViewportSize();
   const dimensionsChanged=n.mapWidth!==size.width||n.mapHeight!==size.height;
   if(dimensionsChanged){
    history();
    n.mapWidth=size.width;n.mapHeight=size.height;
    n.el.style.width=size.width+"px";n.el.style.height=size.height+"px";
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(state.selected!==n)return;
   }
  }
  if(options.readingSession)addReadingCard(n);

  // Fit Markdown cards to the available width; Markmaps also fit vertically.
  const r={
    x:n.x,
    y:n.y,
    w:n.el.offsetWidth,
    h:n.el.offsetHeight
  };
  // n.x/n.y are the canonical canvas coordinates. Using the transformed
  // client rect made focus depend on the camera's current animation frame.
  const worldLeft=n.x;
  const worldTop=n.y;
  const worldCenterX=worldLeft+r.w/2;
  const worldCenterY=worldTop+r.h/2;
  const viewport=focusViewport();
  const availableWidth=viewport.width;
  const availableHeight=viewport.height;
  const centerX=viewport.left+availableWidth/2;
  const centerY=viewport.top+availableHeight/2;
  const widthScale=availableWidth/r.w;
  if(mode==="fit"){
    const fitScale=clampScale(Math.min(widthScale,availableHeight/r.h));
    const cameraX=centerX-worldCenterX*fitScale;
    const cameraY=centerY-worldCenterY*fitScale;
    if(fitMap){
      // Markmap.fit() measures the SVG's client rect. Center and size the
      // card first so that measurement uses the final canvas zoom; fitting
      // before this camera change made one Space press appear to need a second.
      if(state.raf){cancelAnimationFrame(state.raf);state.raf=0}
      setCameraImmediate(cameraX,cameraY,fitScale);
      finishCameraMotion();
      try{
        await n.mapInstance?.setData();
        if(state.selected!==n)return;
        await n.mapInstance?.fit();
      }catch{}
      if(state.selected!==n)return;
      save();
    }else{
      moveTo(cameraX,cameraY,fitScale);
    }
    return;
  }
  const fitScale=n.type==="map"?Math.min(widthScale,availableHeight/r.h):widthScale;
  const targetScale=clampScale(Math.min(1.2,fitScale));

  moveTo(
    centerX-worldCenterX*targetScale,
    r.h*targetScale<=availableHeight?centerY-worldCenterY*targetScale:viewport.top-worldTop*targetScale,
    targetScale
  );
}

function openCardTab(n){
 const heading=cardMarkdownParts(n.md).title||sourceTitle(n);
 const title=escapeHtml(heading||"ConceptCards card");
 const titleHtml=heading?`<div class="cardbar"><div class="map-title">${escapeHtml(heading)}</div></div>`:`<div class="cardbar"><div class="map-title"></div></div>`;
 const theme=MAP_COLORS.includes(n.mapColor)?n.mapColor:"default";
 const font=normalizeCardFont(n.type==="map"?n.mapFont:n.font);
 const fontStack=mapFontStack(font);
 const fontStylesheet=googleFontStylesheetUrl(font);
 const fontLink=fontStylesheet?`<link rel="stylesheet" href="${escapeHtml(fontStylesheet)}">`:"";
 const size=normalizeCardSize(n.size);
 const stylesheet=escapeHtml(new URL("styles.css",location.href).href);
 const supportingStyles=[...document.querySelectorAll('link[rel="stylesheet"]')]
  .filter(link=>link.hasAttribute("data-ui-fonts")||link.href.includes("katex.min.css"))
  .map(link=>`<link rel="stylesheet" href="${escapeHtml(link.href)}">`).join("");
 const dark=document.body.classList.contains("dark");
 const width=Math.max(300,Math.min(1600,n.el.offsetWidth||600));
 const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="${stylesheet}">${supportingStyles}${fontLink}<style>html,body{height:auto;min-height:100%;margin:0}html{overflow-x:hidden;overflow-y:auto}body{min-height:100vh;display:grid;align-items:start;justify-items:center;padding:24px;box-sizing:border-box;overflow:visible;background:var(--canvas);color:var(--ink)}.card.card-window{min-width:0;position:relative;left:auto;top:auto;width:min(${width}px,calc(100vw - 48px));max-width:100%;max-height:none;overflow:visible;box-sizing:border-box}.card-window .cardbar{cursor:default}.card-window .cardactions,.card-window .resize{display:none!important}.card-window .cardbody{height:auto;max-height:none;overflow:visible}@media(max-width:600px){body{padding:12px}.card.card-window{width:100%}}</style></head><body class="${dark?"dark":""}"><article class="card card-window${heading?" has-title":""}" data-map-color="${theme}" data-font="${font}" data-font-size="${size}" style="--card-font-family:${escapeHtml(fontStack)}">${titleHtml}<div class="cardbody">${renderCardMarkdown(n.md,n.highlights)}</div></article></body></html>`;
 const tab=window.open();
 if(!tab){alert("Allow pop-ups to open this card.");return}
 tab.document.write(html);tab.document.close();
}

function cycleSelected(direction){
  if(!state.notes.length)return;

  let index=state.notes.indexOf(state.selected);

  if(index<0){
    index=direction>0?0:state.notes.length-1;
  }else{
    index=Math.max(0,Math.min(state.notes.length-1,index+direction));
  }

  const n=state.notes[index];
  if(n===state.selected)return;
  select(n);
  const remembered=n.navigationView;
  if(!remembered){focusSelected();return}
  state.overviewActive=false;
  const view=focusViewport(),scale=clampScale(remembered.scale);
  const body=n.el.querySelector('.cardbody');
  if(body){body.scrollTop=remembered.scrollTop;body.scrollLeft=remembered.scrollLeft}
  state.spaceFocusStep=remembered.focusStep;
  moveTo(view.left+view.width/2-(n.x+remembered.localX)*scale,view.top+view.height/2-(n.y+remembered.localY)*scale,scale);
}

function cycleFont(direction=1){
 const activeCard=document.activeElement?.closest(".card");
 const n=state.selected||state.notes.find(note=>note.el===activeCard);
 if(!n)return;
 select(n);
 const fontSelect=n.el.querySelector("[data-font]");
 const options=[...fontSelect.options];
 const index=options.findIndex(option=>option.value===fontSelect.value);
 const next=(index+direction+options.length)%options.length;
 fontSelect.value=options[next].value;
 fontSelect.dispatchEvent(new Event("change",{bubbles:true}));
}

function cycleCardTheme(){
 const n=state.selected;if(!n)return;
 const current=Math.max(0,MAP_COLORS.indexOf(n.mapColor||"default"));
 setCardColorTheme(n,MAP_COLORS[(current+1)%MAP_COLORS.length]);
}

function setCardColorTheme(n,color,record=true){
 if(!n?.el)return;
 const next=MAP_COLORS.includes(color)?color:"default";
 if(n.mapColor===next)return;
 if(record)history();
 n.mapColor=next;
 n.el.dataset.mapColor=next;
 const indexEntry=$("#indexEntries").querySelector(`[data-index-card-id="${CSS.escape(String(n.id))}"]`);
 if(indexEntry)indexEntry.dataset.mapColor=next;
 const selectEl=n.el.querySelector("[data-map-color]");
 if(selectEl){selectEl.value=next;syncCardSelect(selectEl)}
 if(n.type==="map")n.mapReady=renderMap(n);
 save();
}

let widthShortcutFrame=0;
function resizeSelectedWidth(direction){
 const n=state.selected;if(!n)return;
 const min=Math.min(300,Math.max(200,innerWidth-24)),max=n.type==="map"?1600:1200;
 const current=n.type==="map"?(n.mapWidth||n.el.offsetWidth):(n.width||n.el.offsetWidth);
 const width=Math.max(min,Math.min(max,current+direction*40));
 if(width===current)return;
 history();
 n.el.style.width=width+"px";
 if(n.type==="map")n.mapWidth=width;
 else n.width=width;
 layoutCards();
 const mode=state.spaceFocusStep===2&&n.type!=="map"?"readable":"fit";
 if(widthShortcutFrame)cancelAnimationFrame(widthShortcutFrame);
 widthShortcutFrame=requestAnimationFrame(()=>{
  widthShortcutFrame=0;
  if(state.selected===n)focusSelected(mode,{preserveSize:true});
 });
 save();
}

window.addEventListener("keydown",e=>{
 if(e.key==='Escape')hideTextHighlighter();
 if(!helpBackdrop.hidden){
   e.stopImmediatePropagation();
   if(e.key==="Escape"){e.preventDefault();closeHelp()}
   return;
 }
 if(e.key==="Escape"&&!globalSettings.hidden){
  e.preventDefault();closeGlobalSettings();return;
 }
 const mod=e.ctrlKey||e.metaKey;
 if(mod&&!e.shiftKey&&e.key.toLowerCase()==='f'&&!editor.classList.contains('open')){
  e.preventDefault();setIndexOpen(true);$("#canvasSearch").focus();$("#canvasSearch").select();return;
 }
 const editing=document.activeElement===source ||
   document.activeElement?.tagName==="INPUT" ||
   document.activeElement?.tagName==="TEXTAREA" ||
   document.activeElement?.tagName==="SELECT";
 const customSelectFocused=document.activeElement?.closest?.(".custom-select-trigger,.custom-select-menu");

 showControls();

 /*
  * SPACE
  * - selected card -> focus it
  * - no selected card -> center the canvas
  * - canvas panning is available with middle or right mouse button
  */
 if(e.code==="Space"&&!editing&&!customSelectFocused){
   e.preventDefault();
   if(e.repeat)return;
   if(state.selected){
     // A Markmap's Space action is always one predictable fit-and-center.
     // Markdown retains its fit/readable two-step cycle.
     focusSelected(state.selected.type==="map"?"fit":state.spaceFocusStep===1?"readable":"fit",{readingSession:true});
   }else $("#center").click();
   return;
 }

 if(editing){
   if(mod&&e.key==="Enter"){
     e.preventDefault();
     applyEditor(state.editorMode);
     return;
   }
   if(e.key==="Escape"){
     e.preventDefault();
     closeEditor();
   }
   return;
 }
 if(customSelectFocused)return;

 /*
  * TOOLBAR AND ZOOM SHORTCUTS
  * These mirror the visible buttons without interfering with card text input.
 */
 const key=e.key.toLowerCase();
 if(mod&&e.shiftKey&&!e.altKey&&key==='h'){
  e.preventDefault();if(!e.repeat)showTextHighlighter();return;
 }
 if(key==="backspace"&&!mod&&!e.altKey&&!e.shiftKey&&!document.activeElement?.isContentEditable&&document.activeElement?.tagName!=="SELECT"){
  if(clearSelectedTextHighlight())e.preventDefault();
  return;
 }
 if(key==="p"&&!mod&&!e.altKey&&!document.activeElement?.isContentEditable&&document.activeElement?.tagName!=="SELECT"){
  const pauseButton=$("#pauseBackground");
  if(pauseButton&&!pauseButton.disabled){
   e.preventDefault();if(!e.repeat)pauseButton.click();
  }
  return;
 }
 if(key==="tab"&&!mod&&!e.altKey&&!e.shiftKey&&!document.activeElement?.isContentEditable){
  e.preventDefault();
  if(!e.repeat){
   const open=$("#cardIndex").hidden;setIndexOpen(open);
   if(open)($("#indexEntries [aria-current='true']")||$("#indexEntries button")||$("#closeIndex")).focus({preventScroll:true});
   else $("#toggleIndex").focus();
  }
  return;
 }
 if(/^[0-9]$/.test(key)&&!mod&&!e.altKey&&!e.shiftKey&&state.selected){
   const sizeSelect=state.selected.el.querySelector("[data-size]");
   const active=document.activeElement;
   const focusedControl=active?.matches?.("input,textarea,select,[contenteditable='true']");
   const sizeIndex=key==="0"?9:Number(key)-1;
   const option=sizeSelect?.options[sizeIndex];
   if(option&&(!focusedControl||active===sizeSelect)){
     e.preventDefault();
     if(sizeSelect.value!==option.value){
       sizeSelect.value=option.value;
       sizeSelect.dispatchEvent(new Event("change",{bubbles:true}));
     }
     return;
   }
 }
 if(!mod&&!e.altKey&&e.shiftKey&&key==="c"){
   e.preventDefault();cycleCardTheme();return;
 }
 if(!mod&&!e.altKey&&!e.shiftKey&&(key==="n"||key==="k"||key==="m"||key==="o")){
   e.preventDefault();
   if(key==="n")$("#new").click();
   else if(key==="k"&&state.selected){
     setCardType(state.selected,state.selected.type==="map"?"note":"map");
   }else if(key==="m"&&state.selected)openMapTab(state.selected);
   else if(key==="o"&&state.selected)openCardTab(state.selected);
   return;
 }
 if(!mod&&!e.altKey){
   const actions={
     h:()=>$("#hand").click(),
     e:()=>state.selected&&editNote(state.selected),
     c:()=>$("#center").click(),
     a:()=>$("#arrange").click(),
     b:()=>toggleToolbar(),
     f:()=>$("#full").click(),
     t:()=>$("#theme").click(),
     s:()=>cycleBackground(),
     "-":()=>$("#minus").click(),
     "=":()=>$("#plus").click(),
     "[":()=>resizeSelectedWidth(-1),
     "]":()=>resizeSelectedWidth(1)
   };
   if(actions[key]){
     e.preventDefault();
     actions[key]();
     return;
   }
 }
 if(key==="v"&&!mod&&!e.altKey){
   e.preventDefault();
   cycleFont(e.shiftKey?-1:1);
   return;
 }

 if(mod&&e.key==="ArrowLeft"){
   e.preventDefault();
   state.targetX+=innerWidth*.72;
   animate();
   return;
 }
 if(mod&&e.key==="ArrowRight"){
   e.preventDefault();
   state.targetX-=innerWidth*.72;
   animate();
   return;
 }

 /*
  * CARD NAVIGATION
  *
  * Arrow Left:
  *   previous card
  *
  * Arrow Right:
  *   next card
  *
  * PageUp/PageDown:
  *   scroll one page without changing the selected card
  *
  * Home/End:
  *   first / last card
  *
  * Arrow Up/Down:
  *   page-style canvas movement without changing card selection.
  */
 if(e.key==="PageUp"||e.key==="PageDown"){
   if(mod||e.altKey||e.shiftKey||e.target.closest?.('#indexEntries,.custom-select-menu,.help'))return;
   e.preventDefault();
   const direction=e.key==="PageDown"?1:-1;
   const body=e.target.closest?.('.cardbody')||state.selected?.el.querySelector('.cardbody');
   if(body&&body.scrollHeight>body.clientHeight+1){
    body.scrollBy({top:direction*body.clientHeight*.9,behavior:'auto'});
   }else{
    state.targetY-=direction*innerHeight*.9;animate();
   }
   return;
 }
 if(e.key==="ArrowRight"&&!mod){
   e.preventDefault();
   cycleSelected(1);
   return;
 }
 if(e.key==="ArrowLeft"&&!mod){
   e.preventDefault();
   cycleSelected(-1);
   return;
 }
 if(e.key==="ArrowUp"||e.key==="ArrowDown"){
   e.preventDefault();
   const distance=innerHeight*.36;
   if(e.key==="ArrowUp")state.targetY+=distance;
   else state.targetY-=distance;
   animate();
   return;
 }

 if(e.key==="Home"){
   e.preventDefault();
   if(state.notes.length){
     select(state.notes[0]);
     focusSelected();
   }else{
     fit();
   }
   return;
 }
 if(e.key==="End"){
   e.preventDefault();
   if(state.notes.length){
     select(state.notes[state.notes.length-1]);
     focusSelected();
   }else{
     fit();
   }
   return;
 }

 /* Canvas/file/edit shortcuts */
 if(mod&&e.key.toLowerCase()==="s"){
   e.preventDefault();
   downloadCanvas();
   return;
 }
 if(mod&&e.key.toLowerCase()==="o"){
   e.preventDefault();
   if(canvasFiles)canvasFiles.toggleOpenMenu();else $("#canvasFile").click();
   return;
 }
 if(mod&&e.key==="Enter"){
   e.preventDefault();
   quickPaste();
   return;
 }
 if(mod&&e.key.toLowerCase()==="z"){
   e.preventDefault();
   e.shiftKey?redo():undo();
   return;
 }
 if(mod&&e.key.toLowerCase()==="y"){
   e.preventDefault();
   redo();
   return;
 }
 if(mod&&e.key.toLowerCase()==="d"){
   e.preventDefault();
   duplicate();
   return;
 }
 if(mod&&e.shiftKey&&e.key.toLowerCase()==="f"){
   e.preventDefault();
   toggleFull();
   return;
 }

 if(e.key==="Delete"&&state.selected){
   e.preventDefault();
   deleteNote(state.selected);
   return;
 }

 if(e.key==="Escape"){
   if(editor.classList.contains("open"))closeEditor();
   else{context.classList.remove("open");toggleBackgroundMenu(false)}
   return;
 }

});
function load(){
 try{
  const d=JSON.parse(localStorage.getItem("reflatex")||"null");
  if(d){
   state.x=Number.isFinite(d.x)?d.x:innerWidth/2;
   state.y=Number.isFinite(d.y)?d.y:innerHeight/2;
   state.scale=clampScale(Number.isFinite(d.scale)?d.scale:1);
   state.nextId=d.nextId??1;
   state.layoutMode=d.layoutMode==='reading'?'reading':'compact';state.overviewActive=d.overviewActive===true;
   (d.notes||[]).forEach(n=>{
    if(typeof n.md!=="string")return;
    n.type==="map"
      ? makeMap(n.md,n.x||0,n.y||0,n.w||960,n.h||640,false,n.id,n.mapColor,n.mapFont,n.size,n.highlights,n.sourceName)
      : makeNote(n.md,n.x||0,n.y||0,n.w||600,false,n.id,typeof n.font==="string"?n.font:"mono",n.size,n.mapColor,n.mapFont,n.mapWidth,n.mapHeight,n.highlights,n.sourceName);
   })
   restoreReadingSession(d.readingCards);
  }
 }catch{}
 const dark=localStorage.getItem("reflatex-theme")==="dark";
 if(dark)document.body.classList.add("dark");
 updateThemeIcon();
 setBackground(localStorage.getItem("reflatex-background")||"light");
 toggleToolbar(localStorage.getItem("reflatex-toolbar-hidden")!=="1");
 state.hand=false;updateHandUI();
 sync();apply();empty();world.style.willChange=state.overviewActive?'transform':'';
}
let resizeFrame=0;
window.addEventListener("resize",()=>{
 if(resizeFrame)return;
 resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;apply()});
});
window.addEventListener("pagehide",flushSave);
window.addEventListener('beforeunload',event=>{
 if(!hasUnsavedCanvasWork())return;
 flushSave();event.preventDefault();event.returnValue='You have unsaved changes.';
});
try{
 load();
 try{savedCanvasContent=localStorage.getItem('reflatex-saved-content')||canvasContentSignature({notes:[],readingCards:[]})}catch{savedCanvasContent=canvasContentSignature({notes:[],readingCards:[]})}
 if(window.createCanvasFileManager)canvasFiles=window.createCanvasFileManager({openFile:openCanvasFile,newCanvas:newBlankCanvas});
 document.addEventListener('conceptcards-open-native',event=>{
  if(canvasFiles)canvasFiles.importFile(event.detail.file,event.detail.handle);
 });
}catch(err){
 showRuntimeError(err?.message||"Refresh the page and try again.");
}
})();
