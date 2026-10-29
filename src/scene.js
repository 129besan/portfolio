/** Lightweight WebGPU atmospheric field, with Canvas 2D fallback. No dependencies. */
const SHADER = /* wgsl */ `
struct Uniforms { resolution: vec2f, pointer: vec2f, time: f32, intensity: f32, padding: vec2f }
@group(0) @binding(0) var<uniform> u: Uniforms;
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1,311.7))) * 43758.5453); }
fn noise(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let t = f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2f(1,0)),t.x),mix(hash(i+vec2f(0,1)),hash(i+vec2f(1,1)),t.x),t.y);
}
@vertex fn vs(@builtin(vertex_index) idx:u32) -> @builtin(position) vec4f {
  let points = array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
  return vec4f(points[idx],0,1);
}
@fragment fn fs(@builtin(position) px:vec4f) -> @location(0) vec4f {
  let uv = px.xy / u.resolution;
  let ratio = u.resolution.x/u.resolution.y;
  let p = vec2f((uv.x-.66)*ratio,(uv.y-.44));
  let r = length(p);
  let t = u.time;
  let drift = noise(p*1.7 + vec2f(t*.042,-t*.026));
  let arc = abs(r - (.34 + .075*sin(atan2(p.y,p.x)*3.0 + t*.23 + drift*2.0)));
  let filament = exp(-arc*25.0)*(0.035+0.075*noise(p*6.0+t*.07));
  let haze = exp(-r*r*2.8)*(0.026+0.07*drift);
  let beam = exp(-abs(p.y + .07*sin(p.x*3.3+t*.18))*13.0) * .018;
  let g = fract(uv * vec2f(56.0*ratio,33.0));
  let cell = floor(uv * vec2f(56.0*ratio,33.0));
  let spark = select(0.0, pow(1.0-length((g-.5)*2.0),4.0),hash(cell)>.977);
  let core = exp(-r*r*36.0)*.07;
  let pointerDist = length(uv-u.pointer);
  let pointerGlow = exp(-pointerDist*pointerDist*46.0)*.028;
  let strength = u.intensity;
  let color = vec3f(.012,.023,.038)*haze
    + vec3f(.12,.51,.47)*filament
    + vec3f(.10,.31,.39)*(haze+beam)
    + vec3f(.46,.56,.39)*spark*.22
    + vec3f(.18,.42,.40)*(core+pointerGlow);
  return vec4f(color*strength, min(1.0,length(color)*2.3*strength));
}`;

export function startAtmosphere(canvas, isMotionEnabled) {
  const pointer = { x: .5, y: .5 };
  const movePointer = event => {
    pointer.x = event.clientX / Math.max(innerWidth, 1);
    pointer.y = event.clientY / Math.max(innerHeight, 1);
  };
  window.addEventListener('pointermove', movePointer, { passive: true });
  const active = () => !document.hidden && isMotionEnabled();
  let destroyed = false;
  let renderer;
  const controller = { kind: 'CSS', refresh: () => {}, destroy: () => {
    destroyed = true; window.removeEventListener('pointermove', movePointer);
    renderer?.destroy?.();
  }};

  async function start() {
    if (!navigator.gpu) throw new Error('WebGPU unavailable');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'low-power' });
    if (!adapter) throw new Error('No GPU adapter');
    const device = await adapter.requestDevice();
    if (destroyed) { device.destroy(); return; }
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('No GPU canvas context');
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'premultiplied' });
    const module = device.createShaderModule({ code: SHADER });
    const pipeline = device.createRenderPipeline({
      layout: 'auto', vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] }, primitive: { topology: 'triangle-list' },
    });
    const uniformBuffer = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    const group = device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniformBuffer}}]});
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(devicePixelRatio || 1, 1.35);
      const w = Math.max(1, Math.round(rect.width * ratio));
      const h = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== w) canvas.width=w;
      if (canvas.height !== h) canvas.height=h;
    };
    resize();
    const observer = new ResizeObserver(resize); observer.observe(canvas);
    let frame=0, last=0;
    const t0=performance.now();
    let reported=false;
    function draw(now) {
      if(destroyed)return;
      frame=requestAnimationFrame(draw);
      if (!active() && reported) return;
      if(active() && now-last<33)return;
      last=now;
      resize();
      const values=new Float32Array([canvas.width,canvas.height,pointer.x,pointer.y,(now-t0)/1000,1,0,0]);
      device.queue.writeBuffer(uniformBuffer,0,values);
      const encoder=device.createCommandEncoder();
      const pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
      pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.draw(3);pass.end();device.queue.submit([encoder.finish()]);
      reported=true;
    }
    frame=requestAnimationFrame(draw);
    renderer={ destroy:()=>{cancelAnimationFrame(frame);observer.disconnect();device.destroy();} };
    controller.kind='WebGPU';
    controller.refresh=()=>{reported=false;};
    device.lost.then(()=>{ if(!destroyed) {renderer?.destroy?.(); fallback();} });
  }
  function fallback(){
    if(destroyed)return;
    // If this canvas was already configured for WebGPU, use a new 2D canvas.
    const fallbackCanvas=document.createElement('canvas');
    fallbackCanvas.className=canvas.className;
    fallbackCanvas.setAttribute('aria-hidden','true');
    canvas.replaceWith(fallbackCanvas);
    canvas=fallbackCanvas;
    const ctx=canvas.getContext('2d');
    if(!ctx){controller.kind='CSS';return;}
    const dots=Array.from({length:48},(_,i)=>({x:(i*139%401)/401,y:(i*197%389)/389,phase:i*1.7}));
    let frame=0, last=0, t0=performance.now(), painted=false;
    function paint(now){
      if(destroyed)return;
      frame=requestAnimationFrame(paint);
      if(!active()&&painted)return;
      if(active()&&now-last<40)return;
      last=now;
      const ratio=Math.min(devicePixelRatio||1,1.35);
      const w=Math.max(1,Math.round(canvas.clientWidth*ratio)),h=Math.max(1,Math.round(canvas.clientHeight*ratio));
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      ctx.clearRect(0,0,w,h);
      const tick=(now-t0)*.00012;
      ctx.strokeStyle='rgba(117,194,179,.11)';ctx.lineWidth=ratio;
      dots.forEach((p,i)=>{
        const x=(p.x+Math.sin(tick+p.phase)*.019)*w,y=(p.y+Math.cos(tick*.7+p.phase)*.03)*h;
        const other=dots[(i*13+7)%dots.length];
        const ox=(other.x+Math.sin(tick+other.phase)*.019)*w,oy=(other.y+Math.cos(tick*.7+other.phase)*.03)*h;
        const dx=x-ox,dy=y-oy;
        if(dx*dx+dy*dy<w*w*.065){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(ox,oy);ctx.stroke();}
        ctx.fillStyle=i%7===0?'rgba(215,250,117,.5)':'rgba(124,190,184,.36)';ctx.beginPath();ctx.arc(x,y,i%7===0?1.7*ratio:1*ratio,0,Math.PI*2);ctx.fill();
      });
      painted=true;
    }
    frame=requestAnimationFrame(paint);
    renderer={destroy:()=>cancelAnimationFrame(frame)};
    controller.kind='Canvas 2D';controller.refresh=()=>{painted=false;};
  }
  controller.ready=start().catch(()=>fallback()).then(()=>controller.kind);
  return controller;
}