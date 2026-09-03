#!/usr/bin/env python3
"""기상청 예보를 받아 data/weather.json 으로 저장한다.

브라우저에서 직접 API 를 부르면 인증키가 그대로 노출된다. 그래서 이 스크립트가
로컬에서 예보를 받아 결과만 저장소에 남기고, Hugo 가 빌드 시점에 그 파일을 심는다.
공휴일(data/holidays)과 같은 방식이다.

GitHub Actions 로 돌리지 않는 이유가 있다. 이 저장소는 public 이라 Actions 로그를
누구나 볼 수 있다. 그리고 이 키에는 + / = 가 들어 있어 URL 에 실리면 %2B %2F %3D 로
바뀌는데, GitHub 의 로그 마스킹은 등록한 값과 글자가 같을 때만 가려서 인코딩된
형태는 걸러지지 않는다. 키를 이 기계 밖으로 내보내지 않는 편이 낫다.
매일 도는 daily-draft.sh 가 이 스크립트를 부른다.

두 API 를 붙여 쓴다. 하나로는 11일이 안 채워진다.
    단기예보  오늘 ~ +3일   (1시간 단위 → 날짜별로 접는다)
    중기예보  +4일 ~ +10일  (오전·오후 → 둘 중 나쁜 쪽을 쓴다)

키는 DATA_GO_KR_KEY 환경변수 또는 .env 에서 읽는다. 명령줄로 받지 않는다.
"""

import collections
import datetime
import json
import os
import sys
import urllib.parse
import urllib.request

# 서울 기준. 단기예보는 격자 좌표, 중기예보는 구역 코드를 쓴다.
NX, NY = 60, 127
MID_LAND_REG = "11B00000"   # 서울·인천·경기도
MID_TA_REG = "11B10101"     # 서울
REGION_NAME = "서울"

SHORT_URL = "http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst"
MID_LAND_URL = "http://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst"
MID_TA_URL = "http://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa"

SKY = {"1": "맑음", "3": "구름많음", "4": "흐림"}
PTY = {"0": "", "1": "비", "2": "비/눈", "3": "눈", "4": "소나기", "5": "비", "6": "비/눈", "7": "눈"}

# 단기예보 발표 시각. 지금보다 이른 것부터 뒤로 훑는다.
BASE_TIMES = ["2300", "2000", "1700", "1400", "1100", "0800", "0500", "0200"]


def key():
    k = os.environ.get("DATA_GO_KR_KEY")
    if k:
        return k.strip()
    env_path = os.path.expanduser("~/blog-automation/.env")
    if os.path.exists(env_path):
        for line in open(env_path, encoding="utf-8"):
            if line.startswith("DATA_GO_KR_KEY="):
                return line.split("=", 1)[1].strip()
    sys.exit("DATA_GO_KR_KEY 를 찾을 수 없습니다")


def scrub(text):
    """키가 섞였을 수 있는 문자열에서 값을 지운다.

    이 키에는 + / = 가 들어 있어 URL 에 실리면 %2B %2F %3D 로 바뀐다.
    원본만 지우면 인코딩된 형태가 그대로 남으니 둘 다 지운다.
    urllib 의 예외 메시지에는 주소가 안 담기지만, 라이브러리가 바뀌거나
    다른 곳에서 감싸면 새어 나올 수 있어 출구를 한 곳으로 모았다.
    """
    k = key()
    out = str(text)
    for form in (k, urllib.parse.quote(k, safe=""), urllib.parse.quote_plus(k)):
        out = out.replace(form, "***")
    return out


