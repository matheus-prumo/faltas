(function () {
  "use strict";
  var SK = Sync.sk;
  var $ = function (s, e) { return (e || document).querySelector(s); };
  function ico(n, cls) { return '<svg class="i' + (cls ? " " + cls : "") + '" aria-hidden="true"><use href="#i-' + n + '"/></svg>'; }
  function vibra(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 8); } catch (e) { } }
  var folhaAberta = false, ignoraPop = false;
  var VERSAO = "1.2";
  var CORES_PADRAO = ["Preta", "Rosa", "Roxa", "Azul", "Vermelha"];

  /* ---------------- estado (fica no celular; funciona sem internet) ---------------- */
  var S = carregar();
  function carregar() {
    var v = null;
    try { v = JSON.parse(localStorage.getItem("faltas_estado_v1") || "null"); } catch (e) { }
    v = v || {};
    return { items: v.items || {}, base: v.base || {}, ord: v.ord || {}, ultima: v.ultima || "", aba: v.aba || "capas", tipoSel: v.tipoSel || {}, forn: v.forn || {}, hist: v.hist || [] };
  }
  function salvar() { try { localStorage.setItem("faltas_estado_v1", JSON.stringify(S)); } catch (e) { } }
  var seqLocal = 0;
  function marcarNovo(k) { if (!(k in S.ord)) S.ord[k] = Date.now() * 1000 + (seqLocal++ % 1000); }

  /* ---------------- utilidades ---------------- */
  function esc(t) { return String(t == null ? "" : t).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function limpa(t) { return String(t || "").split(/\s+/).filter(Boolean).join(" "); }
  function chave(t) { return limpa(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(); }
  function corFmt(t) { t = limpa(t); return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : ""; }
  function uid() { var a = new Uint8Array(6); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (x) { return ("0" + x.toString(16)).slice(-2); }).join(""); }
  function toast(msg) { var t = $("#toast"); t.classList.remove("acao"); t.textContent = msg; t.classList.add("on"); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove("on"); }, 2600); }
  function pecas(n) { return n + (n === 1 ? " peça" : " peças"); }

  /* ---------------- leitura dos dados ---------------- */
  function porOrdem(a, b) { return (S.ord[a.k] || 0) - (S.ord[b.k] || 0) || (a.k < b.k ? -1 : 1); }
  function indice() {
    var I = { tipos: {}, cores: {}, mods: {}, qtd: {}, cats: [], forns: [], faltas: [], loja: "" };
    Object.keys(S.items).forEach(function (k) {
      var p = JSON.parse(k), v = S.items[k], x = { k: k, p: p, v: v };
      switch (p[0]) {
        case "tipo": I.tipos[p[1]] = { k: k, nome: p[1], f: v.f, u: v.u, o: v.o }; break;
        case "cor": (I.cores[p[1]] = I.cores[p[1]] || []).push({ k: k, nome: p[2] }); break;
        case "mod": (I.mods[p[1]] = I.mods[p[1]] || []).push({ k: k, nome: p[2] }); break;
        case "qtd": (I.qtd[p[1]] = I.qtd[p[1]] || {})[p[2] + "\u0001" + p[3]] = v; break;
        case "cat": I.cats.push({ k: k, nome: p[1] }); break;
        case "forn": I.forns.push({ k: k, nome: p[1], whatsapp: v }); break;
        case "falta": I.faltas.push({ k: k, uid: p[1], v: v }); break;
        case "cfg": if (p[1] === "loja_nome") I.loja = v; break;
      }
    });
    Object.keys(I.cores).forEach(function (t) { I.cores[t].sort(porOrdem); });
    Object.keys(I.mods).forEach(function (t) { I.mods[t].sort(porOrdem); });
    I.cats.sort(porOrdem); I.forns.sort(function (a, b) { return a.nome.localeCompare(b.nome); }); I.faltas.sort(porOrdem);
    return I;
  }
  function tiposDe(I, fam) {
    return Object.keys(I.tipos).map(function (n) { return I.tipos[n]; }).filter(function (t) { return t.f === fam; })
      .sort(function (a, b) { return (a.o - b.o) || (S.ord[a.k] || 0) - (S.ord[b.k] || 0) || a.nome.localeCompare(b.nome); });
  }
  function modelosDe(I, tipo) {
    var lista = (I.mods[tipo] || []).map(function (m) { return m.nome; }), vistos = {};
    lista.forEach(function (n) { vistos[n] = 1; });
    Object.keys(I.qtd[tipo] || {}).forEach(function (kk) { var m = kk.split("\u0001")[0]; if (!vistos[m]) { vistos[m] = 1; lista.push(m); } });
    return lista;
  }
  function q(I, tipo, modelo, cor) { return ((I.qtd[tipo] || {})[modelo + "\u0001" + (cor || "")]) || 0; }
  function totalTipo(I, tipo) { var s = 0, d = I.qtd[tipo] || {}; Object.keys(d).forEach(function (k) { s += d[k]; }); return s; }
  function totalFam(I, fam) { return tiposDe(I, fam).reduce(function (s, t) { return s + totalTipo(I, t.nome); }, 0); }
  function coresDoModelo(I, t, modelo) {
    var nomes = (I.cores[t.nome] || []).map(function (c) { return c.nome; });
    Object.keys(I.qtd[t.nome] || {}).forEach(function (kk) { var a = kk.split("\u0001"); if (a[0] === modelo && a[1] && nomes.indexOf(a[1]) < 0) nomes.push(a[1]); });
    return nomes;
  }

  /* ---------------- alterações ---------------- */
  var tSync = null;
  function mudou() { salvar(); render(); clearTimeout(tSync); tSync = setTimeout(function () { sincronizar(false); }, 2500); }
  function definir(k, v) { if (v === null || v === undefined) { delete S.items[k]; delete S.ord[k]; } else { S.items[k] = v; marcarNovo(k); } }
  function setQtd(tipo, modelo, cor, n) {
    n = Math.max(0, Math.min(9999, parseInt(n, 10) || 0));
    var I = indice();
    if (n > 0 && !(I.mods[tipo] || []).some(function (m) { return m.nome === modelo; })) definir(SK("mod", tipo, modelo), 1);
    definir(SK("qtd", tipo, modelo, cor || ""), n > 0 ? n : null);
    mudou();
  }
  function acharModelo(I, nome) {
    var c = chave(nome), ach = null;
    Object.keys(I.mods).forEach(function (t) { I.mods[t].forEach(function (m) { if (!ach && chave(m.nome) === c) ach = m.nome; }); });
    return ach || limpa(nome);
  }
  function addModelo(tipo, nome) {
    nome = limpa(nome); if (!nome) return false;
    var I = indice(), nm = acharModelo(I, nome);
    if ((I.mods[tipo] || []).some(function (m) { return chave(m.nome) === chave(nm); })) { toast("Esse modelo já está na lista."); return false; }
    definir(SK("mod", tipo, nm), 1); mudou(); toast(nm + " adicionado"); return nm;
  }
  function addCor(tipo, nome) {
    nome = corFmt(nome); if (!nome) return false;
    var I = indice();
    if ((I.cores[tipo] || []).some(function (c) { return chave(c.nome) === chave(nome); })) { toast("Essa cor já existe."); return false; }
    definir(SK("cor", tipo, nome), 1); mudou(); return true;
  }
  function addTipo(nome, fam, usaCor) {
    nome = limpa(nome); if (!nome) return false;
    var I = indice();
    if (Object.keys(I.tipos).some(function (n) { return chave(n) === chave(nome); })) { toast("Já existe um tipo com esse nome."); return false; }
    var o = Object.keys(I.tipos).reduce(function (m, n) { return Math.max(m, I.tipos[n].o || 0); }, 0) + 1;
    definir(SK("tipo", nome), { f: fam, u: usaCor ? 1 : 0, o: o });
    if (usaCor) CORES_PADRAO.forEach(function (c) { definir(SK("cor", nome, c), 1); });
    S.tipoSel[fam] = nome; mudou(); return true;
  }
  function ativarCores(tipo) {
    var I = indice(), t = I.tipos[tipo]; if (!t) return;
    definir(t.k, { f: t.f, u: 1, o: t.o });
    CORES_PADRAO.forEach(function (c) { definir(SK("cor", tipo, c), 1); });
    mudou();
  }
  function excluirTipo(tipo) {
    Object.keys(S.items).forEach(function (k) { var p = JSON.parse(k); if (["tipo", "cor", "mod", "qtd"].indexOf(p[0]) >= 0 && p[1] === tipo) definir(k, null); });
    mudou();
  }
  function removerModelo(tipo, modelo) {
    Object.keys(S.items).forEach(function (k) { var p = JSON.parse(k); if ((p[0] === "mod" || p[0] === "qtd") && p[1] === tipo && p[2] === modelo) definir(k, null); });
    mudou();
  }
  function zerarFamilia(fam) {
    var nomes = tiposDe(indice(), fam).map(function (t) { return t.nome; });
    Object.keys(S.items).forEach(function (k) { var p = JSON.parse(k); if (p[0] === "qtd" && nomes.indexOf(p[1]) >= 0) definir(k, null); });
    mudou();
  }
  function setFalta(uidk, mod) {
    var k = SK("falta", uidk), v = S.items[k]; if (!v) return;
    var n = Object.assign({}, v, mod);
    if (n.q < 1) { definir(k, null); } else { n.q = Math.min(9999, n.q); definir(k, n); }
    mudou();
  }
  function addFalta(cat, item, modelo, qtd, fornecedor) {
    cat = limpa(cat); item = limpa(item); modelo = limpa(modelo);
    if (!cat) { toast("Escolha a categoria."); return false; }
    if (!item && !modelo) { toast("Digite o item ou o modelo."); return false; }
    qtd = Math.max(1, Math.min(9999, parseInt(qtd, 10) || 1));
    var I = indice();
    var cx = I.cats.filter(function (c) { return chave(c.nome) === chave(cat); })[0];
    if (cx) cat = cx.nome; else definir(SK("cat", cat), 1);
    var igual = I.faltas.filter(function (f) { return chave(f.v.c) === chave(cat) && chave(f.v.i) === chave(item) && chave(f.v.m) === chave(modelo); })[0];
    if (igual) { definir(igual.k, Object.assign({}, igual.v, { q: Math.min(9999, igual.v.q + qtd) })); }
    else {
      var d = new Date(), p2 = function (n) { return ("0" + n).slice(-2); };
      definir(SK("falta", uid()), { c: cat, i: item, m: modelo, q: qtd, o: "", f: fornecedor || "", d: d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()) + " " + p2(d.getHours()) + ":" + p2(d.getMinutes()) + ":" + p2(d.getSeconds()) });
    }
    mudou(); return true;
  }

  /* ---------------- texto do pedido (igual ao do PDV) ---------------- */
  function telWhats(t) {
    var d = String(t || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.indexOf("55") === 0 && d.length >= 12) return d;
    return (d.length === 10 || d.length === 11) ? "55" + d : d;
  }
  function secoesGrade(I, fam) {
    var out = [];
    tiposDe(I, fam).forEach(function (t) {
      var linhas = [];
      modelosDe(I, t.nome).forEach(function (m) {
        var cores = [], total;
        if (t.u) { coresDoModelo(I, t, m).forEach(function (c) { var n = q(I, t.nome, m, c); if (n) cores.push([c, n]); }); total = cores.reduce(function (s, c) { return s + c[1]; }, 0); var sem = q(I, t.nome, m, ""); if (sem) total += sem; }
        else total = q(I, t.nome, m, "");
        if (total > 0) linhas.push({ nome: m, qtd: total, cores: cores, detalhe: "", obs: "" });
      });
      if (linhas.length) out.push({ titulo: (fam === "capas" ? "CAPA " : "PELÍCULA ") + t.nome.toUpperCase(), linhas: linhas, total: linhas.reduce(function (s, l) { return s + l.qtd; }, 0) });
    });
    return out;
  }
  function secoesOutros(I) {
    var mapa = {}, ordem = [];
    I.faltas.forEach(function (f) {
      var v = f.v, nome = v.i || v.m, det = v.i ? v.m : "", tit = String(v.c).toUpperCase();
      if (!mapa[tit]) { mapa[tit] = { titulo: tit, linhas: {}, ord: [], total: 0 }; ordem.push(tit); }
      var s = mapa[tit], lk = nome + "\u0001" + det;
      if (!s.linhas[lk]) { s.linhas[lk] = { nome: nome, detalhe: det, qtd: 0, cores: [], obs: "" }; s.ord.push(lk); }
      s.linhas[lk].qtd += v.q; s.total += v.q;
      if (v.o && s.linhas[lk].obs.indexOf(v.o) < 0) s.linhas[lk].obs = s.linhas[lk].obs ? s.linhas[lk].obs + "; " + v.o : v.o;
    });
    return ordem.map(function (t) { var s = mapa[t]; return { titulo: t, linhas: s.ord.map(function (k) { return s.linhas[k]; }), total: s.total }; });
  }
  function textoPedido(secoes, fornNome, loja) {
    var L = ["Olá" + (fornNome ? ", " + fornNome.split(" ")[0] : "") + "! Segue meu pedido:", ""], total = 0;
    secoes.forEach(function (s) {
      L.push("*" + s.titulo + "*"); total += s.total;
      s.linhas.forEach(function (l) {
        L.push(l.nome + ((l.detalhe && !l.cores.length) ? " — " + l.detalhe : "") + " — " + l.qtd + " un");
        l.cores.forEach(function (c) { L.push("   • " + c[1] + " " + c[0].toLowerCase()); });
        if (l.obs) L.push("   (" + l.obs + ")");
      });
      L.push("");
    });
    L.push("*TOTAL: " + total + " peça" + (total === 1 ? "" : "s") + "*", "", "Pode me passar o valor e o prazo? Obrigado.", "— " + (loja || "Loja"));
    return L.join("\n");
  }

  /* ---------------- telas ---------------- */
  var filtro = "";
  function render() {
    var I = indice(), aba = S.aba;
    $("#loja").textContent = I.loja || "Império das Capas";
    document.querySelectorAll("#tabs button").forEach(function (b) { b.classList.toggle("sel", b.dataset.aba === aba); });
    var v = $("#view");
    if (aba === "outros") v.innerHTML = viewOutros(I); else v.innerHTML = viewGrade(I, aba);
    var n = aba === "outros" ? I.faltas.reduce(function (s, f) { return s + f.v.q; }, 0) : totalFam(I, aba);
    var barra = $("#barra");
    barra.hidden = n === 0;
    document.body.classList.toggle("com-barra", n > 0);
    barra.innerHTML = n > 0 ? '<button data-act="pedido">' + ico("pedido") + ' Ver pedido · ' + pecas(n) + '</button>' : "";
    avisoRender();
  }
  function viewGrade(I, fam) {
    var ts = tiposDe(I, fam), sel = S.tipoSel[fam];
    if (!ts.some(function (t) { return t.nome === sel; })) sel = ts.length ? ts[0].nome : null;
    S.tipoSel[fam] = sel;
    var h = '<div class="tipos">';
    ts.forEach(function (t) { var n = totalTipo(I, t.nome); h += '<button class="tp' + (t.nome === sel ? " sel" : "") + '" data-act="tipo" data-t="' + esc(t.nome) + '">' + esc(t.nome) + (n ? ' <span class="n">' + n + "</span>" : "") + "</button>"; });
    h += '<button class="tp mais" data-act="novo-tipo">＋ Tipo</button></div>';
    if (!sel) return h + vazio("capas", "Vamos começar!", "Primeiro crie um tipo (por exemplo, “Silicone”). Depois adicione os modelos de celular.", '<button class="btn pri" data-act="novo-tipo">＋ Criar tipo</button>');
    var t = I.tipos[sel];
    h += '<div class="ferr"><input id="busca" class="busca" type="search" placeholder="Buscar modelo…" value="' + esc(filtro) + '" autocomplete="off"><button class="btn pri" data-act="novo-modelo">＋ Modelo</button></div>';
    var modelos = modelosDe(I, sel), f = chave(filtro);
    var lista = modelos.filter(function (m) { return !f || chave(m).indexOf(f) >= 0; });
    if (!modelos.length) h += vazio("capas", "Sem modelos neste tipo", "Toque em ＋ Modelo e digite, por exemplo, RM 12. Os modelos ficam salvos; depois é só mudar as quantidades.", '<button class="btn pri" data-act="novo-modelo">＋ Adicionar modelo</button>');
    else if (!lista.length) h += vazio("busca", "Nada encontrado", "Nenhum modelo com “" + esc(filtro) + "”.");
    else h += dica("mais", "Toque em <b>+</b> e <b>−</b> para anotar. <b>Segure o +</b> para subir rápido.");
    lista.forEach(function (m) {
      var total, corpo = "";
      if (t.u) {
        var cs = coresDoModelo(I, t, m); total = 0;
        corpo = '<div class="cores">';
        cs.forEach(function (c) { var n = q(I, sel, m, c); total += n; corpo += cel(c, sel, m, c, n); });
        var sem = q(I, sel, m, ""); if (sem) { total += sem; corpo += cel("Sem cor", sel, m, "", sem); }
        corpo += "</div>";
        if (!cs.length) corpo = '<div class="info">Este tipo ainda não tem cores. Toque em “＋ Cor” abaixo.</div>';
      } else {
        total = q(I, sel, m, "");
        corpo = '<div class="unico">' + stepper(sel, m, "", total) + "</div>";
      }
      h += '<div class="card' + (total ? " tem" : "") + '"><div class="mh"><b>' + esc(m) + '</b><span class="tot">' + total + '</span><button class="mm" data-act="mod-menu" data-t="' + esc(sel) + '" data-m="' + esc(m) + '" aria-label="Opções do modelo">⋯</button></div>' + corpo + "</div>";
    });
    h += '<div class="rodape-tipo">' + (t.u ? '<button class="btn" data-act="nova-cor">＋ Cor</button>' : '<button class="btn" data-act="ativar-cores">🎨 Ativar cores neste tipo</button>') + '<button class="btn ghost" data-act="tipo-menu">Opções do tipo</button></div>';
    return h;
  }
  function stepper(tipo, modelo, cor, n) {
    return '<div class="st"><button data-act="menos" data-t="' + esc(tipo) + '" data-m="' + esc(modelo) + '" data-c="' + esc(cor) + '" aria-label="Menos">−</button><input type="number" inputmode="numeric" min="0" max="9999" value="' + n + '" data-act-in="qtd" data-t="' + esc(tipo) + '" data-m="' + esc(modelo) + '" data-c="' + esc(cor) + '" aria-label="Quantidade"><button data-act="mais" data-t="' + esc(tipo) + '" data-m="' + esc(modelo) + '" data-c="' + esc(cor) + '" aria-label="Mais">+</button></div>';
  }
  function cel(nome, tipo, modelo, cor, n) { return '<div class="cel' + (n ? " tem" : "") + '"><span class="cn">' + esc(nome) + "</span>" + stepper(tipo, modelo, cor, n) + "</div>"; }

  function viewOutros(I) {
    var h = '<div class="ferr"><button class="btn pri full" data-act="nova-falta">＋ Anotar falta</button></div>';
    if (!I.faltas.length) return h + vazio("outros", "Nada faltando por aqui", "Capas e películas ficam nas outras abas. Aqui entram cabos, carregadores, fones e o resto. Toque em ＋ Anotar falta.");
    var grupos = {}, ordem = [];
    I.faltas.forEach(function (f) { var c = f.v.c; if (!grupos[c]) { grupos[c] = []; ordem.push(c); } grupos[c].push(f); });
    ordem.forEach(function (c) {
      h += '<div class="cat">' + esc(c) + "</div>";
      grupos[c].forEach(function (f) {
        var v = f.v, nome = v.i || v.m, sub = [v.i ? v.m : "", v.f ? "→ " + v.f : "", v.o].filter(Boolean).join(" · ");
        h += '<div class="card"><div class="fl"><div class="tx"><b>' + esc(nome) + "</b>" + (sub ? "<small>" + esc(sub) + "</small>" : "") + '</div><div class="st"><button data-act="f-menos" data-u="' + f.uid + '">−</button><input type="number" inputmode="numeric" min="0" value="' + v.q + '" data-act-in="f-qtd" data-u="' + f.uid + '"><button data-act="f-mais" data-u="' + f.uid + '">+</button></div><button class="x" data-act="f-del" data-u="' + f.uid + '" aria-label="Apagar">✕</button></div></div>';
      });
    });
    return h;
  }

  /* ---------------- folhas (janelas de baixo) ---------------- */
  function folha(html, aoAbrir) {
    var r = $("#sheet-root");
    r.innerHTML = '<div class="fundo" data-act="fecha-fundo"><div class="folha" role="dialog"><div class="puxador"></div>' + html + "</div></div>";
    if (!folhaAberta) { folhaAberta = true; try { history.pushState({ folha: 1 }, ""); } catch (e) { } }
    var f = r.querySelector(".folha"); if (aoAbrir) aoAbrir(f);
    var a = f.querySelector("[autofocus]"); if (a) setTimeout(function () { a.focus(); }, 60);
    return f;
  }
  function fechar() { $("#sheet-root").innerHTML = ""; if (folhaAberta) { folhaAberta = false; ignoraPop = true; try { history.back(); } catch (e) { ignoraPop = false; } } }

  function folhaNovoModelo() {
    var I = indice(), sel = S.tipoSel[S.aba], todos = {};
    Object.keys(I.mods).forEach(function (t) { I.mods[t].forEach(function (m) { todos[m.nome] = 1; }); });
    var f = folha('<h2>Novo modelo</h2><div class="info">Tipo: <b>' + esc(sel) + '</b></div><label>Modelo do celular</label><input id="in-m" type="text" list="dl-m" placeholder="Ex.: RM 12" autocomplete="off" autocapitalize="characters" autofocus><datalist id="dl-m">' + Object.keys(todos).map(function (m) { return '<option value="' + esc(m) + '">'; }).join("") + '</datalist><div class="linha"><button class="btn" data-act="fecha">Cancelar</button><button class="btn pri" data-act="ok-modelo">Adicionar</button></div><div class="info">Dica: pode adicionar vários seguidos. Toque em “Adicionar” e digite o próximo.</div>');
    f.querySelector("#in-m").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); f.querySelector('[data-act="ok-modelo"]').click(); } });
  }
  function folhaNovaCor() {
    var f = folha('<h2>Nova cor</h2><div class="info">Tipo: <b>' + esc(S.tipoSel[S.aba]) + '</b></div><label>Nome da cor</label><input id="in-c" type="text" placeholder="Ex.: Verde água" autocomplete="off" autofocus><div class="linha"><button class="btn" data-act="fecha">Cancelar</button><button class="btn pri" data-act="ok-cor">Adicionar</button></div>');
    f.querySelector("#in-c").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); f.querySelector('[data-act="ok-cor"]').click(); } });
  }
  function folhaNovoTipo() {
    folha('<h2>Novo tipo de ' + (S.aba === "capas" ? "capa" : "película") + '</h2><label>Nome</label><input id="in-t" type="text" placeholder="Ex.: Anti-impacto" autocomplete="off" autofocus><label class="chk"><input id="in-u" type="checkbox"' + (S.aba === "capas" ? " checked" : "") + '> Este tipo tem cores</label><div class="linha"><button class="btn" data-act="fecha">Cancelar</button><button class="btn pri" data-act="ok-tipo">Criar</button></div>');
  }
  function folhaNovaFalta() {
    var I = indice();
    var cats = I.cats.map(function (c) { return c.nome; }).filter(function (c) { return !/^(capas|pel[ií]culas)$/i.test(chave(c)); });
    var f = folha('<h2>Anotar falta</h2><label>Categoria</label><select id="f-cat">' + cats.map(function (c) { return "<option>" + esc(c) + "</option>"; }).join("") + '<option value="__nova">＋ Nova categoria…</option></select><input id="f-cat2" type="text" placeholder="Nome da nova categoria" style="display:none;margin-top:8px"><label>Item</label><input id="f-item" type="text" placeholder="Ex.: Cabo Lightning 1 m" autocomplete="off" autofocus><label>Modelo (opcional)</label><input id="f-mod" type="text" placeholder="Ex.: iPhone 13" autocomplete="off"><label>Quantidade</label><input id="f-qtd" type="number" inputmode="numeric" min="1" value="1"><label>Fornecedor (opcional)</label><select id="f-for"><option value="">—</option>' + I.forns.map(function (x) { return "<option>" + esc(x.nome) + "</option>"; }).join("") + '</select><div class="linha"><button class="btn" data-act="fecha">Cancelar</button><button class="btn pri" data-act="ok-falta">Anotar</button></div>');
    var sel = f.querySelector("#f-cat"), c2 = f.querySelector("#f-cat2");
    if (!cats.length) { sel.value = "__nova"; c2.style.display = "block"; }
    sel.addEventListener("change", function () { c2.style.display = sel.value === "__nova" ? "block" : "none"; if (sel.value === "__nova") c2.focus(); });
  }
  function fornOpcoes(I, sel) { return '<option value="">(sem fornecedor)</option>' + I.forns.map(function (x) { return '<option value="' + esc(x.nome) + '"' + (x.nome === sel ? " selected" : "") + ">" + esc(x.nome) + "</option>"; }).join(""); }
  var pedidoEstado = { forn: "" };
  function folhaPedido() {
    var I = indice(), aba = S.aba;
    var secoes = aba === "outros" ? secoesOutros(I) : secoesGrade(I, aba);
    if (!secoes.length) { toast("Nada com quantidade para pedir."); return; }
    var forn = S.forn[aba] || "";
    var f = folha('<h2>Pedido</h2><label>Fornecedor</label><select id="p-for">' + fornOpcoes(I, forn) + '</select><pre id="p-txt"></pre><div class="linha"><button class="btn wa" data-act="p-wa">' + ico("chat") + ' WhatsApp</button><button class="btn" data-act="p-copiar">' + ico("copiar") + ' Copiar texto</button></div><div class="linha"><button class="btn" data-act="p-img">' + ico("img") + ' Imagem</button><button class="btn" data-act="p-pdf">' + ico("pdf") + ' PDF</button></div><div class="linha"><button class="btn perigo" data-act="p-final">' + ico("ok") + ' Finalizar pedido (zerar)</button></div><div class="info" id="p-info">Depois de enviar, toque em “Finalizar pedido” para zerar e começar o próximo. Os modelos continuam salvos.</div>');
    function atualizar() {
      var fn = f.querySelector("#p-for").value; S.forn[aba] = fn; salvar();
      f.querySelector("#p-txt").textContent = textoPedido(secoes, fn, I.loja);
    }
    f.querySelector("#p-for").addEventListener("change", atualizar); atualizar();
  }
  function folhaMenu() {
    var d = Sync.auth.dados() || {}, n = pendentes();
    var f = folha("<h2>Menu</h2>" +
      '<div class="conta"><span class="av">' + esc((d.email || "?").charAt(0).toUpperCase()) + '</span><span class="tx"><b>' + esc(d.email || "Conta não conectada") + "</b><small>" + (S.ultima ? "Última sincronização: " + esc(S.ultima) : "Ainda não sincronizado") + (n ? " · " + n + " a enviar" : "") + "</small></span></div>" +
      '<div class="lista-acoes">' + linhaAcao("sync-agora", "gira", "Sincronizar agora") +
      '<button data-act="hist">' + ico("hist") + '<span class="tx">Pedidos anteriores</span>' + ico("seta-d", "seta") + "</button>" +
      '<button data-act="ajuda">' + ico("ajuda") + '<span class="tx">Ajuda</span>' + ico("seta-d", "seta") + "</button>" +
      '<span id="m-trava"></span>' +
      (Sync.auth.conectado() ? linhaAcao("sair", "sair", "Sair da conta") : linhaAcao("entrar", "conta", "Entrar na conta")) +
      '</div><div class="info">Versão ' + VERSAO + ". Tudo que você anota fica salvo neste celular, mesmo sem internet.</div>");
    travaSuportada().then(function (ok) {
      var m = f.querySelector("#m-trava"); if (!ok || !m || !f.isConnected) return;
      m.outerHTML = travaId() ? linhaAcao("trava-off", "trava", "Trava por digital <small>(ligada · toque para desligar)</small>") : linhaAcao("trava-on", "trava", "Travar com digital");
    });
  }

  /* ---------------- sincronização ---------------- */
  var sincronizando = false, pendente = false, estadoSync = { tipo: "novo", msg: "" };
  function chipSync(tipo, msg) {
    estadoSync = { tipo: tipo, msg: msg || "" };
    var b = $("#b-sync"), t = $("#t-sync");
    b.className = "chip " + (tipo === "ok" ? "ok" : tipo === "erro" ? "erro" : tipo === "gira" ? "gira" : "");
    b.querySelector(".ic").innerHTML = ico(tipo === "ok" ? "ok" : tipo === "gira" ? "gira" : tipo === "erro" ? "alerta" : tipo === "offline" ? "offline" : "nuvem");
    t.textContent = msg || "";
  }
  function avisoRender() {
    var a = $("#aviso");
    if (!Sync.auth.conectado()) {
      a.hidden = false;
      a.innerHTML = '<span>🔒 Entre na sua conta Microsoft para sincronizar com o PDV.</span><button class="btn pri" data-act="entrar">Entrar</button>';
    } else if (estadoSync.tipo === "precisa") {
      a.hidden = false;
      a.innerHTML = '<span>Sua sessão da Microsoft expirou.</span><button class="btn pri" data-act="entrar">Entrar de novo</button>';
    } else a.hidden = true;
  }
  async function sincronizar(manual) {
    if (!Sync.auth.conectado()) { chipSync("novo", "Entrar"); avisoRender(); if (manual) toast("Entre na conta para sincronizar."); return; }
    if (!navigator.onLine) { chipSync("offline", msgOffline()); if (manual) toast("Sem internet. Suas anotações estão salvas no celular."); return; }
    if (sincronizando) { pendente = true; return; }
    sincronizando = true; chipSync("gira", "Sincronizando…");
    try {
      var r = await Sync.executar(S);
      S.ultima = new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      salvar(); chipSync("ok", "Sincronizado " + S.ultima.slice(-5));
      if (r.recebidos || manual) { if (!document.activeElement || document.activeElement.tagName !== "INPUT") render(); }
      if (manual) toast(r.recebidos || r.enviados ? "Recebidos " + r.recebidos + " · enviados " + r.enviados : "Tudo igual ao PDV ✓");
    } catch (e) {
      if (e.codigo === "precisa_entrar") { chipSync("erro", "Entrar de novo"); estadoSync.tipo = "precisa"; avisoRender(); tentarSilencioso(); }
      else if (e.codigo === "offline" || e instanceof TypeError) chipSync("offline", msgOffline());
      else { chipSync("erro", "Erro ao sincronizar"); if (manual) toast(String(e.message || e)); console.warn(e); }
    } finally {
      sincronizando = false;
      if (pendente) { pendente = false; setTimeout(function () { sincronizar(false); }, 600); }
    }
  }
  function tentarSilencioso() {
    try {
      var ult = parseInt(sessionStorage.getItem("faltas_silencioso") || "0", 10);
      if (Date.now() - ult < 5 * 60 * 1000) return;
      sessionStorage.setItem("faltas_silencioso", String(Date.now()));
    } catch (e) { }
    Sync.auth.entrar(true);
  }

  /* ---------------- compartilhar pedido (imagem / PDF) ---------------- */
  function quebra(c, texto, larg) {
    var palavras = String(texto).split(" "), linhas = [], atual = "";
    palavras.forEach(function (p) {
      var t = atual ? atual + " " + p : p;
      if (c.measureText(t).width <= larg || !atual) atual = t; else { linhas.push(atual); atual = p; }
    });
    if (atual) linhas.push(atual);
    return linhas;
  }
  function desenharPedido(secoes, forn, loja) {
    var W = 1080, P = 56, FAM = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif', hoje = new Date().toLocaleDateString("pt-BR");
    var cv = document.createElement("canvas"); cv.width = W; cv.height = 10;
    var total = secoes.reduce(function (s, x) { return s + x.total; }, 0);
    function rodar(c, desenha) {
      var y = 0;
      if (desenha) { c.fillStyle = "#ffffff"; c.fillRect(0, 0, W, cv.height); c.fillStyle = "#111111"; c.fillRect(0, 0, W, 210); c.fillStyle = "#ffc400"; c.fillRect(0, 210, W, 10); }
      if (desenha) {
        c.fillStyle = "#ffc400"; c.textBaseline = "alphabetic"; c.textAlign = "left";
        c.font = "bold 54px " + FAM; c.fillText(loja || "Pedido", P, 88);
        c.font = "32px " + FAM; c.fillStyle = "rgba(255,255,255,.85)";
        c.fillText("Pedido de reposição · " + hoje, P, 140);
        if (forn) c.fillText("Para: " + forn, P, 184);
      }
      y = 220 + 50;
      secoes.forEach(function (s) {
        if (desenha) {
          c.fillStyle = "#161616"; c.font = "bold 40px " + FAM; c.textAlign = "left"; c.fillText(s.titulo, P, y);
          c.fillStyle = "#5d6f6a"; c.font = "30px " + FAM; c.textAlign = "right"; c.fillText(s.total + (s.total === 1 ? " peça" : " peças"), W - P, y);
          c.fillStyle = "#ffc400"; c.fillRect(P, y + 14, W - 2 * P, 6);
        }
        y += 56;
        s.linhas.forEach(function (l) {
          var nome = l.nome + ((l.detalhe && !l.cores.length) ? " — " + l.detalhe : "");
          c.font = "bold 36px " + FAM;
          var ls = quebra(c, nome, W - 2 * P - 190);
          if (desenha) {
            c.fillStyle = "#14201d"; c.textAlign = "left"; ls.forEach(function (t, i) { c.fillText(t, P, y + i * 46); });
            c.textAlign = "right"; c.fillText(l.qtd + " un", W - P, y);
          }
          y += ls.length * 46;
          l.cores.forEach(function (co) {
            if (desenha) { c.font = "31px " + FAM; c.fillStyle = "#5d6f6a"; c.textAlign = "left"; c.fillText("•  " + co[1] + " " + co[0].toLowerCase(), P + 34, y); }
            y += 40;
          });
          if (l.obs) { if (desenha) { c.font = "italic 29px " + FAM; c.fillStyle = "#5d6f6a"; c.textAlign = "left"; c.fillText("(" + l.obs + ")", P + 34, y); } y += 40; }
          if (desenha) { c.fillStyle = "#e4eae7"; c.fillRect(P, y - 22, W - 2 * P, 2); }
          y += 18;
        });
        y += 22;
      });
      if (desenha) {
        c.fillStyle = "#ffc400"; c.beginPath();
        if (c.roundRect) c.roundRect(P, y, W - 2 * P, 100, 22); else c.rect(P, y, W - 2 * P, 100);
        c.fill();
        c.fillStyle = "#111111"; c.font = "bold 46px " + FAM; c.textAlign = "center"; c.fillText("TOTAL: " + total + (total === 1 ? " peça" : " peças"), W / 2, y + 66);
      }
      y += 100 + 50;
      if (desenha) { c.fillStyle = "#93a8a1"; c.font = "26px " + FAM; c.textAlign = "center"; c.fillText("Gerado pelo app Faltas", W / 2, y); }
      return y + 40;
    }
    cv.height = rodar(cv.getContext("2d"), false);
    rodar(cv.getContext("2d"), true);
    return cv;
  }
  function blobDe(cv, tipo, qual) { return new Promise(function (ok) { cv.toBlob(ok, tipo, qual); }); }
  async function pdfDeCanvas(cv) {
    var jpg = new Uint8Array(await (await blobDe(cv, "image/jpeg", 0.92)).arrayBuffer());
    var enc = new TextEncoder(), partes = [], pos = 0, offs = [];
    function add(x) { var b = typeof x === "string" ? enc.encode(x) : x; partes.push(b); pos += b.length; }
    var pw = 595, ph = Math.round(595 * cv.height / cv.width), cont = "q " + pw + " 0 0 " + ph + " 0 0 cm /Im0 Do Q";
    add("%PDF-1.4\n");
    offs[1] = pos; add("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
    offs[2] = pos; add("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
    offs[3] = pos; add("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + pw + " " + ph + "] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>\nendobj\n");
    offs[4] = pos; add("4 0 obj\n<< /Length " + cont.length + " >>\nstream\n" + cont + "\nendstream\nendobj\n");
    offs[5] = pos; add("5 0 obj\n<< /Type /XObject /Subtype /Image /Width " + cv.width + " /Height " + cv.height + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + jpg.length + " >>\nstream\n");
    add(jpg); add("\nendstream\nendobj\n");
    var xr = pos; add("xref\n0 6\n0000000000 65535 f \n");
    for (var i = 1; i <= 5; i++) add(("0000000000" + offs[i]).slice(-10) + " 00000 n \n");
    add("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xr + "\n%%EOF\n");
    return new Blob(partes, { type: "application/pdf" });
  }
  async function entregar(blob, nome, titulo) {
    var f = new File([blob], nome, { type: blob.type });
    if (navigator.canShare && navigator.canShare({ files: [f] })) {
      try { await navigator.share({ files: [f], title: titulo }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    toast("Arquivo salvo em Downloads");
  }
  async function compartilharPedido(formato, dados) {
    var I = indice(), aba = S.aba, fn, sec, loja = I.loja;
    if (dados) { fn = dados.forn; sec = dados.secoes; loja = dados.loja || loja; }
    else { fn = $("#p-for").value; sec = aba === "outros" ? secoesOutros(I) : secoesGrade(I, aba); }
    try {
      var cv = desenharPedido(sec, fn, loja), nome = "pedido-" + new Date().toISOString().slice(0, 10);
      if (formato === "pdf") await entregar(await pdfDeCanvas(cv), nome + ".pdf", "Pedido");
      else await entregar(await blobDe(cv, "image/png"), nome + ".png", "Pedido");
    } catch (e) { console.warn(e); toast("Não consegui gerar o arquivo."); }
  }

  /* ---------------- trava por digital (WebAuthn) ---------------- */
  var CHAVE_TRAVA = "faltas_trava", ocultoEm = 0, tentando = false;
  function b64(buf) { var s = ""; new Uint8Array(buf).forEach(function (b) { s += String.fromCharCode(b); }); return btoa(s); }
  function deb64(t) { var s = atob(t), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function aleat(n) { var a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
  function travaId() { try { return localStorage.getItem(CHAVE_TRAVA) || ""; } catch (e) { return ""; } }
  function travaSuportada() {
    if (!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext)) return Promise.resolve(false);
    return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then(function (v) { return !!v; }, function () { return false; });
  }
  function verificarDigital() {
    return navigator.credentials.get({ publicKey: { challenge: aleat(32), allowCredentials: [{ type: "public-key", id: deb64(travaId()) }], userVerification: "required", timeout: 60000 } });
  }
  function mostrarTrava(msg) {
    var t = $("#trava"); if (!t) return;
    t.hidden = false; document.body.classList.add("travado");
    $("#trava-msg").textContent = msg || "";
  }
  function esconderTrava() { var t = $("#trava"); if (t) t.hidden = true; document.body.classList.remove("travado"); }
  async function destravar() {
    if (!travaId()) { esconderTrava(); return; }
    if (tentando) return; tentando = true;
    $("#trava-msg").textContent = "Use sua digital…";
    try { await verificarDigital(); esconderTrava(); sincronizar(false); tourSeNecessario(); }
    catch (e) { $("#trava-msg").textContent = "Não foi possível confirmar. Toque em “Desbloquear” para tentar de novo."; }
    finally { tentando = false; }
  }
  async function ativarTrava() {
    try {
      var c = await navigator.credentials.create({ publicKey: {
        rp: { name: "Faltas" }, user: { id: aleat(16), name: "faltas", displayName: "Faltas" }, challenge: aleat(32),
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" }, timeout: 60000 } });
      localStorage.setItem(CHAVE_TRAVA, b64(c.rawId)); fechar(); toast("Trava por digital ativada ✓");
    } catch (e) { toast("Não consegui ativar a trava."); }
  }
  async function desativarTrava() {
    try { await verificarDigital(); localStorage.removeItem(CHAVE_TRAVA); fechar(); toast("Trava desativada"); }
    catch (e) { toast("Não foi possível confirmar a digital."); }
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { ocultoEm = Date.now(); return; }
    if (travaId() && ocultoEm && Date.now() - ocultoEm > 60000) { mostrarTrava(""); destravar(); }
  });

  /* ================= v1.2: jeito de aplicativo, ajuda, edição, histórico ================= */
  function nomeAba(a) { return a === "capas" ? "Capas" : a === "peliculas" ? "Películas" : "Outros"; }
  function dataHora(d) { return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); }
  function pendentes() {
    var n = 0, a = S.items, b = S.base || {};
    Object.keys(a).forEach(function (k) { if (!Sync.igual(a[k], (k in b) ? b[k] : null)) n++; });
    Object.keys(b).forEach(function (k) { if (!(k in a)) n++; });
    return n;
  }
  function msgOffline() { var n = pendentes(); return n ? "Sem internet · " + n + " a enviar" : "Sem internet"; }
  function animaView() { var v = $("#view"); v.classList.remove("anim"); void v.offsetWidth; v.classList.add("anim"); }

  /* dicas que o usuário fecha uma vez */
  function dicaVista(id) { try { return !!(JSON.parse(localStorage.getItem("faltas_dicas") || "{}"))[id]; } catch (e) { return false; } }
  function dicaMarcar(id) { try { var o = JSON.parse(localStorage.getItem("faltas_dicas") || "{}"); o[id] = 1; localStorage.setItem("faltas_dicas", JSON.stringify(o)); } catch (e) { } }
  function dica(id, texto) { return dicaVista(id) ? "" : '<div class="dica">' + ico("lampada") + "<span>" + texto + '</span><button data-act="dica-x" data-id="' + id + '" aria-label="Fechar dica">' + ico("x") + "</button></div>"; }
  function vazio(i, t, x, b) { return '<div class="vazio"><div class="vi">' + ico(i) + "</div><b>" + t + "</b><span>" + x + "</span>" + (b || "") + "</div>"; }

  /* toast com botão (Desfazer) */
  function toastAcao(msg, rotulo, cb) {
    var t = $("#toast"); t.innerHTML = "<span></span><button type='button'></button>";
    t.firstChild.textContent = msg; var b = t.lastChild; b.textContent = rotulo;
    t.classList.add("on", "acao"); clearTimeout(toast.h);
    b.onclick = function () { t.classList.remove("on", "acao"); cb(); };
    toast.h = setTimeout(function () { t.classList.remove("on", "acao"); }, 7000);
  }
  function comDesfazer(msg, fn) {
    var snap = JSON.stringify({ i: S.items, o: S.ord, h: S.hist });
    fn();
    toastAcao(msg, "Desfazer", function () {
      var s = JSON.parse(snap); S.items = s.i; S.ord = s.o; S.hist = s.h || [];
      if (folhaAberta) fechar();
      mudou(); toast("Desfeito ✓");
    });
  }

  /* ---------------- editar a lista (renomear / mover) ---------------- */
  function mover(ko, kn) { var v = S.items[ko], o = S.ord[ko]; definir(ko, null); definir(kn, v); if (o) S.ord[kn] = o; }
  function renomearTipo(velho, novo) {
    novo = limpa(novo); if (!novo) { toast("Digite o nome."); return false; }
    if (novo === velho) return true;
    var I = indice();
    if (Object.keys(I.tipos).some(function (n) { return n !== velho && chave(n) === chave(novo); })) { toast("Já existe um tipo com esse nome."); return false; }
    Object.keys(S.items).forEach(function (k) {
      var p = JSON.parse(k);
      if (["tipo", "cor", "mod", "qtd"].indexOf(p[0]) >= 0 && p[1] === velho) { p[1] = novo; mover(k, SK.apply(null, p)); }
    });
    Object.keys(S.tipoSel).forEach(function (f) { if (S.tipoSel[f] === velho) S.tipoSel[f] = novo; });
    mudou(); return true;
  }
  function renomearModelo(tipo, velho, novo, todos) {
    novo = limpa(novo); if (!novo) { toast("Digite o nome."); return false; }
    if (novo === velho) return true;
    var I = indice(), alvos = todos ? Object.keys(I.mods).filter(function (t) { return I.mods[t].some(function (m) { return m.nome === velho; }); }) : [tipo];
    if (alvos.indexOf(tipo) < 0) alvos.push(tipo);
    var choque = alvos.some(function (t) { return (I.mods[t] || []).some(function (m) { return m.nome !== velho && chave(m.nome) === chave(novo); }); });
    if (choque) { toast("Já existe um modelo com esse nome."); return false; }
    Object.keys(S.items).forEach(function (k) {
      var p = JSON.parse(k);
      if ((p[0] === "mod" || p[0] === "qtd") && alvos.indexOf(p[1]) >= 0 && p[2] === velho) { p[2] = novo; mover(k, SK.apply(null, p)); }
    });
    mudou(); return true;
  }
  function renomearCor(tipo, velha, nova) {
    nova = corFmt(nova); if (!nova) { toast("Digite o nome."); return false; }
    if (nova === velha) return true;
    var I = indice();
    if ((I.cores[tipo] || []).some(function (c) { return c.nome !== velha && chave(c.nome) === chave(nova); })) { toast("Essa cor já existe."); return false; }
    Object.keys(S.items).forEach(function (k) {
      var p = JSON.parse(k);
      if (p[0] === "cor" && p[1] === tipo && p[2] === velha) { p[2] = nova; mover(k, SK.apply(null, p)); }
      else if (p[0] === "qtd" && p[1] === tipo && p[3] === velha) { p[3] = nova; mover(k, SK.apply(null, p)); }
    });
    mudou(); return true;
  }
  function removerCor(tipo, cor) {
    Object.keys(S.items).forEach(function (k) {
      var p = JSON.parse(k);
      if ((p[0] === "cor" && p[1] === tipo && p[2] === cor) || (p[0] === "qtd" && p[1] === tipo && p[3] === cor)) definir(k, null);
    });
    mudou();
  }
  function moverTipo(nome, d) {
    var I = indice(), t = I.tipos[nome]; if (!t) return;
    var lista = tiposDe(I, t.f), i = lista.map(function (x) { return x.nome; }).indexOf(nome), j = i + d;
    if (j < 0 || j >= lista.length) { toast(d < 0 ? "Já é o primeiro." : "Já é o último."); return; }
    var x = lista.splice(i, 1)[0]; lista.splice(j, 0, x);
    lista.forEach(function (tt, idx) { if (tt.o !== idx + 1) definir(tt.k, { f: tt.f, u: tt.u, o: idx + 1 }); });
    mudou();
  }
  function folhaRenomear(titulo, valor, dados, extra) {
    var f = folha("<h2>" + titulo + '</h2><label>Novo nome</label><input id="in-ren" type="text" value="' + esc(valor) + '" autocomplete="off">' + (extra || "") + '<div class="linha"><button class="btn" data-act="fecha">Cancelar</button><button class="btn pri" data-act="ok-ren" ' + dados + ">Salvar</button></div>");
    var i = f.querySelector("#in-ren");
    i.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); f.querySelector('[data-act="ok-ren"]').click(); } });
    setTimeout(function () { i.focus(); i.select(); }, 90);
  }
  function linhaAcao(act, icone, texto, dados, cls) { return '<button class="' + (cls || "") + '" data-act="' + act + '" ' + (dados || "") + ">" + ico(icone) + '<span class="tx">' + texto + "</span></button>"; }
  function folhaModMenu(tipo, modelo) {
    var d = 'data-t="' + esc(tipo) + '" data-m="' + esc(modelo) + '"';
    folha("<h2>" + esc(modelo) + '</h2><div class="info">Tipo: ' + esc(tipo) + '</div><div class="lista-acoes">' + linhaAcao("ren-mod", "edit", "Renomear modelo", d) + linhaAcao("rem-modelo", "lixo", "Remover da lista", d, "perigo") + '</div><div class="info">Remover tira o modelo (e as quantidades dele) só deste tipo.</div>');
  }
  function folhaTipoMenu() {
    var tipo = S.tipoSel[S.aba], I = indice(), t = I.tipos[tipo], d = 'data-t="' + esc(tipo) + '"';
    folha("<h2>" + esc(tipo) + '</h2><div class="lista-acoes">' + linhaAcao("ren-tipo", "edit", "Renomear tipo", d) +
      '<div class="par">' + linhaAcao("mover-tipo", "seta-e", "Mover p/ esquerda", d + ' data-d="-1"') + linhaAcao("mover-tipo", "seta-d", "Mover p/ direita", d + ' data-d="1"') + "</div>" +
      (t && t.u ? linhaAcao("cores-edit", "cores", "Editar cores", d) : "") +
      linhaAcao("del-tipo", "lixo", "Excluir este tipo", d, "perigo") + '</div><div class="info">Excluir apaga o tipo, os modelos, as cores e as quantidades dele. Isso também chega ao PDV.</div>');
  }
  function folhaCores() {
    var I = indice(), t = S.tipoSel[S.aba], cs = I.cores[t] || [];
    folha("<h2>Cores de " + esc(t) + "</h2>" + (cs.length ? '<div class="lista-acoes">' + cs.map(function (c) {
      return '<div class="row-cor"><span class="tx">' + esc(c.nome) + '</span><button class="mini" data-act="ren-cor" data-t="' + esc(t) + '" data-c="' + esc(c.nome) + '" aria-label="Renomear">' + ico("edit") + '</button><button class="mini perigo" data-act="del-cor" data-t="' + esc(t) + '" data-c="' + esc(c.nome) + '" aria-label="Remover">' + ico("lixo") + "</button></div>";
    }).join("") + "</div>" : '<div class="info">Este tipo não tem cores.</div>') + '<div class="linha"><button class="btn" data-act="nova-cor">＋ Nova cor</button><button class="btn pri" data-act="fecha">Pronto</button></div><div class="info">Remover uma cor também apaga as quantidades dela.</div>');
  }

  /* ---------------- pedidos anteriores ---------------- */
  function registrarPedido(aba, forn, secoes, I) {
    var itens = [];
    if (aba === "outros") itens = I.faltas.map(function (f) { return Object.assign({}, f.v); });
    else {
      var nomes = tiposDe(I, aba).map(function (t) { return t.nome; });
      Object.keys(S.items).forEach(function (k) { var p = JSON.parse(k); if (p[0] === "qtd" && nomes.indexOf(p[1]) >= 0) itens.push([p[1], p[2], p[3] || "", S.items[k]]); });
    }
    S.hist = S.hist || [];
    S.hist.unshift({ id: uid(), em: new Date().toISOString(), aba: aba, forn: forn || "", total: secoes.reduce(function (s, x) { return s + x.total; }, 0), secoes: JSON.parse(JSON.stringify(secoes)), itens: itens, loja: I.loja || "" });
    S.hist = S.hist.slice(0, 15);
  }
  function folhaHist() {
    var h = S.hist || [];
    folha("<h2>Pedidos anteriores</h2>" + (h.length ? '<div class="lista-acoes">' + h.map(function (p, i) {
      return '<button data-act="hist-ver" data-i="' + i + '">' + ico(p.aba === "capas" ? "capas" : p.aba === "peliculas" ? "pel" : "outros") + '<span class="tx"><b>' + nomeAba(p.aba) + " · " + pecas(p.total) + "</b><small>" + dataHora(p.em) + (p.forn ? " · " + esc(p.forn) : "") + "</small></span>" + ico("seta-d", "seta") + "</button>";
    }).join("") + "</div>" : vazio("hist", "Nenhum pedido guardado ainda", "Quando você tocar em “Finalizar pedido”, ele fica guardado aqui para repetir quando quiser.")) + '<div class="info">Os pedidos anteriores ficam guardados só neste celular.</div>');
  }
  function folhaHistVer(i) {
    var p = (S.hist || [])[i]; if (!p) return;
    folha("<h2>" + nomeAba(p.aba) + " · " + dataHora(p.em) + "</h2><pre>" + esc(textoPedido(p.secoes, p.forn, p.loja)) + '</pre><div class="linha"><button class="btn pri" data-act="hist-repetir" data-i="' + i + '">' + ico("hist") + ' Repetir este pedido</button></div><div class="linha"><button class="btn" data-act="hist-img" data-i="' + i + '">' + ico("img") + ' Imagem</button><button class="btn" data-act="hist-pdf" data-i="' + i + '">' + ico("pdf") + ' PDF</button></div><div class="linha"><button class="btn" data-act="hist">‹ Voltar</button></div><div class="info">“Repetir” coloca essas quantidades de volta nas listas, para você conferir e enviar de novo.</div>');
  }
  function repetirPedido(i) {
    var p = (S.hist || [])[i]; if (!p) return;
    comDesfazer("Pedido repetido. Confira e envie.", function () {
      var I = indice();
      if (p.aba === "outros") p.itens.forEach(function (v) { addFalta(v.c, v.i, v.m, v.q, v.f); });
      else p.itens.forEach(function (it) {
        if (!I.tipos[it[0]]) return;
        if (!(I.mods[it[0]] || []).some(function (m) { return m.nome === it[1]; })) definir(SK("mod", it[0], it[1]), 1);
        definir(SK("qtd", it[0], it[1], it[2]), it[3]);
      });
      S.aba = p.aba; filtro = ""; mudou();
    });
    fechar();
  }

  /* ---------------- ajuda e tour ---------------- */
  var AJUDA = [
    ["Como anotar o que está faltando", "Escolha a aba <b>Capas</b> ou <b>Películas</b>, depois o tipo (as bolinhas lá em cima). Em cada modelo, toque em <b>+</b> para somar e em <b>−</b> para diminuir. <b>Segure o +</b> para subir rápido. Também dá para tocar no número e digitar."],
    ["Como mandar o pedido para o fornecedor", "Quando houver quantidades, aparece a barra dourada <b>Ver pedido</b>. Toque nela, escolha o fornecedor e envie por <b>WhatsApp</b>, como <b>imagem</b> ou como <b>PDF</b>."],
    ["Depois de enviar, o que faço?", "Toque em <b>Finalizar pedido</b>. Ele zera as quantidades para você começar o próximo e fica guardado em <b>Menu → Pedidos anteriores</b>. Se tocar sem querer, use o <b>Desfazer</b> que aparece embaixo."],
    ["Como repetir um pedido?", "Abra <b>Menu → Pedidos anteriores</b>, toque no pedido e depois em <b>Repetir este pedido</b>. As quantidades voltam para as listas e você confere antes de enviar."],
    ["Como trocar o nome de um modelo, tipo ou cor?", "No cartão do modelo, toque nos <b>três pontinhos</b> e em <b>Renomear</b>. Para tipos e cores, toque em <b>Opções do tipo</b> (no fim da lista). Lá você também muda a ordem dos tipos."],
    ["Funciona sem internet?", "Sim. Tudo que você anota fica salvo no celular. Quando a internet voltar, o app envia sozinho e traz o que mudou no PDV da loja."],
    ["O que é o botão de nuvem lá em cima?", "Mostra se está tudo igual ao PDV. <b>Sincronizado</b> = tudo certo. <b>Sem internet</b> = suas anotações estão salvas e serão enviadas depois. Toque nele para sincronizar na hora, ou puxe a tela para baixo."],
    ["Como funciona a trava por digital?", "Em <b>Menu → Travar com digital</b>. O app passa a pedir a digital (ou o PIN do celular) ao abrir e ao voltar a ele depois de um tempo."],
    ["Posso apagar sem querer?", "Quase tudo que apaga mostra um <b>Desfazer</b> por alguns segundos. Se aparecer, é só tocar."]
  ];
  function folhaAjuda() {
    folha("<h2>Ajuda</h2>" + AJUDA.map(function (a) { return '<details class="aj"><summary>' + esc(a[0]) + "</summary><p>" + a[1] + "</p></details>"; }).join("") + '<div class="linha"><button class="btn" data-act="tour-ver">Rever o tour</button></div>');
  }
  var TOUR = [
    { i: "capas", t: "Anote o que está faltando", x: "Toque em + e − para marcar quantas peças você precisa repor. Segure o + para subir mais rápido." },
    { i: "pedido", t: "Mande o pedido pronto", x: "Toque em “Ver pedido” e envie por WhatsApp, imagem ou PDF. Depois toque em “Finalizar” para começar o próximo." },
    { i: "nuvem", t: "Igual ao PDV da loja", x: "O que você anota aqui aparece no PDV, e o que muda lá aparece aqui. Sem internet, o app guarda e envia depois." }
  ];
  var tourN = 0;
  function tourVisto() { try { return !!localStorage.getItem("faltas_tour"); } catch (e) { return false; } }
  function tourFim() { try { localStorage.setItem("faltas_tour", "1"); } catch (e) { } $("#tour").hidden = true; }
  function tourPassos() {
    var s = TOUR[tourN], t = $("#tour");
    t.hidden = false;
    t.innerHTML = '<div class="tour-box"><button class="pular" data-act="tour-pular">Pular</button><div class="tour-ic">' + ico(s.i) + "</div><h2>" + esc(s.t) + "</h2><p>" + esc(s.x) + '</p><div class="pontos">' + TOUR.map(function (_, i) { return '<i class="' + (i === tourN ? "on" : "") + '"></i>'; }).join("") + '</div><button class="btn pri full" data-act="tour-prox">' + (tourN === TOUR.length - 1 ? "Começar" : "Próximo") + "</button></div>";
  }
  function tourSeNecessario() { if (tourVisto() || $("#trava") && !$("#trava").hidden) return; tourN = 0; tourPassos(); }

  /* ---------------- toque: segurar +/− , puxar para sincronizar, arrastar a janela ---------------- */
  var seg = { t: null, iv: null, el: null, ate: 0, mudou: false };
  function setQtdQuieto(tipo, modelo, cor, n) {
    var I = indice();
    if (n > 0 && !(I.mods[tipo] || []).some(function (m) { return m.nome === modelo; })) definir(SK("mod", tipo, modelo), 1);
    definir(SK("qtd", tipo, modelo, cor || ""), n > 0 ? n : null);
  }
  function passoQuieto(el) {
    var a = el.dataset.act, mais = a === "mais" || a === "f-mais", st = el.parentNode, inp = st && st.querySelector("input"); if (!inp) return pararSeg();
    var atual = parseInt(inp.value, 10) || 0, min = (a === "f-mais" || a === "f-menos") ? 1 : 0, novo = Math.max(min, Math.min(9999, atual + (mais ? 1 : -1)));
    if (novo === atual) return;
    inp.value = novo; seg.mudou = true; vibra(6);
    if (a === "mais" || a === "menos") setQtdQuieto(el.dataset.t, el.dataset.m, el.dataset.c, novo);
    else { var k = SK("falta", el.dataset.u), v = S.items[k]; if (v) definir(k, Object.assign({}, v, { q: novo })); }
    var card = el.closest(".card"), tot = card && card.querySelector(".tot");
    if (tot) { var s = 0; card.querySelectorAll(".st input").forEach(function (x) { s += parseInt(x.value, 10) || 0; }); tot.textContent = s; }
  }
  function pararSeg() {
    clearTimeout(seg.t); clearInterval(seg.iv); seg.el = null;
    if (seg.mudou) { seg.mudou = false; seg.ate = Date.now() + 450; mudou(); }
  }
  document.addEventListener("pointerdown", function (ev) {
    var el = ev.target.closest && ev.target.closest('[data-act="mais"],[data-act="menos"],[data-act="f-mais"],[data-act="f-menos"]'); if (!el) return;
    pararSeg(); seg.el = el;
    seg.t = setTimeout(function () { passoQuieto(el); seg.iv = setInterval(function () { passoQuieto(el); }, 90); }, 420);
  });
  ["pointerup", "pointercancel", "touchend", "touchcancel"].forEach(function (n) { document.addEventListener(n, function () { if (seg.el) pararSeg(); }, { passive: true }); });
  document.addEventListener("contextmenu", function (e) { if (e.target.closest && e.target.closest(".st button")) e.preventDefault(); });

  var pr = { on: false, x0: 0, y0: 0, dy: 0 };
  function puxaMostra(px) {
    var p = $("#puxa"); if (!p) return;
    p.style.transform = "translate(-50%," + (px ? px - 56 : -80) + "px)"; p.style.opacity = px ? "1" : "0";
    p.firstChild.nextSibling.textContent = px > 100 ? "Solte para sincronizar" : "Puxe para sincronizar";
  }
  document.addEventListener("touchstart", function (e) {
    pr.on = false;
    if (window.scrollY > 2 || folhaAberta || !$("#tour").hidden || document.body.classList.contains("travado") || e.touches.length !== 1) return;
    if (e.target.closest && e.target.closest(".tipos,input,select,textarea")) return;
    pr.on = true; pr.x0 = e.touches[0].clientX; pr.y0 = e.touches[0].clientY; pr.dy = 0;
  }, { passive: true });
  document.addEventListener("touchmove", function (e) {
    if (!pr.on) return;
    var dy = e.touches[0].clientY - pr.y0, dx = Math.abs(e.touches[0].clientX - pr.x0);
    if (dx > dy) { pr.on = false; puxaMostra(0); return; }
    pr.dy = Math.max(0, dy); puxaMostra(Math.min(pr.dy * 0.7, 150));
  }, { passive: true });
  document.addEventListener("touchend", function () {
    if (!pr.on) return; pr.on = false; var ok = pr.dy * 0.7 > 100; puxaMostra(0);
    if (ok) { vibra(15); sincronizar(true); }
  }, { passive: true });

  var dr = null;
  document.addEventListener("touchstart", function (e) {
    dr = null; var f = e.target.closest && e.target.closest(".folha");
    if (!f || f.scrollTop > 0 || e.target.closest("input,select,textarea,pre,details") || e.touches.length !== 1) return;
    dr = { f: f, y0: e.touches[0].clientY, dy: 0 };
  }, { passive: true });
  document.addEventListener("touchmove", function (e) {
    if (!dr) return; dr.dy = e.touches[0].clientY - dr.y0;
    if (dr.dy > 0) { dr.f.style.transition = "none"; dr.f.style.transform = "translateY(" + dr.dy + "px)"; }
  }, { passive: true });
  document.addEventListener("touchend", function () {
    if (!dr) return; var f = dr.f, fecha = dr.dy > 110; dr = null;
    f.style.transition = "transform .2s"; f.style.transform = "";
    if (fecha) fechar();
  }, { passive: true });

  /* botão Voltar do Android fecha a janela aberta em vez de sair do app */
  window.addEventListener("popstate", function () {
    if (ignoraPop) { ignoraPop = false; return; }
    if (folhaAberta) { folhaAberta = false; $("#sheet-root").innerHTML = ""; }
  });

  /* ---------------- eventos ---------------- */
  document.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-act]"); if (!el) return;
    var a = el.dataset.act, d = el.dataset;
    if (a === "fecha-fundo") { if (ev.target === el) fechar(); return; }
    if ((a === "mais" || a === "menos" || a === "f-mais" || a === "f-menos") && Date.now() < seg.ate) return;
    switch (a) {
      case "aba": $("#toast").classList.remove("on"); S.aba = d.aba; filtro = ""; salvar(); render(); animaView(); window.scrollTo(0, 0); break;
      case "tipo": S.tipoSel[S.aba] = d.t; filtro = ""; salvar(); render(); animaView(); break;
      case "mais": vibra(8); setQtd(d.t, d.m, d.c, q(indice(), d.t, d.m, d.c) + 1); break;
      case "menos": vibra(8); setQtd(d.t, d.m, d.c, q(indice(), d.t, d.m, d.c) - 1); break;
      case "novo-modelo": folhaNovoModelo(); break;
      case "ok-modelo": { var i = $("#in-m"); var r = addModelo(S.tipoSel[S.aba], i.value); if (r) { i.value = ""; i.focus(); } break; }
      case "nova-cor": folhaNovaCor(); break;
      case "ok-cor": { var ic = $("#in-c"); if (addCor(S.tipoSel[S.aba], ic.value)) { ic.value = ""; fechar(); } break; }
      case "novo-tipo": folhaNovoTipo(); break;
      case "ok-tipo": if (addTipo($("#in-t").value, S.aba, $("#in-u").checked)) fechar(); break;
      case "ativar-cores": ativarCores(S.tipoSel[S.aba]); toast("Cores ativadas"); break;
      case "mod-menu": folhaModMenu(d.t, d.m); break;
      case "rem-modelo": comDesfazer("Modelo removido", function () { removerModelo(d.t, d.m); }); fechar(); break;
      case "tipo-menu": folhaTipoMenu(); break;
      case "del-tipo":
        if (!el.dataset.conf) { el.dataset.conf = "1"; el.textContent = "Toque de novo para excluir"; break; }
        comDesfazer("Tipo excluído", function () { excluirTipo(d.t); }); fechar(); break;
      case "nova-falta": folhaNovaFalta(); break;
      case "ok-falta": {
        var sel = $("#f-cat"), cat = sel.value === "__nova" ? $("#f-cat2").value : sel.value;
        if (addFalta(cat, $("#f-item").value, $("#f-mod").value, $("#f-qtd").value, $("#f-for").value)) { fechar(); toast("Anotado"); }
        break;
      }
      case "f-mais": case "f-menos": { var v = S.items[SK("falta", d.u)]; if (v) setFalta(d.u, { q: v.q + (a === "f-mais" ? 1 : -1) }); break; }
      case "f-del":
        if (!el.classList.contains("conf")) { el.classList.add("conf"); el.textContent = "Apagar?"; el.style.width = "auto"; el.style.padding = "0 12px"; setTimeout(function () { render(); }, 2500); break; }
        comDesfazer("Item apagado", function () { setFalta(d.u, { q: 0 }); }); break;
      case "pedido": folhaPedido(); break;
      case "p-wa": {
        var I = indice(), aba = S.aba, fn = $("#p-for").value, sec = aba === "outros" ? secoesOutros(I) : secoesGrade(I, aba);
        var forn = I.forns.filter(function (x) { return x.nome === fn; })[0], tel = forn ? telWhats(forn.whatsapp) : "";
        window.open("https://wa.me/" + tel + "?text=" + encodeURIComponent(textoPedido(sec, fn, I.loja)), "_blank");
        break;
      }
      case "p-img": compartilharPedido("png"); break;
      case "p-pdf": compartilharPedido("pdf"); break;
      case "destravar": destravar(); break;
      case "trava-on": ativarTrava(); break;
      case "trava-off": desativarTrava(); break;
      case "p-copiar": {
        var txt = $("#p-txt").textContent;
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast("Texto copiado"); }, function () { toast("Não consegui copiar. Segure no texto para copiar."); });
        break;
      }
      case "p-final":
        if (!el.dataset.conf) { el.dataset.conf = "1"; el.textContent = "Toque de novo para zerar tudo"; break; }
      {
        var Ip = indice(), abaP = S.aba, secP = abaP === "outros" ? secoesOutros(Ip) : secoesGrade(Ip, abaP), fnP = $("#p-for").value;
        comDesfazer("Pedido finalizado e guardado", function () {
          registrarPedido(abaP, fnP, secP, Ip);
          if (abaP === "outros") { Object.keys(S.items).forEach(function (k) { if (JSON.parse(k)[0] === "falta") definir(k, null); }); mudou(); }
          else zerarFamilia(abaP);
        });
        fechar(); break;
      }
      case "menu": folhaMenu(); break;
      case "hist": folhaHist(); break;
      case "hist-ver": folhaHistVer(parseInt(d.i, 10)); break;
      case "hist-repetir": repetirPedido(parseInt(d.i, 10)); break;
      case "hist-img": case "hist-pdf": compartilharPedido(a === "hist-pdf" ? "pdf" : "png", S.hist[parseInt(d.i, 10)]); break;
      case "ajuda": folhaAjuda(); break;
      case "dica-x": dicaMarcar(d.id); render(); break;
      case "tour-ver": fechar(); tourN = 0; tourPassos(); break;
      case "tour-pular": tourFim(); break;
      case "tour-prox": if (tourN >= TOUR.length - 1) tourFim(); else { tourN++; tourPassos(); } break;
      case "ren-tipo": folhaRenomear("Renomear tipo", d.t, 'data-k="tipo" data-t="' + esc(d.t) + '"'); break;
      case "ren-mod": folhaRenomear("Renomear modelo", d.m, 'data-k="mod" data-t="' + esc(d.t) + '" data-m="' + esc(d.m) + '"', '<label class="chk"><input id="in-todos" type="checkbox" checked> Mudar em todos os tipos que têm este modelo</label>'); break;
      case "ren-cor": folhaRenomear("Renomear cor", d.c, 'data-k="cor" data-t="' + esc(d.t) + '" data-c="' + esc(d.c) + '"'); break;
      case "ok-ren": {
        var vn = $("#in-ren").value, okr = false;
        if (d.k === "tipo") okr = renomearTipo(d.t, vn);
        else if (d.k === "mod") okr = renomearModelo(d.t, d.m, vn, $("#in-todos").checked);
        else if (d.k === "cor") okr = renomearCor(d.t, d.c, vn);
        if (okr) { if (d.k === "cor") folhaCores(); else fechar(); toast("Nome alterado ✓"); }
        break;
      }
      case "mover-tipo": moverTipo(d.t, parseInt(d.d, 10)); fechar(); break;
      case "cores-edit": folhaCores(); break;
      case "del-cor": comDesfazer("Cor removida", function () { removerCor(d.t, d.c); }); folhaCores(); break;
      case "sync": case "sync-agora":
        if (!Sync.auth.conectado()) { Sync.auth.entrar(false); break; }
        if (a === "sync-agora") fechar();
        sincronizar(true); break;
      case "entrar": Sync.auth.entrar(false); break;
      case "sair": Sync.auth.sair(); S.base = {}; salvar(); fechar(); chipSync("novo", "Entrar"); render(); toast("Saiu da conta. Suas anotações continuam aqui."); break;
      case "fecha": fechar(); break;
    }
  });
  document.addEventListener("change", function (ev) {
    var el = ev.target; if (!el.dataset || !el.dataset.actIn) return;
    if (el.dataset.actIn === "qtd") setQtd(el.dataset.t, el.dataset.m, el.dataset.c, el.value);
    else if (el.dataset.actIn === "f-qtd") setFalta(el.dataset.u, { q: parseInt(el.value, 10) || 0 });
  });
  document.addEventListener("focusin", function (ev) { if (ev.target.type === "number" && ev.target.dataset.actIn) ev.target.select(); });
  document.addEventListener("input", function (ev) {
    if (ev.target.id === "busca") { filtro = ev.target.value; var pos = ev.target.selectionStart; render(); var b = $("#busca"); if (b) { b.focus(); try { b.setSelectionRange(pos, pos); } catch (e) { } } }
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Enter" && ev.target.dataset && ev.target.dataset.actIn) ev.target.blur();
  });
  document.addEventListener("visibilitychange", function () { if (!document.hidden) sincronizar(false); });
  window.addEventListener("online", function () { sincronizar(false); });
  window.addEventListener("offline", function () { chipSync("offline", msgOffline()); });
  setInterval(function () { if (!document.hidden) { var a = document.activeElement; if (!a || a.tagName !== "INPUT") sincronizar(false); } }, 30000);

  /* ---------------- início ---------------- */
  async function iniciar() {
    render();
    if (travaId()) destravar();
    chipSync(Sync.auth.conectado() ? "novo" : "novo", Sync.auth.conectado() ? "…" : "Entrar");
    var r = { estado: "nada" };
    try { r = await Sync.auth.tratarRetorno(); } catch (e) { r = { estado: "erro", msg: String(e.message || e) }; }
    if (r.estado === "erro") { chipSync("erro", "Falha no login"); folha('<h2>Não consegui entrar</h2><div class="info">A Microsoft respondeu:</div><pre>' + esc(r.msg) + '</pre><div class="info">Tire uma foto desta tela e mande para o Claude.</div><div class="linha"><button class="btn" data-act="fecha">Fechar</button><button class="btn pri" data-act="entrar">Tentar de novo</button></div>'); }
    else if (r.estado === "precisa_entrar") { chipSync("erro", "Entrar de novo"); estadoSync.tipo = "precisa"; }
    else if (r.estado === "ok") toast("Conectado à sua conta ✓");
    render();
    if ("serviceWorker" in navigator) { try { navigator.serviceWorker.register("sw.js"); } catch (e) { } }
    if (Sync.auth.conectado() && r.estado !== "precisa_entrar") sincronizar(false);
    if (r.estado !== "erro" && !folhaAberta) tourSeNecessario();
  }
  iniciar();
  window.__faltas = { pendentes: pendentes, S: function () { return S; }, indice: indice, sincronizar: sincronizar, textoPedido: textoPedido, secoesGrade: secoesGrade, secoesOutros: secoesOutros };
})();
