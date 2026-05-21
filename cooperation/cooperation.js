/* ════════════════════════════════════════════════════════════════
   /cooperation — Phase 1.
   Regime toggle (RNP / VPP) + 3-question configurator + .txt
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
  // RNP/VPP delivery reality. We mirror that.
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

  // ─── regime recommendations (verbatim from aigent REGIME_RECOMMENDATIONS) ─
  const REGIME_RECOMMENDATIONS = {
    lower: {
      abbrev: 'RNP',
      fullName: 'Režim nižších povinností',
      tag: 'Doporučení · Režim nižších povinností',
      title: 'Pro nižší povinnosti vám stačí Phase 0 + Pověřená osoba KB · Basic.',
      text: 'Vyhláška 410/2025 Sb. v RNP nezná formální role „Manažer" ani „Architekt" — definuje pouze osobu pověřenou kybernetickou bezpečností (§ 4). Naše služba pověřené osoby (B2B známá jako „Manažer") plus Phase 0 jako nezávislý vstupní pohled vám pokryje minimální povinnosti RNP.',
    },
    higher: {
      abbrev: 'VPP',
      fullName: 'Režim vyšších povinností',
      tag: 'Doporučení · Režim vyšších povinností',
      title: 'Pro vyšší povinnosti potřebujete formálně Manažera KB i Architekta KB.',
      text: 'Na splnění zákonné povinnosti oddělení rolí (§ 5 vyhl. 409/2025 Sb.) v režimu vyšších povinností potřebujete formálně pokrýt roli Manažera KB i Architekta KB. Obě role zajistíme as-a-service.',
    },
  };

  // ─── state ──────────────────────────────────────────────────────────
  const STATE = {
    regime: 'lower', // 'lower' = RNP | 'higher' = VPP
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
    lines.push('  je v ' + rec.abbrev + ' lehčí než v ' + (STATE.regime === 'lower' ? 'VPP' : 'RNP') + ', rozsah se nemění.');
    lines.push('');
    for (const a of NIS2_AREAS) {
      lines.push('  [✓]  ' + a.code.padEnd(3) + ' ' + a.name.padEnd(42) + ' — ' + a.art);
    }
    lines.push('');
    lines.push('DOPORUČENÝ BALÍČEK');
    lines.push('  ┌─────────────────────────────────────────────────────────┐');
    lines.push('  │  Phase 1: struktura výstupu                              │');
    lines.push('  │  Phase 2: konkrétní položky a MD rozsahy zde budou       │');
    lines.push('  │          doplněny po definici servisního katalogu.       │');
    lines.push('  └─────────────────────────────────────────────────────────┘');
    lines.push('');
    lines.push('  Předpokládané kategorie pro režim ' + rec.abbrev + ':');
    lines.push('    · Phase 0 — diagnostika a roadmapa  [Phase 2: MD]');
    if (STATE.regime === 'lower') {
      lines.push('    · Pověřená osoba KB · Basic        [Phase 2: MD]');
    } else {
      lines.push('    · Manažer KB · Standard            [Phase 2: MD]');
      lines.push('    · Architekt KB · per MD            [Phase 2: MD]');
    }
    lines.push('');
    lines.push('  Indikativní celkový rozsah:          [Phase 2: MD min–max]');
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
