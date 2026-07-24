import * as THREE from 'three';

let scene = null;
export const effects = [];
export function initEffects(s){ scene = s; }

const tracerMat = new THREE.LineBasicMaterial({ color:0xffe6a0, transparent:true,
  opacity:.85, blending:THREE.AdditiveBlending, depthWrite:false });
const puffMat = new THREE.SpriteMaterial({ color:0xcfc4ae, transparent:true,
  opacity:.8, depthWrite:false });

export function spawnTracer(a, b){
  const g = new THREE.BufferGeometry().setFromPoints([a,b]);
  const l = new THREE.Line(g, tracerMat.clone());
  scene.add(l);
  effects.push({ t:0, life:.06, update(e,dt){ e.t+=dt;
    l.material.opacity = .85*(1-e.t/e.life);
    if (e.t>=e.life){ scene.remove(l); l.geometry.dispose(); l.material.dispose(); return false; }
    return true; }});
}
export function spawnPuff(p){
  const s = new THREE.Sprite(puffMat.clone());
  s.position.copy(p); s.scale.setScalar(.18); scene.add(s);
  effects.push({ t:0, life:.22, update(e,dt){ e.t+=dt; const k=e.t/e.life;
    s.scale.setScalar(.18+k*.55); s.material.opacity=.8*(1-k);
    if (e.t>=e.life){ scene.remove(s); s.material.dispose(); return false; }
    return true; }});
}
const decalGeo = new THREE.CircleGeometry(.05, 10);
export function spawnDecal(p, n){
  const m = new THREE.Mesh(decalGeo, new THREE.MeshBasicMaterial({ color:0x20242a,
    transparent:true, opacity:.85, depthWrite:false }));
  m.position.copy(p).addScaledVector(n, .012);
  m.lookAt(p.clone().add(n));
  scene.add(m);
  effects.push({ t:0, life:6, update(e,dt){ e.t+=dt;
    if (e.t > e.life-1) m.material.opacity = .85*(e.life-e.t);
    if (e.t>=e.life){ scene.remove(m); m.material.dispose(); return false; }
    return true; }});
}
export function updateEffects(dt){
  for (let i = effects.length-1; i >= 0; i--)
    if (!effects[i].update(effects[i], dt)) effects.splice(i,1);
}
