// ============================================================================
// RecapShareCard.tsx — 기간 리캡(주간/월간) 공유 카드(이미지) · 컴팩트 언어
// ----------------------------------------------------------------------------
// 런 공유 카드(ShareCard.tsx)와 같은 시각 언어로 그린 1080×1350(4:5) 완성본 카드:
// 다크 라디얼 배경 · 흰 지표(caps 라벨 + 굵은 값, 그림자) · 성취(PR)는 파파야 리본 ·
// 좌상 keego 파파야 워드마크. 부모가 넘긴 ref가 내부 <Svg>에 연결되어 toDataURL()로
// PNG를 얻어 공유한다(lib/shareCard shareRecapCard). 새 네이티브 의존 0.
//
// 크기(심사 P2 #24): 구 1080×1080 정사각 → Medal/RunnerSpec 과 동일한 1080×1350
// (인스타 피드 4:5)로 통일. 상단 워드마크(y=168)·하단 헤어라인+푸터(CARD_H-150/-88)의
// 상하 마진 리듬은 MedalShareCard 를 그대로 따른다.
//
// 빈 리캡(런 0개)이면 수치 대신 keep-going 카피(A8-5)만 중앙에 보여 준다.
// ============================================================================
import React from 'react';
import Svg, {Rect, Line, Text as SvgText, Defs, RadialGradient, Stop, G} from 'react-native-svg';
import {FONT, T1, RING_ACCENT, CARD_BORDER} from './theme';
import {SHARE_DARK_STOPS, SHARE_TEXT_SHADOW} from './theme.palettes';
import {WORDMARK_FONT} from './primitives';
import {RecapShareCardModel} from './lib/shareCard';

const CF = WORDMARK_FONT;

// 1080×1350(4:5) — Medal/RunnerSpec 공유 카드와 동일 출력 해상도(심사 #24 통일).
export const CARD_W = 1080;
export const CARD_H = 1350;
const PAD = 88;
const CX = CARD_W / 2;

// 사진 없는 다크 완성본이지만 런 카드와 동일 문법 유지 — 어두운 복사본 그림자(무해).
// 본문 폰트=FONT(Pretendard) — 한글(기간·빈 리캡 카피)에 WORDMARK_FONT(Helvetica)가
// 걸리던 것 회수(감사 #57). 라틴 로고타입만 font=CF 로 덮는다.
function Tx({x, y, size, weight, anchor = 'middle', ls = 0, opacity = 1, fill = T1, font = FONT, children}: {
  x: number; y: number; size: number; weight: '500' | '600' | '700' | '800';
  anchor?: 'start' | 'middle' | 'end'; ls?: number; opacity?: number; fill?: string; font?: string;
  children: string;
}) {
  const dy = Math.max(2, Math.round(size * 0.04));
  return (
    <>
      <SvgText x={x + 2} y={y + dy} fill={SHARE_TEXT_SHADOW} fillOpacity={0.45} fontFamily={font} fontSize={size} fontWeight={weight} letterSpacing={ls} textAnchor={anchor}>{children}</SvgText>
      <SvgText x={x} y={y} fill={fill} fillOpacity={opacity} fontFamily={font} fontSize={size} fontWeight={weight} letterSpacing={ls} textAnchor={anchor}>{children}</SvgText>
    </>
  );
}

/** 폭에 맞춰 폰트 크기를 줄인다(긴 신발명·PR 문자열 오버플로 방지). */
function fitSize(text: string, base: number, maxW: number): number {
  const w = text.length * base * 0.56;
  return w <= maxW ? base : Math.max(22, Math.floor(maxW / (text.length * 0.56)));
}

export interface RecapShareCardProps {
  model: RecapShareCardModel;
}

