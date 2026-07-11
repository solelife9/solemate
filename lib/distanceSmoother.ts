// ─── 거리 적산용 중심 이동평균 평활기 ─────────────────────────────────────
// GPS 지터가 거리로 적산되는 것(fix 간 미세 톱니 = 실측 +9% 과대의 주범)을,
// '채택된 좌표 스트림'을 중심 이동평균(기본 5점)한 좌표열의 폴리라인 길이로
// 거리를 재는 방식으로 소거한다. 2026-07-11 실측 비교런의 저장 궤적을 5점
// 평활로 재계산하면 NRC 와 ±0.5% 일치 — 이 모듈은 그 검증된 연산을 라이브
// 적산으로 옮긴 것이다(합성 하네스 9개 시나리오 검증 포함).
//
// 특성:
//  • 지연: 중심 창이라 (W-1)/2 fix(기본 2초) 늦게 거리가 붙는다. 화면 체감 없음.
//  • 무손실: 구간 종료(flush) 시 남은 꼬리를 좁아지는 창으로 방출 — 달린 거리는
//    반드시 계상된다. 경계(일시정지/재앵커)를 가로지르는 거리는 앵커 규약과
//    동일하게 계상하지 않는다(허위 세그먼트 방지).
//  • 순수/불변 입력: 이 모듈은 좌표를 검증하지 않는다 — 채택 게이트(acceptSegment)
//    를 통과한 좌표만 먹인다는 전제(runTracker 가 보장).

import {calcDist, LatLon} from './geo';

/** 채택 좌표 스트림 → 중심 이동평균 좌표 간 거리 적산기.
 *
 *  창은 구간 머리/꼬리에서 '대칭으로' 좁힌다(중심 c 의 반경 r = min(half, c, 끝까지)).
 *  비대칭 창은 짧은 구간(점 ≤ 창)의 모든 평활점이 같은 평균으로 붕괴해 거리가 0 이
 *  되는 유실을 만든다 — 대칭 좁힘이면 첫/끝 점은 원좌표 그대로라 n=2 구간도 원거리
 *  전부가 계상된다(무손실 불변식, distanceSmoother.test 가 고정). */
export class DistanceSmoother {
  private buf: LatLon[] = [];
  private lastOut: LatLon | null = null;
  private nextC = 0; // 아직 방출하지 않은 첫 중심 인덱스
  private acc = 0; // km

  /** @param w 중심 이동평균 창(홀수 권장). 1 이하면 평활 없음(직결). */
  constructor(private readonly w: number = 5) {}

  /** 지금까지 방출된 평활 폴리라인의 누적 거리(km). 단조 증가. */
  distKm(): number {
    return this.acc;
  }

  private emit(p: LatLon) {
    if (this.lastOut) this.acc += calcDist(this.lastOut.lat, this.lastOut.lon, p.lat, p.lon);
    this.lastOut = p;
  }

  private centerAvg(c: number, r: number): LatLon {
    let lat = 0;
    let lon = 0;
    for (let i = c - r; i <= c + r; i++) {
      lat += this.buf[i].lat;
      lon += this.buf[i].lon;
    }
    const n = 2 * r + 1;
    return {lat: lat / n, lon: lon / n};
  }

  /** 채택 좌표 1점 적립. 대칭 창이 완성된 중심부터 순서대로 방출해 거리를 늘린다. */
  push(p: LatLon) {
    if (this.w <= 1) {
      this.emit(p);
      return;
    }
    this.buf.push(p);
    const half = (this.w - 1) >> 1;
    // 중심 c 는 머리에서 좁힌 반경 r=min(half,c)의 미래점(c+r)까지 모여야 방출 가능.
    for (;;) {
      const c = this.nextC;
      const r = Math.min(half, c);
      if (this.buf.length - 1 < c + r) break;
      this.emit(this.centerAvg(c, r));
      this.nextC++;
    }
  }

  /** 구간 종료(일시정지·재앵커·런 종료·권한동결): 남은 꼬리를 대칭으로 좁아지는
   *  창으로 방출해 달린 거리를 전부 계상하고(마지막 점은 원좌표), 다음 구간과 잇지
   *  않도록 체인을 끊는다. */
  flush() {
    if (this.w > 1) {
      const half = (this.w - 1) >> 1;
      const n = this.buf.length;
      for (let c = this.nextC; c < n; c++) {
        const r = Math.min(half, c, n - 1 - c);
        this.emit(this.centerAvg(c, r));
      }
    }
    this.buf = [];
    this.lastOut = null;
    this.nextC = 0;
  }
}
