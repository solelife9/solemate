// ============================================================================
// scripts/gen-feature-graphic.swift — Play 스토어 피처 그래픽(1024×500) 렌더
// ============================================================================
// 실행:  swift scripts/gen-feature-graphic.swift
// 산출:  docs/launch/assets/feature-graphic-1024x500.png  (24비트 PNG · 알파 없음)
//
// 시안 = 「마모」(2026-08-15 민우님 확정). 링 다섯 개가 왼쪽에서 오른쪽으로 닳아 가며,
// '달릴수록 줄어든다'를 글이 아니라 형태로 말한다.
//
// **왜 Swift + CoreText 인가**: Pretendard 실폰트로 구워야 앱과 같은 글자가 된다.
// 앱 아이콘도 CoreGraphics 로 구웠다(`78a8db6`). 외부 의존성 0.
//
// 링 기하는 앱 아이콘에서 실측한 것과 같은 규칙을 쓴다(획폭 = 바깥반지름의 31.09%).
// 다만 여기서는 **로고가 아니라 게이지**라 12시에서 시계방향으로 채운다 —
// 앱이 실제로 그리는 수명 링과 같은 방향이다.
//
// ⚠️ Play 규격: 1024×500 고정 · JPEG 또는 **24비트 PNG(알파 없음)**.
//    알파가 섞이면 업로드가 거부된다. 그래서 RGB 로만 인코딩한다.
import Foundation
import CoreGraphics
import CoreText
import ImageIO
import UniformTypeIdentifiers

// ── 캔버스 ───────────────────────────────────────────────────────────────────
let W = 1024, H = 500

// ── 브랜드 정본 (DESIGN.md §1) ───────────────────────────────────────────────
func rgb(_ hex: UInt32) -> CGColor {
    CGColor(red:   CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >>  8) & 0xFF) / 255,
            blue:  CGFloat( hex        & 0xFF) / 255, alpha: 1)
}
let BG     = rgb(0x0A0A0A)   // 배경
let EMBER  = rgb(0xFF8000)   // Keego Ember — 링 전용
let TRACK  = rgb(0x2C2C2E)   // 링 트랙(빈 부분)
let TEXT1  = rgb(0xFFFFFF)
let TEXT2  = rgb(0x9C9CA3)

// ── 폰트 ─────────────────────────────────────────────────────────────────────
let fontURL = URL(fileURLWithPath: "assets/fonts/PretendardVariable.ttf")
guard FileManager.default.fileExists(atPath: fontURL.path) else {
    FileHandle.standardError.write("폰트를 못 찾음: \(fontURL.path) — 저장소 루트에서 실행하세요\n".data(using: .utf8)!)
    exit(1)
}
var fontErr: Unmanaged<CFError>?
CTFontManagerRegisterFontsForURL(fontURL as CFURL, .process, &fontErr)

/// 가변 축 'wght'(id 2003265652) 를 지정해 원하는 굵기의 인스턴스를 만든다.
let WGHT_AXIS: CFNumber = 2003265652 as CFNumber
func pretendard(_ size: CGFloat, _ weight: CGFloat) -> CTFont {
    let base = CTFontCreateWithName("Pretendard Variable" as CFString, size, nil)
    let desc = CTFontDescriptorCreateCopyWithAttributes(
        CTFontCopyFontDescriptor(base),
        [kCTFontVariationAttribute: [WGHT_AXIS: weight]] as CFDictionary)
    return CTFontCreateWithFontDescriptor(desc, size, nil)
}

