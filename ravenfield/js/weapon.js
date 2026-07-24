import * as THREE from 'three';
import { CFG } from './config.js';
import { D2R, clamp, lerp, damp, smooth } from './utils.js';
import { input } from './input.js';
import { player } from './player.js';
import { colliders, raycastTerrain } from './world.js';
import { spawnTracer, spawnPuff, spawnDecal } from './effects.js';
import { markAmmoDirty } from './hud.js';

let camera = null;
export const wpn = {
  mag: CFG.rifle.magSize, reserve: CFG.rifle.reserve,
  reloading:false, reloadT:0, cd:0,
  bloom:0, tempKick:0, zKick:0,
  adsT:0, bobPhase:0, dip:0, shotsFired:0,
};

let gun, muzzleTip, flash, flashLight;

const HIP_POS = new THREE.Vector3(0.26, -0.22, -0.48);
const ADS_POS = new THREE.Vector3(0.0, -0.175, -0.45);
const SPR_POS = new THREE.Vector3(0.29, -0.20, -0.52);
const HIP_ROT = new THREE.Vector3(0.06, -0.04, -0.02);
const ADS_ROT = new THREE.Vector3(0.0, 0.0, 0.0);
const SPR_ROT = new THREE.Vector3(0.08, -0.06, -0.03);

const raycaster = new THREE.Raycaster();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

function dirFromAngles(yaw, pitch, out){
  const cp = Math.cos(pitch);
  return out.set(Math.sin(yaw)*cp, Math.sin(pitch), Math.cos(yaw)*cp).normalize();
}

export function createWeapon(cam){
  camera = cam;
  gun = new THREE.Group();
  camera.add(gun);

  const bodyMat = new THREE.MeshLambertMaterial({ color:0x2a2e35 });
  const darkMat = new THREE.MeshLambertMaterial({ color:0x1a1c20 });
  const accentMat = new THREE.MeshLambertMaterial({ color:0x3a6fd6 });

  function gbox(w,h,d,mat,x,y,z,rx,ry,rz){
    const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
    m.position.set(x,y,z);
    if (rx||ry||rz) m.rotation.set(rx||0,ry||0,rz||0);
    gun.add(m);
    return m;
  }

  gbox(0.09,0.12,0.55,bodyMat, 0,0,-0.18);
  gbox(0.055,0.055,0.52,darkMat, 0,0.02,-0.58);
  gbox(0.07,0.095,0.26,bodyMat, 0,-0.01,0.18);
  gbox(0.05,0.17,0.09,accentMat, 0,-0.13,-0.11, 0.24);
  gbox(0.022,0.055,0.022,accentMat, 0,0.09,-0.18);
  gbox(0.022,0.045,0.022,accentMat, 0,0.085,0.025);

  muzzleTip = new THREE.Object3D();
  muzzleTip.position.set(0, 0.02, -0.86);
  gun.add(muzzleTip);

  flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.22),
    new THREE.MeshBasicMaterial({ color:0xffd555, transparent:true, opacity:0, side:THREE.DoubleSide, depthTest:false })
  );
  flash.position.copy(muzzleTip.position);
  flash.renderOrder = 999;
  gun.add(flash);

  flashLight = new THREE.PointLight(0xffaa33, 0, 3.5);
  flashLight.position.copy(muzzleTip.position);
  gun.add(flashLight);

  gun.position.copy(HIP_POS);
}

export function fireControl(dt){
  const R = CFG.rifle;
  wpn.cd -= dt;
  if (wpn.reloading){
    wpn.reloadT -= dt;
    if (wpn.reloadT <= 0){
      const need = R.magSize - wpn.mag;
      const take = Math.min(need, wpn.reserve);
      wpn.mag += take; wpn.reserve -= take;
      wpn.reloading = false;
      markAmmoDirty();
    }
    return;
  }
  const want = input.trigger;   // (M1 bug: lockout was gating fire rate)
  if (want && wpn.cd <= 0 && wpn.mag > 0){
    shoot();
    wpn.cd = 60 / R.rpm;
  } else if (!input.trigger) {
    wpn.shotsFired = 0;
  }
  if (input.keys.KeyR && wpn.mag < R.magSize && wpn.reserve > 0){
    wpn.reloading = true;
    wpn.reloadT = R.reloadT;
    markAmmoDirty();
  }
}

