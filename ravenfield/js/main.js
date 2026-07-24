import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp } from './utils.js';
import { initInput, input } from './input.js';
import { buildWorld, updateWorld, spawnPosition, terrainHeight } from './world.js';
import { player, yawObj, pitchObj, updatePlayer } from './player.js';
import { createWeapon, updateWeapon, fireControl } from './weapon.js';
import { initEffects, updateEffects } from './effects.js';
import { initHUD, updateHUD, setFps } from './hud.js';

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8fc3e8);
scene.fog = new THREE.Fog(0x8fc3e8, 180, 560);

const camera = new THREE.PerspectiveCamera(CFG.player.fov, innerWidth/innerHeight, 0.05, 1200);
scene.add(camera);
scene.add(new THREE.HemisphereLight(0xcfe5ff, 0x7a8f5a, 1.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(80, 120, 40);
scene.add(sun);

pitchObj.add(camera);
scene.add(yawObj);

initInput(renderer.domElement, document.getElementById('overlay'));
initEffects(scene);
buildWorld(scene);
createWeapon(camera);
initHUD();

// spawn at Eagle base (point A)
const sp = spawnPosition('eagle', 0);
player.pos.set(sp.x, terrainHeight(sp.x, sp.z) + CFG.player.eye, sp.z);

const clock = new THREE.Clock();
let fpsFrames = 0, fpsTime = 0;
function animate(){
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  updatePlayer(dt);
  const speedFactor = clamp(Math.hypot(player.vel.x, player.vel.z) / CFG.player.sprint, 0, 1);
  const sA = updateWeapon(dt, speedFactor, player.grounded, t);
  scene.updateMatrixWorld();
  if (input.locked) fireControl(dt);
  updateWorld(t);
  updateEffects(dt);
  updateHUD(sA);
  renderer.render(scene, camera);

  fpsFrames++; fpsTime += dt;
  if (fpsTime >= .5){ setFps(Math.round(fpsFrames/fpsTime)); fpsFrames = 0; fpsTime = 0; }
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