// ── 컨텍스트 (알파 없음) ─────────────────────────────────────────────────────
guard let ctx = CGContext(data: nil, width: W, height: H, bitsPerComponent: 8,
                          bytesPerRow: W * 4, space: CGColorSpaceCreateDeviceRGB(),
                          bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else {
    FileHandle.standardError.write("컨텍스트 생성 실패\n".data(using: .utf8)!); exit(1)
}
ctx.setShouldAntialias(true)
ctx.setAllowsAntialiasing(true)
// 서브픽셀 AA 는 글자 가장자리에 색 번짐을 남긴다 — 이미지 자산에서는 끈다.
ctx.setShouldSmoothFonts(false)
ctx.setAllowsFontSmoothing(false)

ctx.setFillColor(BG)
ctx.fill(CGRect(x: 0, y: 0, width: W, height: H))

/// SVG 좌표(위에서 아래)를 CoreGraphics 좌표(아래에서 위)로.
func flip(_ y: CGFloat) -> CGFloat { CGFloat(H) - y }

// ── 링 다섯 개 ───────────────────────────────────────────────────────────────
let centers: [CGFloat] = [172, 342, 512, 682, 852]   // 간격 170 — 양옆 여백 11%
let pcts:    [CGFloat] = [1.00, 0.78, 0.54, 0.30, 0.08]
let ringY  = flip(171)                                // 광학 중심 보정: 25px 위로
let radius: CGFloat = 45      // 중심선 반지름
let stroke: CGFloat = 18      // 획폭/반지름 ≈ 앱 아이콘 실측 비율

ctx.setLineWidth(stroke)

// 트랙 먼저 (빈 부분이 보여야 '닳았다'가 읽힌다)
ctx.setStrokeColor(TRACK)
ctx.setLineCap(.butt)
for cx in centers {
    ctx.addEllipse(in: CGRect(x: cx - radius, y: ringY - radius, width: radius * 2, height: radius * 2))
    ctx.strokePath()
}

// 채워진 아크 — 12시에서 시계방향
ctx.setStrokeColor(EMBER)
ctx.setLineCap(.round)
let top = CGFloat.pi / 2                       // y-up 좌표에서 12시
for (cx, p) in zip(centers, pcts) {
    if p >= 1.0 {
        ctx.setLineCap(.butt)                  // 한 바퀴는 캡이 겹쳐 혹이 생긴다
        ctx.addEllipse(in: CGRect(x: cx - radius, y: ringY - radius, width: radius * 2, height: radius * 2))
        ctx.strokePath()
        ctx.setLineCap(.round)
    } else {
        // y-up 에서 각도가 줄어드는 방향 = 화면상 시계방향
        ctx.addArc(center: CGPoint(x: cx, y: ringY), radius: radius,
                   startAngle: top, endAngle: top - 2 * .pi * p, clockwise: true)
        ctx.strokePath()
    }
}

// ── 글자 ─────────────────────────────────────────────────────────────────────
/// 가운데 정렬로 한 줄 그린다. kern 은 자간(음수면 좁아진다).
func drawCentered(_ text: String, font: CTFont, color: CGColor, baselineSVG: CGFloat, kern: CGFloat = 0) {
    // AppKit 을 링크하지 않으므로 CoreText 상수를 직접 쓴다
    // (`.font`·`.kern` 같은 편의 멤버는 AppKit/UIKit 쪽에 있다).
    var attrs: [NSAttributedString.Key: Any] = [
        NSAttributedString.Key(kCTFontAttributeName as String): font,
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): color,
    ]
    if kern != 0 {
        attrs[NSAttributedString.Key(kCTKernAttributeName as String)] = kern
    }
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attrs))
    var ascent: CGFloat = 0, descent: CGFloat = 0, leading: CGFloat = 0
    let advance = CGFloat(CTLineGetTypographicBounds(line, &ascent, &descent, &leading))
    // 마지막 글자 뒤에도 kern 이 붙으므로 빼고 가운데를 잡는다.
    let width = advance - kern
    ctx.textPosition = CGPoint(x: (CGFloat(W) - width) / 2, y: flip(baselineSVG))
    CTLineDraw(line, ctx)
}

drawCentered("달린 만큼 줄어듭니다",
             font: pretendard(54, 800), color: TEXT1, baselineSVG: 327, kern: -54 * 0.03)
drawCentered("러닝화 수명을 자동으로 세고, 교체할 때를 미리 알려드려요",
             font: pretendard(23, 400), color: TEXT2, baselineSVG: 379)

// ── 저장 ─────────────────────────────────────────────────────────────────────
guard let image = ctx.makeImage() else {
    FileHandle.standardError.write("이미지 생성 실패\n".data(using: .utf8)!); exit(1)
}
let outDir = URL(fileURLWithPath: "docs/launch/assets")
try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
let outURL = outDir.appendingPathComponent("feature-graphic-1024x500.png")

guard let dest = CGImageDestinationCreateWithURL(outURL as CFURL, UTType.png.identifier as CFString, 1, nil) else {
    FileHandle.standardError.write("PNG 대상 생성 실패\n".data(using: .utf8)!); exit(1)
}
CGImageDestinationAddImage(dest, image, nil)
guard CGImageDestinationFinalize(dest) else {
    FileHandle.standardError.write("PNG 쓰기 실패\n".data(using: .utf8)!); exit(1)
}

let bytes = (try? Data(contentsOf: outURL).count) ?? 0
print("완료: \(outURL.path)")
print("  \(W)×\(H) · \(bytes / 1024)KB · 알파 없음")
