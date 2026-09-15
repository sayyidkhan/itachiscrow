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
  await context.route('**/config.js',route=>route.fulfill({contentType:'text/javascript',body:''}));
  await context.route('**/api/status',route=>route.fulfill({json:{capabilities:{chat:true,panorama:true},traveller:{}}}));
  await context.route('**/app.js*',route=>route.fulfill({contentType:'text/javascript',body:`
   window.mapContext={mapReady:true,destination:{name:'Singapore',lat:1.29,lng:103.85},spot:{name:'Padang, Singapore',lat:1.29,lng:103.85},savedPlaces:[]};
   window.CrowMap={getContext:()=>window.mapContext,pause(){}};
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
   assert.deepEqual(errors,[]);
   console.log(width+'×'+height+': parallel requests, partial success, retry, comments, more batches, download, cancellation, context reset and reduced motion passed.');
  }finally{for(const job of jobs)job.finish();await context.close()}
 }
}finally{await browser.close()}
