import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright-core';

const base=process.env.CROW_TEST_URL||'http://127.0.0.1:8806/';
const output=new URL('../_debug/scene-author/',import.meta.url);
await mkdir(output,{recursive:true});
const imageUrl='data:image/jpeg;base64,'+(await readFile(new URL('../dist/images/author-default.jpeg',import.meta.url))).toString('base64');
async function until(predicate){for(let i=0;i<500;i++){if(await predicate())return;await delay(20)}throw Error('Timed out waiting for concurrent requests')}
const browser=await chromium.launch({executablePath:process.env.CROW_BROWSER_EXECUTABLE,args:['--no-sandbox']});
try{
 for(const [width,height] of [[320,568],[390,844],[430,932],[740,390],[390,380],[1280,844]]){
  const context=await browser.newContext({viewport:{width,height},acceptDownloads:true});
  const jobs=[],errors=[];
  let action=null, actionName='author_scene';
  const chatRequests=[];
  await context.route('**/api/chat',async route=>{
   const body=route.request().postDataJSON();chatRequests.push(body);
   await route.fulfill({json:body.message?{conversationId:'author-chat',calls:[{call_id:'author-'+chatRequests.length,name:actionName,arguments:JSON.stringify(action)}]}:{conversationId:'author-chat',text:'Author controls updated.',calls:[]}});
  });

  await context.route('**/config.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
  await context.route('**/api/status',route=>route.fulfill({json:{capabilities:{chat:true,panorama:true},traveller:{}}}));
  await context.route('**/app.js*',route=>route.fulfill({contentType:'text/javascript',body:`
   window.mapContext={mapReady:true,destination:{name:'Singapore',lat:1.29,lng:103.85},spot:{name:'Padang, Singapore',lat:1.29,lng:103.85},savedPlaces:[]};
   window.mapCamera={rotation:0,tilt:65,zoom:1};
   window.CrowMap={getContext:()=>window.mapContext,getCameraView:()=>({...window.mapCamera}),setCameraView(next){Object.assign(window.mapCamera,next);document.dispatchEvent(new CustomEvent('crow:camera'));},pause(){},async landAt(place){window.mapContext.spot=place;document.dispatchEvent(new CustomEvent('crow:context',{detail:window.mapContext}));return {status:'landed'}}};
   document.getElementById('loading').hidden=true;
  `}));
  await context.route('**/panorama.js*',route=>route.fulfill({contentType:'text/javascript',body:`
   export class PanoramaViewer{constructor(view){this.canvas=document.createElement('canvas');this.canvas.width=512;this.canvas.height=256;view.replaceChildren(this.canvas)}render(){const c=this.canvas.getContext('2d');c.fillStyle='#16483d';c.fillRect(0,0,512,256)}async load(){this.render()}destroy(){}}
  `}));
  await context.route('**/api/panorama',route=>route.fulfill({json:{imageUrl}}));
  await context.route('**/api/portrait',async route=>{
   const job={body:route.request().postDataJSON()};
   const result=new Promise(resolve=>{job.finish=resolve});jobs.push(job);
   const failure=await result;
   await route.fulfill(failure?{status:429,json:{error:{message:'Image limit reached. Try again later.'}}}:{json:{imageUrl}}).catch(()=>{});
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  const author=page.getByRole('button',{name:'Author · picture me here',exact:true});
  const ready=()=>page.locator('.author-variation[data-state=ready]').count();
  try{
   await page.goto(new URL('explore.html',base).href);
   await page.waitForFunction(()=>!document.getElementById('generate-scene').disabled);
   await page.locator('#generate-scene').evaluate(button=>button.click());
   await page.locator('#panorama-dialog').waitFor();
   await author.click();
   await until(()=>jobs.length===3);
   assert.equal(await page.locator('.author-variation[data-state=pending]').count(),3,'All three start before any response');
   assert.equal(new Set(jobs.map(job=>job.body.scene)).size,3);
   assert(jobs.every(job=>job.body.photo.startsWith('data:image/')&&job.body.sceneImage.startsWith('data:image/jpeg')));
   await page.locator('#panorama-dialog').evaluate(el=>el.scrollTop=0);
   await page.screenshot({path:new URL(`loading-${width}x${height}.png`,output).pathname});
   jobs[2].finish();await until(async()=>await ready()===1);
   assert.equal(await page.locator('.author-selected-label').textContent(),'Variation 03');
   jobs[0].finish();jobs[1].finish(true);
   await until(()=>page.locator('.author-more').isEnabled());
   assert.equal(await ready(),2);
   assert.equal(await page.locator('.author-variation-error').textContent(),'Image limit reached. Try again later.');
   await page.getByRole('button',{name:'Retry variation 2',exact:true}).click();
   await until(()=>jobs.length===4);assert.equal(jobs[3].body.scene,jobs[1].body.scene);
   jobs[3].finish();await until(async()=>await ready()===3);
   await page.getByRole('button',{name:'Show variation 1',exact:true}).click();
   const download=page.waitForEvent('download');await page.locator('.author-save').click();
   assert.equal((await download).suggestedFilename(),'author-scene-1.jpg');
   await page.locator('#author-direction').fill('Closer portrait, a blue jacket, natural smile.');
   await page.getByRole('button',{name:'Generate 3 more'}).click();
   await until(()=>jobs.length===7);
   assert.equal(await ready(),3,'Keep the previous batch');
   assert(jobs.slice(4).every(job=>job.body.scene.includes('Closer portrait, a blue jacket, natural smile.')&&job.body.scene.length<=600));
   await page.locator('.author-more').evaluate(button=>button.click());assert.equal(jobs.length,7,'No duplicate batch while generating');
   for(const job of jobs.slice(4))job.finish();
   await until(async()=>await ready()===6);
   await page.locator('#panorama-dialog').evaluate(el=>el.scrollTop=0);
   await page.screenshot({path:new URL(`ready-${width}x${height}.png`,output).pathname});
   const bounds=await page.locator('#panorama-dialog').evaluate(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,overflow:el.scrollWidth>el.clientWidth,viewport:innerWidth}));
   assert(bounds.left>=0&&bounds.right<=bounds.viewport&&!bounds.overflow);
   await page.getByRole('button',{name:'Generate 3 more'}).click();await until(()=>jobs.length===10);
   await page.getByRole('button',{name:'Stop',exact:true}).click();
   for(const job of jobs.slice(7))job.finish();
   await delay(100);assert.equal(await ready(),6,'Late responses after Stop ignored');
   await page.getByRole('button',{name:'Crow',exact:true}).click();await author.click();assert.equal(jobs.length,10,'Mode switch does not auto-retry');
   assert.equal(await page.locator('#author-direction').inputValue(),'Closer portrait, a blue jacket, natural smile.');
   await page.getByRole('button',{name:'Retry unfinished',exact:true}).click();await until(()=>jobs.length===13);
   await page.locator('#panorama-close').click();for(const job of jobs.slice(10))job.finish();
   await page.locator('#reopen-scene').evaluate(button=>button.click());await author.click();
   await delay(100);assert.equal(await ready(),6,'Closing cancels without losing completed results');
   await page.getByRole('button',{name:'Retry unfinished',exact:true}).click();await until(()=>jobs.length===16);
   await page.evaluate(()=>{window.mapContext.spot={name:'Kyoto, Japan',lat:35,lng:135};document.dispatchEvent(new CustomEvent('crow:context',{detail:window.mapContext}))});
   for(const job of jobs.slice(13))job.finish();
   await page.locator('#panorama-dialog').waitFor({state:'hidden'});
   await page.locator('#generate-scene').evaluate(button=>button.click());await author.click();await until(()=>jobs.length===19);
   assert.equal(await ready(),0,'A new scene discards old variations');
   assert.equal(await page.locator('#author-direction').inputValue(),'');
   assert(jobs.slice(16).every(job=>job.body.destination.name==='Kyoto, Japan'));
   await page.emulateMedia({reducedMotion:'reduce'});
   assert.equal(await page.locator('.author-progress-mark').evaluate(el=>getComputedStyle(el,'::after').animationName),'none');
   for(const job of jobs.slice(16))job.finish();await until(async()=>await ready()===3);
   async function command(command,direction='',variation=0){
    action={command,direction,variation};
    await page.locator('#chat-input').fill('Author '+command);
    await page.locator('#chat-send').click();
    await until(()=>page.locator('#chat-send').isVisible());
    await page.waitForFunction(()=>!document.getElementById('chat-input').getAttribute('aria-busy')||document.getElementById('chat-input').getAttribute('aria-busy')==='false');
   }
   await page.locator('#panorama-close').click();
   await page.evaluate(()=>{window.mapContext.spot=null;window.mapContext.position={lat:1.3,lng:103.8};document.dispatchEvent(new CustomEvent('crow:context',{detail:window.mapContext}))});
   await page.locator('#chat-open').click();
   await command('open');
   await until(()=>jobs.length===22);
   assert(jobs.slice(19).every(job=>job.body.destination.name==='Current crow location'),'Author request lands at the crow position when needed');
   assert(await page.locator('#panorama-dialog #companion').isVisible(),'Chat belongs to the modal top layer');
   await page.locator('#chat-input').focus();
   assert(await page.locator('#chat-input').evaluate(el=>el===document.activeElement),'Composer remains interactive inside scene');
   const chatBounds=await page.locator('#companion').boundingBox();
   const sceneBounds=await page.locator('#panorama-dialog').boundingBox();
   await page.screenshot({path:new URL(`chat-${width}x${height}.png`,output).pathname});
   assert(chatBounds.x>=0&&chatBounds.y>=0&&chatBounds.x+chatBounds.width<=width+1&&chatBounds.y+chatBounds.height<=height+1,'Chat stays in viewport');
   assert(width<=600?sceneBounds.y+sceneBounds.height<=chatBounds.y+2:sceneBounds.x+sceneBounds.width<=chatBounds.x+2,'Scene and chat do not overlap');
   await page.screenshot({path:new URL(`chat-${width}x${height}.png`,output).pathname});
   jobs[19].finish();jobs[20].finish(true);jobs[21].finish();
   await until(()=>page.locator('.author-more').isEnabled());
   await command('status');
   const latest=chatRequests.at(-1);
   assert.equal(latest.context.author.variations.filter(item=>item.state==='ready').length,2);
   assert(!JSON.stringify(latest.context.author).includes('data:image/'),'Image bytes stay out of chat context');
   assert.deepEqual(Object.keys(latest.context.author.variations[0]).sort(),['id','state']);
   await command('select','',3);
   assert.equal(await page.locator('.author-selected-label').textContent(),'Variation 03');
   await page.screenshot({path:new URL(`chat-selected-${width}x${height}.png`,output).pathname});
   const chatDownload=page.waitForEvent('download');await command('download','',3);
   assert.equal((await chatDownload).suggestedFilename(),'author-scene-3.jpg');
   await command('retry','',2);await until(()=>jobs.length===23);jobs[22].finish();
   await until(async()=>await ready()===3);
   await command('generate','A red jacket at golden hour.');
   await until(()=>jobs.length===26);
   assert(jobs.slice(23).every(job=>job.body.scene.includes('A red jacket at golden hour.')));
   await command('stop');
   for(const job of jobs.slice(23))job.finish();
   await delay(80);assert.equal(await ready(),3);
   await command('crow');
   assert(await page.locator('#panorama-view').isVisible());
   await command('open');assert.equal(jobs.length,26,'Open reuses completed images');
   await command('reference');
   assert(await page.locator('.author-reference-status').textContent());
   await page.locator('.author-reference-file').setInputFiles(new URL('../dist/images/author-default.jpeg',import.meta.url).pathname);
   await until(()=>page.locator('.author-reference-status').textContent().then(text=>text.includes('updated')));
   assert.equal(await ready(),0,'Changing reference clears incompatible portraits');
   await command('reset_reference');
   await command('generate');await until(()=>jobs.length===29);
   await command('stop');for(const job of jobs.slice(26))job.finish();
   await page.locator('#chat-input').fill('Keep my draft');
   await page.locator('#companion-toggle').click();
   assert(await page.locator('#panorama-dialog #chat-launcher').isVisible());
   await page.locator('#chat-open').click();
   assert.equal(await page.locator('#chat-input').inputValue(),'Keep my draft');
   await page.locator('#chat-input').press('Escape');
   assert(await page.locator('#panorama-dialog').isVisible(),'Escape closes chat before the scene');
   await page.locator('#chat-open').click();
   await command('close');
   assert.equal(await page.locator('#panorama-dialog #companion').count(),0);
   assert(await page.locator('#companion').isVisible(),'Closing scene restores chat to map');

   await command('open');
   assert(await page.locator('#panorama-dialog').isVisible());
   actionName='camera';action={command:'above'};
   await page.locator('#chat-input').fill('Show the map camera from above');
   await page.locator('#chat-send').click();
   await page.waitForFunction(()=>!document.getElementById('panorama-dialog').open&&document.getElementById('chat-input').getAttribute('aria-busy')!=='true');
   assert.equal(await page.evaluate(()=>CrowMap.getCameraView().tilt),0);
   assert(await page.locator('#companion').isVisible(),'Camera commands restore chat from the scene to the map');
   assert.equal(await page.locator('#panorama-dialog #companion').count(),0);

   assert.deepEqual(errors,[]);
   console.log(width+'×'+height+': parallel requests, partial success, retry, comments, more batches, download, cancellation, context reset, reduced motion, chat actions, modal focus, responsive docking, reference changes and chat restoration passed.');
  }finally{for(const job of jobs)job.finish();await context.close()}
 }
}finally{await browser.close()}
