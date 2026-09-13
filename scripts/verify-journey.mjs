import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Real Google renderer verification. Does not call paid OpenAI endpoints.
const output = new URL('../_debug/journey-verification/', import.meta.url);
await mkdir(output, {recursive:true});
const browser = await chromium.launch({
  executablePath:process.env.CROW_BROWSER_EXECUTABLE,
  headless:true,
  args:['--no-sandbox'],
});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const context=()=>page.evaluate(()=>window.CrowMap.getContext());
const snapshot=async name=>{await page.screenshot({path:new URL(`${name}.png`,output).pathname});console.log(`Captured ${name}`);};
try{
  await page.goto(process.env.CROW_TEST_URL||'http://127.0.0.1:3000/explore.html');
  await page.waitForFunction(()=>window.CrowMap?.getContext().mapReady,null,{timeout:180000});
  await page.locator('#auto-scene').uncheck();
  await page.locator('[data-destination="Singapore"]').click();
  await page.waitForFunction(()=>window.CrowMap.getContext().mode==='hovering',null,{timeout:45000});
  assert.equal((await context()).destination.name,'Singapore');
  await page.waitForFunction(()=>sceneSteady,null,{timeout:90000});
  await snapshot('01-singapore-arrival');
  await page.locator('#spot-input').fill('The Fullerton Hotel Singapore');
  await page.locator('#spot-form button').click();
  await page.locator('#spot-results button').first().waitFor({timeout:30000});
  assert.match(await page.locator('#spot-results').textContent(),/Fullerton/i);
  await page.locator('#spot-results button').first().click();
  await page.waitForFunction(()=>window.CrowMap.getContext().mode==='landed',null,{timeout:45000});
  const landed=await context();assert.match(landed.spot.name,/Fullerton/i);
  assert.equal(await page.locator('#panorama-dialog').evaluate(e=>e.open),false);
  assert.match(await page.locator('#journey-state').textContent(),/Landed at/);
  const pose=await page.evaluate(()=>crowParts.map(p=>({position:{lat:p.position.lat,lng:p.position.lng,altitude:p.position.altitude},altitudeMode:p.altitudeMode})));
  assert(pose.every(part=>part.altitudeMode==='RELATIVE_TO_MESH'&&Math.abs(part.position.altitude-1.2)<.01));
  await page.waitForFunction(()=>sceneSteady,null,{timeout:90000});
  await page.locator('#scout-close').click();
  await snapshot('02-fullerton-rooftop-landing');
  await page.locator('#fly').click();
  await page.waitForFunction(()=>scoutMode==='taking-off'&&scoutPosition.altitude>15,null,{timeout:10000});
  await snapshot('03-rooftop-lift-off');
  await page.waitForFunction(()=>window.CrowMap.getContext().mode==='hovering',null,{timeout:30000});
  assert.equal((await context()).destination.name,'Singapore');
  assert.equal((await context()).spot,null);
  const airborne=await page.evaluate(()=>crowParts.map(p=>({altitude:p.position.altitude,altitudeMode:p.altitudeMode})));
  assert(airborne.every(part=>part.altitude>45));
  await page.waitForFunction(()=>sceneSteady,null,{timeout:90000});
  await snapshot('04-rooftop-departure');
  await page.locator('#scout-open').click();
  await page.locator('#tab-social').click();
  assert.match(await page.locator('#instagram-status').textContent(),/Connect Instagram/);
  await page.locator('#tab-plan').click();
  await snapshot('05-destination-plan');
  await page.setViewportSize({width:390,height:844});
  await snapshot('06-mobile-plan');
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  assert.equal(overflow,false);
  assert.deepEqual(errors,[]);
  await writeFile(new URL('report.json',output),JSON.stringify({destination:landed.destination,spot:landed.spot,pose,airborne,errors,checks:['real destination flight','Google rooftop place search','terrain-relative touchdown','continuous rooftop takeoff and wing unfold','forward departure after vertical clearance','no auto-generation when disabled','Instagram setup state','mobile layout']},null,2));
  console.log('Real journey checks passed.');
}finally{await browser.close();}
