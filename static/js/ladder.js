// 심심풀이 사다리타기.
//
// 능력치는 없다. 사다리는 실력이 끼어들 여지가 없는 게임이고, 억지로 넣으면 사다리가 아니다.
// 대신 방장 조작이 이 게임의 차별점이다.
//
// 만드는 순서가 거꾸로다. 보통은 사다리를 무작위로 뽑고 결과를 보는데, 그러면 균등하지 않다.
// 가로줄이 인접 칸끼리만 바꾸다 보니 왼쪽에서 출발한 사람은 왼쪽에 남는다.
// 실제로 재보니 8명 기준 80행을 깔아도 카이제곱이 16을 넘었다(임계 14.07).
//
// 그래서 도착 배치를 먼저 균등하게 뽑고, 그 배치가 나오는 사다리를 만든다.
// 위쪽은 무작위 가로줄이라 모양이 자연스럽고, 아래쪽에서 필요한 교환만 채워 넣는다.
// 조작도 같은 자리에서 처리된다. 배치를 정할 때 원하는 값을 박아두면 끝이다.

(function () {
  "use strict";

  var canvas = document.getElementById("ld-canvas");
  if (!canvas) return;

  var P = "ld";
  var MAX = 10;
  var RANDOM_ROWS = 10;   // 위쪽 무작위 구간. 모양을 자연스럽게 만드는 용도다.
  var W = 420, H = 520;
  var PAD_X = 30, PAD_TOP = 46, PAD_BOTTOM = 46;

  var ctx = canvas.getContext("2d");

  var setup = null;
  var state = null;
  var anim = 0;
  var animating = false;

  function $(id) { return document.getElementById(P + "-" + id); }

  // ── 사다리 ────────────────────────────────────────────────

  function randomRow(cols, prob) {
    var row = [];
    for (var c = 0; c < cols - 1; c += 1) {
      // 같은 줄에서 가로줄이 붙으면 경로가 애매해진다. 한 칸 띄운다.
      row.push(c > 0 && row[c - 1] ? false : Math.random() < prob);
    }
    return row;
  }

  function trace(rungs, cols, start) {
    var c = start;
    var pts = [{ r: 0, c: c }];
    for (var r = 0; r < rungs.length; r += 1) {
      if (c > 0 && rungs[r][c - 1]) { c -= 1; pts.push({ r: r + 0.5, c: c }); }
      else if (c < cols - 1 && rungs[r][c]) { c += 1; pts.push({ r: r + 0.5, c: c }); }
      pts.push({ r: r + 1, c: c });
    }
    return { end: c, pts: pts };
  }

  function permutationOf(rungs, cols) {
    var perm = [];
    for (var i = 0; i < cols; i += 1) perm.push(trace(rungs, cols, i).end);
    return perm;
  }

  // 지금 배열 A(A[칸] = 참가자)를 목표 배치로 만드는 가로줄들을 만든다.
  // 홀짝 교환 정렬이라 최대 cols 번 안에 끝나고, 한 줄에 붙은 교환이 생기지 않는다.
  function correctionRows(A, target, cols) {
    var want = [];               // want[참가자] = 가야 할 칸
    for (var i = 0; i < cols; i += 1) want[i] = target[i];

    var rows = [];
    var guard = 0;
    while (guard < cols * 2 + 4) {
      guard += 1;
      var row = [];
      for (var z = 0; z < cols - 1; z += 1) row.push(false);
      var moved = false;
      for (var c = 0; c < cols - 1; c += 1) {
        if (want[A[c]] > want[A[c + 1]]) {
          row[c] = true;
          var tmp = A[c]; A[c] = A[c + 1]; A[c + 1] = tmp;
          moved = true;
          c += 1;               // 인접 가로줄 금지
        }
      }
      if (!moved) break;
      rows.push(row);
    }
    return rows;
  }

  // wantIdx 번 참가자를 wantSlot 칸으로 보내고, 나머지는 균등하게 섞는다.
  function pickTarget(cols, wantIdx, wantSlot) {
    var slots = [];
    for (var i = 0; i < cols; i += 1) slots.push(i);
    if (wantIdx !== null && wantSlot !== null) slots.splice(slots.indexOf(wantSlot), 1);
    for (var k = slots.length - 1; k > 0; k -= 1) {
      var j = Math.floor(Math.random() * (k + 1));
      var t = slots[k]; slots[k] = slots[j]; slots[j] = t;
    }
    var target = [];
    var p = 0;
    for (var m = 0; m < cols; m += 1) {
      if (wantIdx !== null && m === wantIdx) target.push(wantSlot);
      else { target.push(slots[p]); p += 1; }
    }
    return target;
  }

  function buildLadder(cols, wantIdx, wantSlot) {
    var target = pickTarget(cols, wantIdx, wantSlot);

    var rungs = [];
    for (var r = 0; r < RANDOM_ROWS; r += 1) rungs.push(randomRow(cols, 0.45));

    // 무작위 구간을 지난 뒤의 배열을 구해서, 거기서 목표까지 채워 넣는다.
    var after = permutationOf(rungs, cols);   // after[참가자] = 현재 칸
    var A = [];
    for (var i = 0; i < cols; i += 1) A[after[i]] = i;

    rungs = rungs.concat(correctionRows(A, target, cols));
    rungs.push([]);                            // 마지막 여유 한 줄
    for (var z = 0; z < cols - 1; z += 1) rungs[rungs.length - 1].push(false);

    return { rungs: rungs, perm: permutationOf(rungs, cols), target: target };
  }

  // ── 그리기 ────────────────────────────────────────────────

  function cssVar(n, f) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    return v || f;
  }

  function colX(c, cols) {
    if (cols === 1) return W / 2;
    return PAD_X + (W - PAD_X * 2) * (c / (cols - 1));
  }

  function rowY(r, rows) {
    return PAD_TOP + (H - PAD_TOP - PAD_BOTTOM) * (r / rows);
  }

  function draw() {
    var line = cssVar("--line", "#e6e6ee");
    var ink = cssVar("--ink", "#1c1c22");
    ctx.clearRect(0, 0, W, H);
    if (!state) return;

    var cols = state.entries.length;
    var rows = state.rungs.length;

    ctx.strokeStyle = line;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (var c = 0; c < cols; c += 1) {
      ctx.beginPath();
      ctx.moveTo(colX(c, cols), rowY(0, rows));
      ctx.lineTo(colX(c, cols), rowY(rows, rows));
      ctx.stroke();
    }
    for (var r = 0; r < rows; r += 1) {
      for (var k = 0; k < cols - 1; k += 1) {
        if (!state.rungs[r][k]) continue;
        ctx.beginPath();
        ctx.moveTo(colX(k, cols), rowY(r + 0.5, rows));
        ctx.lineTo(colX(k + 1, cols), rowY(r + 0.5, rows));
        ctx.stroke();
      }
    }

    // 경로. anim 이 0~1 로 늘어나면서 위에서 아래로 그려진다.
    ctx.lineWidth = 4;
    state.paths.forEach(function (p, i) {
      var pts = p.pts;
      var upto = Math.floor(anim * (pts.length - 1));
      if (upto < 1) return;
      ctx.strokeStyle = state.entries[i].color;
      ctx.beginPath();
      ctx.moveTo(colX(pts[0].c, cols), rowY(pts[0].r, rows));
      for (var j = 1; j <= upto; j += 1) {
        ctx.lineTo(colX(pts[j].c, cols), rowY(pts[j].r, rows));
      }
      ctx.stroke();
    });

    ctx.textAlign = "center";
    ctx.font = "700 12px -apple-system, sans-serif";
    for (var t = 0; t < cols; t += 1) {
      ctx.fillStyle = state.entries[t].color;
      ctx.fillText(state.entries[t].name, colX(t, cols), rowY(0, rows) - 14);
      var done = anim >= 1;
      ctx.fillStyle = done ? ink : line;
      ctx.fillText(done ? state.outcomes[t] : "?", colX(t, cols), rowY(rows, rows) + 24);
    }
  }

  function tick() {
    if (!animating) return;
    anim = Math.min(1, anim + 0.012);
    draw();
    if (anim >= 1) {
      animating = false;
      finish();
      return;
    }
    requestAnimationFrame(tick);
  }

  // ── 진행 ──────────────────────────────────────────────────

  function outcomeLabels(n, mode) {
    if (mode === "one") {
      var arr = [];
      for (var i = 0; i < n; i += 1) arr.push(i === 0 ? "당첨" : "꽝");
      return arr;
    }
    var order = [];
    for (var k = 0; k < n; k += 1) order.push(k + 1 + "번");
    return order;
  }

  function currentMode() {
    var on = document.querySelector("#ld-mode .on");
    return on ? on.getAttribute("data-mode") : "order";
  }

  function start(cx) {
    var n = cx.entries.length;
    var mode = currentMode();
    var labels = outcomeLabels(n, mode);

    // 결과 칸 자체를 섞는다. 안 그러면 "당첨"이 항상 맨 왼쪽에 붙는다.
    var slots = labels.slice();
    for (var i = slots.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = slots[i]; slots[i] = slots[j]; slots[j] = tmp;
    }

    var wantIdx = null, wantSlot = null;
    if (cx.rig) {
      wantIdx = cx.entries.findIndex(function (e) { return e.name === cx.rig.name; });
      var wanted = cx.rig.mode === "win"
        ? (mode === "one" ? "당첨" : "1번")
        : (mode === "one" ? "꽝" : n + "번");
      // "꽝"은 여러 칸이라 그중 아무 곳이나 걸리면 된다.
      var candidates = [];
      slots.forEach(function (s, idx) { if (s === wanted) candidates.push(idx); });
      wantSlot = candidates.length
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : null;
      if (wantSlot === null) wantIdx = null;
    }

    var built = buildLadder(n, wantIdx, wantSlot);
    state = {
      entries: cx.entries,
      rungs: built.rungs,
      perm: built.perm,
      outcomes: built.perm.map(function (endCol) { return slots[endCol]; }),
      paths: built.perm.map(function (_, idx) { return trace(built.rungs, n, idx); }),
      stake: cx.stake,
      mode: mode
    };

    anim = 0;
    animating = true;
    $("setup").hidden = true;
    $("stage").hidden = false;
    $("result").hidden = true;
    requestAnimationFrame(tick);
  }

  function finish() {
    var rows = state.entries.map(function (e, i) {
      return { name: e.name, color: e.color, outcome: state.outcomes[i] };
    });

    // 순서 모드면 번호순, 당첨 모드면 당첨자가 맨 위.
    if (state.mode === "one") {
      rows.sort(function (a, b) { return (a.outcome === "당첨" ? 0 : 1) - (b.outcome === "당첨" ? 0 : 1); });
    } else {
      rows.sort(function (a, b) { return parseInt(a.outcome, 10) - parseInt(b.outcome, 10); });
    }

    var hitName = rows[0].name;
    var verdict = $("verdict");
    if (verdict) {
      verdict.innerHTML = (state.stake ? Party.escapeHtml(state.stake) + " → " : "") +
        "<strong>" + Party.escapeHtml(hitName) + "</strong> " +
        (state.mode === "one" ? "당첨" : "1번");
    }
    $("rank").innerHTML = rows.map(function (p, i) {
      return "<li" + (i === 0 ? ' class="hit"' : "") + ">" +
        '<span class="medal">' + p.outcome + "</span>" +
        '<span class="dot" style="background:' + p.color + '"></span>' +
        '<span class="rname">' + Party.escapeHtml(p.name) + "</span></li>";
    }).join("");
    $("result").hidden = false;
    state.rows = rows;
  }

  // ── 배선 ──────────────────────────────────────────────────

  setup = Party.makeSetup({
    prefix: P,
    maxPlayers: MAX,
    stats: null,
    rigModes: null,
    startLabel: function (n) { return "사다리 타기 (" + n + "명)"; },
    onStart: start
  });

  var modeBar = $("mode");
  if (modeBar) {
    modeBar.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-mode]");
      if (!btn) return;
      var btns = modeBar.querySelectorAll("[data-mode]");
      for (var i = 0; i < btns.length; i += 1) btns[i].classList.remove("on");
      btn.classList.add("on");
    });
  }

  $("skip").addEventListener("click", function () {
    if (!animating) return;
    anim = 1;
    animating = false;
    draw();
    finish();
  });
  $("again").addEventListener("click", function () {
    start({ entries: setup.entries(), rig: setup.rig(), stake: setup.stake(), rule: setup.rule() });
  });
  $("reset").addEventListener("click", function () {
    animating = false;
    $("setup").hidden = false;
    $("stage").hidden = true;
    $("result").hidden = true;
  });

  Party.wireCopy(P, function () {
    if (!state || !state.rows) return [];
    var lines = state.rows.map(function (p) { return p.outcome + " " + p.name; });
    if (state.stake) lines.unshift(state.stake + " → " + state.rows[0].name, "");
    return lines;
  });

  function fit() {
    var ratio = window.devicePixelRatio || 1;
    canvas.width = W * ratio;
    canvas.height = H * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  // 테스트용 노출. 조작 성공률과 공정성을 node로 잰다.
  window.__ladder = {
    randomRow: randomRow,
    permutationOf: permutationOf,
    buildLadder: buildLadder,
    RANDOM_ROWS: RANDOM_ROWS
  };

  fit();
  draw();
})();
