/* RMH Capital — shared site behavior */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* sticky nav scrolled state */
  var nav = document.querySelector(".topnav");
  if (nav) {
    var onScroll = function () { nav.classList.toggle("scrolled", window.scrollY > 12); };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* mobile menu */
  var toggle = document.querySelector(".nav-toggle");
  var menu = document.querySelector(".mobile-menu");
  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      var open = menu.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  /* scroll reveal */
  var reveals = document.querySelectorAll(".reveal");
  if (!reduce && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -8% 0px" });
    reveals.forEach(function (n) { io.observe(n); });
  } else {
    reveals.forEach(function (n) { n.classList.add("in"); });
  }

  /* set dash length for any arc-draw paths so the animation is exact */
  document.querySelectorAll(".arc-draw").forEach(function (p) {
    if (typeof p.getTotalLength === "function") {
      var len = Math.ceil(p.getTotalLength());
      p.style.setProperty("--len", len);
    }
  });

  /* insights category filter */
  var chips = document.querySelectorAll(".chip[data-cat]");
  var articles = document.querySelectorAll(".article[data-cat]");
  if (chips.length && articles.length) {
    chips.forEach(function (chip) {
      chip.addEventListener("click", function () {
        var cat = chip.getAttribute("data-cat");
        chips.forEach(function (c) { c.setAttribute("aria-pressed", c === chip ? "true" : "false"); });
        articles.forEach(function (a) {
          var show = cat === "all" || a.getAttribute("data-cat") === cat;
          a.classList.toggle("hide", !show);
        });
      });
    });
  }

  /* contact form (front-end only demo) */
  var form = document.querySelector("#inquiry-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var ok = document.querySelector(".form-success");
      if (ok) { ok.classList.add("show"); ok.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); }
      form.reset();
    });
  }

  /* prefill contact inquiry type from ?type= */
  var sel = document.querySelector("#inquiry-type");
  if (sel) {
    var t = new URLSearchParams(location.search).get("type");
    if (t) { for (var i = 0; i < sel.options.length; i++) { if (sel.options[i].value === t) { sel.selectedIndex = i; break; } } }
  }
})();
