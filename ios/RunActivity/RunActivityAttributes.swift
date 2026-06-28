// RunActivityAttributes.swift — Live Activity 데이터 모델(앱·위젯 익스텐션 공유)
// ⚠️ 이 파일은 'SoleMate'(앱)와 'RunActivity'(위젯) 두 타깃 모두에 멤버십을 넣어야 한다
// (앱은 Activity 시작/갱신, 위젯은 렌더). Xcode 의 File Inspector > Target Membership 에서
// 두 타깃 모두 체크.
import ActivityKit
import Foundation

struct RunActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    var distanceKm: Double
    var elapsedSec: Int
    var paceLabel: String     // 현재 페이스 e.g. "6'12\""
    var avgPaceLabel: String  // 평균 페이스
    var cadenceSpm: Int       // 케이던스(분당 스텝, spm). 0이면 미측정('--' 표시)
  }

  // 정적(러닝 동안 불변) 속성
  var shoeName: String
  var goalKm: Double          // 0 이면 목표 없음
}
