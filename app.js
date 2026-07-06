const API = "https://rickandmortyapi.com/api";
const LS = {
  users: "rms_users",
  session: "rms_session",
  theme: "rms_theme",
  charOverrides: "rms_char_overrides",
  epOverrides: "rms_ep_overrides",
};

/* ---------- utilidades ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, attrs = {}, ...children) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) n.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null) continue;
    n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return n;
};
const store = {
  get(k, def = null) {
    try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; }
  },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); },
};
const toast = (msg) => {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2200);
};

/* Carga dinámica y eficiente de archivos HTML */
const templateCache = {};
async function fetchText(url) {
  if (templateCache[url]) return templateCache[url];
  const r = await fetch(url);
  const txt = await r.text();
  templateCache[url] = txt;
  return txt;
}

/* ---------- tema ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  store.set(LS.theme, theme);
}
function toggleTheme() {
  applyTheme((store.get(LS.theme) || "light") === "light" ? "dark" : "light");
}
applyTheme(store.get(LS.theme) || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

/* ---------- auth simulada ---------- */
function getUsers() { return store.get(LS.users, []); }
function saveUsers(u) { store.set(LS.users, u); }
function currentUser() { return store.get(LS.session); }
function login(email, pass) {
  const u = getUsers().find((x) => x.email === email.toLowerCase() && x.pass === pass);
  if (!u) throw new Error("Credenciales inválidas");
  store.set(LS.session, { email: u.email, name: u.name });
  return u;
}
function register(name, email, pass) {
  email = email.toLowerCase();
  const users = getUsers();
  if (users.some((x) => x.email === email)) throw new Error("Ese correo ya está registrado");
  users.push({ name, email, pass });
  saveUsers(users);
  store.set(LS.session, { email, name });
}
function resetPassword(email, newPass) {
  email = email.toLowerCase();
  const users = getUsers();
  const u = users.find((x) => x.email === email);
  if (!u) throw new Error("No existe una cuenta con ese correo");
  u.pass = newPass;
  saveUsers(users);
}
function logout() {
  if (window.confirm("¿Estás seguro de que deseas cerrar sesión?")) {
    localStorage.removeItem(LS.session);
    navigate("#/login");
  }
}

/* ---------- API (Caché en memoria para evitar saturar LocalStorage) ---------- */
let memoryCharCache = null;
let memoryEpCache = null;

async function fetchAllCharacters() {
  if (memoryCharCache) return memoryCharCache;
  try {
    let page = 1, out = [];
    while (true) {
      const r = await fetch(`${API}/character?page=${page}`);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      out = out.concat(data.results);
      if (!data.info.next) break;
      page++;
      if (page > 50) break;
    }
    memoryCharCache = out;
    return out;
  } catch (e) {
    if (memoryCharCache) { toast("Modo offline activo"); return memoryCharCache; }
    throw e;
  }
}

async function fetchAllEpisodes() {
  if (memoryEpCache) return memoryEpCache;
  try {
    let page = 1, out = [];
    while (true) {
      const r = await fetch(`${API}/episode?page=${page}`);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const data = await r.json();
      out = out.concat(data.results);
      if (!data.info.next) break;
      page++;
      if (page > 20) break;
    }
    memoryEpCache = out;
    return out;
  } catch (e) {
    if (memoryEpCache) { toast("Modo offline activo"); return memoryEpCache; }
    throw e;
  }
}

/* ---------- overrides (edición local) ---------- */
function getOverrides(kind) {
  return store.get(kind === "char" ? LS.charOverrides : LS.epOverrides, {});
}
function saveOverride(kind, id, patch) {
  const map = getOverrides(kind);
  map[id] = { ...(map[id] || {}), ...patch };
  store.set(kind === "char" ? LS.charOverrides : LS.epOverrides, map);
}
function applyOverrides(items, kind) {
  const map = getOverrides(kind);
  return items.map((it) => (map[it.id] ? { ...it, ...map[it.id] } : it));
}

