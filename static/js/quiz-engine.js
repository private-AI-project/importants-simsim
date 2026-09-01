// 심심풀이 퀴즈 엔진.
//
// 퀴즈마다 코드를 쓰지 않는다. data/quizzes/{slug}.json 하나만 추가하면 돌아간다.
// 그래야 에이전트가 퀴즈를 찍어낼 수 있다.
//
// 지원 포맷
//   type-test : 선택지마다 유형별 점수를 더해 최고점 유형을 고른다.
//   trivia    : 정답 개수를 세어 점수 구간(min)으로 결과를 고른다.

(function () {
  "use strict";

  var dataEl = document.getElementById("quiz-data");
  var runEl = document.getElementById("quiz-run");
  if (!dataEl || !runEl) return;

  var quiz = JSON.parse(dataEl.textContent);
  var base = runEl.getAttribute("data-base");
  var questions = quiz.questions || [];
  var format = quiz.type === "trivia" ? "trivia" : "type-test";

  var introEl = document.getElementById("quiz-intro");
  var barEl = document.getElementById("quiz-bar");
  var countEl = document.getElementById("quiz-count");
  var questionEl = document.getElementById("quiz-question");
  var choicesEl = document.getElementById("quiz-choices");
  var backEl = document.getElementById("quiz-back");

  var index = 0;
  var picks = [];

  function start() {
    introEl.hidden = true;
    runEl.hidden = false;
    render();
    runEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function render() {
    var q = questions[index];
    countEl.textContent = index + 1 + " / " + questions.length;
    barEl.style.width = ((index / questions.length) * 100).toFixed(1) + "%";
    questionEl.textContent = q.q;
    backEl.hidden = index === 0;

    choicesEl.innerHTML = "";
    (q.choices || []).forEach(function (choice, i) {
      var label = typeof choice === "string" ? choice : choice.t;
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "choice";
      btn.textContent = label;
      if (picks[index] === i) btn.classList.add("picked");
      btn.addEventListener("click", function () {
        pick(i);
      });
      choicesEl.appendChild(btn);
    });
  }

  function pick(i) {
    picks[index] = i;
    if (index < questions.length - 1) {
      index += 1;
      render();
    } else {
      finish();
    }
  }

  function back() {
    if (index === 0) return;
    index -= 1;
    render();
  }

  function scoreTypeTest() {
    var totals = {};
    (quiz.results || []).forEach(function (r) {
      totals[r.id] = 0;
    });
    picks.forEach(function (choiceIndex, qi) {
      var choice = questions[qi].choices[choiceIndex];
      var scores = (choice && choice.s) || {};
      Object.keys(scores).forEach(function (id) {
        totals[id] = (totals[id] || 0) + scores[id];
      });
    });
    // 동점이면 results에 먼저 적힌 유형이 이긴다. 순서가 곧 우선순위다.
    var best = null;
    (quiz.results || []).forEach(function (r) {
      if (best === null || totals[r.id] > totals[best]) best = r.id;
    });
    return best;
  }

  function scoreTrivia() {
    var correct = 0;
    picks.forEach(function (choiceIndex, qi) {
      if (questions[qi].answer === choiceIndex) correct += 1;
    });
    // min 내림차순으로 훑어 처음 만족하는 구간을 쓴다.
    var bands = (quiz.results || []).slice().sort(function (a, b) {
      return (b.min || 0) - (a.min || 0);
    });
    for (var i = 0; i < bands.length; i += 1) {
      if (correct >= (bands[i].min || 0)) return bands[i].id;
    }
    return bands.length ? bands[bands.length - 1].id : null;
  }

  function finish() {
    barEl.style.width = "100%";
    var id = format === "trivia" ? scoreTrivia() : scoreTypeTest();
    if (!id) return;
    location.href = base + id + "/";
  }

  document.getElementById("quiz-start").addEventListener("click", start);
  backEl.addEventListener("click", back);
})();
