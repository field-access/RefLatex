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
 hand:true,spacePan:false,controlsVisible:true,pan:null,drag:null,rightPan:null,resize:null,editId:null,
 undo:[],redo:[],historyLock:false,raf:0,saveTimer:0,hideTimer:0,
};
const MAP_COLORS=["default","purple","warm"];
const MAP_LAYOUTS=["mindmap","tree","logicRight","logicLeft"];

function showControls(){
  document.body.classList.remove("controls-hidden");
  state.controlsVisible=true;
  clearTimeout(state.hideTimer);
  state.hideTimer=setTimeout(()=>{
    if(!editor.classList.contains("open") && !$("#mapEditor").classList.contains("open") && !context.classList.contains("open")){
      document.body.classList.add("controls-hidden");
      state.controlsVisible=false;
    }
  },3200);
}
function wakeControls(){
  showControls();
}
function safeMarkdown(md){
 let out;
 try{
   out=window.marked?marked.parse(md):`<p>${escapeHtml(md)}</p>`;
 }catch{out=`<p>${escapeHtml(md)}</p>`}
 try{if(window.DOMPurify)out=DOMPurify.sanitize(out)}catch{}
 return out;
}
function escapeHtml(s){
 return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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

    return out+body.slice(pos);
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
    (whole,lead,block)=>{
      const id=blockCodes.length;
      const code=block.replace(/^[ \t]{4}/gm,"").replace(/\n$/,"");
      blockCodes.push({code,language:"",math:looksLikeMathBlock(code)});
      return `${lead}@@REFLATEX_BLOCK_${id}@@`;
    }
  );

  // Protect inline code.
  text=text.replace(/`([^`\n]+)`/g,(whole,code)=>{
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
      const codeHtml=`<pre><code${lang}>${escaped}</code></pre>`;
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

  return box.innerHTML;
}
function markmapOptions(n){
 const color=n.mapColor==="purple"
  ? ["#7167c5","#8d84d4","#aaa2e2","#c5c0ee"]
  : n.mapColor==="warm"
   ? ["#d8944c","#e3aa70","#efc18f","#f5d7b4"]
   : ["#5b57b7","#7c78c8","#9b98d8","#bbb9e8"];
 return {color,layout:n.mapLayout||"mindmap",duration:350,maxWidth:280,spacingVertical:12,spacingHorizontal:70};
}
function renderMap(n){
 const body=n.el?.querySelector(".cardbody");
 if(!body)return;
 if(!window.markmap?.Transformer||!window.markmap?.Markmap){
  body.innerHTML='<div class="map-error">Markmap could not load. Check your connection, then reopen this map.</div>';
  return;
 }
 try{
  const transformer=new window.markmap.Transformer();
  const {root}=transformer.transform(n.md);
  body.innerHTML="";
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  body.appendChild(svg);
  const options=markmapOptions(n);
  options.initialExpandLevel=6;
  const map=window.markmap.Markmap.create(svg,options,root);
  n.mapInstance=map;
 }catch(err){
  body.innerHTML=`<div class="map-error">${escapeHtml(err.message||"Could not render this map.")}</div>`;
 }
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
function animate(){
 if(state.raf)return;
 const tick=()=>{
  // Keep camera response close to the input while retaining a small amount
  // of smoothing for button/keyboard navigation.
  state.x+=(state.targetX-state.x)*.42;
  state.y+=(state.targetY-state.y)*.42;
  state.scale+=(state.targetScale-state.scale)*.34;
  apply();
  if(Math.abs(state.x-state.targetX)<.08&&Math.abs(state.y-state.targetY)<.08&&Math.abs(state.scale-state.targetScale)<.0005){
   state.x=state.targetX;state.y=state.targetY;state.scale=state.targetScale;apply();state.raf=0;return;
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
function snapshot(){return JSON.stringify({x:state.x,y:state.y,scale:state.scale,nextId:state.nextId,notes:state.notes.map(n=>({id:n.id,md:n.md,x:n.x,y:n.y,w:n.width||n.el.offsetWidth,font:n.font||"serif",size:n.size||"100",type:n.type||"note",mapColor:n.mapColor||"default",mapLayout:n.mapLayout||"mindmap"}))})}
function history(){
 if(state.historyLock)return;
 const s=snapshot();
 if(state.undo.at(-1)!==s){state.undo.push(s);if(state.undo.length>80)state.undo.shift();state.redo=[]}
}
function restore(s){
 const d=JSON.parse(s);state.historyLock=true;
 state.notes.forEach(n=>n.el.remove());state.notes=[];state.selected=null;
 (d.notes||[]).forEach(n=>n.type==="map"
  ? makeMap(n.md,n.x,n.y,n.w,false,n.id,n.mapColor,n.mapLayout)
  : makeNote(n.md,n.x,n.y,n.w,false,n.id,n.font,n.size));
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
   width:n.width||n.el.offsetWidth,
   font:n.font||"serif",
   size:n.size||"100",
   mapColor:n.mapColor||"default",
   mapLayout:n.mapLayout||"mindmap"
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
 setTimeout(()=>$("#hint").textContent="✋ Hand ON = trackpad/wheel zoom · Hand OFF = trackpad/mouse scroll pan · Drag notes · Double-click edit · Ctrl/Cmd+Enter paste · Ctrl/Cmd+S save · Ctrl/Cmd+O open",1800);
}

function openCanvasFile(file){
 if(!file)return;

 const reader=new FileReader();

 reader.onload=()=>{
  try{
   const data=JSON.parse(reader.result);

   if(!data || !Array.isArray(data.notes)){
    throw new Error("Invalid RefLatex canvas file");
   }

   state.historyLock=true;
   state.notes.forEach(n=>n.el.remove());
   state.notes=[];
   state.selected=null;

   data.notes.forEach(n=>{
    if(typeof n.markdown!=="string")return;
    const args=[n.markdown,Number.isFinite(n.x)?n.x:0,Number.isFinite(n.y)?n.y:0,Number.isFinite(n.width)?n.width:600,false,Number.isFinite(n.id)?n.id:null];
    n.type==="map"
      ? makeMap(...args, n.mapColor, n.mapLayout)
      : makeNote(...args,typeof n.font==="string"?n.font:"serif",n.size);
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
   setTimeout(()=>$("#hint").textContent="✋ Hand ON = trackpad/wheel zoom · Hand OFF = trackpad/mouse scroll pan · Drag notes · Double-click edit · Ctrl/Cmd+Enter paste · Ctrl/Cmd+S save · Ctrl/Cmd+O open",2200);

  }catch(err){
   state.historyLock=false;
   alert("Could not open this canvas file.\\n\\n"+err.message);
  }
 };

 reader.onerror=()=>alert("Could not read the selected canvas file.");
 reader.readAsText(file);
}

function makeNote(md,x,y,w=600,record=true,id=null,font="serif",size="100"){
 if(record)history();
 const width=Math.max(300,Math.min(1200,w||600));
 const n={id:id??state.nextId++,md,x,y,font,size,width,type:"note",el:null};
 state.nextId=Math.max(state.nextId,n.id+1);
 const el=document.createElement("article");
 el.className="card";el.style.left=x+"px";el.style.top=y+"px";el.style.width=width+"px";
 el.innerHTML=`<div class="cardbar"></div><div class="cardactions"><select data-font aria-label="Card font" title="Card font (V / Shift+V)"><option value="serif">Serif</option><option value="sans">Sans</option><option value="mono">Mono</option><option value="slab">Slab</option><option value="humanist">Humanist</option><option value="rounded">Rounded</option><option value="editorial">Editorial</option><option value="hand">Handwritten</option><option value="hand-soft">Hand Soft</option><option value="hand-bold">Hand Bold</option><option value="hand-marker">Hand Marker</option><option value="hand-script">Hand Script</option></select><select data-size aria-label="Card font size" title="Card font size"><option value="70">70%</option><option value="80">80%</option><option value="90">90%</option><option value="100">100%</option><option value="110">110%</option><option value="125">125%</option><option value="140">140%</option><option value="160">160%</option><option value="180">180%</option></select><button data-edit>✎</button><button data-delete>×</button></div>
 <div class="resize left" data-side="left"></div><div class="resize right" data-side="right"></div>
 <div class="cardbody">${render(md)}</div>`;
 el.dataset.font=font;
 el.querySelector("[data-font]").value=font;
 el.dataset.fontSize=["70","80","90","100","110","125","140","160","180"].includes(String(size))?String(size):"100";
 el.querySelector("[data-size]").value=el.dataset.fontSize;
 n.el=el;world.appendChild(el);state.notes.push(n);
 widenCardForTables(el);

 el.addEventListener("mousedown",e=>{
  if(e.button!==0||e.target.closest(".cardactions,.resize,a,button"))return;
  select(n);
  if(e.target.closest(".cardbar"))startDrag(e,n);
 });
 el.addEventListener("dblclick",e=>{
  if(e.target.closest(".cardactions,.resize"))return;
  e.preventDefault();e.stopPropagation();editNote(n);
 });
 el.querySelector("[data-edit]").onclick=()=>editNote(n);
 el.querySelector("[data-delete]").onclick=()=>deleteNote(n);
 el.querySelector("[data-font]").onchange=e=>{
  history();n.font=e.target.value;el.dataset.font=n.font;widenCardForTables(el);save();
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
function makeMap(md,x,y,w=720,record=true,id=null,mapColor="default",mapLayout="mindmap"){
 if(record)history();
 const width=Math.max(420,Math.min(1200,w||720));
 const n={id:id??state.nextId++,md,x,y,width,type:"map",mapColor:MAP_COLORS.includes(mapColor)?mapColor:"default",mapLayout:MAP_LAYOUTS.includes(mapLayout)?mapLayout:"mindmap",el:null,mapInstance:null};
 state.nextId=Math.max(state.nextId,n.id+1);
 const el=document.createElement("article");
 el.className="card map-card";el.style.left=x+"px";el.style.top=y+"px";el.style.width=width+"px";
 el.dataset.mapColor=n.mapColor;
 el.innerHTML=`<div class="cardbar"><div class="map-title">Mind map</div></div><div class="cardactions"><select data-map-layout aria-label="Map layout" title="Map layout"><option value="mindmap">Mindmap</option><option value="tree">Tree</option><option value="logicRight">Logic right</option><option value="logicLeft">Logic left</option></select><button data-map-edit title="Edit map">✎</button><button data-map-open title="Open map in new tab">↗</button><button data-delete title="Delete map">×</button></div><div class="resize left" data-side="left"></div><div class="resize right" data-side="right"></div><div class="cardbody"><div class="map-loading">Rendering mind map…</div></div>`;
 n.el=el;world.appendChild(el);state.notes.push(n);
 el.querySelector("[data-map-layout]").value=n.mapLayout;
 el.addEventListener("mousedown",e=>{
  if(e.button!==0||e.target.closest(".cardactions,.resize,a,button"))return;
  select(n);
  if(e.target.closest(".cardbar"))startDrag(e,n);
 });
 el.addEventListener("dblclick",e=>{if(!e.target.closest(".cardactions,.resize")){e.preventDefault();e.stopPropagation();editNote(n)}});
 el.querySelector("[data-map-edit]").onclick=()=>editNote(n);
 el.querySelector("[data-map-open]").onclick=()=>openMapTab(n);
 el.querySelector("[data-delete]").onclick=()=>deleteNote(n);
 el.querySelector("[data-map-layout]").onchange=e=>{history();n.mapLayout=e.target.value;renderMap(n);save()};
 el.querySelector("[data-map-layout]").onfocus=()=>select(n);
 el.querySelectorAll(".resize").forEach(r=>r.onmousedown=e=>{if(e.button===0)startResize(e,n,r.dataset.side)});
 renderMap(n);empty();return n;
}
function startDrag(e,n){
 e.preventDefault();e.stopPropagation();history();
 state.drag={n,sx:e.clientX,sy:e.clientY,x:n.x,y:n.y};
 canvas.style.cursor="grabbing";
}
window.addEventListener("mousemove",e=>{
 if(state.drag){
  const d=state.drag,dx=(e.clientX-d.sx)/state.scale,dy=(e.clientY-d.sy)/state.scale;
  d.n.x=d.x+dx;d.n.y=d.y+dy;
  d.n.el.style.left=d.n.x+"px";d.n.el.style.top=d.n.y+"px";
 }
 if(state.resize){
  const r=state.resize,dx=(e.clientX-r.sx)/state.scale;
  const w=Math.max(300,Math.min(1200,r.w+(r.side==="right"?dx:-dx)));
  r.n.el.style.width=w+"px";
  r.n.width=w;
  if(r.side==="left"){r.n.x=r.x+r.w-w;r.n.el.style.left=r.n.x+"px"}
 }
 if(state.pan){
  state.x=state.pan.x+e.clientX-state.pan.sx;state.y=state.pan.y+e.clientY-state.pan.sy;sync();apply();
 }
});
window.addEventListener("mouseup",()=>{
 if(state.drag||state.resize||state.pan){flushSave()}
 state.drag=null;state.resize=null;state.pan=null;
 canvas.style.cursor=state.hand?"grab":"default";
});
function startResize(e,n,side){
 e.preventDefault();e.stopPropagation();select(n);history();
 state.resize={n,side,sx:e.clientX,w:n.el.offsetWidth,x:n.x};
 canvas.style.cursor="ew-resize";
}
function startPan(e){
 if(e.button!==1 && e.button!==2 && !(e.button===0&&state.spacePan))return;
 e.preventDefault();
 e.stopPropagation();
 state.pan={sx:e.clientX,sy:e.clientY,x:state.x,y:state.y};
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
   apply();
  }
 });
}

canvas.addEventListener("wheel",e=>{
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
 button.textContent=state.hand?"✋":"✋";
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
  const p=[...touches.values()][0];state.x=gesture.ox+p.x-gesture.x;state.y=gesture.oy+p.y-gesture.y;sync();apply();
 }
 if(touches.size===2&&gesture?.type==="pinch"){
  const[a,b]=[...touches.values()],cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,d=Math.hypot(a.x-b.x,a.y-b.y);
  const ns=Math.max(MIN_SCALE,Math.min(MAX_SCALE,gesture.s*d/gesture.d));
  const nx=cx-gesture.w.x*ns,ny=cy-gesture.w.y*ns;
  state.scale=ns;state.x=nx;state.y=ny;
  sync();apply();
 }
});
function touchEnd(e){
 if(e.pointerType!=="touch")return;touches.delete(e.pointerId);
 if(!touches.size){gesture=null;save()}
}
canvas.addEventListener("pointerup",touchEnd);canvas.addEventListener("pointercancel",touchEnd);

function editNote(n){
 if(n.type==="map"){
  state.editId=n.id;
  $("#mapSource").value=n.md;
  $("#mapLayout").value=n.mapLayout||"mindmap";
  $("#mapColor").value=n.mapColor||"default";
  $("#applyMap").textContent="Update map";
  $("#mapEditor").classList.add("open");
  $("#mapSource").focus();
  return;
 }
 state.editId=n.id;source.value=n.md;$("#apply").textContent="Update note";editor.classList.add("open");source.focus()
}
function closeEditor(){editor.classList.remove("open");state.editId=null}
function closeMapEditor(){$("#mapEditor").classList.remove("open");state.editId=null}
function applyEditor(){
 const md=source.value.trim();if(!md)return;
 if(state.editId!==null){
  const n=state.notes.find(x=>x.id===state.editId);if(!n)return;
  history();n.md=md;n.el.querySelector(".cardbody").innerHTML=render(md);widenCardForTables(n.el);
  select(n);
 }else{
  const p=worldPoint(innerWidth/2,innerHeight/2),n=makeNote(md,p.x-300,p.y-150,600,true);select(n)
 }
 closeEditor();save()
}
 function applyMapEditor(){
  const md=$("#mapSource").value.trim();if(!md)return;
  const color=$("#mapColor").value,layout=$("#mapLayout").value;
  if(state.editId!==null){
   const n=state.notes.find(x=>x.id===state.editId);if(!n)return;
   history();n.md=md;n.mapColor=color;n.mapLayout=layout;n.el.dataset.mapColor=color;
   n.el.querySelector("[data-map-layout]").value=layout;renderMap(n);select(n);
  }else{
   const p=worldPoint(innerWidth/2,innerHeight/2),n=makeMap(md,p.x-360,p.y-250,720,true,null,color,layout);select(n);
  }
  closeMapEditor();save();
 }
 function openMapTab(n){
  const payload=JSON.stringify(n.md).replace(/</g,"\\u003c");
  const title=escapeHtml((n.md.match(/^#\s+(.+)$/m)||[])[1]||"RefLatex mind map");
  const html=`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>html,body{height:100%;margin:0;background:#f7f5f0;color:#272622;font:14px system-ui}svg{width:100%;height:100%}</style></head><body><svg id="map"></svg><script src="https://cdn.jsdelivr.net/npm/d3@7"><\/script><script src="https://cdn.jsdelivr.net/npm/markmap-lib@0.18.12"><\/script><script src="https://cdn.jsdelivr.net/npm/markmap-view@0.18.12"><\/script><script>const md=${payload};const root=new markmap.Transformer().transform(md).root;markmap.Markmap.create("#map",{duration:350},root);<\/script></body></html>`;
  const tab=window.open();if(!tab){alert("Allow pop-ups to open this mind map.");return}
  tab.document.write(html);tab.document.close();
  }
