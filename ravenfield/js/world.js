import * as THREE from 'three';
import { CFG } from './config.js';
import { clamp, lerp, smooth, mulberry32, hash2 } from './utils.js';

export const MAP_SIZE = 520;
export const colliders = [];  // meshes for bullet raycasts (terrain handled analytically)
export const solids = [];     // player collision: {kind:'box',minX,maxX,minZ,maxZ,minY,maxY}
                              //                  | {kind:'cyl',x,z,r,minY,maxY}
export const TEAM_COLORS = { eagle: CFG.team.eagle, raven: CFG.team.raven, neutral: 0xe8e8e8 };

/* ---------------- control points: classic A–E line, central hill ---------------- */
export const controlPoints = [
  { id:'A', x:-200, z: 18, radius:14, owner:'eagle'   },
  { id:'B', x:-100, z:-42, radius:13, owner:'neutral' },
  { id:'C', x:   0, z:  0, radius:15, owner:'neutral' },
  { id:'D', x: 100, z: 42, radius:13, owner:'neutral' },
  { id:'E', x: 200, z:-18, radius:14, owner:'raven'   },
];
export const RUNWAY = { x:-205, z:100, w:150, d:14 };
export function getCP(id){ return controlPoints.find(c => c.id === id); }
const roadPts = controlPoints.map(cp => ({ x:cp.x, z:cp.z }));

/* ---------------- heightfield ---------------- */
function baseHeight(x, z){
  let h = 0;
  h += Math.sin(x*0.0110)*Math.cos(z*0.0130)*5.5;
  h += Math.sin(x*0.0290+1.7)*Math.cos(z*0.0230+0.4)*2.0;
  h += Math.sin(x*0.0055+0.3)*Math.sin(z*0.0070+1.1)*3.5;
  h += 13.0*Math.exp(-(x*x+z*z)/(2*55*55));            // central hill under C
  h += smooth(clamp((Math.hypot(x,z)-238)/45, 0, 1))*16; // rim berm keeps players in-bounds
  return h;
}
const cpAnchors = controlPoints.map(cp =>
  ({ x:cp.x, z:cp.z, r:cp.radius*2.4, target: baseHeight(cp.x, cp.z) }));
const runwayTarget = baseHeight(RUNWAY.x, RUNWAY.z);

export function terrainHeight(x, z){
  let h = baseHeight(x, z);
  for (const a of cpAnchors){                          // flatten capture areas
    const d = Math.hypot(x-a.x, z-a.z);
    if (d < a.r) h = lerp(h, a.target, smooth(1 - d/a.r));
  }
  const dx = Math.max(Math.abs(x-RUNWAY.x)-RUNWAY.w/2, 0);   // flatten airstrip
  const dz = Math.max(Math.abs(z-RUNWAY.z)-RUNWAY.d/2, 0);
  const dr = Math.hypot(dx, dz);
  if (dr < 14) h = lerp(h, runwayTarget, smooth(1 - dr/14));
  return h;
}
export function terrainNormal(x, z, out = new THREE.Vector3()){
  const e = 0.5;
  return out.set(terrainHeight(x-e,z)-terrainHeight(x+e,z), 2*e,
                 terrainHeight(x,z-e)-terrainHeight(x,z+e)).normalize();
}
// Analytical terrain raycast (march + bisection). Cheap enough for 40-bot firefights in M3.
export function raycastTerrain(origin, dir, maxDist){
  const step = 0.8;
  for (let t = step; t < maxDist; t += step){
    const x = origin.x+dir.x*t, y = origin.y+dir.y*t, z = origin.z+dir.z*t;
    if (y - terrainHeight(x, z) <= 0){
      let a = t-step, b = t;
      for (let i=0;i<7;i++){ const m=(a+b)*0.5;
        if (origin.y+dir.y*m - terrainHeight(origin.x+dir.x*m, origin.z+dir.z*m) <= 0) b=m; else a=m; }
      const point = new THREE.Vector3(origin.x+dir.x*b, origin.y+dir.y*b, origin.z+dir.z*b);
      return { point, distance:b, normal: terrainNormal(point.x, point.z) };
    }
  }
  return null;
}

