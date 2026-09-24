from fastapi import FastAPI
from pydantic import BaseModel, Field

from agent import Agent
from config import DATABASE_PATH
from memory import MemoryStore
from tools import ToolRegistry

app = FastAPI(title="Personal-Agent", version="0.1.0")

memory = MemoryStore(DATABASE_PATH)
tools = ToolRegistry(memory)
agent = Agent(tools)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    conversation_id: str = Field(default="default", min_length=1)


@app.get("/health")
async def health():
    return {"status": "ok", "agent": "Personal-Agent", "version": "0.1.0"}


@app.get("/memory")
async def memories():
    return {"memories": memory.get_all()}


@app.post("/chat")
async def chat(request: ChatRequest):
    answer = await agent.chat(request.conversation_id, request.message)
    return {
        "conversation_id": request.conversation_id,
        "answer": answer,
    }
