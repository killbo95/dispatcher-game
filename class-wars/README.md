# CLASS WARS prototype

A mobile-friendly browser game prototype that mixes territory capture, bonks, power-ups, random events, and shared rooms.

## Files
- `index.html`: browser game and solo demo.
- `worker.js`: Cloudflare Worker + Durable Object WebSocket room server.
- `wrangler.toml`: Durable Object binding and migration.

## Try the browser prototype
Open the GitHub Pages URL for this folder and click **Try solo demo**. That mode uses local simulated rivals and is not shared with other devices.

## Enable shared rooms
1. Create a Cloudflare Worker project and upload `worker.js` plus `wrangler.toml` (or deploy from this folder with Wrangler).
2. Deploy the Worker. The Worker needs the Durable Object binding and migration in `wrangler.toml`.
3. In the game, enter the Worker WebSocket base URL in **Multiplayer server**, e.g. `wss://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev`.
4. Click **Create room**, then share the room code with classmates. They open the same game page, enter the same Worker URL and code, and click **Join room**.

The server currently caps each room at 150 players. It is a prototype, not a production-hardened service. Test with a small group first; before a large class launch, add moderation/reporting, persistent room state, reconnection, rate limiting, and load testing. A shared room is online only when the Worker is deployed and configured.