/* ---------- router ---------- */
const routes = {
  "/login": renderLogin,
  "/register": renderRegister,
  "/forgot": renderForgot,
  "/characters": () => renderList("char"),
  "/episodes": () => renderList("ep"),
  "/character": renderCharacterDetail,
  "/episode": renderEpisodeDetail,
};
function navigate(hash) { location.hash = hash; }
function currentPath() {
  const h = location.hash.replace(/^#/, "") || "/login";
  const [path, ...rest] = h.split("/").filter(Boolean);
  return { path: "/" + (path || ""), rest };
}
function router() {
  const { path } = currentPath();
  const authed = !!currentUser();
  const publicRoutes = ["/login", "/register", "/forgot"];
  if (!authed && !publicRoutes.includes(path)) return navigate("#/login");
  if (authed && publicRoutes.includes(path)) return navigate("#/characters");
  const handler = routes[path] || routes["/login"];
  handler();
}
window.addEventListener("hashchange", router);
window.addEventListener("online", () => toast("Conectado"));
window.addEventListener("offline", () => toast("Sin conexión — modo offline"));

/* ---------- pantallas auth ---------- */
async function renderLogin() {
  const app = $("#app");
  // CAMBIO: Quitamos la barra "/" inicial para que sea una ruta relativa
  app.innerHTML = await fetchText("login.html"); 
  const form = $("#login-form", app);
  
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = $("#login-email", form).value.trim();
    const pass = $("#login-pass", form).value;
    const msg = $("#login-error", form);
    try {
      login(email, pass);
      router();
    } catch (err) {
      msg.textContent = err.message;
    }
  });
}

async function renderRegister() {
  const app = $("#app");
  app.innerHTML = await fetchText("register.html");
  const form = $("#register-form", app);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#reg-name", form).value.trim();
    const email = $("#reg-email", form).value.trim();
    const pass = $("#reg-pass", form).value;
    const msg = $("#reg-error", form);
    try {
      if (!name) throw new Error("El nombre es obligatorio");
      register(name, email, pass);
      toast("Cuenta creada");
      router();
    } catch (err) {
      msg.textContent = err.message;
    }
  });
}

async function renderForgot() {
  const app = $("#app");
  app.innerHTML = await fetchText("forgot.html");
  const form = $("#forgot-form", app);

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = $("#for-email", form).value.trim();
    const pass = $("#for-pass", form).value;
    const msg = $("#for-error", form);
    try {
      resetPassword(email, pass);
      toast("Contraseña actualizada");
      navigate("#/login");
    } catch (err) {
      msg.textContent = err.message;
    }
  });
}

/* ---------- shell autenticado ---------- */
async function appShell(title, content) {
  const app = $("#app");
  const user = currentUser();
  const { path } = currentPath();

  app.innerHTML = await fetchText("shell.html");

  if (path === "/characters" || path === "/character") $("#nav-chars", app).classList.add("active");
  if (path === "/episodes" || path === "/episode") $("#nav-eps", app).classList.add("active");

  $("#shell-title", app).textContent = title;
  $("#user-chip", app).textContent = `👋 ${user?.name || user?.email || "Usuario"}`;

  $("#btn-theme-side", app).addEventListener("click", toggleTheme);
  $("#btn-theme-head", app).addEventListener("click", toggleTheme);
  $("#btn-logout-side", app).addEventListener("click", logout);

  const sidebar = $("#sidebar", app);
  const backdrop = $("#sidebar-backdrop", app);
  const toggleMenu = () => {
    const isOpen = sidebar.classList.toggle("open");
    backdrop.style.display = isOpen ? "block" : "none";
  };

  $("#btn-menu", app).addEventListener("click", toggleMenu);
  backdrop.addEventListener("click", toggleMenu);

  if (!navigator.onLine) {
    const banner = el("div", { class: "offline-banner" }, "⚠ Sin conexión — se muestran datos en caché");
    app.insertBefore(banner, app.firstChild);
  }

  const main = $("#shell-main", app);
  if (typeof content === "string") main.innerHTML = content;
  else main.appendChild(content);
}

/* ---------- vista tipo lista ---------- */
const listState = {
  char: { search: "", sortKey: "id", sortDir: "asc", page: 1 },
  ep:   { search: "", sortKey: "id", sortDir: "asc", page: 1 },
};
const PAGE_SIZE = 20;