async function quickPaste(){
 if(document.activeElement===source){applyEditor();return}
 try{
  const md=await navigator.clipboard.readText();
  if(!md.trim())return;
  const p=worldPoint(innerWidth/2,innerHeight/2),n=makeNote(md,p.x-300,p.y-150,600,true);select(n);save()
 }catch{editor.classList.add("open");source.value="";source.focus()}
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
  ? makeMap(n.md,n.x+45,n.y+45,n.el.offsetWidth,true,null,n.mapColor,n.mapLayout)
  : makeNote(n.md,n.x+45,n.y+45,n.el.offsetWidth,true,null,n.font,n.size);
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
function arrange(){
 if(!state.notes.length)return;
 history();

 // Preserve each card's width, including widths expanded for tables.
 const columns=4;
 const gapX=100;
 const gapY=120;

 state.notes.forEach(n=>{
  n.el.style.width=(n.width||n.el.offsetWidth)+"px";
  n.el.style.left="0px";
  n.el.style.top="0px";
 });

 // Force layout after Markdown/KaTeX rendering.
 state.notes.forEach(n=>{
  widenCardForTables(n.el);
  n.width=n.el.offsetWidth;
  void n.el.offsetHeight;
 });

 const rows=Math.ceil(state.notes.length/columns);
 const rowHeights=Array(rows).fill(0);
 const columnWidths=Array(columns).fill(0);

 state.notes.forEach((n,i)=>{
  const row=Math.floor(i/columns);
  const col=i%columns;
  rowHeights[row]=Math.max(rowHeights[row],n.el.offsetHeight);
  columnWidths[col]=Math.max(columnWidths[col],n.width||n.el.offsetWidth);
 });

 const totalWidth=columnWidths.reduce((sum,width)=>sum+width,0)+gapX*(columns-1);
 const left=-totalWidth/2;
 let rowTop=-900;

 for(let row=0;row<rows;row++){
  let columnLeft=left;
  for(let col=0;col<columns;col++){
   const i=row*columns+col;
   if(i>=state.notes.length)break;

   const n=state.notes[i];
   n.x=columnLeft;
   n.y=rowTop;
   n.el.style.left=n.x+"px";
   n.el.style.top=n.y+"px";
   columnLeft+=columnWidths[col]+gapX;
  }

  rowTop+=rowHeights[row]+gapY;
 }

 requestAnimationFrame(()=>{
  fit(false);
  save();
 });
}
const backgrounds=["dots","sun"];
const backgroundLabels={
 dots:"Dots",
 sun:"Sun"
};
function setBackground(name){
 const background=backgrounds.includes(name)?name:"dots";
 canvas.dataset.background=background;
 localStorage.setItem("reflatex-background",background);
 $("#background").title=`Background: ${backgroundLabels[background]} (B)`;
 document.querySelectorAll("[data-background-choice]").forEach(button=>{
  button.classList.toggle("active",button.dataset.backgroundChoice===background);
 });
}
function cycleBackground(){
 const current=backgrounds.indexOf(canvas.dataset.background||"dots");
 setBackground(backgrounds[(current+1)%backgrounds.length]);
 showControls();
}
function toggleBackgroundMenu(force){
 const menu=$("#backgroundMenu");
 const open=force===undefined?!menu.classList.contains("open"):force;
 menu.classList.toggle("open",open);
 $("#background").setAttribute("aria-expanded",String(open));
}
function toggleTheme(){document.body.classList.toggle("dark");localStorage.setItem("reflatex-theme",document.body.classList.contains("dark")?"dark":"light");$("#theme").textContent=document.body.classList.contains("dark")?"☀":"☾"}
function revealControls(){
 showControls();clearTimeout(state.hideTimer);
 state.hideTimer=setTimeout(()=>{if(!editor.classList.contains("open"))document.body.classList.remove("controls")},2200)
}
async function toggleFull(){
 try{
  if(document.fullscreenElement)await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
 }catch{}
 document.body.classList.toggle("fullscreen",!!document.fullscreenElement||!document.body.classList.contains("fullscreen"));
 document.body.classList.add("controls");
 revealControls();
}
document.addEventListener("mousemove",e=>{if(document.body.classList.contains("fullscreen")&&(e.clientY<80||e.clientX<25))revealControls()});
document.addEventListener("fullscreenchange",()=>{
 const active=!!document.fullscreenElement;
 document.body.classList.toggle("fullscreen",active);
 if(active){document.body.classList.add("controls");revealControls()}
});

$("#hand").onclick=()=>{
 state.hand=!state.hand;
 updateHandUI();
showControls();
}
$("#new").onclick=()=>{state.editId=null;source.value="";$("#apply").textContent="Place note";editor.classList.add("open");source.focus()}
$("#newMap").onclick=()=>{state.editId=null;$("#mapSource").value="";$("#mapLayout").value="mindmap";$("#mapColor").value="default";$("#applyMap").textContent="Place map";$("#mapEditor").classList.add("open");$("#mapSource").focus()}
$("#fit").onclick=()=>{fit(true);save()}
$("#center").onclick=()=>{
 const b=cardBounds();
 if(!b){moveTo(innerWidth/2,innerHeight/2,1);save();return}
 const scale=MIN_SCALE;
 moveTo(
  innerWidth/2-(b.minX+b.maxX)*scale/2,
  innerHeight/2-(b.minY+b.maxY)*scale/2,
  scale
 );
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
$("#edge").onclick=revealControls
$("#minus").onclick=()=>zoom(.72);$("#plus").onclick=()=>zoom(1.38);$("#reset").onclick=()=>moveTo(innerWidth/2,innerHeight/2,1)
$("#close").onclick=closeEditor;$("#cancel").onclick=closeEditor;$("#apply").onclick=applyEditor
$("#closeMap").onclick=closeMapEditor;$("#cancelMap").onclick=closeMapEditor;$("#applyMap").onclick=applyMapEditor
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
 e.preventDefault();const p=worldPoint(innerWidth/2,innerHeight/2),n=makeNote(md,p.x-300,p.y-150,600,true);select(n);save()
});

