// Native WebView browser + AI auto-fill (Android app only).
//
// Har website (IRCTC, scholarship, govt portals...) app ke andar real native
// WebView mein khulti hai — koi remote browser / screenshot streaming nahi.
// Agar `filled` (AI ki nikali hui values) di gayi hai to page par script
// inject hoti hai jo khud: text fields bharti hai, dropdown select karti hai,
// radio / checkbox tick karti hai, aur har field ko green highlight karti hai.
//
// Hamesha user ke haath mein: photo/signature upload, captcha, OTP, payment,
// declaration/terms ka tick aur final Submit. Ye kabhi automate nahi hote.
//
// Ye sirf native Android app (Capacitor) mein chalta hai — normal browser tab
// doosre origin ke page ko script nahi kar sakta (browser security rule).

const FIELD_HINTS = {
  fatherName: { words: ["father", "pita", "guardian", "fname"] },
  fullName: {
    words: ["full name", "fullname", "candidate name", "applicant name", "naam", "name"],
    not: ["father", "mother", "pita", "mata", "husband", "spouse", "user", "school", "board", "bank", "company", "institute"],
  },
  mobile: { words: ["mobile", "phone", "contact", "cell"], not: ["alternate"] },
  email: { words: ["email", "e mail", "mail"] },
  dob: { words: ["dob", "birth", "janam"] },
  address: { words: ["address", "pata"], not: ["email", "mail"] },
  age: { words: ["age"] },
  category: { words: ["category", "caste", "varg"] },
  gender: { words: ["gender", "sex", "linga"] },
  qualification: { words: ["qualification", "education"] },
  height: { words: ["height"] },
  weight: { words: ["weight"] },
  berthPreference: { words: ["berth"] },
};

const VALUE_ALIASES = {
  gender: { male: ["m", "purush"], female: ["f", "mahila"], other: ["o", "t", "transgender"] },
};

