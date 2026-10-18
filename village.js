/* Rasterize occasional worker-generated strips; only a bitmap moves each frame. */
(()=>{
 const canvas=document.getElementById('canvas');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 const paper=new Image();
 const pauseButton=document.getElementById('pauseBackground');
 const menuPauseButton=document.getElementById('pauseVillageBackground');
 let userPaused=localStorage.getItem('reflatex-background-paused')==='true';
 let worker=null,image=null,motion=null,next=null,url=null,x=0,width=0,generation=0,seed='';
 let loading=false,loadFailed=false,showing=false;
 function paused(){return userPaused||document.hidden||document.body.classList.contains('camera-moving')}
 function stop(){
  generation++;worker?.terminate();worker=null;motion?.cancel();motion=null;
  image?.remove();image=null;if(url)URL.revokeObjectURL(url);url=null;
  if(next)URL.revokeObjectURL(next);next=null;canvas.classList.remove('village-live');x=0;
 }
 function request(){worker?.postMessage({x,width,seed})}
 async function show(){
  if(!next||!worker||showing)return;
  showing=true;
  const id=generation,readyURL=next;next=null;
  const readyImage=new Image();readyImage.className='village-panorama';readyImage.alt='';readyImage.setAttribute('aria-hidden','true');
  readyImage.style.width=`${width*innerHeight/800}px`;readyImage.src=readyURL;
  try{await readyImage.decode()}catch{URL.revokeObjectURL(readyURL);showing=false;return}
  if(id!==generation||!worker){URL.revokeObjectURL(readyURL);showing=false;return}
  const old=url,oldImage=image,oldMotion=motion;
  url=readyURL;image=readyImage;
  // Keep the finished strip at its final offset until the replacement is decoded.
  canvas.prepend(image);
  canvas.classList.add('village-live');
  motion=image.animate([{transform:'translateX(0)'},{transform:`translateX(${-512*innerHeight/800}px)`}],{duration:30000,fill:'forwards'});
  motion.onfinish=()=>{if(next)show()};
  if(paused())motion.pause();
  oldImage?.remove();oldMotion?.cancel();
  if(old)URL.revokeObjectURL(old);
  showing=false;
  x+=512;request();
 }
 function sync(){
  canvas.classList.toggle('background-user-paused',userPaused);
  const villageActive=canvas.dataset.background==='village';
  pauseButton.disabled=canvas.dataset.background!=='village'||reduced.matches;
  pauseButton.textContent=userPaused?'Resume background':'Pause background';
  pauseButton.setAttribute('aria-pressed',String(userPaused));
  menuPauseButton.hidden=!villageActive;
  menuPauseButton.disabled=reduced.matches;
  menuPauseButton.querySelector('span').textContent=userPaused?'Play Village':'Pause Village';
  menuPauseButton.querySelector('path').setAttribute('d',userPaused?'m9 5 10 7-10 7V5Z':'M9 5v14M15 5v14');
  menuPauseButton.setAttribute('aria-pressed',String(userPaused));
  if(canvas.dataset.background!=='village'||reduced.matches){if(worker)stop();return}
  // Classic scripts can load beside file:// pages; blob workers have a valid origin.
  if(!window.conceptVillageWorkerSource){
   if(loading||loadFailed)return;
   loading=true;
   const script=document.createElement('script');
   script.src='./assets/backgrounds/village-worker.js?v=5';
   script.onload=()=>{loading=false;sync()};
   script.onerror=()=>{loading=false;loadFailed=true};
   document.head.append(script);return;
  }
  if(!worker){
   const id=++generation;
   if(!paper.src)paper.src=window.conceptVillagePaperData;
   const random=crypto.getRandomValues(new Uint32Array(2));
   seed=`${random[0]}-${random[1]}`;
   x=(random[1]%4096)*512;
   width=Math.ceil(innerWidth/innerHeight*800)+1024;
   image=document.createElement('img');image.className='village-panorama';image.alt='';image.setAttribute('aria-hidden','true');
   image.style.width=`${width*innerHeight/800}px`;canvas.prepend(image);
   const workerURL=URL.createObjectURL(new Blob([window.conceptVillageWorkerSource],{type:'text/javascript'}));
   worker=new Worker(workerURL);URL.revokeObjectURL(workerURL);
   worker.onerror=()=>stop();
   worker.onmessage=async event=>{
    const svgURL=URL.createObjectURL(new Blob([event.data.svg],{type:'image/svg+xml'}));
    const source=new Image();source.src=svgURL;
    try{
     await source.decode();
     await paper.decode();
     const raster=document.createElement('canvas');
     raster.width=Math.min(width,2560);raster.height=Math.round(raster.width/width*800);
     const paint=raster.getContext('2d');
     paint.fillStyle=paint.createPattern(paper,'repeat');
     paint.fillRect(0,0,raster.width,raster.height);
     // The reference multiplies white-filled ink shapes over its warm paper.
     paint.globalCompositeOperation='multiply';
     paint.drawImage(source,0,0,raster.width,raster.height);
     // Reuse the already visible overlap; new generation changes only the incoming edge.
     if(image?.naturalWidth){
      const shift=512*image.naturalWidth/width;
      paint.globalCompositeOperation='source-over';
      paint.drawImage(image,shift,0,image.naturalWidth-shift,image.naturalHeight,
       0,0,raster.width-512*raster.width/width,raster.height);
     }
     const blob=await new Promise(resolve=>raster.toBlob(resolve,'image/webp',.8));
     if(id!==generation||!blob)return;
     next=URL.createObjectURL(blob);
     if(!motion||motion.playState==='finished')show();
    }catch{if(id===generation)stop()}
    finally{URL.revokeObjectURL(svgURL)}
   };
   request();
  }
  if(motion){if(paused())motion.pause();else if(motion.playState==='paused')motion.play()}
 }
 new MutationObserver(sync).observe(canvas,{attributes:true,attributeFilter:['data-background']});
 pauseButton.onclick=()=>{
  userPaused=!userPaused;
  localStorage.setItem('reflatex-background-paused',String(userPaused));sync();
 };
 menuPauseButton.onclick=()=>pauseButton.click();
 new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['class']});
 document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
 let resizeTimer;addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{stop();sync()},300)});
 sync();
})();
