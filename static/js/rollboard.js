// 심심풀이 굴림판.
//
// 이름을 넣으면 구슬이 코스를 내려가며 순위를 정한다. 커피 내기, 발표 순서, 벌칙 정하기용이다.
//
// 구슬마다 능력치 넷(속도·무게·운·근성)이 붙고, 경주 중에는 컨디션이 실시간으로 오르내린다.
// 능력치는 판마다 새로 굴리고 총합이 모두 같다. 판을 반복하면 누구나 공평하되,
// 한 판 안에서는 분명히 영향을 줘서 시작 전에 누구에게 걸지 고를 거리가 생긴다.
//
// 서버가 없다. 이름도 결과도 브라우저 밖으로 나가지 않는다.

(function () {
  "use strict";

  var canvas = document.getElementById("board");
  if (!canvas) return;

  var W = 420;            // 논리 가로
  var VIEW_H = 700;       // 화면에 보이는 높이
  var COURSE_H = 3600;    // 코스 전체 길이
  var FINISH_Y = COURSE_H - 160;
  var R = 10;             // 구슬 반지름
  var GRAVITY = 1300;
  var SUB = 4;
  var MAX_MARBLES = 12;
  var MAX_SPEED = 1400;

  var STAT_TOTAL = 20;    // 능력치 총합. 모두 같아야 판이 공평하다.
  var STAT_MIN = 2;
  var STAT_MAX = 8;

  var ctx = canvas.getContext("2d");

  // ── 코스 ──────────────────────────────────────────────────

  function seg(ax, ay, bx, by) { return { ax: ax, ay: ay, bx: bx, by: by }; }

  var walls = [];
  var pegs = [];

  function zigzag(y0, y1, step, inset) {
    var flip = false;
    // 조건이 y < y1 이면 마지막 램프가 y1을 step만큼 넘어 다음 구간을 침범한다.
    // 그러면 램프 끝점과 첫 페그 사이가 구슬 지름보다 좁아져 빠져나갈 수 없는 주머니가 생긴다.
    for (var y = y0; y + step <= y1; y += step) {
      if (flip) walls.push(seg(W - inset, y, inset + 90, y + step));
      else walls.push(seg(inset, y, W - inset - 90, y + step));
      flip = !flip;
    }
  }

  function pegField(y0, y1, rows, cols) {
    var dy = (y1 - y0) / rows;
    for (var r = 0; r < rows; r += 1) {
      var offset = r % 2 === 0 ? 0 : (W - 60) / cols / 2;
      for (var c = 0; c < cols; c += 1) {
        pegs.push({ x: 30 + offset + c * ((W - 60) / cols), y: y0 + r * dy, r: 7 });
      }
    }
  }

  function funnel(y, gap, depth) {
    walls.push(seg(8, y, W / 2 - gap / 2, y + depth));
    walls.push(seg(W - 8, y, W / 2 + gap / 2, y + depth));
  }

  function buildCourse() {
    walls = [];
    pegs = [];
    walls.push(seg(8, 0, 8, COURSE_H));
    walls.push(seg(W - 8, 0, W - 8, COURSE_H));

    // 출발 직후 깔때기로 한 번 모은다. 이게 없으면 처음 x 위치가 순위를 좌우한다.
    // 오른쪽 끝에서 출발한 구슬이 첫 램프를 그냥 지나쳐 자유낙하로 앞서 나가기 때문이다.
    funnel(120, 120, 95);

    // 경사가 얕으면 구슬이 몰렸을 때 서로 붙잡고 멈춘다. step을 키워 25도 근처로 세운다.
    zigzag(280, 760, 160, 8);
    pegField(820, 1160, 5, 6);
    funnel(1220, 100, 150);
    zigzag(1440, 1960, 150, 8);
    pegField(2020, 2360, 5, 7);
    funnel(2420, 90, 160);
    zigzag(2640, 3010, 150, 8);
    pegField(3060, 3300, 3, 6);
    funnel(3340, 130, 110);

    walls.push(seg(8, COURSE_H, W - 8, COURSE_H)); // 바닥
  }

  function closestOnSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var len2 = dx * dx + dy * dy;
    var t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return { x: ax + t * dx, y: ay + t * dy };
  }

  // 그 자리에 구슬이 들어갈 수 있는지. 자리바꿈·분신 합체가 벽 속으로 박히는 걸 막는다.
  function isFree(x, y) {
    if (x < 8 + R + 2 || x > W - 8 - R - 2) return false;
    if (y < R + 2 || y > COURSE_H - R) return false;
    var i;
    for (i = 0; i < walls.length; i += 1) {
      var w = walls[i];
      if (Math.max(w.ay, w.by) < y - 200 || Math.min(w.ay, w.by) > y + 200) continue;
      var c = closestOnSeg(x, y, w.ax, w.ay, w.bx, w.by);
      if (Math.hypot(x - c.x, y - c.y) < R + 6) return false;
    }
    for (i = 0; i < pegs.length; i += 1) {
      var p = pegs[i];
      if (Math.abs(p.y - y) > 60) continue;
      if (Math.hypot(x - p.x, y - p.y) < R + p.r + 2) return false;
    }
    return true;
  }

  // ── 능력치 ────────────────────────────────────────────────

  var STATS = [
    { key: "speed", name: "속도", desc: "내려가는 가속이 붙습니다" },
    { key: "power", name: "무게", desc: "부딪혀도 안 밀리고 상대를 밀어냅니다" },
    { key: "luck", name: "운", desc: "돌발 상황이 좋은 쪽으로 터질 확률입니다" },
    { key: "spirit", name: "근성", desc: "컨디션이 크게 오르내립니다" }
  ];

  // 총합을 고정해 굴린다. 총합이 다르면 그 자체로 유불리가 생겨 내기가 성립하지 않는다.
  function rollStats() {
    var s = { speed: STAT_MIN, power: STAT_MIN, luck: STAT_MIN, spirit: STAT_MIN };
    var keys = ["speed", "power", "luck", "spirit"];
    var left = STAT_TOTAL - STAT_MIN * keys.length;
    while (left > 0) {
      var k = keys[Math.floor(Math.random() * keys.length)];
      if (s[k] >= STAT_MAX) continue;
      s[k] += 1;
      left -= 1;
    }
    return s;
  }

  // ── 돌발 상황 ─────────────────────────────────────────────
  //
  // 예전에는 구슬마다 고정 능력을 하나씩 줬는데, 능력 뽑기가 곧 승부가 돼서
  // 강한 능력을 받은 사람이 계속 이겼다. 지금은 누구에게나 무작위로 터지고
  // 운 능력치는 좋은 쪽이 나올 확률만 올린다.

  var GOOD = [
    { name: "가속", emoji: "🚀", run: function (m) { m.vy += 340; } },
    {
      name: "미끄럼", emoji: "🧊",
      run: function (m) { m.noBounce = true; m.gravityScale = 1.12; m.effectUntil = m.t + 2.6; }
    },
    {
      name: "분신술", emoji: "👥",
      run: function (m, all) {
        if (m.clones.length) return;
        // 분신이 그대로 결승선에 들어가면 10장짜리 복권이라 압도적으로 세진다.
        // 분신은 순위에 관여하지 않고, 시간이 지나면 그중 하나로 무작위 합쳐진다.
        var bodies = 0;
        all.forEach(function (o) { bodies += 1 + o.clones.length; });
        if (bodies > 60) return;
        for (var i = 0; i < 9; i += 1) {
          m.clones.push({
            x: m.x + (Math.random() * 2 - 1) * 9,
            y: m.y + (Math.random() * 2 - 1) * 9,
            vx: m.vx + (Math.random() * 2 - 1) * 400,
            vy: m.vy + (Math.random() * 2 - 1) * 240 + 240
          });
        }
        m.cloneUntil = m.t + 3.5;
      }
    },
    {
      name: "밀치기", emoji: "💥",
      run: function (m, all) {
        all.forEach(function (o) {
          if (o === m || o.done) return;
          var dx = o.x - m.x, dy = o.y - m.y;
          var d = Math.hypot(dx, dy);
          if (d < 115 && d > 0) {
            // 방사형으로 밀면 아래쪽 구슬은 오히려 앞으로 보내주게 된다. 항상 뒤로 민다.
            o.vx += (dx / d) * 430;
            o.vy -= 380;
          }
        });
      }
    },
    {
      name: "발목잡기", emoji: "🕸️",
      run: function (m, all) {
        // 선두 두 명을 잡는다. 한 명만 잡으면 바로 2등이 올라와 효과가 없다.
        var ahead = all.filter(function (o) { return o !== m && !o.done && o.y > m.y; });
        ahead.sort(function (a, b) { return b.y - a.y; });
        ahead.slice(0, 2).forEach(function (o) { o.vy *= 0.06; o.vx *= 0.2; });
      }
    }
  ];

  var BAD = [
    { name: "헛디딤", emoji: "😵", run: function (m) { m.vy *= 0.15; m.vx *= 0.3; } },
    {
      name: "역풍", emoji: "🌪️",
      run: function (m) { m.vy -= 300; m.vx += (Math.random() * 2 - 1) * 260; }
    },
    {
      name: "진흙", emoji: "🟤",
      run: function (m) { m.gravityScale = 0.55; m.effectUntil = m.t + 2.2; }
    }
  ];

  var NEUTRAL = [
    {
      name: "자리바꿈", emoji: "✨",
      run: function (m, all) {
        // 좌표를 밀어내는 방식은 계속 한쪽으로 샜다. 위로 뛸수록 벽에 막혀 불발되고
        // 아래로는 거의 안 막혀서 실패가 곧 이득이 됐다. 자리를 맞바꾸면 구조적으로 대칭이다.
        var others = all.filter(function (o) {
          return o !== m && !o.done && !o.clones.length && !isRigged(o);
        });
        if (!others.length) return;
        var o = others[Math.floor(Math.random() * others.length)];
        var tx = m.x, ty = m.y, tvx = m.vx, tvy = m.vy;
        m.x = o.x; m.y = o.y; m.vx = o.vx; m.vy = o.vy;
        o.x = tx; o.y = ty; o.vx = tvx; o.vy = tvy;
        m.progressY = Math.min(m.progressY, m.y);
        o.progressY = Math.min(o.progressY, o.y);
      }
    }
  ];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function isRigged(m) { return !!(rig && m.name === rig.name); }

  function rollEvent(m) {
    if (isRigged(m)) {
      // 자리바꿈은 조작을 통째로 뒤집을 수 있어 대상에게는 돌리지 않는다.
      return Math.random() < (rig.mode === "lose" ? 0.06 : 0.94) ? pick(GOOD) : pick(BAD);
    }
    if (Math.random() < 0.18) return pick(NEUTRAL);
    var good = 0.34 + m.stats.luck * 0.05;   // 운 2 → 44%, 운 8 → 74%
    return Math.random() < good ? pick(GOOD) : pick(BAD);
  }

  // ── 상태 ──────────────────────────────────────────────────

  var marbles = [];
  var finished = [];
  var camY = 0;
  var camScale = 1;
  var camMode = "lead";   // lead | pack | last | pick
  var camPick = null;
  var racing = false;
  var toasts = [];
  var winRule = "last";   // 커피 내기는 보통 꼴찌가 산다

  // 방장 조작. 판을 시작하기 전에 방장만 몰래 정해두는 값이다.
  // 순간이동처럼 티 나는 방식은 쓰지 않는다. 돌발 상황 확률을 기울이고,
  // 원하는 자리에서 벗어난 만큼만 서서히 끌거나 밀어서 자연스러워 보이게 한다.
  var rig = null;   // { name, mode: "lose" | "win" }

  var elSetup = document.getElementById("rb-setup");
  var elStage = document.getElementById("rb-stage");
  var elResult = document.getElementById("rb-result");
  var elInput = document.getElementById("rb-input");
  var elAdd = document.getElementById("rb-add");
  var elEmpty = document.getElementById("rb-empty");
  var elStart = document.getElementById("rb-start");
  var elRoster = document.getElementById("rb-roster");
  var elRank = document.getElementById("rb-rank");
  var elLive = document.getElementById("rb-live");
  var elStake = document.getElementById("rb-stake");
  var elVerdict = document.getElementById("rb-verdict");

  var entries = [];   // [{ name, stats }]

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function addName(raw) {
    var v = (raw || "").trim();
    if (!v) return false;
    if (entries.length >= MAX_MARBLES) return false;
    entries.push({ name: v, stats: rollStats() });
    buildMarbles();
    return true;
  }

  function removeAt(i) {
    entries.splice(i, 1);
    buildMarbles();
  }

  function rerollStats() {
    entries.forEach(function (e) { e.stats = rollStats(); });
  }

  function buildMarbles() {
    var names = entries.map(function (e) { return e.name; });

    // 출발 자리를 섞는다. 이름 순서가 순위에 영향을 주면 뽑기 도구로 못 쓴다.
    var slots = names.map(function (_, i) { return i; });
    for (var s = slots.length - 1; s > 0; s -= 1) {
      var j = Math.floor(Math.random() * (s + 1));
      var tmp = slots[s]; slots[s] = slots[j]; slots[j] = tmp;
    }

    marbles = names.map(function (name, i) {
      var hue = Math.round((360 / Math.max(names.length, 1)) * i);
      var slot = slots[i];
      var st = entries[i].stats;
      return {
        name: name,
        color: "hsl(" + hue + " 70% 55%)",
        stats: st,
        mass: 1 + (st.power - 5) * 0.14,
        morale: 50, moraleTimer: 0.4, lastRank: null,
        x: 40 + (slot % 6) * 60 + (Math.random() * 10 - 5),
        y: 40 + Math.floor(slot / 6) * 34,
        vx: 0, vy: 0,
        gravityScale: 1, noBounce: false, effectUntil: 0, t: 0,
        clones: [], cloneUntil: 0,
        stall: 0, stuckCount: 0, progressY: 40 + Math.floor(slot / 6) * 34,
        cooldown: 3 + Math.random() * 3,
        done: false
      };
    });

    renderRoster();  // 명단은 입력한 순서 그대로 보여준다

    // 처리 순서를 섞는다. 물리를 배열 순서대로 도는 탓에 앞쪽 구슬이 충돌을 먼저 해소하고,
    // 같은 순간에 결승선을 넘으면 앞 index가 먼저 등록된다. 매 판 섞어 구조적으로 없앤다.
    for (var k = marbles.length - 1; k > 0; k -= 1) {
      var q = Math.floor(Math.random() * (k + 1));
      var swap = marbles[k]; marbles[k] = marbles[q]; marbles[q] = swap;
    }
  }

  function statBars(st) {
    return STATS.map(function (s) {
      var v = st[s.key];
      return '<span class="stat"><em>' + s.name + '</em>' +
        '<i><u style="width:' + (v / STAT_MAX * 100) + '%"></u></i>' +
        '<b>' + v + '</b></span>';
    }).join("");
  }

  function renderRoster() {
    elRoster.innerHTML = marbles.map(function (m, i) {
      return '<li><div class="rtop">' +
        '<span class="dot" style="background:' + m.color + '"></span>' +
        '<span class="rname">' + escapeHtml(m.name) + "</span>" +
        '<button type="button" class="rdel" data-i="' + i + '" aria-label="삭제">×</button>' +
        "</div><div class=\"stats\">" + statBars(m.stats) + "</div></li>";
    }).join("");
    if (elEmpty) elEmpty.hidden = entries.length > 0;
    if (elStart) {
      elStart.disabled = entries.length < 2;
      elStart.textContent = entries.length < 2
        ? "두 명 이상 필요해요"
        : "굴리기 (" + entries.length + "명)";
    }
  }

  // ── 충돌 ──────────────────────────────────────────────────

  function hitStatic(m, cx, cy, cr, e) {
    var dx = m.x - cx, dy = m.y - cy;
    var dist = Math.hypot(dx, dy);
    var min = R + cr;
    if (dist >= min || dist === 0) return;
    var nx = dx / dist, ny = dy / dist;
    m.x += nx * (min - dist);
    m.y += ny * (min - dist);
    var vn = m.vx * nx + m.vy * ny;
    if (vn < 0) {
      m.vx -= (1 + e) * vn * nx;
      m.vy -= (1 + e) * vn * ny;
      m.vx *= 0.99;
    }
  }

  function marbleVsMarble(a, b) {
    var dx = b.x - a.x, dy = b.y - a.y;
    var dist = Math.hypot(dx, dy);
    if (dist >= R * 2 || dist === 0) return;
    var nx = dx / dist, ny = dy / dist;

    // 무게가 무거운 쪽이 덜 밀린다. 무게 능력치가 여기서 드러난다.
    var ma = a.mass, mb = b.mass;
    var total = ma + mb;
    var overlap = R * 2 - dist;
    a.x -= nx * overlap * (mb / total); a.y -= ny * overlap * (mb / total);
    b.x += nx * overlap * (ma / total); b.y += ny * overlap * (ma / total);

    var rvx = b.vx - a.vx, rvy = b.vy - a.vy;
    var vn = rvx * nx + rvy * ny;
    if (vn > 0) return;
    var imp = -(1 + 0.35) * vn / (1 / ma + 1 / mb);
    a.vx -= (imp / ma) * nx; a.vy -= (imp / ma) * ny;
    b.vx += (imp / mb) * nx; b.vy += (imp / mb) * ny;
  }

  function countAhead(m) {
    var n = 0;
    for (var i = 0; i < marbles.length; i += 1) {
      var o = marbles[i];
      if (o !== m && (o.done || o.y > m.y)) n += 1;
    }
    return n;
  }

  function step(dt) {
    var i, j;
    for (i = 0; i < marbles.length; i += 1) {
      var m = marbles[i];
      if (m.done) continue;

      m.t += dt;
      if (m.effectUntil && m.t > m.effectUntil) {
        m.gravityScale = 1; m.noBounce = false; m.effectUntil = 0;
      }

      // 컨디션: 순위를 올리면 오르고 밀리면 떨어진다. 근성 능력치가 진폭을 정한다.
      // 선두가 계속 오르기만 하면 눈덩이가 되므로 등수 변화량으로만 움직이고 50으로 회귀한다.
      m.moraleTimer -= dt;
      if (m.moraleTimer <= 0) {
        m.moraleTimer = 0.4;
        var rank = countAhead(m);
        if (m.lastRank !== null) {
          m.morale += (m.lastRank - rank) * (5 + m.stats.spirit * 1.5);
        }
        m.lastRank = rank;
        m.morale += (50 - m.morale) * 0.05;
        if (m.morale < 0) m.morale = 0;
        if (m.morale > 100) m.morale = 100;
      }

      m.cooldown -= dt;
      if (m.cooldown <= 0) {
        var ev = rollEvent(m);
        ev.run(m, marbles);
        m.cooldown = 4 + Math.random() * 3.5;
        toasts.push({ x: m.x, y: m.y, text: ev.emoji + " " + m.name, life: 1.1 });
      }

      // 방장 조작: 원하는 자리에서 벗어난 정도에 비례해 끌거나 민다.
      // 한 번에 크게 손대면 눈에 보이므로 매 순간 조금씩만 건드린다.
      if (isRigged(m)) {
        var behind = 0, ahead = 0;
        for (var q = 0; q < marbles.length; q += 1) {
          var o = marbles[q];
          if (o === m) continue;
          if (o.done || o.y > m.y) ahead += 1; else behind += 1;
        }
        if (rig.mode === "lose" && behind > 0) m.vy -= 300 * behind * dt;
        if (rig.mode === "win" && ahead > 0) m.vy += 300 * ahead * dt;
      }

      var speedMul = 0.92 + m.stats.speed * 0.02;      // 속도 2 → 0.96, 8 → 1.08
      var moraleMul = 0.88 + (m.morale / 100) * 0.24;  // 컨디션 0 → 0.88, 100 → 1.12
      m.vy += GRAVITY * m.gravityScale * speedMul * moraleMul * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;

      var sp = Math.hypot(m.vx, m.vy);
      if (sp > MAX_SPEED) { m.vx = m.vx / sp * MAX_SPEED; m.vy = m.vy / sp * MAX_SPEED; }

      // 카메라 주변만 검사한다. 전체를 돌면 구슬 12개에서 프레임이 흔들린다.
      for (j = 0; j < walls.length; j += 1) {
        var w = walls[j];
        if (Math.max(w.ay, w.by) < m.y - 200 || Math.min(w.ay, w.by) > m.y + 200) continue;
        var c = closestOnSeg(m.x, m.y, w.ax, w.ay, w.bx, w.by);
        hitStatic(m, c.x, c.y, 4, m.noBounce ? 0 : 0.32);
      }
      for (j = 0; j < pegs.length; j += 1) {
        var p = pegs[j];
        if (Math.abs(p.y - m.y) > 200) continue;
        hitStatic(m, p.x, p.y, p.r, m.noBounce ? 0 : 0.42);
      }

      // 정체 방지. 좁은 곳에서 구슬끼리 서로 붙잡으면 어떤 코스든 멈출 수 있다.
      // 속도로 판정하면 제자리에서 떠는 구슬을 못 잡는다. 실제로 내려간 거리로 본다.
      m.stall += dt;
      if (m.y > m.progressY + 20) {
        m.progressY = m.y;
        m.stall = 0;
        m.stuckCount = 0;
      } else if (m.stall > 2) {
        m.stuckCount += 1;
        var kick = Math.min(300 + m.stuckCount * 140, 900);
        m.vx += (Math.random() * 2 - 1) * kick;
        m.vy += kick;
        m.stall = 0;
      }

      if (m.clones.length) {
        for (j = 0; j < m.clones.length; j += 1) {
          var cl = m.clones[j];
          cl.vy += GRAVITY * dt;
          cl.x += cl.vx * dt;
          cl.y += cl.vy * dt;
          var k;
          for (k = 0; k < walls.length; k += 1) {
            var cw = walls[k];
            if (Math.max(cw.ay, cw.by) < cl.y - 200 || Math.min(cw.ay, cw.by) > cl.y + 200) continue;
            var cc = closestOnSeg(cl.x, cl.y, cw.ax, cw.ay, cw.bx, cw.by);
            hitStatic(cl, cc.x, cc.y, 4, 0.32);
          }
          for (k = 0; k < pegs.length; k += 1) {
            var cp = pegs[k];
            if (Math.abs(cp.y - cl.y) > 200) continue;
            hitStatic(cl, cp.x, cp.y, cp.r, 0.42);
          }
        }
        if (m.t > m.cloneUntil) {
          var picks = m.clones.concat([{ x: m.x, y: m.y, vx: m.vx, vy: m.vy }]);
          var chosen = picks[Math.floor(Math.random() * picks.length)];
          if (isFree(chosen.x, chosen.y)) {
            m.x = chosen.x; m.y = chosen.y; m.vx = chosen.vx; m.vy = chosen.vy;
          }
          m.clones = [];
        }
      }

      if (m.y > FINISH_Y) {
        m.done = true;
        finished.push(m);
        if (finished.length === marbles.length) finish();
      }
    }

    for (i = 0; i < marbles.length; i += 1) {
      for (j = i + 1; j < marbles.length; j += 1) {
        if (!marbles[i].done && !marbles[j].done) marbleVsMarble(marbles[i], marbles[j]);
      }
    }

    for (i = toasts.length - 1; i >= 0; i -= 1) {
      toasts[i].life -= dt;
      toasts[i].y -= dt * 30;
      if (toasts[i].life <= 0) toasts.splice(i, 1);
    }
  }

  // ── 그리기 ────────────────────────────────────────────────

  function cssVar(n, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    return v || fallback;
  }

  function draw() {
    var line = cssVar("--line", "#e6e6ee");
    var ink = cssVar("--ink", "#1c1c22");
    var accent = cssVar("--accent", "#6c4cf1");

    var live = marbles.filter(function (m) { return !m.done; });
    var focus = FINISH_Y;
    var wantScale = 1;

    if (live.length) {
      var lo = live[0].y, hi = live[0].y;
      live.forEach(function (m) {
        if (m.y < lo) lo = m.y;
        if (m.y > hi) hi = m.y;
      });
      if (camMode === "pack") {
        focus = (lo + hi) / 2;
        // 무리 전체가 들어오도록 축소한다. 너무 줄이면 구슬이 점이 되므로 하한을 둔다.
        wantScale = Math.max(0.34, Math.min(1, VIEW_H / (hi - lo + 300)));
      } else if (camMode === "last") {
        focus = lo;
      } else if (camMode === "pick" && camPick) {
        var tgt = live.filter(function (m) { return m.name === camPick; })[0];
        focus = tgt ? tgt.y : hi;
      } else {
        focus = hi;
      }
    }

    camScale += (wantScale - camScale) * 0.1;
    var viewSpan = VIEW_H / camScale;
    var want = Math.max(0, Math.min(focus - viewSpan * 0.45, COURSE_H - viewSpan));
    camY += (want - camY) * 0.12;

    ctx.clearRect(0, 0, W, VIEW_H);
    ctx.save();
    ctx.translate((W - W * camScale) / 2, 0);
    ctx.scale(camScale, camScale);
    ctx.translate(0, -camY);

    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.strokeStyle = line;
    walls.forEach(function (w) {
      if (Math.max(w.ay, w.by) < camY - 40 || Math.min(w.ay, w.by) > camY + VIEW_H / camScale + 40) return;
      ctx.beginPath(); ctx.moveTo(w.ax, w.ay); ctx.lineTo(w.bx, w.by); ctx.stroke();
    });

    ctx.fillStyle = line;
    pegs.forEach(function (p) {
      if (p.y < camY - 40 || p.y > camY + VIEW_H / camScale + 40) return;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    });

    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 8]);
    ctx.beginPath(); ctx.moveTo(8, FINISH_Y); ctx.lineTo(W - 8, FINISH_Y); ctx.stroke();
    ctx.setLineDash([]);

    marbles.forEach(function (m) {
      if (m.done) return;
      if (m.clones.length) {
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = m.color;
        m.clones.forEach(function (c) {
          ctx.beginPath(); ctx.arc(c.x, c.y, R, 0, 7); ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.arc(m.x, m.y, R, 0, 7); ctx.fill();

      // 컨디션 링. 오르면 강조색, 떨어지면 흐린 테두리가 돈다.
      if (m.morale > 62 || m.morale < 38) {
        ctx.strokeStyle = m.morale > 62 ? accent : line;
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(m.x, m.y, R + 4, 0, 7); ctx.stroke();
      }

      if (camScale > 0.55) {
        ctx.fillStyle = ink;
        ctx.font = "600 " + (11 / camScale).toFixed(1) + "px -apple-system, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(m.name, m.x, m.y - R - 6 / camScale);
      }
    });

    ctx.font = "700 " + (12 / camScale).toFixed(1) + "px -apple-system, sans-serif";
    toasts.forEach(function (t) {
      ctx.globalAlpha = Math.max(0, t.life);
      ctx.fillStyle = accent;
      ctx.textAlign = "center";
      ctx.fillText(t.text, t.x, t.y - 22);
    });
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function renderLive() {
    var order = marbles.slice().sort(function (a, b) {
      if (a.done !== b.done) return a.done ? -1 : 1;
      if (a.done && b.done) return finished.indexOf(a) - finished.indexOf(b);
      return b.y - a.y;
    });
    elLive.innerHTML = order.map(function (m, i) {
      var on = camMode === "pick" && camPick === m.name ? " following" : "";
      return '<li class="live-item' + on + '" data-name="' + escapeHtml(m.name) + '">' +
        '<span class="dot" style="background:' + m.color + '"></span>' +
        "<b>" + (i + 1) + "</b> " + escapeHtml(m.name) +
        '<span class="mor"><u style="width:' + m.morale.toFixed(0) + '%"></u></span></li>';
    }).join("");
  }

  var last = 0;
  function frame(now) {
    if (!last) last = now;
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (racing) {
      for (var i = 0; i < SUB; i += 1) step(dt / SUB);
      renderLive();
    }
    draw();
    requestAnimationFrame(frame);
  }

  // ── 진행 ──────────────────────────────────────────────────

  function setCam(mode, name) {
    camMode = mode;
    camPick = name || null;
    var btns = document.querySelectorAll("[data-cam]");
    for (var i = 0; i < btns.length; i += 1) {
      btns[i].classList.toggle("on", btns[i].getAttribute("data-cam") === mode);
    }
  }

  function startRace() {
    if (entries.length < 2) return;
    buildCourse();
    rerollStats();   // 능력치는 판마다 새로 굴린다. 사람에게 붙어 있으면 뽑기가 안 된다.
    buildMarbles();
    finished = [];
    toasts = [];
    camY = 0;
    camScale = 1;
    setCam("lead");
    racing = true;
    elSetup.hidden = true;
    elStage.hidden = false;
    elResult.hidden = true;
  }

  function winner() {
    if (!finished.length) return null;
    return winRule === "last" ? finished[finished.length - 1] : finished[0];
  }

  function finish() {
    racing = false;
    var w = winner();
    var stake = (elStake && elStake.value.trim()) || "";
    var label = winRule === "last" ? "꼴찌" : "1등";
    if (elVerdict && w) {
      elVerdict.innerHTML = (stake ? escapeHtml(stake) + " → " : "") +
        "<strong>" + escapeHtml(w.name) + "</strong> " + label;
    }
    elRank.innerHTML = finished.map(function (m, i) {
      var medal = ["🥇", "🥈", "🥉"][i] || (i + 1) + "위";
      var hit = (winRule === "last" && i === finished.length - 1) ||
                (winRule === "first" && i === 0);
      return "<li" + (hit ? ' class="hit"' : "") + ">" +
        '<span class="medal">' + medal + "</span>" +
        '<span class="dot" style="background:' + m.color + '"></span>' +
        '<span class="rname">' + escapeHtml(m.name) + "</span></li>";
    }).join("");
    elResult.hidden = false;
  }

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

  var ruleBar = document.getElementById("rb-rule");
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

  var camBar = document.getElementById("rb-cam");
  if (camBar) {
    camBar.addEventListener("click", function (e) {
      var btn = e.target.closest("[data-cam]");
      if (btn) setCam(btn.getAttribute("data-cam"));
    });
  }

  // 순위표에서 이름을 누르면 그 구슬을 따라간다. 다시 누르면 선두로 돌아온다.
  elLive.addEventListener("click", function (e) {
    var item = e.target.closest(".live-item");
    if (!item) return;
    var name = item.getAttribute("data-name");
    if (camMode === "pick" && camPick === name) setCam("lead");
    else setCam("pick", name);
  });

  elStart.addEventListener("click", startRace);
  document.getElementById("rb-again").addEventListener("click", startRace);
  document.getElementById("rb-reset").addEventListener("click", function () {
    racing = false;
    elSetup.hidden = false;
    elStage.hidden = true;
    elResult.hidden = true;
  });
  document.getElementById("rb-copy").addEventListener("click", function (e) {
    var lines = finished.map(function (m, i) { return (i + 1) + "위 " + m.name; });
    var w = winner();
    var stake = (elStake && elStake.value.trim()) || "";
    if (w) lines.unshift((stake ? stake + " → " : "") + w.name +
      (winRule === "last" ? " (꼴찌)" : " (1등)"), "");
    var btn = e.currentTarget;
    var original = btn.textContent;
    navigator.clipboard.writeText(lines.join("\n")).then(function () {
      btn.textContent = "복사됨";
      setTimeout(function () { btn.textContent = original; }, 1800);
    });
  });

  var elStatHelp = document.getElementById("rb-stat-help");
  if (elStatHelp) {
    elStatHelp.innerHTML = STATS.map(function (s) {
      return "<li><b>" + s.name + "</b> " + s.desc + "</li>";
    }).join("") +
      "<li><b>컨디션</b> 경주 중 실시간으로 오르내립니다. 순위를 올리면 오르고 밀리면 처져요. " +
      "컨디션이 높을수록 빨라집니다.</li>" +
      "<li>능력치 총합은 모두 20으로 같고 판마다 다시 굴립니다. 반복해서 돌리면 누구나 공평해요.</li>";
  }

  function fit() {
    var ratio = window.devicePixelRatio || 1;
    canvas.width = W * ratio;
    canvas.height = VIEW_H * ratio;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  // 테스트용 노출. 코스가 새는지, 완주가 되는지, 편향이 없는지 node로 확인한다.
  window.__rollboard = {
    setRig: function (r) { rig = r; },
    startHeadless: function (names) {
      entries = [];
      names.forEach(addName);
      buildCourse(); rerollStats(); buildMarbles(); finished = []; racing = true;
    },
    step: step,
    state: function () {
      return {
        finished: finished.map(function (m) {
          return { name: m.name, stats: m.stats, morale: Math.round(m.morale) };
        }),
        pending: marbles.filter(function (m) { return !m.done; })
          .map(function (m) {
            return { name: m.name, x: Math.round(m.x), y: Math.round(m.y), morale: Math.round(m.morale) };
          })
      };
    },
    bounds: { W: W, COURSE_H: COURSE_H, FINISH_Y: FINISH_Y }
  };

  fit();
  buildCourse();
  buildMarbles();
  requestAnimationFrame(frame);
})();
