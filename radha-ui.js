const API=localStorage.getItem("radhaApi")||"";
let missions=JSON.parse(localStorage.getItem("radhaMissions")||"[]");
let running=false,started=0,timerId=null,ws=null;

const $=id=>document.getElementById(id);
const prompt=$("prompt"),run=$("run"),modal=$("missionModal"),cancel=$("cancel"),modalState=$("modalState"),modalText=$("modalText"),progress=$("progress"),missionState=$("coreState"),runtimeStatus=$("runtimeStatus"),connectionText=$("connectionText"),missionBoard=$("missionBoard"),missionList=$("missionList"),activityFeed=$("activityFeed"),missionBadge=$("missionBadge");

if(API){connectionText.textContent="BACKEND";runtimeStatus.textContent="Backend configured"}

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
$("closeModal").onclick=()=>modal.hidden=true;
$("minimize").onclick=()=>modal.hidden=true;

function updateMissionBoard(){
 missionBadge.textContent=missions.length;
 if(!missions.length){missionBoard.innerHTML='<div class="empty-board"><div class="empty-core">R</div><b>No active missions</b><span>Start a mission and RADHA will work here.</span></div>';return}
 missionBoard.innerHTML=missions.slice(0,4).map(m=>'<div class="event-row"><i></i><div><b>'+escapeHtml(m.request)+'</b><small>'+escapeHtml(m.result)+'</small></div><time>'+escapeHtml(m.time)+'</time></div>').join("");
 missionList.innerHTML=missions.length?missions.map(m=>'<div class="event-row"><i></i><div><b>'+escapeHtml(m.request)+'</b><small>'+escapeHtml(m.result)+'</small></div><time>'+escapeHtml(m.time)+'</time></div>').join(""):'<div class="empty-state">No missions yet.</div>';
}
updateMissionBoard();

function addActivity(title,detail){
 if(activityFeed.querySelector(".empty-state"))activityFeed.innerHTML="";
 const row=document.createElement("div");row.className="event-row";
 row.innerHTML='<i></i><div><b>'+escapeHtml(title)+'</b><small>'+escapeHtml(detail)+'</small></div><time>'+new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit",second:"2-digit"})+'</time>';
 row.onclick=()=>{$("eventTitle").textContent=title;$("eventDetail").textContent=detail};
 activityFeed.prepend(row);
}
function setStage(stage){
 const map={planning:"understand",executing:"build",verifying:"verify",completed:"report",failed:"report",cancelled:"report"};
 document.querySelectorAll(".stage").forEach(()=>{});
 modalState.textContent=stage.replaceAll("_"," ").toUpperCase();
}
function showModal(){
 modal.hidden=false;progress.style.width="5%";modalState.textContent="UNDERSTANDING REQUEST";modalText.textContent="RADHA is turning the outcome into an execution plan.";
}
function finish(state,result){
 running=false;run.disabled=false;clearInterval(timerId);timerId=null;modal.hidden=true;missionState.textContent=state;addActivity("MISSION "+state,result);
 missions.unshift({request:prompt.value.trim(),result,time:new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})});missions=missions.slice(0,20);localStorage.setItem("radhaMissions",JSON.stringify(missions));updateMissionBoard();
}
async function realTask(request){
 const response=await fetch(API+"/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request})});
 if(!response.ok)throw new Error("backend task rejected");
 const data=await response.json();
 ws=new WebSocket(API.replace(/^http/,"ws")+"/ws/tasks/"+data.task_id);
 ws.onmessage=e=>{
   const item=JSON.parse(e.data);
   if(item.type==="state_changed"){setStage(item.state||"");missionState.textContent=(item.state||"").replaceAll("_"," ").toUpperCase();modalText.textContent="RADHA is executing the autonomous workflow.";addActivity("STATE",(item.state||"").replaceAll("_"," "))}
   if(item.type==="tool_started")addActivity("TOOL STARTED",item.tool||"");
   if(item.type==="file_changed")addActivity("FILE CHANGED",item.path||"");
   if(item.type==="tool_output")addActivity(item.stream==="stderr"?"STDERR":"STDOUT",(item.chunk||"").trim().slice(0,220));
   if(item.type==="task_completed")finish("COMPLETED","Backend agent verified the mission.");
   if(item.type==="task_failed")finish("FAILED",item.error||"Backend agent reported failure.");
 };
 ws.onclose=()=>{if(running)finish("STOPPED","Agent connection closed before completion.")};
}
async function demo(){
 const steps=[
  ["UNDERSTANDING REQUEST","RADHA is forming a plan from the desired outcome.",14,"PLAN","Define objective and constraints"],
  ["INSPECTING CONTEXT","RADHA is locating the relevant project files and evidence.",34,"INSPECT","Explore workspace"],
  ["EXECUTING","RADHA is selecting tools and applying changes.",56,"TOOL","Read / patch / execute"],
  ["VERIFYING","RADHA is testing the result and checking failures.",78,"VERIFY","Run validation"],
  ["REPORTING","RADHA is preparing the evidence-backed result.",94,"REPORT","Summarize outcome"]
 ];
 for(const [state,text,pct,title,detail] of steps){if(!running)return;modalState.textContent=state;modalText.textContent=text;progress.style.width=pct+"%";missionState.textContent=state;addActivity(title,detail);await new Promise(r=>setTimeout(r,850))}
 if(running){progress.style.width="100%";finish("COMPLETED","Demo mission completed. Connect the backend for real autonomous execution.");}
}
async function start(){
 if(running||!prompt.value.trim())return;
 running=true;started=Date.now();run.disabled=true;missionState.textContent="RUNNING";showModal();addActivity("MISSION STARTED",prompt.value.trim());
 if(API){try{await realTask(prompt.value.trim());return}catch(e){addActivity("BACKEND","Connection failed; starting interactive demo.")}}
 await demo();
}
run.onclick=start;
cancel.onclick=()=>{if(ws)ws.close();finish("CANCELLED","Mission cancelled by user.")};
prompt.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();start()}});
document.querySelectorAll(".toggle").forEach(t=>t.onclick=()=>t.classList.toggle("on"));
$("apiInput").value=API;
$("saveSettings").onclick=()=>{localStorage.setItem("radhaApi",$("apiInput").value.trim().replace(/\/$/,""));location.reload()};
setInterval(()=>{if(running){const sec=Math.floor((Date.now()-started)/1000);document.querySelector(".live-pill").lastElementChild.textContent="RUNNING "+String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0")}},1000);
