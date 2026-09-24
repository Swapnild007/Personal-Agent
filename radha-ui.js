const API=(localStorage.getItem("radhaApi")||"http://127.0.0.1:8000").replace(/\/$/,"");
let missions=JSON.parse(localStorage.getItem("radhaMissions")||"[]");
let running=false,started=0,timerId=null,ws=null,currentTaskId=null;

const $=id=>document.getElementById(id);
const prompt=$("prompt"),run=$("run"),modal=$("missionModal"),cancel=$("cancel"),modalState=$("modalState"),modalText=$("modalText"),progress=$("progress"),missionState=$("coreState"),runtimeStatus=$("runtimeStatus"),connectionText=$("connectionText"),missionBoard=$("missionBoard"),missionList=$("missionList"),activityFeed=$("activityFeed"),missionBadge=$("missionBadge"),resultPanel=$("resultPanel"),resultText=$("resultText"),resultMeta=$("resultMeta"),closeResult=$("closeResult");

function escapeHtml(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function setView(id){
 document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===id));
 document.querySelectorAll("[data-view]").forEach(v=>v.classList.toggle("active",v.dataset.view===id));
 window.scrollTo({top:0,behavior:"smooth"});
}
document.querySelectorAll("[data-view]").forEach(el=>el.addEventListener("click",()=>setView(el.dataset.view)));
document.querySelectorAll("[data-template]").forEach(el=>el.addEventListener("click",()=>{prompt.value=el.dataset.template;setView("overview");prompt.focus()}));
$("newMission").onclick=()=>{setView("overview");prompt.focus()};
$("newMission2").onclick=()=>{setView("overview");prompt.focus()};
$("workspaceBtn").onclick=()=>setView("workspace");
$("profileBtn").onclick=()=>setView("settings");
$("closeModal").onclick=()=>{if(!running)modal.hidden=true};
$("minimize").onclick=()=>modal.hidden=true;
closeResult.onclick=()=>modal.hidden=true;

function updateMissionBoard(){
 missionBadge.textContent=missions.length;
 if(!missions.length){missionBoard.innerHTML='<div class="empty-board"><div class="empty-core">R</div><b>No missions yet</b><span>Start a mission and RADHA will work here.</span></div>';missionList.innerHTML='<div class="empty-state">No missions yet.</div>';return}
 missionBoard.innerHTML=missions.slice(0,4).map(m=>'<div class="event-row"><i></i><div><b>'+escapeHtml(m.request)+'</b><small>'+escapeHtml(m.result)+'</small></div><time>'+escapeHtml(m.time)+'</time></div>').join("");
 missionList.innerHTML=missions.map(m=>'<div class="event-row"><i></i><div><b>'+escapeHtml(m.request)+'</b><small>'+escapeHtml(m.result)+'</small></div><time>'+escapeHtml(m.time)+'</time></div>').join("");
}
updateMissionBoard();

