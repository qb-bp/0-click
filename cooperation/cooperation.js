/* ════════════════════════════════════════════════════════════════
   /cooperation — Phase 1.
   Regime toggle (RNP / RVP) + 3-question configurator + .txt
   download + auto-vcf import. ZDR-clean.

   Content mirrors aigent-smith #builder (sister authoring) —
   question labels, hints, regime framing, NIS2 mapping.

   Phase 1 scope:  regime + 3 inputs, validation, TXT download
                   with inputs echoed + NIS2 mapping + regime-
                   specific framing + Phase 2 placeholder.
                   Auto-import contact.vcf on page load (mobile).
   Phase 2 scope:  service catalog + per-input recommendation
                   matrix + MD/CZK pricing.

   vCard contents: edit /cooperation/contact.vcf directly.
   ════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ─── NIS2 areas (mirrors aigent-smith structure, clean Czech) ──────
  // 10 areas; aigent splits čl. 21 odst. 2 písm. e) into e1/e2 and
  // merges písm. j) (MFA) into i (IAM/MFA/přístupové řízení) to match
  // RNP/RVP delivery reality. We mirror that.
  const NIS2_AREAS = [
    { code: 'a',  name: 'Politiky řízení rizik',            art: 'čl. 21 odst. 2 písm. a)' },
    { code: 'b',  name: 'Řízení incidentů',                  art: 'čl. 21 odst. 2 písm. b)' },
    { code: 'c',  name: 'Kontinuita a krizové řízení',       art: 'čl. 21 odst. 2 písm. c)' },
    { code: 'd',  name: 'Bezpečnost dodavatelského řetězce', art: 'čl. 21 odst. 2 písm. d)' },
    { code: 'e1', name: 'Bezpečnost sítí a systémů',         art: 'čl. 21 odst. 2 písm. e)' },
    { code: 'e2', name: 'Bezpečný vývoj a SDLC',             art: 'čl. 21 odst. 2 písm. e)' },
    { code: 'f',  name: 'Hodnocení účinnosti opatření',      art: 'čl. 21 odst. 2 písm. f)' },
    { code: 'g',  name: 'Školení a osvěta',                  art: 'čl. 21 odst. 2 písm. g)' },
    { code: 'h',  name: 'Kryptografie',                      art: 'čl. 21 odst. 2 písm. h)' },
    { code: 'i',  name: 'IAM, MFA, přístupové řízení',       art: 'čl. 21 odst. 2 písm. i+j)' },
  ];

  // ─── input definitions (mirrors aigent-smith scope-survey verbatim) ─
  const INPUTS = {
    size: {
      label: 'Velikost organizace',
      options: {
        mala:    { label: 'Malá',    hint: 'do 50 zaměstnanců · do 50 endpointů' },
        stredni: { label: 'Střední', hint: '50–250 zaměstnanců · multi-team' },
        velka:   { label: 'Velká',   hint: '250+ zaměstnanců · multi-site' },
      },
    },
    docs: {
      label: 'Aktuální stav dokumentace',
      options: {
        'have-recent': { label: 'Audit ≤ 12 měsíců', hint: 'máme platný nezávislý posudek' },
        'have-policy': { label: 'Politika KIB',      hint: 'máme dokumentaci, ne audit' },
        'starting':    { label: 'Začínáme od nuly',  hint: 'bez dokumentace ani auditu' },
      },
    },
    goal: {
      label: 'Primární cíl',
      options: {
        'compliance':    { label: 'Compliance baseline',  hint: 'papírová shoda na inspekci NÚKIB' },
        'tech-security': { label: 'Technická bezpečnost', hint: 'redukce attack surface' },
        'audit-ready':   { label: 'Audit-ready',          hint: 'příprava na ISO 27001 / NÚKIB' },
      },
    },
  };

  // ─── regime recommendations (content mirrors aigent REGIME_RECOMMENDATIONS) ─
  // Abbrev RVP per author preference (NÚKIB standard uses VPP) — parallel to RNP for visual symmetry.
  const REGIME_RECOMMENDATIONS = {
    lower: {
      abbrev: 'RNP',
      fullName: 'Režim nižších povinností',
      tag: 'Doporučení · Režim nižších povinností',
      title: 'Pro nižší povinnosti vám stačí Phase 0 + Pověřená osoba KB · Basic.',
      text: 'Vyhláška 410/2025 Sb. v RNP nezná formální role „Manažer" ani „Architekt" — definuje pouze osobu pověřenou kybernetickou bezpečností (§ 4). Naše služba pověřené osoby (B2B známá jako „Manažer") plus Phase 0 jako nezávislý vstupní pohled vám pokryje minimální povinnosti RNP.',
      role: 'Pověřená osoba kybernetickou bezpečností',
      roleDesc: 'Vaše interní osoba pověřená KB nemusí utopit 80 % času v byrokracii. NÚKIB v manuálu RNP připouští, že pověřenou osobou může být váš zaměstnanec IT — nepotřebujete certifikovaného CISO.',
      roleRef: '§ 4 vyhl. 410/2025 Sb.',
    },
    higher: {
      abbrev: 'RVP',
      fullName: 'Režim vyšších povinností',
      tag: 'Doporučení · Režim vyšších povinností',
      title: 'Pro vyšší povinnosti potřebujete formálně Manažera KB i Architekta KB.',
      text: 'Na splnění zákonné povinnosti oddělení rolí (§ 5 vyhl. 409/2025 Sb.) v režimu vyšších povinností potřebujete formálně pokrýt roli Manažera KB i Architekta KB. Obě role zajistíme as-a-service.',
      role: 'Manažer kybernetické bezpečnosti — fractional CISO',
      roleDesc: 'Formální role Manažera KB (3+ roky praxe) jako embedded fractional CISO. Oddělení rolí podle § 5 odst. 2 vyhl. 409 — Manažer KB i Architekt KB, dvě nezávislé role pro vyšší povinnosti.',
      roleRef: '§ 5 vyhl. 409/2025 Sb.',
    },
  };

  // ─── pricing logic (verbatim port from aigent-smith) ───────────────
  // Source: aigent-smith #builder Nis2ProductBoard pricingLogic.
  // 6-package matrix (A–F) keyed by selectPackage(regime + size + goal).
  // Pricing constants drive computeDynamicPricing() — MD per month,
  // CZK per month, Phase 0 setup range, annual total.
  const RATE_CZK_PER_MD = 10000;
  const SIZE_BASE_MD     = { mala: 2, stredni: 4, velka: 6 };
  const DOC_MULTIPLIER   = { 'have-recent': 0.70, 'have-policy': 0.90, 'starting': 1.50 };
  const GOAL_MULTIPLIER  = { 'compliance': 1.00, 'tech-security': 1.30, 'audit-ready': 1.20 };
  const PHASE0_BASE_MD   = {
    mala:    { low: 10, high: 15 },
    stredni: { low: 18, high: 28 },
    velka:   { low: 30, high: 40 },
  };
  const PHASE0_DOC_FACTOR = { 'have-recent': 0.60, 'have-policy': 0.85, 'starting': 1.00 };
  const DOC_VERB = {
    'have-recent': 'Revize a kontrola souladu',
    'have-policy': 'Aktualizace a GAP-fill',
    'starting':    'Implementace a tvorba dokumentace',
  };

  const PACKAGE_MATRIX = {
    A: {
      code: 'A',
      title: 'RNP Compliance Baseline · Malá firma',
      deliverables: 'Vyplněný Přehled NÚKIB v10 (131 opatření), Politika KIB pre-filled, Risk Register baseline, 12-měsíční Roadmapa, podklad pro § 14 (BIA), Executive Summary',
      paragraphs: '§ 3, § 4, § 5, § 6, § 10, § 14 vyhl. 410/2025 Sb.',
      role: 'Pověřená osoba KB · Basic (4 h/týden)',
      capacity: '6 takových klientů na 1 experta = cíl 12 MD/měs.',
    },
    B: {
      code: 'B',
      title: 'RNP Compliance Baseline · Střední firma',
      deliverables: 'Vše z balíčku A + Combined assessment (interní pentest, AD audit, segmentační test) + měsíční board status',
      paragraphs: '§ 3, § 4, § 5, § 6, § 10, § 14 vyhl. 410/2025 Sb.',
      role: 'Pověřená osoba KB · Basic (8 h/týden)',
      capacity: '3 takoví klienti na 1 experta = cíl 12 MD/měs.',
    },
    C: {
      code: 'C',
      title: 'RNP Tech-First · Střední firma',
      deliverables: 'Plný Combined assessment + supply-chain pivot enumerace + kontinuální Pověřená osoba Pro + Konzultant pro segmentaci a MFA rollout (40 MD package)',
      paragraphs: '§ 3, § 4, § 5, § 6, § 7, § 8, § 10, § 11, § 14 vyhl. 410/2025 Sb.',
      role: 'Pověřená osoba KB · Pro (12 h/týden) + Konzultant',
      capacity: '~2 klienti na 1 experta = cíl 12 MD/měs.',
    },
    D: {
      code: 'D',
      title: 'RNP Audit-Ready · Velká firma',
      deliverables: 'Phase 0 plný scope multi-site + Pověřená osoba Pro 16 h/týden + Add-on ISO 27001 Certification (25–50 MD spread přes 12 měs.)',
      paragraphs: '§ 3, § 4, § 5, § 6, § 7, § 8, § 9, § 10, § 11, § 12, § 13, § 14 vyhl. 410/2025 Sb. + ISO 27001 Annex A',
      role: 'Pověřená osoba KB · Pro (16 h/týden) + Add-on ISO 27001',
      capacity: '1 klient = cíl 12 MD/měs. (⚠ 250+ zam. = RVP-trigger check)',
      warning: 'Pozor: 250+ zaměstnanců často znamená RVP-trigger. Při scoping callu ověříme, zda přechod do RVP (vyhl. 409/2025 Sb.) není nezbytný — pokud ano, kontrakt se rebaseuje na balíček E nebo F.',
    },
    E: {
      code: 'E',
      title: 'RVP Standard · Střední firma',
      deliverables: 'RVP-grade Phase 0 + 542-měrní Auditní checklist + Manažer kybernetické bezpečnosti (Standard) + Architekt KB on-demand',
      paragraphs: '§ 3 – § 32 vyhl. 409/2025 Sb. + ZKB § 12',
      role: 'Manažer KB · Standard (16–24 h/týden) + Architekt KB per MD',
      capacity: '1 klient = cíl 12 MD/měs.',
    },
    F: {
      code: 'F',
      title: 'RVP Enterprise · Velká firma',
      deliverables: 'Enterprise RVP scope vč. multi-site, OT/IoT, supply-chain + Manažer KB Senior (embedded fractional CISO) + Architekt KB intensive',
      paragraphs: 'Plný RVP scope vyhl. 409/2025 Sb. + sektorové (DORA, AI Act, NIS2 entity-essential)',
      role: 'Manažer KB · Senior (24–32 h/týden) + Architekt KB intensive',
      capacity: '1 klient = 12+ MD/měs. (Senior tier max kapacita 1 experta)',
    },
  };

  function selectPackage() {
    if (STATE.regime === 'higher') {
      return STATE.size === 'velka' ? 'F' : 'E';
    }
    // RNP branch
    if (STATE.size === 'mala') return 'A';
    if (STATE.size === 'velka') return 'D';
    // Střední (RNP)
    if (STATE.goal === 'tech-security') return 'C';
    return 'B';
  }

  function computeDynamicPricing() {
    if (!STATE.size || !STATE.docs || !STATE.goal) return null;
    const regimeMul = STATE.regime === 'higher' ? 2.0 : 1.0;
    const baseMD = SIZE_BASE_MD[STATE.size] * regimeMul;
    const monthlyMD = Math.round(baseMD * DOC_MULTIPLIER[STATE.docs] * GOAL_MULTIPLIER[STATE.goal] * 10) / 10;
    const monthlyCZK = Math.round(monthlyMD * RATE_CZK_PER_MD);

    const p0Base = PHASE0_BASE_MD[STATE.size];
    const p0Factor = PHASE0_DOC_FACTOR[STATE.docs];
    const p0Low = Math.round(p0Base.low * p0Factor);
    const p0High = Math.round(p0Base.high * p0Factor);
    const p0LowCZK = p0Low * RATE_CZK_PER_MD;
    const p0HighCZK = p0High * RATE_CZK_PER_MD;

    const annualLow = p0LowCZK + 12 * monthlyCZK;
    const annualHigh = p0HighCZK + 12 * monthlyCZK;

    const roleName = STATE.regime === 'higher'
      ? 'Manažer kybernetické bezpečnosti'
      : 'Osoba pověřená kybernetickou bezpečností';
    const tierName = (function () {
      if (STATE.regime === 'higher') return monthlyMD >= 12 ? 'Senior (24–32 h/týden)' : 'Standard (16–24 h/týden)';
      return monthlyMD >= 6 ? 'Pro (8–16 h/týden)' : 'Basic (4–8 h/týden)';
    })();

    const docVerb = DOC_VERB[STATE.docs];
    const vppTrigger = (STATE.regime === 'lower' && STATE.size === 'velka');
    const pkg = PACKAGE_MATRIX[selectPackage()];

    return {
      pkg, monthlyMD, monthlyCZK, p0Low, p0High, p0LowCZK, p0HighCZK,
      annualLow, annualHigh, roleName, tierName, docVerb, vppTrigger,
    };
  }

  // Czech-style number formatting: 1 234 567 (non-breaking spaces)
  function fmtCZK(n) {
    return new Intl.NumberFormat('cs-CZ').format(n).replace(/\s/g, ' ') + ' Kč';
  }

  // ─── state ──────────────────────────────────────────────────────────
  const STATE = {
    regime: 'lower', // 'lower' = RNP | 'higher' = RVP
    size: null,
    docs: null,
    goal: null,
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  function answeredCount() {
    return ['size', 'docs', 'goal'].filter(k => STATE[k] !== null).length;
  }
  function allAnswered() {
    return answeredCount() === 3;
  }

  // ─── render ─────────────────────────────────────────────────────────
  function render() {
    // regime buttons
    $$('.regime-btn').forEach(btn => {
      const active = btn.dataset.regime === STATE.regime;
      btn.dataset.active = active ? '1' : '0';
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    // regime info panel (role + short desc + § ref)
    const rec = REGIME_RECOMMENDATIONS[STATE.regime];
    const infoEl = $('#regimeInfo');
    if (infoEl && rec) {
      const role = $('.regime-info-role', infoEl);
      const desc = $('.regime-info-desc', infoEl);
      const ref  = $('.regime-info-ref', infoEl);
      if (role) role.textContent = rec.role;
      if (desc) desc.textContent = rec.roleDesc;
      if (ref)  ref.textContent  = rec.roleRef;
      infoEl.dataset.regime = STATE.regime;
    }

    // configurator steps
    $$('.cfg-step').forEach(stepEl => {
      const key = stepEl.dataset.input;
      const val = STATE[key];
      stepEl.dataset.answered = val ? '1' : '0';

      const valEl = $('.cfg-step-value', stepEl);
      if (val && INPUTS[key].options[val]) {
        valEl.textContent = INPUTS[key].options[val].label;
        valEl.dataset.set = '1';
      } else {
        valEl.textContent = 'nevybráno';
        valEl.dataset.set = '0';
      }

      $$('.cfg-opt', stepEl).forEach(btn => {
        btn.dataset.selected = (btn.dataset.value === val) ? '1' : '0';
      });
    });

    // download state line
    const count = answeredCount();
    const stateEl = $('#dlState');
    const btn = $('#btnExport');
    if (allAnswered()) {
      stateEl.textContent = 'připraveno ke stažení — 3/3';
      btn.removeAttribute('disabled');
    } else {
      stateEl.textContent = 'čekám na odpovědi — ' + count + '/3';
      btn.setAttribute('disabled', '');
    }

    // live recommendation block
    renderRecommendation();
  }

  // ─── recommendation block render ───────────────────────────────────
  function renderRecommendation() {
    const el = $('#recoBlock');
    if (!el) return;

    const p = computeDynamicPricing();
    if (!p) {
      el.dataset.state = 'empty';
      el.innerHTML = '<p class="reco-empty">Vyberte režim a odpovězte na 3 otázky — doporučený balíček se zobrazí zde.</p>';
      return;
    }

    el.dataset.state = 'filled';
    const w = p.vppTrigger
      ? `<div class="reco-warning">⚠ ${p.pkg.warning}</div>`
      : '';

    el.innerHTML = `
      <div class="reco-head">
        <span class="reco-code">${p.pkg.code}</span>
        <h3 class="reco-title">${p.pkg.title}</h3>
      </div>

      <div class="reco-role">
        <div class="reco-role-name">${p.roleName}</div>
        <div class="reco-role-tier">${p.tierName}</div>
      </div>

      <div class="reco-pricing">
        <div class="reco-pricing-row">
          <span class="reco-pricing-lbl">Setup (Phase 0)</span>
          <span class="reco-pricing-md">${p.p0Low}–${p.p0High} MD</span>
          <span class="reco-pricing-czk">${fmtCZK(p.p0LowCZK)} – ${fmtCZK(p.p0HighCZK)}</span>
        </div>
        <div class="reco-pricing-row">
          <span class="reco-pricing-lbl">Měsíčně</span>
          <span class="reco-pricing-md">${p.monthlyMD} MD</span>
          <span class="reco-pricing-czk">${fmtCZK(p.monthlyCZK)}/měs.</span>
        </div>
        <div class="reco-pricing-row reco-pricing-annual">
          <span class="reco-pricing-lbl">Ročně celkem</span>
          <span class="reco-pricing-md"></span>
          <span class="reco-pricing-czk">${fmtCZK(p.annualLow)} – ${fmtCZK(p.annualHigh)}</span>
        </div>
      </div>

      <div class="reco-deliverables">
        <div class="reco-deliverables-lbl">// deliverables</div>
        <div class="reco-deliverables-text">${p.pkg.deliverables}</div>
      </div>

      <div class="reco-paragraphs">
        <div class="reco-paragraphs-lbl">// pokrytí §§</div>
        <div class="reco-paragraphs-text">${p.pkg.paragraphs}</div>
      </div>

      <div class="reco-meta">
        <span>Dokumentace: <strong>${p.docVerb}</strong></span>
        <span>Sazba <strong>10 000 Kč/MD</strong></span>
        <span>${p.pkg.capacity}</span>
      </div>

      ${w}
    `;
  }

  // ─── event wiring ───────────────────────────────────────────────────
  function wire() {
    // regime toggle
    $$('.regime-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        STATE.regime = btn.dataset.regime;
        render();
      });
    });

    // configurator option clicks
    $$('.cfg-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        const step = btn.closest('.cfg-step');
        const key = step.dataset.input;
        STATE[key] = btn.dataset.value;
        render();
      });
    });

    const exportBtn = $('#btnExport');
    if (exportBtn) exportBtn.addEventListener('click', exportRecommendation);
    // Note: #btnVcard is <a href="/cooperation/contact.vcf">, no JS wire.
  }

  // ─── TXT export (Blob, ZDR-clean) ──────────────────────────────────
  function exportRecommendation() {
    if (!allAnswered()) return;

    const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const rec = REGIME_RECOMMENDATIONS[STATE.regime];

    const lines = [];
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('  /cooperation — doporučení NIS2 (' + rec.abbrev + ')');
    lines.push('  ' + ts);
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('');
    lines.push('REGULAČNÍ REŽIM');
    lines.push('  ' + rec.fullName + ' (' + rec.abbrev + ')');
    lines.push('  Zákon č. 264/2025 Sb. · Vyhláška č. 409/2025 Sb. · NÚKIB');
    lines.push('');
    lines.push('VSTUPY');
    for (const key of ['size', 'docs', 'goal']) {
      const def = INPUTS[key];
      const opt = def.options[STATE[key]];
      lines.push('  ' + def.label.padEnd(28) + ' ' + opt.label + '  (' + opt.hint + ')');
    }
    lines.push('');
    lines.push('// ' + rec.tag);
    lines.push('');
    lines.push('  ' + rec.title);
    lines.push('');
    // wrap rec.text to ~62 chars
    const words = rec.text.split(/\s+/);
    let line = '  ';
    for (const w of words) {
      if ((line + w).length > 64) { lines.push(line); line = '  '; }
      line += w + ' ';
    }
    if (line.trim()) lines.push(line);
    lines.push('');
    lines.push('MAPOVÁNÍ NA NIS2 (čl. 21 odst. 2)');
    lines.push('  V ' + rec.abbrev + ' platí stejných 10 oblastí — implementace');
    lines.push('  je v ' + rec.abbrev + ' lehčí než v ' + (STATE.regime === 'lower' ? 'RVP' : 'RNP') + ', rozsah se nemění.');
    lines.push('');
    for (const a of NIS2_AREAS) {
      lines.push('  [✓]  ' + a.code.padEnd(3) + ' ' + a.name.padEnd(42) + ' — ' + a.art);
    }
    lines.push('');
    lines.push('DOPORUČENÝ BALÍČEK');
    const p = computeDynamicPricing();
    if (p) {
      lines.push('  ' + p.pkg.code + ' · ' + p.pkg.title);
      lines.push('');
      lines.push('  Role:     ' + p.roleName);
      lines.push('  Tier:     ' + p.tierName);
      lines.push('  Dokum.:   ' + p.docVerb);
      lines.push('');
      lines.push('  Setup (Phase 0):  ' + p.p0Low + '–' + p.p0High + ' MD'
                 + '  (' + new Intl.NumberFormat('cs-CZ').format(p.p0LowCZK) + '–'
                 + new Intl.NumberFormat('cs-CZ').format(p.p0HighCZK) + ' Kč)');
      lines.push('  Měsíčně:          ' + p.monthlyMD + ' MD'
                 + '  (' + new Intl.NumberFormat('cs-CZ').format(p.monthlyCZK) + ' Kč/měs.)');
      lines.push('  Ročně celkem:     '
                 + new Intl.NumberFormat('cs-CZ').format(p.annualLow) + '–'
                 + new Intl.NumberFormat('cs-CZ').format(p.annualHigh) + ' Kč');
      lines.push('');
      lines.push('  Sazba: 10 000 Kč/MD');
      lines.push('');
      lines.push('  Deliverables:');
      // wrap deliverables at ~62 chars
      const dw = p.pkg.deliverables.split(/\s+/);
      let dl = '    ';
      for (const w of dw) {
        if ((dl + w).length > 64) { lines.push(dl); dl = '    '; }
        dl += w + ' ';
      }
      if (dl.trim()) lines.push(dl);
      lines.push('');
      lines.push('  Pokrytí §§:  ' + p.pkg.paragraphs);
      lines.push('  Kapacita:    ' + p.pkg.capacity);
      if (p.vppTrigger) {
        lines.push('');
        lines.push('  ⚠ ' + p.pkg.warning);
      }
    } else {
      lines.push('  Neúplné vstupy — doplňte všechny 3 otázky a regulační režim.');
    }
    lines.push('');
    lines.push('POZNÁMKY');
    lines.push('  · Žádná data neopustila váš prohlížeč.');
    lines.push('  · Tento soubor vznikl lokálně v JavaScriptu jako Blob URL.');
    lines.push('  · ZDR — Zero Data Retention. Restraint is the brand.');
    lines.push('  · Kontakt: /cooperation/contact.vcf');
    lines.push('');
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('  https://0-click.com/cooperation');
    lines.push('═══════════════════════════════════════════════════════════════');

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cooperation-doporuceni-' + rec.abbrev.toLowerCase() + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  // ─── 0-click awareness: auto vCard import on page load ─────────────
  const VCARD_PATH = '/cooperation/contact.vcf';
  const VCARD_FLAG_KEY = 'cooperation:vcard-attempted';

  function isMobileLike() {
    if (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) return true;
    if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return true;
    return false;
  }

  function attemptAutoVCardImport() {
    if (!isMobileLike()) return { attempted: false, reason: 'desktop' };

    try {
      if (sessionStorage.getItem(VCARD_FLAG_KEY) === '1') {
        return { attempted: false, reason: 'already-tried-this-session' };
      }
      sessionStorage.setItem(VCARD_FLAG_KEY, '1');
    } catch (e) { /* sessionStorage disabled — still safe to attempt */ }

    const iframe = document.createElement('iframe');
    iframe.src = VCARD_PATH;
    iframe.setAttribute('aria-hidden', 'true');
    iframe.setAttribute('title', 'vcard import');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:0;height:0;border:0';
    document.body.appendChild(iframe);
    return { attempted: true, reason: 'iframe-injected' };
  }

  function showVCardNote(vcardResult) {
    const note = $('#mirrorNote');
    if (!note) return;
    if (vcardResult.reason !== 'desktop') return;

    note.innerHTML =
      '<div class="mirror-line">Na mobilu by se kontakt přidal automaticky.</div>' +
      '<div class="mirror-line">Tady na desktopu klikněte na tlačítko níže.</div>';
    note.dataset.shown = '1';
  }

  function logVCard(vcardResult) {
    const css = 'color:#007AA1;text-shadow:0 0 6px rgba(0,122,161,0.5);font-family:VT323,monospace;font-size:14px';
    const cssDim = 'color:#8A8A85;font-family:VT323,monospace';
    console.log('%c// 0-click awareness', css);
    if (vcardResult.attempted) {
      console.log('%c· vCard import attempted via iframe → ' + VCARD_PATH, cssDim);
    } else {
      console.log('%c· vCard auto-import skipped (' + vcardResult.reason + ')', cssDim);
    }
  }

  // ─── boot ───────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    wire();
    render();

    const vcardResult = attemptAutoVCardImport();
    showVCardNote(vcardResult);
    logVCard(vcardResult);

    const css = 'color:#007AA1;text-shadow:0 0 6px rgba(0,122,161,0.5);font-family:VT323,monospace;font-size:14px';
    const cssDim = 'color:#8A8A85;font-family:VT323,monospace';
    console.log('%c// cooperation · phase 1', css);
    console.log('%cZDR holds. No fetch, no analytics, no submit.', cssDim);
    console.log('%cwindow.cooperation.state() for the current answer set.', cssDim);
  });

  // minimal console API
  window.cooperation = {
    state: () => ({ ...STATE }),
    nis2: () => NIS2_AREAS.slice(),
    inputs: () => JSON.parse(JSON.stringify(INPUTS)),
    regimes: () => JSON.parse(JSON.stringify(REGIME_RECOMMENDATIONS)),
  };
})();
