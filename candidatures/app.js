(() => {
  "use strict";
  const REFRESH_MS = 60000;
  const GEMINI_CHAT_URL = "https://gemini.google.com/app/99500faabc196a49?hl=fr&pli=1";
  const KEY_CLIENT = "candidate-dashboard.oauth-client-id";
  const KEY_SHEET = "candidate-dashboard.sheet-id";
  const KEY_DAILY_GOALS = "candidate-dashboard.daily-goals";
  const RANGES = [
    "'Suivi Candidatures'!A:U",
    "'Offres Détectées'!A:J",
    "'Candidature automatique'!A:G",
    "'Dashboard'!A:L"
  ];
  const $ = (id) => document.getElementById(id);
  const ui = {
    connect:$("connect-button"), dailyDrafts:$("daily-drafts-button"), setup:$("setup-button"), refresh:$("refresh-button"),
    dialog:$("settings-dialog"), client:$("client-id"), sheet:$("spreadsheet-id"),
    save:$("save-connect"), cancel:$("cancel-settings"), setupError:$("setup-error"),
    content:$("view-content"), empty:$("empty-state"), error:$("error-state"),
    search:$("search-input"), statusFilter:$("status-filter"), status:$("connection-state"),
    sync:$("last-sync"), total:$("stat-total"), active:$("stat-active"),
    responses:$("stat-responses"), responseRate:$("stat-response-rate"),
    followups:$("stat-followups"), nextFollowup:$("stat-next-followup"),
    title:$("view-title"), eyebrow:$("view-eyebrow"), description:$("view-description")
  };
  const state = { pipeline:[], offers:[], applications:[], positives:[], view:"overview", loaded:false, dailyGoals:{}, goalsDate:"" };
  let token = "";
  let tokenClient = null;
  let timer = null;
  let loading = false;

  const config = () => ({client:localStorage.getItem(KEY_CLIENT)||"",sheet:localStorage.getItem(KEY_SHEET)||""});
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const norm = (value) => String(value ?? "").trim().toLocaleLowerCase("fr");
  const number = (value) => {
    const first = String(value ?? "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
    if (!first) return null;
    const n = Number(first[0]);
    return Number.isFinite(n) ? n : null;
  };
  const isTrue = (value) => /^(true|vrai|oui|yes|☑|✓|checked)$/i.test(String(value ?? "").trim());
  const noReplyNeeded = (row) => isTrue(row[15]) || /refus|réponse reçue|offre reçue/i.test(String(row[14] || "")) || /n\/a|aucune relance/i.test(String(row[17] || ""));
  function statusClass(value) {
    const s = norm(value).normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    if (/refus|rejected/.test(s)) return "refusee";
    if (/soumis|envoye|confirme|entretien|offre recue|contacte|submitted/.test(s)) return "submitted";
    if (/bloque|bounce|invalide/.test(s)) return "blocked";
    return "";
  }
  function dateValue(value) {
    const s = String(value ?? "").trim();
    if (!s || /n\/a|aucune|réponse reçue/i.test(s)) return null;
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2])-1, Number(iso[3]));
    const dmy = s.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
    if (dmy) return new Date(Number(dmy[3]), Number(dmy[2])-1, Number(dmy[1]));
    const months = {jan:0,fév:1,fev:1,mar:2,avr:3,apr:3,mai:4,may:4,juin:5,jun:5,juil:6,jul:6,août:7,aou:7,aug:7,sep:8,sept:8,oct:9,nov:10,déc:11,dec:11};
    const fr = s.toLocaleLowerCase("fr").match(/^(\d{1,2})\s+([a-zéûô.]+)\s+(\d{4})$/i);
    if (fr) {
      const month = fr[2].replace(".","");
      const key = Object.keys(months).find((m) => month.startsWith(m));
      if (key) return new Date(Number(fr[3]),months[key],Number(fr[1]));
    }
    const parsed = new Date(s);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  function formatDate(value) {
    const date = dateValue(value);
    if (!date) return String(value || "—");
    return new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"short",year:"numeric"}).format(date);
  }
  function setStatus(online,label) {
    ui.status.classList.toggle("online",online);
    ui.status.innerHTML = "<i></i> " + esc(label);
  }
  function openDialog() {
    const c = config();
    ui.client.value = c.client; ui.sheet.value = c.sheet; ui.setupError.hidden = true;
    ui.dialog.showModal();
  }
  function linkCell(url,label) {
    const safe = String(url || "").trim();
    return safe.startsWith("https://") || safe.startsWith("http://")
      ? '<a class="data-link" href="' + esc(safe) + '" target="_blank" rel="noopener noreferrer">' + esc(label || "Ouvrir") + ' ↗</a>'
      : esc(label || "—");
  }
  function badge(value) {
    const s = String(value || "À suivre").trim();
    return '<span class="status-pill ' + statusClass(s) + '">' + esc(s) + "</span>";
  }
  function score(value) {
    const n = number(value);
    if (n === null) return '<span class="score muted">—</span>';
    return '<span class="score">' + esc(n.toFixed(1).replace(/\.0$/,"")) + '<i><b style="width:' + Math.max(0,Math.min(100,n*10)) + '%"></b></i></span>';
  }
  function table(headers, rows) {
    const th = headers.map((h) => "<th>" + esc(h) + "</th>").join("");
    const body = rows.map((row) => "<tr>" + row.map((cell) => '<td class="' + esc(cell && cell.className || "") + '">' + (cell && cell.html !== undefined ? cell.html : esc(cell)) + "</td>").join("") + "</tr>").join("");
    return '<div class="table-panel"><div class="table-scroll"><table><thead><tr>' + th + "</tr></thead><tbody>" + body + "</tbody></table></div></div>";
  }
  const html = (value,className) => ({html:value,className:className||""});
  function panel(title, kicker, content, count) {
    return '<article class="panel"><div class="panel-head"><div><p class="eyebrow">' + esc(kicker) + '</p><h3>' + esc(title) + '</h3></div>' + (count === undefined ? "" : '<span class="panel-count">' + esc(count) + "</span>") + "</div>" + content + "</article>";
  }
  function pipelineOpen(row) {
    const status = norm(row[14]);
    return !/refus|rejected|cloture|closed/.test(status);
  }
  function dueRows(days = 7) {
    const today = new Date(); today.setHours(0,0,0,0);
    const limit = new Date(today); limit.setDate(limit.getDate()+days);
    return state.pipeline.filter((r) => {
      if (noReplyNeeded(r) || !pipelineOpen(r)) return false;
      const due = dateValue(r[17]);
      return due && due <= limit;
    }).sort((a,b) => dateValue(a[17])-dateValue(b[17]));
  }
  function pipelineTable(list) {
    if (!list.length) return '<div class="empty-inline"><span>⌕</span><h3>Aucune société trouvée</h3><p>Modifie les filtres ou vérifie les lignes de l’onglet Suivi Candidatures.</p></div>';
    return table(["PRIORITÉ","ENTREPRISE","PAYS / HUB","SCORE","CONTACT","STATUT","PROCHAINE RELANCE","FIABILITÉ"],list.map((r) => [
      r[0] || "—",
      html((/^https?:\/\//i.test(r[10] || "") ? '<a class="company-anchor" href="' + esc(r[10]) + '" target="_blank" rel="noopener noreferrer">' : "") + "<strong>" + esc(r[1] || "Sans nom") + (/^https?:\/\//i.test(r[10] || "") ? "</strong></a>" : "</strong>") + "<small>" + esc(r[4] || r[5] || "") + "</small>"),
      (r[2] || "—") + (r[3] ? " · " + r[3] : ""),
      html(score(r[6])),
      html("<strong>" + esc(r[11] || "—") + "</strong><small>" + esc(r[12] || "") + "</small>"),
      html(badge(r[14])),
      formatDate(r[17]),
      r[19] || "—"
    ]));
  }
  function followupTable(list) {
    return table(["ÉCHÉANCE","ENTREPRISE","STATUT","DERNIER CONTACT","PROCHAINE ACTION"],list.map((r) => [
      html('<span class="' + ((dateValue(r[17]) < new Date(new Date().setHours(0,0,0,0))) ? "overdue" : "due-soon") + '">' + esc(formatDate(r[17])) + "</span>"),
      html("<strong>" + esc(r[1] || "Sans nom") + "</strong><small>" + esc((r[2] || "") + (r[3] ? " · " + r[3] : "")) + "</small>"),
      html(badge(r[14])),
      formatDate(r[16]),
      r[18] || "À préparer"
    ]));
  }
  function offerTable(list) {
    return table(["DÉTECTÉE","SCORE","ENTREPRISE","POSTE","LIEU","STATUT","SOURCE"],list.map((r) => [
      formatDate(r[0]), html(score(r[1])), html("<strong>" + esc(r[2] || "—") + "</strong>"),
      r[3] || "—", r[4] || "—", html(badge(r[7])),
      html(linkCell(r[5],"Voir l’offre"))
    ]));
  }
  function applicationTable(list) {
    return table(["POSTE","ENTREPRISE","DÉBUT","DURÉE","NOTE","STATUT","RÉFÉRENCE ATS"],list.map((r) => {
      const ref = String(r[6] || "");
      const jobId = ref.match(/https?:\/\/\S+|Job App ID:\s*[a-z0-9-]+/i);
      return [
        html("<strong>" + esc(r[0] || "Poste non renseigné") + "</strong>"),
        r[1] || "—", r[2] || "—", r[3] || "—", html(score(r[4])),
        html(badge(r[5])), jobId ? jobId[0] : ref || "—"
      ];
    }));
  }
  function positiveCards(list) {
    if (!list.length) return '<div class="empty-inline"><span>✳</span><h3>Aucune piste positive trouvée</h3><p>Les éléments de la section Pistes positives du tableau de bord apparaîtront ici.</p></div>';
    return '<div class="positive-grid">' + list.map((r) => {
      const values = r.map((v) => String(v || "").trim()).filter(Boolean);
      const company = values[0] || "Piste positive";
      const role = values[1] || "";
      const contact = values[2] || "";
      const status = values[3] || "En cours";
      const detail = values[4] || "";
      const follow = values[5] || "";
      const grade = values[6] || "";
      return '<article class="positive-card"><div class="positive-top"><span class="positive-star">✳</span><span class="priority-label">PISTE PRIORITAIRE</span>' + html(score(grade)).html + '</div><h3>' + esc(company) + '</h3><p class="positive-role">' + esc(role) + '</p><div class="positive-status">' + badge(status) + '</div><p class="positive-detail">' + esc(detail) + '</p><div class="positive-meta"><span>' + esc(contact) + '</span><span>' + esc(follow) + '</span></div></article>';
    }).join("") + "</div>";
  }
  const DAILY_GOALS = [
    {id:"drafts",title:"Préparer les brouillons",description:"Ouvre la conversation Gemini et lance ta session quotidienne.",action:"gemini",label:"Ouvrir Gemini"},
    {id:"offers",title:"Examiner les offres du jour",description:()=>todayOfferCount()+" offre(s) détectée(s) aujourd’hui.",action:"offers",label:"Voir les offres"},
    {id:"followups",title:"Traiter les relances dues",description:()=>dueRows(0).length+" relance(s) échue(s) ou à faire aujourd’hui.",action:"followups",label:"Voir les relances"},
    {id:"tracker",title:"Vérifier le suivi",description:"Contrôle que les changements de ta session Gemini sont bien reflétés dans le tableau.",action:"pipeline",label:"Ouvrir le pipeline"}
  ];
  function openGeminiConversation() {
    window.open(GEMINI_CHAT_URL,"_blank","noopener,noreferrer");
  }
  function localDayKey(date=new Date()) {
    return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0")+"-"+String(date.getDate()).padStart(2,"0");
  }
  function ensureDailyGoals() {
    const today=localDayKey();
    if(state.goalsDate===today)return;
    state.goalsDate=today;
    try {
      const saved=JSON.parse(localStorage.getItem(KEY_DAILY_GOALS)||"null");
      state.dailyGoals=saved&&saved.date===today&&saved.done? saved.done : {};
    } catch (_) { state.dailyGoals={}; }
  }
  function saveDailyGoals() {
    ensureDailyGoals();
    localStorage.setItem(KEY_DAILY_GOALS,JSON.stringify({date:state.goalsDate,done:state.dailyGoals}));
  }
  function toggleDailyGoal(id) {
    if(!DAILY_GOALS.some((goal)=>goal.id===id))return;
    ensureDailyGoals();
    state.dailyGoals[id]=!state.dailyGoals[id];
    saveDailyGoals();
    render();
  }
  function todayOfferCount() {
    const today=localDayKey();
    return state.offers.filter((row)=>dateValue(row[0])&&localDayKey(dateValue(row[0]))===today).length;
  }
  function dailyGoalsView() {
    ensureDailyGoals();
    const completed=DAILY_GOALS.filter((goal)=>state.dailyGoals[goal.id]).length;
    const cards=DAILY_GOALS.map((goal)=>{
      const detail=typeof goal.description==="function"?goal.description():goal.description;
      return '<article class="goal-card'+(state.dailyGoals[goal.id]?' is-done':'')+'"><label class="goal-check"><input type="checkbox" aria-label="Marquer comme terminé : '+esc(goal.title)+'" data-goal-check="'+esc(goal.id)+'"'+(state.dailyGoals[goal.id]?' checked':'')+'><span aria-hidden="true"></span></label><div class="goal-copy"><h3>'+esc(goal.title)+'</h3><p>'+esc(detail)+'</p></div><button type="button" class="goal-action" data-goal-action="'+esc(goal.action)+'">'+esc(goal.label)+' ↗</button></article>';
    }).join("");
    return '<section class="daily-goals"><div class="goal-progress"><div><span class="eyebrow">PROGRESSION DU JOUR · '+esc(new Intl.DateTimeFormat("fr-FR",{dateStyle:"full"}).format(new Date()))+'</span><h3>'+completed+' / '+DAILY_GOALS.length+' objectifs terminés</h3></div><div class="goal-meter"><i style="width:'+Math.round(completed/DAILY_GOALS.length*100)+'%"></i></div></div><div class="goal-list">'+cards+'</div><p class="goal-storage">Tes coches sont enregistrées uniquement dans ce navigateur et repartent à zéro chaque jour. Les indicateurs d’offres et de relances suivent les lignes actuelles du Sheet.</p></section>';
  }
  function overview() {
    const due = dueRows(7);
    const top = state.pipeline.slice().filter(pipelineOpen).sort((a,b) => (number(b[6])||0)-(number(a[6])||0)).slice(0,5);
    const newOffers = state.offers.slice().sort((a,b) => (number(b[1])||0)-(number(a[1])||0)).slice(0,4);
    const actions = due.length ? followupTable(due.slice(0,5)) : '<div class="empty-inline compact"><span>✓</span><p>Aucune relance échue dans les 7 prochains jours.</p></div>';
    const topTable = top.length ? table(["SCORE","ENTREPRISE","CIBLE","LOCALISATION"],top.map((r) => [html(score(r[6])),html("<strong>"+esc(r[1])+"</strong>"),r[5]||r[4]||"—",(r[2]||"—")+(r[3]?" · "+r[3]:"")])) : '<div class="empty-inline compact"><p>Connecte le Sheet pour voir les sociétés prioritaires.</p></div>';
    const offerPreview = newOffers.length ? offerTable(newOffers) : '<div class="empty-inline compact"><p>Aucune offre détectée pour le moment.</p></div>';
    return '<div class="overview-grid">' + panel("Prochaines relances","À TRAITER",actions,due.length) + panel("Cibles à fort potentiel","TES MEILLEURES CIBLES",topTable,state.pipeline.length) + '</div>' + panel("Offres repérées récemment","VEILLE EMPLOI",offerPreview,state.offers.length);
  }
  function rowsAfterHeader(matrix,kind) {
    const contains=(row,pattern)=>row.some((cell)=>pattern.test(norm(cell).normalize("NFD").replace(/[\u0300-\u036f]/g,"")));
    const headerIndex=matrix.findIndex((row)=>{
      if(!Array.isArray(row))return false;
      if(kind==="pipeline")return contains(row,/entreprise|société/)&&contains(row,/priorite/)&&contains(row,/score/);
      if(kind==="offers")return contains(row,/entreprise|société/)&&contains(row,/score/)&&contains(row,/poste|role/);
      return contains(row,/entreprise|société/)&&contains(row,/poste|role/)&&contains(row,/duree|duration/);
    });
    return headerIndex<0?[]:matrix.slice(headerIndex+1).filter((row)=>Array.isArray(row)&&row.some((cell)=>String(cell??"").trim()));
  }
  function positivesFromDashboard(matrix) {
    const start=matrix.findIndex((row)=>Array.isArray(row)&&row.some((cell)=>/pistes positives/i.test(String(cell||""))));
    if(start<0)return [];
    const result=[];let started=false;
    for(const row of matrix.slice(start+1)){
      const clean=(row||[]).map((v)=>String(v||"").trim()).filter(Boolean);
      if(!clean.length){if(started)break;continue;}
      const text=clean.join(" ").toLocaleLowerCase("fr");
      if(/entreprise|poste cibl|contact\s*\/|statut de la candidature|score\s*&\s*priorit|total des pistes/i.test(text))continue;
      if(clean.length>=4){result.push(row);started=true;}
      else if(started)break;
    }
    return result;
  }
  function setCounts() {
    const sent = state.pipeline.filter((r) => /candidature envoy|candidature depose|soumis/i.test(norm(r[14]).normalize("NFD").replace(/[\u0300-\u036f]/g,""))).length;
    const responses = state.pipeline.filter((r) => isTrue(r[15])).length;
    const active = state.pipeline.filter((r) => /contacte|candidature envoy|entretien|offre recue|en attente/i.test(norm(r[14]).normalize("NFD").replace(/[\u0300-\u036f]/g,""))).length;
    const followups = dueRows(7);
    $("stat-total").textContent = String(state.pipeline.length);
    $("stat-active").textContent = String(active);
    $("stat-responses").textContent = String(responses);
    $("stat-response-rate").textContent = sent ? Math.round(responses/sent*100) + "% de réponses · " + sent + " envois" : "aucune candidature envoyée";
    $("stat-followups").textContent = String(followups.length);
    $("stat-next-followup").textContent = followups.length ? (followups.filter((r) => dateValue(r[17]) < new Date(new Date().setHours(0,0,0,0))).length + " en retard · " + followups.length + " sous 7 jours") : "aucune échéance sous 7 jours";
    $("pipeline-count").textContent = String(state.pipeline.length);
    $("positive-count").textContent = String(state.positives.length);
    $("followup-count").textContent = String(dueRows(30).length);
    $("offers-count").textContent = String(state.offers.length);
    $("applications-count").textContent = String(state.applications.length);
    ensureDailyGoals();
    $("daily-goals-count").textContent = DAILY_GOALS.filter((goal)=>state.dailyGoals[goal.id]).length+"/"+DAILY_GOALS.length;
  }
  function fillStatusFilter(rows,statusIndex) {
    const old = ui.statusFilter.value;
    const values = [...new Set(rows.map((r) => String(r[statusIndex] || "").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"fr"));
    ui.statusFilter.innerHTML = '<option value="">Tous les statuts</option>' + values.map((v) => '<option value="' + esc(v) + '">' + esc(v) + "</option>").join("");
    if (values.includes(old)) ui.statusFilter.value = old;
  }
  function matches(row, query, statusIndex) {
    const q = norm(query);
    const status = statusIndex >= 0 ? row[statusIndex] : "";
    return (!q || row.join(" ").toLocaleLowerCase("fr").includes(q)) &&
      (!ui.statusFilter.value || status === ui.statusFilter.value);
  }
  function render() {
    if (!state.loaded) return;
    const query = ui.search.value;
    const current = state.view;
    ui.content.innerHTML = "";
    ui.error.hidden = true; ui.empty.hidden = true;
    const statusIndex = current === "offers" ? 7 : current === "applications" ? 5 : 14;
    const filterRows = current === "offers" ? state.offers : current === "applications" ? state.applications : state.pipeline;
    fillStatusFilter(filterRows,statusIndex);
    ui.statusFilter.hidden = !["pipeline","followups","offers","applications"].includes(current);
    ui.search.parentElement.hidden = current === "overview" || current === "daily";
    if (current === "overview") {
      ui.title.textContent = "Vue d’ensemble"; ui.eyebrow.textContent = "TON PLAN DE RECHERCHE";
      ui.description.textContent = "Les priorités, les relances et les opportunités réunies au même endroit.";
      ui.content.innerHTML = overview();
    } else if (current === "daily") {
      ui.title.textContent = "Objectifs du jour"; ui.eyebrow.textContent = "TA ROUTINE DE RECHERCHE";
      ui.description.textContent = "Une courte liste pour faire avancer ta recherche et garder le suivi à jour.";
      ui.content.innerHTML = dailyGoalsView();
    } else if (current === "positive") {
      ui.title.textContent = "Pistes positives"; ui.eyebrow.textContent = "OPPORTUNITÉS À FAIRE AVANCER";
      ui.description.textContent = "Les retours favorables et dossiers actifs du bloc Pistes positives dans ton tableau de bord.";
      ui.content.innerHTML = positiveCards(state.positives);
    } else if (current === "pipeline") {
      ui.title.textContent = "Pipeline des sociétés"; ui.eyebrow.textContent = state.pipeline.length + " SOCIÉTÉS SUIVIES";
      ui.description.textContent = "Priorités, stratégie, statut de contact et fiabilité des informations.";
      const list = state.pipeline.filter((r) => matches(r,query,14)).sort((a,b) => (number(b[6])||0)-(number(a[6])||0));
      ui.content.innerHTML = pipelineTable(list);
    } else if (current === "followups") {
      ui.title.textContent = "Relances à planifier"; ui.eyebrow.textContent = "SUIVI COMMERCIAL";
      ui.description.textContent = "Échéances extraites du Sheet, triées de la plus proche à la plus lointaine.";
      const list = state.pipeline.filter((r) => !noReplyNeeded(r) && pipelineOpen(r) && dateValue(r[17]) && matches(r,query,14)).sort((a,b)=>dateValue(a[17])-dateValue(b[17]));
      ui.content.innerHTML = list.length ? followupTable(list) : '<div class="empty-inline"><span>✓</span><h3>Tu es à jour</h3><p>Aucune relance ouverte n’a de date définie dans le Sheet.</p></div>';
    } else if (current === "offers") {
      ui.title.textContent = "Offres détectées"; ui.eyebrow.textContent = "VEILLE AUTOMATISÉE";
      ui.description.textContent = "Offres repérées, évaluées et prêtes à être examinées.";
      const list = state.offers.filter((r) => matches(r,query,7)).sort((a,b)=>(number(b[1])||0)-(number(a[1])||0));
      ui.content.innerHTML = list.length ? offerTable(list) : '<div class="empty-inline"><p>Aucune offre ne correspond à cette recherche.</p></div>';
    } else {
      ui.title.textContent = "Candidatures soumises"; ui.eyebrow.textContent = "SUIVI DES SOUMISSIONS";
      ui.description.textContent = "Début, durée, évaluation et référence ATS pour chaque candidature automatique.";
      const list = state.applications.filter((r) => matches(r,query,5));
      ui.content.innerHTML = list.length ? applicationTable(list) : '<div class="empty-inline"><span>↗</span><h3>Aucune candidature enregistrée</h3><p>Les lignes de l’onglet Candidature automatique apparaîtront ici.</p></div>';
    }
    setCounts();
  }
  function showError(message) {
    ui.content.innerHTML = '<div class="error">' + esc(message) + "</div>";
  }
  function clearError() { ui.error.textContent = ""; ui.error.hidden = true; }
  function oauth(clientId) {
    if (!window.google || !google.accounts || !google.accounts.oauth2) throw new Error("La bibliothèque Google n'est pas prête. Réessaie dans quelques secondes.");
    if (!tokenClient || tokenClient.clientId !== clientId) {
      tokenClient = google.accounts.oauth2.initTokenClient({client_id:clientId,scope:"https://www.googleapis.com/auth/spreadsheets.readonly",callback:()=>{},error_callback:(e)=>{ui.setupError.textContent=(e&&e.message)||"La fenêtre Google n'a pas pu s'ouvrir.";ui.setupError.hidden=false;}});
      tokenClient.clientId = clientId;
    }
    return tokenClient;
  }
  function getToken(clientId) {
    return new Promise((resolve,reject) => {
      const client = oauth(clientId); let done = false;
      client.callback = (r) => {
        if (done) return; done = true;
        if (r && r.access_token) resolve(r.access_token);
        else reject(new Error((r && (r.error_description||r.error))||"Google n'a pas fourni de jeton d'accès."));
      };
      try { client.requestAccessToken({prompt:""}); } catch(e) { reject(e); return; }
      window.setTimeout(()=>{if(!done)reject(new Error("Connexion interrompue. Clique sur Connecter Google pour réessayer."));},120000);
    });
  }
  async function loadSheet() {
    if (!token || loading) return;
    const sheetId = config().sheet;
    if (!sheetId) return;
    loading = true; ui.refresh.classList.add("spinning");
    try {
      const params = new URLSearchParams();
      RANGES.forEach((r) => params.append("ranges",r));
      params.set("majorDimension","ROWS");
      const url = "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(sheetId) + "/values:batchGet?" + params.toString();
      const response = await fetch(url,{headers:{Authorization:"Bearer "+token}});
      if (response.status===401) {
        token=""; if(timer)clearInterval(timer); timer=null; setStatus(false,"Reconnecter");
        showError("La connexion Google a expiré. Reconnecte ton compte pour reprendre la synchronisation."); return;
      }
      if (response.status===403) throw new Error("Accès refusé. Vérifie que l’API Google Sheets est activée et que ce compte peut lire le document.");
      if (response.status===404) throw new Error("Document introuvable. Vérifie l’identifiant du Google Sheet.");
      if (!response.ok) throw new Error("Erreur Google Sheets ("+response.status+"). Réessaie dans un instant.");
      const result = await response.json();
      const vals = (result.valueRanges||[]).map((v)=>Array.isArray(v.values)?v.values:[]);
      state.pipeline = rowsAfterHeader(vals[0],"pipeline").filter((r)=>r[1]).map((r)=>Array.from({length:21},(_,i)=>String(r[i]??"").trim()));
      state.offers = rowsAfterHeader(vals[1],"offers").filter((r)=>r.some((v)=>String(v??"").trim())).map((r)=>Array.from({length:10},(_,i)=>String(r[i]??"").trim()));
      state.applications = rowsAfterHeader(vals[2],"applications").filter((r)=>r.some((v)=>String(v??"").trim())).map((r)=>Array.from({length:7},(_,i)=>String(r[i]??"").trim()));
      state.positives = positivesFromDashboard(vals[3]);
      state.loaded=true;
      clearError(); render();
      ui.sync.textContent = new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium",timeStyle:"short"}).format(new Date());
      setStatus(true,"Connecté");
    } catch(e) {
      showError((e&&e.message)||"Impossible de lire le Google Sheet."); setStatus(false,"Erreur");
    } finally { loading=false; ui.refresh.classList.remove("spinning"); }
  }
  function connect(clientId,sheetId) {
    ui.setupError.hidden=true;
    return Promise.resolve().then(()=>getToken(clientId)).then(async(value)=>{
      token=value; localStorage.setItem(KEY_CLIENT,clientId); localStorage.setItem(KEY_SHEET,sheetId);
      if(ui.dialog.open)ui.dialog.close();
      setStatus(true,"Connecté"); clearError(); await loadSheet();
      if(timer)clearInterval(timer); timer=window.setInterval(loadSheet,REFRESH_MS);
    });
  }
  function connectButton() {
    const c=config();
    if(!c.client||!c.sheet){openDialog();return;}
    connect(c.client,c.sheet).catch((e)=>{showError((e&&e.message)||"Connexion impossible.");setStatus(false,"Hors ligne");});
  }
  $("view-tabs").addEventListener("click",(event)=>{
    const button=event.target.closest(".view-tab");
    if(!button)return;
    state.view=button.dataset.view;
    document.querySelectorAll(".view-tab").forEach((b)=>b.classList.toggle("active",b===button));
    render();
  });
  ui.content.addEventListener("change",(event)=>{
    const checkbox=event.target.closest("[data-goal-check]");
    if(checkbox)toggleDailyGoal(checkbox.dataset.goalCheck);
  });
  ui.content.addEventListener("click",(event)=>{
    const button=event.target.closest("[data-goal-action]");
    if(!button)return;
    const action=button.dataset.goalAction;
    if(action==="gemini"){openGeminiConversation();return;}
    state.view=action;
    document.querySelectorAll(".view-tab").forEach((tab)=>tab.classList.toggle("active",tab.dataset.view===action));
    render();
  });
  ui.connect.addEventListener("click",connectButton);
  ui.dailyDrafts.addEventListener("click",openGeminiConversation);
  ui.setup.addEventListener("click",openDialog);
  document.querySelectorAll(".connect-trigger").forEach((b)=>b.addEventListener("click",openDialog));
  ui.cancel.addEventListener("click",()=>ui.dialog.close());
  ui.refresh.addEventListener("click",()=>token?loadSheet():connectButton());
  ui.search.addEventListener("input",render);
  ui.statusFilter.addEventListener("change",render);
  ui.save.addEventListener("click",()=>{
    const client=ui.client.value.trim(),sheet=ui.sheet.value.trim();
    if(!client.endsWith(".apps.googleusercontent.com")){ui.setupError.textContent="L’identifiant doit être un client OAuth Web qui se termine par .apps.googleusercontent.com.";ui.setupError.hidden=false;return;}
    if(!/^[a-zA-Z0-9_-]{20,}$/.test(sheet)){ui.setupError.textContent="Saisis l’identifiant du tableur, sans l’URL complète.";ui.setupError.hidden=false;return;}
    connect(client,sheet).catch((e)=>{ui.setupError.textContent=(e&&e.message)||"Connexion impossible.";ui.setupError.hidden=false;});
  });
  ui.dialog.addEventListener("click",(e)=>{if(e.target===ui.dialog)ui.dialog.close();});
  if(config().client&&config().sheet){
    ui.empty.querySelector("h3").textContent="Connexion requise";
    ui.empty.querySelector("p").textContent="Tes identifiants sont conservés sur cet appareil. Connecte Google pour charger tes données.";
  }
})();
