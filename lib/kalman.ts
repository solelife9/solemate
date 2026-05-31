// ─── 1-D constant-position Kalman filter for GPS smoothing ───────
// Extracted verbatim (behavior-preserving) from App.tsx. Smooths lat/lon using
// the reported accuracy as measurement variance and a fixed process noise Q.

export class KalmanFilter {
  private v = -1;
  private lat = 0;
  private lon = 0;
  private ts = 0;
  private readonly Q = 3;

  process(lat: number, lon: number, acc: number, ts: number): {lat: number; lon: number} {
    if (this.v < 0) {
      this.lat = lat;
      this.lon = lon;
      this.v = acc * acc;
      this.ts = ts;
      return {lat, lon};
    }
    const dt = Math.max((ts - this.ts) / 1000, 0);
    this.ts = ts;
    this.v += dt * this.Q * this.Q;
    const K = this.v / (this.v + acc * acc);
    this.lat += K * (lat - this.lat);
    this.lon += K * (lon - this.lon);
    this.v = (1 - K) * this.v;
    return {lat: this.lat, lon: this.lon};
  }

  reset() {
    this.v = -1;
  }
}
