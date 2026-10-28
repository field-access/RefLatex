/* Package only the renderer, its active assets and the WebView2 loader. */
const fs=require('node:fs'),path=require('node:path');
const sharp=require('sharp');
const root=path.resolve(__dirname,'../..'),cache=path.resolve(process.argv[2]||path.join(root,'.desktop-cache'));
const out=path.resolve(process.argv[3]||path.join(root,'dist/ConceptCards-Windows'));
const read=file=>fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');
const manifest=JSON.parse(read(path.join(cache,'remote-resources.json')));
const renderer=path.join(out,'renderer');
function copy(from,to){fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to)}
function write(file,text){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text)}
function localize(text){for(const [url,file] of Object.entries(manifest))text=text.split(url).join('https://conceptcards.local/'+file);return text}
(async()=>{
 fs.mkdirSync(renderer,{recursive:true});
 for(const name of ['index.html','app.js','styles.css','canvas-files.js','canvas-recovery.js','text-highlights.js','card-pdf.js','village.js','favicon.svg']){
  let content=read(path.join(root,name));
  if(name==='index.html'||name==='app.js')content=content.replace(/<link rel="preconnect"[^>]*>\r?\n?/g,'');
  if(name==='app.js'){
   const fontURL='return spec?`https://fonts.googleapis.com/css2?family=${spec[0]}:${spec[1]}&display=swap`:"";';
   if(!content.includes(fontURL))throw Error('The font URL helper changed; update the offline packaging rule.');
   content=content.replace(fontURL,'return spec?`https://conceptcards.local/vendor/font-${key}.css`:"";');
  }
  if(name==='index.html'||name==='app.js')content=localize(content);
  write(path.join(renderer,name),content);
 }
 for(const name of ['sun.webp','moon.webp','ocean.webp','night_sky_background.webp','village.webp','village-paper.webp','village-worker.js','village-pdf.js','village-LICENSE.txt','village-attribution.md'])copy(path.join(root,'assets/backgrounds',name),path.join(renderer,'assets/backgrounds',name));
 for(const relative of new Set(Object.values(manifest))){
  const source=path.join(cache,relative),destination=path.join(renderer,relative);
  let content=relative.endsWith('.css')?read(source):null;
  // WebView2 supports WOFF2; KaTeX's older WOFF/TTF alternatives add no value.
  if(relative==='vendor/katex.min.css')content=content.replace(/,url\(fonts\/[^)]+\.(woff|ttf)\) format\("[^"]+"\)/g,'');
  if(content!==null){
   write(destination,content);
   for(const match of content.matchAll(/url\(([^)]+)\)/g)){
    let font=match[1].replace(/^['"]|['"]$/g,'');
    if(font.startsWith('https://conceptcards.local/'))font=font.slice('https://conceptcards.local/'.length);
    else if(font.startsWith('fonts/'))font='vendor/'+font;
    else throw Error('Unexpected font URL in packaged CSS: '+font);
    copy(path.join(cache,font),path.join(renderer,font));
   }
  }else copy(source,destination);
 }
 fs.cpSync(path.join(cache,'vendor/licenses'),path.join(renderer,'vendor/licenses'),{recursive:true});
 copy(path.join(cache,'webview2/LICENSE.txt'),path.join(renderer,'vendor/licenses/WebView2-LICENSE.txt'));
 copy(path.join(cache,'webview2/NOTICE.txt'),path.join(renderer,'vendor/licenses/WebView2-NOTICE.txt'));
 write(path.join(out,'remote-resources.json'),JSON.stringify(manifest,null,2));
 copy(path.join(__dirname,'desktop-bridge.js'),path.join(out,'desktop-bridge.js'));
 for(const name of ['Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll'])copy(path.join(cache,'webview2/lib/net462',name),path.join(out,name));
 copy(path.join(cache,'webview2/runtimes/win-x64/native/WebView2Loader.dll'),path.join(out,'WebView2Loader.dll'));
 copy(path.join(__dirname,'README.md'),path.join(out,'README.md'));
 const png=await sharp(path.join(root,'favicon.svg')).resize(256,256).png().toBuffer();
 const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico[8]=0;ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);
 write(path.join(cache,'ConceptCards.ico'),Buffer.concat([ico,png]));
 console.log('Renderer packaged at '+out);
})().catch(error=>{console.error(error);process.exitCode=1});
