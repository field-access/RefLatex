(()=>{
 'use strict';
 const colors=new Set(['theme','yellow','green','blue','pink']);
 function normalize(items){
  return (Array.isArray(items)?items:[]).filter(item=>item&&colors.has(item.color)&&Number.isInteger(item.start)&&Number.isInteger(item.end)&&item.start>=0&&item.end>item.start&&typeof item.quote==='string').slice(0,500).map(item=>({...item,id:String(item.id||crypto.randomUUID()),mathSources:Array.isArray(item.mathSources)?item.mathSources:[]}));
 }
 function project(root){
  let text='';const entries=[];
  function walk(node){
   if(node.nodeType===3){
    const start=text.length;text+=node.nodeValue;
    const parent=node.parentElement;
    // Keep offsets stable, but never insert HTML into table structure,
    // equation spacing, or SVG/MathML text nodes.
    const structural=parent.matches('table,thead,tbody,tfoot,tr,colgroup')||parent.namespaceURI!=='http://www.w3.org/1999/xhtml';
    const spacing=!node.nodeValue.trim()&&!parent.closest('pre,code');
    entries.push({node,start,end:text.length,decorate:!structural&&!spacing});return;
   }
   if(node.nodeType!==1)return;
   if(node.matches('script,style,.katex-mathml,.code-gutter'))return;
   if(node.matches('.katex,math,mjx-container')){
    const start=text.length;text+='\ufffc';entries.push({node,start,end:text.length,math:true,latex:node.querySelector('annotation[encoding="application/x-tex"]')?.textContent||node.textContent});return;
   }
   for(const child of node.childNodes)walk(child);
  }
  for(const child of root.childNodes)walk(child);
  return {text,entries};
 }
 function selection(root,range){
  const model=project(root);let start=Infinity,end=-Infinity;
  for(const entry of model.entries){
   if(entry.decorate===false)continue;
   if(!range.intersectsNode(entry.node))continue;
   const a=entry.start+(entry.math?0:range.startContainer===entry.node?range.startOffset:0);
   const b=entry.math?entry.end:entry.start+(range.endContainer===entry.node?range.endOffset:entry.end-entry.start);
   if(b>a){start=Math.min(start,a);end=Math.max(end,b)}
  }
  if(!Number.isFinite(start)||end<=start)return null;
  return {start,end,quote:model.text.slice(start,end),mathSources:model.entries.filter(entry=>entry.math&&entry.start>=start&&entry.end<=end).map(entry=>entry.latex)};
 }
 function resolve(item,model){
  let start=item.start,end=item.end;
  if(model.text.slice(start,end)!==item.quote){
   start=model.text.indexOf(item.quote);
   if(start<0||model.text.indexOf(item.quote,start+1)>=0)return null;
   end=start+item.quote.length;
  }
  const math=model.entries.filter(entry=>entry.math&&entry.start>=start&&entry.end<=end).map(entry=>entry.latex);
  if(JSON.stringify(math)!==JSON.stringify(item.mathSources||[]))return null;
  return {...item,start,end};
 }
 function clear(root){
  root.querySelectorAll('mark[data-highlight-id]').forEach(mark=>{const parent=mark.parentNode;mark.replaceWith(...mark.childNodes);parent.normalize()});
  root.querySelectorAll('.card-equation-highlight').forEach(math=>{math.classList.remove('card-equation-highlight');if(!math.classList.length)math.removeAttribute('class');delete math.dataset.highlightId;delete math.dataset.highlight});
 }
 function paint(root,items){
  if(!root)return;
  clear(root);
  if(!items?.length)return;
  const model=project(root),ranges=normalize(items).map(item=>resolve(item,model)).filter(Boolean);
  for(const entry of model.entries){
   if(entry.decorate===false)continue;
   const overlapping=ranges.filter(item=>item.start<entry.end&&item.end>entry.start);
   if(!overlapping.length)continue;
   if(entry.math){
    const item=overlapping.at(-1);entry.node.classList.add('card-equation-highlight');entry.node.dataset.highlightId=item.id;entry.node.dataset.highlight=item.color;continue;
   }
   const points=[...new Set([entry.start,entry.end,...overlapping.flatMap(item=>[Math.max(entry.start,item.start),Math.min(entry.end,item.end)])])].sort((a,b)=>a-b);
   const fragment=document.createDocumentFragment();
   for(let i=0;i<points.length-1;i++){
    const a=points[i],b=points[i+1],text=entry.node.nodeValue.slice(a-entry.start,b-entry.start);
    const item=overlapping.findLast(item=>item.start<=a&&item.end>=b);
    if(item){const mark=document.createElement('mark');mark.className='card-text-highlight';mark.dataset.highlightId=item.id;mark.dataset.highlight=item.color;mark.textContent=text;fragment.append(mark)}
    else fragment.append(document.createTextNode(text));
   }
   entry.node.replaceWith(fragment);
  }
 }
 function create(range,color){return {...range,color,id:crypto.randomUUID()}}
 window.ConceptTextHighlights={normalize,project,selection,paint,create};
})();
