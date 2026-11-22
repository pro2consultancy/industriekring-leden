// Beelden voor berichten, in de opbouw van de Verenigingskit (zelfde maten als de klikbare demo, stap 9):
// papierkleur, het motief rechtsboven (ringen, of sterren bij kerst), het oranje datumblok, label, titel,
// twee zinnen, één actie en onderaan het logo. Een eigen foto neemt de plek van het motief in.
// Vierkant 1080 × 1080 (Facebook, WhatsApp), liggend 1200 × 627 (LinkedIn). Alles op een canvas in de browser;
// de functie 'berichten' controleert het resultaat (JPEG, juiste maat) en zet het in de openbare map.
window.ikBeeld = (() => {
  const K = { merk: "#11418E", accent: "#E87500", accentTekst: "#B55A00", papier: "#F6F3EE", lijnPapier: "#DCD5C9", inktZacht: "#3B4650" };
  const MAAT = { vierkant: [1080, 1080], liggend: [1200, 627] };
  let logo = null;

  async function laadAfbeelding(src) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = src;
    await img.decode();
    return img;
  }
  async function voorbereiden() {
    if (!logo) logo = await laadAfbeelding("../assets/logo.png");
    await Promise.all(["700 60px Jost", "600 30px Jost", "400 30px 'Source Sans 3'"].map((f) => document.fonts.load(f).catch(() => null)));
  }

  // Tekst in regels die passen; de laatste regel krijgt "…" als er meer was.
  function regels(ctx, tekst, breed, max) {
    const woorden = String(tekst ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    const uit = [];
    let huidig = "";
    for (let i = 0; i < woorden.length; i++) {
      const proef = huidig ? `${huidig} ${woorden[i]}` : woorden[i];
      if (ctx.measureText(proef).width <= breed || !huidig) { huidig = proef; continue; }
      uit.push(huidig); huidig = woorden[i];
      if (uit.length === max) { huidig = null; break; }
    }
    if (huidig) uit.push(huidig);
    if (uit.length > max || (huidig === null && uit.length === max)) {
      const last = uit.slice(0, max);
      let r = last[max - 1];
      while (r.length > 1 && ctx.measureText(`${r}…`).width > breed) r = r.slice(0, -1);
      last[max - 1] = `${r.replace(/[\s,.;:]+$/, "")}…`;
      return last;
    }
    return uit;
  }
  function spatie(ctx, px) { if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`; }

  function ringen(ctx, W, cq, vierkant) {
    ctx.lineWidth = Math.max(1, 0.17 * cq) * (vierkant ? 1.2 : 1);
    const r = vierkant ? [[42, 13, 17, K.merk], [26, 5, 8, K.accent]] : [[26, 8, 11, K.merk], [16, 3, 5, K.accent]];
    for (const [d, rechts, boven, kleur] of r) {
      const straal = (d * cq) / 2;
      ctx.strokeStyle = kleur;
      ctx.beginPath();
      ctx.arc(W + rechts * cq - straal, -boven * cq + straal, straal, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  function sterren(ctx, W, cq, vierkant) {
    const maat = (vierkant ? 42 : 26) * cq, x0 = W + cq - maat, y0 = -2 * cq, s = maat / 100;
    const ster = (cx, cy, r, draai) => Array.from({ length: 10 }, (_, i) => {
      const h = ((draai + i * 36) * Math.PI) / 180, a = i % 2 ? r * 0.45 : r;
      return [x0 + (cx + a * Math.cos(h)) * s, y0 + (cy + a * Math.sin(h)) * s];
    });
    for (const [cx, cy, r, kleur, vul, draai] of [[64, 36, 27, K.merk, false, -100], [22, 18, 10, K.accent, false, -80], [90, 80, 4.5, K.accent, true, -90]]) {
      const p = ster(cx, cy, r, draai);
      ctx.beginPath();
      p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.lineJoin = "round"; ctx.lineWidth = 0.7 * s; ctx.strokeStyle = kleur; ctx.stroke();
      if (vul) { ctx.fillStyle = kleur; ctx.fill(); }
    }
  }
  function vulFoto(ctx, img, x, y, w, h) {
    const schaal = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const sw = w / schaal, sh = h / schaal;
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
  }
  function datumblok(ctx, x, y, cq, d, m, groot) {
    const pv = groot.pv * cq, ph = groot.ph * cq, fd = groot.d * cq, fm = groot.m * cq, tussen = groot.t * cq;
    ctx.font = `700 ${fd}px Jost`; spatie(ctx, 0);
    const bd = ctx.measureText(d).width;
    ctx.font = `600 ${fm}px Jost`; spatie(ctx, fm * 0.1);
    const bm = ctx.measureText(m.toUpperCase()).width;
    const w = Math.max(bd, bm) + 2 * ph, h = pv * 2 + fd * 0.74 + tussen + fm * 0.74;
    ctx.fillStyle = K.accent; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.font = `700 ${fd}px Jost`; spatie(ctx, 0);
    ctx.fillText(d, x + w / 2, y + pv + fd * 0.74);
    ctx.font = `600 ${fm}px Jost`; spatie(ctx, fm * 0.1);
    ctx.fillText(m.toUpperCase(), x + w / 2, y + pv + fd * 0.74 + tussen + fm * 0.74);
    ctx.textAlign = "left"; spatie(ctx, 0);
    return { w, h };
  }
  // Tekstblok: label, titel, zinnen, actie. Geeft de onderkant terug.
  function tekstblok(ctx, x, y, breed, cq, t, m) {
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    let yy = y;
    ctx.font = `600 ${m.lab * cq}px Jost`; spatie(ctx, m.lab * cq * 0.14); ctx.fillStyle = K.accentTekst;
    const lab = regels(ctx, t.label.toUpperCase(), breed, 1)[0] ?? "";
    yy += m.lab * cq * 0.8; ctx.fillText(lab, x, yy);
    spatie(ctx, 0);
    yy += m.gap * cq;
    ctx.font = `700 ${m.naam * cq}px Jost`; ctx.fillStyle = K.merk;
    for (const r of regels(ctx, t.titel, breed, m.naamRegels)) { yy += m.naam * cq * 1.05; ctx.fillText(r, x, yy - m.naam * cq * 0.25); }
    yy += m.gap * cq;
    ctx.font = `400 ${m.zin * cq}px 'Source Sans 3'`; ctx.fillStyle = K.inktZacht;
    for (const r of regels(ctx, t.tekst, breed, m.zinRegels)) { yy += m.zin * cq * 1.4; ctx.fillText(r, x, yy - m.zin * cq * 0.38); }
    if (t.actie) {
      yy += m.gap * cq;
      ctx.font = `600 ${m.actie * cq}px Jost`; ctx.fillStyle = K.accentTekst;
      for (const r of regels(ctx, t.actie, breed, 2)) { yy += m.actie * cq * 1.2; ctx.fillText(r, x, yy - m.actie * cq * 0.25); }
    }
    return yy;
  }
  function voet(ctx, x, y, breed, cq, logoHoog) {
    ctx.fillStyle = K.lijnPapier; ctx.fillRect(x, y, breed, Math.max(1, cq * 0.1));
    const h = logoHoog * cq, w = (logo.naturalWidth / logo.naturalHeight) * h;
    ctx.drawImage(logo, x, y + 2 * cq, w, h);
  }

  // t = { titel, tekst, label, actie, dag, maand, sfeer: 'standaard'|'kerst' }, foto = HTMLImageElement of null
  async function teken(soort, t, foto) {
    await voorbereiden();
    const [W, H] = MAAT[soort], cq = W / 100, vierkant = soort === "vierkant";
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d");
    ctx.fillStyle = K.papier; ctx.fillRect(0, 0, W, H);
    const metDatum = !!(t.dag && t.maand);

    if (!vierkant) {
      const logoHoog = 7.5, voetY = H - 2.6 * cq - (2 * cq + logoHoog * cq); // bovenkant voetlijn
      const pad = 5 * cq;
      let tekstX = pad, breed;
      if (foto) {
        const fotoX = W - 30 * cq;
        vulFoto(ctx, foto, fotoX, 0, 30 * cq, voetY);
        if (metDatum) { const d = datumblok(ctx, pad, 5 * cq, cq, t.dag, t.maand, { pv: 2.6, ph: 3.4, d: 8.6, m: 2.2, t: 0.9 }); tekstX = pad + d.w + 4 * cq; }
        breed = fotoX - 4 * cq - tekstX;
        tekstblok(ctx, tekstX, 5 * cq, breed, cq, t, { lab: 2, gap: 1.2, naam: 4.2, naamRegels: 2, zin: 2.3, zinRegels: 3, actie: 2.4 });
        voet(ctx, pad, voetY, W - 2 * pad, cq, logoHoog);
      } else {
        (t.sfeer === "kerst" ? sterren : ringen)(ctx, W, cq, false);
        if (metDatum) { datumblok(ctx, pad, pad, cq, t.dag, t.maand, { pv: 2.6, ph: 3.4, d: 8.6, m: 2.2, t: 0.9 }); tekstX = pad + 24 * cq + 4 * cq; }
        breed = W - pad - 13 * cq - tekstX;
        tekstblok(ctx, tekstX, pad, breed, cq, t, { lab: 2, gap: 1.2, naam: 4.6, naamRegels: 2, zin: 2.3, zinRegels: 3, actie: 2.4 });
        voet(ctx, pad, voetY, W - 2 * pad, cq, logoHoog);
      }
    } else {
      const pad = 7 * cq;
      if (foto) {
        const logoHoog = 8.5, fotoH = 36 * cq;
        vulFoto(ctx, foto, 0, 0, W, fotoH);
        let y = fotoH + 4 * cq;
        if (metDatum) {
          const proef = document.createElement("canvas").getContext("2d"); // alleen meten: hoe hoog wordt het blok
          const d = datumblok(proef, 0, 0, cq, t.dag, t.maand, { pv: 2.8, ph: 3.8, d: 9, m: 3, t: 1 });
          datumblok(ctx, pad, fotoH - d.h, cq, t.dag, t.maand, { pv: 2.8, ph: 3.8, d: 9, m: 3, t: 1 });
        }
        tekstblok(ctx, pad, y, W - 2 * pad, cq, t, { lab: 2.8, gap: 1.6, naam: 5.8, naamRegels: 2, zin: 3.5, zinRegels: 2, actie: 3.4 });
        voet(ctx, pad, H - 4 * cq - 3 * cq - logoHoog * cq, W - 2 * pad, cq, logoHoog);
      } else {
        const logoHoog = 10;
        (t.sfeer === "kerst" ? sterren : ringen)(ctx, W, cq, true);
        let y = pad;
        if (metDatum) { const d = datumblok(ctx, pad, pad, cq, t.dag, t.maand, { pv: 3.4, ph: 4.4, d: 11, m: 3, t: 1 }); y = pad + d.h + 4 * cq; }
        else y = pad + 14 * cq;
        tekstblok(ctx, pad, y, W - 2 * pad, cq, t, { lab: 2.8, gap: 2, naam: 7.2, naamRegels: 3, zin: 3.5, zinRegels: 3, actie: 3.4 });
        voet(ctx, pad, H - 4 * cq - 3 * cq - logoHoog * cq, W - 2 * pad, cq, logoHoog);
      }
    }
    return c;
  }

  const naarJpeg = (canvas, kwaliteit = 0.9) => canvas.toDataURL("image/jpeg", kwaliteit).replace(/^data:image\/jpeg;base64,/, "");

  // Eigen foto verkleinen tot hooguit 1600 px (JPEG); geeft base64 en een bruikbaar beeld terug.
  async function fotoUitBestand(bestand) {
    const url = URL.createObjectURL(bestand);
    try {
      const img = await laadAfbeelding(url);
      const schaal = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * schaal), h = Math.round(img.naturalHeight * schaal);
      if (w < 200 || h < 200) throw new Error("De foto is te klein (minstens 200 pixels breed en hoog).");
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      const b64 = naarJpeg(c, 0.88);
      return { b64, img: await laadAfbeelding(`data:image/jpeg;base64,${b64}`) };
    } finally { URL.revokeObjectURL(url); }
  }

  return { teken, naarJpeg, fotoUitBestand, laadAfbeelding, MAAT };
})();
