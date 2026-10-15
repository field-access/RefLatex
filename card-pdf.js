/* Native printing preserves text, fonts, tables and links instead of rasterizing. */
let villagePdfBackgroundLoader;
window.downloadConceptCardPdf=async options=>{
 villagePdfBackgroundLoader ||= new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='./assets/backgrounds/village-pdf.js?v=2';
  script.onload=resolve;script.onerror=()=>{villagePdfBackgroundLoader=null;reject(new Error('Could not load the PDF background'))};document.head.append(script);
 });
 await villagePdfBackgroundLoader;
 const tab=options.window,doc=tab.document;
 doc.open();doc.write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body></body></html>');
 doc.title=options.title;
 const baseStyle=doc.createElement('style');baseStyle.textContent=options.css;doc.head.append(baseStyle);
 const styles=options.stylesheets.map(href=>new Promise(resolve=>{
  const link=doc.createElement('link');link.rel='stylesheet';link.href=href;
  link.onload=resolve;link.onerror=resolve;doc.head.append(link);
 }));
 const style=doc.createElement('style');
 style.textContent=`
  @page{size:A4;margin:16mm}
  html,body{width:auto;height:auto;min-height:0;margin:0;overflow:visible;background:white;color:#272622}
  body{padding:24px;box-sizing:border-box}
  .pdf-background{position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;pointer-events:none}
  .card.pdf-card{position:relative;z-index:1;left:auto;top:auto;width:min(${options.width}px,100%);min-width:0;max-width:100%;height:auto;margin:0 auto;padding:24px;box-sizing:border-box;border:0;border-radius:0;box-shadow:none;background:white;color:#272622;overflow:visible;box-decoration-break:clone;-webkit-box-decoration-break:clone}
  .pdf-card .cardbar{height:auto;min-height:0;padding:0 0 12px;background:white;color:#272622;border:0;cursor:default}
  .pdf-card .cardbody{height:auto;max-height:none;padding:0;overflow:visible;background:white;color:#272622}
  .pdf-card .cardbody *{text-shadow:none;box-shadow:none}
  .pdf-card h1,.pdf-card h2,.pdf-card h3,.pdf-card h4{break-after:avoid}
  .pdf-card img,.pdf-card pre,.pdf-card tr{break-inside:avoid}
  .pdf-card img{max-width:100%;height:auto}
  .pdf-card pre{white-space:pre-wrap;overflow-wrap:anywhere}
  .pdf-card a{color:inherit}
  .pdf-card table{max-width:100%;border-collapse:collapse}
  @media print{body{padding:0}.card.pdf-card{width:100%;padding:24px}.pdf-background{inset:-16mm;width:calc(100% + 32mm);height:calc(100% + 32mm)}}
 `;doc.head.append(style);
 const card=doc.createElement('article');card.className='card pdf-card has-title';
 card.dataset.font=options.font;card.dataset.fontSize=options.size;
 card.style.setProperty('--card-font-family',options.fontStack);
 const header=doc.createElement('div');header.className='cardbar';
 const title=doc.createElement('div');title.className='map-title';title.textContent=options.title;header.append(title);
 const body=doc.createElement('div');body.className='cardbody';body.innerHTML=options.html;
 const backdrop=doc.createElement('img');backdrop.className='pdf-background';backdrop.alt='';backdrop.src=window.conceptVillagePdfBackground;
 card.append(header,body);doc.body.append(backdrop,card);
 for(const element of card.querySelectorAll('[src],[href]')){
  for(const attribute of ['src','href']){
   const value=element.getAttribute(attribute);
   if(value&&!value.startsWith('#'))element.setAttribute(attribute,new URL(value,options.baseURL).href);
  }
 }
 doc.close();
 await Promise.race([Promise.all(styles),new Promise(resolve=>setTimeout(resolve,1200))]);
 await doc.fonts.ready;
 await Promise.all([...doc.querySelectorAll('img')].map(img=>img.decode().catch(()=>{})));
 // A new print tab may be in the background, where animation frames are suspended.
 doc.body.getBoundingClientRect();
 if(!tab.closed){tab.focus();tab.print()}
};
