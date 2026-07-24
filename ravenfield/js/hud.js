import { CFG } from './config.js';
import { lerp } from './utils.js';
import { wpn } from './weapon.js';

let elMag, elRes, elHint, elFps, chU, chD, chL, chR, crosshair;
let ammoDirty = true;
export function markAmmoDirty(){ ammoDirty = true; }

export function initHUD(){
  elMag = document.querySelector('#ammo .mag'); elRes = document.querySelector('#ammo .res');
  elHint = document.getElementById('hint'); elFps = document.getElementById('fps');
  chU = document.querySelector('.bU'); chD = document.querySelector('.bD');
  chL = document.querySelector('.bL'); chR = document.querySelector('.bR');
  crosshair = document.getElementById('crosshair');
}
export function setFps(v){ elFps.textContent = v+' fps'; }
export function updateHUD(sA){
  if (ammoDirty){ elMag.textContent = wpn.mag; elRes.textContent = '/ '+wpn.reserve; ammoDirty=false; }
  elHint.textContent = wpn.reloading ? 'RELOADING'
    : (wpn.mag===0 && wpn.reserve>0) ? 'PRESS R TO RELOAD' : '';
  const gap = 5 + ((lerp(CFG.rifle.spreadHip, CFG.rifle.spreadAds, sA) + wpn.bloom) * 26);
  chU.style.transform = `translateY(${-gap}px)`; chD.style.transform = `translateY(${gap}px)`;
  chL.style.transform = `translateX(${-gap}px)`; chR.style.transform = `translateX(${gap}px)`;
  crosshair.style.opacity = sA > .5 ? 0 : 1;
}
