"use strict";

const API = "/api";
const state = {
  section: "overview",
  messageModule: "all",
  mensagens: [],
  fluxos: [],
  usuarios: [],
  vinculos: [],
  fluxoSelected: null,
  fluxoDetail: null,
  health: null,
  previewOpen: {},
  lastLoadedAt: null,
};

const META = {
  overview: ["Painel do bot", "Visao geral"],
  mensagens: ["Modulo de conteudo", "Mensagens"],
  fluxos: ["Construtor de conversa", "Fluxos"],
  vinculos: ["Regras de entrada", "Vinculos"],
  usuarios: ["Base de contatos", "Usuarios"],
};

const app = document.getElementById("app");
const modalRoot = document.getElementById("modal-root");
const modalCard = document.getElementById("modal-card");
const toastEl = document.getElementById("toast");
const statusPill = document.getElementById("status-pill");
const sectionTitle = document.getElementById("section-title");
const sectionKicker = document.getElementById("section-kicker");

let optRowIndex = 0;
let toastTimer = null;

const esc = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (v) => esc(v).replace(/"/g, "&quot;");
const bool = (v) => v === true || v === 1 || v === "1";
const digits = (v) => String(v ?? "").replace(/\D/g, "");
const domId = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-") || "item";
const parseList = (v) => {
  try {
    const out = JSON.parse(v || "[]");
    return Array.isArray(out) ? out : [];
  } catch {
    return [];
  }
};

function normSetor(v) {
  const t = String(v ?? "").trim().toUpperCase();
  if (!t) return "";
  if (t === "TI" || t.includes("TECNOLOGIA")) return "TI";
  if (t.includes("QUALIDADE") || t.includes("CONTROLE")) return "CONTROLE DE QUALIDADE";
  if (t.includes("ADMIN")) return "ADMIN";
  return t;
}

function titleize(v) {
  return String(v || "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ") || "Sem modulo";
}

function dateText(v) {
  if (!v) return "-";
  try {
    const iso = String(v).includes("T") ? String(v) : String(v).replace(" ", "T");
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(v);
  }
}

function previewText(v) {
  const h = new Date().getHours();
  const saud = h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
  return String(v || "")
    .replace(/\{saudacao\}/g, saud)
    .replace(/\{nome\}/g, "Maria")
    .replace(/\{cancelar\}/g, "Digite C para cancelar.");
}

function modules() {
  const set = new Set(["menu", "ti", "cq", "cadastro"]);
  state.mensagens.forEach((m) => m.modulo && set.add(m.modulo));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

const flowById = (id) => state.fluxos.find((f) => Number(f.id) === Number(id)) || null;
const linksByFlow = (id) => state.vinculos.filter((v) => Number(v.fluxo_id) === Number(id));

function triggers(flow) {
  return String(flow?.gatilho_palavras || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function linkTypeLabel(type) {
  return type === "numero" ? "Numero" : type === "setor" ? "Setor" : type === "admin" ? "Admin" : type || "Destino";
}

function linkValueLabel(link) {
  if (link.tipo === "numero") return link.valor;
  if (link.tipo === "setor") return titleize(link.valor);
  if (link.tipo === "admin") return "Todos os admins";
  return link.valor || "-";
}

function userLinks(user) {
  const out = [];
  const byNum = state.vinculos.find((v) => v.tipo === "numero" && v.valor === digits(user.numero));
  const bySetor = state.vinculos.find((v) => v.tipo === "setor" && normSetor(v.valor) === normSetor(user.setor));
  const byAdmin = normSetor(user.setor) === "ADMIN" ? state.vinculos.find((v) => v.tipo === "admin") : null;
  if (byNum) out.push(`Numero -> ${byNum.fluxo_nome || flowById(byNum.fluxo_id)?.nome || "Fluxo"}`);
  if (bySetor) out.push(`Setor -> ${bySetor.fluxo_nome || flowById(bySetor.fluxo_id)?.nome || "Fluxo"}`);
  if (byAdmin) out.push(`Admin -> ${byAdmin.fluxo_nome || flowById(byAdmin.fluxo_id)?.nome || "Fluxo"}`);
  return out;
}

function renderLoading(text) {
  app.innerHTML = `<section class="loading-panel"><div><h3 class="panel-title">Bot Admin</h3><p class="helper">${esc(text || "Carregando...")}</p></div></section>`;
}

function renderError(text) {
  app.innerHTML = `<section class="empty-state"><div><h3>Nao consegui carregar</h3><p>${esc(text)}</p><div class="hero-actions" style="justify-content:center;margin-top:18px;"><button class="btn btn-primary" data-action="reload" type="button">Tentar de novo</button></div></div></section>`;
}

function openModal({ title, subtitle = "", content, wide = false }) {
  modalCard.className = `modal-card${wide ? " modal-wide" : ""}`;
  modalCard.innerHTML = `
    <div class="modal-head">
      <div>
        <h3>${esc(title)}</h3>
        ${subtitle ? `<p class="helper">${esc(subtitle)}</p>` : ""}
      </div>
      <button class="modal-close" data-action="close-modal" type="button">X</button>
    </div>
    ${content}
  `;
  modalRoot.classList.remove("hidden");
}

function closeModal() {
  modalRoot.classList.add("hidden");
  modalCard.innerHTML = "";
}

function toast(msg, type = "success") {
  toastEl.textContent = msg;
  toastEl.className = `toast is-open${type === "error" ? " is-error" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.className = "toast";
  }, 3200);
}

async function api(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || "Erro ao falar com a API");
  return data;
}

async function health() {
  try {
    return await api("/api/health");
  } catch {
    return { status: "offline" };
  }
}

async function loadAll({ silent = false, keepFlow = false } = {}) {
  if (!silent) renderLoading("Buscando mensagens, fluxos, vinculos e usuarios...");

  const [mensagens, fluxos, usuarios, vinculos, apiHealth] = await Promise.all([
    api(`${API}/bot-mensagens`),
    api(`${API}/bot-fluxos`),
    api(`${API}/bot-wausers`),
    api(`${API}/bot-vinculos`),
    health(),
  ]);

  state.mensagens = mensagens || [];
  state.fluxos = fluxos || [];
  state.usuarios = usuarios || [];
  state.vinculos = vinculos || [];
  state.health = apiHealth;
  state.lastLoadedAt = new Date().toISOString();

  const validModules = new Set(["all", ...modules()]);
  if (!validModules.has(state.messageModule)) state.messageModule = "all";

  if (keepFlow && state.fluxoSelected) {
    try {
      state.fluxoDetail = await api(`${API}/bot-fluxos/${state.fluxoSelected}`);
    } catch {
      state.fluxoSelected = null;
      state.fluxoDetail = null;
    }
  } else if (!state.fluxoSelected) {
    state.fluxoDetail = null;
  }

  updateChrome();
  render();
}

function updateChrome() {
  const meta = META[state.section] || META.overview;
  sectionKicker.textContent = meta[0];
  sectionTitle.textContent = meta[1];
  document.querySelectorAll("[data-nav]").forEach((el) => el.classList.toggle("is-active", el.dataset.nav === state.section));
  if (state.health?.status === "healthy") {
    statusPill.textContent = `API pronta · ${dateText(state.lastLoadedAt)}`;
    statusPill.classList.remove("is-error");
  } else {
    statusPill.textContent = "API sem resposta";
    statusPill.classList.add("is-error");
  }
}

function setSection(section) {
  state.section = section;
  updateChrome();
  render();
}

function render() {
  if (state.section === "mensagens") return renderMessages();
  if (state.section === "fluxos") return renderFlows();
  if (state.section === "vinculos") return renderLinks();
  if (state.section === "usuarios") return renderUsers();
  renderOverview();
}

function metric(title, value, help) {
  return `<article class="metric-card"><span>${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(help)}</small></article>`;
}

function guide(title, text) {
  return `<article class="step-card"><h4>${esc(title)}</h4><p class="helper">${esc(text)}</p></article>`;
}

function renderOverview() {
  const emptyFlows = state.fluxos.filter((f) => Number(f.total_etapas || 0) === 0);
  const brokenLinks = state.vinculos.filter((v) => !bool(v.fluxo_ativo));
  const recentFlows = state.fluxos.slice(0, 3);
  const alerts = [];
  if (emptyFlows.length) alerts.push(`Fluxos sem etapa: ${emptyFlows.map((f) => f.nome).join(", ")}`);
  if (brokenLinks.length) alerts.push(`Vinculos com fluxo inativo: ${brokenLinks.map((v) => `${linkTypeLabel(v.tipo)} ${linkValueLabel(v)}`).join(", ")}`);

  app.innerHTML = `
    <div class="view">
      <section class="hero">
        <div class="hero-copy">
          <p class="eyebrow" style="color:var(--primary);">Organizacao do bot</p>
          <h3>Cada parte agora fica no seu proprio modulo.</h3>
          <p>Primeiro voce escreve mensagens. Depois monta o fluxo. No fim, vincula por setor, numero ou admin para a conversa cair no lugar certo.</p>
          <div class="hero-actions">
            <button class="btn btn-primary" data-action="show-create-message" type="button">Nova mensagem</button>
            <button class="btn btn-secondary" data-action="show-create-flow" type="button">Novo fluxo</button>
            <button class="btn btn-secondary" data-action="show-create-link" type="button">Novo vinculo</button>
            <button class="btn btn-secondary" data-action="show-create-user" type="button">Novo usuario</button>
          </div>
        </div>
        <div class="hero-metrics">
          ${metric("Mensagens", state.mensagens.length, `${new Set(state.mensagens.map((m) => m.modulo || "geral")).size} modulo(s)`)}
          ${metric("Fluxos", state.fluxos.length, `${state.fluxos.filter((f) => bool(f.ativo)).length} ativo(s)`)}
          ${metric("Vinculos", state.vinculos.length, `${state.vinculos.filter((v) => bool(v.ativo)).length} ligado(s)`)}
          ${metric("Usuarios", state.usuarios.length, `${state.usuarios.filter((u) => userLinks(u).length > 0).length} com regra de entrada`)}
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><div><h3 class="panel-title">Como operar</h3><p class="helper">Fluxo rapido para criar tudo sem embolar.</p></div></div>
        <div class="steps-grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr));">
          ${guide("1. Mensagens", "Crie os textos por modulo e deixe o tom pronto.")}
          ${guide("2. Fluxos", "Monte a conversa em etapas com respostas e finais.")}
          ${guide("3. Vinculos", "Ligue o fluxo ao setor, numero ou admin.")}
          ${guide("4. Usuarios", "Cadastre os contatos e confira se ja entram na conversa certa.")}
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><div><h3 class="panel-title">Pontos de atencao</h3><p class="helper">O que ainda falta amarrar.</p></div></div>
        ${
          alerts.length
            ? `<div class="message-list">${alerts.map((a) => `<article class="message-card"><div class="chips"><span class="chip is-accent">Atencao</span></div><p class="helper" style="margin-top:12px;">${esc(a)}</p></article>`).join("")}</div>`
            : `<div class="empty-state" style="min-height:220px;"><div><h3>Tudo certo</h3><p>O painel nao encontrou pendencia forte agora.</p></div></div>`
        }
      </section>

      <section class="panel">
        <div class="panel-head"><div><h3 class="panel-title">Continuar de onde parou</h3><p class="helper">Atalhos para os fluxos mais recentes.</p></div><button class="btn btn-secondary btn-small" data-nav="fluxos" type="button">Ver todos</button></div>
        ${
          recentFlows.length
            ? `<div class="flow-grid">${recentFlows.map((f) => flowCard(f)).join("")}</div>`
            : `<div class="empty-state" style="min-height:220px;"><div><h3>Nenhum fluxo ainda</h3><p>Crie o primeiro fluxo para comecar.</p></div></div>`
        }
      </section>
    </div>
  `;
}

function renderMessages() {
  const mods = ["all", ...modules()];
  const list = state.messageModule === "all" ? state.mensagens : state.mensagens.filter((m) => (m.modulo || "") === state.messageModule);
  app.innerHTML = `
    <div class="view">
      <section class="panel">
        <div class="section-header">
          <div>
            <h3 class="panel-title">Mensagens do bot</h3>
            <p class="helper">Escreva os textos por modulo. Da para criar mensagem nova sem mexer no resto do fluxo.</p>
          </div>
          <button class="btn btn-primary" data-action="show-create-message" type="button">Nova mensagem</button>
        </div>
        <div class="toolbar" style="margin-top:18px;">
          <div class="module-filter">
            ${mods.map((m) => `<button class="filter-chip${state.messageModule === m ? " is-active" : ""}" data-action="set-message-module" data-module="${escAttr(m)}" type="button">${esc(m === "all" ? "Todos" : titleize(m))}</button>`).join("")}
          </div>
          <div class="chips">
            <span class="chip is-primary">{saudacao}</span>
            <span class="chip is-primary">{nome}</span>
            <span class="chip is-primary">{cancelar}</span>
          </div>
        </div>
      </section>
      ${
        list.length
          ? `<section class="message-list">${list.map((m) => messageCard(m)).join("")}</section>`
          : `<section class="empty-state"><div><h3>Nenhuma mensagem aqui</h3><p>Crie a primeira mensagem deste modulo.</p></div></section>`
      }
    </div>
  `;
}

function messageCard(m) {
  const key = String(m.chave || "");
  const inputId = `msg-${domId(key)}`;
  const previewId = `preview-${domId(key)}`;
  const open = !!state.previewOpen[key];
  return `
    <article class="message-card">
      <div class="section-header">
        <div>
          <div class="chips">
            <span class="chip is-primary">${esc(titleize(m.modulo || "geral"))}</span>
            <span class="chip">${esc(key)}</span>
          </div>
          <h3 class="panel-title" style="font-size:24px;margin-top:12px;">${esc(m.titulo || key)}</h3>
          <p class="helper">${esc(m.descricao || "Sem descricao.")}</p>
        </div>
        <span class="mini-badge">Atualizada ${esc(dateText(m.updated_at))}</span>
      </div>
      <div class="field" style="margin-top:16px;">
        <label for="${escAttr(inputId)}">Conteudo</label>
        <textarea id="${escAttr(inputId)}" data-message-input="${escAttr(key)}" spellcheck="false">${esc(m.conteudo || "")}</textarea>
      </div>
      <div class="preview${open ? " is-open" : ""}" id="${escAttr(previewId)}">${esc(previewText(m.conteudo || ""))}</div>
      <div class="card-actions" style="margin-top:16px;">
        <button class="btn btn-primary btn-small" data-action="save-message" data-key="${escAttr(key)}" type="button">Salvar</button>
        <button class="btn btn-secondary btn-small" data-action="toggle-preview" data-key="${escAttr(key)}" type="button">${open ? "Esconder preview" : "Abrir preview"}</button>
        <button class="btn btn-secondary btn-small" data-action="reset-message" data-key="${escAttr(key)}" type="button">Resetar</button>
        <button class="btn btn-danger btn-small" data-action="delete-message" data-key="${escAttr(key)}" type="button">Apagar</button>
      </div>
    </article>
  `;
}

function flowSwitch(id, on, next, action = "toggle-flow") {
  return `
    <button class="switch${on ? " is-on" : ""}" data-action="${escAttr(action)}" data-id="${escAttr(id)}" data-next="${escAttr(next)}" type="button">
      <span class="switch__track"></span>
      <span class="switch__label">${on ? "Ligado" : "Desligado"}</span>
    </button>
  `;
}

function renderFlows() {
  if (state.fluxoSelected && state.fluxoDetail) return renderFlowEditor();
  app.innerHTML = `
    <div class="view">
      <section class="panel">
        <div class="section-header">
          <div>
            <h3 class="panel-title">Fluxos de conversa</h3>
            <p class="helper">Monte a conversa em etapas e deixe as entradas ligadas por gatilho ou por vinculo.</p>
          </div>
          <button class="btn btn-primary" data-action="show-create-flow" type="button">Novo fluxo</button>
        </div>
      </section>
      ${
        state.fluxos.length
          ? `<section class="flow-grid">${state.fluxos.map((f) => flowCard(f)).join("")}</section>`
          : `<section class="empty-state"><div><h3>Nenhum fluxo criado</h3><p>Crie um fluxo para comecar a montar as conversas.</p></div></section>`
      }
    </div>
  `;
}

function flowCard(flow) {
  const on = bool(flow.ativo);
  const flowLinks = linksByFlow(flow.id);
  return `
    <article class="flow-card${on ? "" : " is-inactive"}">
      <div class="top-row">
        <div class="chips">
          <span class="chip ${on ? "is-primary" : "is-danger"}">${on ? "Ativo" : "Inativo"}</span>
          <span class="chip">${esc((flow.total_etapas || 0) + " etapa(s)")}</span>
          <span class="chip">${esc(flowLinks.length + " vinculo(s)")}</span>
        </div>
        ${flowSwitch(flow.id, on, on ? 0 : 1)}
      </div>
      <div>
        <h3>${esc(flow.nome || "Fluxo")}</h3>
        <p class="helper">${esc(flow.descricao || "Sem descricao.")}</p>
      </div>
      <div class="chips">
        ${
          triggers(flow).length
            ? triggers(flow).map((t) => `<span class="chip is-accent">${esc(t)}</span>`).join("")
            : `<span class="chip is-muted">Sem gatilho</span>`
        }
      </div>
      <div class="card-actions">
        <button class="btn btn-primary btn-small" data-action="open-flow" data-flow-id="${escAttr(flow.id)}" type="button">Abrir editor</button>
        <button class="btn btn-secondary btn-small" data-action="show-edit-flow" data-flow-id="${escAttr(flow.id)}" type="button">Configurar</button>
        <button class="btn btn-secondary btn-small" data-action="show-create-link" data-flow-id="${escAttr(flow.id)}" type="button">Vincular</button>
        <button class="btn btn-danger btn-small" data-action="delete-flow" data-flow-id="${escAttr(flow.id)}" type="button">Apagar</button>
      </div>
    </article>
  `;
}

function renderFlowEditor() {
  const flow = state.fluxoDetail;
  const on = bool(flow.ativo);
  const steps = Array.isArray(flow.etapas) ? flow.etapas : [];
  const flowLinks = linksByFlow(flow.id);
  app.innerHTML = `
    <div class="view">
      <section class="panel">
        <div class="section-header">
          <div>
            <button class="btn btn-ghost btn-small" data-action="close-flow-editor" type="button">Voltar para a lista</button>
            <h3 class="panel-title" style="margin-top:10px;">${esc(flow.nome || "Fluxo")}</h3>
            <p class="helper">${esc(flow.descricao || "Sem descricao.")}</p>
          </div>
          <div class="inline-actions">
            ${flowSwitch(flow.id, on, on ? 0 : 1)}
            <button class="btn btn-secondary" data-action="show-edit-flow" data-flow-id="${escAttr(flow.id)}" type="button">Configurar fluxo</button>
            <button class="btn btn-primary" data-action="show-create-step" type="button">Nova etapa</button>
          </div>
        </div>
      </section>

      <section class="editor-grid">
        <article class="panel">
          <div class="panel-head"><div><h3 class="panel-title">Entrada</h3><p class="helper">Gatilhos por texto e vinculos diretos para numero, setor ou admin.</p></div></div>
          <div class="field" style="margin-top:18px;">
            <label>Palavras gatilho</label>
            <div class="chips">
              ${
                triggers(flow).length
                  ? triggers(flow).map((t) => `<span class="chip is-accent">${esc(t)}</span>`).join("")
                  : `<span class="chip is-muted">Sem gatilho</span>`
              }
            </div>
          </div>
          <div class="field" style="margin-top:18px;">
            <label>Vinculos usando este fluxo</label>
            ${
              flowLinks.length
                ? `<div class="message-list">${flowLinks.map((v) => flowLinkMini(v)).join("")}</div>`
                : `<p class="helper">Nenhum vinculo ainda para este fluxo.</p>`
            }
          </div>
          <div class="hero-actions"><button class="btn btn-secondary" data-action="show-create-link" data-flow-id="${escAttr(flow.id)}" type="button">Criar vinculo</button></div>
        </article>

        <article class="panel">
          <div class="panel-head"><div><h3 class="panel-title">Etapas da conversa</h3><p class="helper">Crie a etapa <code>inicio</code> primeiro e depois ligue as proximas respostas.</p></div></div>
          ${
            steps.length
              ? `<div class="steps-list" style="margin-top:18px;">${steps.map((s) => stepCard(s)).join("")}</div>`
              : `<div class="empty-state" style="min-height:220px;"><div><h3>Fluxo sem etapas</h3><p>Crie a primeira etapa para este fluxo funcionar.</p></div></div>`
          }
        </article>
      </section>
    </div>
  `;
}

function flowLinkMini(link) {
  return `
    <article class="message-card${bool(link.ativo) ? "" : " is-inactive"}">
      <div class="chips">
        <span class="chip">${esc(linkTypeLabel(link.tipo))}</span>
        <span class="chip is-accent">${esc(linkValueLabel(link))}</span>
        <span class="chip ${bool(link.ativo) ? "is-primary" : "is-danger"}">${bool(link.ativo) ? "Ligado" : "Desligado"}</span>
      </div>
      <p class="helper" style="margin-top:12px;">${esc(link.observacao || "Entrada automatica por oi, ola ou menu.")}</p>
    </article>
  `;
}

function stepCard(step) {
  const opts = parseList(step.opcoes);
  return `
    <article class="step-card">
      <div class="chips">
        <span class="chip is-primary">${esc(step.chave || "etapa")}</span>
        <span class="chip ${bool(step.eh_final) ? "is-accent" : ""}">${bool(step.eh_final) ? "Final" : "Continua"}</span>
      </div>
      <h4 style="margin-top:14px;">${esc(step.chave || "Etapa")}</h4>
      <p class="step-message">${esc(step.mensagem || "")}</p>
      ${
        opts.length
          ? `<div class="option-list">${opts.map((o) => `<div class="option-pill"><strong>${esc(o.texto || "")}</strong><span class="muted">-></span><span>${esc(o.proxima_etapa || "fim")}</span>${o.mensagem_final ? `<span class="mini-badge is-primary">${esc(o.mensagem_final)}</span>` : ""}</div>`).join("")}</div>`
          : `<p class="helper" style="margin-top:14px;">${bool(step.eh_final) ? "Etapa final sem resposta." : "Sem opcoes configuradas."}</p>`
      }
      <div class="step-actions" style="margin-top:18px;">
        <button class="btn btn-secondary btn-small" data-action="show-edit-step" data-step-id="${escAttr(step.id)}" type="button">Editar etapa</button>
        <button class="btn btn-danger btn-small" data-action="delete-step" data-step-id="${escAttr(step.id)}" type="button">Apagar etapa</button>
      </div>
    </article>
  `;
}

function renderLinks() {
  app.innerHTML = `
    <div class="view">
      <section class="panel">
        <div class="section-header">
          <div>
            <h3 class="panel-title">Vinculos de conversa</h3>
            <p class="helper">Ligue um fluxo a um setor, a um numero ou a todos os admins. O vinculo entra com <code>oi</code>, <code>ola</code> ou <code>menu</code>.</p>
          </div>
          <button class="btn btn-primary" data-action="show-create-link" type="button">Novo vinculo</button>
        </div>
      </section>
      ${
        state.vinculos.length
          ? `<section class="link-grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr));">${state.vinculos.map((v) => linkCard(v)).join("")}</section>`
          : `<section class="empty-state"><div><h3>Nenhum vinculo ainda</h3><p>Crie um vinculo para mandar o contato direto para a conversa certa.</p></div></section>`
      }
    </div>
  `;
}

function linkCard(link) {
  const on = bool(link.ativo);
  const flowOn = bool(link.fluxo_ativo);
  return `
    <article class="link-card${on ? "" : " is-inactive"}">
      <div class="top-row">
        <div class="chips">
          <span class="chip">${esc(linkTypeLabel(link.tipo))}</span>
          <span class="chip is-accent">${esc(linkValueLabel(link))}</span>
          <span class="chip ${on ? "is-primary" : "is-danger"}">${on ? "Ligado" : "Desligado"}</span>
          ${flowOn ? "" : `<span class="chip is-danger">Fluxo inativo</span>`}
        </div>
        ${flowSwitch(link.id, on, on ? 0 : 1, "toggle-link")}
      </div>
      <h3 style="margin-top:16px;">${esc(link.fluxo_nome || flowById(link.fluxo_id)?.nome || "Fluxo")}</h3>
      <p class="helper">${esc(link.observacao || "Entrada automatica por saudacao/menu.")}</p>
      <p class="helper" style="margin-top:10px;">Atualizado em ${esc(dateText(link.updated_at || link.created_at))}</p>
      <div class="card-actions" style="margin-top:18px;">
        <button class="btn btn-secondary btn-small" data-action="show-edit-link" data-link-id="${escAttr(link.id)}" type="button">Editar</button>
        <button class="btn btn-secondary btn-small" data-action="open-flow" data-flow-id="${escAttr(link.fluxo_id)}" type="button">Abrir fluxo</button>
        <button class="btn btn-danger btn-small" data-action="delete-link" data-link-id="${escAttr(link.id)}" type="button">Apagar</button>
      </div>
    </article>
  `;
}

function renderUsers() {
  app.innerHTML = `
    <div class="view">
      <section class="panel">
        <div class="section-header">
          <div>
            <h3 class="panel-title">Usuarios do bot</h3>
            <p class="helper">Cadastre o contato, o numero e o setor. O painel mostra se ele ja entra por alguma conversa vinculada.</p>
          </div>
          <button class="btn btn-primary" data-action="show-create-user" type="button">Novo usuario</button>
        </div>
      </section>
      ${
        state.usuarios.length
          ? `<section class="users-table-wrap"><table class="users-table"><thead><tr><th>Nome</th><th>Numero</th><th>Setor</th><th>Conversa vinculada</th><th>Criado</th><th></th></tr></thead><tbody>${state.usuarios.map((u) => userRow(u)).join("")}</tbody></table></section>`
          : `<section class="empty-state"><div><h3>Nenhum usuario cadastrado</h3><p>Cadastre os contatos para ligar o bot aos setores certos.</p></div></section>`
      }
    </div>
  `;
}

function userRow(user) {
  const tags = userLinks(user);
  return `
    <tr>
      <td><strong>${esc(user.nome || "-")}</strong></td>
      <td>${esc(user.numero || "-")}</td>
      <td><div class="table-tags"><span class="chip">${esc(titleize(user.setor || "sem_setor"))}</span></div></td>
      <td>${tags.length ? `<div class="table-tags">${tags.map((t) => `<span class="chip is-accent">${esc(t)}</span>`).join("")}</div>` : `<span class="muted">Sem vinculo direto</span>`}</td>
      <td>${esc(dateText(user.updated_at || user.created_at))}</td>
      <td><div class="inline-actions"><button class="btn btn-secondary btn-small" data-action="show-edit-user" data-user-number="${escAttr(user.numero)}" type="button">Editar</button><button class="btn btn-danger btn-small" data-action="delete-user" data-user-number="${escAttr(user.numero)}" type="button">Apagar</button></div></td>
    </tr>
  `;
}

function showCreateMessageModal() {
  openModal({
    title: "Nova mensagem",
    subtitle: "Crie um texto novo e ja coloque no modulo certo.",
    content: `
      <form id="message-create-form">
        <div class="field-grid">
          <div class="field">
            <label for="message-key">Chave</label>
            <input id="message-key" name="chave" placeholder="ex: suporte_inicial" required />
            <p class="helper">Use letras, numeros e underline.</p>
          </div>
          <div class="field">
            <label for="message-title">Titulo</label>
            <input id="message-title" name="titulo" placeholder="ex: Suporte inicial" required />
          </div>
          <div class="field">
            <label for="message-module">Modulo</label>
            <input id="message-module" name="modulo" list="message-modules" placeholder="ex: ti" required />
            <datalist id="message-modules">${modules().map((m) => `<option value="${escAttr(m)}"></option>`).join("")}</datalist>
          </div>
          <div class="field">
            <label for="message-description">Descricao</label>
            <input id="message-description" name="descricao" placeholder="Pra que essa mensagem serve" />
          </div>
          <div class="field is-full">
            <label for="message-content">Conteudo</label>
            <textarea id="message-content" name="conteudo" spellcheck="false" required></textarea>
            <p class="helper">Variaveis: <code>{saudacao}</code> <code>{nome}</code> <code>{cancelar}</code></p>
          </div>
        </div>
        <div class="form-actions" style="margin-top:22px;justify-content:flex-end;">
          <button class="btn btn-secondary" data-action="close-modal" type="button">Cancelar</button>
          <button class="btn btn-primary" type="submit">Criar mensagem</button>
        </div>
      </form>
    `,
  });
}

function showCreateFlowModal() {
  openModal({
    title: "Novo fluxo",
    subtitle: "Monte a conversa e depois vincule por setor, numero ou admin.",
    content: `
      <form id="flow-create-form">
        <div class="field-grid">
          <div class="field">
            <label for="flow-name">Nome do fluxo</label>
            <input id="flow-name" name="nome" placeholder="ex: Suporte TI" required />
          </div>
          <div class="field">
            <label for="flow-trigger">Palavras gatilho</label>
            <input id="flow-trigger" name="gatilho_palavras" placeholder="ex: suporte, ajuda, problema" />
          </div>
          <div class="field is-full">
            <label for="flow-description">Descricao</label>
            <textarea id="flow-description" name="descricao" placeholder="Quando esse fluxo entra"></textarea>
          </div>
        </div>
        <div class="form-actions" style="margin-top:22px;justify-content:flex-end;">
          <button class="btn btn-secondary" data-action="close-modal" type="button">Cancelar</button>
          <button class="btn btn-primary" type="submit">Criar fluxo</button>
        </div>
      </form>
    `,
  });
}

function showEditFlowModal(id) {
  const flow = state.fluxoDetail && Number(state.fluxoDetail.id) === Number(id) ? state.fluxoDetail : flowById(id);
  if (!flow) return toast("Fluxo nao encontrado.", "error");
  openModal({
    title: "Configurar fluxo",
    subtitle: "Ajuste nome, descricao e gatilhos.",
    content: `
      <form id="flow-edit-form">
        <input type="hidden" name="flow_id" value="${escAttr(flow.id)}" />
        <div class="field-grid">
          <div class="field">
            <label for="edit-flow-name">Nome do fluxo</label>
            <input id="edit-flow-name" name="nome" value="${escAttr(flow.nome || "")}" required />
          </div>
          <div class="field">
            <label for="edit-flow-trigger">Palavras gatilho</label>
            <input id="edit-flow-trigger" name="gatilho_palavras" value="${escAttr(flow.gatilho_palavras || "")}" />
          </div>
          <div class="field is-full">
            <label for="edit-flow-description">Descricao</label>
            <textarea id="edit-flow-description" name="descricao">${esc(flow.descricao || "")}</textarea>
          </div>
        </div>
        <div class="form-actions" style="margin-top:22px;justify-content:flex-end;">
          <button class="btn btn-secondary" data-action="close-modal" type="button">Cancelar</button>
          <button class="btn btn-primary" type="submit">Salvar fluxo</button>
        </div>
      </form>
    `,
  });
}

function nextOptRow(opt = {}) {
  optRowIndex += 1;
  const id = optRowIndex;
  const steps = Array.isArray(state.fluxoDetail?.etapas) ? state.fluxoDetail.etapas : [];
  return `
    <div class="option-row" data-option-row="${escAttr(id)}">
      <input type="text" name="option-texto" value="${escAttr(opt.texto || "")}" placeholder="Texto que o usuario digita" />
      <select name="option-proxima">
        <option value="fim"${!opt.proxima_etapa || opt.proxima_etapa === "fim" ? " selected" : ""}>fim</option>
        ${steps.map((s) => `<option value="${escAttr(s.chave || "")}"${opt.proxima_etapa === s.chave ? " selected" : ""}>${esc(s.chave || "")}</option>`).join("")}
      </select>
      <input type="text" name="option-final" value="${escAttr(opt.mensagem_final || "")}" placeholder="Mensagem final opcional" />
      <button class="btn btn-danger btn-small" data-action="remove-option-row" type="button">Remover</button>
    </div>
  `;
}

function showStepModal(step = null) {
  if (!state.fluxoDetail) return toast("Abra um fluxo antes de criar etapas.", "error");
  optRowIndex = 0;
  const editing = !!step;
  const opts = parseList(step?.opcoes);
  openModal({
    title: editing ? "Editar etapa" : "Nova etapa",
    subtitle: "Use a chave inicio na primeira etapa.",
    wide: true,
    content: `
      <form id="step-form">
        <input type="hidden" name="step_id" value="${escAttr(step?.id || "")}" />
        <input type="hidden" name="ordem" value="${escAttr(step?.ordem ?? state.fluxoDetail.etapas?.length ?? 0)}" />
        <div class="field-grid">
          <div class="field">
            <label for="step-key">Chave</label>
            <input id="step-key" name="chave" value="${escAttr(step?.chave || "")}" placeholder="ex: inicio, atendimento, fim" required />
          </div>
          <div class="field">
            <label for="step-final">Tipo</label>
            <label style="display:flex;align-items:center;gap:10px;"><input id="step-final" name="eh_final" type="checkbox"${bool(step?.eh_final) ? " checked" : ""} /> Esta etapa encerra a conversa</label>
          </div>
          <div class="field is-full">
            <label for="step-message">Mensagem do bot</label>
            <textarea id="step-message" name="mensagem" required>${esc(step?.mensagem || "")}</textarea>
          </div>
          <div class="field is-full" id="step-options-section">
            <div class="section-header">
              <div><label style="display:block;">Opcoes de resposta</label><p class="helper">Cada opcao aponta para a proxima etapa ou para o fim.</p></div>
              <button class="btn btn-secondary btn-small" data-action="add-option-row" type="button">Adicionar opcao</button>
            </div>
            <div class="option-rows" id="option-rows">${(opts.length ? opts : [{}]).map((o) => nextOptRow(o)).join("")}</div>
          </div>
        </div>
        <div class="form-actions" style="margin-top:22px;justify-content:flex-end;">
          <button class="btn btn-secondary" data-action="close-modal" type="button">Cancelar</button>
          <button class="btn btn-primary" type="submit">${editing ? "Salvar etapa" : "Criar etapa"}</button>
        </div>
      </form>
    `,
  });
  toggleStepOptions();
}

function linkForm(flowId = "", link = null) {
  const flowOptions = state.fluxos.map((f) => `<option value="${escAttr(f.id)}"${Number(f.id) === Number(link?.fluxo_id || flowId) ? " selected" : ""}>${esc(f.nome)}</option>`).join("");
  const type = link?.tipo || "setor";
  return `
    <form id="link-form">
      <input type="hidden" name="link_id" value="${escAttr(link?.id || "")}" />
      <div class="field-grid">
        <div class="field">
          <label for="link-flow">Fluxo</label>
          <select id="link-flow" name="fluxo_id" required><option value="">Selecione um fluxo</option>${flowOptions}</select>
        </div>
        <div class="field">
          <label for="link-type">Tipo de vinculo</label>
          <select id="link-type" name="tipo">
            <option value="setor"${type === "setor" ? " selected" : ""}>Setor</option>
            <option value="numero"${type === "numero" ? " selected" : ""}>Numero</option>
            <option value="admin"${type === "admin" ? " selected" : ""}>Admin</option>
          </select>
        </div>
        <div class="field${type === "setor" ? "" : " hidden"}" id="link-field-setor">
          <label for="link-setor">Setor</label>
          <select id="link-setor" name="setor_valor">
            <option value="TI"${normSetor(link?.valor) === "TI" ? " selected" : ""}>TI</option>
            <option value="CONTROLE DE QUALIDADE"${normSetor(link?.valor) === "CONTROLE DE QUALIDADE" ? " selected" : ""}>Controle de qualidade</option>
            <option value="ADMIN"${normSetor(link?.valor) === "ADMIN" ? " selected" : ""}>Admin</option>
          </select>
        </div>
        <div class="field${type === "numero" ? "" : " hidden"}" id="link-field-numero">
          <label for="link-numero">Numero</label>
          <input id="link-numero" name="numero_valor" value="${escAttr(type === "numero" ? link?.valor || "" : "")}" placeholder="5575999999999" />
        </div>
        <div class="field${type === "admin" ? "" : " hidden"}" id="link-field-admin">
          <label>Regra de admin</label>
          <div class="chip-row"><span class="chip is-primary">Aplica a todos os admins configurados.</span></div>
        </div>
        <div class="field is-full">
          <label for="link-note">Observacao</label>
          <textarea id="link-note" name="observacao">${esc(link?.observacao || "")}</textarea>
        </div>
        <div class="field is-full">
          <label style="display:flex;align-items:center;gap:10px;"><input name="ativo" type="checkbox"${link ? (bool(link.ativo) ? " checked" : "") : " checked"} /> Deixar este vinculo ligado</label>
        </div>
      </div>
      <div class="form-actions" style="margin-top:22px;justify-content:flex-end;">
        <button class="btn btn-secondary" data-action="close-modal" type="button">Cancelar</button>
        <button class="btn btn-primary" type="submit">Salvar vinculo</button>
      </div>
    </form>
  `;
}

function showCreateLinkModal(flowId = "") {
  openModal({
    title: "Novo vinculo",
    subtitle: "Defina quem entra direto neste fluxo.",
    content: linkForm(flowId),
  });
  toggleLinkFields();
}

function showEditLinkModal(id) {
  const link = state.vinculos.find((v) => Number(v.id) === Number(id));
  if (!link) return toast("Vinculo nao encontrado.", "error");
  openModal({
    title: "Editar vinculo",
    subtitle: "Ajuste o destino sem recriar tudo.",
    content: linkForm("", link),
  });
  toggleLinkFields();
}

function showUserModal(user = null) {
  const editing = !!user;
  openModal({
    title: editing ? "Editar usuario" : "Novo usuario",
    subtitle: "Cadastre o contato e o setor.",
    content: `
      <form id="user-form">
        <div class="field-grid">
          <div class="field">
            <label for="user-number">Numero</label>
            <input id="user-number" name="numero" value="${escAttr(user?.numero || "")}" placeholder="5575999999999" ${editing ? "readonly" : ""} required />
          </div>
          <div class="field">
            <label for="user-name">Nome</label>
            <input id="user-name" name="nome" value="${escAttr(user?.nome || "")}" required />
          </div>
          <div class="field">
            <label for="user-sector">Setor</label>
            <select id="user-sector" name="setor">
              <option value="TI"${normSetor(user?.setor) === "TI" ? " selected" : ""}>TI</option>
              <option value="CONTROLE DE QUALIDADE"${normSetor(user?.setor) === "CONTROLE DE QUALIDADE" ? " selected" : ""}>Controle de qualidade</option>
              <option value="ADMIN"${normSetor(user?.setor) === "ADMIN" ? " selected" : ""}>Admin</option>
            </select>
          </div>
        </div>
        <div class="form-actions" style="margin-top:22px;justify-content:flex-end;">
          <button class="btn btn-secondary" data-action="close-modal" type="button">Cancelar</button>
          <button class="btn btn-primary" type="submit">${editing ? "Salvar usuario" : "Criar usuario"}</button>
        </div>
      </form>
    `,
  });
}

function toggleLinkFields() {
  const type = document.getElementById("link-type");
  if (!type) return;
  const value = type.value;
  document.getElementById("link-field-setor")?.classList.toggle("hidden", value !== "setor");
  document.getElementById("link-field-numero")?.classList.toggle("hidden", value !== "numero");
  document.getElementById("link-field-admin")?.classList.toggle("hidden", value !== "admin");
}

function toggleStepOptions() {
  const check = document.getElementById("step-final");
  const box = document.getElementById("step-options-section");
  if (!check || !box) return;
  box.classList.toggle("hidden", check.checked);
}

function collectOptRows() {
  return Array.from(document.querySelectorAll("[data-option-row]"))
    .map((row) => ({
      texto: row.querySelector('[name="option-texto"]')?.value.trim() || "",
      proxima_etapa: row.querySelector('[name="option-proxima"]')?.value || "fim",
      mensagem_final: row.querySelector('[name="option-final"]')?.value.trim() || "",
    }))
    .filter((o) => o.texto);
}

async function openFlow(id) {
  state.section = "fluxos";
  state.fluxoSelected = Number(id);
  renderLoading("Abrindo o fluxo...");
  try {
    state.fluxoDetail = await api(`${API}/bot-fluxos/${id}`);
    updateChrome();
    render();
  } catch (e) {
    state.fluxoSelected = null;
    state.fluxoDetail = null;
    updateChrome();
    render();
    toast(e.message, "error");
  }
}

function closeFlowEditor() {
  state.fluxoSelected = null;
  state.fluxoDetail = null;
  render();
}

async function saveMessageInline(key) {
  const input = document.getElementById(`msg-${domId(key)}`);
  if (!input) return;
  const updated = await api(`${API}/bot-mensagens/${encodeURIComponent(key)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conteudo: input.value }),
  });
  const idx = state.mensagens.findIndex((m) => m.chave === key);
  if (idx >= 0) state.mensagens[idx] = updated;
  toast("Mensagem salva.");
  render();
}

async function resetMessageInline(key) {
  const updated = await api(`${API}/bot-mensagens/${encodeURIComponent(key)}/resetar`, { method: "POST" });
  const idx = state.mensagens.findIndex((m) => m.chave === key);
  if (idx >= 0) state.mensagens[idx] = updated;
  toast("Mensagem resetada.");
  render();
}

async function deleteMessageInline(key) {
  if (!window.confirm(`Apagar a mensagem ${key}?`)) return;
  await api(`${API}/bot-mensagens/${encodeURIComponent(key)}`, { method: "DELETE" });
  state.mensagens = state.mensagens.filter((m) => m.chave !== key);
  toast("Mensagem apagada.");
  render();
}

async function toggleFlow(id, next) {
  const flow = flowById(id);
  if (!flow) return;
  await api(`${API}/bot-fluxos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nome: flow.nome,
      descricao: flow.descricao || "",
      gatilho_palavras: flow.gatilho_palavras || "",
      ativo: Number(next),
    }),
  });
  await loadAll({ silent: true, keepFlow: !!state.fluxoSelected });
  toast(Number(next) ? "Fluxo ligado." : "Fluxo desligado.");
}

async function removeFlow(id) {
  const flow = flowById(id);
  if (!window.confirm(`Apagar o fluxo ${flow?.nome || id}?`)) return;
  await api(`${API}/bot-fluxos/${id}`, { method: "DELETE" });
  if (Number(state.fluxoSelected) === Number(id)) {
    state.fluxoSelected = null;
    state.fluxoDetail = null;
  }
  await loadAll({ silent: true });
  toast("Fluxo apagado.");
}

async function removeStep(id) {
  if (!state.fluxoDetail) return;
  if (!window.confirm("Apagar esta etapa?")) return;
  await api(`${API}/bot-fluxos/${state.fluxoDetail.id}/etapas/${id}`, { method: "DELETE" });
  await loadAll({ silent: true, keepFlow: true });
  toast("Etapa apagada.");
}

async function toggleLink(id, next) {
  const link = state.vinculos.find((v) => Number(v.id) === Number(id));
  if (!link) return;
  await api(`${API}/bot-vinculos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fluxo_id: link.fluxo_id,
      tipo: link.tipo,
      valor: link.valor,
      observacao: link.observacao || "",
      ativo: Number(next),
    }),
  });
  await loadAll({ silent: true, keepFlow: !!state.fluxoSelected });
  toast(Number(next) ? "Vinculo ligado." : "Vinculo desligado.");
}

