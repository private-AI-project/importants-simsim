// 결과를 밖으로 내보내는 버튼. 게임 여섯 개와 정산 계산기가 같이 쓴다.
//
// 그동안은 결과 글만 복사했다. 받은 사람은 이게 어디서 나온 건지 알 수 없어서
// 거기서 끝났다. 주소를 같이 보내야 단톡방에 한 번 뿌린 것이 다음 사람을 데려온다.
//
// navigator.share 가 있으면 공유 시트를 연다. 모바일에서 카톡까지 한 번에 간다.
// 없으면(대부분 데스크톱) 클립보드로 떨어뜨린다.
window.ResultShare = (function () {
    "use strict";

    // 쿼리와 해시는 뗀다. 게임 중간 상태나 남의 명단이 주소에 실려 나가면 안 된다.
    function pageUrl() {
        return location.origin + location.pathname;
    }

    function payload(lines) {
        return lines.filter(function (l) { return l !== undefined && l !== null; })
            .join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n\n" + pageUrl();
    }

    function flash(btn, msg) {
        var original = btn.dataset.origLabel || btn.textContent;
        btn.dataset.origLabel = original;
        btn.textContent = msg;
        setTimeout(function () { btn.textContent = original; }, 1800);
    }

    function send(btn, lines, title) {
        if (!lines || !lines.length) return;
        var text = payload(lines);

        if (navigator.share) {
            // 취소도 reject 로 온다. 사용자가 그만둔 것이므로 아무 말 없이 넘어간다.
            navigator.share({ title: title || document.title, text: text }).catch(function () {});
            return;
        }
        navigator.clipboard.writeText(text).then(
            function () { flash(btn, "복사됨 (붙여넣기)"); },
            function () { flash(btn, "복사 실패"); }
        );
    }

    function wire(btnId, getLines, title) {
        var btn = document.getElementById(btnId);
        if (!btn) return;
        // 공유 시트가 열리는 기기에서는 '복사'가 아니라 '보내기'가 맞는 말이다.
        if (navigator.share) btn.textContent = "결과 보내기";
        btn.addEventListener("click", function () { send(btn, getLines(), title); });
    }

    return { wire: wire, send: send, pageUrl: pageUrl };
})();
