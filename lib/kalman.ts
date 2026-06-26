// ─── 2-D constant-velocity Kalman filter for GPS smoothing ──────────────────
// 위치만 평활하던 1-D constant-position 필터를 '속도 상태'를 가진 2-D constant-velocity
// (CV) 모델로 교체한다. 등속 가정으로 다음 위치를 예측하고, 보고된 정확도를 측정 잡음으로
// 융합해 더 안정적인 트랙을 만든다(지터로 인한 가짜 거리 누적을 줄임).
//
// 좌표는 첫 fix 를 원점으로 한 로컬 ENU 미터(x=동, y=북)로 변환해 처리한 뒤 위/경도로 되돌린다.
// x·y 는 독립이라 동일한 축별 2-상태(위치·속도) 필터 둘로 분리한다(CV 정석, 행렬이 2x2로 단순).
//
// 이상치 처리는 '하드 거부'가 아니라 '다운웨이트'다 — 예측과 크게 어긋나는 fix(정규화 혁신
// 제곱 NIS 가 게이트 초과)는 측정 잡음 R 을 키워 영향만 줄인다. 하드 거부는 진짜 움직임까지
// 버려 과소측정(거리 동결)을 부를 수 있어 의도적으로 피한다. 그로스 이상치는 엔진의
// acceptSegment(속도/거리 캡)가 별도로 막으므로 여기선 보수적으로만 둔다.

// 위도 1도 ≈ 111,320 m. 경도 1도는 위도에 따라 cos 배.
const M_PER_DEG_LAT = 111320;

// 프로세스 잡음(가속도 PSD, (m/s²)²). 러닝의 페이스 변화·코너를 따라갈 만큼은 크고, 트랙이
// 측정 노이즈를 좇아 출렁이지 않을 만큼은 작게. 보수적으로 1.4 m/s² 수준.
const ACCEL_PSD = 1.4 * 1.4;
// 측정 정확도 하한(m) — 보고 정확도가 비현실적으로 작아도 R 이 0 이 되지 않게.
const MIN_ACC_M = 3;
// 이상치 게이트(2-DOF NIS). χ²(2) 99.9% ≈ 13.8 보다 넉넉히 둬(=25) 명백한 이상치만 다운웨이트.
const NIS_GATE = 25;
// 다운웨이트 배수 — 게이트 초과 fix 의 R 을 키워 영향만 줄인다(완전 무시 아님).
const OUTLIER_INFLATE = 10;
// 초기 속도 분산(매우 불확실 — 첫 몇 fix 로 빠르게 수렴).
const INIT_VEL_VAR = 100;
// 이 시간(초)을 넘는 fix 간 공백은 '재측위'로 처리 — 누적 속도/공분산을 버리고 새 fix 를
// 신뢰한다(정상 주행은 ~1Hz 라 8초 공백은 실제 신호 손실). 공백 후 overshoot/과소측정 방지.
const GAP_REACQUIRE_S = 8;
// 재측위 시 위치 분산(m²) — 공백 동안 실제 위치가 불확실하므로 크게 잡아, 직후 fix 들을
// 강하게 신뢰해 빠르게 재수렴한다((20m)²). 작게 두면 과확신해 직후 이동을 덜 좇아 누적이
// 한 fix 늦어진다. 첫 fix(시작) init 은 워밍업이 흡수하므로 작은 분산이라도 무방.
const REACQUIRE_POS_VAR = 400;

/** 축별 2-상태(위치 p, 속도 v) KF. 공분산 P 는 2x2([[P00,P01],[P10,P11]]). */
class Axis {
  p = 0;
  v = 0;
  P00 = 0; P01 = 0; P10 = 0; P11 = 0;

  init(p0: number, posVar: number) {
    this.p = p0; this.v = 0;
    this.P00 = posVar; this.P01 = 0; this.P10 = 0; this.P11 = INIT_VEL_VAR;
  }