function buildFillScript(filled) {
  const data = JSON.stringify(filled || {});
  const hints = JSON.stringify(FIELD_HINTS);
  const aliases = JSON.stringify(VALUE_ALIASES);
  return `
(function () {
  try {
    var DATA = ${data};
    var HINTS = ${hints};
    var ALIASES = ${aliases};
    var SKIP_TYPES = ["file", "hidden", "submit", "button", "image", "reset", "password"];
    var SKIP_WORDS = /captcha|otp|passw|verification|security code|agree|declar|terms|consent|undertak|hereby|robot/;

    if (window.__sarkariAI) { window.__sarkariAI.data = DATA; window.__sarkariAI.run(); return; }

    var state = { data: DATA, count: 0, busy: false, timer: null, advanced: false };
    window.__sarkariAI = state;

    function norm(s) { return String(s || "").toLowerCase().replace(/[_\\-\\.\\[\\]\\/]+/g, " ").replace(/\\s+/g, " ").trim(); }
    function esc(s) { return s.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&"); }
    function hasWord(text, w) {
      return new RegExp("(^|[^a-z])" + esc(w) + "([^a-z]|$)").test(text);
    }

    function labelText(el) {
      var t = "";
      try {
        if (el.id) { var l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) t += " " + l.textContent; }
      } catch (e) {}
      var p = el.closest("label"); if (p) t += " " + p.textContent;
      var lb = el.getAttribute("aria-labelledby");
      if (lb) lb.split(" ").forEach(function (id) { var n = document.getElementById(id); if (n) t += " " + n.textContent; });
      return t;
    }

    function containerText(el) {
      var n = el;
      for (var i = 0; i < 3 && n.parentElement; i++) {
        n = n.parentElement;
        var tx = (n.textContent || "").trim();
        if (tx.length > 0 && tx.length < 100) return tx;
      }
      return "";
    }

    function fieldProbe(el) {
      var isSelect = el.tagName === "SELECT";
      return norm(
        (el.name || "") + " " + (el.id || "") + " " + (el.placeholder || "") + " " +
        (el.getAttribute("aria-label") || "") + " " + labelText(el) + " " +
        (isSelect ? "" : containerText(el))
      );
    }

    function pickKey(probe, onlyKeys) {
      var best = null, bestScore = 0;
      for (var key in DATA) {
        if (!DATA[key]) continue;
        if (onlyKeys && onlyKeys.indexOf(key) === -1) continue;
        var h = HINTS[key] || { words: [norm(key)] };
        var blocked = false;
        (h.not || []).forEach(function (w) { if (hasWord(probe, w)) blocked = true; });
        if (blocked) continue;
        (h.words || []).forEach(function (w) {
          if (hasWord(probe, w) && w.length > bestScore) { best = key; bestScore = w.length; }
        });
      }
      return best;
    }

    function matches(key, text, val) {
      var n = norm(text), v = norm(val);
      if (!n || !v) return false;
      if (n === v) return true;
      var al = (ALIASES[key] || {})[v] || [];
      if (al.indexOf(n) !== -1) return true;
      if (v.length > 2 && hasWord(n, v)) return true;
      return false;
    }

    function setVal(el, v) {
      var proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype :
                  el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      var d = Object.getOwnPropertyDescriptor(proto, "value");
      if (d && d.set) d.set.call(el, v); else el.value = v;
      ["input", "change", "blur"].forEach(function (ev) { el.dispatchEvent(new Event(ev, { bubbles: true })); });
    }

    function toDateInput(v) {
      var m = String(v).match(/^(\\d{1,2})[\\/\\-.](\\d{1,2})[\\/\\-.](\\d{4})$/);
      if (!m) return v;
      return m[3] + "-" + ("0" + m[2]).slice(-2) + "-" + ("0" + m[1]).slice(-2);
    }

    function mark(el) {
      el.__sarkariDone = true;
      try { el.style.outline = "2px solid #16a34a"; el.style.outlineOffset = "1px"; } catch (e) {}
      state.count++;
      banner();
    }

    function banner(done) {
      var b = document.getElementById("__sarkari_ai_banner");
      if (!b) {
        b = document.createElement("div");
        b.id = "__sarkari_ai_banner";
        b.style.cssText = "position:fixed;left:8px;right:8px;bottom:12px;z-index:2147483647;background:#0b1f3a;color:#fff;font:600 13px sans-serif;padding:10px 14px;border-radius:12px;box-shadow:0 4px 14px rgba(0,0,0,.35);text-align:center;pointer-events:none";
        document.body.appendChild(b);
      }
      b.textContent = done
        ? "\\u2713 AI ne " + state.count + " fields bhare \\u2014 check karke CAPTCHA/OTP aur payment aap karein; final submit se pehle check karein"
        : "\\uD83E\\uDD16 AI form bhar raha hai\\u2026 (" + state.count + ")";
    }

    function collect() {
      var tasks = [];
      var seenGroups = {};
      document.querySelectorAll("input, textarea, select").forEach(function (el) {
        if (el.__sarkariDone || el.disabled || el.readOnly) return;
        var type = (el.type || "").toLowerCase();
        if (SKIP_TYPES.indexOf(type) !== -1) return;
        var probe = fieldProbe(el);
        if (SKIP_WORDS.test(probe)) return;

        if (type === "radio" || type === "checkbox") {
          var gname = el.name || el.id || "";
          var gkey = type + ":" + gname;
          if (gname && seenGroups[gkey]) return;
          if (gname) seenGroups[gkey] = true;
          var group = gname
            ? Array.prototype.slice.call(document.querySelectorAll('input[type="' + type + '"]')).filter(function (x) { return x.name === el.name; })
            : [el];
          var fs = el.closest("fieldset");
          var gprobe = norm((el.name || "") + " " + (fs && fs.querySelector("legend") ? fs.querySelector("legend").textContent : "") + " " + containerText(group[0].parentElement || group[0]));
          var key = pickKey(gprobe, ["gender", "category", "qualification", "berthPreference"]);
          if (!key) return;
          var target = null;
          group.forEach(function (x) {
            if (target || x.disabled) return;
            if (matches(key, labelText(x), DATA[key]) || matches(key, x.value, DATA[key]) ||
                matches(key, (x.nextSibling && x.nextSibling.textContent) || "", DATA[key])) target = x;
          });
          if (target && !target.checked) tasks.push({ el: target, kind: "tick", group: group });
          return;
        }

        if (el.value && el.tagName !== "SELECT") return;
        var key2 = pickKey(probe);
        if (!key2) return;

        if (el.tagName === "SELECT") {
          var opt = null;
          Array.prototype.slice.call(el.options).forEach(function (o) {
            if (!opt && (matches(key2, o.text, DATA[key2]) || matches(key2, o.value, DATA[key2]))) opt = o;
          });
          if (opt && !opt.selected) tasks.push({ el: el, kind: "select", value: opt.value });
          return;
        }
        var v = String(DATA[key2]);
        if (type === "date") v = toDateInput(v);
        tasks.push({ el: el, kind: "text", value: v });
      });
      return tasks;
    }

    function visible(el) {
      if (!el || !el.getBoundingClientRect) return false;
      var r = el.getBoundingClientRect(), st = window.getComputedStyle(el);
      return r.width > 0 && r.height > 0 && st.display !== "none" && st.visibility !== "hidden";
    }

    function needsHumanStep() {
      var nodes = Array.prototype.slice.call(document.querySelectorAll("input, textarea, [role=\"textbox\"]"));
      return nodes.some(function (el) {
        if (!visible(el)) return false;
        var p = norm((el.name || "") + " " + (el.id || "") + " " + (el.placeholder || "") + " " + (el.getAttribute("aria-label") || "") + " " + labelText(el) + " " + containerText(el));
        return /captcha|security code|verification code|enter otp|one time password|\\botp\\b/.test(p);
      });
    }

    function advanceSafeNext() {
      // Only advance through explicitly labelled Next/Continue steps. Never click
      // Submit/Apply/Pay/Confirm, and pause if OTP/CAPTCHA is visible.
      if (state.advanced || needsHumanStep()) return;
      var candidates = Array.prototype.slice.call(document.querySelectorAll("button, input[type=button], input[type=submit], a[role=button], [role=button]"));
      var nextBtn = candidates.find(function (el) {
        if (!visible(el) || el.disabled || el.getAttribute("aria-disabled") === "true") return false;
        var label = norm(el.innerText || el.value || el.getAttribute("aria-label") || el.title || "");
        if (!/^(next|next step|continue|continue application|proceed|save and continue|आगे|अगला)$/.test(label)) return false;
        if (/submit|apply|payment|pay|confirm|final|register|finish/.test(label)) return false;
        return true;
      });
      if (nextBtn) {
        state.advanced = true;
        nextBtn.scrollIntoView({ block: "center", behavior: "smooth" });
        setTimeout(function () { try { nextBtn.click(); } catch (e) {} }, 500);
      }
    }

    function run() {
      if (state.busy) return;
      var tasks = collect();
      if (!tasks.length) { if (state.count) { banner(true); advanceSafeNext(); } return; }
      state.busy = true;
      banner();
      var i = 0;
      (function next() {
        if (i >= tasks.length) { state.busy = false; banner(true); advanceSafeNext(); return; }
        var t = tasks[i++];
        try {
          t.el.scrollIntoView({ block: "center", behavior: "smooth" });
          if (t.kind === "tick") { t.el.click(); }
          else { t.el.focus(); setVal(t.el, t.value); }
          if (t.group) t.group.forEach(function (x) { x.__sarkariDone = true; });
          mark(t.el);
        } catch (e) { t.el.__sarkariDone = true; }
        setTimeout(next, 350);
      })();
    }
    state.run = run;

    var mo = new MutationObserver(function () {
      clearTimeout(state.timer);
      state.timer = setTimeout(run, 700);
    });
    mo.observe(document.body, { childList: true, subtree: true });
    run();
  } catch (e) {}
})();
`;
}

