(()=>{
 if(!window.chrome?.webview||location.host!=='conceptcards.local')return;
 let nextId=0;const pending=new Map();
 function request(method,args={}){
  const id=++nextId;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(id);reject(new Error('The Windows app did not respond.'))},120000);
   pending.set(id,{resolve,reject,timer});chrome.webview.postMessage({id,method,args});
  });
 }
 chrome.webview.addEventListener('message',event=>{
  const response=event.data,item=pending.get(response.id);if(!item)return;
  pending.delete(response.id);clearTimeout(item.timer);
  if(response.error){const error=new Error(response.error);error.name=response.name||'Error';item.reject(error)}else item.resolve(response.result);
 });
 function restoreFileHandle(record){
  return {kind:'file',name:record.name,desktopId:record.desktopId,
   queryPermission:async()=> 'granted',requestPermission:async()=> 'granted',
   isSameEntry:async other=>other?.desktopId===record.desktopId,
   async getFile(){const file=await request('readCanvas',{id:record.desktopId});return new File([file.text],file.name,{type:'application/json'})}
  };
 }
 window.ConceptDesktop={restoreFileHandle};
 window.showOpenFilePicker=async options=>{
  const record=await request('openCanvas',{startIn:options?.startIn?.desktopId||null});
  return [restoreFileHandle(record)];
 };
 addEventListener('DOMContentLoaded',async()=>{
  try{
   const record=await request('startupCanvas');
   if(record){const handle=restoreFileHandle(record),file=await handle.getFile();document.dispatchEvent(new CustomEvent('conceptcards-open-native',{detail:{file,handle}}))}
  }catch(error){console.error('Opening Windows canvas:',error)}
 },{once:true});
})();
