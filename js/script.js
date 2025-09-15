document.addEventListener("DOMContentLoaded",()=>{
/* ====== DOM ====== */
const $=id=>document.getElementById(id);
const canvas=$("gameCanvas"),ctx=canvas.getContext("2d");
const startScreen=$("startScreen"),mainNav=$("mainNav"),hud=$("hudContainer"),wrap=$("gameWrap");
const scoreEl=$("score"),livesEl=$("lives"),levelEl=$("level"),bestEl=$("best");
const msgEl=$("message"),effFill=$("effectFill"),effList=$("activeEffects");
const barFill=$("levelTimeFill"),barText=$("levelTimeText");
const overlay=$("overlay"),overTitle=$("overlayTitle"),overSub=$("overlaySubtitle");

/* ====== Estado ====== */
let running=false,paused=false,keys={},score=0,level=1,lives=3;
let best=+localStorage.getItem("bestScore")||0;
let car,tokens=[],statics=[],timers={},tick=0,levelTicks=0,levelSeconds=20;
const MAX_LEVEL=10,MAX_LIVES=5;
const levelGoals=[20,30,50,80,110,140,160,180,200];

/* ====== Sprites ====== */
const load=src=>{let i=new Image();i.src="images/"+src;return i;}
const sprites={
  car:load("carro.png"),cone:load("cono.png"),llanta:load("llanta.png"),roca:load("roca.png"),
  star:load("star.png"),bolt:load("tornillo.png"),heart:load("heart.png"),skull:load("muerte.png"),alto:load("alto.png")
};

/* ====== Clases ====== */
class Car{
  constructor(){this.w=56;this.h=84;this.x=canvas.width/2;this.y=canvas.height*0.75;this.speed=3;this.turbo=false;this.inv=false;}
  move(){
    let s=this.turbo?this.speed*1.8:this.speed;
    if(keys.ArrowUp||keys.w)this.y-=s;
    if(keys.ArrowDown||keys.s)this.y+=s;
    if(keys.ArrowLeft||keys.a)this.x-=s;
    if(keys.ArrowRight||keys.d)this.x+=s;
    this.x=Math.max(0,Math.min(this.x,canvas.width-this.w));
    this.y=Math.max(0,Math.min(this.y,canvas.height-this.h));
  }
  draw(){
    ctx.save();
    if(this.turbo){ctx.shadowColor="cyan";ctx.shadowBlur=16;}
    if(this.inv){ctx.shadowColor="yellow";ctx.shadowBlur=20;}
    ctx.drawImage(sprites.car,this.x,this.y,this.w,this.h);
    ctx.restore();
  }
  aabb(){return{x:this.x,y:this.y,w:this.w,h:this.h};}
}

class Token{
  constructor(type){
    this.type=type;this.w=34;this.h=34;
    this.x=Math.random()*(canvas.width-this.w);
    this.y=Math.random()*(canvas.height-this.h);
    const v=1.2+level*0.2,ang=Math.random()*Math.PI*2;
    this.vx=Math.cos(ang)*v;this.vy=Math.sin(ang)*v;
  }
  update(){
    this.x+=this.vx;this.y+=this.vy;
    if(this.x<0||this.x+this.w>canvas.width)this.vx*=-1;
    if(this.y<0||this.y+this.h>canvas.height)this.vy*=-1;
  }
  draw(){ctx.drawImage(sprites[this.type],this.x,this.y,this.w,this.h);}
  aabb(){return{x:this.x,y:this.y,w:this.w,h:this.h};}
}

class StaticBlock{
  constructor(){this.w=48;this.h=48;this.reloc();}
  reloc(){this.x=Math.random()*(canvas.width-this.w);this.y=Math.random()*(canvas.height*0.7-this.h)+50;}
  draw(){ctx.drawImage(sprites.alto,this.x,this.y,this.w,this.h);}
  aabb(){return{x:this.x,y:this.y,w:this.w,h:this.h};}
}

/* ====== Juego ====== */
function startGame(){
  car=new Car();tokens=[];statics=[];timers={};
  score=0;level=1;lives=3;
  running=true;paused=false;
  levelSeconds=20;levelTicks=levelSeconds*60;tick=0;
  overlay.classList.add("d-none");
  requestAnimationFrame(loop);
}

function loop(){if(!running)return;if(!paused)update();requestAnimationFrame(loop);}
function update(){
  ctx.clearRect(0,0,canvas.width,canvas.height);drawTrack();
  car.move();car.draw();
  spawnTokens();tokens.forEach(t=>{t.update();t.draw();});
  handleStatics();objectCollisions();collisions();
  updateEffects();updateLevelTimer();updateHUD();
  if(level>MAX_LEVEL)win();
}

function drawTrack(){
  ctx.fillStyle="#222";ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.setLineDash([22,16]);ctx.strokeStyle="yellow";ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(canvas.width/2,0);ctx.lineTo(canvas.width/2,canvas.height);ctx.stroke();
  ctx.setLineDash([]);
}

/* ====== Spawns ====== */
function spawnTokens(){
  let max=5+level*1.5;if(tokens.length>=max)return;
  let pool=["cone","llanta","roca"];
  if(Math.random()<0.2)pool.push("star","bolt","heart","skull");
  tokens.push(new Token(pool[Math.floor(Math.random()*pool.length)]));
}
function handleStatics(){
  if(level<4)return;
  let target=2+Math.floor(level/2);
  while(statics.length<target)statics.push(new StaticBlock());
  if(tick%300===0)statics.forEach(s=>s.reloc());
  statics.forEach(s=>s.draw());
}

/* ====== Colisiones ====== */
function collisions(){
  for(let i=tokens.length-1;i>=0;i--){
    let t=tokens[i];if(!hit(car.aabb(),t.aabb()))continue;
    if(t.type==="llanta")score+=5;
    else if(t.type==="cone")score+=10;
    else if(t.type==="roca"){score=Math.max(0,score-10);if(score===0)lives--;}
    else if(t.type==="heart"&&lives<MAX_LIVES)lives++;
    else if(t.type==="bolt")activate("turbo",300);
    else if(t.type==="star")activate("inv",300);
    else if(t.type==="skull")lives--;
    tokens.splice(i,1);
    if(lives<=0)return gameOver();
  }
  for(const s of statics){if(hit(car.aabb(),s.aabb())&&!car.inv){lives--;car.y+=20;if(lives<=0)return gameOver();}}
}

function objectCollisions(){
  for(let i=0;i<tokens.length;i++){
    for(let j=i+1;j<tokens.length;j++){
      if(hit(tokens[i].aabb(),tokens[j].aabb())){
        let tmp=tokens[i].vx;tokens[i].vx=tokens[j].vx;tokens[j].vx=tmp;
        tmp=tokens[i].vy;tokens[i].vy=tokens[j].vy;tokens[j].vy=tmp;
      }
    }
  }
  for(const t of tokens){for(const s of statics){if(hit(t.aabb(),s.aabb())){t.vx*=-1;t.vy*=-1;}}}
}

/* ====== Efectos ====== */
function activate(n,d){timers[n]=d;if(n==="turbo")car.turbo=true;if(n==="inv")car.inv=true;}
function updateEffects(){
  let html="",remain=0;base=300;
  for(const k in timers){
    if(timers[k]>0){timers[k]--;remain=Math.max(remain,timers[k]);html+=`<div>${k} ${Math.ceil(timers[k]/60)}s</div>`;}
    else{if(k==="turbo")car.turbo=false;if(k==="inv")car.inv=false;delete timers[k];}
  }
  effList.innerHTML=html;effFill.style.width=(remain?remain/base*100:0)+"%";effFill.style.background=timers.inv?"yellow":"cyan";
}

/* ====== Nivel y HUD ====== */
function updateLevelTimer(){
  tick++;levelTicks--;
  if(tick%60===0)barText.textContent=Math.ceil(levelTicks/60)+"s";
  barFill.style.width=(levelTicks/(levelSeconds*60))*100+"%";
  let goal=levelGoals[level-1]||200;
  if(score>=goal&&level<=MAX_LEVEL){level++;levelSeconds=Math.max(8,20-(level-1));levelTicks=levelSeconds*60;showMsg("⬆ Nivel "+level);}
  if(levelTicks<=0&&score<goal){lives--;levelTicks=levelSeconds*60;showMsg("⏳ Tiempo agotado");if(lives<=0)gameOver();}
}
function updateHUD(){
  scoreEl.textContent="Puntos: "+score;
  levelEl.textContent="Nivel: "+level;
  livesEl.textContent="❤️".repeat(lives);
  bestEl.textContent="Mejor: "+best;
}
function showMsg(t){msgEl.textContent=t;msgEl.style.display="block";clearTimeout(showMsg._t);showMsg._t=setTimeout(()=>msgEl.style.display="none",1200);}
function gameOver(){running=false;if(score>best){best=score;localStorage.setItem("bestScore",best);}showOverlay("💀 GAME OVER 💀","Puntaje: "+score);}
function win(){running=false;showOverlay("🎉 GANASTE 🎉","Puntaje: "+score);confetti();}
function showOverlay(t,s){overTitle.textContent=t;overSub.textContent=s;overlay.classList.remove("d-none");}
function confetti(){for(let i=0;i<120;i++)setTimeout(()=>{ctx.fillStyle=`hsl(${Math.random()*360},100%,50%)`;ctx.beginPath();ctx.arc(Math.random()*canvas.width,Math.random()*canvas.height,4,0,7);ctx.fill();},i*15);}
function hit(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}

/* ====== Input ====== */
document.addEventListener("keydown",e=>keys[e.key]=true);
document.addEventListener("keyup",e=>keys[e.key]=false);

// 🚗 Mover carro con el mouse
canvas.addEventListener("mousemove",e=>{
  if(!car)return;
  const rect=canvas.getBoundingClientRect();
  const mx=e.clientX-rect.left, my=e.clientY-rect.top;
  car.x=mx-car.w/2;car.y=my-car.h/2;
  car.x=Math.max(0,Math.min(car.x,canvas.width-car.w));
  car.y=Math.max(0,Math.min(car.y,canvas.height-car.h));
});
// ⚡ Nitro con clic
canvas.addEventListener("click",()=>{if(car)activate("turbo",120);showMsg("⚡ Nitro!");});

/* ====== Botones ====== */
$("playBtn").onclick=()=>{startScreen.classList.add("d-none");mainNav.classList.remove("d-none");hud.classList.remove("d-none");wrap.classList.remove("d-none");startGame();}
$("pauseBtn").onclick=()=>paused=!paused;
$("restartBtn").onclick=()=>startGame();
$("overlayRetry").onclick=()=>{overlay.classList.add("d-none");startGame();}
$("overlayHome").onclick=()=>{overlay.classList.add("d-none");mainNav.classList.add("d-none");hud.classList.add("d-none");wrap.classList.add("d-none");startScreen.classList.remove("d-none");};
});
