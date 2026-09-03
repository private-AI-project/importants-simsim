// 결과 공유 버튼. 계산기 쪽과 같은 3종(네이티브·X·링크복사) 패턴.
(function () {
  "use strict";

  var box = document.querySelector(".share");
  if (!box) return;

  // 페이지가 뜬 시점에 값을 잡아두면, 화면 안에서 결과가 바뀌는 도구에서는
  // 옛 문구와 옛 주소를 공유하게 된다. 누를 때마다 다시 읽는다.
  function shareText() {
    return box.getAttribute("data-share-text") || document.title;
  }
  function shareUrl() {
    return box.getAttribute("data-share-url") || location.href;
  }

  function copyTo(btn, value, done) {
    var original = btn.textContent;
    navigator.clipboard.writeText(value).then(function () {
      btn.textContent = done;
      setTimeout(function () {
        btn.textContent = original;
      }, 2000);
    });
  }

  box.querySelectorAll("[data-share]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var mode = btn.getAttribute("data-share");
      var text = shareText();
      var url = shareUrl();
      if (mode === "native") {
        if (navigator.share) {
          navigator.share({ title: text, text: text, url: url }).catch(function () {});
        } else {
          copyTo(btn, text + "\n" + url, "복사됨 (카톡에 붙여넣기)");
        }
      } else if (mode === "x") {
        window.open(
          "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text) +
            "&url=" + encodeURIComponent(url),
          "_blank",
          "noopener"
        );
      } else {
        copyTo(btn, url, "링크 복사됨");
      }
    });
  });
})();
