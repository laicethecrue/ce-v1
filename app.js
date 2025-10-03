
// ---- ÉTAT GLOBAL ----
const state = {
  page: "home",
  data: { focuses: [], missionTemplates: [], journalPrompts: [] },
  today: null,   // plan du jour (si en cours)
  log: []        // historique (localStorage)
};

// ---- CHARGEMENT ----
async function loadData(){
  try{
    const r = await fetch("./ce-data.json");
    state.data = await r.json();
  }catch(e){ console.error(e); }
  // log/plan depuis localStorage
  try{
    state.log = JSON.parse(localStorage.getItem("ce_v1_log")||"[]");
    state.today = JSON.parse(localStorage.getItem("ce_v1_today")||"null");
  }catch(e){}
  render();
}

// ---- OUTILS ----
function todayStr(d=new Date()){ return d.toISOString().slice(0,10); }
function saveToday(){ localStorage.setItem("ce_v1_today", JSON.stringify(state.today)); }
function pushLog(entry){
  state.log.unshift(entry);
  localStorage.setItem("ce_v1_log", JSON.stringify(state.log.slice(0,200)));
}
function totalPoints(){ return state.log.reduce((s,e)=>s+(e.points||0),0); }
function badge(pts){ return pts>=60 ? "🏆 Or" : pts>=30 ? "🥈 Argent" : "🥉 Bronze"; }

// ---- ROUTER ----
function go(p){ state.page=p; render(); }

// ---- CONSTRUCTION PLAN ----
function startNewPlan(){
  state.today = {
    date: todayStr(),
    step: "focus",             // focus -> plan -> journal -> done
    chosen: [],                // ids focus
    missions: [],              // {focus,label,unit,target,count,pts,bonus}
    journal: ["","",""],
    points: 0
  };
  saveToday(); go("focus");
}

function toggleFocus(id){
  const c = state.today.chosen;
  if (c.includes(id)) { state.today.chosen = c.filter(x=>x!==id); }
  else {
    if (c.length>=2) return alert("Tu peux choisir au maximum 2 focus.");
    c.push(id);
  }
  saveToday(); render();
}

function buildMissions(){
  const picks = state.today.chosen;
  if (picks.length===0) return alert("Choisis au moins 1 focus (idéalement 2).");
  const T = state.data.missionTemplates;
  const chosenTemplates = [];
  // 2 missions issues des 2 focus choisis (ou 1 si un seul focus),
  // + 1 mission complémentaire automatique (communication par ex.)
  picks.forEach(id=>{
    const t = T.find(x=>x.focus===id); if (t) chosenTemplates.push({...t});
  });
  // complémentaire : communication si pas déjà là
  if (!chosenTemplates.find(t=>t.focus==="communication")){
    const extra = T.find(t=>t.focus==="communication");
    if (extra) chosenTemplates.push({...extra});
  }
  // limiter à 3 missions
  state.today.missions = chosenTemplates.slice(0,3).map(t=>({
    focus: t.focus, label: t.label, unit: t.unit,
    target: t.target, count: 0, pts: t.pts, bonus: t.bonus
  }));
  state.today.step = "plan";
  saveToday(); go("plan");
}

function incMission(i,delta){
  const m = state.today.missions[i]; if (!m) return;
  m.count = Math.max(0, m.count + delta);
  saveToday(); render();
}

function finishPlan(){
  // scoring : points = count*pts + bonus si target atteint
  let pts = 0;
  let allHit = true;
  state.today.missions.forEach(m=>{
    pts += m.count * (m.pts||0);
    if (m.count >= m.target) pts += (m.bonus||0);
    else allHit = false;
  });
  if (allHit) pts += 10; // bonus total si les 3 missions sont atteintes
  state.today.points = pts;
  state.today.step = "journal";
  saveToday();
  go("journal");
}

function saveJournal(){
  const a = document.getElementById("j1").value.trim();
  const b = document.getElementById("j2").value.trim();
  const c = document.getElementById("j3").value.trim();
  state.today.journal = [a,b,c];
  // fin : on pousse dans le log
  pushLog({...state.today});
  const earned = state.today.points;
  // reset "today"
  state.today = null;
  localStorage.removeItem("ce_v1_today");
  alert(`✅ Enregistré • +${earned} pts • ${badge(earned)}`);
  go("home");
}

// ---- VUES ----
const V = {};

V.home = () => {
  const hasToday = state.today && state.today.date===todayStr();
  const tp = totalPoints();
  return `
    <h2>Tableau de bord</h2>
    <div class="card">
      <div class="kv"><span>Total points</span><b>${tp}</b></div>
      <div class="kv"><span>Récompense du jour</span><b>${badge(tp)}</b></div>
    </div>
    ${hasToday ? `
      <div class="card">
        <div class="badge">Plan en cours (${state.today.step})</div>
        <p>Focus: ${state.today.chosen.map(id=>state.data.focuses.find(f=>f.id===id)?.name||id).join(", ")||"—"}</p>
        <div class="row">
          <button data-act="resume">▶️ Continuer</button>
          <button data-act="restart">🔄 Recommencer</button>
        </div>
      </div>` : `
      <button data-act="start">🎯 Nouveau plan (aujourd’hui)</button>
    `}
    <button data-act="stats">📈 Statistiques</button>
    <button data-act="history">🗒️ Historique</button>
  `;
};

