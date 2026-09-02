// 심심풀이 서바이벌.
//
// 이름을 넣으면 능력치를 받고 자동으로 싸운다. 탈락한 순서의 역순이 최종 순위다.
//
// 구조상 중요한 점: 결과를 먼저 전부 계산해두고(simulate), 화면은 그 기록을 재생만 한다.
// 그래야 조작이 정확히 먹고, node에서 수천 판을 즉시 돌려 공정성과 조작 성공률을 잴 수 있다.
//
// 서버가 없다. 이름도 결과도 브라우저 밖으로 나가지 않는다.

(function () {
  "use strict";

  var root = document.getElementById("sv-setup");
  if (!root) return;

  var MAX_PLAYERS = 12;
  var STAT_TOTAL = 20;
  var STAT_MIN = 2;
  var STAT_MAX = 8;
  var HP = 100;
  var TICK_MS = 900;

  var STATS = [
    { key: "atk", name: "공격", desc: "때릴 때 아프게 때립니다" },
    { key: "def", name: "방어", desc: "맞아도 덜 아픕니다" },
    { key: "eva", name: "회피", desc: "아예 안 맞고 넘어갑니다" },
    { key: "luck", name: "운", desc: "치명타와 행운이 자주 터집니다" }
  ];

  // 총합을 고정해 굴린다. 총합이 다르면 그 자체로 유불리가 생겨 내기가 성립하지 않는다.
  function rollStats() {
    var s = { atk: STAT_MIN, def: STAT_MIN, eva: STAT_MIN, luck: STAT_MIN };
    var keys = ["atk", "def", "eva", "luck"];
    var left = STAT_TOTAL - STAT_MIN * keys.length;
    while (left > 0) {
      var k = keys[Math.floor(Math.random() * keys.length)];
      if (s[k] >= STAT_MAX) continue;
      s[k] += 1;
      left -= 1;
    }
    return s;
  }

  var ATTACKS = [
    "{a}이(가) {b}에게 달려들었다",
    "{a}의 기습, {b}이(가) 당했다",
    "{a}이(가) {b}을(를) 노렸다",
    "{a}이(가) 뒤에서 {b}을(를) 덮쳤다",
    "{a}이(가) {b}에게 한 방 먹였다"
  ];
  var MISSES = [
    "{b}이(가) 몸을 틀어 피했다",
    "{a}의 공격이 허공을 갈랐다",
    "{b}이(가) 아슬아슬하게 빠져나갔다"
  ];
  var SOLO_GOOD = [
    "{a}이(가) 구급상자를 주웠다",
    "{a}이(가) 몸을 숨기고 숨을 골랐다",
    "{a}에게 보급품이 떨어졌다"
  ];
  var SOLO_BAD = [
    "{a}이(가) 함정을 밟았다",
    "{a}이(가) 발을 헛디뎠다",
    "{a}이(가) 돌부리에 걸려 넘어졌다"
  ];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function fill(tpl, a, b) { return tpl.replace("{a}", a).replace("{b}", b || ""); }

  // ── 시뮬레이션 ────────────────────────────────────────────
  //
  // rig: { name, mode } mode 는 "lose"(먼저 탈락) 또는 "win"(끝까지 생존).
  // 조작은 확률을 기울이는 방식이다. 즉사시키면 로그만 봐도 티가 난다.

  function simulate(entries, rig) {
    var alive = entries.map(function (e) {
      return { name: e.name, stats: e.stats, hp: HP, color: e.color };
    });
    var out = [];      // 탈락한 순서
    var log = [];
    var guard = 0;

    function rigged(p) { return !!(rig && p.name === rig.name); }

    function damage(a, b) {
      var base = 12 + Math.random() * 11;
      base *= 1 + (a.stats.atk - 5) * 0.08;
      base *= 1 - (b.stats.def - 5) * 0.038;   // 0.055는 방어가 압도적이었다
      if (rigged(a)) base *= rig.mode === "lose" ? 0.55 : 1.5;
      if (rigged(b)) base *= rig.mode === "lose" ? 1.9 : 0.45;
      // 운은 치명타를 올리는 동시에 상대 치명타를 덜 맞게 한다.
      // 공격에만 쓰이면 생존 게임에서 운에 투자할 이유가 없어진다(승률이 9.4%까지 떨어졌다).
      var crit = (0.05 + a.stats.luck * 0.025) * (1 - b.stats.luck * 0.05);
      var isCrit = Math.random() < crit;
      if (isCrit) base *= 1.8;
      return { value: Math.max(1, Math.round(base)), crit: isCrit };
    }

    function evaded(b) {
      if (rigged(b)) return rig.mode === "lose" ? false : Math.random() < 0.5;
      return Math.random() < 0.05 + b.stats.eva * 0.032;
    }

    // 쓰러뜨린 쪽은 회복한다. 이게 없으면 공격 능력치가 생존에 아무 도움이 안 돼서,
    // 총합이 고정인 이상 공격에 몰수록 오히려 먼저 죽는다. 능력치를 보고 거는 게임에서
    // 그러면 안 된다(실제로 공격 2가 8보다 더 자주 이겼다).
    function kill(p, by) {
      alive.splice(alive.indexOf(p), 1);
      out.push(p);
      log.push({ type: "out", text: p.name + " 탈락 (" + out.length + "번째)", name: p.name });
      if (by && alive.indexOf(by) !== -1) {
        var heal = Math.min(HP - by.hp, 16 + Math.round(Math.random() * 14));
        if (heal > 0) {
          by.hp += heal;
          log.push({ type: "good", text: by.name + "이(가) 기세를 올렸다", name: by.name, hp: by.hp });
        }
      }
    }

    while (alive.length > 1 && guard < 4000) {
      guard += 1;

      // 단독 사건. 가끔 자기 혼자 다치거나 회복한다.
      if (Math.random() < 0.22) {
        var s = pick(alive);
        var good = Math.random() < 0.3 + s.stats.luck * 0.045;
        if (rigged(s)) good = rig.mode === "lose" ? Math.random() < 0.08 : Math.random() < 0.9;
        if (good) {
          var heal = Math.min(HP - s.hp, 8 + Math.round(Math.random() * 12));
          s.hp += heal;
          log.push({ type: "good", text: fill(pick(SOLO_GOOD), s.name), name: s.name, hp: s.hp });
        } else {
          var hurt = 6 + Math.round(Math.random() * 12);
          if (rigged(s) && rig.mode === "lose") hurt = Math.round(hurt * 1.8);
          s.hp -= hurt;
          log.push({ type: "bad", text: fill(pick(SOLO_BAD), s.name), name: s.name, hp: s.hp });
          if (s.hp <= 0) kill(s);
        }
        continue;
      }

      var a = pick(alive);
      var pool = alive.filter(function (x) { return x !== a; });
      if (!pool.length) break;

      // 조작 대상이 먼저 죽어야 하면 그쪽을 자주 노리게 한다.
      var b;
      if (rig && rig.mode === "lose" && Math.random() < 0.62) {
        b = pool.filter(function (x) { return rigged(x); })[0] || pick(pool);
      } else if (rig && rig.mode === "win" && rigged(a)) {
        b = pick(pool);
      } else if (rig && rig.mode === "win" && Math.random() < 0.7) {
        b = pool.filter(function (x) { return !rigged(x); })[0] || pick(pool);
      } else {
        b = pick(pool);
      }

      if (evaded(b)) {
        log.push({ type: "miss", text: fill(pick(MISSES), a.name, b.name), name: b.name, hp: b.hp });
        continue;
      }

      var d = damage(a, b);
      b.hp -= d.value;
      log.push({
        type: d.crit ? "crit" : "hit",
        text: fill(pick(ATTACKS), a.name, b.name) + (d.crit ? " 치명타!" : ""),
        name: b.name, hp: Math.max(0, b.hp), dmg: d.value
      });
      if (b.hp <= 0) {
        // 구사일생. 운이 생존에 직접 기여하는 통로다.
        if (!rigged(b) && Math.random() < b.stats.luck * 0.02) {
          b.hp = 1;
          log.push({ type: "good", text: b.name + " 구사일생!", name: b.name, hp: 1 });
        } else {
          kill(b, a);
        }
      }
    }

    if (alive.length === 1) out.push(alive[0]);
    // 탈락 역순이 순위다. 마지막 생존자가 1등.
    var ranking = out.slice().reverse();
    return { ranking: ranking, log: log };
  }

  // ── 상태 ──────────────────────────────────────────────────

  var entries = [];
  var rig = null;
  var winRule = "last";     // last = 먼저 탈락한 사람이 당첨(벌칙), first = 최후 생존자가 당첨
  var playTimer = null;
  var result = null;

  var elSetup = document.getElementById("sv-setup");
  var elStage = document.getElementById("sv-stage");
  var elResult = document.getElementById("sv-result");
  var elInput = document.getElementById("sv-input");
  var elAdd = document.getElementById("sv-add");
  var elEmpty = document.getElementById("sv-empty");
  var elStart = document.getElementById("sv-start");
  var elRoster = document.getElementById("sv-roster");
  var elField = document.getElementById("sv-field");
  var elLog = document.getElementById("sv-log");
  var elRank = document.getElementById("sv-rank");
  var elStake = document.getElementById("sv-stake");
  var elVerdict = document.getElementById("sv-verdict");
  var elRigSel = document.getElementById("sv-rig-target");
  var elRigMode = document.getElementById("sv-rig-mode");

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function addName(raw) {
    var v = (raw || "").trim();
    if (!v) return false;
    if (entries.length >= MAX_PLAYERS) return false;
    entries.push({ name: v, stats: rollStats() });
    render();
    return true;
  }

  function removeAt(i) {
    entries.splice(i, 1);
    render();
  }

  function colorFor(i) {
    return "hsl(" + Math.round((360 / Math.max(entries.length, 1)) * i) + " 70% 55%)";
  }

  function statBars(st) {
    return STATS.map(function (s) {
      var v = st[s.key];
      return '<span class="stat"><em>' + s.name + "</em>" +
        '<i><u style="width:' + (v / STAT_MAX * 100) + '%"></u></i>' +
        "<b>" + v + "</b></span>";
    }).join("");
  }

  function render() {
    entries.forEach(function (e, i) { e.color = colorFor(i); });

    elRoster.innerHTML = entries.map(function (e, i) {
      return '<li><div class="rtop">' +
        '<span class="dot" style="background:' + e.color + '"></span>' +
        '<span class="rname">' + escapeHtml(e.name) + "</span>" +
        '<button type="button" class="rdel" data-i="' + i + '" aria-label="삭제">×</button>' +
        '</div><div class="stats">' + statBars(e.stats) + "</div></li>";
    }).join("");

    if (elEmpty) elEmpty.hidden = entries.length > 0;
    elStart.disabled = entries.length < 2;
    elStart.textContent = entries.length < 2
      ? "2명 이상 필요해요"
      : "시작 (" + entries.length + "명)";

    if (elRigSel) {
      var cur = elRigSel.value;
      elRigSel.innerHTML = '<option value="">조작 안 함</option>' +
        entries.map(function (e) {
          return '<option value="' + escapeHtml(e.name) + '">' + escapeHtml(e.name) + "</option>";
        }).join("");
      elRigSel.value = entries.some(function (e) { return e.name === cur; }) ? cur : "";
      syncRig();
    }
  }

  function syncRig() {
    var name = elRigSel ? elRigSel.value : "";
    rig = name ? { name: name, mode: elRigMode ? elRigMode.value : "lose" } : null;
    var badge = document.getElementById("sv-rig-badge");
    if (badge) badge.hidden = !rig;
  }

  // ── 재생 ──────────────────────────────────────────────────

  function renderField(hpMap, deadSet) {
    elField.innerHTML = entries.map(function (e) {
      var hp = hpMap[e.name];
      var dead = deadSet[e.name];
      return '<li class="pl' + (dead ? " dead" : "") + '">' +
        '<span class="dot" style="background:' + e.color + '"></span>' +
        '<span class="pname">' + escapeHtml(e.name) + "</span>" +
        '<span class="hpbar"><u style="width:' + Math.max(0, hp) + '%"></u></span>' +
        '<span class="hpnum">' + (dead ? "탈락" : Math.max(0, Math.round(hp))) + "</span></li>";
    }).join("");
  }

  function play() {
    var hpMap = {}, deadSet = {};
    entries.forEach(function (e) { hpMap[e.name] = HP; });
    renderField(hpMap, deadSet);
    elLog.innerHTML = "";

    var i = 0;
    playTimer = setInterval(function () {
      if (i >= result.log.length) {
        clearInterval(playTimer);
        playTimer = null;
        finish();
        return;
      }
      var ev = result.log[i];
      i += 1;

      if (ev.type === "out") deadSet[ev.name] = true;
      else if (typeof ev.hp === "number") hpMap[ev.name] = ev.hp;
      renderField(hpMap, deadSet);

      var li = document.createElement("li");
      li.className = "log-" + ev.type;
      li.textContent = ev.text + (ev.dmg ? "  -" + ev.dmg : "");
      elLog.insertBefore(li, elLog.firstChild);
      while (elLog.children.length > 40) elLog.removeChild(elLog.lastChild);
    }, TICK_MS);
  }

  function target() {
    if (!result) return null;
    // winRule "last" = 먼저 탈락한 사람이 당첨(벌칙 받는 쪽)
    return winRule === "last"
      ? result.ranking[result.ranking.length - 1]
      : result.ranking[0];
  }

  function finish() {
    var w = target();
    var stake = (elStake && elStake.value.trim()) || "";
    var label = winRule === "last" ? "가장 먼저 탈락" : "최후 생존";
    if (elVerdict && w) {
      elVerdict.innerHTML = (stake ? escapeHtml(stake) + " → " : "") +
        "<strong>" + escapeHtml(w.name) + "</strong> " + label;
    }
    elRank.innerHTML = result.ranking.map(function (p, i) {
      var medal = ["🥇", "🥈", "🥉"][i] || (i + 1) + "위";
      var hit = w && p.name === w.name;
      return "<li" + (hit ? ' class="hit"' : "") + ">" +
        '<span class="medal">' + medal + "</span>" +
        '<span class="dot" style="background:' + p.color + '"></span>' +
        '<span class="rname">' + escapeHtml(p.name) + "</span></li>";
    }).join("");
    elResult.hidden = false;
  }

  function start() {
    if (entries.length < 2) return;
    syncRig();
    entries.forEach(function (e) { e.stats = rollStats(); });
    render();
    result = simulate(entries, rig);
    elSetup.hidden = true;
    elStage.hidden = false;
    elResult.hidden = true;
    play();
  }

  function stop() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
  }

  // ── 입력 ──────────────────────────────────────────────────

  function submitName() {
    if (addName(elInput.value)) elInput.value = "";
    elInput.focus();
  }

  elAdd.addEventListener("click", submitName);
  elInput.addEventListener("keydown", function (e) {
    // 한글 IME는 조합을 확정하는 엔터와 실제 엔터가 연달아 keydown 을 낸다.
    // 걸러내지 않으면 이름 하나에 두 명이 추가된다. 영문으로 치면 재현되지 않는다.
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") { e.preventDefault(); submitName(); }
  });
  elRoster.addEventListener("click", function (e) {
    var btn = e.target.closest(".rdel");
    if (btn) removeAt(parseInt(btn.getAttribute("data-i"), 10));
  });
  if (elRigSel) elRigSel.addEventListener("change", syncRig);
  if (elRigMode) elRigMode.addEventListener("change", syncRig);

  var ruleBar = document.getElementById("sv-rule");
  if (ruleBar) {
    ruleBar.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-rule]");
      if (!btn) return;
      winRule = btn.getAttribute("data-rule");
      var btns = ruleBar.querySelectorAll("[data-rule]");
      for (var i = 0; i < btns.length; i += 1) {
        btns[i].classList.toggle("on", btns[i].getAttribute("data-rule") === winRule);
      }
    });
  }

  elStart.addEventListener("click", start);
  document.getElementById("sv-again").addEventListener("click", function () { stop(); start(); });
  document.getElementById("sv-reset").addEventListener("click", function () {
    stop();
    elSetup.hidden = false;
    elStage.hidden = true;
    elResult.hidden = true;
  });
  document.getElementById("sv-skip").addEventListener("click", function () {
    stop();
    var hpMap = {}, deadSet = {};
    entries.forEach(function (e) { hpMap[e.name] = 0; deadSet[e.name] = true; });
    if (result && result.ranking[0]) { deadSet[result.ranking[0].name] = false; hpMap[result.ranking[0].name] = 30; }
    renderField(hpMap, deadSet);
    finish();
  });
  document.getElementById("sv-copy").addEventListener("click", function (e) {
    if (!result) return;
    var lines = result.ranking.map(function (p, i) { return (i + 1) + "위 " + p.name; });
    var w = target();
    var stake = (elStake && elStake.value.trim()) || "";
    if (w) lines.unshift((stake ? stake + " → " : "") + w.name, "");
    var btn = e.currentTarget;
    var original = btn.textContent;
    navigator.clipboard.writeText(lines.join("\n")).then(function () {
      btn.textContent = "복사됨";
      setTimeout(function () { btn.textContent = original; }, 1800);
    });
  });

  var elHelp = document.getElementById("sv-stat-help");
  if (elHelp) {
    elHelp.innerHTML = STATS.map(function (s) {
      return "<li><b>" + s.name + "</b> " + s.desc + "</li>";
    }).join("") +
      "<li>능력치 총합은 모두 20으로 같고 시작할 때마다 다시 굴립니다.</li>";
  }

  // 테스트용 노출. 공정성과 조작 성공률을 node로 잰다.
  window.__survival = {
    rollStats: rollStats,
    simulate: simulate
  };

  render();
})();
