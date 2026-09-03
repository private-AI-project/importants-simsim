// 내기 게임 공용 모듈.
//
// 게임마다 필요한 것이 거의 같다. 이름 추가, 능력치 굴리기, 무엇을 걸지, 당첨 기준,
// 방장 조작, 결과 순위와 복사. 이걸 게임마다 다시 쓰면 한 곳을 고칠 때 네 곳을 고쳐야 한다.
//
// 게임은 시뮬레이션과 재생만 맡고, 설정 화면은 전부 여기서 처리한다.

window.Party = (function () {
  "use strict";

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // 총합을 고정해 굴린다. 총합이 다르면 그 자체로 유불리가 생겨 내기가 성립하지 않는다.
  function rollStats(keys, total, min, max) {
    var s = {};
    keys.forEach(function (k) { s[k] = min; });
    var left = total - min * keys.length;
    var guard = 0;
    while (left > 0 && guard < 10000) {
      guard += 1;
      var k = keys[Math.floor(Math.random() * keys.length)];
      if (s[k] >= max) continue;
      s[k] += 1;
      left -= 1;
    }
    return s;
  }

  function colorFor(i, n) {
    return "hsl(" + Math.round((360 / Math.max(n, 1)) * i) + " 70% 55%)";
  }

  function statBars(defs, st, max) {
    return defs.map(function (d) {
      var v = st[d.key];
      return '<span class="stat"><em>' + d.name + "</em>" +
        '<i><u style="width:' + (v / max * 100) + '%"></u></i>' +
        "<b>" + v + "</b></span>";
    }).join("");
  }

  // cfg: {
  //   prefix, maxPlayers, minPlayers,
  //   stats: [{key,name,desc}] | null, statTotal, statMax, statMin,
  //   rigModes: [{value,label}],
  //   startLabel(n), onStart(ctx)
  // }
  function makeSetup(cfg) {
    var P = cfg.prefix;
    var $ = function (id) { return document.getElementById(P + "-" + id); };

    var elInput = $("input"), elAdd = $("add"), elEmpty = $("empty"),
        elStart = $("start"), elRoster = $("roster"),
        elStake = $("stake"), elRigSel = $("rig-target"), elRigMode = $("rig-mode"),
        elRigBadge = $("rig-badge"), elHelp = $("stat-help");

    var minPlayers = cfg.minPlayers || 2;
    var entries = [];
    var rule = "last";

    function newStats() {
      if (!cfg.stats) return null;
      return rollStats(cfg.stats.map(function (s) { return s.key; }),
        cfg.statTotal, cfg.statMin || 2, cfg.statMax || 8);
    }

    function add(raw) {
      var v = (raw || "").trim();
      if (!v) return false;
      if (entries.length >= cfg.maxPlayers) return false;
      entries.push({ name: v, stats: newStats() });
      render();
      return true;
    }

    function render() {
      entries.forEach(function (e, i) { e.color = colorFor(i, entries.length); });

      elRoster.innerHTML = entries.map(function (e, i) {
        // showStats: false 면 시작 전에는 안 보여준다. 시작할 때 다시 굴리는 값이라
        // 미리 보여주면 이 수치로 겨루는 줄로 읽힌다.
        var bars = (cfg.stats && cfg.showStats !== false)
          ? '<div class="stats">' + statBars(cfg.stats, e.stats, cfg.statMax || 8) + "</div>"
          : "";
        return '<li><div class="rtop">' +
          '<span class="dot" style="background:' + e.color + '"></span>' +
          '<span class="rname">' + escapeHtml(e.name) + "</span>" +
          '<button type="button" class="rdel" data-i="' + i + '" aria-label="삭제">×</button>' +
          "</div>" + bars + "</li>";
      }).join("");

      if (elEmpty) elEmpty.hidden = entries.length > 0;
      elStart.disabled = entries.length < minPlayers;
      elStart.textContent = entries.length < minPlayers
        ? minPlayers + "명 이상 필요해요"
        : cfg.startLabel(entries.length);

      if (elRigSel) {
        var cur = elRigSel.value;
        elRigSel.innerHTML = '<option value="">조작 안 함</option>' +
          entries.map(function (e) {
            return '<option value="' + escapeHtml(e.name) + '">' + escapeHtml(e.name) + "</option>";
          }).join("");
        elRigSel.value = entries.some(function (e) { return e.name === cur; }) ? cur : "";
        syncRig();
      }

      if (cfg.onRender) cfg.onRender(entries);
    }

    function syncRig() {
      if (elRigBadge) elRigBadge.hidden = !(elRigSel && elRigSel.value);
    }

    function getRig() {
      if (!elRigSel || !elRigSel.value) return null;
      return { name: elRigSel.value, mode: elRigMode ? elRigMode.value : "lose" };
    }

    function submit() {
      if (add(elInput.value)) elInput.value = "";
      elInput.focus();
    }

    elAdd.addEventListener("click", submit);
    elInput.addEventListener("keydown", function (e) {
      // 한글 IME는 조합을 확정하는 엔터와 실제 엔터가 연달아 keydown 을 낸다.
      // 걸러내지 않으면 이름 하나에 두 명이 추가된다. 영문으로 치면 재현되지 않는다.
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key === "Enter") { e.preventDefault(); submit(); }
    });
    elRoster.addEventListener("click", function (e) {
      var btn = e.target.closest(".rdel");
      if (!btn) return;
      entries.splice(parseInt(btn.getAttribute("data-i"), 10), 1);
      render();
    });
    if (elRigSel) elRigSel.addEventListener("change", syncRig);

    var ruleBar = $("rule");
    if (ruleBar) {
      ruleBar.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-rule]");
        if (!btn) return;
        rule = btn.getAttribute("data-rule");
        var btns = ruleBar.querySelectorAll("[data-rule]");
        for (var i = 0; i < btns.length; i += 1) {
          btns[i].classList.toggle("on", btns[i].getAttribute("data-rule") === rule);
        }
      });
    }

    elStart.addEventListener("click", function () {
      if (entries.length < minPlayers) return;
      // 능력치는 시작할 때마다 다시 굴린다. 사람에게 붙어 있으면 강한 능력치를 받은 사람이
      // 계속 이겨서 뽑기로 쓸 수 없다.
      if (cfg.stats) entries.forEach(function (e) { e.stats = newStats(); });
      render();
      cfg.onStart({
        entries: entries.slice(),
        rig: getRig(),
        stake: elStake ? elStake.value.trim() : "",
        rule: rule
      });
    });

    if (elHelp && cfg.stats) {
      elHelp.innerHTML = cfg.stats.map(function (s) {
        return "<li><b>" + s.name + "</b> " + s.desc + "</li>";
      }).join("") +
        "<li>능력치 총합은 모두 " + cfg.statTotal + "로 같고 시작할 때마다 다시 굴립니다.</li>";
    }

    render();

    return {
      entries: function () { return entries; },
      rule: function () { return rule; },
      stake: function () { return elStake ? elStake.value.trim() : ""; },
      rig: getRig,
      render: render
    };
  }

  // 결과 패널 공통 렌더. ranking 은 [{name,color}] 순서대로 1등부터.
  function renderResult(prefix, ranking, opts) {
    var $ = function (id) { return document.getElementById(prefix + "-" + id); };
    var elRank = $("rank"), elVerdict = $("verdict"), elResult = $("result");
    var pickLast = opts.rule === "last";
    var who = pickLast ? ranking[ranking.length - 1] : ranking[0];
    var label = opts.labels
      ? (pickLast ? opts.labels.last : opts.labels.first)
      : (pickLast ? "꼴찌" : "1등");

    if (elVerdict && who) {
      elVerdict.innerHTML = (opts.stake ? escapeHtml(opts.stake) + " → " : "") +
        "<strong>" + escapeHtml(who.name) + "</strong> " + label;
    }
    elRank.innerHTML = ranking.map(function (p, i) {
      var medal = ["🥇", "🥈", "🥉"][i] || (i + 1) + "위";
      var hit = who && p.name === who.name;
      return "<li" + (hit ? ' class="hit"' : "") + ">" +
        '<span class="medal">' + medal + "</span>" +
        '<span class="dot" style="background:' + (p.color || "#999") + '"></span>' +
        '<span class="rname">' + escapeHtml(p.name) + "</span>" +
        (p.note ? '<span class="rab">' + escapeHtml(p.note) + "</span>" : "") +
        "</li>";
    }).join("");
    if (elResult) elResult.hidden = false;
    return who;
  }

  function wireCopy(prefix, getLines) {
    var btn = document.getElementById(prefix + "-copy");
    if (!btn) return;
    btn.addEventListener("click", function () {
      var original = btn.textContent;
      navigator.clipboard.writeText(getLines().join("\n")).then(function () {
        btn.textContent = "복사됨";
        setTimeout(function () { btn.textContent = original; }, 1800);
      });
    });
  }

  return {
    escapeHtml: escapeHtml,
    rollStats: rollStats,
    statBars: statBars,
    colorFor: colorFor,
    makeSetup: makeSetup,
    renderResult: renderResult,
    wireCopy: wireCopy
  };
})();
