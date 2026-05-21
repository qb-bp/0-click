/* ════════════════════════════════════════════════════════════════
   /cooperation — Phase 1.
   3-question configurator + .txt download + auto-vcf import + ironic
   mirror. RNP regime locked. ZDR-clean.

   Phase 1 scope:  3 inputs, validation, TXT download with inputs
                   echoed + real NIS2 mapping + Phase 2 placeholder.
                   Auto-import contact.vcf on page load (mobile only,
                   browser may block — "0-click awareness" mechanic).
   Phase 2 scope:  service catalog + recommendation matrix.

   vCard contents: edit /cooperation/contact.vcf directly (static file).
   ════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ─── ground truth: NIS2 areas per zákon 264/2025 Sb. (RNP regime) ──
  // All 10 areas apply in both RNP (basic) and VPP (higher) regimes —
  // the difference is implementation depth, not scope.
  const NIS2_AREAS = [
    { code: 'a', name: 'Politiky řízení rizik',         art: 'čl. 21 odst. 2 písm. a)' },
    { code: 'b', name: 'Řízení incidentů',               art: 'čl. 21 odst. 2 písm. b)' },
    { code: 'c', name: 'Kontinuita činností',            art: 'čl. 21 odst. 2 písm. c)' },
    { code: 'd', name: 'Bezpečnost dodavatelského řetězce', art: 'čl. 21 odst. 2 písm. d)' },
    { code: 'e', name: 'Pořizování, vývoj a údržba',     art: 'čl. 21 odst. 2 písm. e)' },
    { code: 'f', name: 'Hodnocení účinnosti opatření',   art: 'čl. 21 odst. 2 písm. f)' },
    { code: 'g', name: 'Kybernetická hygiena a školení', art: 'čl. 21 odst. 2 písm. g)' },
    { code: 'h', name: 'Kryptografie a šifrování',       art: 'čl. 21 odst. 2 písm. h)' },
    { code: 'i', name: 'Lidské zdroje a aktiva',         art: 'čl. 21 odst. 2 písm. i)' },
    { code: 'j', name: 'Vícefaktorové ověřování',        art: 'čl. 21 odst. 2 písm. j)' },
  ];

  // ─── input definitions (labels for echo into TXT) ──────────────────
  const INPUTS = {
    size: {
      label: 'Velikost organizace',
      options: {
        micro:  'Mikro (< 10 osob)',
        small:  'Malá (< 50 osob)',
        medium: 'Střední (< 250 osob)',
        large:  'Velká (250+ osob)',
      },
    },
    docs: {
      label: 'Aktuální stav dokumentace KB',
      options: {
        none:       'Žádná',
        partial:    'Částečná',
        outdated:   'Funkční, ale neaktuální',
        maintained: 'Existující a udržovaná',
      },
    },
    goal: {
      label: 'Primární cíl',
      options: {
        compliance: 'Splnit zákon',
        maturity:   'Compliance + zralost',
        role:       'Převzetí role (Pověřená osoba)',
      },
    },
  };

  // ─── state ──────────────────────────────────────────────────────────
  const STATE = {
    size: null,
    docs: null,
    goal: null,
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  function answeredCount() {
    return Object.values(STATE).filter(v => v !== null).length;
  }
  function allAnswered() {
    return answeredCount() === 3;
  }

  // ─── render ─────────────────────────────────────────────────────────
  function render() {
    $$('.cfg-step').forEach(stepEl => {
      const key = stepEl.dataset.input;
      const val = STATE[key];
      stepEl.dataset.answered = val ? '1' : '0';

      const valEl = $('.cfg-step-value', stepEl);
      if (val && INPUTS[key].options[val]) {
        valEl.textContent = INPUTS[key].options[val];
        valEl.dataset.set = '1';
      } else {
        valEl.textContent = 'nevybráno';
        valEl.dataset.set = '0';
      }

      $$('.cfg-opt', stepEl).forEach(btn => {
        btn.dataset.selected = (btn.dataset.value === val) ? '1' : '0';
      });
    });

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
    // Note: #btnVcard is an <a href="/cooperation/contact.vcf"> in HTML now —
    // browser handles navigation natively, no JS wire needed.
  }

  // ─── TXT export (Blob, ZDR-clean) ──────────────────────────────────
  function exportRecommendation() {
    if (!allAnswered()) return;

    const ts = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

    const lines = [];
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('  /cooperation — doporučení NIS2 (RNP)');
    lines.push('  ' + ts);
    lines.push('═══════════════════════════════════════════════════════════════');
    lines.push('');
    lines.push('VSTUPY');
    for (const key of ['size', 'docs', 'goal']) {
      const def = INPUTS[key];
      const optLabel = def.options[STATE[key]];
      lines.push('  ' + def.label.padEnd(32) + ' ' + optLabel);
    }
    lines.push('');
    lines.push('REŽIM');
    lines.push('  Režim nižších povinností (RNP)');
    lines.push('  Zákon č. 264/2025 Sb. · Vyhláška č. 409/2025 Sb. · NÚKIB');
    lines.push('');
    lines.push('MAPOVÁNÍ NA NIS2 (čl. 21 odst. 2)');
    lines.push('  Všech 10 oblastí se v RNP uplatňuje. Implementace je lehčí');
    lines.push('  než v režimu vyšších povinností (VPP), ale rozsah se nemění.');
    lines.push('');
    for (const a of NIS2_AREAS) {
      lines.push('  [✓]  ' + a.code + ')  ' + a.name.padEnd(40) + ' — ' + a.art);
    }
    lines.push('');
    lines.push('DOPORUČENÝ BALÍČEK');
    lines.push('  ┌─────────────────────────────────────────────────────────┐');
    lines.push('  │  Phase 1: struktura výstupu                              │');
    lines.push('  │  Phase 2: konkrétní položky a MD rozsahy zde budou       │');
    lines.push('  │          doplněny po definici servisního katalogu.       │');
    lines.push('  └─────────────────────────────────────────────────────────┘');
    lines.push('');
    lines.push('  Předpokládané kategorie podle vašich vstupů:');
    lines.push('    · Vstupní audit / GAP             [Phase 2: MD]');
    lines.push('    · Dokumentační rámec              [Phase 2: MD]');
    lines.push('    · Role-coverage (Pověřená osoba)  [Phase 2: MD]');
    lines.push('    · Průběžná podpora                [Phase 2: MD]');
    lines.push('');
    lines.push('  Indikativní celkový rozsah:         [Phase 2: MD min–max]');
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
    a.download = 'cooperation-doporuceni-rnp.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  }

  // ─── 0-click awareness: auto vCard import on page load ─────────────
  // Mobile-only. Creates hidden iframe pointing at the static .vcf —
  // iOS Safari + Android Chrome detect text/vcard Content-Type and pop
  // the native "Add to Contacts" sheet. Browser may block depending on
  // its policy for cross-origin frame downloads; we don't pretend to
  // know what happened (no detection API for this), we just attempt
  // and name the attempt openly.
  //
  // Mobile detection: navigator.maxTouchPoints + pointer:coarse.
  // Not UA-sniffing. Aligns with root artifact's browser-as-pill-choice
  // mechanic — different browsers/devices behave differently, page
  // observes without judging.

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

  // ─── vCard note: thin desktop hint ─────────────────────────────────
  // Mobile users get native Add-to-Contacts sheet — no narration needed.
  // Desktop users see a one-liner pointing at the button.
  function showVCardNote(vcardResult) {
    const note = $('#mirrorNote');
    if (!note) return;
    if (vcardResult.reason !== 'desktop') return; // mobile: stay silent

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
      console.log('%c  (browser may or may not have presented Add to Contacts)', cssDim);
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

  // minimal console API (matches root convention)
  window.cooperation = {
    state: () => ({ ...STATE }),
    nis2: () => NIS2_AREAS.slice(),
    inputs: () => JSON.parse(JSON.stringify(INPUTS)),
  };
})();
