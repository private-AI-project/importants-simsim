// 심심풀이 주사위 대결.
//
// 5라운드 동안 주사위를 굴려 점수를 쌓는다. 총점 순위가 곧 결과다.
// 굴림판과 서바이벌이 탈락형이라면 이쪽은 누적형이라, 마지막 라운드까지 뒤집힐 수 있다.
//
// 서바이벌과 같은 구조를 쓴다. 결과를 먼저 전부 계산하고 화면은 재생만 한다.
// 그래야 조작이 정확히 먹고 node 로 수천 판을 즉시 검증할 수 있다.

(function () {
  "use strict";

  var root = document.getElementById("dc-setup");
  if (!root) return;

  var P = "dc";
  var MAX = 10;
  var ROUNDS = 5;
  var TICK_MS = 1250;   // 주사위가 멈추는 걸 보고 넘어가야 한다

  var STATS = [
    { key: "hand", name: "손끝", desc: "주사위 눈에 보정이 붙습니다" },
    { key: "grit", name: "뚝심", desc: "낮게 나오면 다시 굴릴 확률이 있습니다" },
    { key: "nerve", name: "배짱", desc: "대박이 터질 확률과 배수가 큽니다" },
    { key: "luck", name: "운", desc: "쪽박을 피하고 보너스를 자주 받습니다" }
  ];

  // ── 시뮬레이션 ────────────────────────────────────────────

  function d6() { return 1 + Math.floor(Math.random() * 6); }

  function simulateOnce(entries, rig) {
    function rigged(p) { return !!(rig && p.name === rig.name); }

    var players = entries.map(function (e) {
      return { name: e.name, color: e.color, stats: e.stats, total: 0, rounds: [] };
    });
    var log = [];

    for (var r = 1; r <= ROUNDS; r += 1) {
      log.push({ type: "round", text: r + "라운드", round: r });

      players.forEach(function (p) {
        var a = d6(), b = d6();
        var rerolled = false;

        // 뚝심: 한 번 더 굴려 좋은 쪽을 고른다.
        // 처음엔 "낮게 나왔을 때만 다시 굴리기"였는데, 발동 조건이 좁아 기여가 거의 없었다
        // (뚝심 2가 8보다 더 자주 이겼다). 항상 발동하되 확률로 거는 쪽이 균형이 맞다.
        var rerollChance = p.stats.grit * 0.125;
        if (rigged(p)) rerollChance = rig.mode === "lose" ? 0 : 0.95;
        if (Math.random() < rerollChance) {
          var a2 = d6(), b2 = d6();
          if (a2 + b2 > a + b) { a = a2; b = b2; }
          rerolled = true;
        }

        // 손끝: 낮은 눈을 밀어 올린다.
        // 처음엔 점수에 (손끝-5)*계수를 더했는데, 반올림 탓에 3~7이 전부 보정 0이 되고
        // 2와 8만 튀는 계단이 생겼다(2:6.3%, 8:19.2%). 확률로 걸면 값마다 매끄럽게 갈린다.
        var handChance = p.stats.hand * 0.12;
        if (rigged(p)) handChance = rig.mode === "lose" ? 0 : 1;
        if (Math.random() < handChance) {
          if (a <= b) a = Math.min(6, a + 2);
          else b = Math.min(6, b + 2);
        }

        var score = a + b;

        // 배짱: 대박. 확률과 배수 모두 배짱을 따른다.
        var bigChance = 0.04 + p.stats.nerve * 0.017;
        if (rigged(p)) bigChance = rig.mode === "lose" ? 0 : 0.8;
        var big = Math.random() < bigChance;
        if (big) score = Math.round(score * (1.4 + p.stats.nerve * 0.05));

        // 운: 쪽박을 막아준다.
        var bustChance = Math.max(0, 0.26 - p.stats.luck * 0.03);
        if (rigged(p)) bustChance = rig.mode === "lose" ? 0.9 : 0;
        var bust = Math.random() < bustChance;
        if (bust) score = Math.max(1, Math.round(score * 0.35));

        score = Math.max(1, score);
        p.total += score;
        p.rounds.push(score);

        log.push({
          type: big ? "big" : bust ? "bust" : "roll",
          name: p.name, round: r, a: a, b: b, score: score,
          total: p.total, rerolled: rerolled, big: big, bust: bust
        });
      });
    }

    var ranking = players.slice().sort(function (x, y) {
      if (y.total !== x.total) return y.total - x.total;
      return Math.random() - 0.5;   // 동점은 무작위로 가른다
    });
    return { ranking: ranking, players: players, log: log };
  }

  // 확률만 기울여서는 조작이 60~87%에서 멈춘다. 원하는 결과가 나올 때까지 판 전체를 다시 만든다.
  // 다시 만든 판도 규칙상 정상적인 판이라 로그를 봐도 이상한 곳이 없다.
  function simulate(entries, rig) {
    var r = simulateOnce(entries, rig);
    if (!rig) return r;
    for (var i = 0; i < 60; i += 1) {
      var ok = rig.mode === "lose"
        ? r.ranking[r.ranking.length - 1].name === rig.name
        : r.ranking[0].name === rig.name;
      if (ok) return r;
      r = simulateOnce(entries, rig);
    }
    return r;
  }

  // ── 3D 주사위 ─────────────────────────────────────────────
  //
  // three.js 대신 CSS transform 을 쓴다. 큐브 하나 굴리자고 라이브러리를 통째로 받아오면
  // 모바일 첫 로딩이 무거워진다. 결과는 이미 정해져 있으니 그 면이 앞에 오도록 각도만 주면 된다.

  var $ = function (id) { return document.getElementById(P + "-" + id); };

  // 3x3 격자에서 눈을 찍을 칸
  var PIPS = {
    1: [4],
    2: [0, 8],
    3: [0, 4, 8],
    4: [0, 2, 6, 8],
    5: [0, 2, 4, 6, 8],
    6: [0, 2, 3, 5, 6, 8]
  };
  // 각 면을 앞으로 돌리는 회전값
  var FACE_ROT = {
    1: [0, 0], 2: [0, 180], 3: [0, -90],
    4: [0, 90], 5: [-90, 0], 6: [90, 0]
  };
  // 큐브를 조립할 때 각 면을 놓는 위치
  var FACE_PLACE = {
    1: "translateZ(28px)",
    2: "rotateY(180deg) translateZ(28px)",
    3: "rotateY(90deg) translateZ(28px)",
    4: "rotateY(-90deg) translateZ(28px)",
    5: "rotateX(90deg) translateZ(28px)",
    6: "rotateX(-90deg) translateZ(28px)"
  };

  function buildDie(el) {
    var html = "";
    for (var f = 1; f <= 6; f += 1) {
      var cells = "";
      for (var c = 0; c < 9; c += 1) {
        cells += PIPS[f].indexOf(c) !== -1 ? "<i></i>" : "<span></span>";
      }
      html += '<span class="f" style="transform:' + FACE_PLACE[f] + '">' + cells + "</span>";
    }
    el.innerHTML = html;
  }

  var spins = 0;

  function showFace(el, face) {
    // 매번 회전을 더해가야 같은 눈이 연달아 나와도 굴러가는 게 보인다.
    spins += 1;
    var r = FACE_ROT[face];
    el.style.transform =
      "rotateX(" + (r[0] + 360 * spins) + "deg) rotateY(" + (r[1] + 360 * spins) + "deg)";
  }

  // ── 화면 ──────────────────────────────────────────────────


  var setup = null, result = null, timer = null, ctxState = null;

  function renderTable(upto) {
    var rows = result.players.slice().sort(function (a, b) { return b.total - a.total; });
    $("table").innerHTML = rows.map(function (p) {
      var cells = "";
      for (var i = 0; i < ROUNDS; i += 1) {
        var v = upto[p.name] > i ? p.rounds[i] : "";
        cells += "<td>" + v + "</td>";
      }
      return "<tr><th><span class=\"dot\" style=\"background:" + p.color + "\"></span>" +
        Party.escapeHtml(p.name) + "</th>" + cells +
        "<td class=\"tot\">" + p.rounds.slice(0, upto[p.name]).reduce(function (a, b) { return a + b; }, 0) +
        "</td></tr>";
    }).join("");
  }

  function play() {
    buildDie($("die1"));
    buildDie($("die2"));
    $("who").textContent = "";
    $("note").textContent = "";
    var upto = {};
    result.players.forEach(function (p) { upto[p.name] = 0; });
    renderTable(upto);
    $("log").innerHTML = "";

    var i = 0;
    timer = setInterval(function () {
      if (i >= result.log.length) {
        clearInterval(timer); timer = null;
        finish();
        return;
      }
      var ev = result.log[i]; i += 1;

      var li = document.createElement("li");
      if (ev.type === "round") {
        li.className = "log-out";
        li.textContent = "— " + ev.text + " —";
      } else {
        upto[ev.name] = ev.round;
        renderTable(upto);
        $("who").textContent = ev.name;
        showFace($("die1"), ev.a);
        showFace($("die2"), ev.b);
        var note = $("note");
        note.className = "dice-note" + (ev.big || ev.bust ? " big" : "");
        note.textContent = (ev.rerolled ? "다시 굴림  " : "") +
          (ev.big ? "대박!  " : "") + (ev.bust ? "쪽박…  " : "") + ev.score + "점";
        li.className = ev.big ? "log-crit" : ev.bust ? "log-bad" : "log-hit";
        li.textContent = ev.name + "  🎲 " + ev.a + "+" + ev.b +
          (ev.rerolled ? " (다시 굴림)" : "") +
          (ev.big ? "  대박!" : "") + (ev.bust ? "  쪽박…" : "") +
          "  →  " + ev.score + "점";
      }
      $("log").insertBefore(li, $("log").firstChild);
      while ($("log").children.length > 40) $("log").removeChild($("log").lastChild);
    }, TICK_MS);
  }

  function finish() {
    var ranked = result.ranking.map(function (p) {
      return { name: p.name, color: p.color, note: p.total + "점" };
    });
    Party.renderResult(P, ranked, {
      rule: ctxState.rule,
      stake: ctxState.stake,
      labels: { first: "1등", last: "꼴찌" }
    });
  }

  function start(cx) {
    ctxState = cx;
    result = simulate(cx.entries, cx.rig);
    $("setup").hidden = true;
    $("stage").hidden = false;
    $("result").hidden = true;
    play();
  }

  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  setup = Party.makeSetup({
    // 시작할 때 다시 굴리는 값이라 미리 보여주면 이 수치로 겨루는 줄로 읽힌다.
    showStats: false,
    onRender: function (entries) {
      var head = document.getElementById("dc-roster-head");
      var cnt = document.getElementById("dc-roster-count");
      if (head) head.hidden = entries.length === 0;
      if (cnt) cnt.textContent = cnt.dataset.label
        ? cnt.dataset.label + " " + entries.length + "개"
        : "참가자 " + entries.length + "명";
    },
    prefix: P,
    maxPlayers: MAX,
    stats: STATS,
    statTotal: 20,
    statMin: 2,
    statMax: 8,
    startLabel: function (n) { return "굴리기 (" + n + "명)"; },
    onStart: start
  });

  $("skip").addEventListener("click", function () {
    stop();
    var upto = {};
    result.players.forEach(function (p) { upto[p.name] = ROUNDS; });
    renderTable(upto);
    finish();
  });
  $("again").addEventListener("click", function () {
    stop();
    start({ entries: setup.entries(), rig: setup.rig(), stake: setup.stake(), rule: setup.rule() });
  });
  $("reset").addEventListener("click", function () {
    stop();
    $("setup").hidden = false;
    $("stage").hidden = true;
    $("result").hidden = true;
  });

  Party.wireCopy(P, function () {
    if (!result) return [];
    var lines = result.ranking.map(function (p, i) { return (i + 1) + "위 " + p.name + " " + p.total + "점"; });
    var who = ctxState.rule === "last" ? result.ranking[result.ranking.length - 1] : result.ranking[0];
    if (who) lines.unshift((ctxState.stake ? ctxState.stake + " → " : "") + who.name, "");
    return lines;
  });

  window.__dice = { simulate: simulate, rollStats: function () {
    return Party.rollStats(STATS.map(function (s) { return s.key; }), 20, 2, 8);
  } };
})();