/* ---------------- geometry helpers ---------------- */
function prismGeometry(w, h, d){ // triangular prism (gabled roof), ridge along Z
  const v = [ -w/2,0,d/2,  w/2,0,d/2,  0,h,d/2,  -w/2,0,-d/2,  w/2,0,-d/2,  0,h,-d/2 ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v,3));
  g.setIndex([0,1,2, 3,5,4, 0,2,5, 0,5,3, 1,4,5, 1,5,2, 0,3,4, 0,4,1]);
  g.computeVertexNormals();
  return g;
}
function distToSeg(x,z, ax,az, bx,bz){
  const abx=bx-ax, abz=bz-az;
  const t = clamp(((x-ax)*abx+(z-az)*abz)/(abx*abx+abz*abz||1), 0, 1);
  return Math.hypot(x-(ax+abx*t), z-(az+abz*t));
}
function distToPolyline(x,z){
  let m=1e9;
  for (let i=0;i<roadPts.length-1;i++)
    m=Math.min(m, distToSeg(x,z, roadPts[i].x,roadPts[i].z, roadPts[i+1].x,roadPts[i+1].z));
  return m;
}
function isBuildable(x,z){
  for (const cp of controlPoints) if (Math.hypot(x-cp.x,z-cp.z) < cp.radius+9) return false;
  if (distToPolyline(x,z) < 6.5) return false;
  if (Math.abs(x-RUNWAY.x) < RUNWAY.w/2+10 && Math.abs(z-RUNWAY.z) < RUNWAY.d/2+10) return false;
  return true;
}

/* ---------------- props ---------------- */
function addSolidBox(x, z, hw, hd, minY, maxY){
  solids.push({ kind:'box', minX:x-hw, maxX:x+hw, minZ:z-hd, maxZ:z+hd, minY, maxY });
}
function makeBuilding(scene, w, h, d, x, z, yaw, wallColor, roofColor){
  const g = new THREE.Group();
  const y = terrainHeight(x, z);
  g.position.set(x, y, z); g.rotation.y = yaw;
  const base = new THREE.Mesh(new THREE.BoxGeometry(w,h,d),
    new THREE.MeshLambertMaterial({ color:wallColor, flatShading:true }));
  base.position.y = h/2; g.add(base); colliders.push(base);
  const roof = new THREE.Mesh(prismGeometry(w*1.12, d*0.42, d*1.12),
    new THREE.MeshLambertMaterial({ color:roofColor, flatShading:true }));
  roof.position.y = h; g.add(roof); colliders.push(roof);
  scene.add(g);
  const hw = (Math.abs(Math.cos(yaw))*w + Math.abs(Math.sin(yaw))*d)/2; // yaw only in 90° steps
  const hd = (Math.abs(Math.sin(yaw))*w + Math.abs(Math.cos(yaw))*d)/2;
  addSolidBox(x, z, hw, hd, y, y+h);
}
function makeCrate(scene, s, x, z, baseY = null){
  const y = baseY !== null ? baseY : terrainHeight(x, z);
  const m = new THREE.Mesh(new THREE.BoxGeometry(s,s,s),
    new THREE.MeshLambertMaterial({ color:0x9a7b4f, flatShading:true }));
  m.position.set(x, y+s/2, z); scene.add(m); colliders.push(m);
  addSolidBox(x, z, s/2, s/2, y, y+s);
}
function makeSandbags(scene, len, x, z, yaw){
  const g = new THREE.Group(); const y = terrainHeight(x, z);
  g.position.set(x, y, z); g.rotation.y = yaw;
  const mat = new THREE.MeshLambertMaterial({ color:0xa89877, flatShading:true });
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(len,0.55,0.8), mat); b1.position.y=0.28; g.add(b1);
  const b2 = new THREE.Mesh(new THREE.BoxGeometry(len*0.88,0.4,0.65), mat); b2.position.y=0.72; g.add(b2);
  colliders.push(b1, b2); scene.add(g);
  addSolidBox(x, z, len/2+0.2, len/2+0.2, y, y+0.95); // solid cover (waist-high wall)
}
function makeRock(scene, r, x, z){
  const y = terrainHeight(x, z);
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r,0),
    new THREE.MeshLambertMaterial({ color:0x8b8a82, flatShading:true }));
  m.position.set(x, y+r*0.25, z);
  m.rotation.set(Math.random()*3, Math.random()*3, Math.random()*3);
  scene.add(m); colliders.push(m);
  solids.push({ kind:'cyl', x, z, r:r*0.75, minY:y-r, maxY:y+r*0.7 });
}
function makePine(scene, s, x, z){
  const g = new THREE.Group(); const y = terrainHeight(x, z);
  g.position.set(x, y, z); g.rotation.y = Math.random()*Math.PI;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16*s,0.24*s,1.5*s,6),
    new THREE.MeshLambertMaterial({ color:0x6b4a2f }));
  trunk.position.y = 0.75*s; g.add(trunk); colliders.push(trunk);
  const leaf = new THREE.MeshLambertMaterial({ color:0x3e6b33, flatShading:true });
  [[1.5,2.0,2.2],[1.15,1.7,3.2],[0.8,1.4,4.1]].forEach(([r,h,yy]) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r*s,h*s,7), leaf);
    c.position.y = yy*s*0.75; g.add(c);
  });
  scene.add(g);
  solids.push({ kind:'cyl', x, z, r:0.3*s, minY:y, maxY:y+1.6*s });
}
function makeRoundTree(scene, s, x, z){
  const g = new THREE.Group(); const y = terrainHeight(x, z);
  g.position.set(x, y, z);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18*s,0.26*s,1.8*s,6),
    new THREE.MeshLambertMaterial({ color:0x6b4a2f }));
  trunk.position.y = 0.9*s; g.add(trunk); colliders.push(trunk);
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5*s,0),
    new THREE.MeshLambertMaterial({ color:0x5d8a3a, flatShading:true }));
  crown.position.y = 2.7*s; crown.rotation.y = Math.random()*3; g.add(crown);
  scene.add(g);
  solids.push({ kind:'cyl', x, z, r:0.32*s, minY:y, maxY:y+1.8*s });
}
function makeWindsock(scene, x, z){
  const g = new THREE.Group(); const y = terrainHeight(x, z);
  g.position.set(x, y, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.06,3.2,6),
    new THREE.MeshLambertMaterial({ color:0xcccccc }));
  pole.position.y = 1.6; g.add(pole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.28,1.1,6),
    new THREE.MeshLambertMaterial({ color:0xe8862e }));
  sock.rotation.z = -Math.PI/2; sock.position.set(0.55,3.05,0); g.add(sock);
  scene.add(g);
}

