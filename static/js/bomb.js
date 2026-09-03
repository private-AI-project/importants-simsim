// 폭탄 돌리기.
//
// 폭탄이 순서대로 돌아가고, 도화선이 다 타는 순간 들고 있던 사람이 걸린다.
// 서바이벌은 모두가 동시에 붙는 난투인데 이쪽은 턴 기반 릴레이다. 한 번에
// 한 사람만 위험하니 긴장이 한 곳에 모인다.
//
// 다른 게임과 같은 원칙을 따른다. 결과는 시작 직후에 전부 계산해두고,
// 화면은 그 대본을 재생만 한다. 재생 중에 주사위를 굴리면 되감기나
// 결과 바로 보기 같은 것을 붙일 수 없다.

(function () {
  "use strict";

  var P = "bm";
  var MAX_PLAYERS = 10;   // 원형 배치라 이름이 겹치지 않는 선에서 잡았다
  var FUSE = 100;
  var TICK_MS = 800;
  var PASS_MS = 420;      // 폭탄이 날아가는 시간. TICK 보다 짧아야 다음 턴과 겹치지 않는다

  var STATS = [
    { key: "dodge", name: "회피", desc: "손도 안 대고 곧바로 넘깁니다" },
    { key: "throw", name: "전가", desc: "순서를 무시하고 아무에게나 던집니다" },
    { key: "calm",  name: "침착", desc: "잡고 있어도 도화선이 덜 탑니다" },
    { key: "luck",  name: "운",   desc: "다 탄 순간에 한 번은 불발됩니다" }
  ];

  var HOT = [
    "{a}에게 넘어갔다",
    "{a} 손으로 갔다",
    "{a} 차례다"
  ];
  var DODGED = [
    "{a}이(가) 받는 척만 하고 넘겼다",
    "{a}이(가) 손도 안 대고 밀어냈다"
  ];
  var THROWN = [
    "{a}이(가) 순서를 건너뛰고 {b}에게 던졌다",
    "{a}이(가) 엉뚱하게 {b}에게 떠넘겼다"
  ];

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function fill(t, a, b) { return t.replace("{a}", a).replace("{b}", b || ""); }

  // ── 시뮬레이션 ────────────────────────────────────────────
  //
  // rig.mode "lose" 는 그 사람에서 터지게, "win" 은 그 사람은 안 터지게 한다.
  // 즉시 터뜨리지 않고 확률만 기울인다. 한 바퀴도 안 돌고 터지면 로그만 봐도 티가 난다.

  function simulate(players, rig) {
    var n = players.length;
    var state = players.map(function (p, i) {
      return { name: p.name, color: p.color, stats: p.stats, idx: i, holds: 0, lastHold: -1 };
    });

    function rigged(p) { return rig && p.name === rig.name; }

    var fuse = FUSE;
    var at = Math.floor(Math.random() * n);
    var log = [{ type: "hot", text: fill(pick(HOT), state[at].name), name: state[at].name, fuse: fuse }];
    var turn = 0;
    var victim = null;
    var guard = 0;

    while (victim === null && guard < 400) {
      guard += 1;
      turn += 1;

      var cur = state[at];
      cur.holds += 1;
      cur.lastHold = turn;

      // 회피하면 도화선을 거의 태우지 않고 그대로 넘긴다.
      var dodgeP = cur.stats.dodge * 0.045;
      if (rigged(cur)) dodgeP = rig.mode === "win" ? dodgeP + 0.35 : dodgeP * 0.3;
      var dodged = Math.random() < dodgeP;

      var burn;
      if (dodged) {
        burn = 1 + Math.round(Math.random() * 2);
      } else {
        burn = 9 + Math.round(Math.random() * 12) - Math.round(cur.stats.calm * 0.9);
        if (rigged(cur)) burn = rig.mode === "lose" ? Math.round(burn * 1.7) : Math.round(burn * 0.4);
        if (burn < 2) burn = 2;
      }
      fuse -= burn;

      if (fuse <= 0) {
        // 불발. 운이 생존에 직접 기여하는 통로다.
        var saveP = cur.stats.luck * 0.03;
        if (rigged(cur)) saveP = rig.mode === "win" ? 0.75 : 0;
        if (Math.random() < saveP) {
          fuse = 10 + Math.round(Math.random() * 8);
          log.push({ type: "save", text: cur.name + " 앞에서 불발됐다", name: cur.name, fuse: fuse });
        } else {
          log.push({ type: "boom", text: cur.name + " 앞에서 터졌다", name: cur.name, fuse: 0 });
          victim = cur;
          break;
        }
      }

      // 다음 사람 고르기. 전가가 터지면 순서를 무시한다.
      var next = (at + 1) % n;
      var throwP = cur.stats["throw"] * 0.04;
      if (rigged(cur) && rig.mode === "win") throwP += 0.2;
      // 도화선이 얼마 안 남은 순간에 폭탄이 조작 대상 쪽으로 흐르게 한다.
      // 태우는 양만 늘려서는 그 사람이 마지막에 들고 있을 보장이 없어서,
      // 방장이 정해도 열 번에 네 번밖에 맞지 않았다.
      if (rig && rig.mode === "lose" && fuse <= 30 && !rigged(cur)) throwP += 0.55;
      var threw = n > 2 && Math.random() < throwP;

      if (threw) {
        var pool = [];
        for (var i = 0; i < n; i += 1) if (i !== at) pool.push(i);
        // 조작 대상을 터뜨리려면 폭탄이 그쪽으로 자주 가야 한다.
        if (rig && rig.mode === "lose") {
          var weight = fuse <= 30 ? 12 : 3;
          for (var j = 0; j < n; j += 1) {
            if (j !== at && state[j].name === rig.name) {
              for (var w = 0; w < weight; w += 1) pool.push(j);
            }
          }
        }
        next = pool[Math.floor(Math.random() * pool.length)];
      }

      at = next;
      var text = dodged
        ? fill(pick(DODGED), cur.name)
        : (threw ? fill(pick(THROWN), cur.name, state[next].name)
                 : fill(pick(HOT), state[next].name));
      log.push({
        type: dodged ? "dodge" : (threw ? "throw" : "hot"),
        text: text, name: state[next].name, from: cur.name, fuse: Math.max(0, fuse)
      });
    }

    if (victim === null) victim = state[at];

    // 순위는 폭탄을 잡은 횟수가 적은 순. 동수면 마지막으로 잡은 시점이 이른 쪽이 위다.
    // 터진 사람은 무조건 꼴찌로 내린다.
    var ranking = state.slice().sort(function (a, b) {
      if (a === victim) return 1;
      if (b === victim) return -1;
      if (a.holds !== b.holds) return a.holds - b.holds;
      return a.lastHold - b.lastHold;
    }).map(function (p) {
      return { name: p.name, color: p.color, note: p.holds + "번 잡음" };
    });

    return { log: log, victim: victim, ranking: ranking, turns: turn };
  }

  // ── 화면 ──────────────────────────────────────────────────

  var elSetup = document.getElementById(P + "-setup");
  var elStage = document.getElementById(P + "-stage");
  var elResult = document.getElementById(P + "-result");
  var elCircle = document.getElementById(P + "-circle");
  var elBomb = document.getElementById(P + "-bomb");
  var elFuse = document.getElementById(P + "-fuse");
  var elFuseNum = document.getElementById(P + "-fusenum");
  var elLog = document.getElementById(P + "-log");
  var elRosterHead = document.getElementById(P + "-roster-head");
  var elRosterCount = document.getElementById(P + "-roster-count");

  var seats = {};
  var players = [];
  var result = null;
  var timer = null;
  var stake = "";

  function seatAngle(i, n) { return (-90 + (360 / n) * i) * Math.PI / 180; }

  function buildRing(list) {
    players = list;
    seats = {};
    var n = list.length;
    elCircle.querySelectorAll(".seat").forEach(function (el) { el.remove(); });

    // 날아가는 시간을 JS 한 곳에서 정한다. CSS 에도 적어두면 둘이 어긋난다.
    elBomb.style.transitionDuration = PASS_MS + "ms";

    list.forEach(function (p, i) {
      var el = document.createElement("div");
      el.className = "seat";
      // 위치는 .seat 의 transform 이 잡고, 흔들림과 확대는 안쪽 .seat-in 이 맡는다.
      // 한 요소에 둘을 같이 걸면 애니메이션이 위치 transform 을 덮어써서 가운데로 튄다.
      el.innerHTML = '<div class="seat-in">' +
        '<span class="seat-dot" style="background:' + p.color + '"></span>' +
        '<span class="seat-name">' + Party.escapeHtml(p.name) + "</span></div>";
      elCircle.appendChild(el);
      seats[p.name] = el;
      place(el, i, n);
    });
    layoutBomb(list[0] ? list[0].name : null, true);
  }

  function radius() {
    // 좌석이 원 밖으로 삐져나가지 않게 반지름을 폭의 38% 로 둔다.
    return elCircle.clientWidth * 0.38;
  }

  function place(el, i, n) {
    var a = seatAngle(i, n);
    var r = radius();
    el.style.transform = "translate(-50%, -50%) translate(" +
      Math.round(Math.cos(a) * r) + "px, " + Math.round(Math.sin(a) * r) + "px)";
  }

  function layoutBomb(name, instant) {
    if (!name) return;
    var i = -1;
    players.forEach(function (p, k) { if (p.name === name) i = k; });
    if (i < 0) return;
    var a = seatAngle(i, players.length);
    var r = radius() * 0.62;   // 좌석과 가운데 사이에 띄워서 겹치지 않게
    if (instant) elBomb.style.transition = "none";
    elBomb.style.transform = "translate(-50%, -50%) translate(" +
      Math.round(Math.cos(a) * r) + "px, " + Math.round(Math.sin(a) * r) + "px)";
    if (instant) {
      void elBomb.offsetWidth;
      elBomb.style.transition = "";
    }
  }

  function relayout() {
    var n = players.length;
    players.forEach(function (p, i) {
      var el = seats[p.name];
      if (el) place(el, i, n);
    });
  }

  function setFuse(v) {
    var pct = Math.max(0, Math.min(100, v));
    elFuse.style.background =
      "conic-gradient(var(--accent) " + pct + "%, var(--line) 0)";
    elFuseNum.textContent = Math.round(pct);
    elFuse.classList.toggle("low", pct <= 25);
  }

  // ── 폭발 효과 ─────────────────────────────────────────────
  //
  // 2D 캔버스로 직접 그린다. 한 판에 0.6초 한 번 쓰는 효과라 라이브러리를
  // 받아올 이유가 없다. 흔히 three.js 폭발이라고 생각하는 것의 대부분은
  // 가산 혼합 파티클인데, 그건 globalCompositeOperation 한 줄로 된다.

  var elFx = document.getElementById(P + "-fx");
  var fxCtx = elFx ? elFx.getContext("2d") : null;
  var parts = [];
  var wave = null;
  var fxRaf = null;
  var fxLast = 0;
  var reduceMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  function fxResize() {
    if (!elFx) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = elCircle.clientWidth, h = elCircle.clientHeight;
    elFx.width = Math.round(w * dpr);
    elFx.height = Math.round(h * dpr);
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function seatPoint(name) {
    var i = -1;
    players.forEach(function (p, k) { if (p.name === name) i = k; });
    if (i < 0) return null;
    var a = seatAngle(i, players.length);
    var r = radius() * 0.62;
    return {
      x: elCircle.clientWidth / 2 + Math.cos(a) * r,
      y: elCircle.clientHeight / 2 + Math.sin(a) * r
    };
  }

  function spawn(x, y) {
    parts = [];
    // 불꽃. 밝고 빠르고 금방 죽는다. 가산 혼합으로 겹칠 때 하얗게 탄다.
    for (var i = 0; i < 46; i += 1) {
      var a = Math.random() * Math.PI * 2;
      var s = 90 + Math.random() * 260;
      parts.push({
        kind: "spark", x: x, y: y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0, max: 0.32 + Math.random() * 0.3,
        size: 1.6 + Math.random() * 2.2
      });
    }
    // 파편. 무겁게 떨어진다.
    for (var j = 0; j < 16; j += 1) {
      var a2 = Math.random() * Math.PI * 2;
      var s2 = 60 + Math.random() * 150;
      parts.push({
        kind: "debris", x: x, y: y,
        vx: Math.cos(a2) * s2, vy: Math.sin(a2) * s2 - 40,
        life: 0, max: 0.5 + Math.random() * 0.4,
        size: 2 + Math.random() * 3, rot: Math.random() * Math.PI
      });
    }
    // 연기. 느리게 퍼지며 커진다.
    for (var k = 0; k < 12; k += 1) {
      var a3 = Math.random() * Math.PI * 2;
      var s3 = 12 + Math.random() * 40;
      parts.push({
        kind: "smoke", x: x, y: y,
        vx: Math.cos(a3) * s3, vy: Math.sin(a3) * s3 - 18,
        life: 0, max: 0.6 + Math.random() * 0.4,
        size: 7 + Math.random() * 12
      });
    }
    wave = { x: x, y: y, life: 0, max: 0.42 };
  }

  function step(now) {
    var dt = fxLast ? Math.min((now - fxLast) / 1000, 0.05) : 0.016;
    fxLast = now;

    var w = elCircle.clientWidth, h = elCircle.clientHeight;
    fxCtx.clearRect(0, 0, w, h);

    if (wave) {
      wave.life += dt;
      var t = wave.life / wave.max;
      if (t >= 1) {
        wave = null;
      } else {
        var rr = 8 + t * radius() * 1.15;
        fxCtx.globalCompositeOperation = "source-over";
        fxCtx.strokeStyle = "rgba(255, 214, 107, " + (1 - t).toFixed(3) + ")";
        fxCtx.lineWidth = 3 * (1 - t) + 0.5;
        fxCtx.beginPath();
        fxCtx.arc(wave.x, wave.y, rr, 0, Math.PI * 2);
        fxCtx.stroke();
      }
    }

    var alive = 0;
    for (var i = 0; i < parts.length; i += 1) {
      var p = parts[i];
      p.life += dt;
      if (p.life >= p.max) continue;
      alive += 1;

      var k = p.life / p.max;
      if (p.kind === "smoke") {
        p.vx *= 0.94; p.vy *= 0.94;
      } else {
        p.vy += (p.kind === "debris" ? 560 : 260) * dt;
        p.vx *= 0.985; p.vy *= 0.985;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.kind === "spark") {
        // 노란색에서 붉은색으로 식는다.
        fxCtx.globalCompositeOperation = "lighter";
        var g = Math.round(214 - 130 * k);
        fxCtx.fillStyle = "rgba(255, " + g + ", 90, " + (1 - k).toFixed(3) + ")";
        fxCtx.beginPath();
        fxCtx.arc(p.x, p.y, p.size * (1 - k * 0.5), 0, Math.PI * 2);
        fxCtx.fill();
      } else if (p.kind === "debris") {
        fxCtx.globalCompositeOperation = "source-over";
        fxCtx.fillStyle = "rgba(70, 68, 78, " + (1 - k).toFixed(3) + ")";
        fxCtx.save();
        fxCtx.translate(p.x, p.y);
        fxCtx.rotate(p.rot + k * 6);
        fxCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        fxCtx.restore();
      } else {
        fxCtx.globalCompositeOperation = "source-over";
        fxCtx.fillStyle = "rgba(128, 126, 138, " + (0.34 * (1 - k)).toFixed(3) + ")";
        fxCtx.beginPath();
        fxCtx.arc(p.x, p.y, p.size * (1 + k * 1.6), 0, Math.PI * 2);
        fxCtx.fill();
      }
    }
    fxCtx.globalCompositeOperation = "source-over";

    if (alive > 0 || wave) {
      fxRaf = requestAnimationFrame(step);
    } else {
      fxRaf = null;
      fxLast = 0;
      fxCtx.clearRect(0, 0, w, h);
    }
  }

  function boomFx(name) {
    if (!fxCtx || reduceMotion) return;
    var pt = seatPoint(name);
    if (!pt) return;
    fxResize();
    spawn(pt.x, pt.y);
    elBomb.classList.add("gone");
    elCircle.classList.remove("shake");
    void elCircle.offsetWidth;
    elCircle.classList.add("shake");
    if (fxRaf) cancelAnimationFrame(fxRaf);
    fxLast = 0;
    fxRaf = requestAnimationFrame(step);
  }

  function fxClear() {
    if (fxRaf) { cancelAnimationFrame(fxRaf); fxRaf = null; }
    parts = []; wave = null; fxLast = 0;
    if (fxCtx) fxCtx.clearRect(0, 0, elCircle.clientWidth, elCircle.clientHeight);
    elCircle.classList.remove("shake");
    elBomb.classList.remove("gone");
  }

  var FX = ["hold", "dodge", "save", "boom"];

  function flash(name, kind) {
    var el = seats[name];
    if (!el) return;
    FX.forEach(function (c) { el.classList.remove(c); });
    void el.offsetWidth;
    el.classList.add(kind);
    if (kind === "hold") return;   // 잡고 있는 표시는 다음 이동 때 지운다
    el.addEventListener("animationend", function off() {
      el.classList.remove(kind);
      el.removeEventListener("animationend", off);
    });
  }

  function clearHold() {
    Object.keys(seats).forEach(function (k) { seats[k].classList.remove("hold"); });
  }

  function play() {
    elLog.innerHTML = "";
    fxClear();
    setFuse(FUSE);

    var i = 0;
    timer = setInterval(function () {
      if (i >= result.log.length) {
        stop();
        finish();
        return;
      }
      var ev = result.log[i];
      i += 1;

      clearHold();
      layoutBomb(ev.name);
      setFuse(ev.fuse);

      if (ev.type === "boom") { flash(ev.name, "boom"); boomFx(ev.name); }
      else if (ev.type === "save") flash(ev.name, "save");
      else if (ev.type === "dodge") flash(ev.from, "dodge");
      else flash(ev.name, "hold");

      var li = document.createElement("li");
      li.className = "log-" + ev.type;
      li.textContent = ev.text;
      elLog.insertBefore(li, elLog.firstChild);
      while (elLog.children.length > 40) elLog.removeChild(elLog.lastChild);
    }, TICK_MS);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function finish() {
    clearHold();
    if (result.victim) flash(result.victim.name, "boom");
    Party.renderResult(P, result.ranking, {
      rule: "last",
      stake: stake,
      labels: { last: "폭탄 터짐", first: "가장 안 잡힘" }
    });
  }

  // ── 배선 ──────────────────────────────────────────────────

  Party.makeSetup({
    prefix: P,
    maxPlayers: MAX_PLAYERS,
    minPlayers: 2,
    stats: STATS,
    statTotal: 20,
    statMin: 2,
    statMax: 8,
    showStats: false,
    startLabel: function (n) { return "시작 (" + n + "명)"; },
    onRender: function (entries) {
      if (elRosterHead) elRosterHead.hidden = entries.length === 0;
      if (elRosterCount) elRosterCount.textContent = "참가자 " + entries.length + "명";
    },
    onStart: function (ctx) {
      stake = ctx.stake;
      result = simulate(ctx.entries, ctx.rig);
      elSetup.hidden = true;
      elStage.hidden = false;
      elResult.hidden = true;
      buildRing(ctx.entries);
      play();
    }
  });

  document.getElementById(P + "-skip").addEventListener("click", function () {
    if (!result) return;
    stop();
    setFuse(0);
    layoutBomb(result.victim.name);
    boomFx(result.victim.name);
    finish();
  });

  document.getElementById(P + "-again").addEventListener("click", function () {
    stop();
    document.getElementById(P + "-start").click();
  });

  document.getElementById(P + "-reset").addEventListener("click", function () {
    stop();
    fxClear();
    elSetup.hidden = false;
    elStage.hidden = true;
    elResult.hidden = true;
  });

  Party.wireCopy(P, function () {
    var lines = result.ranking.map(function (p, i) { return (i + 1) + "위 " + p.name; });
    if (result.victim) {
      lines.unshift((stake ? stake + " → " : "") + result.victim.name + " 폭탄 터짐", "");
    }
    return lines;
  });

  window.addEventListener("resize", function () {
    if (!players.length || elStage.hidden) return;
    relayout();
    fxResize();
  });
})();
