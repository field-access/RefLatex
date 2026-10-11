(() => {
"use strict";

const $=s=>document.querySelector(s);
const canvas=$("#canvas"),world=$("#world"),editor=$("#editor"),source=$("#source"),context=$("#context");
const MIN_SCALE=.01;
const MAX_SCALE=4;
if(window.marked?.setOptions) marked.setOptions({gfm:true,breaks:true});

const state={
 x:innerWidth/2,y:innerHeight/2,scale:1,
 targetX:innerWidth/2,targetY:innerHeight/2,targetScale:1,
 notes:[],selected:null,nextId:1,
 hand:true,controlsVisible:true,pan:null,rightPan:null,resize:null,editId:null,editorMode:"note",
 spaceFocusStep:0,
 undo:[],redo:[],historyLock:false,raf:0,saveTimer:0,hideTimer:0,
};
const MAP_COLORS=["default","purple","warm","ocean","forest","sunset","slate"];
function randomCardTheme(){return MAP_COLORS[1+Math.floor(Math.random()*(MAP_COLORS.length-1))]}
const ICONS={
 zoom:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.4 15.4 5 5M8.3 10.8h5M10.8 8.3v5"/></svg>',
 pan:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l-3 3"/></svg>',
 plus:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
 center:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
 arrange:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
 background:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.25 4.75L18 8l-4.75 1.25L12 14l-1.25-4.75L6 8l4.75-1.25L12 2Z"/><path d="m19 14 .75 2.25L22 17l-2.25.75L19 20l-.75-2.25L16 17l2.25-.75L19 14ZM5 14l.7 2.3L8 17l-2.3.7L5 20l-.7-2.3L2 17l2.3-.7L5 14Z"/></svg>',
 moon:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.4 15.1A8.7 8.7 0 0 1 8.9 3.6 8.8 8.8 0 1 0 20.4 15.1Z"/></svg>',
 sun:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
 save:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/></svg>',
 open:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5h6l2 2H20v10H4z"/><path d="M12 15V4m-4 4 4-4 4 4"/></svg>',
 fullscreen:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/></svg>',
 close:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>',
 minus:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
 mapOpen:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="2"/><circle cx="13" cy="6" r="2"/><circle cx="13" cy="18" r="2"/><path d="M8 11l3-4M8 13l3 4M15 6h5v5m0-5-6 6"/></svg>',
 cardOpen:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="14" height="16" rx="2"/><path d="M8 8h5M8 12h5M14 3h6v6m0-6-8 8"/></svg>',
 edit:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5 4 16.5Z"/><path d="m13.8 6.7 3.5 3.5M4 21h16"/></svg>',
 duplicate:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/></svg>',
 copy:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/></svg>',
 delete:'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>'
};
function setButtonIcon(button,name,label){
 if(!button)return;
 button.innerHTML=ICONS[name];
 if(label){button.title=label;button.setAttribute("aria-label",label)}
}
function setCardActionIcons(el,type){
 const mapOpen=el.querySelector("[data-map-open]");
 setButtonIcon(mapOpen,"mapOpen","Open Markmap in new window (M)");
 mapOpen?.classList.remove("map-only");
 setButtonIcon(el.querySelector("[data-card-open]"),"cardOpen","Open card in new window (O)");
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
  ["mono","Mono"],["mono-code","JetBrains Mono"],["mono-typewriter","Space Mono"],["mono-fira","Fira Code"],["mono-courier","Courier Prime"],
  ["mono-dm","DM Mono"],["mono-azeret","Azeret Mono"],["mono-victor","Victor Mono"]
 ]],
 ["Sans serif",[
  ["sans","System Sans"],["dm-sans","DM Sans"],["poppins","Poppins"],["raleway","Raleway"],
  ["josefin-sans","Josefin Sans"],["nunito","Nunito"],["quicksand","Quicksand"],["league-spartan","League Spartan"]
 ]],
 ["Serif",[
  ["slab","Roboto Slab"],["editorial-serif","Editorial Serif"],["lora","Lora"],
  ["alegreya","Alegreya"],["cormorant","Cormorant Garamond"],["fraunces","Fraunces"],
  ["bodoni","Bodoni Moda"]
 ]],
 ["Rounded",[["comfortaa","Comfortaa"],["fredoka","Fredoka"],["varela-round","Varela Round"]]],
 ["Display",[
  ["bebas-neue","Bebas Neue"],["cinzel","Cinzel"]
 ]],
 ["Handwritten",[
  ["comic-neue","Comic Neue"],["coming-soon","Coming Soon"],["itim","Itim"],
  ["hand-kalam","Kalam"],["hand-patrick","Patrick Hand"],["dancing-script","Dancing Script"],
  ["sacramento","Sacramento"],["satisfy","Satisfy"],["marck-script","Marck Script"]
 ]]
];
const CARD_FONTS=CARD_FONT_GROUPS.flatMap(([,fonts])=>fonts);
const MAP_FONTS=CARD_FONTS.map(([value])=>value);
function randomCardFont(){return CARD_FONTS[Math.floor(Math.random()*CARD_FONTS.length)][0]}
const LEGACY_CARD_FONTS={
 hand:"hand-patrick",caveat:"hand-patrick","hand-caveat":"hand-patrick","hand-script":"dancing-script",
 "hand-soft":"hand-patrick","hand-bold":"hand-kalam","hand-marker":"hand-kalam",
 "mono-terminal":"mono-typewriter","mono-inconsolata":"mono-fira","mono-roboto":"mono-code","mono-source":"mono-code","mono-ubuntu":"mono-typewriter",
 serif:"lora",editorial:"editorial-serif",humanist:"nunito",maiandra:"josefin-sans",inter:"dm-sans",
 "nunito-sans":"nunito",manrope:"dm-sans","space-grotesk":"league-spartan",outfit:"poppins",rubik:"dm-sans",archivo:"dm-sans",rounded:"quicksand",
 montserrat:"dm-sans",playfair:"fraunces",merriweather:"lora",
 oswald:"league-spartan","dm-serif-display":"fraunces",anton:"bebas-neue",shrikhand:"bebas-neue","abril-fatface":"cinzel"
};