async function renderList(kind) {
  const isChar = kind === "char";
  const title = isChar ? "Personajes" : "Episodios";
  const container = el("div", {}, el("div", { class: "empty" }, "Cargando..."));
  await appShell(title, container);

  let items;
  try {
    items = isChar ? await fetchAllCharacters() : await fetchAllEpisodes();
  } catch (e) {
    container.innerHTML = "";
    container.appendChild(el("div", { class: "empty" }, "No se pudieron cargar los datos. " + e.message));
    return;
  }
  items = applyOverrides(items, kind);

  const state = listState[kind];
  const cols = isChar
    ? [
        { key: "id", label: "ID" },
        { key: "name", label: "Nombre" },
        { key: "species", label: "Especie" },
        { key: "gender", label: "Género" },
        { key: "type", label: "Tipo" },
        { key: "status", label: "Estado" },
      ]
    : [
        { key: "id", label: "ID" },
        { key: "name", label: "Nombre" },
        { key: "air_date", label: "Fecha de emisión" },
        { key: "episode", label: "Código" },
      ];

  const searchInput = el("input", {
    type: "search", placeholder: `Buscar por nombre...`, value: state.search,
    "aria-label": "Buscar",
    oninput: (e) => { state.search = e.target.value; state.page = 1; rerender(); }
  });

  const toolbar = el("div", { class: "toolbar" }, searchInput);
  const tableWrap = el("div", { class: "table-wrap" });
  const pager = el("div", { class: "pagination" });

  container.innerHTML = "";
  container.append(toolbar, tableWrap, pager);

  function rerender() {
    const q = state.search.trim().toLowerCase();
    let filtered = q ? items.filter((it) => (it.name || "").toLowerCase().includes(q)) : items.slice();
    filtered.sort((a, b) => {
      const av = a[state.sortKey], bv = b[state.sortKey];
      const na = typeof av === "number" ? av : String(av ?? "").toLowerCase();
      const nb = typeof bv === "number" ? bv : String(bv ?? "").toLowerCase();
      if (na < nb) return state.sortDir === "asc" ? -1 : 1;
      if (na > nb) return state.sortDir === "asc" ? 1 : -1;
      return 0;
    });

    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    const thead = el("thead", {},
      el("tr", {}, ...cols.map((c) => {
        const isSorted = state.sortKey === c.key;
        return el("th", {
          class: isSorted ? "sorted" : "",
          onclick: () => {
            if (state.sortKey === c.key) state.sortDir = state.sortDir === "asc" ? "desc" : "asc";
            else { state.sortKey = c.key; state.sortDir = "asc"; }
            rerender();
          }
        }, c.label, el("span", { class: "sort-indicator" }, isSorted ? (state.sortDir === "asc" ? "▲" : "▼") : "↕"));
      }))
    );

    const tbody = el("tbody", {},
      ...pageItems.map((it) =>
        el("tr", { onclick: () => navigate(`#/${isChar ? "character" : "episode"}/${it.id}`) },
          ...cols.map((c) => {
            if (isChar && c.key === "status") {
              const s = (it.status || "").toLowerCase();
              return el("td", {}, el("span", { class: "badge " + (s === "alive" ? "alive" : s === "dead" ? "dead" : "") }, it.status || "—"));
            }
            const val = it[c.key];
            const text = (val !== undefined && val !== null && val !== "") ? String(val) : "—";
            return el("td", {}, text);
          })
        )
      )
    );

    tableWrap.innerHTML = "";
    tableWrap.appendChild(el("table", { class: "data" }, thead, tbody));
    if (!pageItems.length) tableWrap.appendChild(el("div", { class: "empty" }, "Sin resultados"));

    pager.innerHTML = "";
    pager.append(
      el("button", { class: "btn ghost sm", disabled: state.page <= 1 ? "" : null, onclick: () => { if (state.page > 1) { state.page--; rerender(); } } }, "◀"),
      `Página ${state.page} de ${pages} — ${total} resultados`,
      el("button", { class: "btn ghost sm", disabled: state.page >= pages ? "" : null, onclick: () => { if (state.page < pages) { state.page++; rerender(); } } }, "▶"),
    );
  }
  rerender();
}

