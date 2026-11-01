// Liam Esgueva: everything drawn on this page.
(() => {
  "use strict";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const NS = "http://www.w3.org/2000/svg";
  const $ = (id) => document.getElementById(id);
  const svgEl = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  // small deterministic RNG so the drawings look the same on every visit
  const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  // ---------------------------------------------------------------- nav
  const nav = document.querySelector(".topnav");
  addEventListener("scroll", () => nav.classList.toggle("scrolled", scrollY > 40), { passive: true });

  // ---------------------------------------------------------------- sky: one day, from first light to night
  // Every section carries a stop (time, sky, ink, accent). The page colours are interpolated between them
  // from the scroll position, so the background changes continuously as you go down.
  const S = { bg: [233, 237, 240], fg: [23, 25, 27], acc: [255, 91, 31], off: 0, hero: 1, dark: 0 };
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const css = (c, a = 1) => `rgba(${c.map(Math.round).join(",")},${a})`;
  const lum = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  const listeners = [];
  (function sky() {
    const stops = [...document.querySelectorAll("[data-sky]")].map((el) => ({
      el, name: el.dataset.name, time: el.dataset.time,
      min: +el.dataset.time.slice(0, 2) * 60 + +el.dataset.time.slice(3),
      bg: hex(el.dataset.sky), fg: hex(el.dataset.ink), acc: hex(el.dataset.accent),
    }));
    const root = document.documentElement.style, rail = $("rail"), dot = $("railDot"), clock = $("railClock");
    let anchors = [], span = 1, ticks = [];
    function measure() {
      const vh = innerHeight, docH = document.documentElement.scrollHeight;
      span = Math.max(1, docH - vh);
      anchors = stops.map((s) => { const r = s.el.getBoundingClientRect(); return r.top + scrollY + Math.min(r.height, vh) * 0.5; });
      anchors[0] = vh * 0.5;
      anchors[anchors.length - 1] = Math.min(anchors[anchors.length - 1], docH - vh * 0.5 - 1);
      rail.querySelectorAll(".rail-tick").forEach((t) => t.remove());
      ticks = stops.map((s, i) => {
        const t = document.createElement("div");
        t.className = "rail-tick";
        t.style.top = `${(100 * (anchors[i] - vh * 0.5)) / span}%`;
        rail.appendChild(t);
        return t;
      });
      update();
    }
    const smooth = (t) => t * t * (3 - 2 * t);
    function update() {
      const y = scrollY + innerHeight * 0.5;
      let i = 0;
      while (i < anchors.length - 2 && y >= anchors[i + 1]) i++;
      const a = stops[i], b = stops[i + 1];
      const raw = Math.min(1, Math.max(0, (y - anchors[i]) / (anchors[i + 1] - anchors[i])));
      const t = smooth(raw);
      S.bg = mix(a.bg, b.bg, t); S.fg = mix(a.fg, b.fg, t); S.acc = mix(a.acc, b.acc, t);
      root.setProperty("--bg", css(S.bg));
      root.setProperty("--fg", css(S.fg));
      root.setProperty("--accent", css(S.acc));
      root.setProperty("--muted", css(mix(S.fg, S.bg, 0.4)));
      root.setProperty("--line", css(mix(S.fg, S.bg, 0.82)));
      const p = Math.min(1, Math.max(0, scrollY / span));
      S.off = p; S.hero = Math.max(0, 1 - scrollY / innerHeight);
      S.dark = Math.min(1, Math.max(0, (0.4 - lum(S.bg)) / 0.25));
      const m = Math.round(a.min + (b.min - a.min) * raw);
      const near = raw < 0.5 ? i : i + 1;
      clock.innerHTML = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}<i>${stops[near].name}</i>`;
      dot.style.transform = `translateY(${p * rail.clientHeight}px)`;
      ticks.forEach((tk, k) => tk.classList.toggle("here", k === near));
      listeners.forEach((fn) => fn());
    }
    let queued = false;
    addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; update(); }); } }, { passive: true });
    addEventListener("resize", measure);
    addEventListener("load", measure);
    new ResizeObserver(measure).observe(document.body);
    measure();
  })();

  // ---------------------------------------------------------------- terrain: a loss landscape behind the whole page
  (function terrain() {
    const canvas = $("terrain"), ctx = canvas.getContext("2d");
    const readout = $("heroReadout"), heroEl = document.querySelector(".hero");
    const P = 0.9; // how many screen heights the terrain drifts over the full scroll
    // valleys and ridges in field units (x across the screen, y in screen heights)
    const r0 = rng(5);
    const bumps = [
      [0.72, 0.38, 0.13, -1.25], [0.86, 0.72, 0.10, -0.85], [0.52, 0.62, 0.09, -0.6],
      [0.62, 0.18, 0.08, 0.7], [0.82, 0.52, 0.07, 0.9], [0.4, 0.3, 0.12, 0.5],
      [0.95, 0.25, 0.09, 0.55], [0.3, 0.75, 0.15, 0.35], [0.66, 0.86, 0.08, 0.45],
    ];
    for (let k = 0; k < 16; k++) bumps.push([r0(), 1 + r0() * P, 0.06 + r0() * 0.1, (r0() - 0.45) * 1.6]);
    const f = (x, y) => {
      let v = 0.35 * (x - 0.7) ** 2 + 0.11 * (1 - Math.cos((2 * Math.PI * (y - 0.5)) / 1.3));
      for (const [cx, cy, s, a] of bumps) v += a * Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s));
      return v;
    };
    const grad = (x, y) => { const h = 1e-4; return [(f(x + h, y) - f(x - h, y)) / (2 * h), (f(x, y + h) - f(x, y - h)) / (2 * h)]; };
    let W = 0, H = 0, dpr = 1, layer = null, balls = [], fmin = 0, stars = [];

    function build() {
      // marching squares once into an offscreen layer; each frame only blits and tints it
      const nx = 160, ny = Math.min(520, Math.round((nx * H * (1 + P)) / W));
      const vals = new Float32Array((nx + 1) * (ny + 1));
      let lo = Infinity, hi = -Infinity;
      for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
        const v = f(i / nx, (j / ny) * (1 + P));
        vals[j * (nx + 1) + i] = v; lo = Math.min(lo, v); hi = Math.max(hi, v);
      }
      fmin = lo;
      layer = document.createElement("canvas");
      layer.width = W; layer.height = Math.round(H * (1 + P));
      const lc = layer.getContext("2d"), sx = W / nx, sy = layer.height / ny, levels = 30;
      for (let l = 1; l < levels; l++) {
        const t = lo + ((hi - lo) * l) / levels, major = l % 5 === 0;
        lc.beginPath();
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
          const a = vals[j * (nx + 1) + i], b = vals[j * (nx + 1) + i + 1], c = vals[(j + 1) * (nx + 1) + i + 1], d = vals[(j + 1) * (nx + 1) + i];
          const pts = [];
          const edge = (v1, v2, x1, y1, x2, y2) => { if ((v1 < t) !== (v2 < t)) { const k = (t - v1) / (v2 - v1); pts.push([(x1 + (x2 - x1) * k) * sx, (y1 + (y2 - y1) * k) * sy]); } };
          edge(a, b, i, j, i + 1, j); edge(b, c, i + 1, j, i + 1, j + 1); edge(c, d, i + 1, j + 1, i, j + 1); edge(d, a, i, j + 1, i, j);
          for (let q = 0; q + 1 < pts.length; q += 2) { lc.moveTo(pts[q][0], pts[q][1]); lc.lineTo(pts[q + 1][0], pts[q + 1][1]); }
        }
        lc.strokeStyle = major ? "rgba(0,0,0,0.30)" : "rgba(0,0,0,0.12)";
        lc.lineWidth = (major ? 1.2 : 0.8) * dpr;
        lc.stroke();
      }
      const rs = rng(77);
      stars = Array.from({ length: 140 }, () => [rs(), rs(), rs() * 1.3 + 0.3, rs()]);
    }
    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 1.5);
      W = Math.round(innerWidth * dpr); H = Math.round(innerHeight * dpr);
      canvas.width = W; canvas.height = H;
      build(); draw();
    }
    const toPx = (x, y) => [x * W, (y - S.off * P) * H];
    function draw() {
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(layer, 0, -S.off * P * H);
      // tint the contour layer with the current ink
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = css(S.fg);
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
      if (S.hero > 0) {
        // keep the name readable on the first screen
        const g = ctx.createRadialGradient(0, H, 0, 0, H, Math.max(W, H) * 0.62);
        g.addColorStop(0, css(S.bg, 0.95 * S.hero)); g.addColorStop(0.55, css(S.bg, 0.75 * S.hero)); g.addColorStop(1, css(S.bg, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      }
      if (S.dark > 0) {
        for (const [x, y, s, tw] of stars) {
          ctx.globalAlpha = S.dark * (0.35 + 0.65 * tw);
          ctx.fillStyle = css(S.fg);
          ctx.fillRect(x * W, y * H * 0.75, s * dpr, s * dpr);
        }
        ctx.globalAlpha = 1;
      }
      ctx.globalAlpha = Math.min(1, S.hero * 1.6);
      for (const b of balls) {
        if (!ctx.globalAlpha) break;
        ctx.beginPath();
        b.path.forEach(([x, y], k) => { const [X, Y] = toPx(x, y); k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); });
        ctx.strokeStyle = css(S.acc); ctx.lineWidth = 2 * dpr; ctx.lineJoin = "round"; ctx.stroke();
        const [X, Y] = toPx(b.x, b.y);
        ctx.beginPath(); ctx.arc(X, Y, 6 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = b.done ? css(S.acc) : css(S.fg); ctx.fill();
        if (b.done) { ctx.lineWidth = 2 * dpr; ctx.strokeStyle = css(S.fg); ctx.stroke(); }
      }
      ctx.globalAlpha = 1;
    }
    // gradient descent with momentum
    function step(b) {
      const [gx, gy] = grad(b.x, b.y);
      b.vx = 0.86 * b.vx - 0.0022 * gx; b.vy = 0.86 * b.vy - 0.0022 * gy;
      b.x = Math.min(0.999, Math.max(0.001, b.x + b.vx)); b.y = Math.min(1 + P, Math.max(0.001, b.y + b.vy));
      b.n++;
      if (b.n % 2 === 0) b.path.push([b.x, b.y]);
      if ((Math.hypot(b.vx, b.vy) < 2e-5 && b.n > 30) || b.n > 1600) b.done = true;
    }
    let running = false;
    function loop() {
      let active = false;
      for (const b of balls) if (!b.done) {
        for (let k = 0; k < (reduceMotion ? 1600 : 6); k++) if (!b.done) step(b);
        active = active || !b.done;
        if (b.done && !b.reported) { b.reported = true; readout.textContent = `settled after ${b.n} steps at loss ${Math.max(0, f(b.x, b.y) - fmin).toFixed(3)}`; }
      }
      draw();
      if (active) requestAnimationFrame(loop); else running = false;
    }
    function drop(x, y) {
      balls.push({ x, y, vx: 0, vy: 0, n: 0, path: [[x, y]], done: false });
      if (balls.length > 6) balls.shift();
      if (!running) { running = true; requestAnimationFrame(loop); }
    }
    heroEl.addEventListener("click", (e) => {
      drop(e.clientX / innerWidth, e.clientY / innerHeight + S.off * P);
      $("heroHint").style.opacity = 0.4;
    });
    listeners.push(() => { if (!running && layer) draw(); });
    addEventListener("resize", () => { clearTimeout(resize.t); resize.t = setTimeout(resize, 120); });
    resize();
    setTimeout(() => drop(0.96, 0.08), reduceMotion ? 0 : 700);
  })();

  // ---------------------------------------------------------------- Kearney: knowledge graph
  (function kgraph() {
    const svg = $("kgraph");
    const nodes = [
      ["Entity", 210, 175, 1], ["Relation", 330, 95, 0], ["Documents", 95, 85, 0], ["Data", 80, 250, 0],
      ["Agent", 230, 305, 0], ["Answer", 355, 255, 0], ["Query", 215, 55, 0], ["Context", 360, 175, 0],
    ];
    const extra = [], r = rng(7);
    for (let i = 0; i < 16; i++) extra.push([null, 30 + r() * 360, 25 + r() * 310, 0]);
    const all = nodes.concat(extra);
    const edges = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [1, 6], [1, 7], [2, 6], [7, 5], [3, 7], [4, 5]];
    extra.forEach((_, i) => {
      const a = nodes.length + i;
      let best = 0, bd = Infinity;
      all.forEach((n, j) => { if (j === a) return; const d = (n[1] - all[a][1]) ** 2 + (n[2] - all[a][2]) ** 2; if (d < bd) { bd = d; best = j; } });
      edges.push([a, best]);
    });
    const path = [[2, 0], [0, 1], [1, 7], [7, 5]]; // documents -> entity -> relation -> context -> answer
    edges.forEach(([a, b]) => svgEl("line", { x1: all[a][1], y1: all[a][2], x2: all[b][1], y2: all[b][2], class: "mut-s", "stroke-width": 1.1, opacity: 0.55 }, svg));
    const hot = path.map(([a, b]) => svgEl("line", { x1: all[a][1], y1: all[a][2], x2: all[b][1], y2: all[b][2], class: "acc-s", "stroke-width": 3, "stroke-linecap": "round", "stroke-dasharray": 300, "stroke-dashoffset": 300 }, svg));
    all.forEach(([label, x, y, main]) => {
      svgEl("circle", { cx: x, cy: y, r: label ? (main ? 12 : 7) : 3.2, class: label ? (main ? "acc-f" : "ink-f") : "mut-f" }, svg);
      if (label) {
        const t = svgEl("text", { x, y: y - (main ? 20 : 14), "text-anchor": "middle", class: "ink-f bg-halo", "font-size": 13, "font-family": "Geist, sans-serif", "font-weight": 600, "stroke-width": 5, "paint-order": "stroke" }, svg);
        t.textContent = label;
      }
    });
    const play = () => hot.forEach((l, i) => { l.style.transition = reduceMotion ? "none" : `stroke-dashoffset 0.5s ease ${0.45 * i}s`; l.setAttribute("stroke-dashoffset", 0); });
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { play(); o.disconnect(); } }, { threshold: 0.4 }).observe(svg);
  })();

  // ---------------------------------------------------------------- Finaipro: forecast + mixture of experts
  (function finaipro() {
    const svg = $("forecast"), r = rng(42);
    const hist = [], n = 70, h = 26;
    let p = 120;
    for (let i = 0; i < n; i++) { p += (r() - 0.47) * 4; hist.push(p); }
    const fc = [], lo = [], hi = [];
    let q = p;
    for (let i = 1; i <= h; i++) { q += 0.35; fc.push(q); lo.push(q - 2.2 * Math.sqrt(i)); hi.push(q + 2.2 * Math.sqrt(i)); }
    const all = hist.concat(hi, lo), mn = Math.min(...all) - 4, mx = Math.max(...all) + 4;
    const X = (i) => 10 + (i / (n + h)) * 400, Y = (v) => 200 - ((v - mn) / (mx - mn)) * 180;
    for (let g = 0; g < 4; g++) svgEl("line", { x1: 10, x2: 410, y1: 20 + g * 60, y2: 20 + g * 60, class: "mut-s", opacity: 0.3, "stroke-width": 1 }, svg);
    const band = hi.map((v, i) => `${X(n + i)},${Y(v)}`).concat(lo.map((v, i) => `${X(n + i)},${Y(v)}`).reverse());
    svgEl("polygon", { points: `${X(n - 1)},${Y(p)} ${band.join(" ")}`, class: "acc-f", opacity: 0.16 }, svg);
    svgEl("polyline", { points: hist.map((v, i) => `${X(i)},${Y(v)}`).join(" "), fill: "none", class: "ink-s", "stroke-width": 1.8 }, svg);
    svgEl("polyline", { points: [`${X(n - 1)},${Y(p)}`].concat(fc.map((v, i) => `${X(n + i)},${Y(v)}`)).join(" "), fill: "none", class: "acc-s", "stroke-width": 2.2, "stroke-dasharray": "5 4" }, svg);
    svgEl("line", { x1: X(n - 1), x2: X(n - 1), y1: 12, y2: 205, class: "mut-s", "stroke-dasharray": "2 4" }, svg);
    const t1 = svgEl("text", { x: X(n - 1) + 6, y: 18, class: "mut-f", "font-size": 11, "font-family": "Geist Mono, monospace" }, svg);
    t1.textContent = "3-month forecast";

    const moe = $("moe");
    const box = (x, y, w, label, hot) => {
      svgEl("rect", { x, y, width: w, height: 30, rx: 3, class: `bg-f ${hot ? "acc-s" : "ink-s"}`, "stroke-width": hot ? 2 : 1.2 }, moe);
      const t = svgEl("text", { x: x + w / 2, y: y + 19, "text-anchor": "middle", class: "ink-f", "font-size": 11.5, "font-family": "Geist Mono, monospace" }, moe);
      t.textContent = label;
    };
    const weights = [0.62, 0.27, 0.11];
    weights.forEach((wt, i) => {
      const y = 8 + i * 42;
      svgEl("path", { d: `M210 65 C 240 65, 240 ${y + 15}, 268 ${y + 15}`, fill: "none", class: "acc-s", "stroke-width": 1 + wt * 7, opacity: 0.45 + wt * 0.55 }, moe);
      svgEl("path", { d: `M342 ${y + 15} C 365 ${y + 15}, 368 65, 388 65`, fill: "none", class: "mut-s", "stroke-width": 1.5 }, moe);
    });
    box(0, 50, 62, "series"); box(78, 50, 52, "CNN"); box(146, 50, 64, "router", true);
    weights.forEach((wt, i) => {
      const y = 8 + i * 42;
      box(268, y, 74, `expert ${i + 1}`);
      const t = svgEl("text", { x: 236, y: y + 10, class: "acc-f", "font-size": 10, "font-family": "Geist Mono, monospace" }, moe);
      t.textContent = wt.toFixed(2);
    });
    svgEl("circle", { cx: 398, cy: 65, r: 10, class: "acc-f" }, moe);
    const s = svgEl("text", { x: 398, y: 69, "text-anchor": "middle", class: "bg-f", "font-size": 12, "font-weight": 700 }, moe);
    s.textContent = "Σ";
  })();

  // ---------------------------------------------------------------- projects
  const P = [
    {
      cls: "ex-perceptron wide", art: "perceptron", kind: "Interactive explainer",
      title: "How to Train Your Perceptron",
      text: "Drag a neuron’s decision line, watch gradient descent find it, hit the XOR wall, then bend the plane with a hidden layer.",
      tags: "JavaScript, neural networks, backpropagation",
      demo: "https://liiiaamm.github.io/how-to-train-your-perceptron/", code: "https://github.com/liiiaamm/how-to-train-your-perceptron",
    },
    {
      cls: "ex-hospital", art: "hospital", kind: "Operations research",
      title: "Who gets the power?",
      text: "A MILP for generator investment and load shedding during a hospital blackout, built for Hospital San Rafael. 200 scenarios, played back on the floor plan.",
      tags: "Pyomo, HiGHS, goal programming",
      demo: "https://liiiaamm.github.io/hospital-energy-optimization/", code: "https://github.com/liiiaamm/hospital-energy-optimization",
    },
    {
      cls: "ex-news", art: "news", kind: "NLP, deep learning",
      title: "Mark it up",
      text: "A BiLSTM trained from scratch reads financial news in your browser: entities, attention, tone and an alert.",
      tags: "PyTorch, BiLSTM, in-browser inference",
      demo: "https://liiiaamm.github.io/ai-financial-news-alerts/", code: "https://github.com/liiiaamm/ai-financial-news-alerts",
    },
    {
      cls: "ex-graph wide", art: "graph", kind: "Graph algorithms",
      title: "Dijkstra across Madrid",
      text: "Dijkstra and A* race across 12,106 real intersections inside the M-30, with turn-by-turn directions.",
      tags: "OpenStreetMap, Dijkstra, A*",
      demo: "https://liiiaamm.github.io/GraphNav/", code: "https://github.com/liiiaamm/GraphNav",
    },
    {
      cls: "ex-robot", art: "robot", kind: "Robotics",
      title: "Autonomous navigation on ROS 2",
      text: "A TurtleBot3 that starts lost, localises itself with a particle filter, plans with a probabilistic roadmap and drives with pure pursuit. Watch all four ROS 2 nodes run in your browser.",
      tags: "ROS 2, particle filter, PRM",
      demo: "https://liiiaamm.github.io/autonomous-navigation-ros2/", code: "https://github.com/liiiaamm/autonomous-navigation-ros2",
    },
    {
      cls: "ex-brain", art: "brain", kind: "Agents, knowledge systems",
      title: "Second brain",
      text: "A multi-agent system that turns lectures into Obsidian notes. An editor writes, a gate checks the maths and links, and an auditor who didn't write the note checks it against the source. The demo replays one batch.",
      tags: "Agents, harness design, Obsidian",
      demo: "https://liiiaamm.github.io/second-brain/", code: "https://github.com/liiiaamm/second-brain",
    },
    {
      cls: "ex-rl", art: "rl", kind: "Reinforcement learning",
      title: "Jump to the goal",
      text: "Dynamic programming, SARSA and Q-learning on a grid world, and why SARSA plays it safe.",
      tags: "Gymnasium, NumPy",
      code: "https://github.com/liiiaamm/reinforcement-learning",
    },
    {
      cls: "ex-number", art: "number", kind: "Cryptography",
      title: "Number Theory Lab",
      text: "Modular arithmetic from scratch, an interpreter on top, and RSA built and then broken.",
      tags: "Python, Tonelli–Shanks, Pollard’s rho",
      code: "https://github.com/liiiaamm/number-theory-lab",
    },
    {
      cls: "ex-ada wide", art: "ada", kind: "Data engineering, streaming",
      title: "ADAQuant",
      text: "A Cardano data platform on AWS: a bronze, silver and gold lake in Glue, and a live lane from Binance through Kafka to Timestream with SNS alerts. The demo runs that lane on the live feed.",
      tags: "Kafka, AWS Glue, PySpark, Timestream",
      demo: "https://liiiaamm.github.io/adaquant/", code: "https://github.com/liiiaamm/adaquant",
    },
    {
      cls: "ex-dassit", art: "dassit", kind: "Full stack, LLM serving",
      title: "DassIt",
      text: "A self-hosted chatbot: Django REST with JWT and quotas, a Next.js client and Llama 3.2 in Ollama. The demo shows every request on the wire.",
      tags: "Django REST, Next.js, Ollama, Docker",
      demo: "https://liiiaamm.github.io/dassit/", code: "https://github.com/liiiaamm/dassit",
    },
  ];

  // Miniature of each demo's look, drawn inside a band between the title and the text.
  const ART = {
    perceptron(svg, b) {
      const { x0, x1, y0, y1 } = b, w = x1 - x0, h = y1 - y0;
      svgEl("line", { x1: x0 + w * 0.15, y1: y1 + 10, x2: x1, y2: y0 - 10, stroke: "#1d2422", "stroke-width": 3 }, svg);
      [[0.62, 0.15, 1], [0.86, 0.15, 0], [0.62, 0.85, 0], [0.86, 0.85, 0]].forEach(([x, y, c]) => svgEl("circle", { cx: x0 + w * x, cy: y0 + h * y, r: 12, fill: c ? "#2c5aa0" : "#e2b236", stroke: "#1d2422", "stroke-width": 2.5 }, svg));
    },
    hospital(svg, b) {
      const { x0, x1, y0, y1 } = b, w = (x1 - x0) / 4 - 6, h = (y1 - y0) / 2 - 4;
      [1, 0.85, 0.6, 0.3, 0.12, 0, 0.45, 0].forEach((v, k) => {
        const x = x0 + (k % 4) * (w + 8), y = y0 + Math.floor(k / 4) * (h + 8);
        svgEl("rect", { x, y, width: w, height: h, fill: "#1c252d", stroke: v ? "#6f7d88" : "#8a3a33", "stroke-width": 2 }, svg);
        if (v) svgEl("rect", { x, y, width: w, height: h, fill: "#ffd48a", opacity: 0.12 + 0.8 * v }, svg);
      });
    },
    news(svg, b) {
      const { x0, x1, y0, y1 } = b, w = x1 - x0, h = y1 - y0;
      const g = svgEl("g", { transform: `rotate(-2 ${x0 + w / 2} ${y0 + h / 2})` }, svg);
      svgEl("rect", { x: x0, y: y0, width: w, height: h, fill: "#fbfbf7", stroke: "rgba(0,0,0,0.18)" }, g);
      const rows = [["#ffe34f", 0.28, "#c9cbc5", 0.4], ["#c9cbc5", 0.3, "#ff8fc3", 0.22], ["#c9cbc5", 0.18, "#7ef0a6", 0.3], ["#8cc9ff", 0.14, "#c9cbc5", 0.5]];
      rows.forEach(([c1, w1, c2, w2], r) => {
        const y = y0 + 12 + r * ((h - 24) / 4);
        svgEl("rect", { x: x0 + 12, y, width: w * w1, height: 9, fill: c1, rx: 2 }, g);
        svgEl("rect", { x: x0 + 20 + w * w1, y, width: w * w2, height: 9, fill: c2, rx: 2 }, g);
      });
    },
    graph(svg, b) {
      const { x0, x1, y0, y1 } = b, w = x1 - x0, h = y1 - y0, r = rng(3);
      for (let i = 0; i < 22; i++) {
        const x = x0 + r() * w, y = y0 + r() * h;
        svgEl("line", { x1: x, y1: y0, x2: x + (r() - 0.5) * 30, y2: y1, stroke: "#0078bf", "stroke-width": r() > 0.8 ? 2.5 : 1, opacity: 0.7 }, svg);
        svgEl("line", { x1: x0, y1: y, x2: x1, y2: y + (r() - 0.5) * 20, stroke: "#0078bf", "stroke-width": r() > 0.8 ? 2.5 : 1, opacity: 0.7 }, svg);
      }
      const P = [[0.04, 0.85], [0.22, 0.6], [0.45, 0.55], [0.6, 0.25], [0.96, 0.12]].map(([x, y]) => [x0 + w * x, y0 + h * y]);
      svgEl("path", { d: "M" + P.map((p) => p.join(" ")).join(" L"), fill: "none", stroke: "#ff48b0", "stroke-width": 6, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
      svgEl("circle", { cx: P[0][0], cy: P[0][1], r: 9, fill: "#0078bf", stroke: "#142a3b", "stroke-width": 2 }, svg);
      svgEl("circle", { cx: P[4][0], cy: P[4][1], r: 9, fill: "#ff48b0", stroke: "#142a3b", "stroke-width": 2 }, svg);
    },
    robot(svg, b) {
      const { x0, x1, y0, y1 } = b, w = x1 - x0, h = y1 - y0, r = rng(11);
      svgEl("path", { d: `M${x0} ${y1 - 6} C ${x0 + w * 0.3} ${y0}, ${x0 + w * 0.6} ${y1}, ${x1} ${y0 + 6}`, fill: "none", class: "ink-s", "stroke-width": 2, "stroke-dasharray": "4 5" }, svg);
      const cx = x0 + w * 0.38, cy = y0 + h * 0.48;
      for (let i = 0; i < 160; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * Math.min(w, h) * 0.32;
        svgEl("circle", { cx: cx + Math.cos(a) * d, cy: cy + Math.sin(a) * d * 0.7, r: 1.6, fill: "#1386b5", opacity: 0.7 }, svg);
      }
      svgEl("circle", { cx, cy, r: 9, fill: "none", stroke: "#e07a00", "stroke-width": 2.5 }, svg);
    },
    brain(svg, b) {
      const { x0, x1, y0, y1 } = b, r = rng(19), pts = [];
      for (let i = 0; i < 24; i++) pts.push([x0 + r() * (x1 - x0), y0 + r() * (y1 - y0)]);
      pts.forEach((p, i) => [3, 7].forEach((o) => { const q = pts[(i * o + 1) % pts.length]; svgEl("line", { x1: p[0], y1: p[1], x2: q[0], y2: q[1], stroke: "#8a7dff", "stroke-width": 1, opacity: 0.45 }, svg); }));
      pts.forEach((p, i) => svgEl("circle", { cx: p[0], cy: p[1], r: i % 5 === 0 ? 6 : 3, fill: i % 5 === 0 ? "#c9c0ff" : "#8a7dff" }, svg));
    },
    rl(svg, b) {
      const { x0, x1, y0, y1 } = b, arrows = "↗↘↗↗↘↗↘↗↘↗↗↘↗↘↗↘↗↗";
      const cols = 6, rows = 3, s = Math.min((x1 - x0) / cols, (y1 - y0) / rows);
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        const x = x0 + i * s, y = y0 + j * s, goal = i === cols - 1 && j === 1, wall = (i === 2 && j === 2) || (i === 4 && j === 0);
        svgEl("rect", { x, y, width: s - 3, height: s - 3, fill: goal ? "#7bc96f" : wall ? "#1b1b1b" : "#eef3e8", stroke: "#1b1b1b", "stroke-width": 1 }, svg);
        if (!goal && !wall) { const t = svgEl("text", { x: x + s / 2 - 1.5, y: y + s * 0.66, "text-anchor": "middle", "font-size": s * 0.45, fill: "#1b1b1b" }, svg); t.textContent = arrows[j * cols + i]; }
      }
    },
    number(svg, b) {
      const { x0, x1, y0, y1 } = b, R = Math.min(x1 - x0, y1 - y0) / 2 - 14, cx = x0 + (x1 - x0) / 2, cy = y0 + (y1 - y0) / 2, n = 12;
      svgEl("circle", { cx, cy, r: R, fill: "none", stroke: "#2b2116", "stroke-width": 1.5 }, svg);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 - Math.PI / 2, bb = (((k * 5) % n) / n) * Math.PI * 2 - Math.PI / 2;
        svgEl("line", { x1: cx + Math.cos(a) * R, y1: cy + Math.sin(a) * R, x2: cx + Math.cos(bb) * R, y2: cy + Math.sin(bb) * R, stroke: "#c2410c", "stroke-width": 1, opacity: 0.6 }, svg);
        const t = svgEl("text", { x: cx + Math.cos(a) * (R + 11), y: cy + Math.sin(a) * (R + 11) + 4, "text-anchor": "middle", "font-size": 10.5, "font-family": "Geist Mono, monospace", fill: "#2b2116" }, svg);
        t.textContent = k;
      }
    },
  };

  ART.ada = (svg, b) => {
    const { x0, x1, y0, y1 } = b, w = x1 - x0, h = y1 - y0, r = rng(29), n = 46;
    let p = 0.55; const pts = [];
    for (let i = 0; i < n; i++) { p += (r() - 0.48) * 0.08; pts.push(p); }
    const lo = Math.min(...pts) - 0.05, hi = Math.max(...pts) + 0.05, X = (i) => x0 + (i / (n - 1)) * w, Y = (v) => y1 - ((v - lo) / (hi - lo)) * h;
    pts.forEach((v, i) => { if (!i) return; const up = v >= pts[i - 1], top = Y(Math.max(v, pts[i - 1])), bot = Y(Math.min(v, pts[i - 1]));
      svgEl("rect", { x: X(i) - w / n * 0.32, y: top, width: w / n * 0.64, height: Math.max(1.5, bot - top), fill: up ? "#5f9598" : "#1d546d" }, svg); });
    const vw = pts.map((v, i) => { const a = pts.slice(Math.max(0, i - 4), i + 1); return a.reduce((s, x) => s + x, 0) / a.length; });
    svgEl("polyline", { points: vw.map((v, i) => `${X(i)},${Y(v)}`).join(" "), fill: "none", stroke: "#e0a400", "stroke-width": 2 }, svg);
    [10, 27, 39].forEach((i) => svgEl("circle", { cx: X(i), cy: Y(pts[i]) - 10, r: 3.5, fill: "#e0a400" }, svg));
  };
  ART.dassit = (svg, b) => {
    const { x0, x1, y0, y1 } = b, w = x1 - x0, h = y1 - y0, rowH = Math.min(26, h / 5);
    [["u", 0.55], ["a", 0.75], ["u", 0.4], ["a", 0.62]].forEach(([who, f], i) => {
      const y = y0 + i * (rowH + 6), bw = w * f * 0.62, x = who === "u" ? x0 + w * 0.62 - bw : x0;
      if (y + rowH > y1) return;
      svgEl("rect", { x, y, width: bw, height: rowH, rx: 8, fill: who === "u" ? "#3fcdf7" : "#ffffff", stroke: who === "a" ? "#b9b3d6" : "none", opacity: who === "u" ? 0.85 : 1 }, svg);
    });
    const wx = x0 + w * 0.68;
    ["200 POST", "401 GET", "200 POST", "200 GET", "403 GET"].forEach((t, i) => {
      const y = y0 + 8 + i * (h / 5.2); if (y > y1) return;
      const t2 = svgEl("text", { x: wx, y, "font-size": 10.5, "font-family": "Geist Mono, monospace", fill: t.startsWith("2") ? "#1f9d6b" : "#d6334f" }, svg); t2.textContent = t;
    });
  };

  (function projects() {
    const box = $("exhibits");
    P.forEach((p) => {
      const href = p.demo || p.code;
      const el = document.createElement(href ? "a" : "div");
      el.className = `exhibit ${p.cls}`;
      if (href) el.href = href;
      const links = p.soon ? `<span class="ex-soon">${p.soon}</span>` : `${p.demo ? "<span>Try it</span>" : ""}<span>Code</span>`;
      el.innerHTML = `<div class="ex-top"><p class="ex-kind">${p.kind}</p><h3>${p.title}</h3></div>
        <div class="ex-bottom"><p>${p.text}</p>${p.tags ? `<p class="ex-tags">${p.tags}</p>` : ""}<p class="ex-links">${links}</p></div>`;
      if (p.art) {
        const svg = svgEl("svg", { class: "mini", "aria-hidden": "true" });
        el.prepend(svg);
        el._art = p.art;
        el._svg = svg;
      }
      box.appendChild(el);
      // second links (code) on cards with a demo: make them real links without nesting anchors
      if (p.demo && p.code) {
        const codeSpan = el.querySelectorAll(".ex-links span")[1];
        codeSpan.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); location.href = p.code; });
      }
    });
    // draw art once cards have their size, and again if they change size
    const drawArt = () => box.querySelectorAll(".exhibit").forEach((el) => {
      if (!el._art) return;
      el._svg.innerHTML = "";
      // the art sits between the bottom of the title and the top of the text
      const top = el.querySelector(".ex-top"), bottom = el.querySelector(".ex-bottom");
      const band = { x0: 24, x1: el.clientWidth - 24, y0: top.offsetTop + top.offsetHeight + 18, y1: bottom.offsetTop - 18 };
      if (band.y1 - band.y0 > 40) ART[el._art](el._svg, band);
    });
    requestAnimationFrame(drawArt);
    let t;
    new ResizeObserver(() => { clearTimeout(t); t = setTimeout(drawArt, 120); }).observe(box);
  })();

  // ---------------------------------------------------------------- quant club tape (facts only)
  (function tape() {
    const items = [["QFC", "Founded 2026", "up"], ["WAITLIST", "50+ before launch", "up"], ["FIRST", "Undergraduate quant club in Spain", "up"], ["ICAI", "Comillas, Madrid", "up"], ["CURRICULUM", "Built from zero", "up"]];
    const html = items.map(([k, v, c]) => `<span><b>${k}</b> <span class="${c}">▲</span> ${v}</span>`).join("");
    $("tape").innerHTML = html + html;
  })();

  // ---------------------------------------------------------------- outside: the ridge, against whatever the sky is doing
  (function ridge() {
    const svg = $("ridge"), r = rng(23);
    const W = 1200, H = 360, n = 120;
    const ys = [];
    for (let i = 0; i <= n; i++) {
      const x = i / n;
      let y = 0.55 - 0.32 * Math.exp(-((x - 0.62) ** 2) / 0.012) - 0.18 * Math.exp(-((x - 0.28) ** 2) / 0.008) - 0.1 * Math.exp(-((x - 0.86) ** 2) / 0.006);
      y += 0.12 * Math.exp(-((x - 0.45) ** 2) / 0.004) + 0.15 * Math.exp(-((x - 0.1) ** 2) / 0.006);
      y += (r() - 0.5) * 0.018;
      ys.push(y * H);
    }
    const X = (i) => (i / n) * W;
    const defs = svgEl("defs", {}, svg);
    // far range, then the main ridge as a silhouette in the current ink
    const far = ys.map((y, i) => `${X(i)},${y * 0.7 + 60 + Math.sin(i / 6) * 10}`).join(" ");
    svgEl("polygon", { points: `0,${H} ${far} ${W},${H}`, class: "ink-f", opacity: 0.22 }, svg);
    const ridgePts = ys.map((y, i) => `${X(i)},${y}`).join(" ");
    svgEl("polygon", { points: `0,${H} ${ridgePts} ${W},${H}`, class: "ink-f" }, svg);
    // alpenglow on the snow above the snow line
    const clip = svgEl("clipPath", { id: "ridgeClip" }, defs);
    svgEl("polygon", { points: `0,${H} ${ridgePts} ${W},${H}` }, clip);
    const snowLine = H * 0.36, edge = [];
    for (let x = 0; x <= W; x += 20) edge.push(`${x},${snowLine + Math.sin(x / 23) * 8 + (r() - 0.5) * 10}`);
    svgEl("polygon", { points: `0,0 ${W},0 ${edge.reverse().join(" ")}`, fill: "#ffd9c4", opacity: 0.9, "clip-path": "url(#ridgeClip)" }, svg);
    // a lake catching the light, a pitch in the valley
    svgEl("ellipse", { cx: X(n * 0.19), cy: H - 22, rx: 70, ry: 10, class: "acc-f", opacity: 0.55 }, svg);
    svgEl("rect", { x: X(n * 0.95) - 46, y: H - 40, width: 92, height: 30, fill: "none", class: "acc-s", opacity: 0.7, "stroke-width": 1.5 }, svg);
    svgEl("line", { x1: X(n * 0.95), x2: X(n * 0.95), y1: H - 40, y2: H - 10, class: "acc-s", opacity: 0.7, "stroke-width": 1.5 }, svg);
    // trail along the ridge
    const pts = ys.map((y, i) => [X(i), y]);
    svgEl("polyline", { points: pts.slice(Math.round(n * 0.3), Math.round(n * 0.75)).map(([x, y]) => `${x},${y + 10}`).join(" "), fill: "none", class: "acc-s", "stroke-width": 2, "stroke-dasharray": "3 6", "stroke-linecap": "round" }, svg);
    const marks = [[0.19, "Swimming", H - 40], [0.44, "Trail running", null], [0.62, "Skiing", null], [0.95, "Football", H - 52]];
    marks.forEach(([fx, label, fixedY]) => {
      const i = Math.round(fx * n), x = X(i), y = fixedY ?? ys[i] - 14, onRock = fixedY != null;
      svgEl("line", { x1: x, x2: x, y1: y, y2: y - 34, class: onRock ? "acc-s" : "ink-s", "stroke-width": 1.2 }, svg);
      svgEl("circle", { cx: x, cy: y, r: 4, class: onRock ? "acc-f" : "ink-f" }, svg);
      const t = svgEl("text", { x, y: y - 40, "text-anchor": "middle", "font-size": 15, "font-family": "Geist, sans-serif", "font-weight": 600, class: onRock ? "acc-f" : "ink-f" }, svg);
      t.textContent = label;
    });
    $("ridgeLegend").innerHTML = "<li>Mountains first</li><li>Trail running and skiing</li><li>Swimming</li><li>Competitive football</li>";
  })();
})();
