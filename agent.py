from __future__ import annotations
import json
from typing import Any
import httpx
from config import LLM_API_KEY, LLM_BASE_URL, LLM_MODEL, MAX_TOOL_ROUNDS
from tools import ToolRegistry

class Agent:
    MODE_GUIDANCE={
        "general":"Help with everyday questions, research, planning, writing, and practical decisions.",
        "coding":"Act as a careful software engineer. Explain, write, debug, review, and test code.",
        "tutor":"Teach progressively from the user's level using simple explanations, examples, exercises, and checks for understanding.",
    }
    def __init__(self,tools:ToolRegistry):
        self.tools=tools
        self.histories:dict[str,list[dict[str,Any]]]={}
    async def chat(self,conversation_id:str,message:str,mode:str="general")->str:
        if mode not in self.MODE_GUIDANCE: mode="general"
        if not LLM_API_KEY or not LLM_MODEL:
            return "Radha is ready, but the cloud model is not configured yet. Set LLM_API_KEY and LLM_MODEL in the backend environment."
        history=self.histories.setdefault(conversation_id,[])
        if not history:
            history.append({"role":"system","content":"You are Radha, a single personal AI agent with one shared identity and shared memory. Current operating mode: "+mode+". "+self.MODE_GUIDANCE[mode]+" Use tools only when useful. Never claim an action was completed unless a tool confirms it."})
        history.append({"role":"user","content":message})
        async with httpx.AsyncClient(timeout=60,follow_redirects=True) as client:
            for _ in range(MAX_TOOL_ROUNDS):
                response=await client.post(f"{LLM_BASE_URL}/chat/completions",headers={"Authorization":f"Bearer {LLM_API_KEY}","Content-Type":"application/json"},json={"model":LLM_MODEL,"messages":history,"tools":self.tools.definitions(),"tool_choice":"auto"})
                response.raise_for_status()
                choice=response.json()["choices"][0]["message"]
                history.append(choice)
                calls=choice.get("tool_calls") or []
                if not calls:
                    return choice.get("content") or ""
                for call in calls:
                    result=await self.tools.execute_tool_call({"function":{"name":call["function"]["name"],"arguments":call["function"].get("arguments","{}")}})
                    history.append({"role":"tool","tool_call_id":call["id"],"name":call["function"]["name"],"content":json.dumps(result)})
        return "Radha reached the tool-call limit before producing a final response."
