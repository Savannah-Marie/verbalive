/* ==================================================================
   Verbalive — live verbal translation PoC
   Speech-to-text  : Web Speech API (SpeechRecognition)
   Translation     : MyMemory free API (no key)
   Text-to-speech  : Web Speech API (SpeechSynthesis)
   Vanilla JS, no dependencies.
================================================================== */

(function () {
  "use strict";

  /* ==================================================================
     APP CONFIG — change the app name / tagline here (single source of truth)
  ================================================================== */
  const APP_NAME = "Verbalive";
  const APP_TAGLINE = "Speak in one language, be heard in another.";

  function applyBranding() {
    document.title = APP_NAME + " — live verbal translation";
    const setText = function (id, text) { const el = document.getElementById(id); if (el) el.textContent = text; };
    setText("app-name", APP_NAME);
    setText("app-name-footer", APP_NAME);
    setText("app-tagline", APP_TAGLINE);
  }

  /* ---------- Language definitions ----------
     recog = BCP-47 code for speech recognition / synthesis
     iso   = code sent to the MyMemory translation API
     native = optional native "speak" label                      */
  const LANGS = {
    en: { name: "English",    flag: "🇬🇧", recog: "en-GB", iso: "en", native: "Speak in English" },
    cy: { name: "Welsh",      flag: "🏴󠁧󠁢󠁷󠁬󠁳󠁿", recog: "cy-GB", iso: "cy" },
    fr: { name: "French",     flag: "🇫🇷", recog: "fr-FR", iso: "fr", native: "Parler en français" },
    es: { name: "Spanish",    flag: "🇪🇸", recog: "es-ES", iso: "es", native: "Hablar en español" },
    pt: { name: "Portuguese", flag: "🇵🇹", recog: "pt-PT", iso: "pt" },
    it: { name: "Italian",    flag: "🇮🇹", recog: "it-IT", iso: "it" },
    de: { name: "German",     flag: "🇩🇪", recog: "de-DE", iso: "de" },
    nl: { name: "Dutch",      flag: "🇳🇱", recog: "nl-NL", iso: "nl" },
    pl: { name: "Polish",     flag: "🇵🇱", recog: "pl-PL", iso: "pl" },
    ro: { name: "Romanian",   flag: "🇷🇴", recog: "ro-RO", iso: "ro" },
    uk: { name: "Ukrainian",  flag: "🇺🇦", recog: "uk-UA", iso: "uk" },
    ru: { name: "Russian",    flag: "🇷🇺", recog: "ru-RU", iso: "ru" },
    tr: { name: "Turkish",    flag: "🇹🇷", recog: "tr-TR", iso: "tr" },
    ar: { name: "Arabic",     flag: "🇸🇦", recog: "ar-SA", iso: "ar" },
    hi: { name: "Hindi",      flag: "🇮🇳", recog: "hi-IN", iso: "hi" },
    ur: { name: "Urdu",       flag: "🇵🇰", recog: "ur-PK", iso: "ur" },
    pa: { name: "Punjabi",    flag: "🇮🇳", recog: "pa-IN", iso: "pa" },
    gu: { name: "Gujarati",   flag: "🇮🇳", recog: "gu-IN", iso: "gu" },
    bn: { name: "Bengali",    flag: "🇧🇩", recog: "bn-BD", iso: "bn" },
    zh: { name: "Chinese",    flag: "🇨🇳", recog: "zh-CN", iso: "zh" },
    ja: { name: "Japanese",   flag: "🇯🇵", recog: "ja-JP", iso: "ja" }
  };
  // Dropdown order (community-relevant languages near the top).
  const LANG_ORDER = ["en","cy","fr","es","pt","it","de","nl","pl","ro","uk","ru","tr","ar","hi","ur","pa","gu","bn","zh","ja"];

  /* ---------- State ---------- */
  let leftLang = "fr";       // "I speak"  (slot A / left select)
  let rightLang = "en";      // "They speak" (slot B / right select)
  let listening = false;
  let activeSource = null;
  let recognition = null;
  let voices = [];

  /* ---------- DOM ---------- */
  const $ = (sel) => document.querySelector(sel);
  const elLangLeft = $("#lang-left");
  const elLangRight = $("#lang-right");
  const btnA = $("#talk-fr");   // left slot element
  const btnB = $("#talk-en");   // right slot element
  const elStatus = $("#status");
  const elStatusText = $("#status-text");
  const elStatusInterim = $("#status-interim");
  const elConversation = $("#conversation");
  const elEmpty = $("#empty-state");
  const elAutospeak = $("#autospeak");
  const elSupportWarning = $("#support-warning");
  const elTypeInput = $("#type-input");
  const btnSendLeft = $("#send-left");
  const btnSendRight = $("#send-right");

  /* ---------- Feature detection ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const hasTTS = "speechSynthesis" in window;

  /* ---------- Status helper ---------- */
  function setStatus(state, text, interim) {
    elStatus.classList.remove("is-listening", "is-working", "is-speaking", "is-error");
    if (state) elStatus.classList.add("is-" + state);
    elStatusText.textContent = text || "";
    elStatusInterim.textContent = interim || "";
  }

  function actionLabel(lang) {
    const L = LANGS[lang];
    return L.native || ("Speak in " + L.name);
  }

  /* ---------- Build dropdowns ---------- */
  function populateSelect(sel) {
    sel.innerHTML = "";
    LANG_ORDER.forEach(function (code) {
      const L = LANGS[code];
      const opt = document.createElement("option");
      opt.value = code;
      opt.textContent = L.flag + "  " + L.name;
      sel.appendChild(opt);
    });
  }

  /* ---------- Render the pair UI ---------- */
  function renderPair() {
    elLangLeft.value = leftLang;
    elLangRight.value = rightLang;
    paintButton(btnA, leftLang, rightLang, "talk-btn--left");
    paintButton(btnB, rightLang, leftLang, "talk-btn--right");
    btnSendLeft.textContent = LANGS[leftLang].flag + " Send as " + LANGS[leftLang].name;
    btnSendRight.textContent = LANGS[rightLang].flag + " Send as " + LANGS[rightLang].name;
  }

  function paintButton(btn, srcLang, tgtLang, accent) {
    const S = LANGS[srcLang], T = LANGS[tgtLang];
    btn.dataset.lang = srcLang;
    btn.classList.remove("talk-btn--left", "talk-btn--right");
    btn.classList.add(accent);
    btn.querySelector(".flag").textContent = S.flag;
    btn.querySelector(".label").textContent = actionLabel(srcLang);
    btn.querySelector(".hint").textContent = "Tap and speak → heard in " + T.name;
  }

  /* ---------- Language changes ---------- */
  function onLangChange(side, value) {
    if (side === "left") {
      if (value === rightLang) rightLang = leftLang; // keep the two sides distinct
      leftLang = value;
    } else {
      if (value === leftLang) leftLang = rightLang;
      rightLang = value;
    }
    stopListening();
    renderPair();
    setStatus("", LANGS[leftLang].name + " ⇄ " + LANGS[rightLang].name + " — ready.");
  }

  function swap() {
    const t = leftLang; leftLang = rightLang; rightLang = t;
    stopListening();
    renderPair();
    setStatus("", LANGS[leftLang].name + " ⇄ " + LANGS[rightLang].name + " — ready.");
  }

  /* ---------- Speech recognition ---------- */
  function buildRecognition() {
    const r = new SR();
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.continuous = false;

    r.onresult = function (event) {
      let interim = "", finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else interim += res[0].transcript;
      }
      if (interim) setStatus("listening", "Listening…", interim);
      if (finalText) r._final = finalText.trim();
    };

    r.onerror = function (event) {
      stopListeningUI();
      const err = event.error;
      if (err === "not-allowed" || err === "service-not-allowed") {
        setStatus("error", "Microphone blocked. Allow mic access in your browser and try again.");
      } else if (err === "no-speech") {
        setStatus("error", "Didn't catch anything. Tap and speak a little louder.");
      } else if (err === "audio-capture") {
        setStatus("error", "No microphone found. Check your device's mic.");
      } else if (err === "network") {
        setStatus("error", "Network error reaching the speech service.");
      } else if (err === "language-not-supported") {
        setStatus("error", "Your browser can't recognise " + LANGS[activeSource].name + " speech. Try another language or browser.");
      } else if (err === "aborted") {
        setStatus("", "Ready. Choose languages and start talking.");
      } else {
        setStatus("error", "Speech recognition error: " + err);
      }
    };

    r.onend = function () {
      const captured = r._final;
      r._final = "";
      stopListeningUI();
      if (captured) {
        handleTranscript(captured, activeSource, otherLang(activeSource));
      } else if (!elStatus.classList.contains("is-error")) {
        setStatus("", "Ready. Choose languages and start talking.");
      }
    };

    return r;
  }

  function otherLang(lang) {
    return lang === leftLang ? rightLang : leftLang;
  }

  function startListening(sourceLang) {
    if (!recognition) recognition = buildRecognition();
    if (listening) {
      try { recognition.abort(); } catch (e) { /* ignore */ }
    }
    activeSource = sourceLang;
    recognition.lang = LANGS[sourceLang].recog;
    recognition._final = "";
    try {
      recognition.start();
    } catch (e) {
      setTimeout(function () {
        try { recognition.start(); } catch (e2) { setStatus("error", "Couldn't start the mic. Try again."); }
      }, 250);
    }
    listening = true;
    setListeningUI(sourceLang);
    setStatus("listening", "Listening in " + LANGS[sourceLang].name + "…", "");
  }

  function stopListening() {
    if (recognition && listening) {
      try { recognition.stop(); } catch (e) { /* ignore */ }
    }
  }

  function setListeningUI(sourceLang) {
    [btnA, btnB].forEach(function (b) {
      b.classList.toggle("is-listening", b.dataset.lang === sourceLang && listening);
    });
  }

  function stopListeningUI() {
    listening = false;
    btnA.classList.remove("is-listening");
    btnB.classList.remove("is-listening");
  }

  /* ---------- Translation (MyMemory) ----------
     MyMemory is a crowd-sourced translation memory: its auto-picked
     "translatedText" is often a junk community submission, and it returns
     several competing matches. We ignore that and instead choose the single
     best *machine-translation* match, discarding crowd/garbled entries. */
  function translate(text, srcIso, tgtIso) {
    const url = "https://api.mymemory.translated.net/get?q=" +
      encodeURIComponent(text) + "&langpair=" + srcIso + "|" + tgtIso + "&mt=1";
    return fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        const direct = data && data.responseData && data.responseData.translatedText;
        // Quota / service warnings come back in the text with a non-200 status.
        if ((data.responseStatus && +data.responseStatus !== 200) ||
            (typeof direct === "string" && /mymemory warning|quota|you used all/i.test(direct))) {
          throw new Error("Free translation limit reached for now. Try again later.");
        }
        const best = pickBestTranslation(data, text);
        if (!best) throw new Error("Couldn't translate that. Please try again.");
        return decodeEntities(best);
      });
  }

  // Choose one clean translation from MyMemory's response.
  function pickBestTranslation(data, sourceText) {
    const src = String(sourceText || "").trim().toLowerCase();
    const direct = (((data && data.responseData && data.responseData.translatedText) || "")).trim();

    // A result is "bad" if it's empty, just echoes the source, or embeds the
    // untranslated source text (the signature of MyMemory's junk crowd entries).
    function looksBad(t) {
      if (!t) return true;
      const tl = t.toLowerCase();
      if (tl === src) return true;
      if (src.length > 3 && tl.indexOf(src) !== -1 && t.length > src.length + 2) return true;
      return false;
    }

    // Trust MyMemory's own best answer unless it's junk.
    if (!looksBad(direct)) return direct;

    // Otherwise fall back to the best alternative match (by match score, then quality).
    let cands = Array.isArray(data.matches) ? data.matches.slice() : [];
    cands = cands.filter(function (m) {
      return m && m.translation && !looksBad(String(m.translation).trim());
    });
    const qual = function (m) { return parseFloat(m.quality) || 0; };
    cands.sort(function (a, b) {
      if ((b.match || 0) !== (a.match || 0)) return (b.match || 0) - (a.match || 0);
      return qual(b) - qual(a);
    });
    if (cands.length) return String(cands[0].translation).trim();
    return direct || null;
  }

  function decodeEntities(str) {
    const t = document.createElement("textarea");
    t.innerHTML = str;
    return t.value;
  }

  /* ---------- Handle a captured utterance ---------- */
  function handleTranscript(text, srcLang, tgtLang) {
    const S = LANGS[srcLang], T = LANGS[tgtLang];
    const side = (srcLang === leftLang) ? "left" : "right";
    setStatus("working", "Translating from " + S.name + " to " + T.name + "…", text);

    translate(text, S.iso, T.iso)
      .then(function (translated) {
        addBubble(side, srcLang, tgtLang, text, translated);
        if (elAutospeak.checked) speak(translated, tgtLang);
        else setStatus("", "Done. Tap a button to continue.");
      })
      .catch(function (err) {
        addBubble(side, srcLang, tgtLang, text, null);
        setStatus("error", err.message || "Translation failed.");
      });
  }

  /* ---------- Text-to-speech ---------- */
  function loadVoices() {
    if (!hasTTS) return;
    voices = window.speechSynthesis.getVoices() || [];
  }

  function pickVoice(iso) {
    if (!voices.length) loadVoices();
    const matches = voices.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf(iso) === 0; });
    const local = matches.find(function (v) { return v.localService; });
    return local || matches[0] || null;
  }

  function speak(text, lang) {
    if (!hasTTS) { setStatus("", "Translation ready (this browser can't speak it aloud)."); return; }
    const L = LANGS[lang];
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(L.iso);
    if (v) u.voice = v;
    u.lang = v ? v.lang : L.recog;
    u.rate = 1;
    u.onstart = function () { setStatus("speaking", "Speaking in " + L.name + "…", ""); };
    u.onend = function () { setStatus("", "Done. Tap a button to continue."); };
    u.onerror = function () { setStatus("", "Done."); };
    window.speechSynthesis.speak(u);
  }

  /* ---------- Conversation bubbles ---------- */
  function addBubble(side, srcLang, tgtLang, original, translated) {
    if (elEmpty) elEmpty.style.display = "none";
    const S = LANGS[srcLang], T = LANGS[tgtLang];

    const bubble = document.createElement("div");
    bubble.className = "bubble " + (side === "left" ? "bubble--left" : "bubble--right");

    // Meta line
    const meta = document.createElement("div");
    meta.className = "bubble__meta";
    meta.innerHTML = '<span class="bubble__flag">' + S.flag + "</span> " +
      S.name + " → " + T.name + " &middot; " + timeNow();
    bubble.appendChild(meta);

    // Two-column grid: what was said  |  what it means
    const grid = document.createElement("div");
    grid.className = "bubble__grid";

    // Original cell
    const cellA = document.createElement("div");
    cellA.className = "bubble__cell";
    const labA = document.createElement("span");
    labA.className = "bubble__lang";
    labA.textContent = S.flag + " " + S.name + " · said";
    const orig = document.createElement("p");
    orig.className = "bubble__original";
    orig.textContent = "“" + original + "”";
    cellA.appendChild(labA);
    cellA.appendChild(orig);

    // Translation cell
    const cellB = document.createElement("div");
    cellB.className = "bubble__cell bubble__cell--translation";
    const labB = document.createElement("span");
    labB.className = "bubble__lang";
    labB.textContent = T.flag + " " + T.name + " · translation";
    const trans = document.createElement("p");
    trans.className = "bubble__translated";
    if (translated) {
      trans.textContent = translated;
    } else {
      trans.textContent = "⚠️ Translation unavailable";
      trans.classList.add("is-error");
    }
    cellB.appendChild(labB);
    cellB.appendChild(trans);

    grid.appendChild(cellA);
    grid.appendChild(cellB);
    bubble.appendChild(grid);

    if (translated && hasTTS) {
      const actions = document.createElement("div");
      actions.className = "bubble__actions";
      const btn = document.createElement("button");
      btn.className = "speak-btn";
      btn.type = "button";
      btn.textContent = "🔊 Play translation";
      btn.addEventListener("click", function () { speak(translated, tgtLang); });
      actions.appendChild(btn);
      bubble.appendChild(actions);
    }

    elConversation.appendChild(bubble);
    bubble.scrollIntoView({ behavior: "smooth", block: "end" });
  }

  function timeNow() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function clearConversation() {
    window.speechSynthesis && window.speechSynthesis.cancel();
    Array.prototype.slice.call(elConversation.querySelectorAll(".bubble")).forEach(function (b) { b.remove(); });
    if (elEmpty) elEmpty.style.display = "";
    setStatus("", "Conversation cleared. Choose languages and start talking.");
  }

  /* ---------- Accessibility display preferences ---------- */
  const A11Y_KEY = "lingualive-a11y";
  const a11y = { text: "normal", contrast: "normal" };

  function loadA11y() {
    try {
      const p = JSON.parse(localStorage.getItem(A11Y_KEY) || "{}");
      if (p.text) a11y.text = p.text;
      if (p.contrast) a11y.contrast = p.contrast;
    } catch (e) { /* ignore */ }
  }

  function applyA11y() {
    const root = document.documentElement;
    if (a11y.text === "large") root.setAttribute("data-text", "large");
    else root.removeAttribute("data-text");
    if (a11y.contrast === "high") root.setAttribute("data-contrast", "high");
    else root.removeAttribute("data-contrast");

    const tText = $("#toggle-text"), tContrast = $("#toggle-contrast");
    const largeOn = a11y.text === "large", contrastOn = a11y.contrast === "high";
    tText.classList.toggle("is-on", largeOn);
    tText.setAttribute("aria-pressed", largeOn ? "true" : "false");
    tContrast.classList.toggle("is-on", contrastOn);
    tContrast.setAttribute("aria-pressed", contrastOn ? "true" : "false");
  }

  function saveA11y() {
    try { localStorage.setItem(A11Y_KEY, JSON.stringify(a11y)); } catch (e) { /* ignore */ }
  }

  function initA11y() {
    loadA11y();
    applyA11y();
    $("#toggle-text").addEventListener("click", function () {
      a11y.text = (a11y.text === "large") ? "normal" : "large";
      applyA11y(); saveA11y();
    });
    $("#toggle-contrast").addEventListener("click", function () {
      a11y.contrast = (a11y.contrast === "high") ? "normal" : "high";
      applyA11y(); saveA11y();
    });
  }

  /* ---------- Wire up ---------- */
  function onTalkClick(e) {
    const btn = e.currentTarget;
    const src = btn.dataset.lang;
    if (listening && activeSource === src) stopListening();
    else startListening(src);
  }

  function sendTyped(side) {
    const text = elTypeInput.value.trim();
    if (!text) { elTypeInput.focus(); return; }
    const src = (side === "left") ? leftLang : rightLang;
    const tgt = (side === "left") ? rightLang : leftLang;
    stopListening();
    elTypeInput.value = "";
    handleTranscript(text, src, tgt);
  }

  function init() {
    applyBranding();
    initA11y();
    populateSelect(elLangLeft);
    populateSelect(elLangRight);
    renderPair();

    if (!SR) {
      elSupportWarning.hidden = false;
      btnA.disabled = true;
      btnB.disabled = true;
      setStatus("error", "Live microphone not supported in this browser.");
    } else {
      btnA.addEventListener("click", onTalkClick);
      btnB.addEventListener("click", onTalkClick);
    }

    elLangLeft.addEventListener("change", function () { onLangChange("left", elLangLeft.value); });
    elLangRight.addEventListener("change", function () { onLangChange("right", elLangRight.value); });
    $("#swap-btn").addEventListener("click", swap);
    $("#clear-btn").addEventListener("click", clearConversation);

    // Type-to-translate (works regardless of microphone support)
    btnSendLeft.addEventListener("click", function () { sendTyped("left"); });
    btnSendRight.addEventListener("click", function () { sendTyped("right"); });
    elTypeInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendTyped("left"); }
    });

    if (hasTTS) {
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    document.addEventListener("visibilitychange", function () {
      if (document.hidden) { stopListening(); window.speechSynthesis && window.speechSynthesis.cancel(); }
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
