# AI Rules

You are working on a browser-only Three.js Ravenfield-like prototype.

Hard constraints:
- The game must run entirely in the browser.
- No install is required for the final game.
- Use Three.js via CDN import map.
- Do not add a build step.
- Do not add npm dependencies unless explicitly approved.
- Keep BOT_COUNT_PER_TEAM configurable.
- Implement only the requested milestone.
- Stop and wait for feedback before proceeding to the next milestone.
- Prefer simple, readable code.
- Prefer small patchable changes.
- Do not use proprietary Ravenfield assets.
- Use original placeholder assets only.
- For pathfinding, use simple waypoints first.
- Only escalate to navmesh if waypoints provably fail.
- Explicitly flag approximations and simplifications.

When applying a patch packet:
- Apply the changes exactly as described.
- Do not redesign gameplay systems unless explicitly instructed.
- Do not refactor unrelated code.
- If a replacement block does not match, stop and report the failed block.
- If a file to be replaced does not exist, stop and report it.
- If a file to be created already exists, ask before overwriting.
- After applying changes, list all files created, modified, or deleted.