function shoot(){
  const R = CFG.rifle;
  wpn.mag--;
  markAmmoDirty();
  player.sprintLock = 0.35;             // firing breaks sprint

  // recoil
  wpn.tempKick = R.recoilBase + wpn.shotsFired * R.recoilPerShot;
  wpn.tempKick = clamp(wpn.tempKick, 0, R.recoilMax);
  const horiz = (Math.random()-0.5) * R.recoilHoriz;
  wpn.zKick = horiz;
  wpn.shotsFired++;

  // flash
  flash.material.opacity = 1;
  flashLight.intensity = 2.5;

  // direction with spread
  dirFromAngles(player.yaw + wpn.zKick, player.pitch + wpn.tempKick, _v3);
  const spread = lerp(R.spreadHip, R.spreadAds, smooth(player.sprintT)) + wpn.bloom;
  if (spread > 0){
    const ang = Math.random() * Math.PI * 2;
    const rad = Math.random() * spread;
    _v2.set(0,1,0);
    if (Math.abs(_v3.y) > 0.99) _v2.set(1,0,0);
    _v1.crossVectors(_v3, _v2).normalize();
    _v2.crossVectors(_v3, _v1).normalize();
    _v3.addScaledVector(_v1, Math.cos(ang)*rad).addScaledVector(_v2, Math.sin(ang)*rad).normalize();
  }

  // --- hitscan: props via raycaster, terrain via analytical heightfield ---
  camera.getWorldPosition(_v1);
  raycaster.set(_v1, _v3); raycaster.far = R.range;
  const hits = raycaster.intersectObjects(colliders, false);
  const propHit = hits.length ? hits[0] : null;
  const terrHit = raycastTerrain(_v1, _v3, propHit ? propHit.distance : R.range);
  let end = null, normal = null;
  if (propHit && (!terrHit || propHit.distance <= terrHit.distance)){
    end = propHit.point.clone();
    normal = propHit.face.normal.clone().transformDirection(propHit.object.matrixWorld);
  } else if (terrHit){ end = terrHit.point; normal = terrHit.normal; }
  if (!end) end = _v1.clone().addScaledVector(_v3, R.range);

  // --- feedback ---
  muzzleTip.getWorldPosition(_v2);
  spawnTracer(_v2.clone(), end);
  if (normal){
    spawnPuff(end.clone().addScaledVector(normal, .03));
    if (end.distanceTo(_v1) > 1) spawnDecal(end, normal);
  }
}

export function updateWeapon(dt, speedFactor, grounded, t){
  const R = CFG.rifle;
  const sS = smooth(player.sprintT);
  const wantAds = input.ads;
  const targetAds = wantAds ? 1 : 0;
  wpn.adsT += (targetAds - wpn.adsT) * (1 - Math.exp(-6*dt));
  const sA = smooth(wpn.adsT);

  // position/rotation blend
  gun.position.lerpVectors(HIP_POS, ADS_POS, sA);
  gun.rotation.x = lerp(HIP_ROT.x, ADS_ROT.x, sA) + (wantAds?0:lerp(SPR_ROT.x,0,sS*speedFactor));
  gun.rotation.y = lerp(HIP_ROT.y, ADS_ROT.y, sA) + (wantAds?0:lerp(SPR_ROT.y,0,sS*speedFactor));
  gun.rotation.z = lerp(HIP_ROT.z, ADS_ROT.z, sA) + (wantAds?0:lerp(SPR_ROT.z,0,sS*speedFactor));

  // kick recovery
  wpn.tempKick = damp(wpn.tempKick, 0, R.recoilRecover, dt);
  wpn.zKick = damp(wpn.zKick, 0, 12, dt);

  // bloom
  wpn.bloom = damp(wpn.bloom, 0, 2.5, dt);

  // landing dip
  if (player.lastFall > 0){ wpn.dip = clamp(player.lastFall*0.010, 0, 0.07); player.lastFall = 0; }
  wpn.dip = damp(wpn.dip, 0, 6, dt);

  // sprint sway
  const sway = sS * speedFactor * Math.sin(t * 10) * 0.006;
  gun.position.x += sway;

  // bob
  if (grounded && speedFactor > 0.05){
    wpn.bobPhase += dt * (6 + speedFactor * 4);
    gun.position.y = lerp(HIP_POS.y, ADS_POS.y, sA) + Math.sin(wpn.bobPhase*2)*0.012*speedFactor*(1-sA);
  }

  player.aimKick = wpn.tempKick;
  camera.position.y = grounded ? Math.sin(wpn.bobPhase*2)*0.018*speedFactor : 0;
  return sA;
}
