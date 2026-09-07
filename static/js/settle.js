// 정산 계산기.
//
// 모임이 끝나고 누가 누구에게 얼마를 보내야 하는지 정리한다. 총액을 인원으로
// 나누는 것만으로는 부족하다. 1차에는 다 있었고 2차에는 둘만 갔는데, 2차 비용을
// 전원이 나눠 내면 틀린 정산이다. 그래서 항목마다 참여자를 따로 받는다.
//
// 다른 서비스를 보고 가져온 것들이다.
//   카카오페이 정산하기  차수별 입력, 차수마다 참여자가 다름
//   계산모두나          절사와 물주(나머지를 한 사람이 먹기)
//   Simplewoody        누가 누구에게 보낼지 목록으로
//
// 이름과 금액은 주소에 싣지 않는다. 날짜 뽑기는 날짜뿐이라 링크로 공유할 수
// 있었지만 이름은 성격이 다르다. 대신 이 기기에만 저장해서 새로 고쳐도
// 사라지지 않게 한다. 공유는 결과 글 복사로만 한다.

(function () {
  "use strict";

  var app = document.getElementById("st-app");
  if (!app) return;

  var MAX_PEOPLE = 20;
  var MAX_ITEMS = 20;
  var MAX_AMOUNT = 100000000;   // 1억. 실수로 0 을 더 눌렀을 때를 막는다
  var STORE = "simsim.settle.v1";

  var $ = function (id) { return document.getElementById("st-" + id); };

  var elName = $("name"), elAddName = $("add-name");
  var elPeople = $("people"), elPeopleEmpty = $("people-empty");
  var elLabel = $("label"), elAmount = $("amount"), elPayer = $("payer");
  var elMembers = $("members"), elAddItem = $("add-item");
  var elItems = $("items"), elForm = $("item-form"), elLocked = $("locked");
  var elOpt = $("opt"), elOptNow = $("opt-now");
  var elUnit = $("unit"), elMode = $("mode");
  var elAbsorbBox = $("absorb-box"), elAbsorb = $("absorb"), elReroll = $("reroll");
  var elResult = $("result"), elTotal = $("total"), elMoves = $("moves");
  var elDetail = $("detail"), elNote = $("note"), elReset = $("reset");
  var elShareBox = document.querySelector(".share");

  var people = [];     // ["철수", ...]
  var items = [];      // [{label, amount, payer, members:[]}]
  var unit = 100;
  var mode = "split";  // split | one
  var pickIndex = null;   // one 모드에서 뽑힌 사람. null 이면 가장 많이 낸 사람

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function won(n) { return Math.round(n).toLocaleString("ko-KR") + "원"; }

  // ── 저장 ──────────────────────────────────────────────────
  //
  // 서버가 아니라 이 브라우저에만 남는다. 항목을 여럿 넣다가 새로 고치면
  // 처음부터 다시 넣어야 하는 게 이 도구에서 가장 아까운 일이다.

  function save() {
    try {
      localStorage.setItem(STORE, JSON.stringify({
        people: people, items: items, unit: unit, mode: mode, pickIndex: pickIndex,
      }));
    } catch (e) { /* 저장이 막혀 있어도 계산은 된다 */ }
  }

  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(STORE) || "null");
      if (!d || !Array.isArray(d.people)) return;
      people = d.people.slice(0, MAX_PEOPLE);
      items = (d.items || []).slice(0, MAX_ITEMS).filter(function (it) {
        return it && typeof it.amount === "number" && Array.isArray(it.members);
      });
      if ([1, 100, 1000].indexOf(d.unit) >= 0) unit = d.unit;
      if (d.mode === "one" || d.mode === "split") mode = d.mode;
      if (typeof d.pickIndex === "number") pickIndex = d.pickIndex;
    } catch (e) { /* 깨진 값이면 빈 상태로 시작한다 */ }
  }

  // ── 정산 ──────────────────────────────────────────────────

  function settle() {
    var paid = {}, owedExact = {};
    people.forEach(function (n) { paid[n] = 0; owedExact[n] = 0; });

    items.forEach(function (it) {
      if (paid[it.payer] !== undefined) paid[it.payer] += it.amount;
      var mem = it.members.filter(function (m) { return people.indexOf(m) >= 0; });
      if (!mem.length) return;
      var each = it.amount / mem.length;
      mem.forEach(function (m) { owedExact[m] += each; });
    });

    var total = items.reduce(function (s, it) { return s + it.amount; }, 0);

    // 총액이 단위로 나누어떨어지지 않으면 전원을 단위에 맞추면서 합을 총액과
    // 같게 만들 수 없다. 총액 91,200원에 1000원 단위면 불가능하다. 남는 것은
    // 누군가 먹어야 한다. 실제 모임에서는 낸 사람이 먹는다.
    var rows = people.map(function (n) {
      var base = Math.floor(owedExact[n] / unit) * unit;
      return { n: n, base: base, rem: owedExact[n] - base };
    });
    var D = total - rows.reduce(function (s, r) { return s + r.base; }, 0);
    var q = Math.floor(D / unit + 1e-9);
    var rem = D - q * unit;

    var absorber = people[0];
    if (pickIndex === null) {
      people.forEach(function (n) { if (paid[n] > paid[absorber]) absorber = n; });
    } else {
      absorber = people[pickIndex % people.length];
    }

    var owed = {};
    if (mode === "one") {
      rows.forEach(function (r) { owed[r.n] = r.base; });
      owed[absorber] += D;
    } else {
      rows.slice().sort(function (a, b) { return b.rem - a.rem; })
          .slice(0, q).forEach(function (r) { r.base += unit; });
      rows.forEach(function (r) { owed[r.n] = r.base; });
      if (rem > 0) owed[absorber] += rem;
    }

    var bal = people.map(function (n) { return { name: n, v: paid[n] - owed[n] }; });

    // filter 는 같은 객체를 넘긴다. 아래 루프가 v 를 깎으면 bal 이 함께 망가져
    // 화면에 표시할 잔액이 0 이 된다. 복사해서 쓴다.
    var copy = function (b) { return { name: b.name, v: Math.abs(b.v) }; };
    var give = bal.filter(function (b) { return b.v < 0; }).map(copy)
                  .sort(function (a, b) { return b.v - a.v; });
    var take = bal.filter(function (b) { return b.v > 0; }).map(copy)
                  .sort(function (a, b) { return b.v - a.v; });

    // 큰 쪽부터 맞물린다. 송금 횟수가 사람 수보다 적게 나온다.
    var moves = [], i = 0, j = 0, guard = 0;
    while (i < give.length && j < take.length && guard < 2000) {
      guard += 1;
      var amt = Math.min(give[i].v, take[j].v);
      if (amt > 0) moves.push({ from: give[i].name, to: take[j].name, amt: amt });
      give[i].v -= amt;
      take[j].v -= amt;
      if (give[i].v === 0) i += 1;
      if (take[j].v === 0) j += 1;
    }

    return { total: total, paid: paid, owed: owed, owedExact: owedExact,
             moves: moves, absorber: absorber, extra: mode === "one" ? D : rem };
  }

  // ── 화면 ──────────────────────────────────────────────────

  function renderPeople() {
    elPeople.innerHTML = people.map(function (n, i) {
      return '<li><span class="rname">' + esc(n) + "</span>" +
        '<button type="button" class="rdel" data-i="' + i + '" aria-label="삭제">×</button></li>';
    }).join("");
    elPeopleEmpty.hidden = people.length > 0;

    elPayer.innerHTML = people.map(function (n) {
      return '<option value="' + esc(n) + '">' + esc(n) + "</option>";
    }).join("");

    // 참여자는 기본으로 전원 켜둔다. 대개 다 참여하고 빠지는 사람만 끈다.
    elMembers.innerHTML = people.map(function (n) {
      return '<label class="st-chk"><input type="checkbox" value="' + esc(n) +
        '" checked><span>' + esc(n) + "</span></label>";
    }).join("");
  }

  function renderItems() {
    elItems.innerHTML = items.map(function (it, i) {
      var all = it.members.length === people.length;
      return '<li><div class="st-item-top">' +
        '<span class="st-item-label">' + esc(it.label || "항목 " + (i + 1)) + "</span>" +
        '<b class="st-item-amt">' + won(it.amount) + "</b>" +
        '<button type="button" class="rdel" data-i="' + i + '" aria-label="삭제">×</button>' +
        '</div><div class="st-item-sub">' +
        esc(it.payer) + " 결제 · " +
        (all ? "전원" : it.members.length + "명: " + it.members.map(esc).join(", ")) +
        "</div></li>";
    }).join("");
  }

  function render() {
    renderPeople();
    renderItems();

    // 사람이 없으면 폼만 잠그고 자리는 남긴다. 덩이를 통째로 감추면
    // 화면이 1단계에서 금액 단위로 건너뛰어 금액 넣는 곳이 없어 보인다.
    var hasPeople = people.length > 0;
    if (elForm) elForm.hidden = !hasPeople;
    if (elLocked) elLocked.hidden = hasPeople;

    // 접힌 설정에 지금 값을 요약해 둔다. 열지 않아도 무엇이 걸려 있는지 보인다.
    if (elOptNow) {
      elOptNow.textContent = (unit === 1 ? "1원" : unit === 100 ? "100원" : "1000원")
        + " · " + (mode === "one" ? "한 사람이 몰아서" : "여러 명이 나눠서");
    }

    var ready = people.length >= 2 && items.length >= 1;
    elResult.hidden = !ready;
    elAbsorbBox.hidden = !(ready && mode === "one");
    if (!ready) { save(); return; }

    var r = settle();
    elTotal.textContent = won(r.total);

    if (elAbsorb) {
      elAbsorb.textContent = r.absorber;
    }

    elMoves.innerHTML = r.moves.length
      ? r.moves.map(function (m) {
          return "<li>" +
            '<span class="st-from">' + esc(m.from) + "</span>" +
            '<span class="st-arrow">→</span>' +
            '<span class="st-to">' + esc(m.to) + "</span>" +
            '<b class="st-amt">' + won(m.amt) + "</b></li>";
        }).join("")
      : '<li class="st-none">이미 정산이 끝났습니다. 보낼 금액이 없습니다.</li>';

    // 사람별 상세. 이게 없으면 왜 이 금액인지 따지게 된다.
    elDetail.innerHTML = people.map(function (n) {
      var diff = r.paid[n] - r.owed[n];
      var mark = n === r.absorber && r.extra > 0
        ? ' <em class="st-extra">남은 ' + won(r.extra) + " 부담</em>" : "";
      return "<li>" +
        '<span class="rname">' + esc(n) + mark + "</span>" +
        '<span class="st-d">낸 돈 ' + won(r.paid[n]) + "</span>" +
        '<span class="st-d">부담 ' + won(r.owed[n]) + "</span>" +
        '<b class="st-diff ' + (diff > 0 ? "plus" : diff < 0 ? "minus" : "") + '">' +
        (diff > 0 ? "받을 " + won(diff) : diff < 0 ? "낼 " + won(-diff) : "정산 끝") +
        "</b></li>";
    }).join("");

    var notes = [];
    if (r.moves.length) {
      notes.push(r.moves.length + "번만 송금하면 됩니다.");
    }
    if (unit > 1) {
      notes.push("금액은 " + won(unit) + " 단위로 맞췄습니다.");
      if (r.extra > 0) {
        notes.push("남은 " + won(r.extra) + "은 " + r.absorber + "님이 냅니다.");
      }
    }
    elNote.textContent = notes.join(" ");

    updateShare(r);
    save();
  }

  function updateShare(r) {
    if (!elShareBox) return;
    var lines = ["정산 결과 · 전체 " + won(r.total), ""];
    items.forEach(function (it) {
      lines.push("· " + (it.label || "항목") + " " + won(it.amount) +
                 " (" + it.payer + " 결제, " +
                 (it.members.length === people.length ? "전원" : it.members.length + "명") + ")");
    });
    lines.push("");
    if (r.moves.length) {
      r.moves.forEach(function (m) {
        lines.push(m.from + " → " + m.to + "  " + won(m.amt));
      });
    } else {
      lines.push("보낼 금액이 없습니다.");
    }
    elShareBox.setAttribute("data-share-text", lines.join("\n"));
    // 계산기 주소만 내보낸다. 이름과 금액은 주소에 싣지 않는다.
    elShareBox.setAttribute("data-share-url", location.origin + location.pathname);
  }

  // ── 입력 ──────────────────────────────────────────────────

  function parseAmount(raw) {
    // 쉼표와 '원' 을 지운다. 단톡방에서 "12,000원" 을 그대로 붙여넣는 일이 많다.
    var t = String(raw || "").replace(/[,\s원]/g, "");
    if (t === "") return null;
    if (!/^\d+$/.test(t)) return null;
    var v = parseInt(t, 10);
    return v > MAX_AMOUNT ? null : v;
  }

  function addPerson() {
    var n = elName.value.trim();
    if (!n || people.length >= MAX_PEOPLE) { elName.focus(); return; }
    if (people.indexOf(n) >= 0) { elName.select(); return; }
    people.push(n);
    elName.value = "";
    elName.focus();
    render();
  }

  function addItem() {
    var amount = parseAmount(elAmount.value);
    if (amount === null) { elAmount.select(); return; }
    if (!people.length || items.length >= MAX_ITEMS) return;

    var members = [];
    elMembers.querySelectorAll("input:checked").forEach(function (c) {
      members.push(c.value);
    });
    if (!members.length) return;

    items.push({
      label: elLabel.value.trim() || "항목 " + (items.length + 1),
      amount: amount,
      payer: elPayer.value || people[0],
      members: members,
    });
    elLabel.value = "";
    elAmount.value = "";
    elLabel.focus();
    render();
  }

  elAddName.addEventListener("click", addPerson);
  elName.addEventListener("keydown", function (e) {
    // 한글 IME 는 조합을 확정하는 엔터와 실제 엔터가 연달아 keydown 을 낸다.
    // 걸러내지 않으면 이름 하나에 두 명이 들어간다.
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") { e.preventDefault(); addPerson(); }
  });

  elAddItem.addEventListener("click", addItem);
  [elLabel, elAmount].forEach(function (el) {
    el.addEventListener("keydown", function (e) {
      if (e.isComposing || e.keyCode === 229) return;
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (el === elLabel && !elAmount.value) { elAmount.focus(); return; }
      addItem();
    });
  });

  elPeople.addEventListener("click", function (e) {
    var b = e.target.closest(".rdel");
    if (!b) return;
    var gone = people.splice(parseInt(b.getAttribute("data-i"), 10), 1)[0];
    // 지운 사람이 낸 항목은 함께 지운다. 남겨두면 낸 사람이 없는 항목이 된다.
    items = items.filter(function (it) { return it.payer !== gone; });
    items.forEach(function (it) {
      it.members = it.members.filter(function (m) { return m !== gone; });
    });
    items = items.filter(function (it) { return it.members.length > 0; });
    pickIndex = null;
    render();
  });

  elItems.addEventListener("click", function (e) {
    var b = e.target.closest(".rdel");
    if (!b) return;
    items.splice(parseInt(b.getAttribute("data-i"), 10), 1);
    render();
  });

  elUnit.addEventListener("click", function (e) {
    var b = e.target.closest("[data-unit]");
    if (!b) return;
    unit = parseInt(b.dataset.unit, 10);
    elUnit.querySelectorAll("[data-unit]").forEach(function (x) {
      x.classList.toggle("on", x === b);
    });
    render();
  });

  elMode.addEventListener("click", function (e) {
    var b = e.target.closest("[data-mode]");
    if (!b) return;
    mode = b.dataset.mode;
    elMode.querySelectorAll("[data-mode]").forEach(function (x) {
      x.classList.toggle("on", x === b);
    });
    // 방식을 바꾸면 뽑기를 초기화한다. 남겨두면 왜 저 사람인지 알 수 없다.
    pickIndex = mode === "one" ? Math.floor(Math.random() * Math.max(people.length, 1)) : null;
    render();
  });

  if (elReroll) {
    elReroll.addEventListener("click", function () {
      if (!people.length) return;
      var next = pickIndex;
      // 같은 사람이 연달아 나오지 않게 막는다. 돌림판과 같은 규칙이다.
      for (var t = 0; t < 20 && people.length > 1; t += 1) {
        next = Math.floor(Math.random() * people.length);
        if (next !== pickIndex) break;
      }
      pickIndex = next;
      render();
    });
  }

  if (elReset) {
    elReset.addEventListener("click", function () {
      people = [];
      items = [];
      pickIndex = null;
      try { localStorage.removeItem(STORE); } catch (e) {}
      render();
    });
  }

  load();
  elUnit.querySelectorAll("[data-unit]").forEach(function (x) {
    x.classList.toggle("on", parseInt(x.dataset.unit, 10) === unit);
  });
  elMode.querySelectorAll("[data-mode]").forEach(function (x) {
    x.classList.toggle("on", x.dataset.mode === mode);
  });
  render();
})();