V.focus = () => {
  const fs = state.data.focuses;
  const chosen = state.today.chosen;
  const chips = fs.map(f=>{
    const on = chosen.includes(f.id) ? "on" : "";
    return `<button class="tag ${on}" data-act="toggleFocus" data-id="${f.id}">${f.name}</button>
            <div class="kv"><span>Tip</span><span>${f.tip}</span></div>`;
  }).join("");
  return `
    <h2>Étape A — Choisis 1 à 2 focus</h2>
    <div class="card">${chips}</div>
    <button data-act="build">➡️ Construire mes missions</button>
    <button data-act="home">⬅ Accueil</button>
  `;
};

V.plan = () => {
  const ms = state.today.missions;
  const list = ms.map((m,i)=>`
    <div class="card">
      <div class="badge">${m.label}</div>
      <div class="kv"><span>Objectif</span><b>${m.target} ${m.unit}</b></div>
      <div class="kv"><span>Score</span><b>${m.pts} pt / ${m.unit} • Bonus +${m.bonus} si objectif atteint</b></div>
      <div class="counter">
        <button data-act="inc" data-i="${i}" data-d="-1">−</button>
        <b>${m.count}</b>
        <button data-act="inc" data-i="${i}" data-d="1">+</button>
      </div>
    </div>
  `).join("");
  return `
    <h2>Étape B — Plan de match</h2>
    ${list}
    <button data-act="finish">✅ Terminer & passer au Journal</button>
    <button data-act="home">⬅ Accueil</button>
  `;
};

V.journal = () => {
  const p = state.data.journalPrompts;
  return `
    <h2>Étape C — Journal rapide</h2>
    <div class="card"><div class="badge">Après l'entraînement ou le match</div>
      <p><b>${p[0]}</b></p><textarea id="j1"></textarea>
      <p><b>${p[1]}</b></p><textarea id="j2"></textarea>
      <p><b>${p[2]}</b></p><textarea id="j3"></textarea>
    </div>
    <button data-act="saveJournal">💾 Enregistrer</button>
    <button data-act="home">⬅ Accueil</button>
  `;
};

V.stats = () => {
  const tp = totalPoints();
  const last7 = state.log.slice(0,7);
  const rows = last7.map(e=>`<div class="kv"><span>${e.date} — ${e.chosen.map(id=>state.data.focuses.find(f=>f.id===id)?.name||id).join(", ")}</span><b>${e.points} pts</b></div>`).join("") || "<p>Pas encore de données.</p>";
  return `
    <h2>📈 Statistiques</h2>
    <div class="card">
      <div class="kv"><span>Total points cumulés</span><b>${tp}</b></div>
      <div class="kv"><span>Sessions enregistrées</span><b>${state.log.length}</b></div>
    </div>
    <div class="card">
      <div class="badge">7 dernières sessions</div>
      ${rows}
    </div>
    <button data-act="home">⬅ Accueil</button>
  `;
};

V.history = () => {
  const rows = state.log.map(e=>`
    <div class="card">
      <div class="badge">${e.date} • ${e.points} pts</div>
      <div><b>Focus:</b> ${e.chosen.join(", ")}</div>
      <div><b>Missions:</b> ${e.missions.map(m=>`${m.label}: ${m.count}/${m.target}`).join(" • ")}</div>
      <div><b>Journal:</b> ${e.journal.filter(Boolean).join(" | ")||"—"}</div>
    </div>
  `).join("") || "<p>Aucun historique pour l’instant.</p>";
  return `<h2>🗒️ Historique</h2>${rows}<button data-act="home">⬅ Accueil</button>`;
};

// ---- RENDU ----
function render(){
  const root = document.getElementById("app");
  const html = V[state.page] ? V[state.page]() : "<p>Chargement…</p>";
  root.innerHTML = html;
}

// ---- DÉLÉGATION CLICS ----
document.addEventListener("click",(e)=>{
  const b = e.target.closest("button"); if(!b) return;
  const act = b.getAttribute("data-act");

  if (act==="start"){ startNewPlan(); return; }
  if (act==="resume"){
    const step = state.today?.step || "focus";
    go(step); return;
  }
  if (act==="restart"){ if (confirm("Recommencer le plan du jour ?")) startNewPlan(); return; }
  if (act==="stats"){ go("stats"); return; }
  if (act==="history"){ go("history"); return; }
  if (act==="home"){ go("home"); return; }

  if (act==="toggleFocus"){ toggleFocus(b.getAttribute("data-id")); return; }
  if (act==="build"){ buildMissions(); return; }

  if (act==="inc"){
    const i = Number(b.getAttribute("data-i"));
    const d = Number(b.getAttribute("data-d"));
    incMission(i,d); return;
  }
  if (act==="finish"){ finishPlan(); return; }
  if (act==="saveJournal"){ saveJournal(); return; }
});

// ---- INIT ----
loadData();
