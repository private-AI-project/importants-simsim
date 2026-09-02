// 심심풀이 돌림판.
//
// 다른 게임들은 전원의 순위를 내지만 이건 한 명만 뽑는다. "누가 살래" 같은 상황용이다.
//
// 조작 방식: 먼저 당첨자를 정하고 그 칸에서 멈추도록 회전 각도를 역산한다.
// 회전 자체는 평범한 감속 곡선이라 보는 쪽에서는 구분할 방법이 없다.

(function () {
  "use strict";

  var canvas = document.getElementById("rl-canvas");
  if (!canvas) return;

  var P = "rl";
  var MAX = 12;
  var SIZE = 420;
  var CX = SIZE / 2, CY = SIZE / 2, RAD = 168;
  var SPIN_MS = 4200;

  var ctx = canvas.getContext("2d");

  var setup = null;
  var rot = 0;
  var spinning = false;
  var lastWinner = null;
  var ctxState = null;
  var winnerIdx = null;

  function $(id) { return document.getElementById(P + "-" + id); }

  function cssVar(n, f) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    return v || f;
  }

  function draw(entries) {
    var ink = cssVar("--ink", "#1c1c22");
    var card = cssVar("--card", "#fff");
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (!entries.length) return;

    var seg = (Math.PI * 2) / entries.length;

    entries.forEach(function (e, i) {
      var a0 = -Math.PI / 2 + i * seg + rot;
      ctx.beginPath();
      ctx.moveTo(CX, CY);
      ctx.arc(CX, CY, RAD, a0, a0 + seg);
      ctx.closePath();
      ctx.fillStyle = e.color;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = card;
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.save();
      ctx.translate(CX, CY);
      ctx.rotate(a0 + seg / 2);
      ctx.textAlign = "right";
      ctx.fillStyle = "#fff";
      ctx.font = "700 14px -apple-system, sans-serif";
      ctx.fillText(e.name, RAD - 14, 5);
      ctx.restore();
    });

    // 가운데 원
    ctx.beginPath();
    ctx.arc(CX, CY, 34, 0, Math.PI * 2);
    ctx.fillStyle = card;
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.stroke();

    // 위쪽 바늘
    ctx.beginPath();
    ctx.moveTo(CX, CY - RAD - 16);
    ctx.lineTo(CX - 12, CY - RAD + 10);
    ctx.lineTo(CX + 12, CY - RAD + 10);
    ctx.closePath();
    ctx.fillStyle = ink;
    ctx.fill();
  }

  // 바늘은 화면 12시 방향에 고정이다. k번 칸이 바늘에 오려면
  // 회전량이 -(k + 0.5) * seg 여야 한다. 거기에 몇 바퀴를 더해 돌린다.
  function angleFor(k, n, turns) {
    var seg = (Math.PI * 2) / n;
    return turns * Math.PI * 2 - (k + 0.5) * seg;
  }

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function spin(cx) {
    var entries = cx.entries;
    var n = entries.length;

    if (cx.rig) {
      winnerIdx = entries.findIndex(function (e) { return e.name === cx.rig.name; });
      if (winnerIdx < 0) winnerIdx = null;
    } else {
      winnerIdx = null;
    }

    if (winnerIdx === null) {
      // 연속 당첨 방지. 사람이 셋 이상일 때만 적용한다.
      var pool = [];
      entries.forEach(function (e, i) {
        if (n > 2 && lastWinner && e.name === lastWinner) return;
        pool.push(i);
      });
      if (!pool.length) pool = entries.map(function (_, i) { return i; });
      winnerIdx = pool[Math.floor(Math.random() * pool.length)];
    }

    var from = rot;
    var to = angleFor(winnerIdx, n, 5 + Math.floor(Math.random() * 3));
    // from 보다 항상 앞으로 돌게 맞춘다
    while (to <= from + Math.PI * 8) to += Math.PI * 2;

    var t0 = null;
    spinning = true;
    $("result").hidden = true;

    function tick(now) {
      if (t0 === null) t0 = now;
      var t = Math.min(1, (now - t0) / SPIN_MS);
      rot = from + (to - from) * easeOut(t);
      draw(entries);
      if (t < 1) { requestAnimationFrame(tick); return; }
      spinning = false;
      finish(entries);
    }
    requestAnimationFrame(tick);
  }

  function finish(entries) {
    var w = entries[winnerIdx];
    lastWinner = w.name;
    var stake = ctxState.stake;
    $("verdict").innerHTML = (stake ? Party.escapeHtml(stake) + " → " : "") +
      '<span class="dot" style="background:' + w.color + '"></span> ' +
      "<strong>" + Party.escapeHtml(w.name) + "</strong> 당첨";
    $("result").hidden = false;
  }

  setup = Party.makeSetup({
    prefix: P,
    maxPlayers: MAX,
    stats: null,
    startLabel: function (n) { return "돌리기 (" + n + "명)"; },
    onStart: function (cx) {
      ctxState = cx;
      $("setup").hidden = true;
      $("stage").hidden = false;
      fit();   // 숨김이 풀린 뒤라야 실제 크기를 잴 수 있다
      canvas.scrollIntoView({ behavior: "smooth", block: "center" });
      draw(cx.entries);
      spin(cx);
    }
  });

  $("again").addEventListener("click", function () {
    if (spinning) return;
    ctxState = {
      entries: setup.entries(), rig: setup.rig(),
      stake: setup.stake(), rule: setup.rule()
    };
    spin(ctxState);
  });
  $("reset").addEventListener("click", function () {
    if (spinning) return;
    $("setup").hidden = false;
    $("stage").hidden = true;
    $("result").hidden = true;
  });

  Party.wireCopy(P, function () {
    if (winnerIdx === null || !ctxState) return [];
    var w = ctxState.entries[winnerIdx];
    return [(ctxState.stake ? ctxState.stake + " → " : "") + w.name + " 당첨"];
  });

  function fit() {
    var ratio = window.devicePixelRatio || 1;
    var box = canvas.getBoundingClientRect();
    var cssW = box.width || SIZE;
    canvas.width = Math.round(cssW * ratio);
    canvas.height = Math.round(cssW * ratio);
    var scale = (cssW / SIZE) * ratio;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  var fitTimer = null;
  window.addEventListener("resize", function () {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(function () {
      fit();
      if (ctxState) draw(ctxState.entries);
    }, 150);
  });

  // 테스트용 노출. 바늘이 정말 의도한 칸에 서는지 각도로 검증한다.
  window.__roulette = {
    angleFor: angleFor,
    // 회전량 r 일 때 바늘이 가리키는 칸
    pointedBy: function (r, n) {
      var seg = (Math.PI * 2) / n;
      var x = -r % (Math.PI * 2);
      if (x < 0) x += Math.PI * 2;
      return Math.floor(x / seg) % n;
    }
  };

  fit();
})();
