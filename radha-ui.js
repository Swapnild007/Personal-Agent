const screens=[...document.querySelectorAll(".screen")],toast=document.querySelector("#toast");let tt;
function toastMsg(m){toast.textContent=m;toast.classList.add("show");clearTimeout(tt);tt=setTimeout(()=>toast.classList.remove("show"),1700)}
function go(n){screens.forEach(s=>s.classList.toggle("active",s.dataset.screen===n));}
document.querySelectorAll("[data-go]").forEach(e=>e.addEventListener("click",()=>go(e.dataset.go)));
document.querySelectorAll("[data-toast]").forEach(e=>e.addEventListener("click",()=>toastMsg(e.dataset.toast)));
document.querySelectorAll("[data-mode]").forEach(e=>e.addEventListener("click",()=>toastMsg(e.dataset.mode+" mode is ready. Radha remains one core agent.")));
const mic=document.querySelector("#mic"),hint=document.querySelector("#hint"),timer=document.querySelector("#timer");let rec=false,sec=54,iv;
mic.addEventListener("click",()=>{rec=!rec;if(rec){hint.textContent="Listening… tap again to stop";iv=setInterval(()=>{sec++;timer.textContent=String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0")},1000)}else{clearInterval(iv);hint.textContent="Voice note captured by Radha";toastMsg("Voice input captured.")}});
setTimeout(()=>{if(document.querySelector(".splash.active"))go("home")},6500);