// Beheerscherm voor het bestuur van de Industriekring Ter Apel.
// Lezen en schrijven gaat via Supabase met de sessie van de beheerder (RLS);
// versturen en goedkeuren via de edge-functie 'beheer'.
(() => {
  const ik = window.ik;
  const { el, datumLang, tijd } = ik;
  const sb = window.supabase.createClient(window.IKTA.supabaseUrl, window.IKTA.publishableKey, { auth: { persistSession: true, detectSessionInUrl: true } });
  const inhoud = document.getElementById("inhoud");
  const tabs = document.getElementById("tabs");
  const statusbalk = document.getElementById("statusbalk");
  let sessie = null;
  let status = null;

  // ------------------------------------------------------------------ hulpjes
  // Meldingen die een herteken van het scherm moeten overleven.
  const bewaard = {};
  const bewaar = (plek, soort, tekst) => { bewaard[plek] = [soort, tekst]; };
  const neem = (plek) => { const m = bewaard[plek]; delete bewaard[plek]; return m ? melding(...m) : null; };
  const melding = (soort, tekst) => el("div", { class: `melding ${soort}`, role: soort === "fout" ? "alert" : "status" }, tekst);
  const kaart = (...k) => el("div", { class: "kaart" }, ...k);
  const pil = (tekst, soort = "") => el("span", { class: `pil ${soort}`, text: tekst });
  const veld = (label, invoer, hint) => el("div", { class: "veld" }, el("label", { for: invoer.id, text: label }), invoer, hint ? el("span", { class: "hint", text: hint }) : null);
  let teller = 0;
  const id = () => `v${++teller}`;
  const tekstInvoer = (waarde, attrs = {}) => el("input", { type: "text", id: id(), value: waarde ?? "", ...attrs });
  const naarLokaal = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  const vanLokaal = (v) => (v ? new Date(v).toISOString() : null);
  async function actie(body) {
    const { data: { session } } = await sb.auth.getSession();
    return window.ik.functie("beheer", { method: "POST", body, token: session?.access_token });
  }
  function bezig(knop, fn) {
    return async (...args) => {
      const oud = knop.textContent;
      knop.disabled = true; knop.textContent = "Bezig…";
      try { await fn(...args); } finally { knop.disabled = false; knop.textContent = oud; }
    };
  }
  // Twee keer klikken voor alles wat niet terug te draaien is (geen browserdialoog).
  function bevestigKnop(tekst, vraag, fn, klasse = "knop") {
    const knop = el("button", { type: "button", class: klasse, text: tekst });
    let gewapend = false, timer;
    knop.addEventListener("click", async () => {
      if (!gewapend) {
        gewapend = true; knop.textContent = vraag; knop.classList.add("tweede");
        timer = setTimeout(() => { gewapend = false; knop.textContent = tekst; knop.classList.remove("tweede"); }, 6000);
        return;
      }
      clearTimeout(timer); gewapend = false; knop.classList.remove("tweede");
      await bezig(knop, fn)();
      knop.textContent = tekst;
    });
    return knop;
  }
  function download(naam, tekst, type = "text/csv;charset=utf-8") {
    const a = el("a", { href: URL.createObjectURL(new Blob(["﻿" + tekst], { type })), download: naam });
    document.body.append(a); a.click(); a.remove();
  }
  function downloadBase64(naam, b64, type) {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const a = el("a", { href: URL.createObjectURL(new Blob([bytes], { type })), download: naam });
    document.body.append(a); a.click(); a.remove();
  }
  async function kopieer(tekst) { await navigator.clipboard.writeText(tekst); }
  async function fotoUrl(pad) {
    if (!pad) return null;
    const { data } = await sb.storage.from("profielfotos").createSignedUrl(pad, 600);
    return data?.signedUrl ?? null;
  }
  // Cellen die met = + - @ beginnen zou Excel als formule uitvoeren; een apostrof ervoor maakt er tekst van.
  const cel = (c) => { const s = String(c ?? ""); return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s; };
  const csv = (rijen) => rijen.map((r) => r.map((c) => `"${cel(c).replace(/"/g, '""')}"`).join(";")).join("\r\n");

  // ------------------------------------------------------------------ inloggen
  function inlogScherm(boodschap) {
    tabs.classList.add("verborgen");
    statusbalk.replaceChildren();
    const email = el("input", { type: "email", id: "email", autocomplete: "email", required: true });
    const uit = el("div", { "aria-live": "polite" });
    const knop = el("button", { type: "submit", class: "knop", text: "Stuur mij een inloglink" });
    const form = el("form", {}, veld("Je e-mailadres", email), knop, uit);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      uit.replaceChildren();
      await bezig(knop, async () => {
        const adres = email.value.trim().toLowerCase();
        try { await window.ik.functie("inloggen", { method: "POST", body: { email: adres } }); } catch { /* inloglink hieronder geeft de melding */ }
        const { error } = await sb.auth.signInWithOtp({ email: adres, options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: false } });
        // Zelfde melding of het adres nu wel of geen toegang heeft, zodat niemand kan uitproberen wie beheerder is.
        const geenAccount = error && /signups?|not allowed|not found/i.test(error.message);
        uit.append(error && !geenAccount ? melding("fout", "Versturen lukte niet. Probeer het over een paar minuten opnieuw.") : melding("goed", "Als dit adres toegang heeft, staat er nu een inloglink in je mail. Open die op dit apparaat. Geen mail binnen een paar minuten? Kijk in je spam of vraag een ander bestuurslid."));
      })();
    });
    inhoud.replaceChildren(kaart(el("h1", { text: "Beheer" }), el("p", { text: "Voor het bestuur van de Industriekring. Log in met je e-mailadres; je krijgt een link per mail." }), boodschap ? melding("let", boodschap) : null, form));
  }

  async function start() {
    const { data: { session } } = await sb.auth.getSession();
    sessie = session;
    if (!sessie) return inlogScherm();
    const { data: ik } = await sb.from("beheerders").select("naam").eq("user_id", sessie.user.id).maybeSingle();
    if (!ik) {
      await sb.auth.signOut();
      return inlogScherm("Dit e-mailadres heeft (nog) geen toegang. Vraag een beheerder om je toe te voegen.");
    }
    try { status = await actie({ actie: "status" }); } catch { status = null; }
    const wie = document.getElementById("wie");
    wie.replaceChildren(ik.naam, " · ", el("a", { href: "#", style: "color:inherit", onclick: async (e) => { e.preventDefault(); await sb.auth.signOut(); location.hash = ""; inlogScherm(); }, text: "uitloggen" }));
    tabs.classList.remove("verborgen");
    toonStatus();
    route();
  }

  function toonStatus() {
    const delen = [];
    if (status?.testmodus) delen.push(melding("let", `Testmodus staat aan: mails gaan alleen naar ${status.test_ontvangers.join(", ") || "niemand"}. Uitzetten kan bij Instellingen.`));
    if (status && !status.mail_gekoppeld) delen.push(melding("let", "Mail is nog niet gekoppeld (Brevo). Tot die tijd wordt verzenden alleen gelogd."));
    statusbalk.replaceChildren(...delen.map((d) => el("div", { style: "margin-bottom:10px" }, d)));
  }

  window.addEventListener("hashchange", route);
  function route() {
    if (!sessie) return;
    const [deel, sub] = location.hash.replace(/^#/, "").split("/");
    const actief = `#${deel === "bijeenkomst" || !deel ? "bijeenkomsten" : deel}`;
    for (const a of tabs.querySelectorAll("a")) {
      if (a.getAttribute("href") === actief) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    }
    window.scrollTo(0, 0);
    if (deel === "bijeenkomst") return bijeenkomstScherm(sub);
    if (deel === "leden") return ledenScherm();
    if (deel === "aanvragen") return aanvragenScherm();
    if (deel === "profielen") return profielenScherm(sub);
    if (deel === "instellingen") return instellingenScherm();
    return bijeenkomstenScherm();
  }

  // ------------------------------------------------------------------ bijeenkomsten
  async function bijeenkomstenScherm() {
    const { data, error } = await sb.from("v_bijeenkomsten").select("*").order("start");
    if (error) return inhoud.replaceChildren(melding("fout", "Bijeenkomsten laden lukte niet."));
    const nu = Date.now();
    const rij = (b) => el("tr", { class: "klik", onclick: () => (location.hash = `bijeenkomst/${b.id}`) },
      el("td", {}, el("strong", { text: b.titel }), el("div", { class: "hint", text: [b.locatie, b.programma].filter(Boolean).join(" · ") })),
      el("td", { text: `${datumLang(b.start)} ${tijd(b.start)}` }),
      el("td", {}, pil(b.status, b.status === "gepubliceerd" ? "goed" : b.status === "geannuleerd" ? "fout" : "")),
      el("td", { text: b.aanmeldwijze === "extern" ? "extern" : `${b.personen} / ${b.uitgenodigd}` }),
      el("td", { text: b.verstuurd ? `${b.verstuurd} verstuurd` : "—" }));
    const komend = (data ?? []).filter((b) => new Date(b.eind ?? b.start).getTime() >= nu);
    const voorbij = (data ?? []).filter((b) => new Date(b.eind ?? b.start).getTime() < nu).reverse();
    const tabel = (lijst) => el("div", { class: "scroll" }, el("table", { class: "tabel" },
      el("thead", {}, el("tr", {}, ["Bijeenkomst", "Wanneer", "Status", "Komen / genodigd", "Mail"].map((h) => el("th", { text: h })))),
      el("tbody", {}, lijst.length ? lijst.map(rij) : el("tr", {}, el("td", { colspan: 5, text: "Geen bijeenkomsten." })))));
    inhoud.replaceChildren(kaart(
      el("div", { class: "balk" }, el("h1", { text: "Bijeenkomsten", style: "margin:0;flex:1" }), el("button", { class: "knop", type: "button", onclick: () => (location.hash = "bijeenkomst/nieuw"), text: "Nieuwe bijeenkomst" })),
      el("h2", { text: "Komend" }), tabel(komend),
      voorbij.length ? el("h2", { text: "Geweest", style: "margin-top:24px" }) : null, voorbij.length ? tabel(voorbij) : null));
  }

  async function bijeenkomstScherm(bid) {
    const nieuw = bid === "nieuw";
    let b = { titel: "", soort: "ledenvergadering", start: null, eind: null, programma: "", locatie: "", adres: "", omschrijving: "", aanmeldwijze: "eigen", externe_link: "", externe_tekst: "", aanmelden_tot: null, max_personen: 2, vraag_eten: false, doelgroep: "leden", status: "concept", afbeelding_url: "" };
    if (!nieuw) {
      const { data } = await sb.from("v_bijeenkomsten").select("*").eq("id", bid).maybeSingle();
      if (!data) return inhoud.replaceChildren(melding("fout", "Bijeenkomst niet gevonden."));
      b = data;
    }
    const f = {
      titel: tekstInvoer(b.titel, { required: true, maxlength: 150 }),
      soort: el("select", { id: id() }, ["ledenvergadering", "bedrijfsbezoek", "sprekersavond", "kerstmarkt", "bestuursvergadering", "overig"].map((s) => el("option", { value: s, text: s, selected: b.soort === s }))),
      start: el("input", { type: "datetime-local", id: id(), value: naarLokaal(b.start), required: true }),
      eind: el("input", { type: "datetime-local", id: id(), value: naarLokaal(b.eind) }),
      programma: tekstInvoer(b.programma, { maxlength: 200, placeholder: "Inloop 16:30 · rondleiding 17:00 · vergadering 18:00" }),
      locatie: tekstInvoer(b.locatie, { maxlength: 120 }),
      adres: tekstInvoer(b.adres, { maxlength: 150 }),
      omschrijving: el("textarea", { id: id(), maxlength: 1500 }, b.omschrijving ?? ""),
      aanmeldwijze: el("select", { id: id() }, [["eigen", "Aanmelden via de kring"], ["extern", "Externe kaartverkoop (bv. Ticket Dog)"], ["geen", "Geen aanmelding nodig"]].map(([v, t]) => el("option", { value: v, text: t, selected: b.aanmeldwijze === v }))),
      externe_link: el("input", { type: "url", id: id(), value: b.externe_link ?? "", placeholder: "https://" }),
      externe_tekst: tekstInvoer(b.externe_tekst, { maxlength: 200, placeholder: "Leden € 12,50 · niet-leden € 17,50" }),
      aanmelden_tot: el("input", { type: "datetime-local", id: id(), value: naarLokaal(b.aanmelden_tot) }),
      max_personen: el("input", { type: "number", id: id(), min: 1, max: 10, value: b.max_personen }),
      vraag_eten: el("select", { id: id() }, [["false", "Nee"], ["true", "Ja, vraag of mensen mee-eten"]].map(([v, t]) => el("option", { value: v, text: t, selected: String(b.vraag_eten) === v }))),
      doelgroep: el("select", { id: id() }, [["leden", "Leden"], ["leden_en_partners", "Leden en partners"], ["iedereen", "Iedereen (ook externen)"]].map(([v, t]) => el("option", { value: v, text: t, selected: b.doelgroep === v }))),
      status: el("select", { id: id() }, [["concept", "Concept (nog niet zichtbaar)"], ["gepubliceerd", "Gepubliceerd"], ["geannuleerd", "Geannuleerd"]].map(([v, t]) => el("option", { value: v, text: t, selected: b.status === v }))),
      afbeelding_url: el("input", { type: "url", id: id(), value: b.afbeelding_url ?? "", placeholder: "https://…" }),
    };
    const vTot = veld("Aanmelden kan tot", f.aanmelden_tot), vMax = veld("Maximaal aantal personen per aanmelding", f.max_personen), vEten = veld("Vragen naar eten", f.vraag_eten);
    const vLink = veld("Link kaartverkoop", f.externe_link), vTekst = veld("Tekst bij de kaartverkoop", f.externe_tekst);
    const wissel = () => {
      const w = f.aanmeldwijze.value;
      for (const v of [vTot, vMax, vEten]) v.classList.toggle("verborgen", w !== "eigen");
      for (const v of [vLink, vTekst]) v.classList.toggle("verborgen", w !== "extern");
    };
    f.aanmeldwijze.addEventListener("change", wissel);
    wissel();
    const uit = el("div", { "aria-live": "polite" }, neem("bijeenkomst"));
    const opslaan = el("button", { type: "submit", class: "knop", text: nieuw ? "Bijeenkomst aanmaken" : "Opslaan" });
    const form = el("form", { novalidate: true },
      el("div", { class: "rooster" },
        el("div", { class: "breed" }, veld("Titel", f.titel)),
        veld("Soort", f.soort), veld("Status", f.status),
        veld("Begin", f.start), veld("Einde (optioneel)", f.eind),
        el("div", { class: "breed" }, veld("Programma", f.programma)),
        veld("Locatie", f.locatie), veld("Adres", f.adres),
        el("div", { class: "breed" }, veld("Omschrijving (komt in de uitnodiging)", f.omschrijving)),
        veld("Aanmelden", f.aanmeldwijze), veld("Voor wie", f.doelgroep),
        vTot, vMax, vEten, vLink, vTekst,
        el("div", { class: "breed" }, veld("Beeld bovenaan de mail en de aanmeldpagina (optioneel)", f.afbeelding_url))),
      el("div", { class: "balk" }, opslaan, nieuw ? el("a", { href: "#bijeenkomsten", text: "Annuleren" }) : null), uit);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      uit.replaceChildren();
      const rij = {
        titel: f.titel.value.trim(), soort: f.soort.value, start: vanLokaal(f.start.value), eind: vanLokaal(f.eind.value),
        programma: f.programma.value.trim() || null, locatie: f.locatie.value.trim() || null, adres: f.adres.value.trim() || null,
        omschrijving: f.omschrijving.value.trim() || null, aanmeldwijze: f.aanmeldwijze.value, externe_link: f.externe_link.value.trim() || null,
        externe_tekst: f.externe_tekst.value.trim() || null, aanmelden_tot: vanLokaal(f.aanmelden_tot.value),
        max_personen: Math.min(10, Math.max(1, Number(f.max_personen.value) || 1)), vraag_eten: f.vraag_eten.value === "true",
        doelgroep: f.doelgroep.value, status: f.status.value, afbeelding_url: f.afbeelding_url.value.trim() || null,
      };
      if (!rij.titel || !rij.start) return uit.append(melding("fout", "Titel en begin zijn verplicht."));
      if (rij.aanmeldwijze === "extern" && !rij.externe_link) return uit.append(melding("fout", "Vul de link van de kaartverkoop in."));
      await bezig(opslaan, async () => {
        const q = nieuw ? sb.from("bijeenkomsten").insert(rij).select("id").single() : sb.from("bijeenkomsten").update(rij).eq("id", b.id).select("id").single();
        const { data, error } = await q;
        if (error) return uit.append(melding("fout", "Opslaan lukte niet."));
        if (nieuw) location.hash = `bijeenkomst/${data.id}`;
        else { bewaar("bijeenkomst", "goed", "Opgeslagen."); bijeenkomstScherm(b.id); }
      })();
    });

    const delen = nieuw
      ? [kaart(el("h1", { text: "Nieuwe bijeenkomst" }), form)]
      : [el("div", {}, el("a", { href: "#bijeenkomsten", text: "← Alle bijeenkomsten" }), el("h1", { text: b.titel, style: "margin:8px 0 2px" }),
          el("p", { class: "hint", style: "margin:0", text: `${datumLang(b.start)}, ${tijd(b.start)} uur${b.locatie ? ` · ${b.locatie}` : ""}` })),
        await uitnodigingenDeel(b),
        kaart(el("h2", { text: "Gegevens van de bijeenkomst" }), form)];
    inhoud.replaceChildren(...delen.map((d) => el("div", { style: "margin-bottom:16px" }, d)));
  }

  async function uitnodigingenDeel(b) {
    const { data: rijen } = await sb.from("v_uitnodigingen").select("*").eq("bijeenkomst_id", b.id).order("organisatie");
    const lijst = rijen ?? [];
    const uit = el("div", { "aria-live": "polite", style: "margin-top:12px" }, neem("uitnodigen"));
    const toon = (soort, tekst) => { uit.replaceChildren(melding(soort, tekst)); };
    const toonEnHerlaad = (soort, tekst) => { bewaar("uitnodigen", soort, tekst); bijeenkomstScherm(b.id); };
    const verslag = (r) => `${r.verzonden} verstuurd, ${r.test} in testmodus gelogd, ${r.overgeslagen} overgeslagen${r.fout ? `, ${r.fout} mislukt (${r.fouten.join("; ")})` : ""}${r.resterend ? `, ${r.resterend} nog te gaan: klik nogmaals` : ""}.`;

    const nogTeVersturen = lijst.filter((r) => !r.verstuurd_op && r.email && !r.aanmelding && r.bedrijf_status !== "opgezegd").length;
    const geenReactie = lijst.filter((r) => r.verstuurd_op && !r.aanmelding && !r.herinnerd_op && r.bedrijf_status !== "opgezegd").length;
    const komt = lijst.filter((r) => r.aanmelding === "komt");
    const cijfers = el("div", { class: "cijfers" },
      [["Genodigd", lijst.length], ["Verstuurd", lijst.filter((r) => r.verstuurd_op).length], ["Komen", komt.length], ["Personen", komt.reduce((s, r) => s + (r.aantal || 1), 0)],
        ["Eten mee", komt.filter((r) => r.eet_mee).reduce((s, r) => s + (r.aantal || 1), 0)], ["Afgemeld", lijst.filter((r) => r.aanmelding === "komt_niet").length], ["Geen reactie", lijst.filter((r) => !r.aanmelding).length]]
        .filter(([k]) => b.aanmeldwijze === "eigen" || ["Genodigd", "Verstuurd"].includes(k))
        .map(([k, v]) => el("div", { class: "cijfer" }, el("b", { text: v }), k)));

    const knopKlaarzetten = el("button", { type: "button", class: "knop tweede", text: "Leden als genodigden klaarzetten" });
    knopKlaarzetten.addEventListener("click", bezig(knopKlaarzetten, async () => {
      try { const r = await actie({ actie: "voorbereiden", bijeenkomst_id: b.id }); toonEnHerlaad("goed", `${r.klaargezet} genodigden klaargezet.`); }
      catch (e) { toon("fout", e.message); }
    }));
    const knopProef = el("button", { type: "button", class: "knop tweede", text: "Proefmail naar mij" });
    knopProef.addEventListener("click", bezig(knopProef, async () => {
      try { const r = await actie({ actie: "proef", bijeenkomst_id: b.id }); toon(r.aan.length ? "goed" : "let", r.aan.length ? `Proefmail verstuurd naar ${r.aan.join(", ")}.` : `Niet verstuurd${r.fouten.length ? `: ${r.fouten.join("; ")}` : " (mail nog niet gekoppeld?)"}.`); }
      catch (e) { toon("fout", e.message); }
    }));
    const knopVersturen = bevestigKnop(`Uitnodiging versturen (${nogTeVersturen})`, `Zeker? Klik nogmaals om ${nogTeVersturen} mails te versturen`, async () => {
      try { const r = await actie({ actie: "versturen", bijeenkomst_id: b.id }); toonEnHerlaad(r.fout ? "let" : "goed", verslag(r)); }
      catch (e) { toon("fout", e.message); }
    });
    if (!nogTeVersturen || b.status !== "gepubliceerd") knopVersturen.disabled = true;
    const knopHerinner = bevestigKnop(`Herinnering (${geenReactie})`, `Zeker? Klik nogmaals voor ${geenReactie} herinneringen`, async () => {
      try { const r = await actie({ actie: "herinneren", bijeenkomst_id: b.id, soort: "herinnering" }); toonEnHerlaad(r.fout ? "let" : "goed", verslag(r)); }
      catch (e) { toon("fout", e.message); }
    }, "knop tweede");
    if (!geenReactie || b.status !== "gepubliceerd") knopHerinner.disabled = true;
    const knopWhatsapp = el("button", { type: "button", class: "knop tweede", text: "WhatsApp-tekst kopiëren" });
    knopWhatsapp.addEventListener("click", bezig(knopWhatsapp, async () => {
      try { const r = await actie({ actie: "whatsapp_tekst", bijeenkomst_id: b.id }); await navigator.clipboard.writeText(r.tekst); toon("goed", "Tekst gekopieerd. Plak hem in de aankondigingsgroep van de community."); }
      catch (e) { toon("fout", e.message.includes("clipboard") ? "Kopiëren lukte niet in deze browser." : e.message); }
    }));

    // Gast toevoegen
    const g = { naam: tekstInvoer("", { maxlength: 120 }), email: el("input", { type: "email", id: id(), maxlength: 200 }), telefoon: el("input", { type: "tel", id: id(), maxlength: 30 }), organisatie: tekstInvoer("", { maxlength: 150 }), meteen: el("input", { type: "checkbox", id: id(), checked: true }) };
    const knopGast = el("button", { type: "submit", class: "knop klein", text: "Gast toevoegen" });
    const gastForm = el("form", { class: "geen-print" },
      el("div", { class: "rooster" }, veld("Naam", g.naam), veld("Organisatie", g.organisatie), veld("E-mail", g.email), veld("Telefoon", g.telefoon)),
      el("label", { style: "display:flex;gap:8px;align-items:center" }, g.meteen, b.status === "gepubliceerd" ? "Meteen een uitnodiging sturen" : "Uitnodiging sturen (kan pas als de bijeenkomst gepubliceerd is)"),
      knopGast);
    gastForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await bezig(knopGast, async () => {
        try {
          const r = await actie({ actie: "gast_toevoegen", bijeenkomst_id: b.id, naam: g.naam.value, email: g.email.value, telefoon: g.telefoon.value, organisatie: g.organisatie.value, versturen: g.meteen.checked });
          toonEnHerlaad("goed", `Gast toegevoegd.${r.verzending ? ` ${verslag(r.verzending)}` : ""}`);
        } catch (err) { toon("fout", err.message); }
      })();
    });

    // Tabel genodigden
    async function zetReactie(r, nieuweStatus) {
      const rij = { uitnodiging_id: r.uitnodiging_id, status: nieuweStatus, aantal: r.aantal || 1, eet_mee: nieuweStatus === "komt" && b.vraag_eten ? (r.eet_mee ?? true) : null, via: "bestuur" };
      const { error } = await sb.from("aanmeldingen").upsert(rij, { onConflict: "uitnodiging_id" });
      if (error) toon("fout", "Opslaan lukte niet."); else bijeenkomstScherm(b.id);
    }
    const reactiePil = (r) => r.aanmelding === "komt" ? pil(`komt${r.aantal > 1 ? ` (${r.aantal})` : ""}${r.eet_mee ? " · eet mee" : ""}`, "goed") : r.aanmelding === "komt_niet" ? pil("komt niet", "fout") : pil(r.verstuurd_op ? "geen reactie" : "nog niet uitgenodigd");
    const tabel = el("div", { class: "scroll" }, el("table", { class: "tabel" },
      el("thead", {}, el("tr", {}, ["Naam", "Organisatie", "Reactie", "Via", "Dieet / opmerking", "Mail", ""].map((h) => el("th", { text: h })))),
      el("tbody", {}, lijst.length ? lijst.map((r) => el("tr", {},
        el("td", {}, r.naam || "—", r.soort === "gast" ? [" ", pil("gast", "merk")] : null),
        el("td", { text: r.organisatie || "" }),
        el("td", {}, reactiePil(r)),
        el("td", { text: VIA[r.via] ?? "" }),
        el("td", { text: [r.dieetwensen, r.opmerking].filter(Boolean).join(" · ") }),
        el("td", { text: r.verstuurd_op ? new Date(r.verstuurd_op).toLocaleDateString("nl-NL") : (r.email ? "—" : "geen e-mail") }),
        el("td", { class: "geen-print" }, b.aanmeldwijze === "eigen" ? el("div", { class: "balk", style: "margin:0;gap:6px" },
          el("button", { type: "button", class: "knop klein tweede", onclick: () => zetReactie(r, "komt"), text: "Komt" }),
          el("button", { type: "button", class: "knop klein tweede", onclick: () => zetReactie(r, "komt_niet"), text: "Komt niet" }),
          el("button", { type: "button", class: "knop klein tweede", onclick: async () => { try { await navigator.clipboard.writeText(`${status?.site_url || location.origin}/aanmelden/?t=${r.token}`); toon("goed", `Aanmeldlink van ${r.naam || "deze genodigde"} gekopieerd.`); } catch { toon("fout", "Kopiëren lukte niet."); } }, text: "Link" })) : null))) :
        el("tr", {}, el("td", { colspan: 7, text: "Nog geen genodigden. Klik op 'Leden als genodigden klaarzetten'." })))));

    const exporteer = el("button", { type: "button", class: "knop klein tweede", text: "Lijst downloaden (Excel/CSV)", onclick: () =>
      download(`genodigden-${b.titel.replace(/[^\w-]+/g, "-").toLowerCase()}.csv`, csv([["Naam", "Organisatie", "E-mail", "Telefoon", "Soort", "Reactie", "Aantal", "Eet mee", "Dieet", "Opmerking"],
        ...lijst.map((r) => [r.naam, r.organisatie, r.email, r.telefoon, r.soort, r.aanmelding ?? "geen reactie", r.aantal, r.eet_mee ? "ja" : "", r.dieetwensen, r.opmerking])])) });
    const print = el("button", { type: "button", class: "knop klein tweede", text: "Presentielijst afdrukken", onclick: () => window.print() });

    const { data: log } = await sb.from("verzendlog").select("aangemaakt_op, email, soort, status, fout").eq("bijeenkomst_id", b.id).order("aangemaakt_op", { ascending: false }).limit(25);
    const logTabel = (log ?? []).length ? el("details", { class: "geen-print", style: "margin-top:16px" }, el("summary", { text: "Verzendlog (laatste 25)" }),
      el("div", { class: "scroll" }, el("table", { class: "tabel" }, el("tbody", {}, log.map((l) => el("tr", {},
        el("td", { text: new Date(l.aangemaakt_op).toLocaleString("nl-NL") }), el("td", { text: l.email }), el("td", { text: l.soort }),
        el("td", {}, pil(l.status, l.status === "verzonden" ? "goed" : l.status === "fout" || l.status === "geweigerd" ? "fout" : "")), el("td", { text: l.fout ?? "" }))))))) : null;

    // Algemene aanmeldlink: één link per bijeenkomst, per kanaal, zodat de lijst laat zien waar iemand vandaan kwam.
    let algemeen = null;
    if (b.aanmeldwijze === "eigen") {
      const basis = `${status?.site_url || location.origin}/aanmelden/?b=${b.id}&via=`;
      const qrVak = el("div", { class: "qr" });
      const qrLink = `${basis}qr`;
      let qrSvg = "";
      try {
        const q = window.qrcode(0, "M"); q.addData(qrLink); q.make();
        qrSvg = q.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
        qrVak.innerHTML = qrSvg; // door de bibliotheek gemaakt uit onze eigen link, geen invoer van buiten
      } catch { qrVak.append(el("p", { class: "hint", text: "De QR-code kon niet worden gemaakt." })); }
      const rij = (label, kanaal) => {
        const link = `${basis}${kanaal}`;
        return el("div", { class: "linkrij" }, el("strong", { text: label }), el("code", { text: link }),
          el("button", { type: "button", class: "knop klein tweede", text: "Kopiëren", onclick: async () => { try { await kopieer(link); toon("goed", `Link voor ${label.toLowerCase()} gekopieerd.`); } catch { toon("fout", "Kopiëren lukte niet."); } } }));
      };
      algemeen = el("details", { class: "geen-print", style: "margin-top:16px" }, el("summary", { text: "Algemene aanmeldlink (WhatsApp, nieuwsbrief, website, flyer)" }),
        el("p", { class: "hint", text: "Eén link voor iedereen. Een lid of partner meldt zich aan met zijn e-mailadres en krijgt de bevestiging met zijn persoonlijke link. Een onbekend adres krijgt niets" + (b.doelgroep === "iedereen" ? ", behalve bij deze open avond: dan wordt het als gast aangemeld." : "; het scherm zegt niet of een adres bekend is.") }),
        b.status !== "gepubliceerd" ? melding("let", "De link werkt pas als de bijeenkomst gepubliceerd is.") : null,
        rij("WhatsApp", "whatsapp"), rij("Nieuwsbrief", "nieuwsbrief"), rij("Website", "website"), rij("QR-code", "qr"),
        el("div", { class: "balk", style: "align-items:flex-start" }, qrVak,
          qrSvg ? el("button", { type: "button", class: "knop klein tweede", text: "QR-code downloaden (SVG)", onclick: () => download(`qr-${b.titel.replace(/[^\w-]+/g, "-").toLowerCase()}.svg`, qrSvg, "image/svg+xml") }) : null));
    }

    return kaart(
      el("h2", { text: "Uitnodigen en aanmeldingen" }),
      b.status !== "gepubliceerd" ? melding("let", "Deze bijeenkomst is nog een concept. Zet onderaan de status op 'Gepubliceerd' en sla op om uitnodigingen te kunnen versturen. Een proefmail kan altijd.") : null,
      cijfers,
      el("div", { class: "balk geen-print" }, knopKlaarzetten, knopProef, knopVersturen, knopHerinner, knopWhatsapp),
      uit,
      el("h3", { text: "Genodigden", style: "margin-top:16px" }),
      el("div", { class: "balk geen-print" }, exporteer, print),
      tabel,
      algemeen,
      el("details", { class: "geen-print", style: "margin-top:16px" }, el("summary", { text: "Gast handmatig uitnodigen (geen lid)" }), el("div", { style: "margin-top:12px" }, gastForm)),
      logTabel);
  }

  // ------------------------------------------------------------------ leden
  async function ledenScherm() {
    const [{ data: bedrijven }, { data: contacten }] = await Promise.all([
      sb.from("bedrijven").select("*").order("naam"),
      sb.from("contactpersonen").select("*").order("naam"),
    ]);
    const perBedrijf = new Map();
    for (const c of contacten ?? []) { if (!perBedrijf.has(c.bedrijf_id)) perBedrijf.set(c.bedrijf_id, []); perBedrijf.get(c.bedrijf_id).push(c); }
    const zoek = el("input", { type: "search", id: id(), placeholder: "Zoek op bedrijf, naam of e-mail" });
    const filter = el("select", { id: id() }, [["lid", "Leden"], ["partner", "Partners"], ["opgezegd", "Opgezegd"], ["ontbreekt", "Ontbrekende gegevens"], ["alle", "Alles"]].map(([v, t]) => el("option", { value: v, text: t })));
    const tbody = el("tbody");
    const dlg = el("dialog");
    document.body.append(dlg);

    function teken() {
      const q = zoek.value.trim().toLowerCase();
      const rijen = [];
      for (const b of bedrijven ?? []) {
        const cs = perBedrijf.get(b.id) ?? [];
        if (filter.value === "ontbreekt") { if (b.status === "opgezegd" || !cs.some((c) => !c.email || !c.telefoon || !c.naam)) continue; }
        else if (filter.value !== "alle" && b.status !== filter.value) continue;
        const tekst = [b.naam, ...cs.flatMap((c) => [c.naam, c.email])].join(" ").toLowerCase();
        if (q && !tekst.includes(q)) continue;
        rijen.push(el("tr", { class: "klik", onclick: () => bewerkBedrijf(b, cs) },
          el("td", {}, el("strong", { text: b.naam }), el("div", { class: "hint", text: [b.adres, b.plaats].filter(Boolean).join(", ") })),
          el("td", {}, cs.map((c) => el("div", {}, c.naam || pil("naam ontbreekt", "let"), c.primair ? null : [" ", pil("geen mail")], c.actief ? null : [" ", pil("inactief")]))),
          el("td", {}, cs.map((c) => el("div", {}, c.email || pil("ontbreekt", "let")))),
          el("td", {}, cs.map((c) => el("div", {}, c.telefoon || pil("ontbreekt", "let")))),
          el("td", {}, pil(b.status, b.status === "lid" ? "goed" : b.status === "opgezegd" ? "fout" : ""))));
      }
      tbody.replaceChildren(...(rijen.length ? rijen : [el("tr", {}, el("td", { colspan: 5, text: "Niets gevonden." }))]));
      telling.textContent = `${rijen.length} bedrijven`;
    }
    const telling = el("span", { class: "hint" });
    zoek.addEventListener("input", teken); filter.addEventListener("change", teken);

    function bewerkBedrijf(b, cs) {
      const isNieuw = !b;
      b = b ?? { naam: "", adres: "", postcode: "", plaats: "Ter Apel", kvk: "", branche: "", website: "", factuur_email: "", lid_sinds: String(new Date().getFullYear()), status: "lid", notitie: "", toon_in_ledenoverzicht: false };
      cs = cs ?? [];
      const f = Object.fromEntries(["naam", "adres", "postcode", "plaats", "kvk", "branche", "website", "factuur_email", "lid_sinds"].map((k) => [k, tekstInvoer(b[k])]));
      // Opzeggen gaat via de knop hieronder (met datum, penningmeester en Brevo), niet via deze keuzelijst.
      f.status = el("select", { id: id() }, ["lid", "partner", ...(b.status === "opgezegd" ? ["opgezegd"] : [])].map((s) => el("option", { value: s, text: s, selected: b.status === s })));
      f.notitie = el("textarea", { id: id() }, b.notitie ?? "");
      const contactRijen = [...cs, ...(isNieuw ? [{ naam: "", email: "", telefoon: "", functie: "", primair: true, actief: true, _nieuw: true }] : [])].map((c) => ({
        c, naam: tekstInvoer(c.naam), email: el("input", { type: "email", id: id(), value: c.email ?? "" }), telefoon: el("input", { type: "tel", id: id(), value: c.telefoon ?? "" }),
        functie: tekstInvoer(c.functie), primair: el("input", { type: "checkbox", id: id(), checked: c.primair }), actief: el("input", { type: "checkbox", id: id(), checked: c.actief }),
      }));
      const contactenDiv = el("div");
      const bestaand = contactRijen.filter((r) => !r.c._nieuw).length;
      const tekenContacten = () => contactenDiv.replaceChildren(...contactRijen.map((r) => el("fieldset", { style: "border:1px solid var(--lijn);padding:12px;margin:0 0 10px" },
        el("legend", { class: "label", text: r.c._nieuw ? "Nieuwe contactpersoon" : "Contactpersoon" }),
        r.c.nieuwsbrief_afgemeld_op ? el("p", { style: "margin:0 0 8px" }, pil("afgemeld voor de nieuwsbrief", "let"), el("span", { class: "hint", text: ` sinds ${new Date(r.c.nieuwsbrief_afgemeld_op).toLocaleDateString("nl-NL")}; komt niet terug op de nieuwsbrieflijst.` })) : null,
        el("div", { class: "rooster" }, veld("Naam", r.naam), veld("Functie", r.functie), veld("E-mail", r.email), veld("06-nummer", r.telefoon)),
        el("label", { style: "display:flex;gap:8px;align-items:center;margin-top:8px" }, r.primair, "Ontvangt de uitnodigingen"),
        el("label", { style: "display:flex;gap:8px;align-items:center" }, r.actief, "Actief (vinkje uit is tijdelijk)"),
        !r.c._nieuw && bestaand > 1 ? el("div", { style: "margin-top:8px" }, bevestigKnop("Verwijderen", "Zeker? Persoon en aanmeldingen gaan definitief weg", async () => {
          try { await actie({ actie: "contactpersoon_verwijderen", contactpersoon_id: r.c.id }); bewaar("leden", "goed", `${r.c.naam} is verwijderd bij ${b.naam}.`); dlg.close(); ledenScherm(); }
          catch (e) { uit.replaceChildren(melding("fout", e.message)); }
        }, "knop klein tweede")) : null)));
      tekenContacten();
      const extra = el("button", { type: "button", class: "knop klein tweede", text: "Contactpersoon toevoegen", onclick: () => {
        const c = { naam: "", email: "", telefoon: "", functie: "", primair: true, actief: true, _nieuw: true };
        contactRijen.push({ c, naam: tekstInvoer(""), email: el("input", { type: "email", id: id() }), telefoon: el("input", { type: "tel", id: id() }), functie: tekstInvoer(""), primair: el("input", { type: "checkbox", id: id(), checked: true }), actief: el("input", { type: "checkbox", id: id(), checked: true }) });
        tekenContacten();
      } });
      const uit = el("div");
      const knop = el("button", { type: "submit", class: "knop", text: "Opslaan" });
      const form = el("form", { method: "dialog" },
        el("h2", { text: isNieuw ? "Nieuw lid" : b.naam }),
        el("div", { class: "rooster" }, el("div", { class: "breed" }, veld("Bedrijfsnaam", f.naam)), veld("Adres", f.adres), veld("Postcode", f.postcode), veld("Plaats", f.plaats), veld("Status", f.status),
          veld("KvK", f.kvk), veld("Branche", f.branche), veld("Website", f.website), veld("Factuur-e-mail", f.factuur_email), veld("Lid sinds", f.lid_sinds), el("div", { class: "breed" }, veld("Notitie", f.notitie))),
        el("h3", { text: "Contactpersonen", style: "margin-top:16px" }), contactenDiv, extra,
        el("div", { class: "balk" }, knop, el("button", { type: "button", class: "knop tweede", text: "Annuleren", onclick: () => dlg.close() })), uit);
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        uit.replaceChildren();
        await bezig(knop, async () => {
          const rij = Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.value.trim() || null]));
          rij.status = f.status.value;
          if (!rij.naam) return uit.append(melding("fout", "Bedrijfsnaam is verplicht."));
          if (rij.status === "opgezegd" && b.status !== "opgezegd") rij.opgezegd_op = new Date().toISOString().slice(0, 10);
          const { data: opgeslagen, error } = isNieuw ? await sb.from("bedrijven").insert(rij).select("id").single() : await sb.from("bedrijven").update(rij).eq("id", b.id).select("id").single();
          if (error) return uit.append(melding("fout", "Opslaan lukte niet."));
          for (const r of contactRijen) {
            const c = { naam: r.naam.value.trim(), email: r.email.value.trim().toLowerCase() || null, telefoon: r.telefoon.value.trim() || null, functie: r.functie.value.trim() || null, primair: r.primair.checked, actief: r.actief.checked };
            if (r.c._nieuw && !c.naam && !c.email) continue;
            const { error: e2 } = r.c._nieuw ? await sb.from("contactpersonen").insert({ ...c, bedrijf_id: opgeslagen.id }) : await sb.from("contactpersonen").update(c).eq("id", r.c.id);
            if (e2) return uit.append(melding("fout", `Contactpersoon ${c.naam || c.email} opslaan lukte niet${e2.message?.includes("email_vorm") ? ": e-mailadres klopt niet" : ""}.`));
          }
          dlg.close();
          // Penningmeester en Brevo bijwerken; mislukt dat, dan doet de nachtelijke taak het.
          actie({ actie: "koppelingen_verwerken" }).catch(() => {});
          ledenScherm();
        })();
      });

      // Opzeggen: één actie met datum. Daarna van de site, uit Brevo en een melding aan de penningmeester.
      const opzeggen = el("div");
      if (!isNieuw && b.status !== "opgezegd") {
        const datum = el("input", { type: "date", id: id(), value: new Date().toISOString().slice(0, 10) });
        const opzegUit = el("div", { "aria-live": "polite" });
        opzeggen.append(el("h3", { text: "Lidmaatschap beëindigen", style: "margin-top:20px" }),
          el("p", { class: "hint", text: "Het profiel gaat van de website, het adres van de nieuwsbrieflijst, er komen geen uitnodigingen meer en de penningmeester krijgt bericht. De gegevens blijven bewaard." }),
          el("div", { class: "balk" }, veld("Opzegdatum", datum), bevestigKnop("Lid opzeggen", "Zeker? Klik nogmaals om op te zeggen", async () => {
            try {
              const r = await actie({ actie: "lid_opzeggen", bedrijf_id: b.id, datum: datum.value });
              dlg.replaceChildren(kaart(el("h2", { text: `${b.naam} is opgezegd` }),
                el("ul", { class: "gevolgen" },
                  el("li", { text: "Het profiel is van de website gehaald; het staat als verborgen klaar, voor het geval het een vergissing was." }),
                  el("li", { text: status?.brevo_sync_aan ? "Het adres is van de Brevo-lijst gehaald; er komen geen nieuwsbrieven meer." : "Er komen geen uitnodigingen meer. (De Brevo-koppeling staat uit; de nieuwsbrieflijst is niet aangepast.)" }),
                  el("li", { text: status?.penningmeester_ingesteld ? "De penningmeester heeft een melding met de opzegdatum." : "Er is nog geen adres voor de penningmeester ingesteld; de melding volgt zodra dat er is." })),
                melding("let", `Haal ${r.whatsapp.length ? r.whatsapp.join(", ") : "de personen van dit bedrijf"} zelf uit de WhatsApp-community. Dat kan niet automatisch.`),
                el("div", { class: "balk" }, el("button", { type: "button", class: "knop", text: "Klaar", onclick: () => { dlg.close(); ledenScherm(); } }))));
            } catch (e) { opzegUit.replaceChildren(melding("fout", e.message)); }
          }, "knop tweede")), opzegUit);
      }
      const mutatieLijst = el("div");
      if (!isNieuw) {
        sb.from("mutaties").select("datum, soort, toelichting, beheerder_naam").eq("bedrijf_id", b.id).order("id", { ascending: false }).limit(20).then(({ data }) => {
          if (data?.length) mutatieLijst.append(el("details", { style: "margin-top:16px" }, el("summary", { text: "Mutaties" }),
            el("table", { class: "tabel" }, el("tbody", {}, data.map((m) => el("tr", {}, el("td", { text: new Date(m.datum).toLocaleDateString("nl-NL") }),
              el("td", { text: MUTATIE[m.soort] ?? m.soort }), el("td", { text: [m.toelichting, m.beheerder_naam].filter(Boolean).join(" · ") })))))));
        });
      }
      dlg.replaceChildren(kaart(form, opzeggen, mutatieLijst));
      dlg.showModal();
    }

    const jaarKnop = el("button", { type: "button", class: "knop tweede klein", text: "Jaaroverzicht (Excel)" });
    jaarKnop.addEventListener("click", bezig(jaarKnop, async () => {
      try { const r = await actie({ actie: "jaaroverzicht", jaar: new Date().getFullYear() }); downloadBase64(r.naam, r.bestand, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"); }
      catch (e) { ledenUit.replaceChildren(melding("fout", e.message)); }
    }));
    const ledenUit = el("div", { "aria-live": "polite" }, neem("leden"));
    inhoud.replaceChildren(kaart(
      el("div", { class: "balk" }, el("h1", { text: "Leden", style: "margin:0;flex:1" }),
        el("button", { type: "button", class: "knop tweede klein", text: "Lijst downloaden", onclick: () => download("ledenlijst-industriekring.csv", csv([["Bedrijf", "Status", "Adres", "Postcode", "Plaats", "Lid sinds", "Contactpersoon", "Functie", "E-mail", "06", "Ontvangt uitnodiging"],
          ...(bedrijven ?? []).flatMap((b) => (perBedrijf.get(b.id) ?? [{}]).map((c) => [b.naam, b.status, b.adres, b.postcode, b.plaats, b.lid_sinds, c.naam, c.functie, c.email, c.telefoon, c.primair ? "ja" : "nee"]))])) }),
        jaarKnop,
        el("button", { type: "button", class: "knop klein", text: "Nieuw lid", onclick: () => bewerkBedrijf(null, null) })),
      ledenUit,
      el("div", { class: "balk" }, zoek, filter, telling),
      el("div", { class: "scroll" }, el("table", { class: "tabel" }, el("thead", {}, el("tr", {}, ["Bedrijf", "Contactpersoon", "E-mail", "06-nummer", "Status"].map((h) => el("th", { text: h })))), tbody))));
    teken();
  }

  // ------------------------------------------------------------------ aanvragen
  async function aanvragenScherm() {
    const { data } = await sb.from("lidmaatschapsaanvragen").select("*").order("aangemaakt_op", { ascending: false }).limit(100);
    const uit = el("div", { "aria-live": "polite" }, neem("aanvragen"));
    const kaartjes = (data ?? []).map((a) => {
      const velden = [["Contactpersoon", `${a.contactpersoon}${a.functie ? ` (${a.functie})` : ""}`], ["E-mail", a.email], ["Telefoon", a.telefoon], ["Adres", [a.adres, a.postcode, a.plaats].filter(Boolean).join(", ")], ["KvK", a.kvk], ["Branche", a.branche], ["Website", a.website], ["Factuur naar", a.factuur_email], ["Hoe bekend", a.hoe_bekend], ["Opmerking", a.opmerking], ["In ledenoverzicht", a.toestemming_ledenoverzicht ? "ja" : "nee"]].filter(([, v]) => v);
      const knoppen = a.status === "nieuw" ? el("div", { class: "balk" },
        bevestigKnop("Goedkeuren", "Zeker? Klik nogmaals", async () => { try { const r = await actie({ actie: "aanvraag_goedkeuren", aanvraag_id: a.id }); bewaar("aanvragen", "goed", `${a.bedrijfsnaam} is toegevoegd als lid. Welkomstmail: ${({ verzonden: "verstuurd", test: "alleen gelogd (testmodus)", fout: "mislukt" })[r.welkomstmail] ?? r.welkomstmail}.`); aanvragenScherm(); } catch (e) { uit.replaceChildren(melding("fout", e.message)); } }),
        bevestigKnop("Afwijzen", "Zeker? Klik nogmaals", async () => { try { await actie({ actie: "aanvraag_afwijzen", aanvraag_id: a.id }); aanvragenScherm(); } catch (e) { uit.replaceChildren(melding("fout", e.message)); } }, "knop tweede")) : null;
      return kaart(el("div", { class: "balk", style: "margin-top:0" }, el("h2", { text: a.bedrijfsnaam, style: "margin:0;flex:1" }), pil(a.status, a.status === "goedgekeurd" ? "goed" : a.status === "afgewezen" ? "fout" : "let")),
        el("p", { class: "hint", text: `Ontvangen ${new Date(a.aangemaakt_op).toLocaleString("nl-NL")}` }),
        el("table", { class: "tabel" }, el("tbody", {}, velden.map(([k, v]) => el("tr", {}, el("th", { text: k, style: "width:180px;position:static" }), el("td", { text: v }))))), knoppen);
    });
    inhoud.replaceChildren(kaart(el("h1", { text: "Aanmeldingen als lid" }), el("p", { text: "Aanmeldingen via het formulier op de website. Bij goedkeuren wordt het bedrijf lid en krijgt de contactpersoon een welkomstmail." }), uit),
      ...(kaartjes.length ? kaartjes : [kaart(el("p", { text: "Nog geen aanmeldingen." }))]).map((k) => el("div", { style: "margin-top:16px" }, k)));
  }

  const VIA = { link: "persoonlijke link", bestuur: "bestuur", whatsapp: "WhatsApp", nieuwsbrief: "nieuwsbrief", website: "website", qr: "QR-code" };
  const MUTATIE = { ingeschreven: "Ingeschreven", partner_toegevoegd: "Partner geworden", opgezegd: "Opgezegd", heringeschreven: "Opnieuw ingeschreven",
    status_gewijzigd: "Soort gewijzigd", profiel_gepubliceerd: "Profiel gepubliceerd", profiel_verborgen: "Profiel verborgen", contactpersoon_verwijderd: "Persoon verwijderd" };

  // ------------------------------------------------------------------ profielen
  const PROFIEL_STATUS = {
    leeg: ["Nog niet ingevuld", ""], wacht: ["Wacht op controle", "let"], wijziging: ["Wijziging wacht op controle", "let"],
    gepubliceerd: ["Gepubliceerd", "goed"], verborgen: ["Verborgen", ""],
  };
  const profielStand = (p) => !p || !p.ingediend_op ? "leeg" : p.status === "ingediend" ? "wacht" : p.status === "gepubliceerd" ? (p.voorstel ? "wijziging" : "gepubliceerd") : p.status === "verborgen" ? "verborgen" : "leeg";

  async function profielenScherm(gekozen) {
    const [{ data: bedrijven }, { data: profielen }, { data: contacten }] = await Promise.all([
      sb.from("bedrijven").select("id, naam, status, toon_in_ledenoverzicht").in("status", ["lid", "partner"]).order("naam"),
      sb.from("profielen").select("*"),
      sb.from("contactpersonen").select("id, bedrijf_id, naam, email, actief, primair").order("primair", { ascending: false }).order("naam"),
    ]);
    const perBedrijf = new Map((profielen ?? []).map((p) => [p.bedrijf_id, p]));
    const uit = el("div", { "aria-live": "polite" }, neem("profielen"));
    const filter = el("select", { id: id() }, [["wacht", "Wacht op controle"], ["gepubliceerd", "Gepubliceerd"], ["verborgen", "Verborgen"], ["leeg", "Nog niet ingevuld"], ["alle", "Alles"]]
      .map(([v, t]) => el("option", { value: v, text: t, selected: v === (sessionStorage.getItem("profielfilter") || "wacht") })));
    const tbody = el("tbody");
    const telling = el("span", { class: "hint" });
    const paneel = el("div", { class: "kaart" }, el("h2", { text: "Kies een bedrijf" }), el("p", { class: "hint", text: "Klik links op een naam om het profiel te bekijken, te publiceren of de profiellink te sturen." }));

    function teken() {
      sessionStorage.setItem("profielfilter", filter.value);
      const rijen = (bedrijven ?? []).filter((b) => {
        const st = profielStand(perBedrijf.get(b.id));
        return filter.value === "alle" || (filter.value === "wacht" ? st === "wacht" || st === "wijziging" : st === filter.value);
      });
      tbody.replaceChildren(...(rijen.length ? rijen.map((b) => {
        const p = perBedrijf.get(b.id), st = profielStand(p);
        return el("tr", { class: `klik${b.id === gekozen ? " gekozen" : ""}`, onclick: () => (location.hash = `profielen/${b.id}`) },
          el("td", {}, el("strong", { text: b.naam }), b.status === "partner" ? [" ", pil("partner", "merk")] : null,
            el("div", { class: "hint", text: p?.uitgenodigd_op ? `Link gestuurd ${new Date(p.uitgenodigd_op).toLocaleDateString("nl-NL")}` : "Nog geen link gestuurd" })),
          el("td", {}, pil(...PROFIEL_STATUS[st])));
      }) : [el("tr", {}, el("td", { colspan: 2, text: filter.value === "wacht" ? "Er wacht niets op controle." : "Geen bedrijven in deze lijst." }))]));
      telling.textContent = `${rijen.length} van ${(bedrijven ?? []).length} bedrijven`;
    }
    filter.addEventListener("change", teken);
    teken();

    const b = (bedrijven ?? []).find((x) => x.id === gekozen);
    if (b) await tekenPaneel(b, perBedrijf.get(b.id), (contacten ?? []).filter((c) => c.bedrijf_id === b.id));

    async function tekenPaneel(b, p, cs) {
      const st = profielStand(p);
      const ingevuld = p ? { ...p, ...(p.voorstel ?? {}) } : null;
      const kaartVan = async (v) => ik.lidkaart({ naam: b.naam, branche: v.branche, kort: v.kort, foto: await fotoUrl(v.foto_pad), pas: v.foto_weergave, partner: b.status === "partner" });
      const delen = [el("div", { class: "balk", style: "margin-top:0" }, el("h2", { text: b.naam, style: "margin:0;flex:1" }), pil(...PROFIEL_STATUS[st]))];
      const melden = (soort, tekst) => { bewaar("profielen", soort, tekst); profielenScherm(b.id); };

      if (st === "leeg") delen.push(el("p", { text: "Dit bedrijf heeft nog geen profiel ingestuurd." }));
      else {
        if (!b.toon_in_ledenoverzicht) delen.push(melding("let", "Het bedrijf heeft aangegeven niet op de website te willen staan. Publiceren kan daarom niet."));
        const wacht = st === "wacht" || st === "wijziging";
        const kaarten = el("div", { class: "kaarten" });
        if (st === "wijziging" || st === "gepubliceerd") kaarten.append(el("div", { style: "display:grid;gap:6px" }, el("span", { class: "label", text: "Nu gepubliceerd" }), await kaartVan(p)));
        if (wacht || st === "verborgen") kaarten.append(el("div", { style: "display:grid;gap:6px" }, el("span", { class: "label", text: wacht ? "Wacht op controle" : "Verborgen versie" }), await kaartVan(ingevuld)));
        delen.push(kaarten);
        const contact = cs.find((c) => c.id === p.contactpersoon_id);
        delen.push(el("dl", { class: "rooster", style: "gap:4px 16px;margin:12px 0" },
          ...[["Meer over het bedrijf", ingevuld.lang || "—"], ["Website", ingevuld.website || "—"],
            ["Contactpersoon op de site", ingevuld.toon_contactpersoon ? contact?.naam || "ja" : "nee"],
            ["Foto of logo", ingevuld.foto_pad ? `${ingevuld.foto_weergave === "vullend" ? "vult het vak" : "hele afbeelding"}${ingevuld.foto_toestemming ? ", gebruik bevestigd" : ""}` : "geen"],
            ["Ingestuurd", p.ingediend_op ? new Date(p.ingediend_op).toLocaleString("nl-NL") : "—"]]
            .flatMap(([k, v]) => [el("dt", { class: "hint", text: k }), el("dd", { style: "margin:0 0 6px;white-space:pre-wrap;overflow-wrap:anywhere", text: v })])));
        const knoppen = el("div", { class: "balk" });
        if (wacht || st === "verborgen") {
          const pub = el("button", { type: "button", class: "knop", text: "Publiceren", disabled: !b.toon_in_ledenoverzicht });
          pub.addEventListener("click", bezig(pub, async () => {
            try { await actie({ actie: "profiel_publiceren", bedrijf_id: b.id }); melden("goed", `Het profiel van ${b.naam} is gepubliceerd.`); }
            catch (e) { uit.replaceChildren(melding("fout", e.message)); }
          }));
          knoppen.append(pub);
        }
        if (st === "gepubliceerd" || st === "wijziging") {
          knoppen.append(bevestigKnop("Verbergen", "Zeker? Klik nogmaals om te verbergen", async () => {
            try { await actie({ actie: "profiel_verbergen", bedrijf_id: b.id }); melden("goed", `Het profiel van ${b.naam} is verborgen.`); }
            catch (e) { uit.replaceChildren(melding("fout", e.message)); }
          }, "knop tweede"));
          const wa = el("pre", { class: "wa", hidden: true });
          const waKnop = el("button", { type: "button", class: "knop tweede", text: "Nieuw lid-bericht kopiëren" });
          waKnop.addEventListener("click", bezig(waKnop, async () => {
            try {
              const r = await actie({ actie: "nieuw_lid_tekst", bedrijf_id: b.id });
              wa.textContent = r.tekst; wa.hidden = false;
              try { await kopieer(r.tekst); uit.replaceChildren(melding("goed", "Tekst gekopieerd. Plak hem in de WhatsApp-community of op LinkedIn.")); }
              catch { uit.replaceChildren(melding("let", "Kopiëren lukte niet in deze browser; selecteer de tekst hieronder.")); }
            } catch (e) { uit.replaceChildren(melding("fout", e.message)); }
          }));
          knoppen.append(waKnop);
          delen.push(knoppen, wa);
        } else delen.push(knoppen);
        delen.push(el("p", { class: "hint", text: "Publiceren betekent nu: goedgekeurd door het bestuur. De koppeling die de kaart automatisch op de website zet, volgt; tot die tijd plaatst de webbeheerder hem." }));
      }

      // Profiellink sturen of kopiëren
      const metAdres = cs.filter((c) => c.actief && c.email);
      const naar = el("select", { id: id() }, metAdres.map((c) => el("option", { value: c.id, text: `${c.naam || "(geen naam)"} · ${c.email}`, selected: c.id === p?.contactpersoon_id })));
      const stuur = bevestigKnop("Profiellink sturen", "Zeker? Klik nogmaals om te mailen", async () => {
        try {
          const r = await actie({ actie: "profiel_uitnodigen", bedrijf_id: b.id, contactpersoon_id: naar.value });
          melden(r.mail === "verzonden" ? "goed" : "let", r.mail === "verzonden" ? "Profiellink verstuurd." : "Profiellink alleen gelogd: de testmodus staat aan.");
        } catch (e) { uit.replaceChildren(melding("fout", e.message)); }
      });
      const kopieerKnop = el("button", { type: "button", class: "knop tweede", text: "Link kopiëren" });
      kopieerKnop.addEventListener("click", bezig(kopieerKnop, async () => {
        try { const r = await actie({ actie: "profiel_link", bedrijf_id: b.id, contactpersoon_id: naar.value || null }); await kopieer(r.link); uit.replaceChildren(melding("goed", "Profiellink gekopieerd. Deze link is persoonlijk: deel hem alleen met dit bedrijf.")); }
        catch (e) { uit.replaceChildren(melding("fout", e.message.includes("clipboard") ? "Kopiëren lukte niet in deze browser." : e.message)); }
      }));
      const nieuw = p ? bevestigKnop("Nieuwe link maken", "Zeker? De oude link werkt daarna niet meer", async () => {
        try { await actie({ actie: "profiel_nieuwe_link", bedrijf_id: b.id }); melden("goed", "Nieuwe link gemaakt; de oude werkt niet meer. Stuur of kopieer de nieuwe."); }
        catch (e) { uit.replaceChildren(melding("fout", e.message)); }
      }, "knop tweede klein") : null;
      delen.push(el("h3", { text: "Profiellink", style: "margin-top:16px" }),
        metAdres.length ? [veld("Naar", naar), el("div", { class: "balk" }, stuur, kopieerKnop, nieuw)]
          : melding("let", "Er is geen actieve persoon met een e-mailadres. Voeg die toe bij Leden."));
      paneel.replaceChildren(...delen.flat().filter(Boolean));
    }

    inhoud.replaceChildren(
      kaart(el("h1", { text: "Profielen" }), el("p", { text: "De kaarten voor de pagina Onze leden. Niets komt op de website zonder klik van het bestuur, ook een wijziging niet." }), uit),
      el("div", { class: "twee-kol", style: "margin-top:16px" },
        kaart(el("div", { class: "balk", style: "margin-top:0" }, filter, telling),
          el("div", { class: "scroll" }, el("table", { class: "tabel" }, el("thead", {}, el("tr", {}, el("th", { text: "Bedrijf" }), el("th", { text: "Profiel" }))), tbody))),
        paneel));
    if (b && window.innerWidth < 860) paneel.scrollIntoView({ block: "start" });
  }

  // ------------------------------------------------------------------ instellingen
  async function instellingenScherm() {
    const [{ data: rijen }, { data: beheerders }, { data: toegestaan }] = await Promise.all([
      sb.from("instellingen").select("*").order("sleutel"),
      sb.from("beheerders").select("naam, email"),
      sb.from("beheerder_toegestaan").select("naam, email").order("naam"),
    ]);
    const m = Object.fromEntries((rijen ?? []).map((r) => [r.sleutel, r.waarde]));
    const uit = el("div", { "aria-live": "polite" });
    const f = {
      testmodus: el("select", { id: id() }, [["true", "Aan: alleen naar testadressen"], ["false", "Uit: mails gaan naar leden"]].map(([v, t]) => el("option", { value: v, text: t, selected: String(m.testmodus) === v }))),
      test_ontvangers: tekstInvoer((m.test_ontvangers ?? []).join(", ")),
      afzender_naam: tekstInvoer(m.afzender?.naam), afzender_email: el("input", { type: "email", id: id(), value: m.afzender?.email ?? "" }),
      antwoord_aan: el("input", { type: "email", id: id(), value: m.antwoord_aan ?? "" }),
      site_url: el("input", { type: "url", id: id(), value: m.site_url ?? "" }),
      adres_footer: tekstInvoer(m.adres_footer),
      meldingen_bestuur: tekstInvoer((m.meldingen_bestuur ?? []).join(", ")),
      max_per_run: el("input", { type: "number", id: id(), min: 1, max: 300, value: m.max_per_run ?? 120 }),
      meldingen_penningmeester: tekstInvoer((m.meldingen_penningmeester ?? []).join(", ")),
      whatsapp_community_link: el("input", { type: "url", id: id(), value: m.whatsapp_community_link ?? "", placeholder: "https://chat.whatsapp.com/…" }),
      brevo_sync_aan: el("select", { id: id() }, [["false", "Uit"], ["true", "Aan: de lijsten Leden en Partners volgen de administratie"]].map(([v, t]) => el("option", { value: v, text: t, selected: String(m.brevo_sync_aan === true) === v }))),
    };
    const lijst = (s) => s.split(/[,\s]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
    const knop = el("button", { type: "submit", class: "knop", text: "Instellingen opslaan" });
    const form = el("form", {},
      el("div", { class: "rooster" },
        el("div", { class: "breed" }, veld("Testmodus", f.testmodus, "Zolang de testmodus aan staat, gaat er niets naar leden.")),
        el("div", { class: "breed" }, veld("Testadressen", f.test_ontvangers, "Gescheiden door komma's. Krijgen in testmodus wel de mails, en altijd de proefmails.")),
        veld("Naam afzender", f.afzender_naam), veld("E-mail afzender", f.afzender_email, "Moet bij Brevo geverifieerd zijn."),
        veld("Antwoorden naar", f.antwoord_aan), veld("Maximaal per verzendronde", f.max_per_run),
        el("div", { class: "breed" }, veld("Adres van deze pagina's", f.site_url)),
        el("div", { class: "breed" }, veld("Afzenderregel onder elke mail", f.adres_footer)),
        el("div", { class: "breed" }, veld("Melding bij nieuwe lidaanvraag naar", f.meldingen_bestuur, "Ook de melding als een lid zijn profiel instuurt.")),
        el("div", { class: "breed" }, veld("Penningmeester (meldingen bij in- en uitschrijving)", f.meldingen_penningmeester, "Gescheiden door komma's. Leeg: de meldingen wachten tot hier een adres staat.")),
        el("div", { class: "breed" }, veld("Link naar de WhatsApp-community", f.whatsapp_community_link, "Staat op het afsluitscherm van de profielpagina.")),
        el("div", { class: "breed" }, veld("Brevo-lijsten bijhouden", f.brevo_sync_aan, "Zet pas aan als de lijsten bij Brevo hieronder zijn ingericht en een proefvergelijking klopt."))),
      el("div", { class: "balk" }, knop), uit);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      await bezig(knop, async () => {
        const nieuw = {
          testmodus: f.testmodus.value === "true", test_ontvangers: lijst(f.test_ontvangers.value),
          afzender: { naam: f.afzender_naam.value.trim(), email: f.afzender_email.value.trim().toLowerCase() },
          antwoord_aan: f.antwoord_aan.value.trim().toLowerCase(), site_url: f.site_url.value.trim().replace(/\/+$/, ""),
          adres_footer: f.adres_footer.value.trim(), meldingen_bestuur: lijst(f.meldingen_bestuur.value),
          max_per_run: Math.min(300, Math.max(1, Number(f.max_per_run.value) || 120)),
          meldingen_penningmeester: lijst(f.meldingen_penningmeester.value), whatsapp_community_link: f.whatsapp_community_link.value.trim(),
          brevo_sync_aan: f.brevo_sync_aan.value === "true",
        };
        const slecht = [...nieuw.test_ontvangers, ...nieuw.meldingen_bestuur, ...nieuw.meldingen_penningmeester].find((e) => !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(e));
        if (slecht) return uit.replaceChildren(melding("fout", `"${slecht}" is geen geldig e-mailadres.`));
        if (nieuw.whatsapp_community_link && !/^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+$/.test(nieuw.whatsapp_community_link)) {
          return uit.replaceChildren(melding("fout", "De WhatsApp-link begint met https://chat.whatsapp.com/ gevolgd door de code van de community."));
        }
        for (const [sleutel, waarde] of Object.entries(nieuw)) {
          const { error } = await sb.from("instellingen").update({ waarde }).eq("sleutel", sleutel);
          if (error) return uit.replaceChildren(melding("fout", `Opslaan van ${sleutel} lukte niet.`));
        }
        uit.replaceChildren(melding("goed", "Opgeslagen."));
        try { status = await actie({ actie: "status" }); toonStatus(); } catch { /* laat staan */ }
      })();
    });

    const nieuweNaam = tekstInvoer(""), nieuwEmail = el("input", { type: "email", id: id() });
    const toevoegen = el("button", { type: "submit", class: "knop klein", text: "Toegang geven" });
    const beheerForm = el("form", {}, el("div", { class: "rooster" }, veld("Naam", nieuweNaam), veld("E-mail", nieuwEmail)), toevoegen);
    const beheerUit = el("div", {}, neem("beheerders"));
    beheerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await bezig(toevoegen, async () => {
        try {
          await actie({ actie: "beheerder_toevoegen", naam: nieuweNaam.value.trim(), email: nieuwEmail.value.trim().toLowerCase() });
          bewaar("beheerders", "goed", "Toegevoegd. Diegene kan nu inloggen op deze pagina met dit e-mailadres.");
          instellingenScherm();
        } catch (err) { beheerUit.replaceChildren(melding("fout", err.message)); }
      })();
    });

    inhoud.replaceChildren(
      kaart(el("h1", { text: "Instellingen" }), form),
      el("div", { style: "margin-top:16px" }, kaart(el("h2", { text: "Wie mag beheren" }),
        el("div", { class: "scroll" }, el("table", { class: "tabel" }, el("tbody", {}, (toegestaan ?? []).map((t) => el("tr", {}, el("td", { text: t.naam }), el("td", { text: t.email }),
          el("td", {}, (beheerders ?? []).some((b) => b.email === t.email) ? pil("heeft ingelogd", "goed") : pil("nog niet ingelogd")),
          el("td", {}, t.email === sessie.user.email?.toLowerCase() ? el("span", { class: "hint", text: "dat ben jij" }) :
            bevestigKnop("Toegang intrekken", "Zeker? Klik nogmaals", async () => {
              const { error } = await sb.from("beheerder_toegestaan").delete().eq("email", t.email);
              if (error) beheerUit.replaceChildren(melding("fout", "Intrekken lukte niet.")); else instellingenScherm();
            }, "knop klein tweede"))))))),
        el("h3", { text: "Iemand toegang geven", style: "margin-top:16px" }), beheerForm, beheerUit)),
      el("div", { style: "margin-top:16px" }, await brevoKaart(m)),
      el("div", { style: "margin-top:16px" }, await branchesKaart()),
      el("div", { style: "margin-top:16px" }, await verzendlogKaart()));
  }

  async function brevoKaart(m) {
    const uit = el("div", { "aria-live": "polite" });
    const { data: taken } = await sb.from("koppeltaken").select("status, fout, bijgewerkt_op, pogingen").in("status", ["open", "fout"]).order("bijgewerkt_op", { ascending: false }).limit(50);
    const open = (taken ?? []).filter((t) => t.status === "open").length;
    const mislukt = (taken ?? []).filter((t) => t.status === "fout");
    const knop = (tekst, body, klaar, klasse = "knop tweede klein") => {
      const k = el("button", { type: "button", class: klasse, text: tekst });
      k.addEventListener("click", bezig(k, async () => {
        try { uit.replaceChildren(melding("goed", klaar(await actie(body)))); }
        catch (e) { uit.replaceChildren(melding("fout", e.message)); }
      }));
      return k;
    };
    return kaart(el("h2", { text: "Brevo: nieuwsbrieflijsten en bezorging" }),
      el("p", { text: "De lijsten Leden en Partners in Brevo volgen de ledenadministratie: direct bij een wijziging en elke nacht volledig. Naar Brevo gaan alleen e-mailadres, naam en bedrijfsnaam. Wie zich afmeldt voor de nieuwsbrief, zetten we nooit terug." }),
      el("table", { class: "tabel", style: "margin:8px 0" }, el("tbody", {},
        el("tr", {}, el("th", { scope: "row", text: "Sleutel" }), el("td", {}, status?.mail_gekoppeld ? pil("ingesteld", "goed") : pil("ontbreekt", "let"))),
        el("tr", {}, el("th", { scope: "row", text: "Lijsten" }), el("td", { text: m.brevo_lijst_leden && m.brevo_lijst_partners ? `Leden (nr. ${m.brevo_lijst_leden}) en Partners (nr. ${m.brevo_lijst_partners})` : "nog niet ingericht" })),
        el("tr", {}, el("th", { scope: "row", text: "Bijhouden" }), el("td", {}, m.brevo_sync_aan === true ? pil("aan", "goed") : pil("uit"))),
        el("tr", {}, el("th", { scope: "row", text: "Wachtrij" }), el("td", { text: `${open} open, ${mislukt.length} mislukt` })))),
      mislukt.length ? el("details", {}, el("summary", { text: "Mislukte koppelingen" }), el("ul", {}, mislukt.slice(0, 10).map((t) => el("li", { text: `${new Date(t.bijgewerkt_op).toLocaleString("nl-NL")}: ${t.fout}` })))) : null,
      el("div", { class: "balk" },
        knop("Lijsten in Brevo inrichten", { actie: "brevo_inrichten" }, (r) => `Klaar: Leden is lijst ${r.lijsten.brevo_lijst_leden}, Partners is lijst ${r.lijsten.brevo_lijst_partners}. Ververs de pagina om ze te zien.`),
        knop("Webhook voor bezorgfouten instellen", { actie: "brevo_webhook" }, (r) => `Webhook: ${Object.entries(r.webhooks).map(([k, v]) => `${k === "transactional" ? "mail" : "nieuwsbrief"} ${v}`).join(", ")}.`),
        knop("Proef: vergelijken zonder te wijzigen", { actie: "brevo_vergelijken", droog: true }, (r) => `In Brevo: ${r.in_brevo} adressen. Erbij te zetten: ${r.erbij}. Eraf te halen: ${r.eraf}${r.eraf_adressen?.length ? ` (${r.eraf_adressen.join(", ")}${r.eraf > r.eraf_adressen.length ? ", …" : ""})` : ""}. Er is niets gewijzigd.`),
        m.brevo_sync_aan === true ? knop("Nu gelijktrekken", { actie: "brevo_vergelijken", droog: false }, (r) => `Bijgewerkt: ${r.bijgewerkt} adressen${r.fouten.length ? `; mislukt: ${r.fouten.join("; ")}` : ""}.`, "knop klein") : null),
      uit);
  }

  async function branchesKaart() {
    const { data } = await sb.from("branches").select("*").order("volgorde").order("naam");
    const uit = el("div", { "aria-live": "polite" }, neem("branches"));
    const rijen = (data ?? []).map((b) => ({ b, naam: tekstInvoer(b.naam, { maxlength: 60 }), volgorde: el("input", { type: "number", id: id(), value: b.volgorde, style: "width:90px" }), actief: el("input", { type: "checkbox", id: id(), checked: b.actief }) }));
    const nieuw = tekstInvoer("", { maxlength: 60, placeholder: "Nieuw type bedrijf" });
    const opslaan = el("button", { type: "button", class: "knop klein", text: "Typen opslaan" });
    opslaan.addEventListener("click", bezig(opslaan, async () => {
      for (const r of rijen) {
        const naam = r.naam.value.trim();
        if (!naam) return uit.replaceChildren(melding("fout", "Een type bedrijf heeft een naam nodig."));
        const wijziging = { naam, volgorde: Number(r.volgorde.value) || 100, actief: r.actief.checked };
        if (naam === r.b.naam && wijziging.volgorde === r.b.volgorde && wijziging.actief === r.b.actief) continue;
        const { error } = await sb.from("branches").update(wijziging).eq("naam", r.b.naam);
        if (error) return uit.replaceChildren(melding("fout", `Opslaan van "${naam}" lukte niet${error.code === "23505" ? ": die naam bestaat al" : ""}.`));
      }
      if (nieuw.value.trim()) {
        const { error } = await sb.from("branches").insert({ naam: nieuw.value.trim(), volgorde: (Math.max(0, ...rijen.map((r) => Number(r.volgorde.value) || 0)) + 10) });
        if (error) return uit.replaceChildren(melding("fout", error.code === "23505" ? "Dat type bestaat al." : "Toevoegen lukte niet."));
      }
      bewaar("branches", "goed", "Opgeslagen.");
      instellingenScherm();
    }));
    return kaart(el("h2", { text: "Typen bedrijf" }),
      el("p", { text: "De keuzelijst op het aanmeldformulier en de profielpagina. Een nieuwe naam werkt door in de profielen. Zet een type op niet-actief in plaats van het weg te halen." }),
      el("div", { class: "scroll" }, el("table", { class: "tabel" }, el("thead", {}, el("tr", {}, ["Naam", "Volgorde", "Actief"].map((h) => el("th", { text: h })))),
        el("tbody", {}, rijen.map((r) => el("tr", {}, el("td", {}, r.naam), el("td", {}, r.volgorde), el("td", {}, r.actief)))))),
      el("div", { class: "balk" }, nieuw, opslaan), uit);
  }

  async function verzendlogKaart() {
    const { data } = await sb.from("verzendlog").select("aangemaakt_op, email, soort, status, fout, afgeleverd_op").order("id", { ascending: false }).limit(30);
    const SOORT = { welkom: "welkom", melding_bestuur: "melding bestuur", melding_profiel: "profiel ingestuurd", melding_penningmeester: "penningmeester",
      profiel_uitnodiging: "profiellink", adres_gewijzigd: "adres gewijzigd", bevestiging: "bevestiging", uitnodiging: "uitnodiging", herinnering: "herinnering", herinnering_komt: "tot morgen", proef: "proef" };
    return kaart(el("h2", { text: "Laatste mails" }),
      el("p", { class: "hint", text: "'Verzonden' betekent: Brevo heeft de mail aangenomen. Weigert Brevo hem daarna, dan meldt de webhook dat hier als 'geweigerd', met de reden." }),
      el("div", { class: "scroll" }, el("table", { class: "tabel" }, el("tbody", {}, (data ?? []).length ? data.map((l) => el("tr", {},
        el("td", { text: new Date(l.aangemaakt_op).toLocaleString("nl-NL") }), el("td", { text: l.email }), el("td", { text: SOORT[l.soort] ?? l.soort }),
        el("td", {}, pil(l.status === "verzonden" && l.afgeleverd_op ? "afgeleverd" : l.status, l.status === "verzonden" ? "goed" : l.status === "fout" || l.status === "geweigerd" ? "fout" : "")),
        el("td", { text: l.fout ?? "" }))) : el("tr", {}, el("td", { text: "Nog geen mails." }))))));
  }

  sb.auth.onAuthStateChange((event) => { if (event === "SIGNED_IN" || event === "SIGNED_OUT") start(); });
  start();
})();
