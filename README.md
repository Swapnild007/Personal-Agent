# RADHA Personal-Agent

One personal AI agent with three operating modes.

## Agent count

**1 actual agent: Radha.**

The product has one orchestrator, one shared memory store and one tool registry.

Modes:
- General: research, planning, writing and everyday work
- Coding: build, debug, review and testing
- Tutor: teach, practice and assess

The modes do not create separate agents.

## Current tools

- remember
- recall
- web_fetch

The tool loop is bounded. There is no unrestricted shell tool and no model stored on the device.

## Frontend

The GitHub Pages frontend is a mobile-first RADHA companion UI inspired by the supplied reference screens. It includes:

- Splash / welcome
- Home
- General / Coding mode entry
- Chat with mode selector
- Speech interaction
- Control / API connection screen
- Persistent bottom navigation
- Animated CSS-rendered Radha companion

The reference screenshots themselves are not shipped as project assets.

## Real API connection

The frontend can connect to a deployed FastAPI backend from the Control screen.

Backend:
- GET /health
- GET /memory
- POST /chat

Configure:
- LLM_BASE_URL
- LLM_API_KEY
- LLM_MODEL
- DATABASE_PATH
- MAX_TOOL_ROUNDS
- CORS_ORIGINS

Example:
```
uvicorn app:app --reload --host 0.0.0.0 --port 8000
```

The UI remains usable in Demo mode when no backend URL is configured.

## Figma

RADHA design file:
https://www.figma.com/design/sQ4Ex7iJZmeqQrpb2Ksj7F

## Roadmap

1. Deploy the FastAPI service
2. Connect browser/web research tools
3. Add GitHub integration
4. Add file intelligence
5. Add approval/audit boundaries
6. Add evaluation tests
7. Add proactive scheduled tasks
