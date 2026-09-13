/** Small dependency-free equirectangular viewer; no external image/renderer services. */
export class PanoramaViewer {
  constructor(container) {
    this.container = container;
    this.yaw = 0; this.pitch = -.28; this.fov = 85;
    this.canvas = document.createElement('canvas');
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Generated 360-degree surroundings. Drag or use arrow keys to look around.');
    this.label = document.createElement('span'); this.label.className = 'pano-label';
    this.label.textContent = '360° · Drag to explore';
    container.replaceChildren(this.canvas, this.label);
    this.events = new AbortController();
    const listen = (type, fn, options = {}) => this.canvas.addEventListener(type, fn, { ...options, signal: this.events.signal });
    listen('pointerdown', e => { this.drag = {x:e.clientX,y:e.clientY}; this.canvas.setPointerCapture(e.pointerId); });
    listen('pointermove', e => { if (!this.drag) return; this.yaw -= (e.clientX-this.drag.x)*.004; this.pitch += (e.clientY-this.drag.y)*.004; this.drag={x:e.clientX,y:e.clientY}; this.render(); });
    listen('pointerup', () => this.drag = null); listen('pointercancel', () => this.drag = null);
    listen('wheel', e => { e.preventDefault(); this.fov = Math.max(35,Math.min(100,this.fov+e.deltaY*.04)); this.render(); }, {passive:false});
    listen('keydown', e => {
      if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','Home'].includes(e.key)) return;
      e.preventDefault();
      if (e.key==='ArrowLeft') this.yaw-=.12; if(e.key==='ArrowRight')this.yaw+=.12;
      if (e.key==='ArrowUp') this.pitch+=.1; if(e.key==='ArrowDown')this.pitch-=.1;
      if (e.key==='+')this.fov=Math.max(35,this.fov-5); if(e.key==='-')this.fov=Math.min(100,this.fov+5);
      if (e.key==='Home'){this.yaw=0;this.pitch=-.28;this.fov=85;} this.render();
    });
    this.resize = new ResizeObserver(() => this.render()); this.resize.observe(container);
    listen('webglcontextlost', e => {e.preventDefault(); this.fallback();});
  }
  async load(url) {
    this.url = url;
    const img = new Image(); img.src=url; await img.decode();
    if (this.disposed) return;
    this.yaw=0;this.pitch=-.28;this.fov=85;
    const gl=this.canvas.getContext('webgl',{antialias:false,alpha:false}); this.gl=gl;
    if(!gl){this.fallback();return;}
    const compile=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Panorama shader unavailable');return s;};
    try {
      const vertex=compile(gl.VERTEX_SHADER,'attribute vec2 p; varying vec2 uv; void main(){uv=p;gl_Position=vec4(p,0.,1.);}');
      const fragment=compile(gl.FRAGMENT_SHADER,`precision mediump float; varying vec2 uv; uniform sampler2D photo; uniform float yaw; uniform float pitch; uniform float zoom; uniform float aspect;
      void main(){vec3 d=normalize(vec3(uv.x*aspect*zoom,uv.y*zoom,1.));
      d=vec3(d.x,d.y*cos(pitch)+d.z*sin(pitch),d.z*cos(pitch)-d.y*sin(pitch));
      d=vec3(d.x*cos(yaw)+d.z*sin(yaw),d.y,d.z*cos(yaw)-d.x*sin(yaw));
      vec2 t=vec2(fract(.5+atan(d.x,d.z)/6.2831853),.5-asin(clamp(d.y,-1.,1.))/3.1415927);
      gl_FragColor=texture2D(photo,t);}`);
      const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
      gl.deleteShader(vertex);gl.deleteShader(fragment);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Panorama renderer unavailable');
      this.program=program;gl.useProgram(program);
      this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      const p=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
      this.texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,img);
      this.uniforms=Object.fromEntries(['yaw','pitch','zoom','aspect'].map(k=>[k,gl.getUniformLocation(program,k)]));
      this.render();
    }catch{this.fallback();}
  }
  render(){
    const gl=this.gl;if(this.disposed||!gl||!this.program||!this.uniforms)return;
    this.pitch=Math.max(-1.45,Math.min(1.45,this.pitch));this.yaw%=Math.PI*2;
    const rect=this.container.getBoundingClientRect(),ratio=Math.min(window.devicePixelRatio||1,2);
    const w=Math.max(1,Math.round(rect.width*ratio)),h=Math.max(1,Math.round(rect.height*ratio));
    if(this.canvas.width!==w||this.canvas.height!==h){this.canvas.width=w;this.canvas.height=h;}
    gl.viewport(0,0,w,h);gl.useProgram(this.program);
    gl.uniform1f(this.uniforms.yaw,this.yaw);gl.uniform1f(this.uniforms.pitch,this.pitch);
    gl.uniform1f(this.uniforms.zoom,Math.tan(this.fov*Math.PI/360));gl.uniform1f(this.uniforms.aspect,w/h);
    gl.drawArrays(gl.TRIANGLES,0,6);
  }
  fallback(){
    if(this.disposed)return;
    const img=document.createElement('img');img.src=this.url;img.alt='AI-generated panoramic surroundings with a crow at the center';
    this.label.textContent='Panorama image · 3D viewing unavailable on this device';this.container.replaceChildren(img,this.label);
  }
  destroy(){this.disposed=true;this.events.abort();this.resize.disconnect();if(this.gl){this.gl.deleteTexture(this.texture);this.gl.deleteBuffer(this.buffer);this.gl.deleteProgram(this.program);this.gl.getExtension('WEBGL_lose_context')?.loseContext();}this.container.replaceChildren();}
}
