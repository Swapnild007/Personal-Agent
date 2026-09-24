from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from agent import Agent
from config import CORS_ORIGINS, DATABASE_PATH, LLM_API_KEY, LLM_MODEL
from memory import MemoryStore
from tools import ToolRegistry

app = FastAPI(title="Personal-Agent", version="0.4.0")

origins = [item.strip() for item in CORS_ORIGINS.split(",") if item.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

memory = MemoryStore(DATABASE_PATH)
tools = ToolRegistry(memory)
agent = Agent(tools)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=12000)
    conversation_id: str = Field(default="default", min_length=1, max_length=120)
    mode: Literal["general", "coding", "tutor"] | None = None


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "agent": "Radha",
        "architecture": "one-agent-three-modes",
        "modes": ["general", "coding", "tutor"],
        "tools": ["remember", "recall", "web_fetch"],
        "llm_configured": bool(LLM_API_KEY and LLM_MODEL),
        "version": "0.4.0",
    }


@app.get("/memory")
async def memories():
    return {"memories": memory.get_all()}


@app.post("/chat")
async def chat(request: ChatRequest):
    answer, mode = await agent.chat(request.conversation_id, request.message, request.mode)
    return {
        "conversation_id": request.conversation_id,
        "mode": mode,
        "agent": "Radha",
        "answer": answer,
    }