const GOOGLE_FONT_SPECS={
 "mono-code":["JetBrains+Mono","wght@400;500;600"],"mono-typewriter":["Space+Mono","wght@400;700"],
 "mono-fira":["Fira+Code","wght@400;500;600"],"mono-courier":["Courier+Prime","wght@400;700"],
 "mono-dm":["DM+Mono","wght@400;500"],"mono-azeret":["Azeret+Mono","wght@400;500;600"],"mono-victor":["Victor+Mono","wght@400;500;600"],
 "dm-sans":["DM+Sans","wght@400;500;600;700"],poppins:["Poppins","wght@400;500;600;700"],
 raleway:["Raleway","wght@400;500;600;700"],"josefin-sans":["Josefin+Sans","wght@400;500;600;700"],nunito:["Nunito","wght@400;500;600;700"],
 quicksand:["Quicksand","wght@400;500;600;700"],"league-spartan":["League+Spartan","wght@400;500;600;700"],
 slab:["Roboto+Slab","wght@400;500;600;700"],lora:["Lora","wght@400;500;600;700"],
 alegreya:["Alegreya","wght@400;500;600;700"],cormorant:["Cormorant+Garamond","wght@400;500;600;700"],
 fraunces:["Fraunces","wght@400;500;600;700"],bodoni:["Bodoni+Moda","wght@400;500;600;700"],
 comfortaa:["Comfortaa","wght@400;500;600;700"],fredoka:["Fredoka","wght@400;500;600;700"],"varela-round":["Varela+Round","wght@400"],
 "bebas-neue":["Bebas+Neue","wght@400"],cinzel:["Cinzel","wght@400;500;600;700"],
 "comic-neue":["Comic+Neue","wght@400;700"],"coming-soon":["Coming+Soon","wght@400"],itim:["Itim","wght@400"],
 "hand-kalam":["Kalam","wght@300;400;700"],"hand-patrick":["Patrick+Hand","wght@400"],"dancing-script":["Dancing+Script","wght@400;500;600;700"],
 sacramento:["Sacramento","wght@400"],satisfy:["Satisfy","wght@400"],"marck-script":["Marck+Script","wght@400"]
};
function googleFontStylesheetUrl(font){
 const key=normalizeCardFont(font),spec=GOOGLE_FONT_SPECS[key];
 return spec?`https://fonts.googleapis.com/css2?family=${spec[0]}:${spec[1]}&display=swap`:"";
}
function ensureFontLoaded(font){
 const key=normalizeCardFont(font),href=googleFontStylesheetUrl(key);
 if(!href||document.getElementById(`card-font-${key}`))return;
 const link=document.createElement("link");
 link.id=`card-font-${key}`;link.rel="stylesheet";link.dataset.cardFont=key;link.href=href;
 document.head.appendChild(link);
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
  "mono-code":'"JetBrains Mono","Cascadia Code","Fira Code",Consolas,ui-monospace,monospace',"mono-typewriter":'"Space Mono","Courier New",Courier,monospace',"mono-fira":'"Fira Code",ui-monospace,monospace',"mono-courier":'"Courier Prime","Courier New",Courier,monospace',
  "mono-dm":'"DM Mono",ui-monospace,monospace',"mono-azeret":'"Azeret Mono",ui-monospace,monospace',"mono-victor":'"Victor Mono",ui-monospace,monospace',
  sans:'ui-sans-serif,system-ui,sans-serif',"dm-sans":'"DM Sans",ui-sans-serif,system-ui,sans-serif',poppins:'"Poppins",ui-sans-serif,system-ui,sans-serif',
  comfortaa:'"Comfortaa",ui-sans-serif,system-ui,sans-serif',fredoka:'"Fredoka",ui-sans-serif,system-ui,sans-serif',"varela-round":'"Varela Round",ui-sans-serif,system-ui,sans-serif',
  raleway:'"Raleway",ui-sans-serif,system-ui,sans-serif',"josefin-sans":'"Josefin Sans",ui-sans-serif,system-ui,sans-serif',
  nunito:'"Nunito",ui-sans-serif,system-ui,sans-serif',quicksand:'"Quicksand",ui-sans-serif,system-ui,sans-serif',"league-spartan":'"League Spartan",ui-sans-serif,system-ui,sans-serif',
  slab:'"Roboto Slab",Georgia,serif',"editorial-serif":'Cambria,Georgia,"Times New Roman",serif',
  lora:'"Lora",Georgia,serif',alegreya:'"Alegreya",Georgia,serif',
  cormorant:'"Cormorant Garamond",Georgia,serif',fraunces:'"Fraunces",Georgia,serif',bodoni:'"Bodoni Moda",Georgia,serif',
  "bebas-neue":'"Bebas Neue",Impact,sans-serif',cinzel:'"Cinzel",Georgia,serif',
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
editor.querySelectorAll(".map-options select").forEach(enhanceCustomSelect);

function showControls(){
  document.body.classList.remove("controls-hidden");
  state.controlsVisible=true;
  clearTimeout(state.hideTimer);
  state.hideTimer=setTimeout(()=>{
    if(!editor.classList.contains("open") && !context.classList.contains("open")){
      document.body.classList.add("controls-hidden");
      state.controlsVisible=false;
    }
  },3200);
}
let lastPointerWake=0;
function wakeControls(){
 const now=performance.now();
 if(state.controlsVisible&&now-lastPointerWake<500)return;
 lastPointerWake=now;showControls();
}
document.querySelectorAll(".toolbar,.zoom,.editor").forEach(panel=>{
 panel.addEventListener("pointerenter",showControls);
 panel.addEventListener("focusin",showControls);
});
function safeMarkdown(md){
 let out;
 try{
   out=window.marked?marked.parse(md):`<p>${escapeHtml(md)}</p>`;
 }catch{out=`<p>${escapeHtml(md)}</p>`}
 try{if(window.DOMPurify)out=DOMPurify.sanitize(out)}catch{}
 return out;
}
function publicImageUrl(value){
 try{
  const url=new URL(value);
  return ["http:","https:"].includes(url.protocol)&&/\.(?:avif|bmp|gif|jpe?g|png|svg|webp)$/i.test(url.pathname)
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

function render(md){
  let text=normalizeEscapedLatex(String(md));
  const blockCodes=[];
  const inlineCodes=[];
  const math=[];

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
      blockCodes.push({code,language,math:looksLikeMathBlock(code)});
      return `${lead}@@REFLATEX_BLOCK_${id}@@`;
    }
  );

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
      return `${lead}@@REFLATEX_BLOCK_${id}@@`;
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

    if(item.math){
      const mathSource=renderMathBlockSource(item.code);
      out=out.replace(
        `<p>${token}</p>`,
        `<div class="ref-math-block">${mathSource}</div>`
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
      out=out.replace(`<p>${token}</p>`,codeHtml);
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

  const box=document.createElement("div");
  box.innerHTML=out;

  box.querySelectorAll("pre.line-numbered").forEach(pre=>{
    const code=pre.querySelector("code");
    if(!code)return;
    if(window.hljs){
      const languageClass=[...code.classList].find(name=>name.startsWith("language-"));
      const language=languageClass?.slice("language-".length);
      if(language&&!hljs.getLanguage(language))code.classList.remove(languageClass);
      try{hljs.highlightElement(code)}catch{}
    }
    const gutter=document.createElement("span");
    gutter.className="code-gutter";
    gutter.setAttribute("aria-hidden","true");
    const lineCount=Math.max(1,Number(pre.dataset.lineCount)||1);
    for(let line=1;line<=lineCount;line++){
      const number=document.createElement("span");
      number.textContent=String(line);
      gutter.appendChild(number);
    }
    pre.insertBefore(gutter,code);
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

  return box.innerHTML;
}
function cardMarkdownParts(md){
 const source=String(md).replace(/^\uFEFF/,"");
 const match=/^(?:[ \t]*\r?\n)*[ \t]*#\s+([^\r\n]+?)[ \t]*#*[ \t]*(?:\r?\n|$)/.exec(source);
 return match
  ? {title:match[1].trim(),body:source.slice(match[0].length)}
  : {title:"",body:source};
}
function updateCardHeading(n){
 const title=n.el?.querySelector(".map-title");
 if(!title)return;
 const heading=cardMarkdownParts(n.md).title;
 if(heading){
  const parsed=document.createElement("div");
  parsed.innerHTML=render(`# ${heading}`);
  title.innerHTML=parsed.querySelector("h1")?.innerHTML||escapeHtml(heading);
 }else title.textContent="";
 n.el.classList.toggle("has-title",Boolean(heading));
}
function renderCardMarkdown(md){
 return render(cardMarkdownParts(md).body);
}
function markmapOptions(n){
 const colors=MAP_PALETTES[n.mapColor]||MAP_PALETTES.default;
 const depth=node=>node.state?.depth||0;
 const branchFilter=`markmap-branch-${String(n.id).replace(/[^a-zA-Z0-9_-]/g,"-")}`;
 return {
  color:node=>colors[depth(node)%colors.length],
  // Give the main limbs more weight, then let child branches taper naturally.
  lineWidth:node=>depth(node)===1?3.6:depth(node)===2?2.25:1.55,
  // A tiny displacement adds a hand-drawn quality to Markmap's existing curves.
  // Keep it scoped to the branch paths so labels stay crisp and readable.
  style:id=>`#${id} .markmap-link{filter:url(#${branchFilter});stroke-linecap:round;stroke-linejoin:round}`,
  duration:350,maxWidth:300,spacingVertical:15,spacingHorizontal:82
 };
}
function mapViewportSize(){
 return {
  // Map dimensions describe the card itself, not canvas world units at the
  // current camera zoom. Keeping them viewport-based prevents huge cards when
  // the canvas happens to be zoomed far out.
  width:Math.max(Math.min(520,Math.max(300,innerWidth-24)),Math.min(1600,Math.floor(innerWidth-80))),
  height:Math.max(320,Math.min(1600,Math.round(innerHeight*.94)))
 };
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
  const filterId=`markmap-branch-${String(n.id).replace(/[^a-zA-Z0-9_-]/g,"-")}`;
  const defs=document.createElementNS("http://www.w3.org/2000/svg","defs");
  const filter=document.createElementNS("http://www.w3.org/2000/svg","filter");
  filter.setAttribute("id",filterId);
  filter.setAttribute("x","-4%");filter.setAttribute("y","-10%");
  filter.setAttribute("width","108%");filter.setAttribute("height","120%");
  filter.setAttribute("color-interpolation-filters","sRGB");
  const turbulence=document.createElementNS("http://www.w3.org/2000/svg","feTurbulence");
  turbulence.setAttribute("type","fractalNoise");turbulence.setAttribute("baseFrequency",".018 .035");
  turbulence.setAttribute("numOctaves","1");turbulence.setAttribute("seed","7");turbulence.setAttribute("result","branchNoise");
  const displacement=document.createElementNS("http://www.w3.org/2000/svg","feDisplacementMap");
  displacement.setAttribute("in","SourceGraphic");displacement.setAttribute("in2","branchNoise");
  displacement.setAttribute("scale","1.1");displacement.setAttribute("xChannelSelector","R");displacement.setAttribute("yChannelSelector","G");
  filter.append(turbulence,displacement);defs.appendChild(filter);svg.appendChild(defs);
  pane.appendChild(svg);
  const options=markmapOptions(n);
  options.initialExpandLevel=6;
  const map=window.markmap.Markmap.create(svg,options);
  n.mapInstance=map;
  await map.setData(root);
  if(n.mapRenderId!==renderId||n.type!=="map")return;
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
 const view=n.el.querySelector("[data-view]");
 if(view){view.value=type;syncCardSelect(view)}
 const body=n.el.querySelector(".cardbody");
 if(type==="map"){
  n.mapReady=renderMap(n);
 }else{
  body.innerHTML=renderCardMarkdown(n.md);
  widenCardForTables(n.el);
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
 if(!Number.isFinite(state.x)||!Number.isFinite(state.y)||!Number.isFinite(state.scale)){
  state.x=innerWidth/2;state.y=innerHeight/2;state.scale=1;
  state.targetX=state.x;state.targetY=state.y;state.targetScale=state.scale;
 }
 world.style.transform=`translate(${state.x}px,${state.y}px) scale(${state.scale})`;
 $("#zoomLabel").textContent=Math.round(state.scale*100)+"%";
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

function zoomPrecise(f,cx=innerWidth/2,cy=innerHeight/2){
 if(!Number.isFinite(f)||!Number.isFinite(state.scale)||state.scale<=0){
  setCameraImmediate(innerWidth/2,innerHeight/2,1);
  return;
 }
 const wx=(cx-state.targetX)/state.targetScale;
 const wy=(cy-state.targetY)/state.targetScale;
 const ns=clampScale(state.targetScale*f);
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
function markCameraMoving(){
 document.body.classList.add("camera-moving");
 clearTimeout(motionHintTimer);
 motionHintTimer=setTimeout(()=>{
  motionHintTimer=0;
  if(!state.raf)document.body.classList.remove("camera-moving");
 },120);
}
function finishCameraMotion(){
 if(state.raf)return;
 clearTimeout(motionHintTimer);motionHintTimer=0;
 document.body.classList.remove("camera-moving");
}
function animate(){
 document.body.classList.add("camera-moving");
 clearTimeout(motionHintTimer);motionHintTimer=0;
 if(state.raf)return;
 let lastFrame=0;
 const tick=()=>{
  const now=performance.now();
  const elapsed=lastFrame?Math.min(50,now-lastFrame):1000/60;
  lastFrame=now;
  const response=1-Math.exp(-elapsed/32);
  state.x+=(state.targetX-state.x)*response;
  state.y+=(state.targetY-state.y)*response;
  state.scale+=(state.targetScale-state.scale)*response;
  apply();
  if(Math.abs(state.x-state.targetX)<.08&&Math.abs(state.y-state.targetY)<.08&&Math.abs(state.scale-state.targetScale)<.0005){
   state.x=state.targetX;state.y=state.targetY;state.scale=state.targetScale;apply();state.raf=0;finishCameraMotion();return;
  }
  state.raf=requestAnimationFrame(tick);
 };
 state.raf=requestAnimationFrame(tick);
}
function moveTo(x,y,s=state.targetScale){
 if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(s))return;
 state.targetX=x;state.targetY=y;state.targetScale=clampScale(s);animate()
}
function zoom(f,cx=innerWidth/2,cy=innerHeight/2){
 zoomPrecise(f,cx,cy);
 clearTimeout(state.saveTimer);state.saveTimer=setTimeout(save,180);
}
function snapshot(){return JSON.stringify({x:state.x,y:state.y,scale:state.scale,nextId:state.nextId,notes:state.notes.map(n=>({id:n.id,md:n.md,x:n.x,y:n.y,w:n.type==="map"?(n.mapWidth||n.width||n.el.offsetWidth):(n.width||n.el.offsetWidth),h:n.mapHeight,mapWidth:n.mapWidth,mapHeight:n.mapHeight,font:n.font||"mono",size:n.size||"100",type:n.type||"note",mapColor:n.mapColor||"default",mapFont:n.mapFont||"modern"}))})}
function history(){
 if(state.historyLock)return;
 const s=snapshot();
 if(state.undo.at(-1)!==s){state.undo.push(s);if(state.undo.length>80)state.undo.shift();state.redo=[]}
}
function restore(s){
 const d=JSON.parse(s);state.historyLock=true;
 state.notes.forEach(n=>n.el.remove());state.notes=[];state.selected=null;
 (d.notes||[]).forEach(n=>n.type==="map"
  ? makeMap(n.md,n.x,n.y,n.w,n.h,false,n.id,n.mapColor,n.mapFont)
  : makeNote(n.md,n.x,n.y,n.w,false,n.id,n.font,n.size,n.mapColor,n.mapFont,n.mapWidth,n.mapHeight));
 state.x=Number.isFinite(d.x)?d.x:innerWidth/2;
 state.y=Number.isFinite(d.y)?d.y:innerHeight/2;
 state.scale=clampScale(Number.isFinite(d.scale)?d.scale:1);
 state.nextId=d.nextId||state.nextId;sync();apply();
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
function empty(){$("#empty").style.display=state.notes.length?"none":"grid"}

function widenCardForTables(el){
 const tables=[...el.querySelectorAll(".cardbody table")];
 if(!tables.length)return;

 const body=el.querySelector(".cardbody");
 const styles=getComputedStyle(body);
 const horizontalPadding=parseFloat(styles.paddingLeft)+parseFloat(styles.paddingRight);
 let requiredWidth=el.offsetWidth;

 tables.forEach(table=>{
  const width=table.style.width;
  const maxWidth=table.style.maxWidth;
  table.style.width="max-content";
  table.style.maxWidth="none";
  requiredWidth=Math.max(requiredWidth,table.scrollWidth+horizontalPadding+2);
  table.style.width=width;
  table.style.maxWidth=maxWidth;
 });

 const width=Math.max(el.offsetWidth,Math.min(1200,requiredWidth));
 el.style.width=width+"px";
 const note=state.notes.find(item=>item.el===el);
 if(note)note.width=width;
}

function select(n){
 if(state.selected===n&&(!n||n.el.classList.contains("selected")))return;
 if(state.selected!==n)state.spaceFocusStep=0;
 state.notes.forEach(x=>x.el.classList.remove("selected"));
 state.selected=n;if(n)n.el.classList.add("selected");
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
   size:n.size||"100",
   mapColor:n.mapColor||"default",
   mapFont:n.mapFont||"modern"
  }))
 };
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
 setTimeout(()=>URL.revokeObjectURL(url),1000);

 $("#hint").textContent="Canvas saved";
 setTimeout(()=>$("#hint").textContent="",1800);
}

function openCanvasFile(file){
 if(!file)return;

 const reader=new FileReader();

 reader.onload=()=>{
  try{
   const data=JSON.parse(reader.result);

   if(!data || !Array.isArray(data.notes)){
    throw new Error("Invalid ConceptCards canvas file");
   }

   state.historyLock=true;
   state.notes.forEach(n=>n.el.remove());
   state.notes=[];
   state.selected=null;

   data.notes.forEach(n=>{
    if(typeof n.markdown!=="string")return;
    const x=Number.isFinite(n.x)?n.x:0,y=Number.isFinite(n.y)?n.y:0;
    const width=Number.isFinite(n.width)?n.width:600,id=Number.isFinite(n.id)?n.id:null;
    n.type==="map"
      ? makeMap(n.markdown,x,y,width,Number.isFinite(n.height)?n.height:640,false,id,n.mapColor,n.mapFont)
      : makeNote(n.markdown,x,y,width,false,id,typeof n.font==="string"?n.font:"mono",n.size,n.mapColor,n.mapFont,n.mapWidth,n.mapHeight);
   });

   state.nextId=Number.isFinite(data.nextId)
    ? data.nextId
    : Math.max(0,...state.notes.map(n=>n.id||0))+1;

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
   empty();
   save();

   $("#hint").textContent=`Opened ${file.name}`;
   setTimeout(()=>$("#hint").textContent="",2200);

  }catch(err){
   state.historyLock=false;
   alert("Could not open this canvas file.\\n\\n"+err.message);
  }
 };

 reader.onerror=()=>alert("Could not read the selected canvas file.");
 reader.readAsText(file);
}

function makeNote(md,x,y,w=600,record=true,id=null,font=randomCardFont(),size="100",mapColor=randomCardTheme(),mapFont="modern",mapWidth=null,mapHeight=null){
 if(record)history();
 const minWidth=Math.min(520,Math.max(300,innerWidth-24));
 const width=Math.max(minWidth,Math.min(1200,w||600));
const n={id:id??state.nextId++,md,x,y,font:normalizeCardFont(font),size,width,type:"note",mapColor:MAP_COLORS.includes(mapColor)?mapColor:"default",mapFont:normalizeCardFont(font),mapWidth:Number.isFinite(mapWidth)?Math.max(minWidth,Math.min(1600,mapWidth)):null,mapHeight:Number.isFinite(mapHeight)?Math.max(320,Math.min(1200,mapHeight)):null,el:null};
 state.nextId=Math.max(state.nextId,n.id+1);
 const el=document.createElement("article");
 el.className="card";el.style.left=x+"px";el.style.top=y+"px";el.style.width=width+"px";
 el.innerHTML=`<div class="cardbar"><div class="map-title"></div></div><div class="cardactions"><select data-view aria-label="Card view" title="Card view"><option value="note">Markdown</option><option value="map">Markmap</option></select><select data-map-color aria-label="Card color theme" title="Card color theme"><option value="default">Midnight</option><option value="purple">Amethyst</option><option value="warm">Terracotta</option><option value="ocean">Ocean</option><option value="forest">Forest</option><option value="sunset">Sunset</option><option value="slate">Slate</option></select><select data-font aria-label="Font" title="Font (V)"><option value="serif">Serif</option><option value="sans">Sans</option><option value="mono">Mono</option><option value="slab">Slab</option><option value="humanist">Humanist</option><option value="rounded">Rounded</option><option value="editorial">Editorial</option><option value="hand">Handwritten</option><option value="hand-soft">Hand Soft</option><option value="hand-bold">Hand Bold</option><option value="hand-marker">Hand Marker</option><option value="hand-script">Hand Script</option></select><select data-size aria-label="Card font size" title="Card font size"><option value="70">70%</option><option value="80">80%</option><option value="90">90%</option><option value="100">100%</option><option value="110">110%</option><option value="125">125%</option><option value="140">140%</option><option value="160">160%</option><option value="180">180%</option></select><button data-map-open class="map-only"></button><button data-card-open></button><button data-edit></button><button data-delete></button></div>
 <div class="resize left" data-side="left"></div><div class="resize right" data-side="right"></div><div class="resize bottom" data-side="bottom" title="Resize map height"></div>
 <div class="cardbody">${renderCardMarkdown(md)}</div>`;
 setCardActionIcons(el,"note");
 el.dataset.font=n.font;
 el.style.setProperty("--card-font-family",mapFontStack(n.font));
 el.dataset.mapColor=n.mapColor||"default";
 applyMapFont(n);
 el.querySelector("[data-map-color]").value=n.mapColor||"default";
 el.querySelector("[data-view]").value="note";
 populateCardFontSelect(el,font);
 el.dataset.fontSize=["70","80","90","100","110","125","140","160","180"].includes(String(size))?String(size):"100";
 el.querySelector("[data-size]").value=el.dataset.fontSize;
 n.el=el;applyCardFont(n,n.font);updateCardHeading(n);
 enhanceCardSelects(el);world.appendChild(el);state.notes.push(n);
 widenCardForTables(el);

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
 el.querySelector("[data-view]").onchange=e=>setCardType(n,e.target.value);
 el.querySelector("[data-map-color]").onchange=e=>{
  setCardColorTheme(n,e.target.value);
 };
 el.querySelector("[data-font]").onchange=e=>{
  history();applyCardFont(n,e.target.value);widenCardForTables(el);save();
 };
 el.querySelector("[data-font]").onfocus=()=>select(n);
 el.querySelector("[data-size]").onchange=e=>{
  history();n.size=e.target.value;el.dataset.fontSize=n.size;widenCardForTables(el);save();
 };
 el.querySelector("[data-size]").onfocus=()=>select(n);
 el.querySelectorAll(".resize").forEach(r=>r.onmousedown=e=>{
  if(e.button!==0)return;
  startResize(e,n,r.dataset.side);
 });
 empty();
 return n;
}
function makeMap(md,x,y,w=null,h=null,record=true,id=null,mapColor=randomCardTheme(),mapFont=randomCardFont()){
 if(record)history();
 const viewport=mapViewportSize();
 const width=Math.max(Math.min(520,Math.max(300,innerWidth-24)),Math.min(1600,w||viewport.width));
 const height=Math.max(320,h||viewport.height);
const n={id:id??state.nextId++,md,x,y,width,mapWidth:width,mapHeight:height,type:"map",mapColor:MAP_COLORS.includes(mapColor)?mapColor:"default",mapFont:normalizeCardFont(mapFont),font:normalizeCardFont(mapFont),size:"100",el:null,mapInstance:null};
 state.nextId=Math.max(state.nextId,n.id+1);
 const el=document.createElement("article");
 el.className="card map-card";el.style.left=x+"px";el.style.top=y+"px";el.style.width=width+"px";el.style.height=height+"px";
 el.dataset.mapColor=n.mapColor;
 applyMapFont(n);
 el.dataset.font=n.font;
 el.innerHTML=`<div class="cardbar"><div class="map-title"></div></div><div class="cardactions"><select data-view aria-label="Card view" title="Card view"><option value="note">Markdown</option><option value="map">Markmap</option></select><select data-map-color aria-label="Card color theme" title="Card color theme"><option value="default">Midnight</option><option value="purple">Amethyst</option><option value="warm">Terracotta</option><option value="ocean">Ocean</option><option value="forest">Forest</option><option value="sunset">Sunset</option><option value="slate">Slate</option></select><select data-font aria-label="Font" title="Font (V)"><option value="serif">Serif</option><option value="sans">Sans</option><option value="mono">Mono</option></select><select data-size aria-label="Card font size" title="Card font size (1–9)"><option value="70">70%</option><option value="80">80%</option><option value="90">90%</option><option value="100">100%</option><option value="110">110%</option><option value="125">125%</option><option value="140">140%</option><option value="160">160%</option><option value="180">180%</option></select><button data-map-open></button><button data-card-open></button><button data-edit></button><button data-delete></button></div><div class="resize left" data-side="left"></div><div class="resize right" data-side="right"></div><div class="resize bottom" data-side="bottom" title="Resize map height"></div><div class="cardbody"><div class="map-loading">Rendering mind map…</div></div>`;
 setCardActionIcons(el,"map");
 n.el=el;applyCardFont(n,n.font);updateCardHeading(n);world.appendChild(el);state.notes.push(n);
 el.querySelector("[data-view]").value="map";
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
 el.querySelector("[data-view]").onchange=e=>setCardType(n,e.target.value);
 el.querySelector("[data-map-color]").onchange=e=>{
  setCardColorTheme(n,e.target.value);
 };
 el.querySelector("[data-font]").onchange=e=>{history();applyCardFont(n,e.target.value);save()};
 el.querySelector("[data-size]").onchange=e=>{history();n.size=e.target.value;el.dataset.fontSize=n.size;el.querySelector(".cardbody").style.setProperty("--card-font-scale",String(Number(n.size)/100));save()};
 el.querySelectorAll(".resize").forEach(r=>r.onmousedown=e=>{if(e.button===0)startResize(e,n,r.dataset.side)});
 n.mapReady=renderMap(n);empty();return n;
}
let panApplyFrame=0;
window.addEventListener("mousemove",e=>{
 if(state.resize){
  const r=state.resize,dx=(e.clientX-r.sx)/state.scale;
  if(r.side==="bottom"){
   const h=Math.max(320,r.h+(e.clientY-r.sy)/state.scale);
   r.n.el.style.height=h+"px";
   r.n.mapHeight=h;
  }else{
   const minWidth=Math.min(520,Math.max(300,innerWidth-24));
   const w=Math.max(minWidth,Math.min(1600,r.w+(r.side==="right"?dx:-dx)));
   r.n.el.style.width=w+"px";
   if(r.n.type==="map")r.n.mapWidth=w;
   else r.n.width=w;
   if(r.side==="left"){r.n.x=r.x+r.w-w;r.n.el.style.left=r.n.x+"px"}
  }
  scheduleReflow();
 }
 if(state.pan){
  state.x=state.pan.x+e.clientX-state.pan.sx;state.y=state.pan.y+e.clientY-state.pan.sy;sync();
  if(!panApplyFrame)panApplyFrame=requestAnimationFrame(()=>{panApplyFrame=0;apply()});
 }
});
window.addEventListener("mouseup",()=>{
 const resized=state.resize;
 const panned=state.pan;
 if(state.resize?.n.type==="map")state.resize.n.mapInstance?.fit();
 if(panApplyFrame){cancelAnimationFrame(panApplyFrame);panApplyFrame=0;apply()}
 if(reflowFrame){cancelAnimationFrame(reflowFrame);reflowFrame=0}
 state.resize=null;state.pan=null;
 canvas.style.cursor=state.hand?"grab":"default";
 if(resized){layoutCards();flushSave()}
 else if(panned){flushSave();finishCameraMotion()}
});
function startResize(e,n,side){
 e.preventDefault();e.stopPropagation();select(n);history();
 state.resize={n,side,sx:e.clientX,sy:e.clientY,w:n.el.offsetWidth,h:n.el.offsetHeight,x:n.x};
 canvas.style.cursor=side==="bottom"?"ns-resize":"ew-resize";
}
function startPan(e){
 if(e.button!==1&&e.button!==2)return;
 e.preventDefault();
 e.stopPropagation();
 state.pan={sx:e.clientX,sy:e.clientY,x:state.x,y:state.y};
 document.body.classList.add("camera-moving");
 canvas.style.cursor="grabbing";
}
canvas.addEventListener("mousedown",startPan);
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
let wheelFrame=0;
let panWheelX=0,panWheelY=0;
let zoomWheelDelta=0;
let wheelPointerX=0,wheelPointerY=0;
let wheelIsPinch=false;

function wheelUnitDelta(e){
 const unit=e.deltaMode===1?16:e.deltaMode===2?innerHeight:1;
 return {x:e.deltaX*unit,y:e.deltaY*unit};
}

function scheduleWheelFrame(){
 if(wheelFrame)return;
 wheelFrame=requestAnimationFrame(()=>{
  wheelFrame=0;

  const dx=panWheelX,dy=panWheelY;
  const zd=zoomWheelDelta;
  const pinch=wheelIsPinch;

  panWheelX=panWheelY=zoomWheelDelta=0;
  wheelIsPinch=false;

  if(pinch||state.hand){
   if(Math.abs(zd)>0.001){
    // Increased gain: normal trackpad pinch/wheel now reaches a useful
    // zoom range in roughly the same physical gesture as PureRef.
    const factor=Math.exp(-Math.max(-1000,Math.min(1000,zd))*0.003);
    zoomPrecise(factor,wheelPointerX,wheelPointerY);
   }
  }else{
   // Wheel scrolling is already frame-batched, so applying it directly
   // avoids a second interpolation layer and removes noticeable lag.
   state.x-=dx;
   state.y-=dy;
   sync();
   markCameraMoving();
   apply();
  }
 });
}

canvas.addEventListener("wheel",e=>{
 if(e.target.closest?.(".map-pane"))return;
 e.preventDefault();

 const d=wheelUnitDelta(e);
 wheelPointerX=e.clientX;
 wheelPointerY=e.clientY;

 // Chrome/Edge precision touchpads expose two-finger pinch as ctrl+wheel.
 const pinch=e.ctrlKey&&e.deltaMode===0;

 if(pinch){
  wheelIsPinch=true;
  zoomWheelDelta+=d.y;
 }else if(state.hand){
  // Hand ON: wheel / two-finger movement = zoom.
  zoomWheelDelta+=d.y;
 }else{
  // Hand OFF: ordinary two-finger scrolling = true 2D canvas panning.
  let dx=d.x,dy=d.y;
  if(e.shiftKey&&Math.abs(dx)<Math.abs(dy)){
   dx+=dy;dy=0;
  }
  panWheelX+=dx;
  panWheelY+=dy;
 }

 scheduleWheelFrame();
},{passive:false});

function updateHandUI(){
 showControls();
 const button=$("#hand");
 button.classList.toggle("active",state.hand);
 button.innerHTML=state.hand?ICONS.zoom:ICONS.pan;
 button.title=state.hand?"Hand ON · trackpad zoom":"Hand OFF · trackpad pan";
 canvas.style.cursor=state.hand?"grab":"default";
}

const touches=new Map();let gesture=null;
canvas.addEventListener("pointerdown",e=>{
 if(e.pointerType!=="touch")return;
 touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(touches.size===1){let p=[...touches.values()][0];gesture={type:"pan",x:p.x,y:p.y,ox:state.x,oy:state.y}}
 if(touches.size===2){
  const[a,b]=[...touches.values()],cx=(a.x+b.x)/2,cy=(a.y+b.y)/2;
  gesture={type:"pinch",d:Math.hypot(a.x-b.x,a.y-b.y),s:state.scale,w:worldPoint(cx,cy)}
 }
});
canvas.addEventListener("pointermove",e=>{
 if(e.pointerType!=="touch"||!touches.has(e.pointerId))return;
 touches.set(e.pointerId,{x:e.clientX,y:e.clientY});
 if(touches.size===1&&gesture?.type==="pan"){
  const p=[...touches.values()][0];state.x=gesture.ox+p.x-gesture.x;state.y=gesture.oy+p.y-gesture.y;sync();markCameraMoving();apply();
 }
 if(touches.size===2&&gesture?.type==="pinch"){
  const[a,b]=[...touches.values()],cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,d=Math.hypot(a.x-b.x,a.y-b.y);
  const ns=Math.max(MIN_SCALE,Math.min(MAX_SCALE,gesture.s*d/gesture.d));
  const nx=cx-gesture.w.x*ns,ny=cy-gesture.w.y*ns;
  state.scale=ns;state.x=nx;state.y=ny;
  sync();markCameraMoving();apply();
 }
});
function touchEnd(e){
 if(e.pointerType!=="touch")return;touches.delete(e.pointerId);
 if(!touches.size){gesture=null;save();finishCameraMotion()}
}
canvas.addEventListener("pointerup",touchEnd);canvas.addEventListener("pointercancel",touchEnd);

function openEditor(mode="note",n=null){
 state.editId=n?.id??null;
 state.editorMode=mode;
 source.value=n?.md||"";
 $("#mapColor").value=n?.mapColor||randomCardTheme();
 $("#mapFont").value=normalizeCardFont(n?.font||n?.mapFont||"mono");
 syncCardSelect($("#mapColor"));
 syncCardSelect($("#mapFont"));
 $("#applyCard").textContent=n?"Update card":"Place card";
 $("#applyMap").textContent=n?"Update map":"Place map";
 editor.dataset.mode=mode;
 editor.classList.add("open");
 source.focus();
}
function editNote(n){
 openEditor(n.type==="map"?"map":"note",n);
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
  else n.el.querySelector(".cardbody").innerHTML=renderCardMarkdown(md);
  updateCardHeading(n);
  n.el.dataset.mapColor=n.mapColor;
  applyMapFont(n);
  if(type!=="map")widenCardForTables(n.el);
  select(n);
 }else{
  const p=worldPoint(innerWidth/2,innerHeight/2);
  const size=mapViewportSize();
  const n=type==="map"
   ? makeMap(md,p.x-size.width/2,p.y-size.height/2,size.width,size.height,true,null,$("#mapColor").value,randomCardFont())
   : makeNote(md,p.x-300,p.y-150,600,true,null,randomCardFont(),"100",$("#mapColor").value,$("#mapFont").value);
  select(n);inserted=true;
 }
 closeEditor();
 if(inserted)scheduleArrange();
 save()
}
function openMapTab(n){
  const payload=JSON.stringify(prepareMarkmapMarkdown(n.md)).replace(/</g,"\\u003c");
  const title=escapeHtml((n.md.match(/^#\s+(.+)$/m)||[])[1]||"ConceptCards mind map");
  const fontStack=mapFontStack(n.mapFont);
  const darkMode=document.body.classList.contains("dark");
  const theme=MAP_COLORS.includes(n.mapColor)?n.mapColor:"default";
  const surfaces=darkMode
   ?{default:"linear-gradient(135deg,#17181d,#242633)",purple:"linear-gradient(135deg,#1b1724,#30203b)",warm:"linear-gradient(135deg,#21191b,#422629)",ocean:"linear-gradient(135deg,#102126,#1c3940)",forest:"linear-gradient(135deg,#16231d,#2a3b2f)",sunset:"linear-gradient(135deg,#27191f,#462732)",slate:"linear-gradient(135deg,#1c222b,#303a49)"}
   :{default:"#fbfaff",purple:"#fcf9ff",warm:"#fffaf3",ocean:"#f1fbfa",forest:"#f4faf2",sunset:"#fff8f4",slate:"#f5f7f8"};
  const surface=surfaces[theme];
  const textColor=darkMode?"#e7eaf1":"#272622";
  const fontStylesheet=googleFontStylesheetUrl(n.mapFont);
  const fontLink=fontStylesheet?`<link rel="stylesheet" href="${fontStylesheet}">`:"";
  const rainbow=["#e76f51","#f4a261","#e9c46a","#6b9b67","#299c97","#4e7bc5","#a16bb3","#d5668a"];
  const colors=theme==="default"?rainbow:(MAP_PALETTES[theme]||rainbow);
  const colorPayload=JSON.stringify(colors);
  const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>${fontLink}<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css"><style>html,body{height:100%;margin:0;background:${surface};color:${textColor};font:14px ${fontStack}}svg{width:100%;height:100%;font-family:${fontStack};font-weight:400}.markmap-node text{font-weight:400!important;fill:${textColor}!important}.markmap-node foreignObject,.markmap-node foreignObject>div,.markmap-foreign{font-family:${fontStack};font-weight:400!important;color:${textColor}!important}</style></head><body><svg id="map"></svg><script src="https://cdn.jsdelivr.net/npm/d3@7"><\/script><script src="https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js"><\/script><script src="https://cdn.jsdelivr.net/npm/markmap-lib@0.18.12"><\/script><script src="https://cdn.jsdelivr.net/npm/markmap-view@0.18.12"><\/script><script>const md=${payload};const colors=${colorPayload};const root=new markmap.Transformer().transform(md).root;const depth=node=>node.state?.depth||0;const svg=document.querySelector("#map");svg.innerHTML='<defs><filter id="branch-wobble" x="-4%" y="-10%" width="108%" height="120%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".018 .035" numOctaves="1" seed="7" result="branchNoise"/><feDisplacementMap in="SourceGraphic" in2="branchNoise" scale="1.1" xChannelSelector="R" yChannelSelector="G"/></filter></defs>';markmap.Markmap.create(svg,{duration:350,maxWidth:300,spacingHorizontal:82,spacingVertical:15,color:node=>colors[depth(node)%colors.length],lineWidth:node=>depth(node)===1?3.6:depth(node)===2?2.25:1.55,style:id=>"#"+id+" .markmap-link{filter:url(#branch-wobble);stroke-linecap:round;stroke-linejoin:round}"},root);<\/script></body></html>`;
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
function deleteNote(n){history();n.el.remove();state.notes=state.notes.filter(x=>x!==n);if(state.selected===n)state.selected=null;
 empty();save()}
async function copyNote(){
 if(!state.selected)return;
 try{await navigator.clipboard.writeText(state.selected.md)}catch{}
}
function duplicate(){
 if(!state.selected)return;
 const n=state.selected;
 const c=n.type==="map"
  ? makeMap(n.md,n.x+45,n.y+45,n.mapWidth||n.el.offsetWidth,n.mapHeight||n.el.offsetHeight,true,null,n.mapColor,n.mapFont)
  : makeNote(n.md,n.x+45,n.y+45,n.el.offsetWidth,true,null,n.font,n.size,n.mapColor,n.mapFont,n.mapWidth,n.mapHeight);
 select(c);save()
}
function fit(widthOnly=false){
 const b=cardBounds();
 if(!b){moveTo(innerWidth/2,innerHeight/2,1);return}
 const w=Math.max(1,b.maxX-b.minX),h=Math.max(1,b.maxY-b.minY),p=100;
 const s=Math.max(MIN_SCALE,Math.min(1.5,widthOnly
  ? (innerWidth-2*p)/w
  : Math.min((innerWidth-2*p)/w,(innerHeight-2*p)/h)));
 const cx=b.minX+w/2,cy=b.minY+h/2;
 moveTo(innerWidth/2-cx*s,widthOnly?state.targetY:innerHeight/2-cy*s,s)
}
function layoutCards(){
 if(!state.notes.length)return;

 // Keep the preferred ten-card row while spacing actual card bounds evenly.
 const columns=Math.min(10,state.notes.length);
 const gapX=80;
 const gapY=80;

 state.notes.forEach(n=>{
  const width=n.type==="map"?(n.mapWidth||n.width||n.el.offsetWidth):(n.width||n.el.offsetWidth);
  n.el.style.width=width+"px";
  if(n.type==="map")n.el.style.height=(n.mapHeight||n.el.offsetHeight)+"px";
  n.el.style.left="0px";
  n.el.style.top="0px";
 });

 // Force layout after Markdown/KaTeX rendering.
 state.notes.forEach(n=>{
  widenCardForTables(n.el);
  if(n.type==="map")n.mapWidth=n.el.offsetWidth;
  else n.width=n.el.offsetWidth;
  void n.el.offsetHeight;
 });

 const rows=Math.ceil(state.notes.length/columns);
 const rowHeights=Array.from({length:rows},(_,row)=>{
  const start=row*columns;
  return Math.max(...state.notes.slice(start,start+columns).map(n=>n.el.offsetHeight));
 });
 let rowTop=-900;

 for(let row=0;row<rows;row++){
  const rowCards=state.notes.slice(row*columns,(row+1)*columns);
  const rowWidth=rowCards.reduce((width,n)=>width+n.el.offsetWidth,0)+gapX*(rowCards.length-1);
  let columnLeft=-rowWidth/2;
  for(const n of rowCards){
   n.x=columnLeft;
   n.y=rowTop;
   n.el.style.left=n.x+"px";
   n.el.style.top=n.y+"px";
   columnLeft+=n.el.offsetWidth+gapX;
  }

  rowTop+=rowHeights[row]+gapY;
 }

}
function arrange(record=true){
 if(!state.notes.length)return;
 if(record)history();
 layoutCards();
 requestAnimationFrame(()=>{
  fit(false);
  save();
 });
}
let reflowFrame=0;
function scheduleReflow(){
 if(reflowFrame)return;
 reflowFrame=requestAnimationFrame(()=>{
  reflowFrame=0;
  layoutCards();
 });
}
function scheduleArrange(){
 requestAnimationFrame(()=>arrange(false));
}
const backgrounds=["light","sun","ocean","stars","planets"];
const backgroundLabels={
 light:"Light",
 stars:"Stars",
 sun:"Sun",
 planets:"Planets",
 ocean:"Ocean"
};
function setBackground(name){
 const background=name==="dots"?"stars":backgrounds.includes(name)?name:"stars";
 canvas.dataset.background=background;
 localStorage.setItem("reflatex-background",background);
 $("#background").title=`Background: ${backgroundLabels[background]} (S cycles backgrounds)`;
 document.querySelectorAll("[data-background-choice]").forEach(button=>{
  button.classList.toggle("active",button.dataset.backgroundChoice===background);
 });
}
function cycleBackground(){
 const current=backgrounds.indexOf(canvas.dataset.background||"stars");
 setBackground(backgrounds[(current+1)%backgrounds.length]);
 showControls();
}
function toggleSunStarBackground(){
 setBackground(canvas.dataset.background==="sun"?"stars":"sun");
 showControls();
}
function toggleToolbar(force){
 const hidden=force===undefined
  ? !document.body.classList.contains("toolbar-hidden")
  : !force;
 document.body.classList.toggle("toolbar-hidden",hidden);
 localStorage.setItem("reflatex-toolbar-hidden",hidden?"1":"0");
 $("#toolbar").setAttribute("aria-hidden",String(hidden));
}
function toggleBackgroundMenu(force){
 const menu=$("#backgroundMenu");
 const open=force===undefined?!menu.classList.contains("open"):force;
 menu.classList.toggle("open",open);
 $("#background").setAttribute("aria-expanded",String(open));
}
function updateThemeIcon(){
 const dark=document.body.classList.contains("dark");
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
document.addEventListener("mousemove",e=>{if(document.body.classList.contains("fullscreen")&&(e.clientY<80||e.clientX<25))revealControls()});
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
$("#center").onclick=()=>{
 fit(false);
 save();
}
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
$("#saveCanvas").onclick=downloadCanvas
$("#openCanvas").onclick=()=>$("#canvasFile").click()
$("#canvasFile").addEventListener("change",e=>{
 const file=e.target.files?.[0];
 openCanvasFile(file);
 e.target.value="";
})
$("#full").onclick=toggleFull
$("#edge").onclick=()=>{toggleToolbar(true);revealControls()}
$("#minus").onclick=()=>zoom(.72);$("#plus").onclick=()=>zoom(1.38)
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

async function focusSelected(mode="readable"){
  const n=state.selected;
  if(!n)return;
  state.spaceFocusStep=mode==="fit"?1:2;

  if(n.type==="map"){
   // Wait for Markmap's first layout before fitting it. Fitting while
   // setData() is still running leaves the first Space press centered on an
   // empty or partial SVG, which made a second press appear necessary.
   try{await n.mapReady}catch{}
   if(state.selected!==n||n.type!=="map")return;
  }

  if(n.type==="map"&&mode==="fit"){
   const size=mapViewportSize();
   const dimensionsChanged=n.mapWidth!==size.width||n.mapHeight!==size.height;
   if(dimensionsChanged){
    history();
    n.mapWidth=size.width;n.mapHeight=size.height;
    n.el.style.width=size.width+"px";n.el.style.height=size.height+"px";
    layoutCards();
   }
   try{await n.mapInstance?.fit()}catch{}
   if(state.selected!==n)return;
   save();
  }

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
  const titleOffset=n.type==="map"?24:88;
  const availableWidth=Math.max(240,innerWidth-(n.type==="map"?48:180));
  const availableHeight=Math.max(240,innerHeight-titleOffset-(n.type==="map"?24:40));
  const widthScale=availableWidth/r.w;
  if(mode==="fit"){
    const fitScale=clampScale(Math.min(widthScale,availableHeight/r.h));
    moveTo(
      innerWidth/2-worldCenterX*fitScale,
      innerHeight/2-worldCenterY*fitScale,
      fitScale
    );
    return;
  }
  const fitScale=n.type==="map"?Math.min(widthScale,availableHeight/r.h):widthScale;
  const targetScale=clampScale(Math.min(1.2,fitScale));

  moveTo(
    innerWidth/2-worldCenterX*targetScale,
    titleOffset-worldTop*targetScale,
    targetScale
  );
}

function openCardTab(n){
 const heading=cardMarkdownParts(n.md).title;
 const title=escapeHtml(heading||"ConceptCards card");
 const titleHtml=heading?`<div class="cardbar"><div class="map-title">${escapeHtml(heading)}</div></div>`:`<div class="cardbar"><div class="map-title"></div></div>`;
 const theme=MAP_COLORS.includes(n.mapColor)?n.mapColor:"default";
 const font=normalizeCardFont(n.type==="map"?n.mapFont:n.font);
 const fontStack=mapFontStack(font);
 const fontStylesheet=googleFontStylesheetUrl(font);
 const fontLink=fontStylesheet?`<link rel="stylesheet" href="${escapeHtml(fontStylesheet)}">`:"";
 const size=["70","80","90","100","110","125","140","160","180"].includes(String(n.size))?String(n.size):"100";
 const stylesheet=escapeHtml(new URL("styles.css",location.href).href);
 const supportingStyles=[...document.querySelectorAll('link[rel="stylesheet"]')]
  .filter(link=>link.dataset.uiFonts==="true"||link.href.includes("katex.min.css"))
  .map(link=>`<link rel="stylesheet" href="${escapeHtml(link.href)}">`).join("");
 const dark=document.body.classList.contains("dark");
 const width=Math.max(300,Math.min(1600,n.el.offsetWidth||600));
 const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="${stylesheet}">${supportingStyles}${fontLink}<style>html,body{min-height:100%;margin:0}body{min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;background:var(--canvas);color:var(--ink)}.card.card-window{position:relative;left:auto;top:auto;width:min(${width}px,calc(100vw - 48px));max-width:100%;max-height:calc(100vh - 48px);overflow:hidden;box-sizing:border-box}.card-window .cardbar{cursor:default}.card-window .cardactions,.card-window .resize{display:none!important}.card-window .cardbody{max-height:calc(100vh - 112px);overflow:auto}@media(max-width:600px){body{padding:12px}.card.card-window{width:100%;max-height:calc(100vh - 24px)}.card-window .cardbody{max-height:calc(100vh - 88px)}}</style></head><body class="${dark?"dark":""}"><article class="card card-window${heading?" has-title":""}" data-map-color="${theme}" data-font="${font}" data-font-size="${size}" style="--card-font-family:${escapeHtml(fontStack)}">${titleHtml}<div class="cardbody">${renderCardMarkdown(n.md)}</div></article></body></html>`;
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

  select(state.notes[index]);
  focusSelected();
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
 const selectEl=n.el.querySelector("[data-map-color]");
 if(selectEl){selectEl.value=next;syncCardSelect(selectEl)}
 if(n.type==="map")n.mapReady=renderMap(n);
 save();
}

function resizeSelectedWidth(direction){
 const n=state.selected;if(!n)return;
 const min=Math.min(520,Math.max(300,innerWidth-24)),max=n.type==="map"?1600:1200;
 const current=n.type==="map"?(n.mapWidth||n.el.offsetWidth):(n.width||n.el.offsetWidth);
 const width=Math.max(min,Math.min(max,current+direction*40));
 if(width===current)return;
 history();
 n.el.style.width=width+"px";
 if(n.type==="map")n.mapWidth=width;
 else n.width=width;
 layoutCards();
 save();
}

window.addEventListener("keydown",e=>{
 if(!helpBackdrop.hidden){
   e.stopImmediatePropagation();
   if(e.key==="Escape"){e.preventDefault();closeHelp()}
   return;
 }
 const mod=e.ctrlKey||e.metaKey;
 const editing=document.activeElement===source ||
   document.activeElement?.tagName==="INPUT" ||
   document.activeElement?.tagName==="TEXTAREA";
 const customSelectFocused=document.activeElement?.closest?.(".custom-select-trigger,.custom-select-menu");

 showControls();

 /*
  * SPACE
  * - selected card -> focus it
  * - canvas panning is available with middle or right mouse button
  */
 if(e.code==="Space"&&!editing&&!customSelectFocused){
   e.preventDefault();
   if(e.repeat)return;
   if(state.selected){
     // Alternate between fitting the whole card and its readable view for
     // both Markdown and Markmap cards. Keep this as a true toggle so Space
     // continues to work after the second press instead of becoming inert.
     focusSelected(state.spaceFocusStep===1?"readable":"fit");
   }
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
 if(/^[1-9]$/.test(key)&&!mod&&!e.altKey&&!e.shiftKey&&state.selected){
   const sizeSelect=state.selected.el.querySelector("[data-size]");
   const active=document.activeElement;
   const focusedControl=active?.matches?.("input,textarea,select,[contenteditable='true']");
   const sizeIndex=Number(key)-1;
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
  *   previous / next card, stopping at the first or last card
  *
  * Home/End:
  *   first / last card
  *
  * Arrow Up/Down:
  *   page-style canvas movement without changing card selection.
  */
 if(e.key==="PageUp"){
   e.preventDefault();
   cycleSelected(-1);
   return;
 }
 if(e.key==="PageDown"){
   e.preventDefault();
   cycleSelected(1);
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
   $("#canvasFile").click();
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
   else context.classList.remove("open");
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
   (d.notes||[]).forEach(n=>{
    if(typeof n.md!=="string")return;
    n.type==="map"
      ? makeMap(n.md,n.x||0,n.y||0,n.w||960,n.h||640,false,n.id,n.mapColor,n.mapFont)
      : makeNote(n.md,n.x||0,n.y||0,n.w||600,false,n.id,typeof n.font==="string"?n.font:"mono",n.size,n.mapColor,n.mapFont,n.mapWidth,n.mapHeight);
   })
  }
 }catch{}
 const dark=localStorage.getItem("reflatex-theme")==="dark";
 if(dark)document.body.classList.add("dark");
 updateThemeIcon();
 setBackground(localStorage.getItem("reflatex-background")||"stars");
 toggleToolbar(localStorage.getItem("reflatex-toolbar-hidden")!=="1");
 state.hand=true;$("#hand").classList.add("active");canvas.style.cursor="grab";
 sync();apply();empty()
}
let resizeFrame=0;
window.addEventListener("resize",()=>{
 if(resizeFrame)return;
 resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;apply()});
});
window.addEventListener("pagehide",flushSave);
try{
 load();
}catch(err){
 showRuntimeError(err?.message||"Refresh the page and try again.");
}
})();
