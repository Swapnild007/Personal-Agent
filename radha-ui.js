const API=localStorage.getItem("radhaApi")||"";
const prompt=document.getElementById("prompt"),run=document.getElementById("run"),cancel=document.getElementById("cancel"),overlay=document.getElementById("overlay"),overlayState=document.getElementById("overlayState"),overlayText=document.getElementById("overlayText"),progress=document.getElementById("progress"),missionState=document.getElementById("missionState"),trace=document.getElementById("trace"),timer=document.getElementById("timer"),history=document.getElementById("history"),resultTitle=document.getElementById("resultTitle"),resultBody=document.getElementById("resultBody"),resultDot=document.getElementById("resultDot"),connectionText=document.getElementById("connectionText");
let running=false,started=0,timerId=null,ws=null,historyItems=JSON.parse(localStorage.getItem("radhaHistory")||"[]");

if(API)connectionText.textContent="BACKEND CONFIGURED";
renderHistory();

function addLog(title,detail){
 trace.querySelector(".empty")?.remove();
 const row=document.createElement("div");row.className="live-line";
 row.innerHTML="<i></i><span><b>"+title+"</b> · "+detail+"</span>";
 trace.appendChild(row);trace.scrollTop=trace.scrollHeight;
}
function stage(name){
 const names=["understand","inspect","build","verify","report"],idx=names.indexOf(name);
 document.querySelectorAll(".stage").forEach((el,i)=>{el.classList.toggle("active",i===idx);el.querySelector("i").style.background=i<idx?"#67ddb5":"";el.querySelector("i").style.borderColor=i<idx?"#67ddb5":""});
}
function elapsed(){timer.textContent=new Date((Date.now()-started)).toISOString().slice(14,19)}
function renderHistory(){
 if(!historyItems.length)return;
 history.innerHTML=historyItems.slice(0,5).map(x=>'<div class="history-row"><i></i><div><b>'+escapeHtml(x.request)+'</b><small>'+x.result+'</small></div><time>'+x.time+'</time></div>').join("");
}
function escapeHtml(v){return v.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function finish(state,result){
 running=false;run.disabled=false;cancel.disabled=true;prompt.disabled=false;
 clearInterval(timerId);timerId=null;missionState.textContent=state;overlay.hidden=true;resultTitle.textContent=result.title;resultDot.classList.toggle("done",state==="COMPLETED");
 resultBody.innerHTML='<div class="result-summary"><div class="metric"><label>OUTCOME</label><b>'+escapeHtml(result.title)+'</b><p>'+escapeHtml(result.detail)+'</p></div><div class="metric"><label>EXECUTION</label><b>'+escapeHtml(result.execution)+'</b><p>RADHA completed the autonomous workflow.</p></div></div>';
 if(state==="COMPLETED")stage("report");
 historyItems.unshift({request:prompt.value.trim(),result:result.title,time:new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})});
 historyItems=historyItems.slice(0,5);localStorage.setItem("radhaHistory",JSON.stringify(historyItems));renderHistory();
}
async function realTask(request){
 const response=await fetch(API+"/tasks",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({request})});
 if(!response.ok)throw new Error("Task creation failed");
 const data=await response.json();ws=new WebSocket(API.replace(/^http/,"ws")+"/ws/tasks/"+data.task_id);
 ws.onmessage=e=>{const item=JSON.parse(e.data);
   if(item.type==="state_changed"){const s=item.state||"";missionState.textContent=s.replaceAll("_"," ").toUpperCase();overlayState.textContent=s.replaceAll("_"," ").toUpperCase();overlayText.textContent="RADHA is executing the autonomous workflow.";stage(s==="planning"?"understand":s==="executing"?"build":s==="verifying"?"verify":s==="completed"?"report":"inspect");}
   if(item.type==="tool_started")addLog("TOOL",item.tool||"execution");
   if(item.type==="tool_output")addLog(item.stream==="stderr"?"STDERR":"STDOUT",(item.chunk||"").trim().slice(0,180));
   if(item.type==="file_changed")addLog("CHANGED",item.path||"file");
   if(item.type==="task_completed")finish("COMPLETED",{title:"Mission verified",detail:"RADHA completed the task and reported success.",execution:"Backend agent execution"});
   if(item.type==="task_failed")finish("FAILED",{title:"Mission stopped",detail:item.error||"RADHA reported an execution failure.",execution:"Backend agent execution"});
 };
 ws.onclose=()=>{if(running&&missionState.textContent!=="COMPLETED")finish("STOPPED",{title:"Connection closed",detail:"The agent connection ended before the mission completed.",execution:"Backend connection"})};
}
async function demoTask(){
 const steps=[
  ["understand","UNDERSTANDING REQUEST","Turning your outcome into an execution plan.",12,"PLAN","define objective"],
  ["inspect","INSPECTING PROJECT","Reading the project structure and relevant files.",32,"INSPECT","find relevant context"],
  ["build","BUILDING","Applying the required code changes and executing tools.",57,"PATCH","modify source"],
  ["verify","VERIFYING","Running tests and checking the resulting behavior.",79,"TEST","validate result"],
  ["report","REPORTING","Summarizing changes and verification evidence.",94,"REPORT","prepare result"]
 ];
 for(const [s,title,text,pct,logTitle,detail] of steps){
   if(!running)return;stage(s);missionState.textContent=title;overlayState.textContent=title;overlayText.textContent=text;progress.style.width=pct+"%";addLog(logTitle,detail);
   await new Promise(r=>setTimeout(r,850));
 }
 if(running){progress.style.width="100%";addLog("DONE","mission verified");finish("COMPLETED",{title:"Mission verified",detail:"Demo workflow completed. Connect the backend to let RADHA execute against a real workspace.",execution:"Agent simulation · UI ready"});}
}
async function start(){
 if(running||!prompt.value.trim())return;
 running=true;started=Date.now();timerId=setInterval(elapsed,1000);run.disabled=true;cancel.disabled=false;prompt.disabled=true;
 trace.innerHTML="";resultTitle.textContent="RADHA is working";resultDot.classList.remove("done");overlay.hidden=false;progress.style.width="4%";stage("understand");missionState.textContent="UNDERSTANDING";
 addLog("MISSION",prompt.value.trim());
 if(API){try{await realTask(prompt.value.trim());return}catch(e){addLog("BACKEND","Unavailable. Running visual demo instead.");}}
 await demoTask();
}
run.onclick=start;
cancel.onclick=()=>{if(ws)ws.close();finish("CANCELLED",{title:"Mission cancelled",detail:"You stopped RADHA before completion.",execution:"User cancellation"});};
prompt.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key==="Enter"){e.preventDefault();start()}});
document.getElementById("minimize").onclick=()=>overlay.hidden=true;
document.getElementById("homeBtn").onclick=()=>window.scrollTo({top:0,behavior:"smooth"});
document.getElementById("settingsBtn").onclick=()=>alert("RADHA settings will be connected to the agent runtime in the next backend integration step.");
