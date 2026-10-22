(()=>{
 const radius=250,margin=1.5,metres=111320,cache=new Map();
 const valid=p=>p&&Number.isFinite(p.lat)&&Number.isFinite(p.lng)&&Math.abs(p.lat)<=90&&Math.abs(p.lng)<=180;
 function inside(p,ring){
  let hit=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
   const a=ring[i],b=ring[j];
   if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;
  }
  return hit;
 }
 function edgeDistance(p,a,b){
  const dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
 }
 function clearance(p,rings){
  if(!inside(p,rings[0])||rings.slice(1).some(ring=>inside(p,ring)))return -1;
  let d=Infinity;
  for(const ring of rings)for(let i=1;i<ring.length;i++)d=Math.min(d,edgeDistance(p,ring[i-1],ring[i]));
  return d;
 }
 function joinRings(members){
  const pending=members.map(m=>m.geometry?.map(p=>p?{lat:p.lat,lng:p.lng??p.lon}:null)).filter(r=>Array.isArray(r)&&r.length>=2&&r.every(valid)),rings=[];
  const same=(a,b)=>a.lat===b.lat&&a.lng===b.lng;
  while(pending.length){
   const ring=pending.shift();
   while(!same(ring[0],ring.at(-1))){
    const i=pending.findIndex(r=>same(r[0],ring.at(-1))||same(r.at(-1),ring.at(-1)));
    if(i<0)break;
    const next=pending.splice(i,1)[0];if(!same(next[0],ring.at(-1)))next.reverse();ring.push(...next.slice(1));
   }
   if(ring.length>=4&&same(ring[0],ring.at(-1)))rings.push(ring);
  }
  return rings;
 }
 function nearest(place,data){
  if(!valid(place)||!Array.isArray(data?.elements))return null;
  const nodes=new Map(data.elements.filter(e=>e.type==='node').map(e=>[e.id,{lat:e.lat,lng:e.lng??e.lon}]).filter(([,p])=>valid(p)));
  const ways=new Map(data.elements.filter(e=>e.type==='way').map(e=>[e.id,{...e,geometry:e.geometry||e.nodes?.map(id=>nodes.get(id))}]));
  const elements=data.elements.filter(e=>e.type!=='node').map(e=>e.type==='way'?ways.get(e.id):{...e,members:e.members?.map(m=>({...m,geometry:m.geometry||ways.get(m.ref)?.geometry}))});
  const scale=metres*Math.max(.001,Math.cos(place.lat*Math.PI/180));
  const project=p=>({x:(((p.lng-place.lng+540)%360)-180)*scale,y:(p.lat-place.lat)*metres});
  let best=null;
  for(const element of elements.slice(0,2000)){
   const tags=element.tags||{};
   if(!tags.building||['no','construction','ruins','demolished','collapsed'].includes(tags.building)||tags.location==='underground'||tags['building:levels']==='0')continue;
   const outers=element.type==='way'?joinRings([element]):joinRings((element.members||[]).filter(m=>m.role==='outer'));
   const holes=element.type==='relation'?joinRings((element.members||[]).filter(m=>m.role==='inner')):[];
   for(const outer of outers){
    if(outer.length>2000)continue;
    const ring=outer.map(project),rings=[ring,...holes.map(r=>r.map(project)).filter(r=>inside(r[0],ring))],origin={x:0,y:0};
    let distance=inside(origin,ring)&&!rings.slice(1).some(r=>inside(origin,r))?0:Infinity;
    if(distance)for(const r of rings)for(let i=1;i<r.length;i++)distance=Math.min(distance,edgeDistance(origin,r[i-1],r[i]));
    if(distance>radius||best&&distance>=best.distance)continue;
    let point=null,pointDistance=Infinity,pointClearance=0;
    const consider=p=>{
     const d=Math.hypot(p.x,p.y);
     const inset=clearance(p,rings);
     if(d<=radius&&inset>=margin&&(inset>pointClearance+.05||Math.abs(inset-pointClearance)<=.05&&d<pointDistance)){point=p;pointDistance=d;pointClearance=inset;}
    };
    consider(origin);
    const minY=Math.max(-radius,Math.min(...ring.map(p=>p.y))),maxY=Math.min(radius,Math.max(...ring.map(p=>p.y)));
    const rows=new Set([Math.max(minY+margin,Math.min(maxY-margin,0))]);
    for(let i=0;i<=64;i++)rows.add(minY+(maxY-minY)*(i+.5)/65);
    for(const p of ring.slice(0,256)){rows.add(p.y+margin*1.5);rows.add(p.y-margin*1.5);}
    for(const y of rows){
     if(y<minY||y>maxY)continue;
     const xs=[];
     for(const r of rings)for(let i=1;i<r.length;i++){
      const a=r[i-1],b=r[i];if((a.y>y)!==(b.y>y))xs.push(a.x+(b.x-a.x)*(y-a.y)/(b.y-a.y));
     }
     xs.sort((a,b)=>a-b);
     for(let i=0;i+1<xs.length;i+=2){
      const a=xs[i]+margin*1.5,b=xs[i+1]-margin*1.5;if(a>b)continue;
      consider({x:Math.max(a,Math.min(b,0)),y});consider({x:(a+b)/2,y});
     }
    }
    if(point)best={distance,lat:place.lat+point.y/metres,lng:((place.lng+point.x/scale+540)%360)-180,building:String(tags.name||'Nearby rooftop').slice(0,150)};
   }
  }
  return best?{...place,lat:best.lat,lng:best.lng,perch:'rooftop',building:best.building}:null;
 }
 async function find(place){
  if(!valid(place))return null;
  const lat=Number(place.lat.toFixed(3)),lng=Number(place.lng.toFixed(3)),key=lat+','+lng;
  if(cache.has(key))return nearest(place,cache.get(key));
  const query=`[out:json][timeout:3];(way[building][building!=no](around:350,${lat},${lng});relation[building][type=multipolygon](around:350,${lat},${lng}););out geom;`;
  const dy=350/metres,dx=dy/Math.max(.001,Math.cos(lat*Math.PI/180));
  const urls=['https://overpass-api.de/api/interpreter?data='+encodeURIComponent(query)];
  if(lng-dx>=-180&&lng+dx<=180)urls.push('https://api.openstreetmap.org/api/0.6/map.json?bbox='+[lng-dx,Math.max(-90,lat-dy),lng+dx,Math.min(90,lat+dy)].join(','));
  for(const [i,url] of urls.entries()){
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),i?6000:4000);
   try{
    const response=await fetch(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
    if(!response.ok)continue;
    const text=await response.text();if(text.length>4000000)continue;
    const data=JSON.parse(text);if(!Array.isArray(data.elements))continue;
    if(cache.size>=4)cache.delete(cache.keys().next().value);cache.set(key,data);
    return nearest(place,data);
   }catch{}finally{clearTimeout(timer);}
  }
  return null;
 }
 window.CrowRooftops={find,nearest};
})();
