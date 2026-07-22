/* ============================================================
   RMH DESIGNS — motion
   1. Hero pixel→material assembly (canvas particles)
   2. Scroll reveals + capabilities stagger + manifesto words
   3. Grid scaffold toggle (button / 'g')
   4. Spec-sheet readouts (scroll coord + pointer)
   All guarded by prefers-reduced-motion.
   Browser globals are addressed via `window.` so this file lints clean
   under the repo's public-microsite ESLint config.
   ============================================================ */
(() => {
  "use strict";
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------------------------------------------------------
     1. HERO — pixels assemble, then resolve into matter
     --------------------------------------------------------------- */
  function heroPixels() {
    const headline = $(".hero-headline");
    const canvas   = $(".hero-pixels");
    if (!headline) return;
    const revealText = () => {
      headline.classList.remove("materializing");
      headline.classList.add("revealed");
      if (canvas) canvas.remove();
    };
    if (!canvas || reduce || !canvas.getContext) return revealText();

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const ready = document.fonts && document.fonts.ready
      ? document.fonts.ready : Promise.resolve();

    ready.then(() => requestAnimationFrame(() => setTimeout(build, 30)));

    function build() {
      const particles = [];
      try {
        const box   = headline.getBoundingClientRect();
        const W = box.width, H = box.height;
        if (W < 2 || H < 2) return revealText();

        canvas.style.width = W + "px";
        canvas.style.height = H + "px";
        canvas.width  = Math.ceil(W * dpr);
        canvas.height = Math.ceil(H * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        // Draw each line onto the overlay, scaled to match the DOM footprint
        // (canvas ignores font-stretch, so we scale-to-fit for alignment).
        const lines = $$(".line", headline);
        const cs = window.getComputedStyle(lines[0] || headline);
        const fs = parseFloat(cs.fontSize) || 80;
        ctx.fillStyle = "#fff";
        ctx.textBaseline = "alphabetic";
        ctx.font = `900 ${fs}px "Archivo", system-ui, sans-serif`;

        lines.forEach((line) => {
          const lr = line.getBoundingClientRect();
          const x  = lr.left - box.left;
          const baseline = (lr.top - box.top) + fs * 0.8;
          const text = line.textContent.replace(/\s+/g, " ").trim();
          const drawn = ctx.measureText(text).width || 1;
          const sx = clamp(lr.width / drawn, 0.4, 3);
          ctx.save();
          ctx.translate(x, 0);
          ctx.scale(sx, 1);
          ctx.fillText(text, 0, baseline);
          ctx.restore();
        });

        // Sample lit cells
        const CELL = Math.max(5, Math.round(W / 175));
        const step = CELL * dpr;
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        for (let y = 0; y < canvas.height; y += step) {
          for (let x = 0; x < canvas.width; x += step) {
            const a = data[(y * canvas.width + x) * 4 + 3];
            if (a > 128) {
              const tx = x / dpr, ty = y / dpr;
              particles.push({
                tx, ty,
                x: tx + (Math.random() - 0.5) * W * 0.5,
                y: ty + (Math.random() - 0.3) * H * 2 + H,
                s: CELL - 1,
                d: Math.random() * 320,            // stagger
              });
            }
          }
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        if (!particles.length || particles.length > 9000) return revealText();
      } catch {
        return revealText();
      }

      // Animate assembly
      const DUR = 900, MAXD = 320, HOLD = 240;
      const easeOut = (t) => 1 - Math.pow(1 - t, 3);
      let start = null, revealed = false;

      function frame(ts) {
        if (start === null) start = ts;
        const t = ts - start;
        const box = headline.getBoundingClientRect();
        ctx.clearRect(0, 0, box.width, box.height);
        ctx.globalCompositeOperation = "lighter";

        let allHome = true;
        for (const p of particles) {
          const local = clamp((t - p.d) / DUR, 0, 1);
          if (local < 1) allHome = false;
          const e = easeOut(local);
          p.x += (p.tx - p.x) * (0.12 + 0.26 * e);
          p.y += (p.ty - p.y) * (0.12 + 0.26 * e);
          // bloom
          ctx.fillStyle = "rgba(110,123,255,0.22)";
          ctx.fillRect(p.x - p.s * 0.6, p.y - p.s * 0.6, p.s * 2.2, p.s * 2.2);
          // core
          ctx.fillStyle = "rgba(35,56,255,0.95)";
          ctx.fillRect(p.x, p.y, p.s, p.s);
        }
        ctx.globalCompositeOperation = "source-over";

        if (!revealed && allHome && t > DUR + MAXD + HOLD) {
          revealed = true;
          headline.classList.remove("materializing");
          headline.classList.add("revealed");   // matte type fades in
          canvas.style.opacity = "0";            // light dissolves
          setTimeout(() => canvas.remove(), 650);
          return;
        }
        requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }
  }

  /* ---------------------------------------------------------------
     2. REVEALS — work, capabilities, manifesto words
     --------------------------------------------------------------- */
  function reveals() {
    if (reduce) {
      $$(".cap").forEach((c) => c.classList.add("in"));
      $$(".creed").forEach((c) => c.classList.add("in"));
      return;
    }
    const io = new window.IntersectionObserver((entries, obs) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        en.target.classList.add("in");
        obs.unobserve(en.target);
      });
    }, { threshold: 0.18, rootMargin: "0px 0px -8% 0px" });

    $$(".cap, .creed, [data-reveal]").forEach((el) => io.observe(el));

    // stagger capability rows within each column
    $$(".matrix .col").forEach((col) => {
      $$(".cap", col).forEach((cap, i) => (cap.style.transitionDelay = i * 70 + "ms"));
    });
  }

  /* ---------------------------------------------------------------
     3. GRID SCAFFOLD — the shared coordinate system, on demand
     --------------------------------------------------------------- */
  function scaffold() {
    const host = $(".scaffold");
    const btn  = $(".grid-toggle");
    if (!host || !btn) return;
    let built = false;

    const build = () => {
      if (built) return; built = true;
      const cols = 12, rows = 9;
      const colWrap = document.createElement("div"); colWrap.className = "cols";
      const rowWrap = document.createElement("div"); rowWrap.className = "rows";
      const letters = "ABCDEFGHIJKL";
      for (let i = 1; i < cols; i++) {
        const v = document.createElement("div"); v.className = "v";
        v.style.left = (i / cols) * 100 + "%";
        v.style.transitionDelay = i * 28 + "ms";
        colWrap.appendChild(v);
      }
      for (let i = 0; i < cols; i++) {
        const l = document.createElement("label"); l.className = "col-lab";
        l.textContent = letters[i]; l.style.left = ((i + 0.5) / cols) * 100 + "%";
        colWrap.appendChild(l);
      }
      for (let i = 1; i < rows; i++) {
        const h = document.createElement("div"); h.className = "h";
        h.style.top = (i / rows) * 100 + "%";
        h.style.transitionDelay = i * 28 + "ms";
        rowWrap.appendChild(h);
      }
      for (let i = 0; i < rows; i++) {
        const l = document.createElement("label"); l.className = "row-lab";
        l.textContent = String(i + 1).padStart(2, "0");
        l.style.top = ((i + 0.5) / rows) * 100 + "%";
        rowWrap.appendChild(l);
      }
      host.append(colWrap, rowWrap);
    };

    const toggle = () => {
      build();
      const on = document.body.classList.toggle("grid-on");
      btn.setAttribute("aria-pressed", String(on));
    };

    btn.addEventListener("click", toggle);
    window.addEventListener("keydown", (e) => {
      if (e.key.toLowerCase() === "g" && !/input|textarea/i.test(document.activeElement.tagName)) {
        e.preventDefault(); toggle();
      }
    });
  }

  /* ---------------------------------------------------------------
     4. READOUTS — scroll position as coordinate, live pointer
     --------------------------------------------------------------- */
  function readouts() {
    const scr = $(".readout.scroll .val");
    const sec = $(".readout.scroll .sec");
    const ptr = $(".readout.ptr .val");
    const sections = $$("main [data-sec]");

    if (scr) {
      let raf = 0;
      const onScroll = () => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const max = document.documentElement.scrollHeight - window.innerHeight;
          const pct = clamp(window.scrollY / (max || 1), 0, 1);
          scr.textContent = String(Math.round(pct * 100)).padStart(3, "0") + "%";
          let active = "";
          for (const s of sections) {
            if (s.getBoundingClientRect().top <= window.innerHeight * 0.4) active = s.dataset.sec;
          }
          if (sec && active) sec.textContent = active;
        });
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }

    if (ptr && window.matchMedia("(pointer:fine)").matches) {
      window.addEventListener("pointermove", (e) => {
        ptr.textContent =
          String(Math.round(e.clientX)).padStart(4, "0") + "," +
          String(Math.round(e.clientY)).padStart(4, "0");
      }, { passive: true });
    }
  }

  /* ---- boot ---- */
  const boot = () => { heroPixels(); reveals(); scaffold(); readouts(); };
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
