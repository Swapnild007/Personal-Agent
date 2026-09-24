const screens=[...document.querySelectorAll(".screen")],toast=document.querySelector("#toast");let tt;
const API_KEY="radha_api_base";
let mode="general",conversationId="radha-"+(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2)),apiBase=localStorage.getItem(API_KEY)||"";

const ROUTES={
  coding:/\b(code|coding|debug|bug|error|exception|python|javascript|typescript|html|css|react|node|sql|api|json|git|github|repo|repository|commit|branch|function|class|variable|script|terminal|docker|deploy|deployment|frontend|backend|database|regex|algorithm|program|programming|compile|compiler|syntax|stack trace|runtime)\b/i,
  tutor:/\b(teach|learn|lesson|course|quiz|test me|practice|exercise|study|exam|homework|tutorial|beginner|understand|explain simply|explain like|what is|why does|how does|concept|definition|flashcard|assessment)\b/i
};
function inferMode(text){
  const value=text.trim();
  if(ROUTES.coding.test(value)) return "coding";
  if(ROUTES.tutor.test(value) && !/\b(write|build|fix|debug|code|repo|github|api)\b/i.test(value)) return "tutor";
  return "general";
}
function toastMsg(m){toast.textContent=m;toast.classList.add("show");clearTimeout(tt);tt=setTimeout(()=>toast.classList.remove("show"),1700)}
function navFor(screen){
  if(screen==="control")return "control";
  if(screen==="chat")return "chat";
  return "home";
}
function setNav(active){
  const buttons=[...document.querySelectorAll(".bottom [data-nav]")];
  buttons.forEach(b=>b.classList.toggle("active",b.dataset.nav===active));
  const liquid=document.querySelector(".nav-liquid");
  if(!liquid)return;
  const target=buttons.find(b=>b.dataset.nav===active);
  if(!target || active==="chat"){
    if(active==="chat"){
      const chatButton=buttons.find(b=>b.dataset.nav==="chat");
      const core=buttons.find(b=>b.classList.contains("core"));
      const x=chatButton?.offsetLeft??0;
      const w=chatButton?.offsetWidth??0;
      const cx=core?.offsetLeft??0;
      const cw=core?.offsetWidth??50;
      liquid.style.width=Math.max(w,52)+"px";
      liquid.style.transform="translateX("+(active==="chat" ? (x+Math.max(0,(w-52)/2)) : 0)+"px)";
      core?.classList.add("active");
      return;
    }
    liquid.style.width="0px";liquid.style.opacity="0";return;
  }
  const x=target.offsetLeft;
  const w=target.offsetWidth;
  liquid.style.opacity="1";
  liquid.style.width=Math.max(48,w-4)+"px";
  liquid.style.transform="translateX("+(x+2)+"px)";
}
function go(n){screens.forEach(s=>s.classList.toggle("active",s.dataset.screen===n));setNav(navFor(n));}
function openChat(){mode="general";setNav("chat");go("chat");setTimeout(()=>document.querySelector("#message")?.focus(),280)}
document.querySelectorAll("[data-go]").forEach(e=>e.addEventListener("click",()=>{const n=e.dataset.go;if(n==="chat")openChat();else go(n)}));
document.querySelectorAll("[data-toast]").forEach(e=>e.addEventListener("click",()=>{setNav(e.dataset.nav||"memory");toastMsg(e.dataset.toast)}));
document.querySelectorAll("[data-mode]").forEach(e=>e.addEventListener("click",()=>{mode=e.dataset.mode;openChat()}));
document.querySelectorAll("[data-prompt]").forEach(e=>e.addEventListener("click",()=>{document.querySelector("#message").value=e.dataset.prompt;document.querySelector("#message").focus()}));
const chatMain=document.querySelector("#chat-main"),message=document.querySelector("#message"),composer=document.querySelector("#composer");
function addMessage(kind,text){const row=document.createElement("div");row.className=kind==="user"?"user-message":"radha-message";if(kind==="user"){row.innerHTML="<div><p></p></div>";row.querySelector("p").textContent=text}else{row.innerHTML='<span class="msg-avatar">••</span><div><small>RADHA</small><p></p></div>';row.querySelector("p").textContent=text}chatMain.appendChild(row);chatMain.scrollTop=chatMain.scrollHeight;return row}
async function sendMessage(text){
  if(!text.trim())return;
  const selectedMode=inferMode(text);
  mode=selectedMode;
  addMessage("user",text);message.value="";
  const thinking=addMessage("radha","Thinking…");const p=thinking.querySelector("p");
  try{
    if(!apiBase){p.textContent="I’m in demo mode right now. Open Control and add the deployed Radha API URL to connect the real cloud agent.";return}
    const response=await fetch(apiBase.replace(/\/$/,"")+"/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:text,conversation_id:conversationId})});
    if(!response.ok)throw new Error("HTTP "+response.status);
    const data=await response.json();
    mode=data.mode||selectedMode;
    p.textContent=data.answer||"Radha returned no answer.";
  }catch(err){p.textContent="I couldn’t reach the Radha backend. Check the API URL in Control and make sure the service is running."}
}
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
setNav("home");
setTimeout(()=>{if(document.querySelector(".splash.active"))go("home")},6500);