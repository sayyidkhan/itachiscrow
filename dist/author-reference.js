let photo;
const storageKey='crow:author-reference:'+new URL('.',import.meta.url).pathname;
export function selectedAuthorPhoto(){
 try{return sessionStorage.getItem(storageKey)||null}catch{return null}
}
export async function authorPhoto(){return selectedAuthorPhoto()||defaultAuthorPhoto()}
export function saveAuthorPhoto(data){
 try{if(data)sessionStorage.setItem(storageKey,data);else sessionStorage.removeItem(storageKey)}
 catch{throw Error('Could not save the photo in this tab. Free some browser storage and try again.')}
}
export async function prepareAuthorPhoto(file){
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||!file.size||file.size>5*1024*1024)throw Error('Choose a JPEG, PNG or WebP photo under 5 MB.');
 const url=URL.createObjectURL(file),img=new Image();
 try{
  img.src=url;
  try{await img.decode()}catch{throw Error('This photo could not be opened. Choose another JPEG, PNG or WebP image.')}
  const scale=Math.min(1,1536/Math.max(img.naturalWidth,img.naturalHeight));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(img,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',.9);
 }finally{URL.revokeObjectURL(url)}
}
export async function defaultAuthorPhoto(){
 if(!photo)photo=(async()=>{const response=await fetch('images/author-default.jpeg');if(!response.ok)throw Error('Your reference photo could not load. Reload and try again.');const blob=await response.blob();return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read the reference photo.'));reader.readAsDataURL(blob)})})().catch(error=>{photo=null;throw error});
 return photo;
}
