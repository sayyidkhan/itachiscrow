let photo;
export async function defaultAuthorPhoto(){
 if(!photo)photo=(async()=>{const response=await fetch('images/author-default.jpeg');if(!response.ok)throw Error('Your reference photo could not load. Reload and try again.');const blob=await response.blob();return await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read the reference photo.'));reader.readAsDataURL(blob)})})().catch(error=>{photo=null;throw error});
 return photo;
}
