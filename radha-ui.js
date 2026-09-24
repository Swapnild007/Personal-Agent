const screens=[...document.querySelectorAll(".screen")],toast=document.querySelector("#toast");let tt;
const API_KEY="radha_api_base";
let mode="general",conversationId="radha-"+crypto.randomUUID(),apiBase=localStorage.getItem(API_KEY)||"";
function toastMsg(m){toast.textContent=m;toast.classList.add("show");clearTimeout(tt);tt=setTimeout(()=>toast.classList.remove("show"),1700)}
function go(n){screens.forEach(s=>s.classList.toggle("active",s.dataset.screen===n));}
function openChat(nextMode=mode){mode=nextMode;document.querySelectorAll(".mode").forEach(x=>x.classList.toggle("active",x.dataset.chatMode===mode));go("chat");setTimeout(()=>document.querySelector("#message")?.focus(),280)}
document.querySelectorAll("[data-go]").forEach(e=>e.addEventListener("click",()=>{const n=e.dataset.go;if(n==="chat")openChat();else go(n)}));
document.querySelectorAll("[data-toast]").forEach(e=>e.addEventListener("click",()=>toastMsg(e.dataset.toast)));
document.querySelectorAll("[data-mode]").forEach(e=>e.addEventListener("click",()=>openChat(e.dataset.mode)));
document.querySelectorAll(".mode").forEach(e=>e.addEventListener("click",()=>{mode=e.dataset.chatMode;document.querySelectorAll(".mode").forEach(x=>x.classList.toggle("active",x===e));}));
document.querySelectorAll("[data-prompt]").forEach(e=>e.addEventListener("click",()=>{document.querySelector("#message").value=e.dataset.prompt;document.querySelector("#message").focus()}));
const chatMain=document.querySelector("#chat-main"),message=document.querySelector("#message"),composer=document.querySelector("#composer");
function addMessage(kind,text){const row=document.createElement("div");row.className=kind==="user"?"user-message":"radha-message";if(kind==="user"){row.innerHTML="<div><p></p></div>";row.querySelector("p").textContent=text}else{row.innerHTML='<span class="msg-avatar">••</span><div><small>RADHA</small><p></p></div>';row.querySelector("p").textContent=text}chatMain.appendChild(row);chatMain.scrollTop=chatMain.scrollHeight;return row}
async function sendMessage(text){if(!text.trim())return;addMessage("user",text);message.value="";const thinking=addMessage("radha","Thinking…");const p=thinking.querySelector("p");try{if(!apiBase){p.textContent="I’m in demo mode right now. Open Control and add the deployed Radha API URL to connect the real cloud agent.";return}const response=await fetch(apiBase.replace(/\/$/,"")+"/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text,conversation_id:conversationId,mode})});if(!response.ok)throw new Error("HTTP "+response.status);const data=await response.json();p.textContent=data.answer||"Radha returned no answer."}catch(err){p.textContent="I couldn’t reach the Radha backend. Check the API URL in Control and make sure the service is running."}}
composer.addEventListener("submit",e=>{e.preventDefault();sendMessage(message.value)});
message.addEventListener("input",()=>{message.style.height="auto";message.style.height=Math.min(message.scrollHeight,90)+"px"});
const apiInput=document.querySelector("#api-base"),apiStatus=document.querySelector("#api-status"),apiDot=document.querySelector("#api-dot");
apiInput.value=apiBase;
function updateApiStatus(ok,label){apiStatus.textContent=label;apiDot.style.background=ok?"#62f2c1":"#ffbf63";apiDot.style.boxShadow=ok?"0 0 10px #62f2c1":"0 0 10px #ffbf63"}
async function checkApi(){if(!apiBase){updateApiStatus(false,"Demo mode");return}try{const r=await fetch(apiBase.replace(/\/$/,"")+"/health");const d=await r.json();updateApiStatus(r.ok&&d.agent==="Radha",r.ok&&d.llm_configured?"Connected · Radha online":"Backend reachable · model not configured")}catch{updateApiStatus(false,"Connection unavailable")}}
document.querySelector("#save-api").addEventListener("click",()=>{apiBase=apiInput.value.trim().replace(/\/$/,"");localStorage.setItem(API_KEY,apiBase);checkApi();toastMsg(apiBase?"Radha connection saved.":"Demo mode restored.")});
const mic=document.querySelector("#mic"),hint=document.querySelector("#hint"),timer=document.querySelector("#timer");let rec=false,sec=54,iv;
mic.addEventListener("click",()=>{rec=!rec;if(rec){hint.textContent="Listening… tap again to stop";iv=setInterval(()=>{sec++;timer.textContent=String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0")},1000)}else{clearInterval(iv);hint.textContent="Voice note captured by Radha";toastMsg("Voice input captured.")}});
checkApi();
setTimeout(()=>{if(document.querySelector(".splash.active"))go("home")},6500);