async function removeLink(id) {
  const link = state.vinculos.find((v) => Number(v.id) === Number(id));
  if (!window.confirm(`Apagar o vinculo ${linkTypeLabel(link?.tipo)} ${linkValueLabel(link || {})}?`)) return;
  await api(`${API}/bot-vinculos/${id}`, { method: "DELETE" });
  await loadAll({ silent: true, keepFlow: !!state.fluxoSelected });
  toast("Vinculo apagado.");
}

async function removeUser(numero) {
  const user = state.usuarios.find((u) => u.numero === numero);
  if (!window.confirm(`Apagar o usuario ${user?.nome || numero}?`)) return;
  await api(`${API}/bot-wausers/${encodeURIComponent(numero)}`, { method: "DELETE" });
  await loadAll({ silent: true, keepFlow: !!state.fluxoSelected });
  toast("Usuario apagado.");
}

function onClick(event) {
  const nav = event.target.closest("[data-nav]");
  if (nav) {
    setSection(nav.dataset.nav);
    return;
  }

  const btn = event.target.closest("[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  if (action === "close-modal") return closeModal();
  if (action === "reload") return loadAll().catch((e) => renderError(e.message));
  if (action === "show-create-message") return showCreateMessageModal();
  if (action === "show-create-flow") return showCreateFlowModal();
  if (action === "show-create-link") return showCreateLinkModal(btn.dataset.flowId || "");
  if (action === "show-create-user") return showUserModal();
  if (action === "set-message-module") {
    state.messageModule = btn.dataset.module || "all";
    return render();
  }
  if (action === "toggle-preview") {
    const key = btn.dataset.key;
    state.previewOpen[key] = !state.previewOpen[key];
    const preview = document.getElementById(`preview-${domId(key)}`);
    const input = document.getElementById(`msg-${domId(key)}`);
    if (preview && input) {
      preview.classList.toggle("is-open", state.previewOpen[key]);
      preview.textContent = previewText(input.value);
      btn.textContent = state.previewOpen[key] ? "Esconder preview" : "Abrir preview";
      return;
    }
    return render();
  }
  if (action === "save-message") return saveMessageInline(btn.dataset.key).catch((e) => toast(e.message, "error"));
  if (action === "reset-message") return resetMessageInline(btn.dataset.key).catch((e) => toast(e.message, "error"));
  if (action === "delete-message") return deleteMessageInline(btn.dataset.key).catch((e) => toast(e.message, "error"));
  if (action === "open-flow") return openFlow(btn.dataset.flowId);
  if (action === "close-flow-editor") return closeFlowEditor();
  if (action === "show-edit-flow") return showEditFlowModal(btn.dataset.flowId);
  if (action === "toggle-flow") return toggleFlow(btn.dataset.id, btn.dataset.next).catch((e) => toast(e.message, "error"));
  if (action === "delete-flow") return removeFlow(btn.dataset.flowId).catch((e) => toast(e.message, "error"));
  if (action === "show-create-step") return showStepModal();
  if (action === "show-edit-step") {
    const step = state.fluxoDetail?.etapas?.find((s) => Number(s.id) === Number(btn.dataset.stepId));
    return step ? showStepModal(step) : toast("Etapa nao encontrada.", "error");
  }
  if (action === "delete-step") return removeStep(btn.dataset.stepId).catch((e) => toast(e.message, "error"));
  if (action === "add-option-row") {
    document.getElementById("option-rows")?.insertAdjacentHTML("beforeend", nextOptRow());
    return;
  }
  if (action === "remove-option-row") return btn.closest("[data-option-row]")?.remove();
  if (action === "show-edit-link") return showEditLinkModal(btn.dataset.linkId);
  if (action === "toggle-link") return toggleLink(btn.dataset.id, btn.dataset.next).catch((e) => toast(e.message, "error"));
  if (action === "delete-link") return removeLink(btn.dataset.linkId).catch((e) => toast(e.message, "error"));
  if (action === "show-edit-user") {
    const user = state.usuarios.find((u) => u.numero === btn.dataset.userNumber);
    return user ? showUserModal(user) : toast("Usuario nao encontrado.", "error");
  }
  if (action === "delete-user") return removeUser(btn.dataset.userNumber).catch((e) => toast(e.message, "error"));
}

function onInput(event) {
  const area = event.target.closest("[data-message-input]");
  if (!area) return;
  const key = area.dataset.messageInput;
  if (!state.previewOpen[key]) return;
  const preview = document.getElementById(`preview-${domId(key)}`);
  if (preview) preview.textContent = previewText(area.value);
}

function onChange(event) {
  if (event.target.id === "link-type") toggleLinkFields();
  if (event.target.id === "step-final") toggleStepOptions();
}

async function onSubmit(event) {
  const form = event.target;
  event.preventDefault();

  if (form.id === "message-create-form") {
    try {
      const payload = {
        chave: form.chave.value.trim().replace(/\s+/g, "_"),
        titulo: form.titulo.value.trim(),
        descricao: form.descricao.value.trim(),
        modulo: form.modulo.value.trim(),
        conteudo: form.conteudo.value,
      };
      await api(`${API}/bot-mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      closeModal();
      state.section = "mensagens";
      state.messageModule = payload.modulo || "all";
      await loadAll({ silent: true });
      toast("Mensagem criada.");
    } catch (e) {
      toast(e.message, "error");
    }
    return;
  }

  if (form.id === "flow-create-form") {
    try {
      const created = await api(`${API}/bot-fluxos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome.value.trim(),
          descricao: form.descricao.value.trim(),
          gatilho_palavras: form.gatilho_palavras.value.trim(),
        }),
      });
      closeModal();
      state.section = "fluxos";
      state.fluxoSelected = created.id;
      await loadAll({ silent: true, keepFlow: true });
      toast("Fluxo criado.");
    } catch (e) {
      toast(e.message, "error");
    }
    return;
  }

  if (form.id === "flow-edit-form") {
    try {
      const id = form.flow_id.value;
      const base = state.fluxoDetail && Number(state.fluxoDetail.id) === Number(id) ? state.fluxoDetail : flowById(id);
      await api(`${API}/bot-fluxos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: form.nome.value.trim(),
          descricao: form.descricao.value.trim(),
          gatilho_palavras: form.gatilho_palavras.value.trim(),
          ativo: base?.ativo ?? 1,
        }),
      });
      closeModal();
      state.section = "fluxos";
      state.fluxoSelected = Number(id);
      await loadAll({ silent: true, keepFlow: true });
      toast("Fluxo atualizado.");
    } catch (e) {
      toast(e.message, "error");
    }
    return;
  }

  if (form.id === "step-form") {
    if (!state.fluxoDetail) return toast("Abra um fluxo antes de salvar etapas.", "error");
    try {
      const payload = {
        chave: form.chave.value.trim(),
        mensagem: form.mensagem.value,
        eh_final: form.eh_final.checked,
        ordem: Number(form.ordem.value || 0),
        opcoes: form.eh_final.checked ? [] : collectOptRows(),
      };
      if (form.step_id.value) {
        await api(`${API}/bot-fluxos/${state.fluxoDetail.id}/etapas/${form.step_id.value}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast("Etapa atualizada.");
      } else {
        await api(`${API}/bot-fluxos/${state.fluxoDetail.id}/etapas`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast("Etapa criada.");
      }
      closeModal();
      await loadAll({ silent: true, keepFlow: true });
    } catch (e) {
      toast(e.message, "error");
    }
    return;
  }

  if (form.id === "link-form") {
    try {
      const type = form.tipo.value;
      const payload = {
        fluxo_id: Number(form.fluxo_id.value),
        tipo: type,
        valor: type === "numero" ? digits(form.numero_valor.value) : type === "setor" ? form.setor_valor.value : "ADMIN",
        observacao: form.observacao.value.trim(),
        ativo: form.ativo.checked ? 1 : 0,
      };
      if (form.link_id.value) {
        await api(`${API}/bot-vinculos/${form.link_id.value}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast("Vinculo atualizado.");
      } else {
        await api(`${API}/bot-vinculos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        toast("Vinculo criado.");
      }
      closeModal();
      await loadAll({ silent: true, keepFlow: !!state.fluxoSelected });
    } catch (e) {
      toast(e.message, "error");
    }
    return;
  }

  if (form.id === "user-form") {
    try {
      await api(`${API}/bot-wausers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numero: digits(form.numero.value),
          nome: form.nome.value.trim(),
          setor: form.setor.value,
        }),
      });
      closeModal();
      state.section = "usuarios";
      await loadAll({ silent: true, keepFlow: !!state.fluxoSelected });
      toast("Usuario salvo.");
    } catch (e) {
      toast(e.message, "error");
    }
  }
}

document.addEventListener("click", onClick);
document.addEventListener("input", onInput);
document.addEventListener("change", onChange);
document.addEventListener("submit", onSubmit);

loadAll()
  .then(() => updateChrome())
  .catch((e) => {
    updateChrome();
    renderError(e.message);
  });
