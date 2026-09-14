import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright-core';

const base=new URL(process.env.CROW_TEST_URL||'http://127.0.0.1:8806/customise.html');
const browser=await chromium.launch({executablePath:process.env.CROW_BROWSER_EXECUTABLE,headless:true,args:['--no-sandbox']});
const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
const page=await context.newPage(),errors=[],requests=[];
page.on('pageerror',error=>errors.push(error.message));
await context.route('**/api/portrait',async route=>{
 requests.push(route.request().postDataJSON());
 await route.fulfill({json:{imageUrl:requests.at(-1).photo}});
});
try{
 await page.goto(base.href);
 await page.getByRole('button',{name:'Change photo',exact:true}).waitFor();
 const chooser=page.waitForEvent('filechooser');
 await page.getByRole('button',{name:'Change photo',exact:true}).click();
 await chooser;
 const fixture=await page.evaluate(()=>{
  const canvas=document.createElement('canvas');canvas.width=80;canvas.height=100;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#58bcab';ctx.fillRect(0,0,80,100);
  return canvas.toDataURL('image/png').split(',')[1];
 });
 await page.locator('#reference-file').setInputFiles({name:'test-reference.png',mimeType:'image/png',buffer:Buffer.from(fixture,'base64')});
 await page.waitForFunction(()=>document.querySelector('#reference-status').textContent.startsWith('Photo ready.'));
 const selected=await page.locator('#reference-preview').getAttribute('src');
 assert(selected.startsWith('data:image/jpeg;base64,'));
 assert.equal(await page.locator('#reference-name').textContent(),'Your photo');
 assert.equal(requests.length,0,'Selecting a photo must not generate or upload it');
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('#reference-name').textContent==='Your photo');
 assert.equal(await page.locator('#reference-preview').getAttribute('src'),selected);
 await page.getByRole('button',{name:'Picture me here'}).click();
 await page.locator('#gallery img').waitFor();
 assert.equal(requests.at(-1).photo,selected,'Studio sends the chosen reference');
 assert.equal(new URL(base).pathname.replace(/customise.html$/,'api/portrait'),new URL(await page.evaluate(()=>window.CrowUrl?.('/api/portrait')||'/api/portrait'),base).pathname);
 for(const file of [
  {name:'wrong.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')},
  {name:'broken.png',mimeType:'image/png',buffer:Buffer.from('broken image')},
  {name:'large.jpg',mimeType:'image/jpeg',buffer:Buffer.alloc(5*1024*1024+1)}
 ]){
  await page.locator('#reference-file').setInputFiles(file);
  await page.waitForFunction(()=>!document.querySelector('#change-reference').disabled);
  assert.match(await page.locator('#reference-status').textContent(),/Choose|could not be opened/);
  assert.equal(await page.locator('#reference-preview').getAttribute('src'),selected,'Invalid selection preserves the previous photo');
 }
 const scenePhotos=await page.evaluate(async()=>{
  const {createSceneAuthor}=await import('./scene-author.js');
  const holder=document.createElement('div');holder.innerHTML='<dialog id="panorama-dialog"><div class="dialog-top"></div><p class="eyebrow"></p><div id="panorama-view"></div><footer class="panorama-footer"></footer></dialog>';document.body.append(holder);
  const canvas=document.createElement('canvas');canvas.width=10;canvas.height=10;
  const scene={spot:{name:'Test destination'}},photos=[];
  createSceneAuthor({getScene:()=>scene,getViewer:()=>({canvas,render(){}}),cancelJourney(){},request:async(path,body)=>{photos.push(body.photo);return {imageUrl:body.photo}}});
  document.querySelector('.scene-mode button:last-child').click();
  const deadline=Date.now()+5000;
  while(photos.length<3&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,10));
  holder.remove();return photos;
 });
 assert.deepEqual(scenePhotos,[selected,selected,selected],'Map Author variations use the chosen reference');
 const other=await browser.newContext();
 const visitor=await other.newPage();await visitor.goto(base.href);
 assert.equal(await visitor.locator('#reference-preview').getAttribute('src'),'images/author-default.jpeg','Another visitor keeps the default');
 await other.close();
 for(const width of [320,390,430,1280]){
  await page.setViewportSize({width,height:844});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`No horizontal overflow at ${width}px`);
  assert(await page.getByRole('button',{name:'Change photo',exact:true}).isVisible());
 }
 await page.setViewportSize({width:390,height:844});
 await page.reload();
 await page.waitForFunction(()=>document.querySelector('#reference-name').textContent==='Your photo');
 await mkdir(new URL('../_debug/author-reference/',import.meta.url),{recursive:true});
 await page.screenshot({path:new URL('../_debug/author-reference/mobile.png',import.meta.url).pathname,fullPage:true});
 await page.getByRole('button',{name:'Use default',exact:true}).click();
 assert.equal(await page.locator('#reference-preview').getAttribute('src'),'images/author-default.jpeg');
 await page.reload();
 await page.getByRole('button',{name:'Picture me here'}).click();
 await page.locator('#gallery img').waitFor();
 assert.notEqual(requests.at(-1).photo,selected,'Reset restores the default generation reference');
 assert.deepEqual(errors,[]);
 console.log('Author reference passed: picker, preview, tab persistence, isolated visitors, invalid files, Studio payload, map scene payloads, reset, and four viewport widths. Provider responses mocked.');
}finally{await browser.close()}