  /** 예측: x=Fx, P=FPF'+Q. F=[[1,dt],[0,1]], Q 는 가속도 PSD 기반. */
  predict(dt: number) {
    this.p += this.v * dt;
    const {P00, P01, P10, P11} = this;
    // FPF'
    const n00 = P00 + dt * (P01 + P10) + dt * dt * P11;
    const n01 = P01 + dt * P11;
    const n10 = P10 + dt * P11;
    const n11 = P11;
    // Q (continuous white-noise accel)
    const q00 = ACCEL_PSD * dt * dt * dt / 3;
    const q01 = ACCEL_PSD * dt * dt / 2;
    const q11 = ACCEL_PSD * dt;
    this.P00 = n00 + q00; this.P01 = n01 + q01;
    this.P10 = n10 + q01; this.P11 = n11 + q11;
  }

  /** 위치 측정 z(분산 r)로 갱신. 반환: 정규화 혁신 제곱(NIS) = innov²/S. */
  update(z: number, r: number): number {
    const S = this.P00 + r;
    const innov = z - this.p;
    const K0 = this.P00 / S;
    const K1 = this.P10 / S;
    this.p += K0 * innov;
    this.v += K1 * innov;
    // P = (I-KH)P, H=[1,0]
    const P00 = this.P00, P01 = this.P01;
    this.P00 = (1 - K0) * P00;
    this.P01 = (1 - K0) * P01;
    this.P10 = this.P10 - K1 * P00;
    this.P11 = this.P11 - K1 * P01;
    return (innov * innov) / S;
  }
}

export class KalmanFilter {
  private inited = false;
  private lat0 = 0;
  private lon0 = 0;
  private mPerDegLon = M_PER_DEG_LAT;
  private ts = 0;
  private x = new Axis(); // east (m)
  private y = new Axis(); // north (m)

  process(lat: number, lon: number, acc: number, ts: number): {lat: number; lon: number} {
    const a = Math.max(acc, MIN_ACC_M);
    if (!this.inited) {
      this.inited = true;
      this.lat0 = lat; this.lon0 = lon;
      this.mPerDegLon = M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
      this.ts = ts;
      this.x.init(0, a * a);
      this.y.init(0, a * a);
      return {lat, lon};
    }
    // 측정 좌표(로컬 미터)
    const zx = (lon - this.lon0) * this.mPerDegLon;
    const zy = (lat - this.lat0) * M_PER_DEG_LAT;

    const dt = (ts - this.ts) / 1000;
    this.ts = ts;
    // 긴 공백(>GAP_REACQUIRE_S)·시간 역행이면 누적 속도/공분산을 버리고 새 fix 로 재측위한다.
    // CV 모델의 속도 상태가 공백을 건너 overshoot 하거나, 정당한 공백-후 재측위를 이상치로
    // 오판해 거리가 과소측정되는 것(0.39km 모드)을 막는다 — 옛 필터의 '공백 후 새 fix 신뢰'와 정합.
    if (dt > GAP_REACQUIRE_S || dt < 0) {
      this.x.init(zx, REACQUIRE_POS_VAR);
      this.y.init(zy, REACQUIRE_POS_VAR);
      return {lat, lon};
    }
    this.x.predict(dt);
    this.y.predict(dt);

    // 이상치 게이트: 예측 대비 정규화 혁신 제곱(NIS). 크면 R 을 키워 영향만 줄인다.
    let r = a * a;
    const Sx = this.x.P00 + r, Sy = this.y.P00 + r;
    const ix = zx - this.x.p, iy = zy - this.y.p;
    const nis = (ix * ix) / Sx + (iy * iy) / Sy;
    if (nis > NIS_GATE) r *= OUTLIER_INFLATE;

    this.x.update(zx, r);
    this.y.update(zy, r);

    return {
      lat: this.lat0 + this.y.p / M_PER_DEG_LAT,
      lon: this.lon0 + this.x.p / this.mPerDegLon,
    };
  }

  /** 현재 추정 속도(m/s) — 속도 상태 기반. 미초기화면 null. (헤딩/현재페이스 보조용). */
  speedMps(): number | null {
    if (!this.inited) return null;
    return Math.hypot(this.x.v, this.y.v);
  }

  reset() {
    this.inited = false;
    this.x = new Axis();
    this.y = new Axis();
  }
}
