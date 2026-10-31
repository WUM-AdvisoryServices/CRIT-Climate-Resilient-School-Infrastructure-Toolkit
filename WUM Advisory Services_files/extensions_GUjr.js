(function () {
  "use strict";

  if (window.__grokAppBuilderExtensions) return;
  window.__grokAppBuilderExtensions = true;

  var pageHost = (location.hostname || "").toLowerCase();
  var staging =
    pageHost === "app-builder-testing.com" ||
    pageHost.endsWith(".app-builder-testing.com") ||
    pageHost === "mouseion.dev" ||
    pageHost.endsWith(".mouseion.dev");
  var DEPLOYER_ORIGIN = staging
    ? "https://app-builder-deployer.gcp.mouseion.dev"
    : "https://app-builder-deployer.grok.com";
  var REMIX_ORIGIN = staging ? "https://grok.gcp.mouseion.dev" : "https://grok.com";

  var MOBILE_MQ = "(max-width: 767px), (hover: none) and (pointer: coarse)";
  var BANNER_H = "calc(44px + env(safe-area-inset-top, 0px))";
  var DOC_STYLE_ID = "grok-app-builder-extensions-css";
  var SHELL_ATTR = "data-grok-viewport-shell";
  var SHELL_FIXED_ATTR = "data-grok-viewport-fixed";
  var SKIP_TAG = /^(SCRIPT|STYLE|LINK|META|NOSCRIPT|IFRAME|CANVAS|SVG|PATH|BR|IMG|SOURCE|TRACK)$/;
  var MAX_DEPTH = 8;
  var SIZE_SLOP = 8;

  var mobileChrome = false;
  var applyingShells = false;
  var shellRaf = 0;
  var shellObserver = null;

  var REMIX_ICON =
    '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">' +
    '<path d="M2.85059 3.5C3.42171 3.49757 3.9879 3.74949 4.36816 4.17562C5.82851 5.79822 7.28852 7.42134 8.74886 9.04394C8.91014 9.22468 9.14982 9.3323 9.39201 9.33333C9.39445 9.33335 9.39697 9.33333 9.39941 9.33333C9.69335 9.33354 9.98729 9.34136 10.2812 9.35612L9.50423 8.5791L10.3291 7.75423L12.4915 9.91667L10.3291 12.0791L9.50423 11.2542L10.2812 10.4766C9.98728 10.4914 9.69336 10.4998 9.39941 10.5C9.39371 10.5 9.38802 10.5 9.38232 10.5C8.81697 10.4976 8.25832 10.2462 7.88184 9.82438C6.42149 8.20178 4.96148 6.57866 3.50114 4.95605C3.33823 4.77345 3.09529 4.66561 2.85059 4.66667H1.75V3.5H2.85059Z" fill="#417CFF"/>' +
    '<path d="M5.53597 8.52612C5.14663 8.95882 4.75754 9.39174 4.36816 9.82438C3.9879 10.2505 3.42171 10.5024 2.85059 10.5H1.75V9.33333H2.85059C3.09529 9.33439 3.33823 9.22655 3.50114 9.04394C3.91804 8.58073 4.33469 8.11725 4.75155 7.65397L5.53597 8.52612Z" fill="#417CFF"/>' +
    '<path d="M12.4915 4.08333L10.3291 6.24577L9.50423 5.4209L10.2801 4.64445C9.99185 4.65884 9.70361 4.66667 9.41536 4.66667H9.39941C9.15471 4.66561 8.91177 4.77346 8.74886 4.95605C8.33197 5.41926 7.91473 5.88219 7.49788 6.34546L6.71346 5.47331C7.10279 5.04063 7.49247 4.60825 7.88184 4.17562C8.2621 3.74949 8.8283 3.49757 9.39941 3.5H9.41536C9.7036 3.5 9.99186 3.50726 10.2801 3.52165L9.50423 2.74577L10.3291 1.9209L12.4915 4.08333Z" fill="#417CFF"/>' +
    "</svg>";

  function isMobile() {
    return window.matchMedia(MOBILE_MQ).matches;
  }

  function readProjectId() {
    var scripts = document.querySelectorAll('script[src*="/grok-app-builder/extensions.js"]');
    for (var i = scripts.length - 1; i >= 0; i--) {
      var fromAttr = (scripts[i].getAttribute("data-project-id") || "").trim();
      if (fromAttr) return fromAttr;
    }
    var meta = document.querySelector('meta[name="grok-project-id"]');
    return ((meta && meta.getAttribute("content")) || "").trim();
  }

  function injectDocumentStyles() {
    if (document.getElementById(DOC_STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = DOC_STYLE_ID;
    style.textContent =
      ":root{--grok-banner-h:0px}" +
      "[data-created-with-grok-banner]{pointer-events:none;position:fixed;top:8px;" +
      "left:0;right:0;z-index:2147483647;display:flex;justify-content:center}" +
      "[data-created-with-grok-spacer]{display:none;pointer-events:none;" +
      "flex-shrink:0;height:0}" +
      "@media " +
      MOBILE_MQ +
      "{" +
      ":root{--grok-banner-h:" +
      BANNER_H +
      "}" +
      "[data-created-with-grok-banner]{top:0}" +
      "[data-created-with-grok-spacer]{display:block;height:var(--grok-banner-h)}" +
      "[" +
      SHELL_ATTR +
      "]{height:calc(100dvh - var(--grok-banner-h))!important;" +
      "min-height:calc(100dvh - var(--grok-banner-h))!important;" +
      "box-sizing:border-box!important}" +
      "[" +
      SHELL_ATTR +
      "][" +
      SHELL_FIXED_ATTR +
      "]{top:var(--grok-banner-h)!important;bottom:0!important;" +
      "height:auto!important;min-height:0!important;max-height:none!important}" +
      "}";
    (document.head || document.documentElement).appendChild(style);
  }

  function fillBanner(host, projectId, mode) {
    var shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    var bar =
      mode === "bar"
        ? "a{box-sizing:border-box;width:100%;height:" +
          BANNER_H +
          ";justify-content:center;gap:8px;border-radius:0;border:0;" +
          "border-bottom:1px solid rgba(255,255,255,0.15);box-shadow:none;" +
          "padding:env(safe-area-inset-top,0px) 16px 0}"
        : "";
    shadow.innerHTML =
      "<style>" +
      ":host{all:initial}" +
      "a{pointer-events:auto;display:flex;height:36px;align-items:center;gap:8px;" +
      "border-radius:9999px;border:1px solid rgba(255,255,255,0.15);" +
      "background:rgba(0,0,0,0.85);backdrop-filter:blur(12px);" +
      "-webkit-backdrop-filter:blur(12px);padding:0 6px 0 16px;" +
      "font:500 13px/1 system-ui,-apple-system,sans-serif;color:rgba(255,255,255,0.9);" +
      "text-decoration:none;box-shadow:0 1px 2px rgba(0,0,0,0.08),0 4px 12px rgba(0,0,0,0.08);" +
      "user-select:none;-webkit-tap-highlight-color:transparent}" +
      "a:hover .remix{background:rgba(255,255,255,0.15)}" +
      ".label{color:rgba(255,255,255,0.85);letter-spacing:-0.01em}" +
      ".remix{display:inline-flex;height:24px;align-items:center;gap:6px;" +
      "border-radius:9999px;border:1px solid rgba(255,255,255,0.1);" +
      "background:rgba(255,255,255,0.1);padding:0 10px;font-size:12px;font-weight:500;color:#fff;" +
      "transition:background 0.15s}" +
      "svg{display:block;flex-shrink:0}" +
      bar +
      "</style>" +
      '<a href="' +
      REMIX_ORIGIN +
      "/remix?app_id=" +
      encodeURIComponent(projectId) +
      '" target="_blank" rel="noopener noreferrer" aria-label="Created with Grok — Remix this app">' +
      '<span class="label">Created with Grok</span>' +
      '<span class="remix">' +
      REMIX_ICON +
      "Remix</span></a>";
  }

  function isOurs(el) {
    return (
      el.hasAttribute("data-created-with-grok-banner") ||
      el.hasAttribute("data-created-with-grok-spacer") ||
      el.id === DOC_STYLE_ID
    );
  }

  function bannerPx() {
    var spacer = document.querySelector("[data-created-with-grok-spacer]");
    if (spacer && spacer.offsetHeight) return spacer.offsetHeight;
    return 44;
  }

  // 100vh / h-screen on mobile Safari is the large viewport, often tens of
  // pixels taller than innerHeight while browser chrome is showing. Probe
  // the CSS units instead of assuming they equal innerHeight.
  function measureViewportHeights() {
    var probe = document.createElement("div");
    probe.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;left:0;top:0";
    var units = ["vh", "dvh", "svh", "lvh"];
    var kids = [];
    for (var i = 0; i < units.length; i++) {
      var kid = document.createElement("div");
      kid.style.height = "100" + units[i];
      probe.appendChild(kid);
      kids.push(kid);
    }
    document.documentElement.appendChild(probe);
    // Do not include visualViewport.height: the keyboard/zoom inset is not a
    // page-shell unit and would tag ~300px headers as shells.
    var heights = [window.innerHeight, document.documentElement.clientHeight];
    for (var j = 0; j < kids.length; j++) {
      heights.push(kids[j].offsetHeight);
    }
    document.documentElement.removeChild(probe);
    return heights;
  }

  function matchesViewportHeight(height, viewportHeights, bannerH) {
    var min = Infinity;
    var max = 0;
    for (var i = 0; i < viewportHeights.length; i++) {
      var vh = viewportHeights[i];
      if (!(vh > 0)) continue;
      if (vh < min) min = vh;
      if (vh > max) max = vh;
    }
    if (max < min) return false;
    // Band covers 100vh (taller than innerHeight with the URL bar up) and
    // already-shrunk shells (viewport unit minus banner).
    return height >= min - bannerH - SIZE_SLOP && height <= max + SIZE_SLOP;
  }

  function isViewportShell(el, viewportHeights, bannerH) {
    if (!el || el === document.body || el === document.documentElement) {
      return false;
    }
    var rect = el.getBoundingClientRect();
    if (rect.width < window.innerWidth - 32) return false;
    if (rect.top > bannerH + SIZE_SLOP) return false;
    return matchesViewportHeight(rect.height, viewportHeights, bannerH);
  }

  function isFixedToViewport(el) {
    var cs = window.getComputedStyle(el);
    if (cs.position === "fixed") return true;
    if (cs.position !== "absolute") return false;
    var ancestor = el.parentElement;
    while (
      ancestor &&
      ancestor !== document.body &&
      ancestor !== document.documentElement
    ) {
      var p = window.getComputedStyle(ancestor).position;
      if (p === "relative" || p === "absolute" || p === "fixed" || p === "sticky") {
        return false;
      }
      ancestor = ancestor.parentElement;
    }
    var top = parseFloat(cs.top);
    return cs.top === "0px" || (!isNaN(top) && Math.abs(top) <= SIZE_SLOP);
  }

  function clearShellMarks() {
    var marked = document.querySelectorAll("[" + SHELL_ATTR + "]");
    for (var i = 0; i < marked.length; i++) {
      marked[i].removeAttribute(SHELL_ATTR);
      marked[i].removeAttribute(SHELL_FIXED_ATTR);
    }
  }

  function collectShells(viewportHeights, bannerH) {
    var found = [];
    function walk(el, depth) {
      if (!el || el.nodeType !== 1 || depth > MAX_DEPTH) return;
      if (SKIP_TAG.test(el.tagName) || isOurs(el)) return;
      if (isViewportShell(el, viewportHeights, bannerH)) found.push(el);
      // Recurse into shells: nested h-dvh inside #root {height:100%} must
      // shrink too. Safe because those nodes do not contain the spacer.
      var kids = el.children;
      for (var i = 0; i < kids.length; i++) walk(kids[i], depth + 1);
    }
    if (document.body) walk(document.body, 0);
    return found;
  }

  function reconcileShells() {
    if (!mobileChrome) return;
    applyingShells = true;
    clearShellMarks();
    var bannerH = bannerPx();
    var shells = collectShells(measureViewportHeights(), bannerH);
    for (var i = 0; i < shells.length; i++) {
      shells[i].setAttribute(SHELL_ATTR, "");
      if (isFixedToViewport(shells[i])) {
        shells[i].setAttribute(SHELL_FIXED_ATTR, "");
      }
    }
    applyingShells = false;
  }

  function scheduleReconcile() {
    if (!mobileChrome || applyingShells || shellRaf) return;
    shellRaf = window.requestAnimationFrame(function () {
      shellRaf = 0;
      reconcileShells();
    });
  }

  function ensureSpacer() {
    var spacer = document.querySelector("[data-created-with-grok-spacer]");
    if (spacer) return spacer;
    spacer = document.createElement("div");
    spacer.setAttribute("data-created-with-grok-spacer", "");
    spacer.setAttribute("aria-hidden", "true");
    var body = document.body;
    if (body) body.insertBefore(spacer, body.firstChild);
    else document.documentElement.appendChild(spacer);
    return spacer;
  }

  function startShellObserver() {
    if (shellObserver || !document.body) return;
    shellObserver = new MutationObserver(function (records) {
      if (applyingShells) return;
      for (var i = 0; i < records.length; i++) {
        var nodes = records[i].addedNodes;
        for (var pass = 0; pass < 2; pass++) {
          for (var j = 0; j < nodes.length; j++) {
            if (nodes[j].nodeType === 1 && !isOurs(nodes[j])) {
              scheduleReconcile();
              return;
            }
          }
          nodes = records[i].removedNodes;
        }
      }
    });
    shellObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleReconcile);
    window.addEventListener("orientationchange", scheduleReconcile);
  }

  function stopShellObserver() {
    if (shellObserver) {
      shellObserver.disconnect();
      shellObserver = null;
    }
    window.removeEventListener("resize", scheduleReconcile);
    window.removeEventListener("orientationchange", scheduleReconcile);
    if (shellRaf) {
      window.cancelAnimationFrame(shellRaf);
      shellRaf = 0;
    }
    clearShellMarks();
    var spacer = document.querySelector("[data-created-with-grok-spacer]");
    if (spacer && spacer.parentNode) spacer.parentNode.removeChild(spacer);
  }

  function mountBanner(projectId) {
    injectDocumentStyles();
    var host = document.querySelector("[data-created-with-grok-banner]");
    if (!host) {
      host = document.createElement("div");
      host.setAttribute("data-created-with-grok-banner", "");
      (document.body || document.documentElement).appendChild(host);
    }
    applyLayout(projectId, host);
  }

  function applyLayout(projectId, host) {
    var mobile = isMobile();
    fillBanner(host, projectId, mobile ? "bar" : "pill");
    if (mobile) {
      mobileChrome = true;
      ensureSpacer();
      startShellObserver();
      reconcileShells();
    } else {
      mobileChrome = false;
      stopShellObserver();
    }
  }

  function watchViewport(projectId) {
    var mq = window.matchMedia(MOBILE_MQ);
    var onChange = function () {
      var host = document.querySelector("[data-created-with-grok-banner]");
      if (host) applyLayout(projectId, host);
    };
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  function run() {
    var projectId = readProjectId();
    if (!projectId) return;
    fetch(
      DEPLOYER_ORIGIN +
        "/rest/app-deployer/v1/projects/" +
        encodeURIComponent(projectId) +
        "/remix-eligibility",
      { method: "GET", credentials: "omit", headers: { Accept: "application/json" } },
    )
      .then(function (response) {
        if (!response.ok) return null;
        return response.json();
      })
      .then(function (data) {
        if (data && data.forkable === true) {
          mountBanner(projectId);
          watchViewport(projectId);
        }
      })
      .catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
