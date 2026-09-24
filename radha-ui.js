const API=localStorage.getItem("radhaApi")||"";
const files={
"app.py":"from fastapi import FastAPI\n\napp = FastAPI()\n\n@app.get(\"/health\")\ndef health():\n    return {\"status\": \"ok\"}\n",
"agent.py":"class Agent:\n    def run(self, request: str) -> str:\n        return request\n",
"tests/test_agent.py":"def test_health():\n    assert True\n",
"README.md":"# RADHA\n\nAutonomous software engineering workspace.\n",
"config.py":"MODEL = \"gpt-4o\"\n"
};
let selected="app.py", original=files[selected], running=false, timer=null, started=0;

const $=id=>document.getElementById(id);
const editor=$("editor"), terminal=$("terminal"), prompt=$("prompt"), mission=$("mission"), round=$("round"), trace=$("trace"), timeline=$("timeline"), changes=$("changes"), eventCount=$("event-count"), changeCount=$("change-count"), timelineCount=$("timeline-count"), status=$("status"), elapsed=$("elapsed");

function paint(){editor.textContent=files[selected]||"";$("file-title").textContent=selected;document.querySelectorAll(".tree-file").forEach(b=>b.classList.toggle("active",b.dataset.file===selected))}
function log(type,detail){const row=document.createElement("div");row.className="trace-item";row.innerHTML='<span class="trace-dot"></span><div><strong>'+type+'</strong><small>'+detail+'</small></div>';trace.appendChild(row);trace.scrollTop=trace.scrollHeight;eventCount.textContent=trace.querySelectorAll(".trace-item").length+" events"}
function phase(name,detail){const item=document.createElement("div");item.className="timeline-item";item.innerHTML='<div class="timeline-rail"><span class="active"></span></div><div class="timeline-copy"><strong>'+name+'</strong><small>'+new Date().toLocaleTimeString([], {hour12:false})+' · '+detail+'</small></div>';timeline.querySelector(".section-empty")?.remove();timeline.appendChild(item);timelineCount.textContent=timeline.querySelectorAll(".timeline-item").length}
function term(text,kind=""){terminal.textContent+=kind==="cmd"?"\n$ "+text+"\n":text;terminal.scrollTop=terminal.scrollHeight}
function changed(path,action){if(changes.querySelector(".section-empty")) changes.innerHTML="";const row=document.createElement("div");row.className="changed-file";row.innerHTML='<span class="file-action">'+(action==="patched"?"Δ":"+")+'</span><span>'+path+'</span><small>'+action+'</small>';row.onclick=()=>{selected=path;original=files[path]||"";paint()};changes.appendChild(row);changeCount.textContent=changes.querySelectorAll(".changed-file").length}

document.querySelectorAll(".tree-file").forEach(btn=>btn.onclick=()=>{selected=btn.dataset.file;original=files[selected]||"";paint()});
$("refresh").onclick=()=>{status.textContent="WORKSPACE REFRESHED";setTimeout(()=>status.textContent=API?"BACKEND CONNECTED":"DEMO READY",900)};
$("diff").onclick=()=>{const isDiff=$("view-label").textContent==="CHANGE VIEW";if(isDiff){editor.textContent=files[selected]||"";$("view-label").textContent="READ VIEW";return}editor.textContent=original===files[selected]?files[selected]:"--- ORIGINAL ---\n"+original+"\n\n+++ CURRENT ---\n"+files[selected];$("view-label").textContent="CHANGE VIEW"};

async function liveTask(request){
const res=await fetch(API+"/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request})});
if(!res.ok)throw new Error(await res.text());
const data=await res.json();
const ws=new WebSocket(API.replace(/^http/,"ws")+"/ws/tasks/"+data.task_id);
ws.onmessage=e=>{const item=JSON.parse(e.data);if(item.type==="state_changed"){mission.textContent=(item.state||"").toUpperCase();round.textContent=item.round?"R"+item.round:"LIVE";phase((item.state||"").toUpperCase(),"backend event")}if(item.type==="tool_started")log("TOOL STARTED",item.tool||"tool");if(item.type==="tool_output")term(item.chunk||"");if(item.type==="file_changed"){changed(item.path,item.action||"changed")}if(item.type==="task_completed"){finish("COMPLETED");log("TASK COMPLETED",item.message||"RADHA finished")}if(item.type==="task_failed"){finish("FAILED");log("TASK FAILED",item.error||"error")}};
ws.onclose=()=>{if(running&&mission.textContent==="EXECUTING")finish("DISCONNECTED")};
}

async function run(){
if(running||!prompt.value.trim())return;
running=true;$("run").disabled=true;$("cancel").disabled=false;prompt.disabled=true;trace.innerHTML="";timeline.innerHTML="";changes.innerHTML='<div class="section-empty">No files changed in this task.</div>';changeCount.textContent="0";eventCount.textContent="0";timelineCount.textContent="0";terminal.textContent="";started=Date.now();status.textContent=API?"STREAMING":"DEMO RUN";mission.textContent="PLANNING";round.textContent="R1";phase("PLANNING","understanding request");log("TASK STARTED",prompt.value.trim());
if(API){try{await liveTask(prompt.value.trim());return}catch(e){log("BACKEND UNAVAILABLE","falling back to UI simulation")}}
await new Promise(r=>setTimeout(r,650));if(!running)return;mission.textContent="EXECUTING";phase("EXECUTING","inspect project");log("TOOL STARTED","list_directory");term("$ list workspace\napp.py\nagent.py\ntests/test_agent.py\nREADME.md\nconfig.py\n");
await new Promise(r=>setTimeout(r,700));if(!running)return;log("TOOL STARTED","read_file · tests/test_agent.py");term("$ read tests/test_agent.py\nassert True\n");
await new Promise(r=>setTimeout(r,800));if(!running)return;phase("EXECUTING","apply safe patch");log("TOOL STARTED","patch_file");files["tests/test_agent.py"]="def test_health():\n    assert True\n\ndef test_radha_agent():\n    assert \"RADHA\" == \"RADHA\"\n";changed("tests/test_agent.py","patched");selected="tests/test_agent.py";paint();term("$ patch_file tests/test_agent.py\npatched 1 replacement\n");
await new Promise(r=>setTimeout(r,700));if(!running)return;log("TOOL STARTED","execute_command");term("python -m pytest -q","cmd");await new Promise(r=>setTimeout(r,900));if(!running)return;term("2 passed in 0.18s\n");phase("VERIFYING","tests passed");log("VERIFICATION","2 tests passed");await new Promise(r=>setTimeout(r,500));finish("COMPLETED");
}

function finish(state){running=false;$("run").disabled=false;$("cancel").disabled=true;prompt.disabled=false;mission.textContent=state;status.textContent=state==="COMPLETED"?"DEMO COMPLETE":"STOPPED";if(state==="COMPLETED"){phase("COMPLETED","task verified")}clearInterval(timer);timer=null}
$("run").onclick=run;
$("cancel").onclick=()=>{if(running){term("\nCancellation requested.\n");finish("CANCELLED")}};
prompt.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();run()}});
timer=setInterval(()=>{if(started)elapsed.textContent=Math.floor((Date.now()-started)/1000)+"s"},1000);
paint();
if(API)status.textContent="BACKEND READY";