/* ---------------- flags ---------------- */
const flagAnims = [];
function makeFlag(scene, cp){
  const g = new THREE.Group();
  const y = terrainHeight(cp.x, cp.z);
  g.position.set(cp.x, y, cp.z); g.rotation.y = Math.PI/2; // face the attack axis
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55,0.7,0.35,10),
    new THREE.MeshLambertMaterial({ color:0x9a9a94 }));
  base.position.y = 0.17; g.add(base);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.09,6.4,8),
    new THREE.MeshLambertMaterial({ color:0xcfd2d6 }));
  pole.position.y = 3.55; g.add(pole); colliders.push(pole);
  const flagGeo = new THREE.PlaneGeometry(2.3, 1.25, 9, 4);
  flagGeo.translate(1.15, 0, 0); // hinge at pole
  const flagMat = new THREE.MeshLambertMaterial({ color: TEAM_COLORS[cp.owner], side: THREE.DoubleSide });
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.position.set(0.1, 6.0, 0); g.add(flag);
  const ring = new THREE.Mesh(new THREE.RingGeometry(cp.radius-0.5, cp.radius, 48),
    new THREE.MeshBasicMaterial({ color: TEAM_COLORS[cp.owner], transparent:true,
      opacity:0.35, side:THREE.DoubleSide, depthWrite:false }));
  ring.rotation.x = -Math.PI/2; ring.position.y = 0.06; g.add(ring);
  scene.add(g);
  cp.flagMat = flagMat; cp.ringMat = ring.material;
  flagAnims.push({ geo:flagGeo, base:flagGeo.attributes.position.array.slice(), phase:cp.x*0.37 });
}
export function setCPOwner(cp, owner){ // hook for M4 capture logic
  cp.owner = owner;
  cp.flagMat.color.set(TEAM_COLORS[owner]);
  cp.ringMat.color.set(TEAM_COLORS[owner]);
}
export function updateWorld(t){
  for (const f of flagAnims){
    const pos = f.geo.attributes.position, b = f.base;
    for (let i=0;i<pos.count;i++){
      const x = b[i*3];
      pos.array[i*3+2] = Math.sin(x*2.1 - t*6.5 + f.phase) * 0.16 * (x/2.3);
    }
    pos.needsUpdate = true;
    f.geo.computeVertexNormals();
  }
}

/* ---------------- spawn points (M3/M7 will use these) ---------------- */
export function spawnPosition(team, index = 0){
  const cp = team === 'raven' ? controlPoints[4] : controlPoints[0];
  const a = index * 2.39996, r = 3 + (index % 5) * 0.9; // golden-angle scatter
  return { x: cp.x + Math.cos(a)*r, z: cp.z + Math.sin(a)*r };
}

