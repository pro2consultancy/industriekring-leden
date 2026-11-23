// Het formulier voor het bedrijfsprofiel, met het voorbeeld van de kaart en de bedrijfspagina ernaast.
// Eén formulier voor twee plekken: de profielpagina van het lid (modus "lid") en het invullen namens het lid in
// het beheer (modus "beheer"). Zelfde velden, zelfde beeldverwerking; de server doet dezelfde controles
// (_shared/profielinvoer.ts). Verschil: het lid moet alle verplichte velden invullen, het beheer mag een concept
// opslaan, en de contactgegevens staan alleen bij het lid (het beheer past die aan bij Leden).
//
// ik.profielFormulier(d, opties)
//   d       = antwoord van de functie (bedrijf, profiel, branches, keuzelijsten, locatie, op_website_toegestaan, contact)
//   opties  = { modus, foto(dataUrl) -> {foto_pad}, opslaan(body) -> antwoord, klaar(antwoord, body), bevestigVraag?, knopTekst? }
(() => {
  const { el } = window.ik;
  const melding = (soort, tekst) => el("div", { class: `melding ${soort}`, role: soort === "fout" ? "alert" : "status" }, tekst);
  let volgnr = 0;

  // Afbeelding in de browser verkleinen en opnieuw opslaan als JPEG: kleiner bestand, en locatie- en
  // andere gegevens uit de camera gaan er zo vanzelf uit. Op de website komt hij als 4:3 (1024 × 768).
  function verklein(bestand) {
    return new Promise((klaar, mis) => {
      const lezer = new FileReader();
      lezer.onerror = () => mis(new Error("Deze afbeelding kon niet worden gelezen. Probeer een ander bestand."));
      lezer.onload = () => {
        const img = new Image();
        img.onerror = () => mis(new Error("Deze afbeelding kon niet worden gelezen. Probeer een ander bestand."));
        img.onload = () => {
          const schaal = Math.min(1, 1200 / Math.max(img.width, img.height));
          const c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(img.width * schaal)); c.height = Math.max(1, Math.round(img.height * schaal));
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
          // Lichte hoeken wijzen op een logo: dan de hele afbeelding tonen. Anders is het een foto die het vak vult.
          const licht = (x, y) => { const p = ctx.getImageData(x, y, 1, 1).data; return p[0] > 232 && p[1] > 232 && p[2] > 232; };
          const hoeken = [[1, 1], [c.width - 2, 1], [1, c.height - 2], [c.width - 2, c.height - 2]];
          klaar({ data: c.toDataURL("image/jpeg", 0.85), pas: hoeken.every(([x, y]) => licht(Math.max(0, x), Math.max(0, y))) ? "passend" : "vullend" });
        };
        img.src = lezer.result;
      };
      lezer.readAsDataURL(bestand);
    });
  }

  // Verplichte velden die nog leeg zijn (zelfde regel als de server).
  function ontbreekt(v) {
    return [!v.branche && "Type bedrijf", !v.kort && "Korte tekst voor de kaart", v.foto_pad && !v.foto_toestemming && "Toestemming voor het logo"].filter(Boolean);
  }

  function profielFormulier(d, opties) {
    const beheer = opties.modus === "beheer";
    const n = ++volgnr;
    const id = (x) => `pf${n}-${x}`;
    const veld = (label, invoer, ...extra) => el("div", { class: "veld" }, el("label", { for: invoer.id, text: label }), invoer, ...extra);
    const p = d.profiel;
    const s = { foto: p.foto_url, fotoPad: p.foto_pad, pas: p.foto_weergave || "passend" };
    const branche = el("select", { id: id("branche"), required: !beheer },
      el("option", { value: "", text: "Kies…" }), d.branches.map((b) => el("option", { value: b, text: b, selected: b === p.branche })));
    const kort = el("textarea", { id: id("kort"), maxlength: "300", required: !beheer }, p.kort ?? "");
    const teller = el("span", { class: "teller", "aria-live": "off" });
    const lang = el("textarea", { id: id("lang"), maxlength: "1500", style: "min-height:130px" }, p.lang ?? "");
    const site = el("input", { id: id("site"), type: "url", maxlength: "200", value: p.website ?? "", autocomplete: beheer ? "off" : "url", placeholder: "www.jouwbedrijf.nl" });
    const keuze = (x, lijst, waarde) => el("select", { id: id(x) }, el("option", { value: "", text: "Niet tonen" }), (lijst ?? []).map((w) => el("option", { value: w, text: w, selected: w === waarde })));
    const medewerkers = keuze("medewerkers", d.medewerkers_keuzes, p.medewerkers);
    const werkgebied = keuze("werkgebied", d.werkgebied_keuzes, p.werkgebied);
    const sinds = el("input", { id: id("sinds"), type: "number", inputmode: "numeric", min: "1800", max: String(new Date().getFullYear()), step: "1", value: p.bestaat_sinds ?? "", placeholder: "bijv. 1998" });
    const bestand = el("input", { id: id("foto"), type: "file", accept: "image/jpeg,image/png,image/webp" });
    const fotoHint = el("span", { class: "hint" });
    const toestemming = el("input", { type: "checkbox", id: id("toestemming"), checked: !!p.foto_toestemming });
    const toestemmingRij = el("label", { class: "vink", for: toestemming.id }, toestemming, el("span", { text: beheer
      ? "Het bedrijf geeft toestemming om dit logo (of deze foto) op de website van de kring te gebruiken."
      : "Ik mag dit logo (of deze foto) gebruiken op de website van de kring." }));
    const pasKnop = (waarde, tekst) => el("button", { type: "button", class: "knop tweede klein", "data-pas": waarde, text: tekst, onclick: () => { s.pas = waarde; teken(); } });
    const pasKeuze = el("div", { class: "fotokeuze" }, pasKnop("passend", "Hele afbeelding tonen"), pasKnop("vullend", "Vak vullen"),
      el("button", { type: "button", class: "knop stil klein", text: "Logo weghalen", onclick: () => { s.foto = null; s.fotoPad = null; bestand.value = ""; teken(); } }),
      el("span", { class: "hint", text: "Een logo staat het best in zijn geheel; een foto mag het vak vullen." }));
    const opSite = el("input", { type: "checkbox", id: id("opsite"), checked: d.op_website_toegestaan !== false });
    const metNaam = el("input", { type: "checkbox", id: id("metnaam"), checked: !!p.toon_contactpersoon });
    const c = beheer ? null : d.contact;
    const cNaam = c ? el("input", { id: id("c-naam"), type: "text", maxlength: "120", value: c.naam ?? "", autocomplete: "name" }) : null;
    const cMail = c ? el("input", { id: id("c-mail"), type: "email", maxlength: "200", value: c.email ?? "", autocomplete: "email" }) : null;
    const cTel = c ? el("input", { id: id("c-tel"), type: "tel", maxlength: "30", value: c.telefoon ?? "", autocomplete: "tel" }) : null;
    const knopTekst = opties.knopTekst ?? (beheer ? "Opslaan" : "Profiel insturen");
    const knop = el("button", { type: "submit", class: "knop", text: knopTekst });
    const nogLeeg = el("div", { "aria-live": "polite" });
    const uit = el("div", { "aria-live": "polite" });
    const voorbeeld = el("div");
    const pagina = el("div");

    function teken() {
      teller.textContent = `${kort.value.length} / 300`;
      fotoHint.textContent = s.foto ? "" : beheer
        ? "Nog geen logo; de kaart toont de initialen."
        : "Nog geen logo; de kaart toont je initialen. Geen logo bij de hand? Een foto van je bedrijf kan ook.";
      pasKeuze.hidden = !s.foto; toestemmingRij.hidden = !s.foto;
      for (const b of pasKeuze.querySelectorAll("[data-pas]")) b.setAttribute("aria-pressed", String(b.dataset.pas === s.pas));
      voorbeeld.replaceChildren(window.ik.lidkaart({ naam: d.bedrijf.naam, branche: branche.value || "Type bedrijf", kort: kort.value.trim(), foto: s.foto, pas: s.pas }));
      // De bedrijfspagina: alleen ingevulde regels; zo staan ze straks ook op de site.
      const beeld = el("div", { class: `lp-beeld${s.foto && s.pas !== "vullend" ? " passend" : ""}` }, s.foto ? null : el("span", { class: "mono", "aria-hidden": "true", text: window.ik.initialen(d.bedrijf.naam) }));
      if (s.foto) beeld.style.backgroundImage = `url(${JSON.stringify(String(s.foto))})`;
      const jaar = /^\d{4}$/.test(sinds.value.trim()) ? sinds.value.trim() : "";
      const regels = [["Locatie", d.locatie], ["Medewerkers", medewerkers.value], ["Bestaat sinds", jaar], ["Werkgebied", werkgebied.value]].filter(([, w]) => w);
      pagina.replaceChildren(el("div", { class: "lidpagina" }, beeld,
        el("div", { class: "lp-band" }, el("strong", { text: d.bedrijf.naam }), el("span", { text: branche.value || "Type bedrijf" })),
        el("h4", { text: "Over het bedrijf" }),
        el("p", { class: "lp-tekst", text: lang.value.trim() || kort.value.trim() || "Hier komt de tekst bij “Meer over je bedrijf”." }),
        el("div", { class: "lp-info" }, el("div", { class: "lp-kop", text: "Bedrijfsinformatie" }),
          regels.length ? regels.map(([k, w]) => el("div", { text: `${k}: ${w}` })) : el("div", { class: "leeg", text: "Nog geen bedrijfsinformatie ingevuld." }),
          site.value.trim() ? el("div", { class: "lp-knop", text: "Contact opnemen →" }) : null)));
      // In het beheer: welke verplichte velden nog leeg zijn (dan wordt het een concept).
      if (beheer) {
        const leeg = ontbreekt({ branche: branche.value, kort: kort.value.trim(), foto_pad: s.fotoPad, foto_toestemming: toestemming.checked });
        nogLeeg.replaceChildren(leeg.length
          ? melding("let", `Nog leeg: ${leeg.join(", ")}. Je kunt opslaan als concept; het lid ziet wat al is ingevuld. De toestemming voor de website wordt pas vastgelegd als alles is ingevuld.`)
          : melding("goed", "Alle verplichte velden zijn ingevuld. Opslaan geldt als nagekeken door het bestuur."));
      }
    }
    for (const x of [branche, kort, lang, sinds, site]) x.addEventListener("input", teken);
    for (const x of [branche, medewerkers, werkgebied, toestemming]) x.addEventListener("change", teken);

    bestand.addEventListener("change", async () => {
      const f = bestand.files?.[0];
      if (!f) return;
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { fotoHint.textContent = "Kies een JPG-, PNG- of WebP-bestand."; return; }
      if (f.size > 12 * 1024 * 1024) { fotoHint.textContent = "Dit bestand is te groot. Kies een afbeelding tot 12 MB."; return; }
      fotoHint.textContent = "Bezig met laden…";
      try {
        const v = await verklein(f);
        const r = await opties.foto(v.data);
        s.foto = v.data; s.fotoPad = r.foto_pad; s.pas = v.pas;
        teken();
        fotoHint.textContent = `${f.name} is geladen.`;
      } catch (err) { fotoHint.textContent = err.message; }
    });

    const form = el("form", { class: "kaart", novalidate: true },
      el("div", { class: "veld" }, el("span", { class: "groeplabel", text: "Logo" }),
        el("div", { class: "fotokeuze" }, bestand, el("label", { for: bestand.id, class: "knop tweede klein", text: beheer ? "Kies het logo" : "Kies je logo" }), fotoHint),
        pasKeuze, toestemmingRij),
      veld("Type bedrijf", branche),
      veld("Korte tekst voor de kaart", kort, teller),
      veld(beheer ? "Meer over het bedrijf" : "Meer over je bedrijf", lang, el("span", { class: "hint", text: "Komt achter “Lees verder”." })),
      veld("Website", site),
      el("div", { class: "groep" }, el("h3", { text: "Bedrijfsinformatie op de website" }),
        el("p", { class: "hint", text: d.locatie ? `Locatie: ${d.locatie}. Dit adres komt uit de ledenadministratie${beheer ? "; aanpassen kan bij Leden." : "; klopt het niet, laat het het bestuur weten."}` : beheer ? "Er staat nog geen adres in de ledenadministratie; vul het in bij Leden." : "Er staat nog geen adres in de ledenadministratie; laat het bestuur weten welk adres op de kaart mag." }),
        el("div", { class: "twee" }, veld("Medewerkers", medewerkers), veld("Bestaat sinds", sinds)),
        veld("Werkgebied", werkgebied)),
      c ? el("div", { class: "groep" }, el("h3", { text: "Kloppen je gegevens nog?" }),
        el("div", { class: "twee" }, veld("Contactpersoon", cNaam), veld("E-mailadres", cMail)),
        veld("Mobiel nummer", cTel, el("span", { class: "hint", text: "Voor de WhatsApp-berichten van de kring." }))) : null,
      el("label", { class: "vink", for: opSite.id }, opSite, el("span", { text: beheer ? "Het bedrijf heeft toestemming gegeven om op de website van de kring te staan." : "Ons bedrijf mag op de website van de kring staan." })),
      el("label", { class: "vink", for: metNaam.id }, metNaam, el("span", { text: beheer ? "De naam van de contactpersoon mag erbij." : "Mijn naam mag erbij als contactpersoon." })),
      nogLeeg, el("div", {}, knop), uit);

    // Bevestigen (bijv. een profiel overschrijven dat het lid zelf instuurde): eerst klikken, dan nog eens.
    let gewapend = false, timer;
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      uit.replaceChildren();
      for (const x of form.querySelectorAll(".ongeldig")) x.classList.remove("ongeldig");
      const fout = (invoer, tekst) => { if (invoer) { invoer.classList.add("ongeldig"); invoer.focus(); } uit.replaceChildren(melding("fout", tekst)); };
      if (!beheer) {
        if (!branche.value) return fout(branche, "Kies een type bedrijf.");
        if (!kort.value.trim()) return fout(kort, "Schrijf een korte tekst voor de kaart.");
        if (s.foto && !toestemming.checked) return fout(toestemming, "Bevestig dat je deze afbeelding op de website mag gebruiken.");
      }
      const jaar = sinds.value.trim();
      if (jaar && !(/^\d{4}$/.test(jaar) && +jaar >= 1800 && +jaar <= new Date().getFullYear())) return fout(sinds, "Vul bij 'Bestaat sinds' een jaartal in, bijvoorbeeld 1998.");
      if (c && !cNaam.value.trim()) return fout(cNaam, "Vul de naam van de contactpersoon in.");
      if (c && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(cMail.value.trim())) return fout(cMail, "Vul een e-mailadres in, bijvoorbeeld naam@bedrijf.nl.");
      if (opties.bevestigVraag && !gewapend) {
        gewapend = true; knop.textContent = opties.bevestigVraag; knop.classList.add("tweede");
        timer = setTimeout(() => { gewapend = false; knop.textContent = knopTekst; knop.classList.remove("tweede"); }, 8000);
        return;
      }
      clearTimeout(timer);
      const body = {
        branche: branche.value, kort: kort.value, lang: lang.value, website: site.value,
        foto_pad: s.fotoPad ?? null, foto_weergave: s.pas, foto_toestemming: toestemming.checked,
        toon_contactpersoon: metNaam.checked, op_website: opSite.checked,
        medewerkers: medewerkers.value || null, werkgebied: werkgebied.value || null, bestaat_sinds: jaar ? Number(jaar) : null,
        contact: c ? { naam: cNaam.value, email: cMail.value, telefoon: cTel.value } : undefined,
        bevestigd: opties.bevestigVraag ? true : undefined,
      };
      knop.disabled = true; knop.textContent = "Bezig…";
      try {
        const r = await opties.opslaan(body);
        opties.klaar(r, body);
      } catch (err) {
        uit.replaceChildren(melding("fout", err.message));
      } finally {
        gewapend = false; knop.disabled = false; knop.textContent = knopTekst; knop.classList.remove("tweede");
      }
    });

    teken();
    return el("div", { class: "profiel" }, form,
      el("aside", { class: "voorbeeld", "aria-label": beheer ? "Voorbeeld van de kaart en de bedrijfspagina" : "Voorbeeld van je kaart en je bedrijfspagina" },
        el("span", { class: "label", text: beheer ? "Zo komt het bedrijf op de website" : "Zo kom je op de website" }), voorbeeld,
        el("span", { class: "label", text: beheer ? "Na “Lees verder”: de bedrijfspagina" : "Na “Lees verder”: je bedrijfspagina", style: "margin-top:8px" }), pagina,
        el("span", { class: "hint", text: beheer ? "Op de website komt het beeld als 4:3 (1024 × 768)." : "Het bestuur kijkt het profiel na voordat het zichtbaar wordt." })));
  }

  window.ik.profielFormulier = profielFormulier;
  window.ik.profielOntbreekt = ontbreekt;
})();
