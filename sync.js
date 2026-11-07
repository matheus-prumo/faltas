/* Sincronização das Faltas (celular) — mesma regra do PDV: compara base × aqui × arquivo no OneDrive. */
(function (root) {
  "use strict";
  var Sync = {};
  var CLIENT_ID = "2ae64023-cc48-4259-a019-2161dc5bff30";
  var ESCOPO = "openid profile offline_access Files.ReadWrite.AppFolder";
  var CFG = {
    auth: "https://login.microsoftonline.com/common/oauth2/v2.0",
    graph: "https://graph.microsoft.com/v1.0",
    arquivo: "faltas.json",
    tombaDias: 90
  };
  Sync.cfg = CFG;

  Sync.sk = function () { return JSON.stringify(Array.prototype.slice.call(arguments)); };

  function canon(v) {
    if (v === null || v === undefined) return "null";
    if (Array.isArray(v)) return "[" + v.map(canon).join(",") + "]";
    if (typeof v === "object") return "{" + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ":" + canon(v[k]); }).join(",") + "}";
    return JSON.stringify(v);
  }
  Sync.igual = function (a, b) { return canon(a) === canon(b); };

  /* Mescla pura. base/local = {chave: valor}; doc = {v:1, items:{chave:{v,t,x}}}.
     Devolve {doc, aplicar, novaBase, mudou, enviados}; aplicar[chave] = valor ou null (apagar). */
  Sync.mesclar = function (base, local, doc, agora) {
    var items = {}, k;
    var di = (doc && doc.items) || {};
    for (k in di) items[k] = { v: di[k].v, t: di[k].t, x: di[k].x };
    var aplicar = {}, novaBase = {}, mudou = false, enviados = 0, seq = 0;
    var corte = agora - CFG.tombaDias * 86400000;
    var ordem = Object.keys(local);
    Object.keys(base).forEach(function (x) { if (!(x in local)) ordem.push(x); });
    Object.keys(items).forEach(function (x) { if (!(x in local) && !(x in base)) ordem.push(x); });
    ordem.forEach(function (k) {
      var b = (k in base) ? base[k] : null;
      var l = (k in local) ? local[k] : null;
      var it = items[k];
      var r = (!it || it.x) ? null : it.v;
      var lc = !Sync.igual(l, b), rc = !Sync.igual(r, b), final;
      if (lc && !rc) {
        seq += 1;
        items[k] = { v: l, t: agora + seq, x: l === null ? 1 : 0 };
        mudou = true; enviados += 1; final = l;
      } else if (rc && !lc) {
        aplicar[k] = r; final = r;
      } else if (lc && rc) {
        if (!Sync.igual(l, r)) aplicar[k] = r;
        final = r;
      } else {
        final = b;
      }
      if (final !== null && final !== undefined) novaBase[k] = final;
    });
    Object.keys(items).forEach(function (k) {
      if (items[k].x && (items[k].t || 0) < corte) { delete items[k]; mudou = true; }
    });
    return { doc: { v: 1, items: items }, aplicar: aplicar, novaBase: novaBase, mudou: mudou, enviados: enviados };
  };

  /* ---------- login (OAuth 2.0 com PKCE, sem biblioteca) ---------- */
  function b64url(buf) {
    var s = "", b = new Uint8Array(buf);
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function aleatorio(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); }
  async function sha256(txt) { return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt))); }
  function ls(k, v) {
    try {
      if (v === undefined) { var x = localStorage.getItem(k); return x ? JSON.parse(x) : null; }
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v));
    } catch (e) { return null; }
  }
  Sync.redirectUri = function () { return location.origin + location.pathname.replace(/index\.html$/, ""); };
  function decodeJwt(t) { try { return JSON.parse(decodeURIComponent(escape(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))))); } catch (e) { return {}; } }

  var A = Sync.auth = {};
  A.dados = function () { return ls("faltas_auth"); };
  A.conectado = function () { var d = A.dados(); return !!(d && d.refresh); };
  A.email = function () { var d = A.dados(); return d && d.email || ""; };
  A.sair = function () { ls("faltas_auth", null); };

  /* silencioso = true: tenta voltar sem tela (prompt=none) usando a sessão da Microsoft já aberta no navegador */
  A.entrar = async function (silencioso) {
    var ver = aleatorio(48), est = aleatorio(16);
    ls("faltas_pkce", { ver: ver, est: est, t: Date.now(), silencioso: !!silencioso });
    var p = new URLSearchParams({
      client_id: CLIENT_ID, response_type: "code", redirect_uri: Sync.redirectUri(), response_mode: "query",
      scope: ESCOPO, state: est, code_challenge: await sha256(ver), code_challenge_method: "S256"
    });
    var d = A.dados();
    if (silencioso) { p.set("prompt", "none"); if (d && d.email) p.set("login_hint", d.email); }
    else p.set("prompt", "select_account");
    location.assign(CFG.auth + "/authorize?" + p.toString());
  };

  async function pedirToken(campos) {
    var r = await fetch(CFG.auth + "/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(campos).toString() });
    var j = {};
    try { j = await r.json(); } catch (e) { }
    return { ok: r.ok, j: j };
  }
  function guardar(j, antigo) {
    var idt = j.id_token ? decodeJwt(j.id_token) : {};
    var d = {
      access: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 - 60000,
      refresh: j.refresh_token || (antigo && antigo.refresh) || "",
      email: idt.preferred_username || idt.email || (antigo && antigo.email) || ""
    };
    ls("faltas_auth", d);
    return d;
  }

  /* Chamar ao abrir o app: se a Microsoft devolveu um código na URL, troca por token. Devolve {estado:'ok'|'erro'|'nada', msg} */
  A.tratarRetorno = async function () {
    var q = new URLSearchParams(location.search);
    if (!q.has("code") && !q.has("error")) return { estado: "nada" };
    var pk = ls("faltas_pkce");
    history.replaceState(null, "", Sync.redirectUri());
    ls("faltas_pkce", null);
    if (q.has("error")) {
      var sil = pk && pk.silencioso;
      return { estado: sil ? "precisa_entrar" : "erro", msg: (q.get("error_description") || q.get("error") || "").split("\n")[0] };
    }
    if (!pk || pk.est !== q.get("state")) return { estado: "erro", msg: "A resposta da Microsoft não confere (state). Tente entrar de novo." };
    var t = await pedirToken({ client_id: CLIENT_ID, grant_type: "authorization_code", code: q.get("code"), redirect_uri: Sync.redirectUri(), code_verifier: pk.ver, scope: ESCOPO });
    if (!t.ok || !t.j.access_token) return { estado: "erro", msg: (t.j.error_description || t.j.error || "Falha ao trocar o código por acesso.").split("\n")[0] };
    guardar(t.j, null);
    return { estado: "ok" };
  };

  /* Token válido (renova com o refresh token). Lança Error com .codigo = 'precisa_entrar' | 'offline' */
  A.token = async function () {
    var d = A.dados();
    if (!d || !d.refresh) { var e0 = new Error("Não conectado"); e0.codigo = "precisa_entrar"; throw e0; }
    if (d.access && Date.now() < d.exp) return d.access;
    var t;
    try {
      t = await pedirToken({ client_id: CLIENT_ID, grant_type: "refresh_token", refresh_token: d.refresh, scope: ESCOPO });
    } catch (e) { var e1 = new Error("Sem internet"); e1.codigo = "offline"; throw e1; }
    if (!t.ok || !t.j.access_token) {
      var e2 = new Error(t.j.error_description || t.j.error || "Login expirado"); e2.codigo = "precisa_entrar";
      throw e2;
    }
    return guardar(t.j, d).access;
  };

  /* ---------- OneDrive (pasta do app) ---------- */
  function urlArq() { return CFG.graph + "/me/drive/special/approot:/" + CFG.arquivo; }
  async function baixar(tok) {
    var r = await fetch(urlArq(), { headers: { Authorization: "Bearer " + tok } });
    if (r.status === 404) return { doc: { v: 1, items: {} }, etag: null };
    if (!r.ok) throw new Error("OneDrive recusou a leitura (" + r.status + ").");
    var meta = await r.json(), txt;
    try {
      var r2 = await fetch(meta["@microsoft.graph.downloadUrl"]);
      if (!r2.ok) throw new Error("x");
      txt = await r2.text();
    } catch (e) {
      var r3 = await fetch(urlArq() + ":/content", { headers: { Authorization: "Bearer " + tok } });
      if (!r3.ok) throw new Error("Não consegui baixar o arquivo do OneDrive (" + r3.status + ").");
      txt = await r3.text();
    }
    var doc;
    try { doc = JSON.parse(txt || "{}"); } catch (e) { throw new Error("O arquivo de faltas no OneDrive está com defeito."); }
    if (!doc.items || typeof doc.items !== "object") doc = { v: 1, items: {} };
    return { doc: doc, etag: meta.eTag || null };
  }
  async function enviar(tok, doc, etag) {
    var h = { Authorization: "Bearer " + tok, "Content-Type": "application/json" }, url = urlArq() + ":/content";
    if (etag) h["If-Match"] = etag; else url += "?@microsoft.graph.conflictBehavior=fail";
    var corpo = JSON.stringify(doc), r;
    try { r = await fetch(url, { method: "PUT", headers: h, body: corpo }); }
    catch (e) {
      if (!etag || !navigator.onLine) throw e;
      delete h["If-Match"];
      r = await fetch(url, { method: "PUT", headers: h, body: corpo });
    }
    if (r.status === 409 || r.status === 412) { var c = new Error("conflito"); c.conflito = true; throw c; }
    if (!r.ok) throw new Error("OneDrive recusou a gravação (" + r.status + ").");
  }

  /* estado = {items, base, ord}; muda o estado e devolve {enviados, recebidos} */
  Sync.executar = async function (estado) {
    var tok = await A.token();
    for (var i = 0; i < 4; i++) {
      var b = await baixar(tok);
      var agora = Date.now();
      var m = Sync.mesclar(estado.base || {}, estado.items, b.doc, agora);
      if (m.mudou) {
        try { await enviar(tok, m.doc, b.etag); }
        catch (e) { if (e.conflito) continue; throw e; }
      }
      var recebidos = 0;
      Object.keys(m.aplicar).forEach(function (k) {
        var v = m.aplicar[k];
        if (v === null) delete estado.items[k]; else estado.items[k] = v;
        if (JSON.parse(k)[0] !== "cfg") recebidos++;
      });
      estado.ord = estado.ord || {};
      Object.keys(m.doc.items).forEach(function (k) {
        var it = m.doc.items[k];
        if (!it.x) estado.ord[k] = it.t;
      });
      Object.keys(estado.ord).forEach(function (k) { if (!(k in estado.items)) delete estado.ord[k]; });
      estado.base = m.novaBase;
      return { enviados: m.enviados, recebidos: recebidos };
    }
    throw new Error("Outro aparelho estava gravando ao mesmo tempo. Tente de novo em instantes.");
  };

  if (typeof module !== "undefined" && module.exports) module.exports = Sync; else root.Sync = Sync;
})(typeof window !== "undefined" ? window : globalThis);
