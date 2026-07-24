export const input = { keys:Object.create(null), dx:0, dy:0, trigger:false, ads:false,
  semiEdge:false, locked:false, mvx:0, mvy:0 };

export function initInput(dom, overlay){
  addEventListener('keydown', e => { input.keys[e.code] = true;
    if (e.code==='Space' && input.locked) e.preventDefault(); });
  addEventListener('keyup',   e => { input.keys[e.code] = false; });
  addEventListener('blur', () => { for (const k in input.keys) input.keys[k]=false;
    input.trigger = input.ads = false; });
  addEventListener('contextmenu', e => e.preventDefault());

  overlay.addEventListener('click', () => dom.requestPointerLock());
  document.addEventListener('pointerlockchange', () => {
    input.locked = document.pointerLockElement === dom;
    overlay.style.display = input.locked ? 'none' : 'flex';
    if (!input.locked){ for (const k in input.keys) input.keys[k]=false;
      input.trigger = input.ads = false; }
  });
  document.addEventListener('mousemove', e => {
    if (!input.locked) return;
    input.dx += e.movementX; input.dy += e.movementY;
    input.mvx += e.movementX; input.mvy += e.movementY;
  });
  document.addEventListener('mousedown', e => {
    if (!input.locked) return;
    if (e.button === 0){ input.trigger = true; input.semiEdge = true; }
    if (e.button === 2) input.ads = true;
  });
  document.addEventListener('mouseup', e => {
    if (e.button === 0) input.trigger = false;
    if (e.button === 2) input.ads = false;
  });
}