/* ---------------- build everything ---------------- */
export function buildWorld(scene){
  // --- terrain mesh with vertex colors (grass / dirt roads / rock) ---
  const SEG = 140;
  const geo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, SEG, SEG);
  geo.rotateX(-Math.PI/2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count*3);
  const grassA = new THREE.Color(0x7aa34d), grassB = new THREE.Color(0x6b9346),
        dirt = new THREE.Color(0x93794f), rockC = new THREE.Color(0x8d8b7e),
        c = new THREE.Color();
  for (let i=0;i<pos.count;i++){
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    c.copy(grassA).lerp(grassB, hash2(Math.round(x*2), Math.round(z*2)));
    let dk = smooth(clamp(1 - (distToPolyline(x,z)-2.2)/3.0, 0, 1)) * 0.9; // dirt road
    for (const cp of controlPoints){                                       // dirt under flags
      const dcp = Math.hypot(x-cp.x, z-cp.z);
      dk = Math.max(dk, smooth(clamp(1-(dcp-cp.radius*0.5)/(cp.radius*0.9), 0, 1))*0.9);
    }
    c.lerp(dirt, dk);
    c.lerp(rockC, smooth(clamp((h-13)/6, 0, 1)));                          // rocky heights
    colors[i*3]=c.r; colors[i*3+1]=c.g; colors[i*3+2]=c.b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
  geo.computeVertexNormals();
  scene.add(new THREE.Mesh(geo,
    new THREE.MeshLambertMaterial({ vertexColors:true, flatShading:true })));
  // NOTE: terrain is deliberately NOT in colliders — bullets use raycastTerrain().

  // --- airstrip ---
  const strip = new THREE.Mesh(new THREE.PlaneGeometry(RUNWAY.w, RUNWAY.d),
    new THREE.MeshLambertMaterial({ color:0x4b4b50 }));
  strip.rotation.x = -Math.PI/2;
  strip.position.set(RUNWAY.x, runwayTarget+0.06, RUNWAY.z);
  scene.add(strip);
  for (let i=0;i<10;i++){
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(4,0.6),
      new THREE.MeshBasicMaterial({ color:0xd8d8d0 }));
    dash.rotation.x = -Math.PI/2;
    dash.position.set(RUNWAY.x - RUNWAY.w/2 + 12 + i*(RUNWAY.w-24)/9, runwayTarget+0.10, RUNWAY.z);
    scene.add(dash);
  }
  makeWindsock(scene, -140, 88);

  // --- hand-placed structures ---
  const WALL=0xb8b2a6, ROOF=0x8a5a44, CONC=0x9b9b93;
  makeBuilding(scene, 9,3.2,5.5, -224, 34, 0,        WALL, ROOF);   // Eagle base barracks
  makeBuilding(scene, 9,3.2,5.5, -186, 44, Math.PI/2, WALL, ROOF);
  makeBuilding(scene, 9,3.2,5.5,  224,-34, 0,        WALL, ROOF);   // Raven base barracks
  makeBuilding(scene, 9,3.2,5.5,  186,-44, Math.PI/2, WALL, ROOF);
  makeBuilding(scene, 6,2.8,5,   -112,-28, Math.PI/2, WALL, 0x6b4a3a); // B hut
  makeBuilding(scene, 6,2.8,5,    112, 28, Math.PI/2, WALL, 0x6b4a3a); // D hut
  makeBuilding(scene, 5,2.2,4,      9,-11, 0,        CONC, CONC);      // C hill bunker
  makeBuilding(scene, 14,4.5,9,  -252,116, 0,        0x7d8489, 0x666c70); // hangars
  makeBuilding(scene, 14,4.5,9,  -216,116, 0,        0x7d8489, 0x666c70);

  // --- cover: crates + sandbags ---
  [[-96,-36,1.2],[-94,-33,1.2],[-94,-36,1.2,1.2],[104,36,1.2],[106,33,1.2],[104,33,1.2,1.2],
   [4,7,1.3],[-7,5,1.3],[-204,10,1.2],[-196,25,1.2],[196,-10,1.2],[204,-25,1.2],[-160,90,1.2]]
   .forEach(a => makeCrate(scene, a[3]||a[2], a[0], a[1],
     a[3] ? terrainHeight(a[0],a[1])+a[2] : null));
  makeSandbags(scene, 5, -90,-50, 0.3);
  makeSandbags(scene, 5,  90, 50, 0.3);
  makeSandbags(scene, 4,  -4, 13, 0);
  makeSandbags(scene, 4, -190,  6, 1.2);
  makeSandbags(scene, 4,  190, -6, 1.2);

  // --- flags ---
  controlPoints.forEach(cp => makeFlag(scene, cp));

  // --- seeded scatter: rocks + trees ---
  const rand = mulberry32(1337);
  let placed = 0, tries = 0;
  while (placed < 45 && tries < 1500){ tries++;
    const x = (rand()*2-1)*245, z = (rand()*2-1)*245;
    if (!isBuildable(x,z)) continue;
    makeRock(scene, 0.4 + rand()*1.1, x, z); placed++;
  }
  placed = 0; tries = 0;
  while (placed < 105 && tries < 3000){ tries++;
    const x = (rand()*2-1)*245, z = (rand()*2-1)*245;
    if (!isBuildable(x,z)) continue;
    const s = 0.8 + rand()*0.9;
    if (rand() < 0.62) makePine(scene, s, x, z); else makeRoundTree(scene, s, x, z);
    placed++;
  }
}
