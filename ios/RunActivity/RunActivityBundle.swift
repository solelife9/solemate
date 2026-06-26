// RunActivityBundle.swift — 위젯 번들. 우리는 Live Activity 하나만 쓴다(홈 위젯/컨트롤 제거).
import WidgetKit
import SwiftUI

@main
struct RunActivityBundle: WidgetBundle {
    var body: some Widget {
        RunActivityLiveActivity()
    }
}
