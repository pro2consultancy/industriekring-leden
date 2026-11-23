// Beheer: berichten per kanaal (onderdeel 8). Ontwerp: stap 9 van de klikbare demo; schrijfstijl:
// content/sprekersavond-teksten.md. Lezen gaat via RLS, alles wat schrijft via de functie 'berichten'.
// Er gaat nooit iets vanzelf de deur uit: elk kanaal plaats je met twee klikken, direct of op een moment.
window.ikBerichten = (c) => {
  const { sb, inhoud, el, melding, kaart, pil, veld, id, tekstInvoer, bezig, bevestigKnop, bewaar, neem, naarLokaal, datumLang, tijd } = c;
  const KANALEN = [["mail", "Mail aan leden"], ["linkedin", "LinkedIn"], ["facebook", "Facebook"], ["whatsapp", "WhatsApp"]];
  const NAAM = Object.fromEntries(KANALEN);
  const VIERKANT = ["facebook", "whatsapp"];
  const VIA_BUFFER = ["linkedin", "facebook"];
  const STATUS = { concept: ["concept", ""], bezig: ["bezig", "let"], ingepland: ["ingepland", "let"], geplaatst: ["geplaatst", "goed"], mislukt: ["mislukt", "fout"] };
  const statusPil = (s) => pil(...(STATUS[s] ?? [s, ""]));
  const wanneer = (iso) => new Date(iso).toLocaleString("nl-NL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Amsterdam" });

  async function berichtActie(body) {
    const { data: { session } } = await sb.auth.getSession();
    return window.ik.functie("berichten", { method: "POST", body, token: session?.access_token });
  }
  let stand = null;
  const laatsteTab = {}; // per bericht: welk kanaal open stond, zodat het na verversen open blijft
  async function laadStand() {
    try { stand = await berichtActie({ actie: "stand" }); } catch { stand = null; }
    return stand;
  }
  const beeldUrl = (pad) => (pad && stand?.beeld_basis ? stand.beeld_basis + pad : null);
  // Wat er bovenaan staat: testmodus, schakelaar, sleutel. Bepaalt of plaatsen echt plaatst.
  function standMelding() {
    if (!stand) return melding("fout", "De stand van de berichten is niet op te halen. Probeer het later opnieuw.");
    const delen = [];
    if (stand.testmodus) delen.push("Testmodus staat aan: mail gaat alleen naar de testadressen en er gaat niets naar Buffer. Bij plaatsen zie je wat er geplaatst zou worden.");
    else if (!stand.buffer_aan) delen.push("\"Berichten plaatsen via Buffer\" staat uit: voor LinkedIn en Facebook zie je bij plaatsen alleen wat er geplaatst zou worden. Mail aan leden gaat wel echt.");
    if (!stand.buffer_gekoppeld) delen.push("Buffer is nog niet gekoppeld (de sleutel ontbreekt). LinkedIn- en Facebook-teksten kun je al klaarzetten.");
    return delen.length ? melding("let", delen.join(" ")) : null;
  }

  // ------------------------------------------------------------------ overzicht
  async function lijstScherm() {
    const [{ data: berichten, error }, { data: kanalen }] = await Promise.all([
      sb.from("berichten").select("id, titel, aangemaakt_op, aangemaakt_door, bijeenkomsten(titel, start)").order("aangemaakt_op", { ascending: false }).limit(100),
      sb.from("bericht_kanalen").select("bericht_id, kanaal, status, gepland_op"),
      laadStand(),
    ]);
    if (error) return inhoud.replaceChildren(melding("fout", "Berichten laden lukte niet."));
    const per = new Map();
    for (const k of kanalen ?? []) per.set(k.bericht_id, [...(per.get(k.bericht_id) ?? []), k]);
    const rij = (b) => el("tr", { class: "klik", onclick: () => (location.hash = `bericht/${b.id}`) },
      el("td", {}, el("strong", { text: b.titel }), el("div", { class: "hint", text: b.bijeenkomsten ? `Bij ${b.bijeenkomsten.titel}, ${datumLang(b.bijeenkomsten.start)}` : "Los bericht" })),
      el("td", {}, el("div", { class: "balk", style: "margin:0;gap:6px" }, (per.get(b.id) ?? []).sort((x, y) => KANALEN.findIndex((k) => k[0] === x.kanaal) - KANALEN.findIndex((k) => k[0] === y.kanaal))
        .map((k) => el("span", { class: "hint", style: "display:inline-flex;gap:4px;align-items:center" }, NAAM[k.kanaal], statusPil(k.status))))),
      el("td", { text: `${new Date(b.aangemaakt_op).toLocaleDateString("nl-NL")}${b.aangemaakt_door ? ` · ${b.aangemaakt_door}` : ""}` }));
    inhoud.replaceChildren(kaart(
      el("div", { class: "balk" }, el("h1", { text: "Berichten", style: "margin:0;flex:1" }), el("button", { class: "knop", type: "button", onclick: () => (location.hash = "bericht/nieuw"), text: "Nieuw bericht" })),
      el("p", { text: "Eén bericht, per kanaal de juiste tekst en het juiste beeld: mail aan leden, LinkedIn, Facebook en WhatsApp. Een bericht bij een bijeenkomst maak je ook vanuit die bijeenkomst." }),
      standMelding(),
      el("div", { class: "scroll", style: "margin-top:12px" }, el("table", { class: "tabel" },
        el("thead", {}, el("tr", {}, ["Bericht", "Kanalen", "Gemaakt"].map((h) => el("th", { text: h })))),
        el("tbody", {}, (berichten ?? []).length ? berichten.map(rij) : el("tr", {}, el("td", { colspan: 3, text: "Nog geen berichten." })))))));
  }

  // ------------------------------------------------------------------ één bericht
  async function berichtScherm(bid, bijeenkomstVoor) {
    const nieuw = bid === "nieuw";
    await laadStand();
    const { data: bijeenkomsten } = await sb.from("bijeenkomsten").select("id, titel, start, status").neq("status", "geannuleerd").order("start", { ascending: false }).limit(40);
    const S = { id: null, bijeenkomst_id: bijeenkomstVoor ?? null, titel: "", tekst: "", sfeer: "standaard", foto: null, fotoNieuw: undefined, kanalen: {}, rijen: {}, beeld: null, tab: null, opgeslagen: null, beelden: {} };
    if (!nieuw) {
      const [{ data: ber }, { data: rijen }] = await Promise.all([
        sb.from("berichten").select("*").eq("id", bid).maybeSingle(),
        sb.from("bericht_kanalen").select("*").eq("bericht_id", bid),
      ]);
      if (!ber) return inhoud.replaceChildren(melding("fout", "Bericht niet gevonden."));
      Object.assign(S, { id: ber.id, bijeenkomst_id: ber.bijeenkomst_id, titel: ber.titel, tekst: ber.tekst, sfeer: ber.sfeer, beelden: { vierkant: ber.beeld_vierkant, liggend: ber.beeld_liggend } });
      if (ber.foto_pad) { try { S.foto = await window.ikBeeld.laadAfbeelding(beeldUrl(ber.foto_pad)); } catch { S.foto = null; } }
      for (const r of rijen ?? []) { S.rijen[r.kanaal] = r; S.kanalen[r.kanaal] = { tekst: r.tekst, met_beeld: r.met_beeld }; }
    } else if (bijeenkomstVoor) {
      const b = (bijeenkomsten ?? []).find((x) => x.id === bijeenkomstVoor);
      if (b) S.titel = b.titel.slice(0, 80);
    }
    const inhoudSleutel = () => JSON.stringify([S.titel, S.tekst, S.sfeer, S.bijeenkomst_id, S.fotoNieuw === undefined ? "zelfde" : S.fotoNieuw ? "nieuw" : "weg"]);
    const kanaalSleutel = () => JSON.stringify(KANALEN.map(([k]) => S.kanalen[k] ? [k, S.kanalen[k].tekst, S.kanalen[k].met_beeld] : null));
    if (S.id && laatsteTab[S.id]) S.tab = laatsteTab[S.id];
    S.opgeslagen = nieuw ? null : { inhoud: inhoudSleutel(), kanalen: kanaalSleutel() };
    const gewijzigd = () => !S.opgeslagen || S.opgeslagen.inhoud !== inhoudSleutel() || S.opgeslagen.kanalen !== kanaalSleutel();
    const vastgezet = () => Object.values(S.rijen).some((r) => r.status === "ingepland" || r.status === "bezig");

    async function haalTeksten() {
      const r = await berichtActie({ actie: "teksten", bijeenkomst_id: S.bijeenkomst_id, titel: S.titel, tekst: S.tekst });
      S.beeld = r.beeld;
      return r.teksten;
    }
    try { await haalTeksten(); } catch (e) { return inhoud.replaceChildren(melding("fout", e.message)); }

    // ---------------------------------------------- linkerkolom: het bericht
    const uitBoven = el("div", { "aria-live": "polite" }, neem("bericht"));
    const fBij = el("select", { id: id() }, el("option", { value: "", text: "Los bericht (geen bijeenkomst)" }),
      (bijeenkomsten ?? []).map((b) => el("option", { value: b.id, text: `${b.titel} · ${new Date(b.start).toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" })}${b.status === "concept" ? " (concept)" : ""}`, selected: b.id === S.bijeenkomst_id })));
    const fTitel = tekstInvoer(S.titel, { maxlength: 80, required: true });
    const fTekst = el("textarea", { id: id(), maxlength: 300 }, S.tekst);
    const teller = el("span", { class: "hint", style: "justify-self:end" });
    const sfeerKnop = (s, t) => el("button", { type: "button", class: "knop tweede klein", "data-sfeer": s, text: t });
    const sferen = [sfeerKnop("standaard", "Standaard"), sfeerKnop("kerst", "Kerst")];
    const sfeerHint = el("span", { class: "hint" });
    const fFoto = el("input", { type: "file", id: id(), accept: "image/jpeg,image/png,image/webp", class: "verborgen" });
    const fotoWeg = el("button", { type: "button", class: "knop stil klein", text: "Foto weghalen" });
    const kanaalVinkjes = KANALEN.map(([k, naam]) => {
      const rij = S.rijen[k];
      const v = el("input", { type: "checkbox", id: id(), checked: !!S.kanalen[k] });
      const vast = rij && rij.status !== "concept";
      if (vast) v.disabled = true; // al geplaatst, ingepland of mislukt: blijft bij het bericht
      const bk = (stand?.buffer?.kanalen ?? []).filter((x) => x.service === k);
      let hint = "";
      if (VIA_BUFFER.includes(k)) {
        if (stand?.buffer) hint = bk.length ? `via Buffer: ${bk.map((x) => x.naam).join(", ")}` : "niet gekoppeld in Buffer";
        else hint = "Buffer nog niet gekoppeld; tekst klaarzetten kan";
      } else if (k === "mail") hint = `${stand?.ontvangers ?? "?"} adressen`;
      else hint = "zelf plaatsen in de community";
      const label = el("label", { class: "vink", style: "display:flex;gap:10px;align-items:flex-start" }, v,
        el("span", {}, el("strong", { text: naam }), el("span", { class: "hint", style: "display:block", text: hint }), rij && rij.status !== "concept" ? statusPil(rij.status) : null));
      // Toon alleen wat er in Buffer is: een kanaal dat Buffer niet heeft, verdwijnt (tenzij het al bij dit bericht hoort).
      if (VIA_BUFFER.includes(k) && stand?.buffer && !bk.length && !S.kanalen[k]) label.classList.add("verborgen");
      v.addEventListener("change", async () => {
        if (v.checked) {
          try {
            const t = await haalTeksten();
            S.kanalen[k] = { tekst: t[k], met_beeld: true };
          } catch (e) { v.checked = false; return uitBoven.replaceChildren(melding("fout", e.message)); }
          S.tab = k;
        } else { delete S.kanalen[k]; if (S.tab === k) S.tab = null; }
        teken();
      });
      return label;
    });

    fTitel.addEventListener("input", () => { S.titel = fTitel.value; tekenBeeld(); knoppen(); });
    fTekst.addEventListener("input", () => { S.tekst = fTekst.value; teller.textContent = `${S.tekst.length} / 300`; tekenBeeld(); knoppen(); });
    fBij.addEventListener("change", async () => {
      S.bijeenkomst_id = fBij.value || null;
      try { await haalTeksten(); } catch (e) { uitBoven.replaceChildren(melding("fout", e.message)); }
      tekenBeeld(); knoppen();
    });
    for (const k of sferen) k.addEventListener("click", () => { S.sfeer = k.dataset.sfeer; teken(); });
    fFoto.addEventListener("change", async () => {
      const f = fFoto.files?.[0];
      if (!f) return;
      try { const r = await window.ikBeeld.fotoUitBestand(f); S.foto = r.img; S.fotoNieuw = r.b64; teken(); }
      catch (e) { uitBoven.replaceChildren(melding("fout", e.message || "Deze foto kon niet worden gelezen.")); }
      fFoto.value = "";
    });
    fotoWeg.addEventListener("click", () => { S.foto = null; S.fotoNieuw = null; teken(); });
    teller.textContent = `${S.tekst.length} / 300`;

    const opslaan = el("button", { type: "button", class: "knop", text: "Opslaan" });
    const verwijderen = S.id ? bevestigKnop("Bericht verwijderen", "Zeker? Klik nogmaals", async () => {
      try { await berichtActie({ actie: "verwijderen", bericht_id: S.id }); location.hash = "berichten"; }
      catch (e) { uitBoven.replaceChildren(melding("fout", e.message)); }
    }, "knop stil klein") : null;
    if (verwijderen && Object.values(S.rijen).some((r) => r.status !== "concept")) verwijderen.classList.add("verborgen");
    opslaan.addEventListener("click", bezig(opslaan, async () => {
      if (!S.titel.trim()) return uitBoven.replaceChildren(melding("fout", "Geef het bericht een titel."));
      if (!S.tekst.trim()) return uitBoven.replaceChildren(melding("fout", "Schrijf de tekst in twee zinnen."));
      const inhoudAnders = !S.opgeslagen || S.opgeslagen.inhoud !== inhoudSleutel();
      const body = { actie: "opslaan", bericht_id: S.id ?? undefined, bijeenkomst_id: S.bijeenkomst_id, titel: S.titel, tekst: S.tekst, sfeer: S.sfeer, kanalen: S.kanalen };
      if (inhoudAnders || !S.beelden.vierkant || !S.beelden.liggend) {
        const t = beeldTeksten();
        body.beelden = {
          vierkant: window.ikBeeld.naarJpeg(await window.ikBeeld.teken("vierkant", t, S.foto)),
          liggend: window.ikBeeld.naarJpeg(await window.ikBeeld.teken("liggend", t, S.foto)),
        };
        if (S.fotoNieuw !== undefined) body.foto = S.fotoNieuw;
      }
      try {
        const r = await berichtActie(body);
        bewaar("bericht", "goed", "Opgeslagen.");
        if (!S.id) location.hash = `bericht/${r.bericht_id}`; else berichtScherm(S.id);
      } catch (e) { uitBoven.replaceChildren(melding("fout", e.message)); }
    }));

    const links = el("div", { class: "stapel" },
      veld("Bij bijeenkomst", fBij, "Bij een bijeenkomst komen datum en aanmelden er vanzelf bij."),
      veld("Titel", fTitel),
      el("div", { class: "veld" }, el("label", { for: fTekst.id, text: "In twee zinnen" }), fTekst, teller),
      el("div", { class: "veld" }, el("span", { class: "groeplabel", text: "Sfeer van het beeld" }), el("div", { class: "balk", style: "margin:0" }, ...sferen), sfeerHint),
      el("div", { class: "veld" }, el("span", { class: "groeplabel", text: "Eigen foto" }),
        el("div", { class: "balk", style: "margin:0" }, fFoto, el("label", { for: fFoto.id, class: "knop tweede klein", text: "Kies een foto" }), fotoWeg),
        el("span", { class: "hint", text: "Een foto van een eigen bijeenkomst of locatie neemt de plek van het motief in. Geen foto's waar leden op staan zonder hun toestemming: het beeld is openbaar." })),
      el("fieldset", { style: "border:0;padding:0;margin:0" }, el("legend", { class: "groeplabel", text: "Kanalen", style: "margin-bottom:6px" }),
        el("div", { class: "stapel", style: "gap:10px" }, kanaalVinkjes),
        el("span", { class: "hint", text: "Er staat niets vooraf aangevinkt. Per kanaal pas je rechts de tekst aan." })),
      el("div", { class: "balk" }, opslaan, verwijderen),
      uitBoven);

    // ---------------------------------------------- rechterkolom: per kanaal
    const rechts = el("div", { class: "stapel" });
    const beeldVak = { vierkant: el("div", { class: "beeldvak vierkant" }), liggend: el("div", { class: "beeldvak liggend" }) };
    let tekenTimer = null;
    function beeldTeksten() {
      return { titel: S.titel || "Titel van het bericht", tekst: S.tekst || "Hier komt de tekst in twee zinnen.", label: S.beeld?.label ?? "Nieuws",
        actie: S.beeld?.actie ?? null, dag: S.beeld?.dag ?? null, maand: S.beeld?.maand ?? null, sfeer: S.sfeer };
    }
    function tekenBeeld() {
      clearTimeout(tekenTimer);
      tekenTimer = setTimeout(async () => {
        for (const soort of ["vierkant", "liggend"]) {
          const cv = await window.ikBeeld.teken(soort, beeldTeksten(), S.foto);
          cv.setAttribute("role", "img");
          cv.setAttribute("aria-label", `${soort === "vierkant" ? "Vierkant" : "Liggend"} beeld: ${S.titel}`);
          beeldVak[soort].replaceChildren(cv);
        }
      }, 150);
    }

    function kanaalPaneel(k) {
      const rij = S.rijen[k], kv = S.kanalen[k];
      const bewerkbaar = !rij || rij.status === "concept" || rij.status === "mislukt";
      const uit = el("div", { "aria-live": "polite" }, neem(`kanaal-${k}`));
      const toon = (soort, tekst) => uit.replaceChildren(melding(soort, tekst));
      const herlaad = (soort, tekst) => { bewaar(`kanaal-${k}`, soort, tekst); laatsteTab[S.id] = k; berichtScherm(S.id); };
      const ta = el("textarea", { id: id(), maxlength: 3000, style: "min-height:200px" }, kv.tekst);
      if (!bewerkbaar) ta.readOnly = true;
      ta.addEventListener("input", () => { kv.tekst = ta.value; knoppen(); });
      const metBeeld = el("input", { type: "checkbox", id: id(), checked: kv.met_beeld, disabled: !bewerkbaar });
      metBeeld.addEventListener("change", () => { kv.met_beeld = metBeeld.checked; teken(); });
      const terug = el("button", { type: "button", class: "knop stil klein", text: "Standaardtekst terugzetten", disabled: !bewerkbaar });
      terug.addEventListener("click", bezig(terug, async () => { try { kv.tekst = (await haalTeksten())[k]; ta.value = kv.tekst; knoppen(); } catch (e) { toon("fout", e.message); } }));
      const soort = VIERKANT.includes(k) ? "vierkant" : "liggend";
      const beeld = k === "mail"
        ? (S.foto && kv.met_beeld ? el("p", { class: "hint", text: "De eigen foto staat bovenaan de mail. Zonder foto heeft de mail geen beeld; de kopbalk draagt de huisstijl." }) : el("p", { class: "hint", text: "De mail heeft geen beeld (alleen een eigen foto komt erin). Kopbalk, aanhef, datum en de knop zet het sjabloon er zelf omheen." }))
        : (kv.met_beeld ? beeldVak[soort] : el("p", { class: "hint", text: "Zonder beeld." }));

      // Status en reden
      const regels = [];
      if (rij) {
        let wat = "";
        if (rij.status === "ingepland") wat = rij.gepland_op ? `Ingepland voor ${wanneer(rij.gepland_op)}.` : "Wordt geplaatst.";
        if (rij.status === "geplaatst") wat = `Geplaatst${rij.geplaatst_op ? ` op ${wanneer(rij.geplaatst_op)}` : ""}${rij.bevestigd_door ? ` (bevestigd door ${rij.bevestigd_door})` : ""}.`;
        if (rij.status === "bezig") wat = "Bezig met plaatsen…";
        if (rij.status !== "concept") regels.push(el("div", { class: "balk", style: "margin:0" }, statusPil(rij.status), wat ? el("span", { text: wat }) : null,
          rij.link ? el("a", { href: rij.link, target: "_blank", rel: "noopener", text: "Bekijken" }) : null));
        if (rij.reden) regels.push(melding(rij.status === "mislukt" ? "fout" : "let", rij.reden));
        if (rij.proef_verslag && rij.status === "concept" && !uit.firstChild) regels.push(melding("let", `Laatste proef (${wanneer(rij.proef_op)}): ${rij.proef_verslag}`));
      }

      // Acties
      const acties = [];
      const mag = stand?.mag?.[k] !== false;
      const opgeslagen = !!S.id && !gewijzigd();
      if (k === "whatsapp") {
        const kopie = el("button", { type: "button", class: "knop tweede klein", text: "Tekst kopiëren" });
        kopie.addEventListener("click", async () => { try { await navigator.clipboard.writeText(kv.tekst); toon("goed", "Tekst gekopieerd. Plak hem met het beeld in de aankondigingsgroep van de community."); } catch { toon("fout", "Kopiëren lukte niet in deze browser; selecteer de tekst en kopieer hem zelf."); } });
        const opslaanBeeld = el("button", { type: "button", class: "knop tweede klein", text: "Beeld opslaan" });
        opslaanBeeld.addEventListener("click", async () => {
          const cv = await window.ikBeeld.teken("vierkant", beeldTeksten(), S.foto);
          const a = el("a", { href: cv.toDataURL("image/jpeg", 0.9), download: `${(S.titel || "bericht").replace(/[^\w-]+/g, "-").toLowerCase()}-vierkant.jpg` });
          document.body.append(a); a.click(); a.remove();
        });
        acties.push(kopie, kv.met_beeld ? opslaanBeeld : null);
        if (S.id && mag) {
          const geplaatst = rij?.status === "geplaatst";
          const markeer = el("button", { type: "button", class: geplaatst ? "knop stil klein" : "knop klein", text: geplaatst ? "Toch niet geplaatst" : "Ik heb het geplaatst" });
          markeer.addEventListener("click", bezig(markeer, async () => {
            try { await berichtActie({ actie: "whatsapp_geplaatst", bericht_id: S.id, terug: geplaatst }); herlaad("goed", geplaatst ? "Teruggezet." : "Gemarkeerd als geplaatst."); }
            catch (e) { toon("fout", e.message); }
          }));
          if (!opgeslagen) markeer.disabled = true;
          acties.push(markeer);
        }
        regels.push(el("p", { class: "hint", text: "WhatsApp staat automatisch plaatsen in een community niet toe: kopieer de tekst, sla het beeld op en plaats beide in de aankondigingsgroep." }));
      } else if (bewerkbaar) {
        if (!mag) {
          const namen = (stand?.plaatsers?.[k] ?? []).map((e) => c.beheerderNaam(e)).filter(Boolean);
          regels.push(melding("let", `Plaatsen op ${NAAM[k]} mag alleen ${namen.length ? namen.join(", ") : "wie daarvoor is aangewezen bij Instellingen → Berichten"}.`));
        } else {
          // Moment: direct of op een gekozen tijd.
          const direct = el("button", { type: "button", class: "knop tweede klein", "aria-pressed": "true", text: "Direct" });
          const later = el("button", { type: "button", class: "knop tweede klein", "aria-pressed": "false", text: "Op een moment" });
          const moment = el("input", { type: "datetime-local", id: id(), class: "verborgen", min: naarLokaal(new Date(Date.now() + 10 * 60_000).toISOString()) });
          const kies = (isLater) => { direct.setAttribute("aria-pressed", String(!isLater)); later.setAttribute("aria-pressed", String(isLater)); moment.classList.toggle("verborgen", !isLater); };
          direct.addEventListener("click", () => kies(false)); later.addEventListener("click", () => kies(true));
          let bkKeuze = null;
          const bk = (stand?.buffer?.kanalen ?? []).filter((x) => x.service === k);
          if (VIA_BUFFER.includes(k) && bk.length > 1) {
            bkKeuze = el("select", { id: id() }, bk.map((x) => el("option", { value: x.id, text: `${x.naam}${x.soort ? ` (${x.soort})` : ""}`, selected: x.id === rij?.buffer_kanaal_id })));
          }
          const label = k === "mail" ? `Versturen naar ${stand?.ontvangers ?? "alle"} leden` : `Plaatsen op ${NAAM[k]}`;
          const doe = async (soortActie) => {
            const m = later.getAttribute("aria-pressed") === "true" ? moment.value : "";
            if (soortActie === "plaatsen" && later.getAttribute("aria-pressed") === "true" && !m) return toon("fout", "Kies het moment, of kies Direct.");
            try {
              const r = await berichtActie({ actie: soortActie, bericht_id: S.id, kanaal: k, bevestigd: true, moment: m ? new Date(m).toISOString() : null, buffer_kanaal_id: bkKeuze?.value });
              herlaad(r.proef ? "let" : "goed", r.verslag ?? "Klaar.");
            } catch (e) { toon("fout", e.message); }
          };
          const plaats = bevestigKnop(label, "Zeker? Klik nogmaals om te plaatsen", () => doe("plaatsen"));
          if (!opgeslagen) plaats.disabled = true;
          acties.push(el("div", { class: "stapel", style: "gap:8px;width:100%" },
            el("div", { class: "balk", style: "margin:0" }, el("span", { class: "groeplabel", text: "Wanneer" }), direct, later, moment),
            bkKeuze ? veld("Buffer-kanaal", bkKeuze) : null,
            el("div", { class: "balk", style: "margin:0" }, plaats,
              rij?.status === "mislukt" ? (() => {
                const opnieuw = el("button", { type: "button", class: "knop tweede klein", text: "Opnieuw proberen" });
                opnieuw.addEventListener("click", bezig(opnieuw, () => doe("opnieuw")));
                if (!opgeslagen) opnieuw.disabled = true;
                return opnieuw;
              })() : null)));
        }
        if (k === "mail" && S.id) {
          const proef = el("button", { type: "button", class: "knop tweede klein", text: "Proefmail naar mij" });
          proef.addEventListener("click", bezig(proef, async () => {
            try { const r = await berichtActie({ actie: "proefmail", bericht_id: S.id }); const niet = r.overgeslagen?.length ? ` Niet naar ${r.overgeslagen.join(", ")}: afgemeld voor nieuwsberichten.` : ""; toon(r.aan.length ? "goed" : "let", (r.aan.length ? `Proefmail verstuurd naar ${r.aan.join(", ")}.` : r.overgeslagen?.length ? "Niet verstuurd." : "Niet verstuurd (mail nog niet gekoppeld?).") + niet); }
            catch (e) { toon("fout", e.message); }
          }));
          if (!opgeslagen) proef.disabled = true;
          acties.push(proef);
        }
        if (!opgeslagen) regels.push(el("p", { class: "hint", text: "Sla het bericht eerst op; daarna kun je plaatsen." }));
      } else if (rij?.status === "ingepland" && mag) {
        acties.push(bevestigKnop("Intrekken", "Zeker? Klik nogmaals om in te trekken", async () => {
          try { await berichtActie({ actie: "intrekken", bericht_id: S.id, kanaal: k }); herlaad("goed", "Ingetrokken; het kanaal staat weer op concept."); }
          catch (e) { toon("fout", e.message); }
        }, "knop tweede klein"));
      }
      return el("div", { class: "stapel" },
        beeld,
        k !== "mail" ? el("label", { class: "vink", style: "display:flex;gap:8px;align-items:center" }, metBeeld, `Met ${soort === "vierkant" ? "vierkant" : "liggend"} beeld`) : (S.foto ? el("label", { class: "vink", style: "display:flex;gap:8px;align-items:center" }, metBeeld, "Met de eigen foto bovenaan") : null),
        veld(k === "mail" ? "Tekst van de mail (onder de aanhef)" : `Tekst voor ${NAAM[k]}`, ta),
        el("div", { class: "balk", style: "margin:0" }, terug, el("span", { class: "hint", text: `${kv.tekst.length} tekens` })),
        ...regels, el("div", { class: "balk" }, ...acties.filter(Boolean)), uit);
    }

    function knoppen() {
      const vast = vastgezet();
      for (const x of [fTitel, fTekst, fBij]) x.disabled = vast;
      opslaan.textContent = gewijzigd() ? "Opslaan" : "Opgeslagen";
      opslaan.classList.toggle("tweede", !gewijzigd());
    }
    function teken() {
      for (const k of sferen) { k.setAttribute("aria-pressed", String(k.dataset.sfeer === S.sfeer)); k.disabled = !!S.foto || vastgezet(); }
      sfeerHint.textContent = S.foto ? "Met een eigen foto vervalt het motief; de rest van de opbouw blijft gelijk." : "Een sfeer is een vaste variant uit de huisstijl. Het motief wisselt; kleuren, letters en opbouw blijven gelijk.";
      fotoWeg.classList.toggle("verborgen", !S.foto);
      const gekozen = KANALEN.map(([k]) => k).filter((k) => S.kanalen[k]);
      if (!gekozen.includes(S.tab)) S.tab = gekozen[0] ?? null;
      const tabs = el("div", { class: "kanalen", role: "group", "aria-label": "Kanaal" }, gekozen.map((k) => {
        const b = el("button", { type: "button", "aria-pressed": String(k === S.tab) }, NAAM[k], S.rijen[k] && S.rijen[k].status !== "concept" ? el("span", { style: "margin-left:6px" }, statusPil(S.rijen[k].status)) : null);
        b.addEventListener("click", () => { S.tab = k; if (S.id) laatsteTab[S.id] = k; teken(); });
        return b;
      }));
      rechts.replaceChildren(...(gekozen.length
        ? [standMelding(), vastgezet() ? melding("let", "Er staat een kanaal ingepland: titel, tekst en beeld liggen vast tot het geplaatst is of je het intrekt.") : null, tabs, kanaalPaneel(S.tab)]
        : [standMelding(), el("div", { class: "melding" }, "Kies links een of meer kanalen. Per kanaal zie je hier de tekst en het beeld, en plaats je het bericht.")]).filter(Boolean));
      tekenBeeld();
      knoppen();
    }

    inhoud.replaceChildren(
      el("div", { style: "margin-bottom:12px" }, el("a", { href: "#berichten", text: "← Alle berichten" }), el("h1", { text: nieuw ? "Nieuw bericht" : S.titel, style: "margin:8px 0 0" })),
      kaart(el("div", { class: "bericht-raster" }, links, rechts)));
    teken();
  }

  // ------------------------------------------------------------------ instellingen: Buffer en wie mag plaatsen
  async function instellingenKaart(m, toegestaan) {
    await laadStand();
    const uit = el("div", { "aria-live": "polite" }, neem("berichten"));
    const toon = (soort, tekst) => uit.replaceChildren(melding(soort, tekst));
    const aan = el("select", { id: id() }, [["false", "Uit"], ["true", "Aan: LinkedIn en Facebook gaan echt via Buffer"]].map(([v, t]) => el("option", { value: v, text: t, selected: String(m.buffer_aan === true) === v })));
    const p = m.berichten_plaatsers ?? {};
    const rijen = KANALEN.map(([k, naam]) => {
      const lijst = Array.isArray(p[k]) ? p[k].map((e) => String(e).toLowerCase()) : [];
      const iedereen = el("input", { type: "checkbox", id: id(), checked: lijst.length === 0 });
      const personen = (toegestaan ?? []).map((t) => ({ email: t.email.toLowerCase(), v: el("input", { type: "checkbox", id: id(), checked: lijst.includes(t.email.toLowerCase()) }), naam: t.naam }));
      const lijstVak = el("div", { class: "balk", style: "margin:4px 0 0" }, personen.map((x) => el("label", { style: "display:inline-flex;gap:6px;align-items:center" }, x.v, x.naam)));
      const wissel = () => lijstVak.classList.toggle("verborgen", iedereen.checked);
      iedereen.addEventListener("change", wissel); wissel();
      return { k, iedereen, personen, el: el("tr", {}, el("th", { scope: "row", text: naam }),
        el("td", {}, el("label", { style: "display:inline-flex;gap:6px;align-items:center" }, iedereen, "Elke beheerder"), lijstVak)) };
    });
    const opslaan = el("button", { type: "button", class: "knop klein", text: "Opslaan" });
    opslaan.addEventListener("click", bezig(opslaan, async () => {
      const waarde = Object.fromEntries(rijen.map((r) => [r.k, r.iedereen.checked ? [] : r.personen.filter((x) => x.v.checked).map((x) => x.email)]));
      const leeg = rijen.find((r) => !r.iedereen.checked && waarde[r.k].length === 0);
      if (leeg) return toon("fout", `Kies bij ${NAAM[leeg.k]} wie mag plaatsen, of vink "Elke beheerder" aan.`);
      for (const [sleutel, w] of [["berichten_plaatsers", waarde], ["buffer_aan", aan.value === "true"]]) {
        const { error } = await sb.from("instellingen").update({ waarde: w }).eq("sleutel", sleutel);
        if (error) return toon("fout", `Opslaan van ${sleutel} lukte niet.`);
      }
      toon("goed", "Opgeslagen.");
    }));

    const kanalenLijst = stand?.buffer?.kanalen ?? [];
    const proefKanaal = el("select", { id: id() }, kanalenLijst.map((x) => el("option", { value: x.id, text: `${x.naam} (${x.service})` })));
    const ophalen = el("button", { type: "button", class: "knop tweede klein", text: "Kanalen ophalen uit Buffer" });
    ophalen.addEventListener("click", bezig(ophalen, async () => {
      try {
        const r = await berichtActie({ actie: "kanalen_ophalen" });
        bewaar("berichten", "goed", r.buffer.kanalen.length ? `Gevonden: ${r.buffer.kanalen.map((x) => `${x.naam} (${x.service})`).join(", ")}.` : "Buffer heeft geen LinkedIn- of Facebook-kanaal gekoppeld.");
        c.herteken();
      } catch (e) { toon("fout", e.message); }
    }));
    // Proef in twee stappen: concept in Buffer (met tekst en beeld van een bericht), nakijken in Buffer, weghalen.
    const { data: proefBerichten } = await sb.from("berichten").select("id, titel").order("aangemaakt_op", { ascending: false }).limit(20);
    const proefBericht = el("select", { id: id(), "aria-label": "Tekst en beeld van" }, [el("option", { value: "", text: "vaste proeftekst, zonder beeld" }),
      ...(proefBerichten ?? []).map((x) => el("option", { value: x.id, text: `tekst en beeld van: ${x.titel}` }))]);
    const concept = stand?.proef_concept;
    const proef = bevestigKnop("Proef: concept in Buffer", "Zeker? Er komt een concept in Buffer (niet zichtbaar op LinkedIn of Facebook)", async () => {
      try {
        const r = await berichtActie({ actie: "buffer_proef", bevestigd: true, buffer_kanaal_id: proefKanaal.value, bericht_id: proefBericht.value || null });
        bewaar("berichten", "goed", r.stappen.join(" ")); c.herteken();
      } catch (e) { toon("fout", e.message); }
    }, "knop tweede klein");
    const proefWeg = el("button", { type: "button", class: "knop klein", text: "Proefconcept weghalen uit Buffer" });
    proefWeg.addEventListener("click", bezig(proefWeg, async () => {
      try { const r = await berichtActie({ actie: "buffer_proef_weg" }); bewaar("berichten", "goed", r.uitkomst); c.herteken(); }
      catch (e) { toon("fout", e.message); }
    }));
    const g = stand?.gebruik;
    return kaart(el("h2", { text: "Berichten: Buffer en wie mag plaatsen" }),
      el("p", { text: "LinkedIn en Facebook gaan via Buffer. Er gaat nooit iets vanzelf: een beheerder bevestigt elk bericht met twee klikken. In de testmodus, of met de schakelaar uit, toont het beheer alleen wat er geplaatst zou worden." }),
      el("table", { class: "tabel", style: "margin:8px 0" }, el("tbody", {},
        el("tr", {}, el("th", { scope: "row", text: "Sleutel" }), el("td", {}, stand?.buffer_gekoppeld ? pil("ingesteld", "goed") : pil("ontbreekt", "let"))),
        el("tr", {}, el("th", { scope: "row", text: "Kanalen" }), el("td", { text: stand?.buffer ? (kanalenLijst.length ? kanalenLijst.map((x) => `${x.naam} (${x.service})`).join(", ") : "geen LinkedIn of Facebook") + ` · opgehaald ${new Date(stand.buffer.opgehaald_op).toLocaleString("nl-NL")}` : "nog niet opgehaald" })),
        el("tr", {}, el("th", { scope: "row", text: "Verzoeken" }), el("td", { text: g ? `${g.dertig} in 30 dagen (wij stoppen bij ${g.grenzen.dertigDagen}; Buffer bij 3.000), ${g.dag} vandaag` : "onbekend" })),
        el("tr", {}, el("th", { scope: "row", text: "Ingepland per kanaal" }), el("td", { text: `hooguit ${stand?.max_ingepland ?? 8} tegelijk (Buffer gratis: 10)` })))),
      concept ? el("div", {}, melding("let", `Er staat een proefconcept in Buffer bij ${concept.kanaal} (sinds ${new Date(concept.aangemaakt_op).toLocaleString("nl-NL")}). Kijk het na bij Concepten in Buffer en haal het daarna weg; na twee uur gaat het vanzelf weg.`),
        el("div", { class: "balk" }, proefWeg)) : null,
      el("div", { class: "balk" }, ophalen, kanalenLijst.length && !concept ? [proefKanaal, proefBericht, proef] : null),
      el("h3", { text: "Schakelaar", style: "margin-top:12px" }),
      veld("Berichten plaatsen via Buffer", aan, "Zet pas aan na een geslaagde proef en een proefbericht dat je hebt nagelezen."),
      el("h3", { text: "Wie mag plaatsen", style: "margin-top:12px" }),
      el("div", { class: "scroll" }, el("table", { class: "tabel" }, el("tbody", {}, rijen.map((r) => r.el)))),
      el("div", { class: "balk" }, opslaan), uit);
  }

  return { lijstScherm, berichtScherm, instellingenKaart };
};