const RecapShareCard = React.forwardRef<unknown, RecapShareCardProps>(({model}, ref) => {
  // 히어로 거리 — 자릿수가 늘면(1000km+) 폭에 맞춰 축소.
  const hero = `${model.distance} ${model.unit}`;
  const heroSize = fitSize(hero, 190, CARD_W - PAD * 2);

  // 지표 3셀(RUNS · AVG PACE · TOP SHOE) — 카드 가로 균등 분할.
  const span = CARD_W * 0.92;
  const x0 = (CARD_W - span) / 2;
  const slot = span / Math.max(model.stats.length, 1);

  // PR 리본 — 성취는 파파야(런 카드 '기록' 리본과 동일 문법). 전부 한 줄로 잇는다.
  const prLine = model.prs.map(pr => `${pr.label} ${pr.value}`).join('  ·  ');
  const prSize = prLine ? fitSize(`★  ${prLine}`, 34, CARD_W - PAD * 2 - 96) : 0;
  const prW = prLine ? Math.min(CARD_W - PAD * 2, Math.round(prLine.length * prSize * 0.56 + 96 + 54)) : 0;

  return (
    <Svg ref={ref as never} width={CARD_W} height={CARD_H}>
      <Defs>
        <RadialGradient id="recap-dark" cx="50%" cy="18%" r="110%">
          <Stop offset="0" stopColor={SHARE_DARK_STOPS[0]} /><Stop offset="0.55" stopColor={SHARE_DARK_STOPS[1]} /><Stop offset="1" stopColor={SHARE_DARK_STOPS[2]} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={CARD_W} height={CARD_H} fill="url(#recap-dark)" />

      {/* keego 워드마크(파파야) — 4종 통일: 54px·좌상 코너(구 하단 중앙에서 이동, 감사 #57) */}
      <Tx x={PAD} y={168} size={54} weight="500" ls={-0.5} anchor="start" fill={RING_ACCENT} font={CF}>{model.brand.toLowerCase()}</Tx>

      {/* 상단: caps 타이틀 + 기간 — 4:5 캔버스에 맞춰 워드마크 아래로 한 호흡(84px) 띄운다. */}
      <Tx x={CX} y={252} size={34} weight="700" ls={6} opacity={0.85}>{model.titleEn}</Tx>
      <Tx x={CX} y={316} size={36} weight="500" opacity={0.62}>{model.period}</Tx>

      {model.isEmpty ? (
        // 빈 리캡 — keep-going 카피만(A8-5). 수치/PR 없음. 헤더(316)와 푸터(1200) 사이
        // 시각 중앙에 앉힌다.
        <Tx x={CX} y={760} size={40} weight="500" opacity={0.85}>{model.emptyCopy}</Tx>
      ) : (
        <G>
          {/* 히어로: 총거리 — 카드 상단 1/3 경계 아래, 세로 확장분을 히어로 호흡에 배분. */}
          <Tx x={CX} y={520} size={28} weight="700" ls={2} opacity={0.8}>DISTANCE</Tx>
          <Tx x={CX} y={688} size={heroSize} weight="800" ls={-4}>{hero}</Tx>

          {/* 지표 3셀 */}
          {model.stats.map((st, i) => {
            const cx = x0 + slot * i + slot / 2;
            const vSize = fitSize(st.value, 54, slot * 0.94);
            return (
              <G key={st.label}>
                <Tx x={cx} y={884} size={28} weight="700" ls={2} opacity={0.8}>{st.label}</Tx>
                <Tx x={cx} y={884 + vSize + 20} size={vSize} weight="800" ls={-0.5}>{st.value}</Tx>
              </G>
            );
          })}

          {/* 개인 기록(PR) 리본 — 성취=파파야 */}
          {!!prLine && (
            <G>
              <Rect x={CX - prW / 2} y={1032} width={prW} height={76} rx={38} fill={RING_ACCENT} fillOpacity={0.16} stroke={RING_ACCENT} strokeOpacity={0.5} strokeWidth={2.5} />
              <SvgText x={CX - prW / 2 + Math.round(prSize * 1.1)} y={1032 + 38 + Math.round(prSize * 0.36)} fontFamily={CF} fontSize={prSize} fill={RING_ACCENT}>★</SvgText>
              <SvgText x={CX + Math.round(prSize * 0.65)} y={1032 + 38 + Math.round(prSize * 0.36)} fontFamily={CF} fontSize={prSize} fontWeight="800" fill={RING_ACCENT} textAnchor="middle" letterSpacing={0.5}>{prLine}</SvgText>
            </G>
          )}
        </G>
      )}

      {/* 푸터 — Medal 카드와 동일 리듬(헤어라인 CARD_H-150 · 캡션 CARD_H-88). 해시태그로
          공유 카드 관례를 따른다(빈 리캡 카피의 'keep going' 문장 중복도 피함). */}
      <Line x1={PAD} y1={CARD_H - 150} x2={CARD_W - PAD} y2={CARD_H - 150} stroke={CARD_BORDER} strokeWidth={2} />
      <Tx x={CX} y={CARD_H - 88} size={30} weight="600" opacity={0.62}>{model.hashtag}</Tx>
    </Svg>
  );
});

RecapShareCard.displayName = 'RecapShareCard';

export default RecapShareCard;
