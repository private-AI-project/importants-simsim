// 날짜 뽑기.
//
// 날짜 투표는 결론이 안 난다. 다 되는 날이 없고 한 명이 늦게 답하면 멈춘다.
// 그래서 조건만 받고 하루를 뽑는다.
//
// 날짜는 전부 "YYYY-MM-DD" 문자열로 다룬다. Date 객체를 UTC 로 파싱하면
// 한국 시간대에서 하루씩 밀린다. new Date("2026-09-03") 은 UTC 자정이고
// 서울에서는 9월 3일 오전 9시가 되므로, 문자열끼리 비교하는 편이 안전하다.

(function () {
  "use strict";

  var app = document.getElementById("dp-app");
  if (!app) return;

  var HOLIDAYS = {};
  try {
    var raw = JSON.parse(document.getElementById("dp-holidays").textContent);
    Object.keys(raw).forEach(function (y) {
      (raw[y] || []).forEach(function (h) { HOLIDAYS[h.date] = h.name; });
    });
  } catch (e) {
    HOLIDAYS = {};
  }

  // 예보는 오늘부터 11일까지만 있다. 그보다 먼 날은 아무것도 붙이지 않는다.
  var WEATHER = {};
  var WEATHER_REGION = "";
  try {
    var w = JSON.parse(document.getElementById("dp-weather").textContent);
    WEATHER = w.days || {};
    WEATHER_REGION = w.region || "";
  } catch (e) {
    WEATHER = {};
  }

  var DOW = ["일", "월", "화", "수", "목", "금", "토"];
  var MAX_DAYS = 400;   // 기간을 너무 넓게 잡으면 달력만 무거워진다

  var elFrom = document.getElementById("dp-from");
  var elTo = document.getElementById("dp-to");
  var elMonths = document.getElementById("dp-months");
  var elSpan = document.getElementById("dp-span");
  var elCount = document.getElementById("dp-count");
  var elPick = document.getElementById("dp-pick");
  var elResult = document.getElementById("dp-result");
  var elPicked = document.getElementById("dp-picked");
  var elPickedDow = document.getElementById("dp-picked-dow");
  var elPickedNote = document.getElementById("dp-picked-note");
  var elWeather = document.getElementById("dp-weather-line");
  var elClear = document.getElementById("dp-clear");
  var elSetup = document.getElementById("dp-setup");
  var elRejected = document.getElementById("dp-rejected");
  var elReject = document.getElementById("dp-reject");
  var elRigSel = document.getElementById("dp-rig-target");
  var elRigMode = document.getElementById("dp-rig-mode");
  var elRigBadge = document.getElementById("dp-rig-badge");

  // 기본은 아무것도 안 고른 상태다. 전부 켜두고 빼게 하면 안 되는 날이 많을 때
  // 손이 훨씬 많이 간다. 될 날짜만 눌러 담는다.
  var selected = {};
  // 뽑혔는데 실제로 안 되는 날. 고른 목록에서 지우는 것과 구분해야 한다.
  // 지워버리면 "왜 이 날이 후보에서 빠졌지" 하고 다시 누르게 된다.
  var rejected = {};
  var lastPicked = null;
  var rolling = null;

  var reduceMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  // ── 날짜 도우미 ───────────────────────────────────────────

  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parse(s) {
    var p = s.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function addDays(s, n) {
    var d = parse(s);
    d.setDate(d.getDate() + n);
    return iso(d);
  }
  function dowOf(s) { return parse(s).getDay(); }

  function eachDay(from, to, fn) {
    var cur = from, guard = 0;
    while (cur <= to && guard < MAX_DAYS) {
      guard += 1;
      fn(cur);
      cur = addDays(cur, 1);
    }
  }

  // ── 후보 계산 ─────────────────────────────────────────────

  function inRange(s) {
    var from = elFrom.value, to = elTo.value;
    return !!from && !!to && s >= from && s <= to;
  }

  function isCandidate(s) {
    return !!selected[s] && inRange(s) && !rejected[s];
  }

  function candidates() {
    var out = [];
    var from = elFrom.value, to = elTo.value;
    if (!from || !to || from > to) return out;
    eachDay(from, to, function (s) { if (isCandidate(s)) out.push(s); });
    return out;
  }

  // ── 달력 ──────────────────────────────────────────────────

  // 달 단위로 그리지 않고 기간이 걸친 주만 이어서 그린다. 4주를 고르면 두 달에
  // 걸치는데 달력 두 개를 쌓으면 세로가 두 배가 된다. 주 단위로 이으면 절반이다.
  // 칸을 줄여서 해결하려 했더니 360px 화면에서 21px 까지 작아져 누를 수 없었다.
  function renderMonths() {
    var from = elFrom.value, to = elTo.value;
    elMonths.innerHTML = "";
    if (elSpan) elSpan.textContent = "";
    if (!from || !to || from > to) return;

    // 기간을 감싸는 주의 일요일부터 토요일까지.
    var head = addDays(from, -dowOf(from));
    var tail = addDays(to, 6 - dowOf(to));

    var months = [];
    var lastMonth = "";
    eachDay(from, to, function (d) {
      var k = d.slice(0, 7);
      if (months.indexOf(k) < 0) months.push(k);
    });
    if (elSpan) {
      elSpan.textContent = months.map(function (k) {
        return +k.slice(5, 7) + "월";
      }).join(" ~ ");
    }

    eachDay(head, tail, function (s) {
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "dp-cell";
      cell.dataset.date = s;

      var day = +s.slice(8, 10);
      // 달이 바뀌는 첫 칸에만 월을 붙인다. 이게 없으면 숫자만 이어져서
      // 어디서 달이 넘어갔는지 알 수 없다.
      var month = s.slice(0, 7);
      if (day === 1 || (lastMonth && month !== lastMonth && lastMonth !== "")) {
        cell.innerHTML = '<b>' + (+s.slice(5, 7)) + "/" + day + "</b>";
        cell.classList.add("first");
      } else {
        cell.textContent = day;
      }
      lastMonth = month;

      if (s < from || s > to) {
        cell.classList.add("out");
        cell.disabled = true;
      }
      if (HOLIDAYS[s]) {
        cell.classList.add("hol");
        cell.title = HOLIDAYS[s];
      }
      // 예보가 있는 날에만 점을 찍는다. 어디까지 날씨가 나오는지 미리 보인다.
      if (WEATHER[s]) cell.classList.add("wx");
      elMonths.appendChild(cell);
    });

    paintCells();
  }

  function paintCells() {
    var cells = elMonths.querySelectorAll(".dp-cell[data-date]");
    for (var i = 0; i < cells.length; i += 1) {
      var c = cells[i];
      var s = c.dataset.date;
      c.classList.toggle("on", isCandidate(s));
      c.classList.toggle("rejected", !!rejected[s] && !!selected[s] && inRange(s));
    }
  }

  function refresh() {
    var list = candidates();
    elPick.disabled = list.length === 0;
    if (list.length === 0) {
      elCount.textContent = "될 날짜를 하나 이상 고르세요";
      elCount.classList.add("none");
    } else {
      elCount.textContent = "고른 날 " + list.length + "일";
      elCount.classList.remove("none");
    }
    elPick.textContent = lastPicked ? "다시 뽑기" : "뽑기";

    var out = Object.keys(rejected).filter(function (d) {
      return selected[d] && inRange(d);
    }).sort();
    if (elRejected) {
      elRejected.hidden = out.length === 0;
      elRejected.textContent = out.length
        ? "뺀 날 " + out.map(function (d) {
            return +d.slice(5, 7) + "/" + +d.slice(8, 10);
          }).join(", ") + " (날짜 고치기에서 다시 누르면 되살아납니다)"
        : "";
    }
    if (elClear) elClear.hidden = list.length === 0 && out.length === 0;

    syncRig(list);
  }

  // 조작 대상은 고른 날짜 중에서만 고를 수 있다. 후보에 없는 날을 정해두면
  // 아무 일도 일어나지 않아 조작이 안 되는 것처럼 보인다.
  function syncRig(list) {
    if (!elRigSel) return;
    var cur = elRigSel.value;
    elRigSel.innerHTML = '<option value="">조작 안 함</option>' +
      list.map(function (d) {
        var t = parse(d);
        return '<option value="' + d + '">' +
          (t.getMonth() + 1) + "월 " + t.getDate() + "일 (" + DOW[t.getDay()] + ")</option>";
      }).join("");
    elRigSel.value = list.indexOf(cur) >= 0 ? cur : "";
    if (elRigBadge) elRigBadge.hidden = !elRigSel.value;
  }

  function getRig() {
    if (!elRigSel || !elRigSel.value) return null;
    return { date: elRigSel.value, mode: elRigMode ? elRigMode.value : "win" };
  }

  // 확률만 기울인다. 100% 로 고정하면 다시 뽑을 때마다 같은 날만 나와서
  // 조작한 것이 바로 드러난다. 방금 뽑힌 날을 빼는 규칙과도 부딪힌다.
  function weightedPick(pool) {
    var rig = getRig();
    if (!rig || pool.indexOf(rig.date) < 0) {
      return pool[Math.floor(Math.random() * pool.length)];
    }
    var n = pool.length;
    if (n === 1) return pool[0];

    // win 은 약 75%, lose 는 약 3% 로 맞춘다. 나머지 날은 서로 같은 무게다.
    var p = rig.mode === "win" ? 0.75 : 0.03;
    var w = p * (n - 1) / (1 - p);
    var total = w + (n - 1);
    var r = Math.random() * total;
    for (var i = 0; i < n; i += 1) {
      var weight = pool[i] === rig.date ? w : 1;
      if (r < weight) return pool[i];
      r -= weight;
    }
    return pool[n - 1];
  }

  // 훑는 중에 조건을 바꾸면 예약된 tick 이 남아서 옛 목표로 결과를 띄운다.
  // 설정이 바뀔 때마다 진행 중인 연출을 끊는다.
  // clearRoll 은 아래 뽑기 절에 있다. 함수 선언은 호이스팅되므로 순서는 상관없다.
  function stopRoll() {
    if (rolling) { clearTimeout(rolling); rolling = null; }
    clearRoll();
  }

  function repaint() {
    stopRoll();
    paintCells();
    refresh();
  }

  // ── 토스트 ────────────────────────────────────────────────
  //
  // 화면에 상주하는 안내문으로 두면 평소에도 자리를 차지한다.
  // 눌렀을 때만 잠깐 띄운다.

  var toastEl = null;
  var toastTimer = null;

  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "dp-toast";
      toastEl.setAttribute("role", "status");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.remove("show");
    void toastEl.offsetWidth;
    toastEl.classList.add("show");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 1900);
  }

  // ── 뽑기 ──────────────────────────────────────────────────

  function cellOf(s) {
    return elMonths.querySelector('.dp-cell[data-date="' + s + '"]');
  }

  function clearRoll() {
    var on = elMonths.querySelectorAll(".dp-cell.rolling");
    for (var i = 0; i < on.length; i += 1) on[i].classList.remove("rolling");
  }

  function show(date, poolSize) {
    var d = parse(date);
    elPickedDow.textContent = d.getMonth() + 1 + "월 " + d.getDate() + "일";
    elPicked.textContent = DOW[d.getDay()] + "요일";
    var bits = [];
    if (HOLIDAYS[date]) bits.push(HOLIDAYS[date]);
    bits.push("고른 " + poolSize + "일 중 하나");
    elPickedNote.textContent = bits.join(" · ");

    if (elWeather) {
      var wx = WEATHER[date];
      if (wx) {
        var parts = [];
        if (wx.sky) parts.push(wx.sky);
        if (wx.pop !== null && wx.pop !== undefined) parts.push("강수확률 " + wx.pop + "%");
        if (wx.tmax !== null && wx.tmax !== undefined && wx.tmin !== null && wx.tmin !== undefined) {
          parts.push("최고 " + wx.tmax + "도 최저 " + wx.tmin + "도");
        }
        elWeather.innerHTML = parts.join(" · ") +
          '<span class="dp-wx-src">' + (WEATHER_REGION ? WEATHER_REGION + " 기준 " : "") + "기상청 예보</span>";
        elWeather.hidden = parts.length === 0;
      } else {
        elWeather.hidden = true;
      }
    }
    elResult.hidden = false;
    // 달력은 여기서 접는다. 훑는 동안에는 칸이 깜박이는 걸 봐야 하니 남겨둔다.
    if (elSetup) elSetup.hidden = true;

    // 클래스를 떼고 리플로우를 강제한 뒤 다시 붙여야 다시 뽑을 때도 재생된다.
    elResult.classList.remove("in");
    void elResult.offsetWidth;
    elResult.classList.add("in");

    var cell = cellOf(date);
    if (cell) {
      var prev = elMonths.querySelectorAll(".dp-cell.picked");
      for (var i = 0; i < prev.length; i += 1) prev[i].classList.remove("picked");
      cell.classList.add("picked");
    }
  }

  function run() {
    stopRoll();
    // 다시 뽑기는 후보를 그대로 두고 다시 돌린다. 방금 뽑힌 날을 빼면
    // 확률이 몰래 달라지고, 안 되는 날을 빼는 일은 '이 날은 안 돼요'가 맡는다.
    var pool = candidates();
    var list = pool;
    if (!pool.length) return;

    var target = weightedPick(pool);

    if (reduceMotion || pool.length === 1) {
      if (list.length === 1) toast("하루만 골랐습니다");
      lastPicked = target;
      show(target, list.length);
      repaint();
      return;
    }

    // 후보 칸을 훑다가 감속하며 멈춘다. 결과는 이미 정해져 있고 연출만 한다.
    // 접혀 있던 달력을 다시 펼쳐야 어느 칸을 훑는지 보인다.
    elResult.hidden = true;
    if (elSetup) elSetup.hidden = false;
    elPick.disabled = true;
    clearRoll();

    // 총 4.9~6.6초. 스텝 수를 늘려서 빠르게 훑는 구간을 길게 두고, 배율은
    // 1.10 으로 낮췄다. 배율을 높이면 총 시간은 같아도 마지막 한 칸에서만
    // 1초 가까이 멈춰 있어서 이미 끝난 것처럼 보인다.
    var order = pool.slice();
    var steps = 30 + Math.floor(Math.random() * 4);
    var i = 0;
    var wait = 30;

    function tick() {
      clearRoll();
      var s = order[i % order.length];
      var cell = cellOf(s);
      if (cell) cell.classList.add("rolling");
      i += 1;

      if (i >= steps) {
        rolling = setTimeout(function () {
          clearRoll();
          lastPicked = target;
          show(target, list.length);
          elPick.disabled = false;
          repaint();
        }, wait);
        return;
      }
      wait = Math.round(wait * 1.10);
      rolling = setTimeout(tick, wait);
    }

    // 마지막에 목표 칸에서 멈추도록 순서를 맞춘다.
    var at = order.indexOf(target);
    if (at >= 0) {
      var shift = (at - ((steps - 1) % order.length) + order.length * 2) % order.length;
      order = order.slice(shift).concat(order.slice(0, shift));
    }
    tick();
  }

  // ── 배선 ──────────────────────────────────────────────────

  function setRange(weeks) {
    var today = iso(new Date());
    elFrom.value = addDays(today, 1);
    elTo.value = addDays(today, weeks * 7);
  }

  document.getElementById("dp-presets").addEventListener("click", function (e) {
    var b = e.target.closest("[data-weeks]");
    if (!b) return;
    var btns = this.querySelectorAll("[data-weeks]");
    for (var i = 0; i < btns.length; i += 1) btns[i].classList.toggle("on", btns[i] === b);
    setRange(+b.dataset.weeks);
    lastPicked = null;
    elResult.hidden = true;
    renderMonths();
    refresh();
  });

  [elFrom, elTo].forEach(function (el) {
    el.addEventListener("change", function () {
      // 시작이 종료보다 늦으면 종료를 끌어당긴다. 빈 달력을 보여주는 것보다 낫다.
      if (elFrom.value && elTo.value && elFrom.value > elTo.value) {
        if (el === elFrom) elTo.value = elFrom.value;
        else elFrom.value = elTo.value;
      }
      var p = document.getElementById("dp-presets").querySelectorAll(".on");
      for (var i = 0; i < p.length; i += 1) p[i].classList.remove("on");
      lastPicked = null;
      elResult.hidden = true;
      renderMonths();
      refresh();
    });
  });

  // 빠른 선택. 한 번 누르면 그 조건의 날을 다 담고, 이미 다 담겨 있으면 다 뺀다.
  // 담기만 하면 잘못 누른 것을 되돌릴 방법이 없다.
  function matchSet(set, date) {
    var d = dowOf(date);
    if (set === "all") return true;
    if (set === "holiday") return !!HOLIDAYS[date];
    if (set === "weekend") return d === 0 || d === 6;
    if (set === "fri-sat") return d === 5 || d === 6;
    return d >= 1 && d <= 5;   // weekday
  }

  document.getElementById("dp-quick").addEventListener("click", function (e) {
    var b = e.target.closest("[data-set]");
    if (!b) return;
    var from = elFrom.value, to = elTo.value;
    if (!from || !to || from > to) return;

    var hit = [];
    eachDay(from, to, function (d) { if (matchSet(b.dataset.set, d)) hit.push(d); });
    if (!hit.length) return;

    var allOn = hit.every(function (d) { return selected[d]; });
    hit.forEach(function (d) {
      if (allOn) delete selected[d];
      else selected[d] = true;
    });
    repaint();
  });

  elMonths.addEventListener("click", function (e) {
    var c = e.target.closest(".dp-cell[data-date]");
    if (!c || c.disabled) return;
    var s = c.dataset.date;
    if (rejected[s]) {
      // 뺀 날을 누르면 먼저 되살린다. 바로 선택 해제되면 두 번 눌러야 한다.
      delete rejected[s];
    } else if (selected[s]) {
      delete selected[s];
    } else {
      selected[s] = true;
    }
    repaint();
  });

  if (elClear) {
    elClear.addEventListener("click", function () {
      selected = {};
      rejected = {};
      lastPicked = null;
      elResult.hidden = true;
      repaint();
    });
  }

  if (elReject) {
    elReject.addEventListener("click", function () {
      if (!lastPicked) return;
      rejected[lastPicked] = true;
      lastPicked = null;
      var left = candidates();
      if (!left.length) {
        elResult.hidden = true;
      elResult.classList.remove("in");
        if (elSetup) elSetup.hidden = false;
        repaint();
        toast("남은 날이 없습니다");
        return;
      }
      repaint();
      run();
    });
  }

  var elEdit = document.getElementById("dp-edit");
  if (elEdit) {
    elEdit.addEventListener("click", function () {
      stopRoll();
      elResult.hidden = true;
      elResult.classList.remove("in");
      if (elSetup) elSetup.hidden = false;
      refresh();
    });
  }

  if (elRigSel) {
    elRigSel.addEventListener("change", function () {
      if (elRigBadge) elRigBadge.hidden = !elRigSel.value;
    });
  }

  elPick.addEventListener("click", run);
  document.getElementById("dp-again").addEventListener("click", run);

  document.getElementById("dp-copy").addEventListener("click", function () {
    if (!lastPicked) return;
    var btn = this;
    var d = parse(lastPicked);
    var line = d.getFullYear() + "년 " + (d.getMonth() + 1) + "월 " + d.getDate() + "일 " +
      DOW[d.getDay()] + "요일" + (HOLIDAYS[lastPicked] ? " (" + HOLIDAYS[lastPicked] + ")" : "");
    var original = btn.textContent;
    navigator.clipboard.writeText(line).then(function () {
      btn.textContent = "복사됨";
      setTimeout(function () { btn.textContent = original; }, 1800);
    });
  });

  setRange(4);
  renderMonths();
  refresh();
})();