// Koi bhi website native WebView mein kholo. `filled` do to AI auto-fill bhi chalega.
export async function openInWebView(url, filled, title) {
  const { InAppBrowser } = await import("@capgo/inappbrowser");

  // Purane listeners hatao taaki dobara kholne par duplicate inject na ho.
  await InAppBrowser.removeAllListeners().catch(() => {});

  const hasData = filled && Object.values(filled).some(Boolean);
  const script = hasData ? buildFillScript(filled) : null;

  if (script) {
    const inject = () => InAppBrowser.executeScript({ code: script }).catch(() => {});

    // Har baar page/URL badle, dobara try karo (multi-page forms ke liye).
    await InAppBrowser.addListener("urlChangeEvent", () => {
      setTimeout(inject, 1200);
      setTimeout(inject, 3500);
    });
  }

  await InAppBrowser.addListener("closeEvent", () => {
    InAppBrowser.removeAllListeners().catch(() => {});
  });

  await InAppBrowser.openWebView({
    url,
    title: title || (script ? "AI Form Bhar Raha Hai" : "Sarkari AI"),
    toolbarColor: "#0b1f3a",
  });

  if (script) {
    // Pehli load ke liye bhi try, agar urlChangeEvent miss ho jaaye.
    setTimeout(() => InAppBrowser.executeScript({ code: script }).catch(() => {}), 2500);
  }
}

// Purane naam se compatibility.
export const openAndAutoFill = (url, filled) => openInWebView(url, filled);
