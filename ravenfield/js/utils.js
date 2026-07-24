import * as THREE from 'three';
export const D2R = Math.PI/180;
export const clamp = THREE.MathUtils.clamp;
export const lerp  = THREE.MathUtils.lerp;
export const damp  = THREE.MathUtils.damp;
export const smooth = t => t*t*(3-2*t);
// deterministic RNG so the map scatter is identical every load
export function mulberry32(seed){ return function(){ seed|=0; seed=seed+0x6D2B79F5|0;
  let t=Math.imul(seed^seed>>>15,1|seed); t=t+Math.imul(t^t>>>7,61|t)^t;
  return ((t^t>>>14)>>>0)/4294967296; }; }
export function hash2(x,z){ const s=Math.sin(x*127.1+z*311.7)*43758.5453; return s-Math.floor(s); }
