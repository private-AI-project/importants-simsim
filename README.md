# 심심풀이

성격 테스트와 내기 게임 모음. https://simsim.importants-studio.com

Hugo(테마 없음) + GitHub Pages. `main`에 push하면 Actions가 배포한다.

## 구조

- `content/quizzes/_content.gotmpl` — `data/quizzes/*.json` 하나당 퀴즈 페이지와 결과 페이지를 만든다.
  결과를 별도 URL로 두는 이유는 카카오톡 공유 미리보기가 결과별로 다르게 뜨게 하기 위해서다.
- `content/games/` — 게임. 레이아웃과 JS를 각자 가진다.
- `static/js/party.js` — 내기 게임 공용 모듈(이름 추가, 능력치, 방장 조작, 결과 복사).

## 검증

게임 로직은 브라우저 없이 node로 돌려 공정성과 조작 성공률을 잰다.
능력치가 한쪽으로 쏠리거나 특정 이름이 자주 이기면 뽑기 도구로 쓸 수 없다.
