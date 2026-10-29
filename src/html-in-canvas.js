/**
 * Native HTML-in-Canvas + WebGPU interactive card (Chrome 157+).
 * The DOM remains the source of truth; in other browsers the regular HTML card stays visible.
 * WebGPU rasterization follows developer.chrome.com/docs/web-platform/html-in-canvas/webgpu
 */
const SHADER=/* wgsl */ `
struct Uniforms { rect: vec4f, extra: vec4f }
@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var<uniform> uniforms: Uniforms;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {
  let vertices=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
  return vec4f(vertices[i],0,1);
}
@fragment fn fs(@builtin(position) p:vec4f)->@location(0) vec4f {
  let v=(p.xy-uniforms.rect.xy)/uniforms.rect.zw;
  if(v.x<0.0||v.y<0.0||v.x>1.0||v.y>1.0){return vec4f(0);}
  let color=textureSample(tex,smp,v);
  let scan=.985+.015*sin(p.y*1.8+uniforms.extra.x*2.3);
  let edge=pow(1.0-abs(v.x*2.0-1.0),9.0)*.026;
  return vec4f(color.rgb*scan+vec3f(.18,.24,.12)*edge*color.a,color.a);
}`;

export function supportsHtmlInCanvas(){
  const test=document.createElement('canvas');
  test.setAttribute('content','drawable');
  return test.content==='drawable';
}

export async function initHtmlInCanvas({canvas,fallback,motionEnabled}){
  if (!supportsHtmlInCanvas() || !navigator.gpu || !(globalThis.GPUQueue && 'drawElementImageToTexture' in GPUQueue.prototype)) return false;
  // Clone the *actual* interactive HTML into the drawable subtree, do not make a screenshot.
  const original=fallback.querySelector('.signal-card');
  const card=original.cloneNode(true);
  card.removeAttribute('id');
  card.id='signal-gpu-card';
  card.setAttribute('drawable','');
  canvas.append(card);

  let device,observer,frame=0,texture,lastWidth=0,lastHeight=0,context,drawn=false,firstPaint=false;
  try {
    const adapter=await navigator.gpu.requestAdapter({powerPreference:'low-power'});
    if(!adapter)throw new Error('WebGPU unavailable');
    device=await adapter.requestDevice();
    context=canvas.getContext('webgpu');
    if(!context)throw new Error('WebGPU canvas unavailable');
    const format=navigator.gpu.getPreferredCanvasFormat();
    context.configure({device,format,alphaMode:'premultiplied'});
    const module=device.createShaderModule({code:SHADER});
    const pipeline=device.createRenderPipeline({
      layout:'auto',vertex:{module,entryPoint:'vs'},
      fragment:{module,entryPoint:'fs',targets:[{format,blend:{color:{srcFactor:'src-alpha',dstFactor:'one-minus-src-alpha',operation:'add'},alpha:{srcFactor:'one',dstFactor:'one-minus-src-alpha',operation:'add'}}}]},
      primitive:{topology:'triangle-list'}
    });
    const uniform=device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
    const sampler=device.createSampler({magFilter:'linear',minFilter:'linear'});
    let group;
    const configure=()=>{
      const rect=canvas.getBoundingClientRect();
      const cardWidth=Math.min(365,Math.max(240,rect.width-26));
      if(card.offsetWidth!==cardWidth)card.style.width=cardWidth+'px';
      const dpr=Math.min(devicePixelRatio||1,2);
      const cw=Math.max(1,Math.round(rect.width*dpr));const ch=Math.max(1,Math.round(rect.height*dpr));
      if(canvas.width!==cw)canvas.width=cw;
      if(canvas.height!==ch)canvas.height=ch;
      const size=canvas.getElementImageDefaultSize(card);
      const w=Math.max(1,Math.ceil(size.width));const h=Math.max(1,Math.ceil(size.height));
      if(!texture||w!==lastWidth||h!==lastHeight){
        texture?.destroy();lastWidth=w;lastHeight=h;
        texture=device.createTexture({size:{width:w,height:h},format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});
        group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:texture.createView()},{binding:1,resource:sampler},{binding:2,resource:{buffer:uniform}}]});
        firstPaint=false;
        canvas.requestPaint();
      }
      const x=(rect.width-card.offsetWidth)/2;
      const y=rect.height-card.offsetHeight-16;
      const px=new Float32Array([x*dpr,y*dpr,card.offsetWidth*dpr,card.offsetHeight*dpr,performance.now()/1000,0,0,0]);
      device.queue.writeBuffer(uniform,0,px);
      canvas.updateElementGeometry(card,{canvasTransform:new DOMMatrix().translate(x,y)});
    };
    canvas.addEventListener('paint',()=>{
      try {
        configure();
        device.queue.drawElementImageToTexture({source:card},{texture,size:{width:lastWidth,height:lastHeight}});
        firstPaint=true;
        render();
        if(!drawn){drawn=true;fallback.hidden=true;fallback.setAttribute('aria-hidden','true');canvas.classList.add('is-live');}
      } catch(err){console.warn('HTML-in-Canvas paint error:',err);recover();}
    });
    function render(){
      if(!firstPaint||!texture)return;
      const encoder=device.createCommandEncoder();
      const pass=encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:0}}]});
      pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.draw(3);pass.end();
      device.queue.submit([encoder.finish()]);
    }
    const tick=()=>{
      if(!document.hidden&&motionEnabled()&&firstPaint){
        configure();render();
      }
      frame=requestAnimationFrame(tick);
    };
    observer=new ResizeObserver(()=>{
      try{configure();canvas.requestPaint();}catch(err){console.warn('HTML-in-Canvas resize:',err);}
    });
    observer.observe(canvas);
    configure();canvas.requestPaint();
    frame=requestAnimationFrame(tick);
    // Only toggle the fallback once the browser has successfully painted the native card.
    device.lost.then(()=>recover());
    return true;
  } catch(err) {
    console.warn('HTML-in-Canvas fallback:',err);
    recover();return false;
  }
  function recover(){
    cancelAnimationFrame(frame);observer?.disconnect();
    if(drawn){fallback.hidden=false;fallback.removeAttribute('aria-hidden');canvas.classList.remove('is-live');}
    // No WebGPU means the genuine HTML card remains keyboard-accessible.
    canvas.style.pointerEvents='none';
  }
}