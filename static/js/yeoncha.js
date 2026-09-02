// 연차 계산기.
//
// 공휴일 사이의 평일에 연차를 놓아 이어 쉬는 기간을 만든다. 사람이 손으로 하던
// "이 공휴일이 무슨 요일이고, 앞뒤에 하루 붙이면 며칠인가" 계산을 대신한다.
//
// 공휴일은 직접 계산하지 않고 특일 정보 API 값을 그대로 쓴다. 대체공휴일 규칙에
// 예외가 있어서다. 2027년 현충일은 일요일인데 대체공휴일이 없다.

(function () {
  "use strict";

  var app = document.getElementById("yc-app");
  if (!app) return;

  var DATA = JSON.parse(document.getElementById("yc-data").textContent);
  var YEARS = Object.keys(DATA).map(Number).sort(function (a, b) { return b - a; });
  var DOW = "일월화수목금토";

  // 트립닷컴 제휴 코드. 파라미터 이름은 대시보드가 만들어 준 링크에서 확인한 것이다.
  // allianceId/sid 가 비면 일반 검색 링크로 나가고 "제휴 링크 포함" 표시도 붙지 않는다.
  var AFFILIATE = { allianceId: "10396443", sid: "330109774", sub3: "D19651648" };

  // 연휴 길이에 따라 갈 수 있는 거리가 갈린다. 이 서비스의 값어치가 그 판단에 있다.
  var TRIPS = [
    { min: 7, max: 99, label: "장거리", desc: "유럽, 미주",
      cities: [["par", "파리"], ["rom", "로마"], ["bcn", "바르셀로나"]] },
    { min: 5, max: 6, label: "중거리", desc: "동남아, 일본 지방 도시",
      cities: [["bkk", "방콕"], ["dad", "다낭"], ["sin", "싱가포르"]] },
    { min: 3, max: 4, label: "근거리", desc: "일본, 대만",
      cities: [["osa", "오사카"], ["fuk", "후쿠오카"], ["tpe", "타이베이"]] }
  ];

  var state = { year: YEARS[0], leave: 15, touched: false, mode: "long", screen: "home", detail: null, picks: [] };
  var days = [];      // 선택된 연도의 날짜 배열
  var baseRest = [];  // 연차 없이 쉬는 날
  var calcCache = null;

  function $(id) { return document.getElementById(id); }

  // ── 연도 데이터 준비 ──────────────────────────────────────────────

  function buildYear(year) {
    var hol = {};
    DATA[year].forEach(function (h) { hol[h.date] = h.name; });

    days = [];
    var d = new Date(year, 0, 1);
    while (d.getFullYear() === year) {
      var m = d.getMonth() + 1, dd = d.getDate(), dow = d.getDay();
      var key = year + "-" + (m < 10 ? "0" : "") + m + "-" + (dd < 10 ? "0" : "") + dd;
      days.push({
        i: days.length, m: m, d: dd, dow: dow, hol: hol[key] || null,
        base: dow === 0 || dow === 6 || !!hol[key]
      });
      d.setDate(dd + 1);
    }
    baseRest = days.map(function (x) { return x.base; });
    calcCache = null;
  }

  function fmt(i) {
    var x = days[i];
    return x.m + "월 " + x.d + "일(" + DOW[x.dow] + ")";
  }

  function shortFmt(i) {
    var x = days[i];
    return x.m + "/" + x.d;
  }

  // 연속으로 쉬는 구간을 뽑는다.
  function runs(rest) {
    var out = [], s = -1;
    for (var i = 0; i < rest.length; i += 1) {
      if (rest[i]) { if (s < 0) s = i; }
      else if (s >= 0) { out.push({ s: s, e: i - 1, len: i - s }); s = -1; }
    }
    if (s >= 0) out.push({ s: s, e: rest.length - 1, len: rest.length - s });
    return out;
  }

  // ── 배치 계산 ────────────────────────────────────────────────────

  // 연차를 한 장씩 놓아 본다. 매번 "지금 한 장을 어디에 놓으면 가장 이득인가"를
  // 전체에서 다시 고른다. 최적해를 보장하지는 않지만, 사람이 실제로 하는 판단과
  // 결과가 같고 365칸이라 즉시 끝난다.
  function calc(leave, mode) {
    var rest = baseRest.slice();
    var isLeave = new Array(days.length).fill(false);
    var left = leave;
    // 한 연휴에 연차를 몇 장까지 몰아줄지. 긴 연휴 우선이면 3장까지 허용한다.
    var cap = mode === "long" ? 3 : 2;

    while (left > 0) {
      var best = null;
      for (var i = 0; i < days.length; i += 1) {
        if (rest[i]) continue;
        var a = i, b = i;
        while (a > 0 && rest[a - 1]) a -= 1;
        while (b < days.length - 1 && rest[b + 1]) b += 1;
        var len = b - a + 1;
        var used = 1;
        for (var j = a; j <= b; j += 1) if (isLeave[j]) used += 1;
        // 연차만 이어 붙인 구간(효율 2.5 미만)은 쉬는 게 아니라 그냥 연차 소모다.
        if (used > cap || len < 4 || len / used < 2.5) continue;
        var score = mode === "long" ? len * 100 + len / used : (len / used) * 100 + len;
        if (!best || score > best.score) best = { i: i, score: score };
      }
      if (!best) break;
      rest[best.i] = true;
      isLeave[best.i] = true;
      left -= 1;
    }

    var blocks = runs(rest).map(function (bl) {
      var lvs = [];
      for (var j = bl.s; j <= bl.e; j += 1) if (isLeave[j]) lvs.push(j);
      return { s: bl.s, e: bl.e, len: bl.len, lvs: lvs };
    });
    return { rest: rest, isLeave: isLeave, blocks: blocks, used: leave - left };
  }

  function current() {
    if (!calcCache) calcCache = calc(state.touched ? state.leave : 0, state.mode);
    return calcCache;
  }

  // 연차 몇 개를 추가로 놓았을 때 이어지는 총 길이
  function extLen(adds) {
    var a = Math.min.apply(null, adds), b = Math.max.apply(null, adds);
    while (a > 0 && (baseRest[a - 1] || adds.indexOf(a - 1) >= 0)) a -= 1;
    while (b < days.length - 1 && (baseRest[b + 1] || adds.indexOf(b + 1) >= 0)) b += 1;
    return b - a + 1;
  }

  function sumBlocks(rest) {
    return runs(rest).filter(function (b) { return b.len >= 3; })
      .reduce(function (s, b) { return s + b.len; }, 0);
  }

  // 대체공휴일 이름은 대표 이름으로 쓰지 않는다. "대체공휴일(설날)" 대신 "설날".
  function mainName(bl) {
    var names = [];
    for (var j = bl.s; j <= bl.e; j += 1) {
      var h = days[j].hol;
      if (h && names.indexOf(h) < 0) names.push(h);
    }
    var pick = names.filter(function (n) { return n.indexOf("대체") < 0; })[0] || names[0] || "";
    return pick.replace(/\(.+\)/, "");
  }

  // 공휴일이 하나라도 든 구간만 "연휴"로 본다. 그냥 주말은 카드로 만들지 않는다.
  function holidayBlocks() {
    return runs(baseRest).filter(function (bl) {
      for (var j = bl.s; j <= bl.e; j += 1) if (days[j].hol) return true;
      return false;
    });
  }

  // ── 그리기 ───────────────────────────────────────────────────────

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function renderYears() {
    var box = $("yc-years");
    box.innerHTML = "";
    YEARS.forEach(function (y) {
      var b = el("button", y === state.year ? "on" : "", String(y));
      b.type = "button";
      b.addEventListener("click", function () {
        if (y === state.year) return;
        state.year = y;
        state.detail = null;
        buildYear(y);
        render();
      });
      box.appendChild(b);
    });
  }

  function renderResult() {
    var c = current();
    var effLeave = state.touched ? state.leave : 0;
    var total = sumBlocks(c.rest);

    $("yc-untouched").hidden = state.touched;
    $("yc-result").hidden = !state.touched;
    if (!state.touched) return;

    $("yc-r-leave").textContent = effLeave;
    $("yc-r-used").textContent = c.used;
    $("yc-r-used2").textContent = c.used;
    $("yc-r-remain").textContent = effLeave - c.used;
    $("yc-r-total").textContent = total;
    $("yc-r-base").textContent = sumBlocks(baseRest);

    var recs = c.blocks.filter(function (b) { return b.lvs.length; })
      .sort(function (a, b) { return b.len - a.len; });

    var ul = $("yc-recs");
    ul.innerHTML = "";
    if (!recs.length) {
      ul.appendChild(el("li", "yc-rec-none", "붙여 쓸 자리가 없습니다. 연차를 늘려 보세요."));
      return;
    }
    recs.forEach(function (b) {
      var li = el("li", "yc-rec");
      var main = el("div", "yc-rec-main");
      main.appendChild(el("div", "yc-rec-title", b.lvs.map(fmt).join(" + ")));
      main.appendChild(el("div", "yc-rec-sub",
        fmt(b.s) + " ~ " + fmt(b.e) + " · 연차 " + b.lvs.length + "일"));
      li.appendChild(main);
      li.appendChild(el("div", "yc-rec-len", b.len + "일"));
      ul.appendChild(li);
    });
  }

  function renderCards() {
    var c = current();
    var blocks = holidayBlocks();
    var today = new Date();
    // "다음 연휴"는 오늘 이후로 처음 오는 것. 지난 연도를 보면 아무것도 안 붙는다.
    var nextIdx = -1;
    for (var k = 0; k < blocks.length; k += 1) {
      var end = new Date(state.year, days[blocks[k].e].m - 1, days[blocks[k].e].d);
      if (end >= today) { nextIdx = k; break; }
    }

    $("yc-cards-title").textContent = state.year + "년 연휴";
    var host = $("yc-cards");
    host.innerHTML = "";

    blocks.forEach(function (bl, idx) {
      var withLeave = c.blocks.filter(function (b) { return b.s <= bl.e && b.e >= bl.s; })[0] || bl;
      var rec = !!(withLeave.lvs && withLeave.lvs.length);
      var show = rec ? withLeave : bl;

      var main = mainName(bl);

      var card = el("section", "yc-holi" + (rec ? " rec" : ""));
      card.setAttribute("role", "button");
      card.tabIndex = 0;

      var head = el("div", "yc-holi-head");
      var left = el("div", "yc-holi-left");
      var titleRow = el("div", "yc-holi-title");
      titleRow.appendChild(el("span", "yc-holi-name", main + (show.len >= 3 ? " 연휴" : "")));
      if (idx === nextIdx) titleRow.appendChild(el("span", "yc-tag next", "다음 연휴"));
      if (rec) titleRow.appendChild(el("span", "yc-tag rec", "추천 포함"));
      left.appendChild(titleRow);
      left.appendChild(el("div", "yc-holi-span", fmt(show.s) + " ~ " + fmt(show.e)));
      head.appendChild(left);
      head.appendChild(el("div", "yc-holi-len", show.len + "일"));
      card.appendChild(head);

      // 요일 띠. "화요일에 시작하는 3일"과 "토요일에 시작하는 3일"은 체감이 달라서,
      // 숫자만으로는 전달되지 않는다.
      var strip = el("div", "yc-strip");
      var from = Math.max(0, show.s - 1), to = Math.min(days.length - 1, show.e + 1);
      for (var q = from; q <= to; q += 1) {
        var on = rec ? c.rest[q] : baseRest[q];
        var lv = rec ? c.isLeave[q] : false;
        var cell = el("div", "yc-cell" + (lv ? " leave" : on ? " off" : ""));
        cell.appendChild(el("span", "yc-cell-w", DOW[days[q].dow]));
        cell.appendChild(el("span", "yc-dot"));
        cell.appendChild(el("span", "yc-cell-d", String(days[q].d)));
        strip.appendChild(cell);
      }
      card.appendChild(strip);

      if (!rec) {
        var sugs = [];
        var f = bl.s - 1, b2 = bl.e + 1;
        if (f >= 0 && !baseRest[f]) sugs.push({ day: fmt(f), len: extLen([f]) });
        if (b2 < days.length && !baseRest[b2]) sugs.push({ day: fmt(b2), len: extLen([b2]) });
        if (sugs.length) {
          var box = el("div", "yc-sugs");
          sugs.forEach(function (s) {
            var p = el("div", "yc-sug");
            p.innerHTML = "<b></b>에 연차를 쓰면 → <strong></strong>";
            p.querySelector("b").textContent = s.day;
            p.querySelector("strong").textContent = s.len + "일";
            box.appendChild(p);
          });
          card.appendChild(box);
        }
      }

      card.appendChild(el("div", "yc-holi-more", "항공편과 연차 조합 보기 →"));

      function open() { state.detail = idx; state.picks = []; go("detail"); }
      card.addEventListener("click", open);
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
      host.appendChild(card);
    });
  }

  function renderDetail() {
    var blocks = holidayBlocks();
    var bl = blocks[state.detail];
    if (!bl) { go("home"); return; }

    var name = mainName(bl);
    $("yc-d-name").textContent = name + " 연휴";
    $("yc-d-len").textContent = bl.len + "일";
    $("yc-d-span").textContent = fmt(bl.s) + " ~ " + fmt(bl.e);

    // 고른 연차를 얹은 상태에서 이어지는 구간을 다시 잰다.
    var picked = state.picks.slice().sort(function (a, b) { return a - b; });
    var rest = baseRest.slice();
    picked.forEach(function (i) { rest[i] = true; });
    var ra = bl.s, rb = bl.e;
    while (ra > 0 && rest[ra - 1]) ra -= 1;
    while (rb < days.length - 1 && rest[rb + 1]) rb += 1;

    var has = picked.length > 0;
    $("yc-pick-hint").hidden = has;
    $("yc-pick-sel").hidden = !has;
    $("yc-pick-span").hidden = !has;
    $("yc-clear").hidden = !has;
    if (has) {
      $("yc-pick-sel").innerHTML = "연차 <em>" + picked.length + "일</em> → <strong>"
        + (rb - ra + 1) + "일 연휴</strong>";
      $("yc-pick-span").textContent = fmt(ra) + " ~ " + fmt(rb);
    }

    // 연휴 앞뒤로 여유를 두고 주 단위로 잘라 달력을 만든다. 월 경계를 넘을 수 있다.
    var ws = Math.max(0, Math.min(bl.s, ra) - 3);
    ws -= days[ws].dow;
    if (ws < 0) ws = 0;
    var we = Math.min(days.length - 1, Math.max(bl.e, rb) + 3);
    we += 6 - days[we].dow;
    if (we > days.length - 1) we = days.length - 1;

    var mA = days[ws].m, mB = days[we].m;
    $("yc-d-month").textContent = mA === mB ? mA + "월" : mA + "월 ~ " + mB + "월";

    var cal = $("yc-d-cal");
    cal.innerHTML = "";
    for (var k = 0; k < days[ws].dow; k += 1) cal.appendChild(el("div", "yc-day pad"));
    for (var j = ws; j <= we; j += 1) {
      var isPick = picked.indexOf(j) >= 0;
      var inRun = j >= ra && j <= rb && rest[j];
      var canPick = !baseRest[j];
      var cls = "yc-day"
        + (isPick ? " pick" : inRun ? " in" : baseRest[j] ? " off" : "")
        + (canPick && !isPick ? " open" : "");
      var cell = el("div", cls, days[j].d === 1 ? days[j].m + "/1" : String(days[j].d));
      cell.title = fmt(j) + (days[j].hol ? " · " + days[j].hol : "");
      if (canPick) {
        cell.setAttribute("role", "button");
        cell.tabIndex = 0;
        (function (idx) {
          function toggle() {
            var at = state.picks.indexOf(idx);
            if (at >= 0) state.picks.splice(at, 1);
            else state.picks.push(idx);
            renderDetail();
          }
          cell.addEventListener("click", toggle);
          cell.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
          });
        }(j));
      }
      cal.appendChild(cell);
    }

    renderTiers(bl, name);
  }

  // 연휴마다 연차를 몇 장 쓰면 어느 거리가 열리는지 계산한다. 연도가 바뀌어도
  // 그대로 동작해야 해서 표로 박지 않고 매번 구한다.
  function tiersFor(bl) {
    function grab(from, dir, n) {
      var arr = [], j = from;
      while (arr.length < n) {
        if (j < 0 || j >= days.length || baseRest[j]) return null;
        arr.push(j);
        j += dir;
      }
      return arr;
    }
    function spanOf(adds) {
      var a = adds.length ? Math.min.apply(null, adds) : bl.s;
      var b = adds.length ? Math.max.apply(null, adds) : bl.e;
      while (a > 0 && (baseRest[a - 1] || adds.indexOf(a - 1) >= 0)) a -= 1;
      while (b < days.length - 1 && (baseRest[b + 1] || adds.indexOf(b + 1) >= 0)) b += 1;
      return [a, b];
    }

    var byLen = {};
    byLen[bl.len] = { cost: 0, span: [bl.s, bl.e] };
    for (var f = 0; f <= 3; f += 1) {
      for (var b = 0; b <= 3; b += 1) {
        if (f + b === 0) continue;
        var fa = f ? grab(bl.s - 1, -1, f) : [];
        var ba = b ? grab(bl.e + 1, 1, b) : [];
        if (fa === null || ba === null) continue;
        var adds = fa.concat(ba);
        var sp = spanOf(adds);
        var L = sp[1] - sp[0] + 1;
        // 같은 길이를 만드는 방법이 여러 개면 연차가 덜 드는 쪽을 남긴다.
        if (!byLen[L] || f + b < byLen[L].cost) byLen[L] = { cost: f + b, span: sp };
      }
    }

    var out = [], taken = {};
    Object.keys(byLen).map(Number).sort(function (a, b) { return a - b; })
      .forEach(function (L) {
        var t = tripFor(L);
        if (!t || taken[t.label]) return;
        taken[t.label] = true;
        out.push({ trip: t, len: L, cost: byLen[L].cost, span: byLen[L].span });
      });
    return out;
  }

  function renderTiers(bl, name) {
    var tiers = tiersFor(bl);

    // 그 해에서 장거리를 가장 적은 연차로 여는 연휴에 표시를 준다.
    var best = null;
    holidayBlocks().forEach(function (b) {
      tiersFor(b).forEach(function (t) {
        if (t.trip.min < 7) return;
        if (!best || t.cost < best.cost) best = { name: mainName(b), cost: t.cost, len: t.len };
      });
    });
    var isBest = best && best.name === name;
    $("yc-d-best").hidden = !isBest;
    if (isBest) {
      $("yc-d-best").querySelector("span").textContent =
        "연차 " + best.cost + "일로 " + best.len + "일까지 늘어나는 유일한 연휴입니다";
    }

    var host = $("yc-d-trips");
    host.innerHTML = "";
    tiers.forEach(function (t) {
      var card = el("div", "yc-tier");

      var head = el("div", "yc-tier-head");
      var cost = el("div", "yc-tier-cost");
      if (t.cost === 0) {
        cost.className += " free";
        cost.innerHTML = "연차<br>없이";
      } else {
        cost.innerHTML = "<b>" + t.cost + "</b>일<em>연차 필요</em>";
      }
      head.appendChild(cost);

      var meta = el("div", "yc-tier-meta");
      var title = el("div", "yc-tier-title", t.trip.label + " ");
      title.appendChild(el("span", "yc-tier-desc", t.trip.desc));
      meta.appendChild(title);
      meta.appendChild(el("div", "yc-tier-span", shortFmt(t.span[0]) + " ~ " + shortFmt(t.span[1])));
      head.appendChild(meta);
      head.appendChild(el("div", "yc-tier-len", t.len + "일"));
      card.appendChild(head);

      var grid = el("div", "yc-cities");
      t.trip.cities.forEach(function (pair) {
        var a = document.createElement("a");
        a.href = flightLink(pair[0], t.span[0], t.span[1],
          "detail-" + t.len + "d-" + pair[0]);
        a.target = "_blank";
        a.rel = "nofollow sponsored noopener";
        a.className = "yc-city";

        var box = el("div", "yc-city-img");
        var img = document.createElement("img");
        img.src = "/images/cities/" + pair[0] + ".jpg";
        img.alt = pair[1];
        img.loading = "lazy";
        box.appendChild(img);
        a.appendChild(box);
        a.appendChild(el("span", "yc-city-name", pair[1]));
        grid.appendChild(a);
      });
      card.appendChild(grid);
      host.appendChild(card);
    });
    $("yc-d-trips-box").hidden = tiers.length === 0;
    $("yc-d-badge").hidden = !AFFILIATE.allianceId;
  }

  function renderYearGrid() {
    var c = current();
    $("yc-year-title").textContent = state.year + "년 전체";
    $("yc-year-note").textContent = "연차 추천은 계산 화면의 설정(연차 "
      + (state.touched ? state.leave : 0) + "일, "
      + (state.mode === "long" ? "긴 연휴 우선" : "자주 쉬기") + ")을 따릅니다.";

    var host = $("yc-year-grid");
    host.innerHTML = "";

    // 날짜 눈금. 색칸만 있으면 그게 며칠인지 알 수 없다.
    var head = el("div", "yc-yrow yc-yhead");
    head.appendChild(el("span", "yc-ylabel"));
    var scale = el("div", "yc-ygrid");
    for (var t = 1; t <= 31; t += 1) {
      // 31칸을 다 적으면 좁은 화면에서 뭉개진다. 5일 단위만 남긴다.
      scale.appendChild(el("span", "yc-ytick", t === 1 || t % 5 === 0 ? String(t) : ""));
    }
    head.appendChild(scale);
    host.appendChild(head);

    var byMonth = {};
    for (var m = 1; m <= 12; m += 1) {
      var row = el("div", "yc-yrow");
      row.appendChild(el("span", "yc-ylabel", m + "월"));
      var grid = el("div", "yc-ygrid");
      for (var d = 1; d <= 31; d += 1) {
        var day = null;
        for (var i = 0; i < days.length; i += 1) {
          if (days[i].m === m && days[i].d === d) { day = days[i]; break; }
        }
        if (!day) { grid.appendChild(el("span", "yc-ycell pad")); continue; }

        var isLv = c.isLeave[day.i];
        var cls = isLv ? "leave" : day.hol ? "hol" : day.base ? "wk" : "";
        // 연차 칸에는 날짜를 적는다. 여기가 실제로 행동해야 하는 칸이다.
        var cell = el("span", "yc-ycell " + cls, isLv ? String(d) : "");
        var what = isLv ? "연차 추천" : day.hol ? day.hol : day.dow === 0 || day.dow === 6 ? "주말" : "평일";
        cell.title = m + "월 " + d + "일(" + DOW[day.dow] + ") · " + what;
        grid.appendChild(cell);

        if (isLv) {
          if (!byMonth[m]) byMonth[m] = [];
          byMonth[m].push(d + "일(" + DOW[day.dow] + ")");
        }
      }
      row.appendChild(grid);
      host.appendChild(row);
    }

    // 좁은 화면에서는 칸이 10px 안쪽이라 숫자가 안 들어간다. 글로 한 번 더 적는다.
    var list = $("yc-year-days");
    list.innerHTML = "";
    var months = Object.keys(byMonth);
    if (!months.length) {
      list.appendChild(el("p", "yc-rec-none",
        state.touched ? "추천할 자리가 없습니다." : "계산 화면에서 연차 개수를 정하면 여기에 날짜가 나옵니다."));
      return;
    }
    months.forEach(function (mm) {
      var row = el("div", "yc-yday");
      row.appendChild(el("span", "yc-yday-m", mm + "월"));
      row.appendChild(el("span", "yc-yday-d", byMonth[mm].join(" · ")));
      list.appendChild(row);
    });
  }

  function iso(i) {
    var x = days[i];
    return state.year + "-" + (x.m < 10 ? "0" : "") + x.m + "-" + (x.d < 10 ? "0" : "") + x.d;
  }

  // 며칠이면 어디까지 가느냐. 연차를 하루 더 쓸지 판단하는 근거가 된다.
  function tripFor(len) {
    for (var i = 0; i < TRIPS.length; i += 1) {
      if (len >= TRIPS[i].min && len <= TRIPS[i].max) return TRIPS[i];
    }
    return null;
  }

  // slot 은 어느 자리에서 눌렀는지 남기는 값이다. trip_sub1 이 그 용도로 비어 있어서,
  // 대시보드에서 홈과 상세, 거리 단계별 성과를 나눠 볼 수 있다.
  function flightLink(city, from, to, slot) {
    var q = "dcity=sel&acity=" + city + "&ddate=" + iso(from) + "&rdate=" + iso(to)
      + "&triptype=rt&class=y&quantity=1&locale=ko-KR&curr=KRW";
    if (AFFILIATE.allianceId) {
      q += "&Allianceid=" + AFFILIATE.allianceId + "&SID=" + AFFILIATE.sid
        + "&trip_sub1=" + encodeURIComponent(slot || "")
        + "&trip_sub3=" + AFFILIATE.sub3;
    }
    return "https://kr.trip.com/flights/showfarefirst?" + q;
  }

  // 연휴 길이별로 그 해에 실제 있는 가장 긴 구간을 골라 날짜가 채워진 링크를 만든다.
  // "9일이면 유럽" 같은 말만 두면 사용자가 날짜를 다시 찾아 넣어야 한다.
  function renderTrips() {
    var c = current();
    var blocks = c.blocks.filter(function (b) { return b.len >= 3; })
      .sort(function (a, b) { return b.len - a.len; });

    var host = $("yc-trips");
    host.innerHTML = "";
    var used = {};
    var shown = 0;

    TRIPS.forEach(function (t) {
      // 길이 구간이 맞는 것 중 가장 긴 것. 하한만 보면 근거리 줄에 6일 연휴가 붙는다.
      var hit = null;
      for (var i = 0; i < blocks.length; i += 1) {
        var b = blocks[i];
        if (b.len < t.min || b.len > t.max || used[b.s]) continue;
        hit = b;
        break;
      }
      if (!hit) return;
      used[hit.s] = true;
      shown += 1;

      var row = el("li", "yc-trip");
      var head = el("div", "yc-trip-head");
      head.appendChild(el("span", "yc-days", hit.len + "일"));
      var meta = el("div", "yc-trip-meta");
      meta.appendChild(el("div", "yc-trip-desc", t.label + " · " + t.desc));
      meta.appendChild(el("div", "yc-trip-date", shortFmt(hit.s) + " ~ " + shortFmt(hit.e)));
      head.appendChild(meta);
      row.appendChild(head);

      var links = el("div", "yc-trip-links");
      t.cities.forEach(function (pair) {
        var a = document.createElement("a");
        a.href = flightLink(pair[0], hit.s, hit.e, "home-" + hit.len + "d-" + pair[0]);
        a.target = "_blank";
        a.rel = "nofollow sponsored noopener";
        a.textContent = pair[1];
        links.appendChild(a);
      });
      row.appendChild(links);
      host.appendChild(row);
    });

    $("yc-trips-box").hidden = shown === 0;
    $("yc-trips-badge").hidden = !AFFILIATE.allianceId;
  }

  function render() {
    renderYears();
    $("yc-leave").value = state.leave;
    $("yc-leave-val").textContent = state.leave;
    renderResult();
    renderCards();
    renderTrips();
    if (state.screen === "detail") renderDetail();
    if (state.screen === "year") renderYearGrid();
  }

  function go(screen) {
    state.screen = screen;
    ["home", "detail", "year", "about"].forEach(function (s) {
      $("yc-" + s).hidden = s !== screen;
    });
    Array.prototype.forEach.call($("yc-nav").children, function (b) {
      var on = b.dataset.screen === screen || (screen === "detail" && b.dataset.screen === "home");
      b.classList.toggle("on", on);
    });
    if (screen === "detail") renderDetail();
    if (screen === "year") renderYearGrid();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ── 공유 이미지 ──────────────────────────────────────────────────

  function share(w, h) {
    var c = current();
    var recs = c.blocks.filter(function (b) { return b.lvs.length; })
      .sort(function (a, b) { return b.len - a.len; });
    var cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    var x = cv.getContext("2d");

    x.fillStyle = "#0f1513"; x.fillRect(0, 0, w, h);
    var L = 80, top = h === 1080 ? 150 : 280;
    x.fillStyle = "#2cc08c";
    x.font = '700 42px system-ui, -apple-system, sans-serif';
    x.fillText(state.year + " 연차 계산", L, top);

    x.fillStyle = "#e6eeea";
    x.font = '800 82px system-ui, -apple-system, sans-serif';
    x.fillText("연차 " + c.used + "일로", L, top + 150);
    x.fillText("총 " + sumBlocks(c.rest) + "일을 쉽니다", L, top + 255);

    var y = top + 410;
    recs.slice(0, h === 1080 ? 4 : 6).forEach(function (r) {
      x.fillStyle = "#e6eeea";
      x.font = '600 38px system-ui, -apple-system, sans-serif';
      x.fillText(r.lvs.map(shortFmt).join(" + "), L, y);
      x.fillStyle = "#8fa098";
      x.font = '400 32px system-ui, -apple-system, sans-serif';
      x.fillText("→ " + r.len + "일  (" + shortFmt(r.s) + " ~ " + shortFmt(r.e) + ")", L, y + 48);
      y += 130;
    });

    x.fillStyle = "#2cc08c";
    x.font = '500 34px system-ui, -apple-system, sans-serif';
    x.fillText("simsim.importants-studio.com/yeoncha", L, h - 70);

    var a = document.createElement("a");
    a.download = "yeoncha-" + state.year + (h === 1920 ? "-story" : "") + ".png";
    a.href = cv.toDataURL("image/png");
    a.click();
  }

  // ── 연결 ─────────────────────────────────────────────────────────

  $("yc-leave").addEventListener("input", function (e) {
    state.leave = +e.target.value;
    state.touched = true;
    calcCache = null;
    render();
  });

  $("yc-start").addEventListener("click", function () {
    state.touched = true;
    calcCache = null;
    render();
  });

  $("yc-mode").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-mode]");
    if (!btn || btn.dataset.mode === state.mode) return;
    state.mode = btn.dataset.mode;
    calcCache = null;
    Array.prototype.forEach.call($("yc-mode").children, function (b) {
      b.classList.toggle("on", b === btn);
    });
    render();
  });

  $("yc-nav").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-screen]");
    if (btn) go(btn.dataset.screen);
  });

  $("yc-back").addEventListener("click", function () { go("home"); });
  $("yc-clear").addEventListener("click", function () { state.picks = []; renderDetail(); });
  $("yc-share-sq").addEventListener("click", function () { share(1080, 1080); });
  $("yc-share-story").addEventListener("click", function () { share(1080, 1920); });

  buildYear(state.year);
  render();
})();