function addActivity(title,detail){
 if(activityFeed.querySelector(".empty-state"))activityFeed.innerHTML="";
 const row=document.createElement("div");row.className="event-row";
 row.innerHTML='<i></i><div><b>'+escapeHtml(title)+'</b><small>'+escapeHtml(detail)+'</small></div><time>'+new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})+'</time>';
 row.onclick=()=>{$("eventTitle").textContent=title;$("eventDetail").textContent=detail};
 activityFeed.prepend(row);
}
function showModal(){
 modal.hidden=false;resultPanel.hidden=true;closeResult.hidden=true;progress.style.width="5%";modalState.textContent="UNDERSTANDING REQUEST";modalText.textContent="RADHA is turning the outcome into an execution plan.";
}
function finish(state,result,keepOpen=false){
 running=false;run.disabled=false;clearInterval(timerId);timerId=null;
 missionState.textContent=state;
 addActivity("MISSION "+state,result);
 missions.unshift({request:prompt.value.trim(),result,time:new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})});
 missions=missions.slice(0,20);localStorage.setItem("radhaMissions",JSON.stringify(missions));updateMissionBoard();
 if(keepOpen){
   resultPanel.hidden=false;closeResult.hidden=false;resultText.textContent=result||"No result returned.";resultMeta.textContent=state==="COMPLETED"?"RADHA completed the task and returned the final response.":"RADHA stopped before completion.";
   modalState.textContent=state;modalText.textContent=state==="COMPLETED"?"Mission complete. Review the result below.":"Mission ended.";
   progress.style.width=state==="COMPLETED"?"100%":"0%";
 }else modal.hidden=true;
}
async function healthCheck(){
 try{
   const r=await fetch(API+"/health",{cache:"no-store"});
   if(!r.ok)throw new Error();
   const h=await r.json();
   connectionText.textContent="LIVE";
   runtimeStatus.textContent="OmniRoute · "+(h.model||"auto/coding");
   missionState.textContent="READY";
 }catch{
   connectionText.textContent="OFFLINE";
   runtimeStatus.textContent="Start RADHA backend";
 }
}
async function resolveApproval(taskId,approvalId,action,reason,command){
 const message=command?reason+"\n\nCommand:\n"+command:reason;
 const approved=window.confirm("RADHA requests approval for "+action+".\n\n"+message);
 await fetch(API+"/tasks/"+taskId+"/approvals/"+approvalId,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({approved})});
 addActivity(approved?"APPROVAL GRANTED":"APPROVAL DENIED",action);
}
async function realTask(request){
 const response=await fetch(API+"/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request})});
 if(!response.ok){
   const detail=await response.text();
   throw new Error(detail||"Backend task rejected");
 }
 const data=await response.json();currentTaskId=data.task_id;
 const wsUrl=API.replace(/^http:/,"ws:").replace(/^https:/,"wss:")+"/ws/tasks/"+data.task_id;
 ws=new WebSocket(wsUrl);
 ws.onmessage=async e=>{
   const item=JSON.parse(e.data);
   if(item.type==="state_changed"){
     const state=(item.state||"").replaceAll("_"," ");
     missionState.textContent=state.toUpperCase();modalState.textContent=state.toUpperCase();
     modalText.textContent="RADHA is executing the autonomous workflow.";
     addActivity("STATE",state);
     const pct={queued:8,planning:18,executing:48,waiting_for_approval:62,verifying:82,completed:100,failed:100,cancelled:0}[item.state]||45;
     progress.style.width=pct+"%";
   }
   if(item.type==="task_created")addActivity("TASK CREATED","RADHA accepted the mission.");
   if(item.type==="model_routed")addActivity("MODEL ROUTED",item.decision||item.model||"OmniRoute auto routing");
   if(item.type==="verification_started")addActivity("VERIFICATION STARTED",item.reason||"RADHA is validating the result.");
   if(item.type==="tool_started")addActivity("TOOL STARTED",item.tool||"");
   if(item.type==="file_changed")addActivity("FILE CHANGED",item.path||"");
   if(item.type==="tool_output")addActivity(item.stream==="stderr"?"STDERR":"STDOUT",(item.chunk||"").trim().slice(0,220));
   if(item.type==="approval_required")await resolveApproval(data.task_id,item.approval_id,item.action,item.reason,item.command);
   if(item.type==="task_completed")finish("COMPLETED",item.message||"RADHA completed the mission.",true);
   if(item.type==="task_failed")finish("FAILED",item.error||"RADHA reported a failure.",true);
   if(item.type==="task_cancelled")finish("CANCELLED","Mission cancelled by user.",true);
 };
 ws.onerror=()=>addActivity("WEBSOCKET","Live task stream reported an error.");
 ws.onclose=()=>{if(running)finish("STOPPED","Agent connection closed before completion.",true)};
}
async function demo(){
 const steps=[
  ["UNDERSTANDING REQUEST","Demo mode only. Connect the RADHA backend for real execution.",14,"PLAN","Define objective"],
  ["INSPECTING CONTEXT","Simulating workspace inspection.",34,"INSPECT","Explore workspace"],
  ["EXECUTING","Simulating tool selection and file changes.",56,"TOOL","Read / patch / execute"],
  ["VERIFYING","Simulating tests and validation.",78,"VERIFY","Run validation"],
  ["REPORTING","Preparing simulated result.",94,"REPORT","Summarize outcome"]
 ];
 for(const [state,text,pct,title,detail] of steps){if(!running)return;modalState.textContent=state;modalText.textContent=text;progress.style.width=pct+"%";missionState.textContent=state;addActivity(title,detail);await new Promise(r=>setTimeout(r,700))}
 if(running)finish("DEMO","Demo completed. Start the RADHA backend to execute real tasks.",true);
}
async function start(){
 if(running||!prompt.value.trim())return;
 running=true;started=Date.now();run.disabled=true;missionState.textContent="RUNNING";showModal();addActivity("MISSION STARTED",prompt.value.trim());
 try{await realTask(prompt.value.trim())}
 catch(e){running=false;run.disabled=false;addActivity("BACKEND ERROR",e.message);finish("FAILED","RADHA backend is unavailable. Check the endpoint in Settings.",true)}
}
run.onclick=start;
cancel.onclick=async()=>{
 if(!running)return;
 if(currentTaskId)fetch(API+"/tasks/"+currentTaskId+"/cancel",{method:"POST"}).catch(()=>{});
 if(ws)ws.close();
 finish("CANCELLED","Mission cancellation requested.",true);
};
prompt.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();start()}});
document.querySelectorAll(".toggle").forEach(t=>t.onclick=()=>t.classList.toggle("on"));
$("apiInput").value=API;
$("saveSettings").onclick=()=>{localStorage.setItem("radhaApi",$("apiInput").value.trim().replace(/\/$/,""));location.reload()};
setInterval(()=>{if(running){const sec=Math.floor((Date.now()-started)/1000);document.querySelector(".live-pill").lastElementChild.textContent="RUNNING "+String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0")}},1000);
healthCheck();
