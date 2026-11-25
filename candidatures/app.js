(() => {
  "use strict";
  const RANGE = "'Candidature automatique'!A4:G";
  const REFRESH_MS = 60000;
  const KEY_CLIENT = "candidate-dashboard.oauth-client-id";
  const KEY_SHEET = "candidate-dashboard.sheet-id";
  const $ = (id) => document.getElementById(id);
  const ui = {
    connect: $("connect-button"), setup: $("setup-button"), refresh: $("refresh-button"),
    dialog: $("settings-dialog"), client: $("client-id"), sheet: $("spreadsheet-id"),
    save: $("save-connect"), cancel: $("cancel-settings"), setupError: $("setup-error"),
    body: $("applications-body"), empty: $("empty-state"), error: $("error-state"),
    search: $("search-input"), status: $("connection-state"), sync: $("last-sync"),
    total: $("stat-total"), submitted: $("stat-submitted"), average: $("stat-average"), count: $("row-count")
  };
  let rows = [];
  let token = "";
  let tokenClient = null;
  let timer = null;
  let loading = false;

  const config = () => ({ client: localStorage.getItem(KEY_CLIENT) || "", sheet: localStorage.getItem(KEY_SHEET) || "" });
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const norm = (value) => String(value ?? "").trim().toLocaleLowerCase("fr");
  const statusKind = (value) => {
    const s = norm(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (/soumis|envoye|confirme|submitted/.test(s)) return "submitted";
    if (/refus|rejected/.test(s)) return "refusee";
    return "";
  };
  function setStatus(online, label) {
    ui.status.classList.toggle("online", online);
    ui.status.innerHTML = "<i></i> " + esc(label);
  }
  function openDialog() {
    const c = config();
    ui.client.value = c.client;
    ui.sheet.value = c.sheet;
    ui.setupError.hidden = true;
    ui.dialog.showModal();
  }
  function render() {
    const q = norm(ui.search.value);
    const list = rows.filter((r) => r.join(" ").toLocaleLowerCase("fr").includes(q));
    ui.body.innerHTML = list.map((r) => {
      const scoreNum = Number(String(r[4] || "").replace(",", "."));
      const score = Number.isFinite(scoreNum) && r[4] !== "" ? scoreNum : null;
      const ref = String(r[6] || "").trim();
      const url = ref.match(/https?:\/\/[^\s)]+/i);
      const refHtml = url ? '<a class="reference-link" target="_blank" rel="noopener noreferrer" href="' + esc(url[0]) + '">' + esc(ref.replace(url[0], "").trim() || "Ouvrir") + ' ↗</a>' : '<span class="reference-link">' + esc(ref || "—") + "</span>";
      const scoreHtml = score === null ? "—" : esc(score) + '<span class="score-track"><i style="width:' + Math.max(0, Math.min(100, score * 10)) + '%"></i></span>';
      const status = String(r[5] || "À suivre").trim();
      return "<tr><td class=\"job-title\">" + esc(r[0] || "Poste non renseigné") + "</td><td class=\"company-cell\">" + esc(r[1] || "—") + "</td><td class=\"date-cell\">" + esc(r[2] || "—") + "</td><td class=\"duration-cell\">" + esc(r[3] || "—") + "</td><td><span class=\"score\">" + scoreHtml + "</span></td><td><span class=\"status-pill " + statusKind(status) + "\">" + esc(status) + "</span></td><td>" + refHtml + "</td></tr>";
    }).join("");
    ui.body.closest("table").hidden = list.length === 0;
    ui.empty.hidden = list.length > 0 || Boolean(ui.error.textContent);
    ui.count.textContent = String(list.length);
    ui.total.textContent = String(rows.length);
    ui.submitted.textContent = String(rows.filter((r) => statusKind(r[5]) === "submitted").length);
    const scores = rows.map((r) => Number(String(r[4] || "").replace(",", "."))).filter(Number.isFinite);
    ui.average.textContent = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "—";
  }
  function showError(message) {
    ui.error.textContent = message;
    ui.error.hidden = false;
    ui.empty.hidden = true;
    ui.body.closest("table").hidden = true;
  }
  function clearError() { ui.error.textContent = ""; ui.error.hidden = true; }
  function oauth(clientId) {
    if (!window.google || !google.accounts || !google.accounts.oauth2) throw new Error("La bibliothèque Google n'est pas prête. Réessaie dans quelques secondes.");
    if (!tokenClient || tokenClient.clientId !== clientId) {
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
        callback: () => {},
        error_callback: (e) => {
          ui.setupError.textContent = e && e.message ? e.message : "La fenêtre Google n'a pas pu s'ouvrir.";
          ui.setupError.hidden = false;
        }
      });
      tokenClient.clientId = clientId;
    }
    return tokenClient;
  }
  function getToken(clientId) {
    return new Promise((resolve, reject) => {
      const client = oauth(clientId);
      let done = false;
      client.callback = (response) => {
        if (done) return;
        done = true;
        if (response && response.access_token) resolve(response.access_token);
        else reject(new Error((response && (response.error_description || response.error)) || "Google n'a pas fourni de jeton d'accès."));
      };
      try { client.requestAccessToken({prompt: ""}); } catch (e) { reject(e); return; }
      window.setTimeout(() => { if (!done) reject(new Error("Connexion interrompue. Clique sur Connecter Google pour réessayer.")); }, 120000);
    });
  }
  async function loadSheet() {
    if (!token || loading) return;
    const sheetId = config().sheet;
    if (!sheetId) return;
    loading = true;
    ui.refresh.classList.add("spinning");
    try {
      const url = "https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(sheetId) + "/values/" + encodeURIComponent(RANGE) + "?majorDimension=ROWS";
      const response = await fetch(url, {headers:{Authorization:"Bearer " + token}});
      if (response.status === 401) {
        token = "";
        if (timer) clearInterval(timer);
        timer = null;
        setStatus(false, "Reconnecter");
        showError("La connexion Google a expiré. Reconnecte ton compte pour reprendre la synchronisation.");
        return;
      }
      if (response.status === 403) throw new Error("Accès refusé. Vérifie que l’API Google Sheets est activée et que ce compte peut lire le document.");
      if (response.status === 404) throw new Error("Document introuvable. Vérifie l’identifiant du Google Sheet.");
      if (!response.ok) throw new Error("Erreur Google Sheets (" + response.status + "). Réessaie dans un instant.");
      const payload = await response.json();
      rows = (Array.isArray(payload.values) ? payload.values : [])
        .filter((r) => r.some((cell) => String(cell ?? "").trim() !== ""))
        .filter((r) => norm(r[0]) !== "poste")
        .map((r) => Array.from({length:7}, (_, i) => String(r[i] ?? "").trim()));
      clearError();
      render();
      ui.sync.textContent = new Intl.DateTimeFormat("fr-FR", {dateStyle:"medium",timeStyle:"short"}).format(new Date());
      setStatus(true, "Connecté");
    } catch (e) {
      showError((e && e.message) || "Impossible de lire le Google Sheet.");
      setStatus(false, "Erreur");
    } finally {
      loading = false;
      ui.refresh.classList.remove("spinning");
    }
  }
  function connect(clientId, sheetId) {
    ui.setupError.hidden = true;
    return Promise.resolve().then(() => getToken(clientId)).then(async (value) => {
      token = value;
      localStorage.setItem(KEY_CLIENT, clientId);
      localStorage.setItem(KEY_SHEET, sheetId);
      if (ui.dialog.open) ui.dialog.close();
      setStatus(true, "Connecté");
      clearError();
      await loadSheet();
      if (timer) clearInterval(timer);
      timer = window.setInterval(loadSheet, REFRESH_MS);
    });
  }
  function connectButton() {
    const c = config();
    if (!c.client || !c.sheet) { openDialog(); return; }
    connect(c.client, c.sheet).catch((e) => { showError((e && e.message) || "Connexion impossible."); setStatus(false, "Hors ligne"); });
  }
  ui.connect.addEventListener("click", connectButton);
  ui.setup.addEventListener("click", openDialog);
  document.querySelectorAll(".connect-trigger").forEach((button) => button.addEventListener("click", openDialog));
  ui.cancel.addEventListener("click", () => ui.dialog.close());
  ui.refresh.addEventListener("click", () => token ? loadSheet() : connectButton());
  ui.search.addEventListener("input", render);
  ui.save.addEventListener("click", () => {
    const client = ui.client.value.trim();
    const sheet = ui.sheet.value.trim();
    if (!client.endsWith(".apps.googleusercontent.com")) {
      ui.setupError.textContent = "L’identifiant doit être un client OAuth Web qui se termine par .apps.googleusercontent.com.";
      ui.setupError.hidden = false; return;
    }
    if (!/^[a-zA-Z0-9_-]{20,}$/.test(sheet)) {
      ui.setupError.textContent = "Saisis l’identifiant du tableur, sans l’URL complète.";
      ui.setupError.hidden = false; return;
    }
    connect(client, sheet).then(() => {}).catch((e) => {
      ui.setupError.textContent = (e && e.message) || "Connexion impossible.";
      ui.setupError.hidden = false;
    });
  });
  ui.dialog.addEventListener("click", (event) => { if (event.target === ui.dialog) ui.dialog.close(); });
  render();
  if (config().client && config().sheet) {
    ui.empty.querySelector("h3").textContent = "Connexion requise";
    ui.empty.querySelector("p").textContent = "Tes identifiants sont conservés sur cet appareil. Connecte Google pour lire le Sheet.";
  } else {
    ui.total.textContent = "—"; ui.submitted.textContent = "—"; ui.average.textContent = "—";
  }
})();