/* ---------- detalle / edición ---------- */
async function renderCharacterDetail() {
  const { rest } = currentPath();
  const id = rest[0];
  if (!id) return navigate("#/characters");
  await appShell("Detalle del personaje", el("div", { class: "empty" }, "Cargando..."));

  let item;
  try {
    const all = await fetchAllCharacters();
    item = applyOverrides(all, "char").find((x) => String(x.id) === String(id));
  } catch {}
  if (!item) return appShell("Detalle del personaje", el("div", { class: "empty" }, "No encontrado"));
  
  await renderDetail("char", item);
}

async function renderEpisodeDetail() {
  const { rest } = currentPath();
  const id = rest[0];
  if (!id) return navigate("#/episodes");
  await appShell("Detalle del episodio", el("div", { class: "empty" }, "Cargando..."));

  let item;
  try {
    const all = await fetchAllEpisodes();
    item = applyOverrides(all, "ep").find((x) => String(x.id) === String(id));
  } catch {}
  if (!item) return appShell("Detalle del episodio", el("div", { class: "empty" }, "No encontrado"));
  
  await renderDetail("ep", item);
}

async function renderDetail(kind, item) {
  const isChar = kind === "char";
  const title = isChar ? "Detalle del personaje" : "Detalle del episodio";
  const editable = isChar ? ["name", "species", "gender", "type", "status"] : ["name", "air_date", "episode"];
  const labels = {
    name: "Nombre", species: "Especie", gender: "Género", type: "Tipo",
    status: "Estado", air_date: "Fecha de emisión", episode: "Código",
  };

  let editing = false;
  const container = el("div", {});
  const back = el("a", { href: `#/${isChar ? "characters" : "episodes"}`, class: "btn ghost sm" }, "← Volver");

  async function render() {
    container.innerHTML = "";
    const infoEntries = [["ID", String(item.id)]];
    
    for (const k of editable) {
      const label = labels[k] || k;
      if (editing) {
        const inp = el("input", { type: "text", value: item[k] ?? "" });
        inp.dataset.key = k;
        infoEntries.push([label, inp]);
      } else {
        infoEntries.push([label, item[k] ?? "—"]);
      }
    }
    if (isChar) {
      infoEntries.push(["Origen", item.origin?.name ?? "—"]);
      infoEntries.push(["Ubicación", item.location?.name ?? "—"]);
    }

    const dl = el("dl", { class: "info" });
    for (const [k, v] of infoEntries) {
      dl.append(el("dt", {}, k), el("dd", {}, typeof v === "string" ? v : v));
    }

    const img = isChar && item.image
      ? el("img", { class: "avatar", src: item.image, alt: item.name })
      : el("div", { class: "avatar", style: "aspect-ratio:1;background:var(--surface-2);display:grid;place-items:center;border-radius:12px;font-size:48px" }, "🎬");

    const actions = el("div", { class: "detail-actions" }, back);
    if (!editing) {
      actions.append(el("button", { class: "btn", onclick: () => { editing = true; render(); } }, "✏️  Editar"));
    } else {
      actions.append(
        el("button", { class: "btn", onclick: () => {
          const inputs = container.querySelectorAll("input[data-key]");
          const patch = {};
          inputs.forEach((i) => { patch[i.dataset.key] = i.value; });
          Object.assign(item, patch);
          saveOverride(kind, item.id, patch);
          editing = false;
          toast("Cambios guardados");
          render();
        }}, "💾 Guardar"),
        el("button", { class: "btn ghost", onclick: () => { editing = false; render(); } }, "Cancelar")
      );
    }

    const grid = el("div", { class: "detail-grid" }, el("div", {}, img), el("div", {}, el("h3", {}, item.name || "Sin nombre"), dl, actions));
    container.innerHTML = "";
    container.appendChild(grid);
  }
  
  await render();
  await appShell(title, container);
}

/* ---------- boot ---------- */
router();