function focusSelected(){
  const n=state.selected;
  if(!n)return;

  // Keep the selected card's front edge in view without changing its zoom level.
  const r={
    x:n.x,
    y:n.y,
    w:n.el.offsetWidth
  };

  const targetScale=Math.max(.7,Math.min(1.25,state.targetScale||state.scale));
  const cx=r.x+r.w/2;
  const frontOffset=Math.min(72,Math.max(32,innerHeight*.1));

  moveTo(
    innerWidth/2-cx*targetScale,
    frontOffset-r.y*targetScale,
    targetScale
  );
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

window.addEventListener("keydown",e=>{
 const mod=e.ctrlKey||e.metaKey;
 const editing=document.activeElement===source ||
   document.activeElement===$("#mapSource") ||
   document.activeElement?.tagName==="INPUT" ||
   document.activeElement?.tagName==="TEXTAREA";

 showControls();

 /*
  * SPACE
  * - selected card -> focus it
  * - no selection -> temporary hand/pan mode
  */
 if(e.code==="Space"&&!editing){
   e.preventDefault();
   if(state.selected){
     focusSelected();
     state.spacePan=false;
   }else{
     state.spacePan=true;
     canvas.style.cursor="grab";
   }
   return;
 }

 if(editing){
   if(mod&&e.key==="Enter"){
     e.preventDefault();
     document.activeElement===$("#mapSource")?applyMapEditor():applyEditor();
     return;
   }
   if(e.key==="Escape"){
     e.preventDefault();
     closeEditor();
   }
   return;
 }

 /*
  * TOOLBAR AND ZOOM SHORTCUTS
  * These mirror the visible buttons without interfering with card text input.
  */
 const key=e.key.toLowerCase();
 if(!mod&&!e.altKey){
   const actions={
     h:()=>$("#hand").click(),
     n:()=>$("#new").click(),
     m:()=>$("#newMap").click(),
     f:()=>$("#fit").click(),
     c:()=>$("#center").click(),
     a:()=>$("#arrange").click(),
     b:cycleBackground,
     t:()=>$("#theme").click(),
     "-":()=>$("#minus").click(),
     "=":()=>$("#plus").click(),
     "[":()=>$("#minus").click(),
     "]":()=>$("#plus").click(),
     "0":()=>$("#reset").click()
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
   const distance=innerHeight*.72;
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
   closeEditor();
   closeMapEditor();
   context.classList.remove("open");
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
      ? makeMap(n.md,n.x||0,n.y||0,n.w||720,false,n.id,n.mapColor,n.mapLayout)
      : makeNote(n.md,n.x||0,n.y||0,n.w||600,false,n.id,typeof n.font==="string"?n.font:"serif",n.size);
   })
  }
 }catch{}
 const dark=localStorage.getItem("reflatex-theme")==="dark";
 if(dark){document.body.classList.add("dark");$("#theme").textContent="☀"}
 setBackground(localStorage.getItem("reflatex-background")||"dots");
 state.hand=true;$("#hand").classList.add("active");canvas.style.cursor="grab";
 sync();apply();empty()
}
let resizeFrame=0;
window.addEventListener("resize",()=>{
 if(resizeFrame)return;
 resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;apply()});
});
window.addEventListener("pagehide",flushSave);
window.addEventListener("keyup",e=>{
 if(e.code==="Space"){
  state.spacePan=false;
  canvas.style.cursor=state.hand?"grab":"default";
 }
});
load();
})();
