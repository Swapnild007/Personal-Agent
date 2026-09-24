from typing import Literal
from fastapi import FastAPI
from pydantic import BaseModel,Field
from agent import Agent
from config import DATABASE_PATH,LLM_API_KEY,LLM_MODEL
from memory import MemoryStore
from tools import ToolRegistry

app=FastAPI(title="Personal-Agent",version="0.2.0")
memory=MemoryStore(DATABASE_PATH)
tools=ToolRegistry(memory)
agent=Agent(tools)

class ChatRequest(BaseModel):
    message:str=Field(min_length=1)
    conversation_id:str=Field(default="default",min_length=1)
    mode:Literal["general","coding","tutor"]="general"

@app.get("/health")
async def health():
    return {"status":"ok","agent":"Radha","architecture":"one-agent-three-modes","modes":["general","coding","tutor"],"llm_configured":bool(LLM_API_KEY and LLM_MODEL),"version":"0.2.0"}

@app.get("/memory")
async def memories():
    return {"memories":memory.get_all()}

@app.post("/chat")
async def chat(request:ChatRequest):
    answer=await agent.chat(request.conversation_id,request.message,request.mode)
    return {"conversation_id":request.conversation_id,"mode":request.mode,"agent":"Radha","answer":answer}
