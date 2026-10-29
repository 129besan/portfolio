import { startAtmosphere } from './scene.js';
import { initHtmlInCanvas, supportsHtmlInCanvas } from './html-in-canvas.js';

const qs=(selector,root=document)=>root.querySelector(selector);
const qsa=(selector,root=document)=>[...root.querySelectorAll(selector)];
const prefersReduced=matchMedia('(prefers-reduced-motion: reduce)');
let motionOn=!prefersReduced.matches;
const button=qs('#motion-toggle');
const status=qs('#render-status');
const label=qs('#render-label');
const year=qs('#year');
year.textContent=String(new Date().getFullYear());

function syncMotion(){
  button.textContent=motionOn?'MOTION ON':'MOTION OFF';
  button.setAttribute('aria-pressed',String(motionOn));
  button.setAttribute('aria-label',motionOn?'背景の動きを停止':'背景の動きを再開');
  document.documentElement.classList.toggle('motion-paused',!motionOn);
}
syncMotion();
const scene=startAtmosphere(qs('#atmosphere'),()=>motionOn);
button.addEventListener('click',()=>{motionOn=!motionOn;syncMotion();scene.refresh();});
prefersReduced.addEventListener('change',event=>{
  if(event.matches&&motionOn){motionOn=false;syncMotion();scene.refresh();}
});
scene.ready.then(kind=>{status.classList.toggle('is-active',kind==='WebGPU');label.textContent=`VISUAL ENGINE / ${kind.toUpperCase()}`;});

const signalText={graph:'Find the structure. Prove the behavior.',systems:'From an idea to a working system.'};
function signalHandler(event){
  const choice=event.target.closest('[data-signal]');
  if(!choice)return;
  const card=choice.closest('.signal-card');
  qsa('[data-signal]',card).forEach(btn=>{
    const selected=btn===choice;
    btn.classList.toggle('is-active',selected);
    btn.setAttribute('aria-pressed',String(selected));
  });
  qs('[data-signal-caption]',card).textContent=signalText[choice.dataset.signal];
}
qs('#signal-stage').addEventListener('click',signalHandler);
initHtmlInCanvas({canvas:qs('#html-stage'),fallback:qs('#signal-fallback'),motionEnabled:()=>motionOn})
  .then(enabled=>{if(enabled){status.title='WebGPU + native HTML-in-Canvas supported';}});
if(!supportsHtmlInCanvas())qs('#html-stage').setAttribute('aria-hidden','true');

const reveals=qsa('.reveal');
if('IntersectionObserver' in window && !prefersReduced.matches){
  const observer=new IntersectionObserver(entries=>{
    entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target);}});
  },{threshold:.07,rootMargin:'0px 0px 40px 0px'});
  reveals.forEach((element,index)=>{element.style.transitionDelay=`${Math.min(index%4,3)*75}ms`;observer.observe(element);});
}else reveals.forEach(el=>el.classList.add('is-visible'));

const progress=qs('#scroll-progress');
let scrollRaf=0;
function updateScroll(){
  scrollRaf=0;
  const max=Math.max(1,document.documentElement.scrollHeight-innerHeight);
  progress.style.transform=`scaleX(${Math.min(1,scrollY/max)})`;
}
addEventListener('scroll',()=>{if(!scrollRaf)scrollRaf=requestAnimationFrame(updateScroll);},{passive:true});
addEventListener('resize',updateScroll,{passive:true});updateScroll();

const navLinks=qsa('.main-nav a');
const sectionObserver=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{if(entry.isIntersecting){navLinks.forEach(link=>link.classList.toggle('is-active',link.dataset.nav===entry.target.id));}});
},{rootMargin:'-15% 0px -72% 0px'});
['about','work','approach'].forEach(id=>sectionObserver.observe(document.getElementById(id)));

// A small amount of pointer-following depth is intentionally limited to desktop.
const spot=qs('#cursor-spotlight');
if(matchMedia('(pointer:fine)').matches && !prefersReduced.matches){
  let lastX=0,lastY=0,pointerRaf=0;
  addEventListener('pointermove',event=>{
    lastX=event.clientX;lastY=event.clientY;
    if(!pointerRaf)pointerRaf=requestAnimationFrame(()=>{
      spot.style.left=lastX+'px';spot.style.top=lastY+'px';
      spot.classList.add('is-visible');pointerRaf=0;
    });
  },{passive:true});
  document.addEventListener('pointerleave',()=>spot.classList.remove('is-visible'));
}

const tiltCards=qsa('[data-tilt]');
if(matchMedia('(hover:hover) and (pointer:fine)').matches && !prefersReduced.matches){
  tiltCards.forEach(card=>{
    card.addEventListener('pointermove',event=>{
      if(!motionOn)return;
      const rect=card.getBoundingClientRect();
      const x=(event.clientX-rect.left)/rect.width-.5;
      const y=(event.clientY-rect.top)/rect.height-.5;
      card.style.transform=`perspective(1100px) rotateX(${-y*2.1}deg) rotateY(${x*2.1}deg) translateY(-4px)`;
    },{passive:true});
    card.addEventListener('pointerleave',()=>card.style.transform='');
  });
}
window.addEventListener('pagehide',()=>scene.destroy(),{once:true});