(function () {
  "use strict";

  // ---------- DOM helper ----------
  const $ = (id) => document.getElementById(id);

  // ============================================================
  //  GOLD: Preload print assets so window.print() stays synchronous
  // ============================================================

  function preloadBPLogo() {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = "BP.png";
      // safety timeout
      setTimeout(() => resolve(false), 1200);
    });
  }

  // ---------- Helpers ----------
  // ============================================================
  //  GOLD STATE SAVE / RESTORE (same-tab, no hard refresh)
  // ============================================================
  const BS_STATE_KEY = "bs_payrollOMRA_state_v1";

  function captureFormState() {
    const state = { v: 1, t: Date.now(), scrollY: window.scrollY || 0, fields: {} };

    const nodes = Array.from(document.querySelectorAll("input, textarea, select"));
    nodes.forEach((el) => {
      const id = el.id;
      if (!id) return;

      const tag = el.tagName;
      if (tag === "INPUT") {
        const type = (el.getAttribute("type") || "").toLowerCase();
        if (type === "radio" || type === "checkbox") {
          state.fields[id] = { checked: !!el.checked };
          return;
        }
      }
      state.fields[id] = { value: el.value };
    });

    return state;
  }

  function applyFormState(state) {
    if (!state || !state.fields) return;

    Object.keys(state.fields).forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      const payload = state.fields[id];
      const tag = el.tagName;

      if (tag === "INPUT") {
        const type = (el.getAttribute("type") || "").toLowerCase();
        if ((type === "radio" || type === "checkbox") && typeof payload.checked === "boolean") {
          el.checked = payload.checked;
          return;
        }
      }
      if (typeof payload.value === "string") el.value = payload.value;
    });

    try { window.scrollTo(0, Number(state.scrollY) || 0); } catch (_) {}
  }

  function restoreFromSessionIfAny() {
    const raw = sessionStorage.getItem(BS_STATE_KEY);
    if (!raw) return;

    try {
      const state = JSON.parse(raw);
      applyFormState(state);
    } catch (_) {
      // ignore
    }
  }

  function saveStateNow() {
    try {
      sessionStorage.setItem(BS_STATE_KEY, JSON.stringify(captureFormState()));
    } catch (_) {
      // ignore
    }
  }

  function wirePersistentStateSave() {
    document.addEventListener("input", saveStateNow, true);
    document.addEventListener("change", saveStateNow, true);
    document.addEventListener("focusout", saveStateNow, true);
  }

  function clampMin0(n) {
    return n < 0 ? 0 : n;
  }

  function toNumber(val) {
    if (val === null || val === undefined) return 0;
    const s = String(val).replace(/[^0-9.\-]/g, "");
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  }

  function money(n) {
    const v = Number.isFinite(n) ? n : 0;
    return v.toLocaleString("en-US", { style: "currency", currency: "USD" });
  }

  function setMoneyText(el, n) {
    if (!el) return;
    el.textContent = money(n);
  }

  // ============================================================
  //  BAYSHORE STANDARD (NO inline CSS, NO el.style.*)
  // ============================================================

  // ---------- Inline hints ----------
  function ensureHintEl(forEl) {
    if (!forEl || !forEl.parentElement) return null;
    const parent = forEl.parentElement;
    let hint = parent.querySelector(`.field-hint[data-for="${forEl.id}"]`);
    if (!hint) {
      hint = document.createElement("div");
      hint.className = "field-hint";
      hint.dataset.for = forEl.id;
      parent.appendChild(hint);
    }
    return hint;
  }

  function showHint(forEl, msg) {
    const hint = ensureHintEl(forEl);
    if (!hint) return;
    hint.textContent = msg || "";
    hint.classList.toggle("is-visible", !!msg);
    forEl.classList.toggle("has-error", !!msg);
  }

  // ---------- Select-all on tap/click/focus (iPad-safe) ----------
  function selectAllSafe(el) {
    if (!el || el.readOnly || el.disabled) return;
    const doSelect = () => {
      try { el.focus({ preventScroll: true }); } catch (_) {}
      const v = el.value || "";
      try {
        el.select();
        try { el.setSelectionRange(0, v.length); } catch (_) {}
      } catch (_) {
        try { el.setSelectionRange(0, v.length); } catch (_) {}
      }
    };
    requestAnimationFrame(() => setTimeout(doSelect, 0));
  }

  function wireSelectAll(el) {
    if (!el) return;
    const handler = () => selectAllSafe(el);
    el.addEventListener("pointerdown", handler, { passive: true });
    el.addEventListener("touchstart", handler, { passive: true });
    el.addEventListener("focus", handler);
    el.addEventListener("click", handler);
  }

  function wireSelectAllForAllEditableInputs() {
    const inputs = Array.from(document.querySelectorAll("input, textarea, select")).filter((el) => {
      if (el.tagName === "TEXTAREA") return !el.readOnly && !el.disabled;
      if (el.tagName === "SELECT") return !el.disabled;
      if (el.tagName !== "INPUT") return false;
      const type = (el.getAttribute("type") || "").toLowerCase();
      if (type === "hidden" || type === "radio" || type === "checkbox" || type === "button" || type === "submit") return false;
      return !el.readOnly && !el.disabled;
    });
    inputs.forEach(wireSelectAll);
  }

  // ---------- Money: allow sloppy input, format on blur, empty -> $0.00 ----------
  function parseMoney(val) {
    const n = toNumber(val);
    return Number.isFinite(n) ? n : 0;
  }

  function formatMoneyToInput(el) {
    if (!el) return;
    const raw = String(el.value || "");
    const n = parseMoney(raw);

    if (n < 0) {
      el.value = money(0);
      showHint(el, "No negatives");
      return;
    }
    showHint(el, "");

    const finalN = raw.trim() === "" ? 0 : n;
    el.value = money(finalN);
  }

  function getMoneyDollars(el) {
    if (!el) return 0;
    const n = parseMoney(el.value);
    return n < 0 ? 0 : n;
  }

  function wireMoneyField(el, onChange) {
    if (!el) return;
    el.addEventListener("focus", () => {
      const n = parseMoney(el.value);
      el.value = String(Number.isFinite(n) ? Math.max(0, n) : 0);
      requestAnimationFrame(() => {
        try { el.setSelectionRange(0, el.value.length); } catch (_) {}
      });
    });
    el.addEventListener("input", () => {
      const n = parseMoney(el.value);
      showHint(el, n < 0 ? "No negatives" : "");
      if (typeof onChange === "function") onChange();
    });
    el.addEventListener("blur", () => {
      formatMoneyToInput(el);
      if (typeof onChange === "function") onChange();
    });
  }

  // ---------- Hours: format on blur "12.50 hrs", empty -> "0.00 hrs" ----------
  function parseHours(val) {
    const s = String(val || "").replace(/hrs?/gi, "");
    return toNumber(s);
  }

  function formatHoursDisplay(n) {
    const v = Number.isFinite(n) ? n : 0;
    return `${v.toFixed(2)} hrs`;
  }

  function formatHoursToInput(el, { min = 0, minHint = "" } = {}) {
    if (!el) return 0;

    const raw = String(el.value || "");
    const n0 = parseHours(raw);

    if (n0 < 0) {
      el.value = formatHoursDisplay(0);
      showHint(el, "No negatives");
      return 0;
    }

    let n = raw.trim() === "" ? 0 : n0;
    n = Math.round(clampMin0(n) * 2) / 2;

    if (n < min) {
      n = min;
      if (minHint) showHint(el, minHint);
      else showHint(el, "");
    } else {
      showHint(el, "");
    }

    el.value = formatHoursDisplay(n);
    return n;
  }

  function getHours(el) {
    if (!el) return 0;
    const n = parseHours(el.value);
    if (n < 0) return 0;
    return Math.round(clampMin0(n) * 2) / 2;
  }

  function wireHoursField(el, opts, onChange) {
    if (!el) return;
    el.addEventListener("focus", () => {
      const n = parseHours(el.value);
      el.value = String(Number.isFinite(n) ? Math.max(0, n) : 0);
      requestAnimationFrame(() => {
        try { el.setSelectionRange(0, el.value.length); } catch (_) {}
      });
    });
    el.addEventListener("input", () => {
      const n = parseHours(el.value);
      showHint(el, n < 0 ? "No negatives" : "");
      if (typeof onChange === "function") onChange();
    });
    el.addEventListener("blur", () => {
      formatHoursToInput(el, opts);
      if (typeof onChange === "function") onChange();
    });
  }

  // ---------- Date: autofill today on load, blur -> "Dec 31, 2025" ----------
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function formatDateLong(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return "";
    return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  function parseDateFlexibleEnUS(input) {
    const s = String(input || "").trim();
    if (!s) return null;

    if (/^\d{8}$/.test(s)) {
      const mm = parseInt(s.slice(0, 2), 10);
      const dd = parseInt(s.slice(2, 4), 10);
      const yy = parseInt(s.slice(4, 8), 10);
      const d = new Date(yy, mm - 1, dd);
      if (d.getFullYear() === yy && d.getMonth() === mm - 1 && d.getDate() === dd) return d;
    }

    if (/^\d{6}$/.test(s)) {
      const mm = parseInt(s.slice(0, 2), 10);
      const dd = parseInt(s.slice(2, 4), 10);
      let yy = parseInt(s.slice(4, 6), 10);
      yy += (yy >= 70 ? 1900 : 2000);
      const d = new Date(yy, mm - 1, dd);
      if (d.getFullYear() === yy && d.getMonth() === mm - 1 && d.getDate() === dd) return d;
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      const yy = parseInt(s.slice(0, 4), 10);
      const mm = parseInt(s.slice(5, 7), 10);
      const dd = parseInt(s.slice(8, 10), 10);
      const d = new Date(yy, mm - 1, dd);
      if (d.getFullYear() === yy && d.getMonth() === mm - 1 && d.getDate() === dd) return d;
    }

    const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (m) {
      const mm = parseInt(m[1], 10);
      const dd = parseInt(m[2], 10);
      let yy = parseInt(m[3], 10);
      if (yy < 100) yy += 2000;
      const d = new Date(yy, mm - 1, dd);
      if (d.getFullYear() === yy && d.getMonth() === mm - 1 && d.getDate() === dd) return d;
    }

    const native = new Date(s);
    if (!isNaN(native.getTime())) return native;

    return null;
  }

  function wireDateField(el, { autofillToday = false } = {}) {
    if (!el) return;
    if (autofillToday && !String(el.value || "").trim()) {
      el.value = formatDateLong(new Date());
    }
    el.addEventListener("blur", () => {
      const raw = String(el.value || "");
      if (!raw.trim()) {
        showHint(el, "");
        return;
      }
      const d = parseDateFlexibleEnUS(raw);
      if (!d) {
        showHint(el, "Invalid date");
        return;
      }
      showHint(el, "");
      el.value = formatDateLong(d);
    });
  }

  // ---------- Title Case on blur ----------
  function toTitleCase(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\b([a-z])/g, (m) => m.toUpperCase());
  }

  function wireTitleCase(el) {
    if (!el) return;
    el.addEventListener("blur", () => {
      const v = String(el.value || "");
      if (!v.trim()) return;
      el.value = toTitleCase(v);
    });
  }

  // ---------- Tooltips: modal (NO el.style positioning) ----------
  const TOOLTIP_TEXT = {
    pd: "Total duration of the project in hrs.",
    labor: "Man-hours (labor time)."
  };

  function ensureTooltipModal() {
    if (document.getElementById("bsTipBackdrop")) return;

    const backdrop = document.createElement("div");
    backdrop.id = "bsTipBackdrop";
    backdrop.className = "bs-tip-backdrop hidden";

    const modal = document.createElement("div");
    modal.id = "bsTipModal";
    modal.className = "bs-tip-modal hidden";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Info");

    modal.innerHTML = `
      <div class="bs-tip-card">
        <div class="bs-tip-title">Info</div>
        <div class="bs-tip-text" id="bsTipText"></div>
        <div class="bs-tip-actions">
          <button type="button" class="btn-primary" id="bsTipCloseBtn">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(modal);

    const close = () => {
      backdrop.classList.add("hidden");
      modal.classList.add("hidden");
    };

    backdrop.addEventListener("click", close);
    const closeBtn = document.getElementById("bsTipCloseBtn");
    if (closeBtn) closeBtn.addEventListener("click", close);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") close();
    });
  }

  function openTooltip(key) {
    ensureTooltipModal();
    const text = TOOLTIP_TEXT[key] || "";
    if (!text) return;

    const backdrop = document.getElementById("bsTipBackdrop");
    const modal = document.getElementById("bsTipModal");
    const textEl = document.getElementById("bsTipText");
    if (!backdrop || !modal || !textEl) return;

    textEl.textContent = text;
    backdrop.classList.remove("hidden");
    modal.classList.remove("hidden");

    const okBtn = document.getElementById("bsTipCloseBtn");
    if (okBtn) okBtn.focus();
  }

  function wireTooltips() {
    document.addEventListener("click", (e) => {
      const btn = e.target.closest && e.target.closest(".tip-btn");
      if (!btn) return;
      e.preventDefault();
      const key = btn.getAttribute("data-tip");
      openTooltip(key);
    });
  }

  // ============================================================
  //  Business rules (OMRA-specific)
  // ============================================================

  // ---------- Allowed sales reps (ONLY these two) ----------
  const ALLOWED_TECHS = ["Omar Lopez", "Rafael Menendez"];

  function isAllowedTechName(name) {
    return ALLOWED_TECHS.includes((name || "").trim());
  }

  function requireValidTechOrAlert() {
    const v = (els.tn && els.tn.value ? els.tn.value.trim() : "");
    if (isAllowedTechName(v)) return true;

    alert('Sales Rep Name must be exactly "Omar Lopez" or "Rafael Menendez".');
    if (els.tn) {
      els.tn.value = "";
      els.tn.focus();
    }
    return false;
  }

  // Type-ahead: as user types a prefix, auto-complete to the first match
  function wireTechNameTypeahead() {
    if (!els.tn) return;

    els.tn.addEventListener("input", () => {
      const raw = els.tn.value || "";
      const typed = raw.trim();
      if (typed.length === 0) return;

      const lower = typed.toLowerCase();
      const match = ALLOWED_TECHS.find((n) => n.toLowerCase().startsWith(lower));
      if (!match) return;

      if (match === raw) return;

      const caret = els.tn.selectionStart;
      if (caret !== raw.length) return;

      els.tn.value = match;
      try { els.tn.setSelectionRange(typed.length, match.length); } catch (_) {}
    });

    els.tn.addEventListener("blur", () => {
      const v = (els.tn.value || "").trim();
      if (v.length === 0) return;
      if (!isAllowedTechName(v)) els.tn.value = "";
    });
  }

  // ---------- Elements ----------
  const els = {
    csulYes: $("csulYes"),
    csulNo: $("csulNo"),
    csulValue: $("csulValue"),

    tn: $("tn"),
    ja: $("ja"),
    date: $("date"),
    potentialStart: $("potentialStart"),

    tp: $("tp"),
    material: $("material"),
    oe: $("oe"),

    pd: $("pd"),
    day1: $("day1"),
    day2: $("day2"),
    day3: $("day3"),
    day4: $("day4"),
    day5: $("day5"),
    ah: $("ah"),
    toh: $("toh"),
    totalHours: $("totalHours"),

    sw: $("sw"),
    wh: $("wh"),
    rd: $("rd"),
    bpp: $("bpp"),

    totalCommission: $("totalCommission"),

        calculateBtn: $("calculateBtn"),
        printButton: $("printButton"),

    // Bayshore Standard print container (same-tab)
    printSheet: $("printSheet"),
  };

  // ---------- CSUL toggle ----------
  function isCSULSelected() {
    return !!(els.csulYes && els.csulYes.checked);
  }

  function syncToggleStyles() {
    // Non-negotiable: no inline styles. CSS handles visuals for checked state.
    const yes = isCSULSelected();
    if (els.csulValue) els.csulValue.value = yes ? "yes" : "no";
  }

  function wireToggle() {
    if (els.csulYes) {
      els.csulYes.addEventListener("change", () => {
        syncToggleStyles();
        recalc();
      });
    }
    if (els.csulNo) {
      els.csulNo.addEventListener("change", () => {
        syncToggleStyles();
        recalc();
      });
    }
  }

  // ---------- Project Duration (OMRA rule: min 1 hr) ----------
  function normalizePD(raw) {
    let v = clampMin0(toNumber(raw));
    v = Math.round(v * 2) / 2; // nearest 0.5
    if (v < 1) v = 1;          // PD min 1 hr
    return v;
  }

  function wirePD() {
    if (!els.pd) return;
    wireHoursField(els.pd, { min: 1, minHint: "Min 1 hr" }, recalc);

    if (!String(els.pd.value || "").trim()) els.pd.value = "1";
    formatHoursToInput(els.pd, { min: 1, minHint: "" });
  }

  // ---------- Total Hours (keep existing math: OT counts as 1.5x) ----------
  function calcTotalHours() {
    const day1 = getHours(els.day1);
    const day2 = getHours(els.day2);
    const day3 = getHours(els.day3);
    const day4 = getHours(els.day4);
    const day5 = getHours(els.day5);
    const ah = getHours(els.ah);
    const toh = getHours(els.toh);

    const totalRaw = clampMin0(day1 + day2 + day3 + day4 + day5 + ah + 1.5 * toh);
    const total = Math.round(totalRaw * 2) / 2;

    if (els.totalHours) els.totalHours.value = formatHoursDisplay(total);
    return total;
  }

  // ---------- BP% message ----------
  function bppMessage(pct) {
    if (pct < 10) return "👎: JOB BUST. PLEASE SEE GM";
    if (pct <= 19.99) return "😬: MARGINAL PROFIT";
    if (pct <= 29.99) return "👍: GOOD WORK";
    if (pct <= 39.99) return "😀: NICE WORK";
    if (pct <= 59.99) return "⭐: GREAT WORK";
    return "🌟: EXCELLENT WORK";
  }

  // ============================================================
  //  MAIN CALCULATION (KEEP OMRA LOGIC EXACTLY THE SAME)
  // ============================================================
  function recalc() {
    const tp = getMoneyDollars(els.tp);
    const material = getMoneyDollars(els.material);
    const oe = getMoneyDollars(els.oe);

    const pd = normalizePD(els.pd ? els.pd.value : 0);
    const totalHours = calcTotalHours();

    const overheads = pd * 290;

    const commissionRate = 0.10;         // ✅ OMRA unchanged
    const salesCommission = tp * commissionRate;

    const grossAmount = tp - material * 1.2 - totalHours * 95 - oe;
    const finalProfit = grossAmount - overheads - salesCommission;
    const pct = tp !== 0 ? (finalProfit / tp) * 100 : 0;

    if (els.bpp) els.bpp.value = bppMessage(pct);

    const swPct = tp !== 0 ? ((material * 1.2) / tp) * 100 : 0;
    if (els.sw) els.sw.value = swPct.toFixed(2);
    if (els.wh) els.wh.value = swPct.toFixed(2);
    if (els.rd) els.rd.value = swPct.toFixed(2);

    setMoneyText(els.totalCommission, salesCommission);
  }

    // =========================================================
  // PRINTING (Bayshore Standard — SAME TAB)
  // - Build print-only HTML into #printSheet
  // - body.is-printing gates payrollprint.css to show only #printSheet
  // - A4 one-page fit via body class-only scale steps
  // - Restore via afterprint + matchMedia fallback + 20s last resort
  // =========================================================

  const PRINT_SCALE_CLASSES = [
    "print-scale-100",
    "print-scale-97",
    "print-scale-95",
    "print-scale-93",
    "print-scale-90",
    "print-scale-88",
    "print-scale-85",
  ];

  function clearPrintScaleClasses() {
    PRINT_SCALE_CLASSES.forEach((c) => document.body.classList.remove(c));
  }

  function getA4TargetHeightPx() {
    return 1122; // heuristic; CSS controls print sizing
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function buildPrintHTML() {
    if (typeof document.activeElement?.blur === "function") {
      try { document.activeElement.blur(); } catch (_) {}
    }
    recalc();

    const logoSrc = "BP.png";

    const salesRepName = escapeHtml((els.tn && els.tn.value) || "");
    const jobAddress = escapeHtml((els.ja && els.ja.value) || "");
    const date = escapeHtml((els.date && els.date.value) || "");
    const potentialStart = escapeHtml((els.potentialStart && els.potentialStart.value) || "");

    const projectHours = normalizePD(els.pd ? els.pd.value : 0);
    const materialExpenses = escapeHtml(money(getMoneyDollars(els.material)));
    const otherExpenses = escapeHtml(money(getMoneyDollars(els.oe)));
    const totalPrice = escapeHtml(money(getMoneyDollars(els.tp)));

    const day1 = escapeHtml((els.day1 && els.day1.value) || "0");
    const day2 = escapeHtml((els.day2 && els.day2.value) || "0");
    const day3 = escapeHtml((els.day3 && els.day3.value) || "0");
    const day4 = escapeHtml((els.day4 && els.day4.value) || "0");
    const day5 = escapeHtml((els.day5 && els.day5.value) || "0");
    const additionalHours = escapeHtml((els.ah && els.ah.value) || "0");
    const overtimeHours = escapeHtml((els.toh && els.toh.value) || "0");
    const totalHours = escapeHtml((els.totalHours && els.totalHours.value) || "0");

    const sw = escapeHtml((els.sw && els.sw.value) || "0.00");
    const wh = escapeHtml((els.wh && els.wh.value) || "0.00");
    const rd = escapeHtml((els.rd && els.rd.value) || "0.00");
    const bpp = escapeHtml((els.bpp && els.bpp.value) || "");

    // OMRA: fixed 10% commission (NO logic change)
    const csulText = isCSULSelected() ? "Yes" : "No";
    const salesCommission = escapeHtml(money(getMoneyDollars(els.tp) * 0.10));

    return `
      <div id="printRoot">
        <div class="print-header">
          <img src="${logoSrc}" alt="BP logo" class="logo">
          <h2>SALES COMMISSION DOCUMENT</h2>
        </div>

        <div class="print-body">
          <div class="no-break details-section">
            <h3>DETAILS:</h3>
            <table class="input-data">
              <tr><th>Sales Rep Name:</th><td>${salesRepName}</td></tr>
              <tr><th>Job Address:</th><td>${jobAddress}</td></tr>
              <tr><th>Date:</th><td>${date}</td></tr>
              <tr><th>Potential Start Date:</th><td>${potentialStart}</td></tr>
              <tr><th>Estimated Project Duration:</th><td>${escapeHtml(formatHoursDisplay(projectHours))}</td></tr>
              <tr><th>Estimated Material Expenses:</th><td>${materialExpenses}</td></tr>
              <tr><th>Estimated Other Expenses:</th><td>${otherExpenses}</td></tr>
              <tr><th>Estimated Total Price:</th><td>${totalPrice}</td></tr>
            </table>
          </div>

          <div class="no-break">
            <h3>ESTIMATED LABOR DETAILS:</h3>
            <table class="input-data">
              <tr><th>Day 1</th><th>Day 2</th><th>Day 3</th><th>Day 4</th></tr>
              <tr><td>${day1}</td><td>${day2}</td><td>${day3}</td><td>${day4}</td></tr>
            </table>

            <table class="input-data">
              <tr><th>Day 5</th><th>Additional Hours</th><th>Total Overtime Hours</th><th>Total Hours</th></tr>
              <tr><td>${day5}</td><td>${additionalHours}</td><td>${overtimeHours}</td><td>${totalHours}</td></tr>
            </table>
          </div>

          <div class="no-break">
            <h3>FOR OFFICE USE ONLY:</h3>
            <table class="input-data">
              <tr><th>SW21/RP21</th><th>WH32</th><th>RD15/UL15</th><th>BPP%</th></tr>
              <tr><td>${sw}</td><td>${wh}</td><td>${rd}</td><td>${bpp}</td></tr>
            </table>
          </div>

          <div class="no-break commission-details-section">
            <h3>COMMISSION DETAILS:</h3>
            <table class="input-data">
              <tr><th>S/W/G/CS Selection:</th><td>${csulText}</td></tr>
              <tr><th>Sales Commission Rate:</th><td>10% (Fixed)</td></tr>
              <tr><th>Sales Commission:</th><td>${salesCommission}</td></tr>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function nextFrame(cb) {
    requestAnimationFrame(() => requestAnimationFrame(cb));
  }

  function chooseBestPrintScale() {
    clearPrintScaleClasses();

    const sheet = els.printSheet;
    if (!sheet) return;

    const root = sheet.querySelector("#printRoot");
    if (!root) return;

    const targetH = getA4TargetHeightPx();

    for (const cls of PRINT_SCALE_CLASSES) {
      document.body.classList.add(cls);
      const h = root.getBoundingClientRect().height;

      if (h <= targetH) return;

      document.body.classList.remove(cls);
    }

    document.body.classList.add(PRINT_SCALE_CLASSES[PRINT_SCALE_CLASSES.length - 1]);
  }

  let lastResortTimer = null;
  let __isPrinting = false;

  function restoreUIAfterPrint() {
    if (!__isPrinting) return;
    __isPrinting = false;

    if (lastResortTimer) { clearTimeout(lastResortTimer); lastResortTimer = null; }

    document.body.classList.remove("is-printing");
    clearPrintScaleClasses();

    if (els.printSheet) {
      els.printSheet.classList.add("is-hidden");
      els.printSheet.setAttribute("aria-hidden", "true");

      // IMPORTANT (iPad Safari): do NOT clear innerHTML here
      // els.printSheet.innerHTML = "";
    }
  }

  function beginPrintSameTab() {
    if (!els.printSheet) return;

    // Build print DOM
    els.printSheet.innerHTML = buildPrintHTML();
    els.printSheet.classList.remove("is-hidden");
    els.printSheet.setAttribute("aria-hidden", "false");

        __isPrinting = true;
    document.body.classList.add("is-printing");

        saveStateNow();

    // afterprint covers both Print and Cancel
    window.addEventListener("afterprint", () => {
      setTimeout(() => {
        restoreUIAfterPrint();
      }, 250);
    }, { once: true });

    // Gold fallback (in case afterprint doesn't fire)
    lastResortTimer = setTimeout(() => {
      restoreUIAfterPrint();
    }, 20000); // 20 seconds

    // Gold: let Safari lay out print DOM before measuring + printing
    nextFrame(() => {
      chooseBestPrintScale();

      // IMPORTANT (iPad Safari): print must be called without awaiting Promises
      try {
        window.print();
      } catch (_) {
        restoreUIAfterPrint();
      }
    });  
  }

    // matchMedia fallback: some Safari builds don't reliably fire afterprint
  (function wirePrintMediaFallback() {
    if (!window.matchMedia) return;
    const mql = window.matchMedia("print");
    const handler = (e) => {
    // when leaving print (matches becomes false), restore same-tab UI
      if (!e.matches && __isPrinting) {
        setTimeout(() => {
          restoreUIAfterPrint();
        }, 250);
      }
    };

    try {
      if (typeof mql.addEventListener === "function") mql.addEventListener("change", handler);
      else if (typeof mql.addListener === "function") mql.addListener(handler);
    } catch (_) {
      // ignore
    }
  })();

  // ---------- Wiring ----------
  function wireNumbersRecalc() {
    const ids = ["pd", "day1", "day2", "day3", "day4", "day5", "ah", "toh"];
    ids.forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", recalc);
      el.addEventListener("change", recalc);
    });

    if (els.calculateBtn) {
      els.calculateBtn.addEventListener("click", () => {
        if (!requireValidTechOrAlert()) return;
        recalc();
      });
    }

            if (els.printButton) {
      els.printButton.addEventListener("click", () => {
        if (!requireValidTechOrAlert()) return;

        const userConfirmed = confirm(
          "I HEREBY CONFIRM THAT ALL THE DETAILS ENTERED ARE CORRECT AND I TAKE FULL RESPONSIBILITY OF THIS DOCUMENT."
        );
        if (!userConfirmed) return;

        beginPrintSameTab();
      });
    }
  }

  function initDefaults() {
    // select-all everywhere
    wireSelectAllForAllEditableInputs();

    // tooltips (modal)
    wireTooltips();

    // IMPORTANT: do NOT titlecase tn (must match allowed names exactly)
    wireTitleCase(els.ja);

    wireDateField(els.date, { autofillToday: true });
    wireDateField(els.potentialStart, { autofillToday: false });

    // money
    wireMoneyField(els.tp, recalc);
    wireMoneyField(els.material, recalc);
    wireMoneyField(els.oe, recalc);

    if (els.tp && !String(els.tp.value || "").trim()) els.tp.value = "$0.00";
    if (els.material && !String(els.material.value || "").trim()) els.material.value = "$0.00";
    if (els.oe && !String(els.oe.value || "").trim()) els.oe.value = "$0.00";

    // hours
    wirePD();

    ["day1", "day2", "day3", "day4", "day5", "ah", "toh"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      wireHoursField(el, { min: 0, minHint: "" }, recalc);
      if (!String(el.value || "").trim()) el.value = "0";
      formatHoursToInput(el, { min: 0, minHint: "" });
    });

    if (els.totalHours) els.totalHours.value = formatHoursDisplay(0);

    // office defaults
    if (els.sw) els.sw.value = "0.00";
    if (els.wh) els.wh.value = "0.00";
    if (els.rd) els.rd.value = "0.00";
    if (els.bpp) els.bpp.value = "👎: JOB BUST. PLEASE SEE GM";

    syncToggleStyles();
    wireTechNameTypeahead();
  }

  // boot (Gold: restore any session state first)
  restoreFromSessionIfAny();
  wirePersistentStateSave();

  // Gold: preload logo so print remains synchronous & reliable
    preloadBPLogo().finally(() => {
    initDefaults();
    wireToggle();
    wireNumbersRecalc();
    recalc();
  });
})();