def fetch(url, params):
    q = urllib.parse.urlencode(params, safe="")
    full = url + "?serviceKey=" + urllib.parse.quote(key(), safe="") + "&" + q
    req = urllib.request.Request(full, headers={"User-Agent": "curl/8"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            d = json.loads(r.read().decode("utf-8", "replace"))
    except Exception as e:
        # 주소가 담긴 예외를 그대로 올리지 않는다.
        raise RuntimeError("%s 요청 실패: %s" % (url.rsplit("/", 1)[-1], scrub(e)))
    head = d.get("response", {}).get("header", {})
    if head.get("resultCode") not in ("00", "0000"):
        raise RuntimeError("%s: %s" % (head.get("resultCode"), scrub(head.get("resultMsg"))))
    body = d["response"]["body"]["items"]["item"]
    return body if isinstance(body, list) else [body]


def short_term(now):
    """오늘 ~ +3일. 시간별 값을 날짜별로 접는다."""
    last = None
    for back in (0, 1):
        day = now - datetime.timedelta(days=back)
        for t in BASE_TIMES:
            if back == 0 and int(t) > now.hour * 100 + now.minute - 10:
                continue
            try:
                its = fetch(SHORT_URL, {
                    "base_date": day.strftime("%Y%m%d"), "base_time": t,
                    "nx": NX, "ny": NY, "dataType": "JSON",
                    "numOfRows": 1000, "pageNo": 1,
                })
            except Exception as e:  # 발표 전이면 비어 있다. 이전 시각으로 물러난다.
                last = e
                continue
            return its
    raise RuntimeError("단기예보를 받지 못했습니다: %s" % scrub(last))


def fold_short(items):
    by = collections.defaultdict(lambda: collections.defaultdict(list))
    for it in items:
        by[it["fcstDate"]][it["category"]].append((it["fcstTime"], it["fcstValue"]))

    out = {}
    for ymd, cat in by.items():
        date = "%s-%s-%s" % (ymd[:4], ymd[4:6], ymd[6:])

        pops = [int(v) for _, v in cat.get("POP", [])]
        # 하늘 상태는 낮(09~18시)만 본다. 새벽 값까지 섞으면 하루 인상과 어긋난다.
        day_sky = [v for t, v in cat.get("SKY", []) if "0900" <= t <= "1800"]
        day_pty = [v for t, v in cat.get("PTY", []) if "0900" <= t <= "1800"]

        # 비나 눈이 한 번이라도 예보되면 그것을 앞세운다. 맑다고 적어두면 낭패다.
        rain = next((PTY[v] for v in day_pty if v in PTY and PTY[v]), "")
        sky = ""
        if day_sky:
            sky = SKY.get(collections.Counter(day_sky).most_common(1)[0][0], "")

        def num(k):
            vals = cat.get(k, [])
            return round(float(vals[0][1])) if vals else None

        out[date] = {
            "sky": rain or sky or None,
            "pop": max(pops) if pops else None,
            "tmax": num("TMX"),
            "tmin": num("TMN"),
            "src": "단기",
        }
    return out


def mid_term(now):
    """+4일 ~ +10일. tmFc 는 06시·18시 발표만 받는다."""
    cands = []
    if now.hour >= 18:
        cands.append(now.strftime("%Y%m%d") + "1800")
    if now.hour >= 6:
        cands.append(now.strftime("%Y%m%d") + "0600")
    prev = (now - datetime.timedelta(days=1)).strftime("%Y%m%d")
    cands += [prev + "1800", prev + "0600"]

    for tmfc in cands:
        try:
            land = fetch(MID_LAND_URL, {"regId": MID_LAND_REG, "tmFc": tmfc,
                                        "dataType": "JSON", "numOfRows": 10, "pageNo": 1})[0]
            ta = fetch(MID_TA_URL, {"regId": MID_TA_REG, "tmFc": tmfc,
                                    "dataType": "JSON", "numOfRows": 10, "pageNo": 1})[0]
        except Exception:
            continue

        base = datetime.datetime.strptime(tmfc[:8], "%Y%m%d").date()
        out = {}
        for n in range(3, 11):
            date = (base + datetime.timedelta(days=n)).isoformat()
            # 7일까지는 오전·오후로 나뉘고 8일부터는 하루 한 값이다.
            if ("wf%dAm" % n) in land:
                wf = land.get("wf%dPm" % n) or land.get("wf%dAm" % n)
                pops = [land.get("rnSt%dAm" % n), land.get("rnSt%dPm" % n)]
            elif ("wf%d" % n) in land:
                wf = land.get("wf%d" % n)
                pops = [land.get("rnSt%d" % n)]
            else:
                continue
            pops = [int(p) for p in pops if p is not None]
            out[date] = {
                "sky": wf or None,
                "pop": max(pops) if pops else None,
                "tmax": ta.get("taMax%d" % n),
                "tmin": ta.get("taMin%d" % n),
                "src": "중기",
            }
        if out:
            return out, tmfc
    raise RuntimeError("중기예보를 받지 못했습니다")


def main():
    kst = datetime.timezone(datetime.timedelta(hours=9))
    now = datetime.datetime.now(kst)

    mid, tmfc = mid_term(now)
    short = fold_short(short_term(now))

    # 겹치는 날은 단기예보를 앞세우되 항목 단위로 합친다. 통째로 덮어쓰면
    # 단기예보가 끝자락을 일부만 담은 날에 최고기온이 사라진다.
    days = dict(mid)
    for date, s in short.items():
        merged = {"sky": None, "pop": None, "tmax": None, "tmin": None}
        merged.update(days.get(date, {}))
        for k in ("sky", "pop", "tmax", "tmin"):
            if s.get(k) is not None:
                merged[k] = s[k]
        merged["src"] = "단기+중기" if date in mid else "단기"
        days[date] = merged

    days = {k: v for k, v in sorted(days.items()) if k >= now.date().isoformat()}

    out = {
        "region": REGION_NAME,
        "fetched": now.isoformat(timespec="seconds"),
        "tmFc": tmfc,
        "days": days,
    }

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = os.path.join(root, "data", "weather.json")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")

    print("%s 에 %d일 저장 (%s ~ %s)" %
          (path, len(days), min(days), max(days)))
    for d in sorted(days):
        v = days[d]
        g = lambda k: v.get(k) if v.get(k) is not None else "-"
        print("  %s  %-8s %3s%%  %s / %s  [%s]" %
              (d, g("sky"), g("pop"), g("tmax"), g("tmin"), v.get("src", "-")))


if __name__ == "__main__":
    # 예상 못 한 예외에도 주소가 새지 않게 마지막 관문을 둔다.
    try:
        main()
    except Exception as e:
        sys.exit(scrub(e))
