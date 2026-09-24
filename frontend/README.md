# RADHA Workspace

Next.js App Router frontend for the RADHA autonomous engineering agent.

## Local development

1. Start the FastAPI backend from `backend/`.
2. Copy `.env.example` to `.env.local`.
3. Set `NEXT_PUBLIC_RADHA_API` to the backend URL.
4. Install dependencies:
   `npm install`
5. Start:
   `npm run dev`

The workspace currently provides:

- recursive workspace explorer
- read-only Monaco editor view
- RADHA task prompt
- run/cancel controls
- WebSocket task event stream
- tool trace
- destructive/Git approval modal

Direct editor writes are intentionally not exposed yet. RADHA remains the controlled mutation path.
