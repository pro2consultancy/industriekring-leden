// Kleine hulpfuncties voor alle pagina's.
window.ik = (() => {
  const TZ = "Europe/Amsterdam";
  const fmt = (o) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, ...o });
  return {
    esc(s) {
      return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    },
    datumLang: (iso) => fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso)),
    tijd: (iso) => fmt({ hour: "2-digit", minute: "2-digit" }).format(new Date(iso)),
    dag: (iso) => fmt({ day: "numeric" }).format(new Date(iso)),
    maand: (iso) => fmt({ month: "short" }).format(new Date(iso)).replace(".", ""),
    el(tag, attrs = {}, ...kinderen) {
      const e = document.createElement(tag);
      for (const [k, v] of Object.entries(attrs)) {
        if (v === false || v === null || v === undefined) continue;
        if (k === "class") e.className = v;
        else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
        else if (k === "text") e.textContent = v;
        else e.setAttribute(k, v === true ? "" : v);
      }
      for (const k of kinderen.flat()) if (k !== null && k !== undefined && k !== false) e.append(k instanceof Node ? k : document.createTextNode(String(k)));
      return e;
    },
    initialen(naam) {
      return String(naam ?? "").trim().split(/\s+/).filter((w) => /^[A-Za-zÀ-ÿ0-9]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";
    },
    // De kaart zoals op de pagina Onze leden. d = { naam, branche, kort, foto (url), pas ('passend'|'vullend'), partner }
    lidkaart(d) {
      const { el } = window.ik;
      const beeld = el("div", { class: `beeld${d.foto ? ` foto${d.pas === "vullend" ? "" : " passend"}` : ""}` },
        el("span", { class: "mono", "aria-hidden": "true", text: window.ik.initialen(d.naam) }),
        d.partner || d.branche ? el("span", { class: "branche", text: d.partner ? "Partner" : d.branche }) : null);
      if (d.foto) beeld.style.backgroundImage = `url(${JSON.stringify(String(d.foto))})`;
      return el("article", { class: `lidkaart${d.partner ? " partner" : ""}` }, beeld,
        el("div", { class: "tekst" }, el("h3", { text: d.naam || "Bedrijfsnaam" }),
          el("p", { text: d.kort || "Hier komt je korte tekst." }), el("span", { class: "meer", text: "Lees verder" })));
    },
    async functie(naam, { method = "GET", query = "", body, token } = {}) {
      const headers = { "content-type": "application/json" };
      if (token) headers.authorization = `Bearer ${token}`;
      const r = await fetch(`${window.IKTA.functies}/${naam}${query}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
      let data = {};
      try { data = await r.json(); } catch { /* geen json */ }
      if (!r.ok || data.ok === false) throw Object.assign(new Error(data.fout || "Er ging iets mis. Probeer het later opnieuw."), { status: r.status, data });
      return data;
    },
  };
})();
