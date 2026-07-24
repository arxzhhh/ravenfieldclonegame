import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, lerp, smooth } from './utils.js';
import { input } from './input.js';
import { terrainHeight, solids } from './world.js';

export const yawObj = new THREE.Object3D();
export const pitchObj = new THREE.Object3D();
yawObj.add(pitchObj);

export const player = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(),
  yaw: -Math.PI/2, pitch: 0,           // face +X (toward point B from Eagle spawn)
  grounded: true, prevVy: 0,
  lastFall: 0,                          // consumed by weapon for landing dip
  sprintT: 0, sprintLock: 0,            // owned here; weapon reads/locks
  aimKick: 0,                           // written by weapon (recoil spring)
};

const RADIUS = 0.4, HEIGHT = 1.75, STEP = 0.5;

function collideHoriz(feetY, headY){
  for (const s of solids){
    if (headY <= s.minY + 0.05 || feetY >= s.maxY - 0.05) continue;
    if (s.kind === 'box'){
      if (s.maxY > feetY && s.maxY - feetY <= STEP) continue; // low enough to step up
      const cx = clamp(player.pos.x, s.minX, s.maxX);
      const cz = clamp(player.pos.z, s.minZ, s.maxZ);
      const dx = player.pos.x - cx, dz = player.pos.z - cz;
      const d2 = dx*dx + dz*dz;
      if (d2 < RADIUS*RADIUS){
        if (d2 > 1e-6){ const d = Math.sqrt(d2), push = RADIUS - d;
          player.pos.x += dx/d*push; player.pos.z += dz/d*push; }
        else { // center inside: eject along shallowest axis
          const px = s.maxX-player.pos.x, nx = player.pos.x-s.minX;
          const pz = s.maxZ-player.pos.z, nz = player.pos.z-s.minZ;
          const m = Math.min(px,nx,pz,nz);
          if (m===px) player.pos.x = s.maxX+RADIUS;
          else if (m===nx) player.pos.x = s.minX-RADIUS;
          else if (m===pz) player.pos.z = s.maxZ+RADIUS;
          else player.pos.z = s.minZ-RADIUS;
        }
      }
    } else { // cylinder (trees, rocks)
      const dx = player.pos.x-s.x, dz = player.pos.z-s.z;
      const rr = RADIUS+s.r, d2 = dx*dx+dz*dz;
      if (d2 < rr*rr && d2 > 1e-6){ const d = Math.sqrt(d2);
        player.pos.x += dx/d*(rr-d); player.pos.z += dz/d*(rr-d); }
    }
  }
}
function supportHeight(x, z, feetY){
  let floor = terrainHeight(x, z);
  for (const s of solids){ // stand on crate/box tops (step-up or landing from above)
    if (s.kind !== 'box') continue;
    if (x > s.minX-RADIUS*0.5 && x < s.maxX+RADIUS*0.5 &&
        z > s.minZ-RADIUS*0.5 && z < s.maxZ+RADIUS*0.5 &&
        s.maxY > floor && s.maxY <= feetY + STEP) floor = s.maxY;
  }
  return floor;
}

export function updatePlayer(dt){
  const P = CFG.player;
  if (input.locked){
    player.yaw -= input.dx * P.sens;
    player.pitch = clamp(player.pitch - input.dy * P.sens, -1.55, 1.55);
  }
  input.dx = input.dy = 0;

  const k = input.keys;
  const f = (k.KeyW?1:0)-(k.KeyS?1:0), s = (k.KeyD?1:0)-(k.KeyA?1:0);
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  let wx = -sy*f + cy*s, wz = -cy*f - sy*s;
  const wl = Math.hypot(wx,wz); if (wl > 1){ wx/=wl; wz/=wl; }

  player.sprintLock -= dt;
  const wantSprint = (k.ShiftLeft||k.ShiftRight) && k.KeyW && !input.ads && player.sprintLock<=0;
  player.sprintT += ((wantSprint?1:0) - player.sprintT) * (1 - Math.exp(-10*dt));
  const targetSpeed = lerp(P.walk, P.sprint, smooth(player.sprintT)) * (input.ads ? P.adsSpeed : 1);

  const lam = player.grounded ? P.groundLambda : P.airLambda;
  const kk = 1 - Math.exp(-lam*dt);
  player.vel.x += (wx*targetSpeed - player.vel.x)*kk;
  player.vel.z += (wz*targetSpeed - player.vel.z)*kk;
  player.vel.y -= P.gravity*dt;
  if (input.locked && k.Space && player.grounded){ player.vel.y = P.jump; player.grounded = false; }

  player.prevVy = player.vel.y;
  player.pos.x += player.vel.x*dt;
  player.pos.z += player.vel.z*dt;
  const feetY0 = player.pos.y - P.eye;
  collideHoriz(feetY0, feetY0 + HEIGHT);
  player.pos.y += player.vel.y*dt;
  const feetY = player.pos.y - P.eye;
  const floor = supportHeight(player.pos.x, player.pos.z, feetY);
  if (player.pos.y <= floor + P.eye){
    if (!player.grounded && player.prevVy < -7) player.lastFall = -player.prevVy;
    player.pos.y = floor + P.eye; player.vel.y = 0; player.grounded = true;
  } else player.grounded = false;
  player.pos.x = clamp(player.pos.x, -250, 250);
  player.pos.z = clamp(player.pos.z, -250, 250);

  yawObj.position.copy(player.pos);
  yawObj.rotation.y = player.yaw;
  pitchObj.rotation.x = clamp(player.pitch + player.aimKick, -1.55, 1.55);
}
