const toast=document.querySelector("#toast");
let timer;
function show(message){toast.textContent=message;toast.classList.add("show");clearTimeout(timer);timer=setTimeout(()=>toast.classList.remove("show"),1600)}
const intro=document.querySelector("#welcome-screen");
const enter=()=>{intro.classList.add("hide");document.body.classList.add("intro-complete");setTimeout(()=>intro.remove(),700)};
document.querySelector("#enter-button").addEventListener("click",enter);
document.querySelector("#skip-button").addEventListener("click",enter);
setTimeout(()=>{if(intro&&!intro.classList.contains("hide"))enter()},5200);
document.querySelectorAll(".feature").forEach(b=>b.addEventListener("click",()=>show(b.dataset.mode+" mode is ready.")));
document.querySelectorAll(".recent-card").forEach(b=>b.addEventListener("click",()=>show("Opening "+b.querySelector("b").textContent+" with Radha.")));
document.querySelector("#start").addEventListener("click",()=>show("Radha is listening."));
document.querySelector("#core-nav").addEventListener("click",()=>show("Radha core is active."));
document.querySelector("#chat-nav").addEventListener("click",()=>show("Chat space is ready."));
document.querySelector("#control-nav").addEventListener("click",()=>show("Control center is ready."));
(function(){
  function repairViewport(){
    document.documentElement.style.setProperty('--radha-vw','100vw');
    document.body.style.width='100%';
    document.body.style.minWidth='100%';
  }
  repairViewport();
  window.addEventListener('resize',repairViewport,{passive:true});
  window.addEventListener('orientationchange',repairViewport,{passive:true});
})();
