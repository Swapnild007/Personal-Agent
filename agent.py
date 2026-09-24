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

    def infer_mode(self,message:str)->str:
        import re
        text=message.lower()
        strong_coding=r"\b(debug|bug|fix|exception|stack trace|syntax error|implement|refactor|function|class|variable|repo|repository|commit|branch|git|github|terminal|docker|deploy|deployment|frontend|backend|database|regex|algorithm|compile|compiler|code review|pull request|pull-request)\b"
        coding_terms=r"\b(code|coding|python|javascript|typescript|html|css|react|node|sql|api|json|program|programming|script|runtime)\b"
        tutor_terms=r"(\bteach me\b|\bteach\b|\blearn\b|\blesson\b|\bcourse\b|\bquiz\b|\btest me\b|\bpractice\b|\bexercise\b|\bstudy\b|\bexam\b|\bhomework\b|\btutorial\b|\bbeginner\b|\bhelp me understand\b|\bexplain simply\b|\bexplain like\b|\bwhat is\b|\bwhy does\b|\bhow does\b|\bconcept\b|\bdefinition\b|\bflashcard\b|\bassessment\b)"
        if re.search(strong_coding,text):
            return "coding"
        if re.search(tutor_terms,text):
            return "tutor"
        if re.search(coding_terms,text):
            return "coding"
        return "general"

    async def chat(self,conversation_id:str,message:str,mode:str|None=None)->tuple[str,str]:
        mode=mode if mode in self.MODE_GUIDANCE else self.infer_mode(message)
        if not LLM_API_KEY or not LLM_MODEL:
            return "Radha is ready, but the cloud model is not configured yet. Set LLM_API_KEY and LLM_MODEL in the backend environment.", mode
        history=self.histories.setdefault(conversation_id,[])
        system_content="You are Radha, a single personal AI agent with one shared identity and shared memory. Current operating mode: "+mode+". "+self.MODE_GUIDANCE[mode]+" Automatically adapt to the user's intent. If the next message clearly belongs to another mode, switch modes silently. Use tools only when useful. Never claim an action was completed unless a tool confirms it."
        if not history:
            history.append({"role":"system","content":system_content})
        else:
            history[0]={"role":"system","content":system_content}
        history.append({"role":"user","content":message})
        async with httpx.AsyncClient(timeout=60,follow_redirects=True) as client:
            for _ in range(MAX_TOOL_ROUNDS):
                response=await client.post(f"{LLM_BASE_URL}/chat/completions",headers={"Authorization":f"Bearer {LLM_API_KEY}","Content-Type":"application/json"},json={"model":LLM_MODEL,"messages":history,"tools":self.tools.definitions(),"tool_choice":"auto"})
                response.raise_for_status()
                choice=response.json()["choices"][0]["message"]
                history.append(choice)
                calls=choice.get("tool_calls") or []
                if not calls:
                    return choice.get("content") or "", mode
                for call in calls:
                    result=await self.tools.execute_tool_call({"function":{"name":call["function"]["name"],"arguments":call["function"].get("arguments","{}")}})
                    history.append({"role":"tool","tool_call_id":call["id"],"name":call["function"]["name"],"content":json.dumps(result)})
        return "Radha reached the tool-call limit before producing a final response.", mode
