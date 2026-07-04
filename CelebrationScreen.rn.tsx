// ============================================================================
// CelebrationScreen.rn.tsx — 풀스크린 셀러브레이션 (design-reference/celebration-*)
//   ① 업적 획득(achievement) — 희귀도 색 메달 + 이름/카테고리/설명 + +XP
//   ② 등급 상승(rankup)     — 등급색 방패(별) + 이전→현재 등급 + 다음까지 XP
//
// 게임이 아니다. 한 순간의 무게를 담는 절제된 연출 — radial 글로우 + ping 링 +
// 스태거 진입(Rise). App 이 progression 델타로 data 를 만들어 오버레이로 띄운다.
// 색은 호출부가 넘긴 tierColor/rarityColor(=theme TIER_COLORS / 희귀도색)만 사용.
// ============================================================================
import React, {useEffect, useRef} from 'react';
import {View, Text, Pressable, StyleSheet, Animated, Easing} from 'react-native';
import Svg, {Defs, RadialGradient, LinearGradient, Stop, Circle, Ellipse, Path} from 'react-native-svg';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {BG, T1, T3, ACCENT, FONT, DISPLAY, RADIUS, HALL_GOLD, withAlpha} from './theme';
import {success, impactHeavy} from './lib/haptics';

export type CelebrationData =
  | {
      type: 'rankup';
      /** 도달한 등급(한글/영문/색). */
      rankKo: string;
      rankName: string;
      rankColor: string;
      /** 직전 등급(한글) — 있으면 "실버 →". */
      prevKo?: string | null;
      /** 다음 등급(한글) + 남은 XP — 없으면 최고 등급 문구. */
      nextKo?: string | null;
      xpToNext?: number;
    }
  | {
      type: 'achievement';
      nameKo: string;
      catKo: string;
      rarityKo: string;
      rarityColor: string;
      /** 메달 글리프 id — 카테고리별 배정(App CELEB_ICON). star 는 등급 상승 전용. */
      icon?: AchIconId;
      xp: number;
      detail: string;
      legendary?: boolean;
    };

type AchIconId = 'medal' | 'trophy' | 'flag' | 'route' | 'run' | 'star' | 'sparkles' | 'infinite';

// ── 아이콘 글리프('러닝의 옷' 2026-07-04 v2) ─────────────────────────────────────
// 손으로 그린 라인 패스는 형태가 뭉개져 폐기(사용자: 무슨 모양인지 모르겠다).
// Ionicons(MIT, 이미 번들된 폰트)에서 추출한 **정식 벡터 아웃라인**을 100×100
// 정규화 박스에 fit 해 쓴다 — medal→ribbon(어워드 리본)·route→footsteps(발자국)·
// run→walk. 채움(fill) 글리프라 메달 금속면 위에서 무겁고 또렷하게 읽힌다.
const GLYPHS: Record<AchIconId, {tr: string; d: string}> = {
  medal: {tr: 'translate(50,50) scale(0.10682,-0.10682) translate(-500.1,-499.5)', d: 'M461 966Q397 957 343.5 920.5Q290 884 257.5 828.0Q225 772 220 708Q216 647 236.0 591.5Q256 536 298 493Q363 426 456 410Q470 408 479.0 407.5Q488 407 508 407Q534 408 550.5 410.5Q567 413 589 421Q651 441 698.5 488.5Q746 536 767 598Q775 625 778.0 641.5Q781 658 781.0 687.5Q781 717 778.0 733.5Q775 750 767 777Q743 848 686.0 898.5Q629 949 554 963Q537 967 508.0 967.5Q479 968 461 966ZM541 838Q583 827 612.5 796.0Q642 765 653 722Q656 710 656.0 687.0Q656 664 653 653Q643 612 616.0 582.5Q589 553 551 540Q536 535 523.0 533.0Q510 531 493 532Q435 535 393 575Q372 595 359 622Q351 640 348.5 652.0Q346 664 346.0 687.5Q346 711 348.5 723.0Q351 735 359 753Q376 788 404.5 810.5Q433 833 471 841Q483 843 505.5 842.5Q528 842 541 838ZM487 780Q459 776 438.0 757.0Q417 738 410 711Q404 688 410 664Q419 629 451.0 608.5Q483 588 518 596Q544 601 562.5 618.0Q581 635 590 660Q594 671 594 688Q594 726 567 753Q551 769 529.5 776.0Q508 783 487 780ZM206 484Q197 469 131.0 349.5Q65 230 64 225Q61 215 65.0 206.0Q69 197 79 191L86 188L259 186L265 182Q270 178 308.5 113.5Q347 49 351 44Q360 32 374.0 32.0Q388 32 399 43Q402 47 467.5 190.0Q533 333 533.0 337.0Q533 341 531.0 342.5Q529 344 510 344Q452 342 393.5 361.0Q335 380 290 416Q259 440 231 474Q220 488 215.5 489.5Q211 491 206 484ZM771 476Q746 443 711.5 416.5Q677 390 639 373Q621 365 617.0 361.0Q613 357 575.0 274.0Q537 191 537.0 187.0Q537 183 568.0 114.5Q599 46 604 41Q614 31 626.0 31.5Q638 32 648 42Q653 47 692 113Q718 158 725.5 169.0Q733 180 738.0 183.0Q743 186 754.0 186.5Q765 187 826 187Q907 187 915 188Q926 191 932.5 202.0Q939 213 937 224Q936 229 925 249L808 461Q797 479 791.5 485.0Q786 491 783.0 489.5Q780 488 775 481Z'},
  trophy: {tr: 'translate(50,50) scale(0.11406,-0.11406) translate(-500.0,-499.5)', d: 'M264 934Q250 930 239.0 919.5Q228 909 223 897Q220 888 219.0 867.5Q218 847 215.5 845.0Q213 843 150 843Q105 843 95.0 842.5Q85 842 80 840Q67 833 63.5 816.5Q60 800 63 760Q70 681 108.5 620.5Q147 560 202 540Q217 535 219.0 532.0Q221 529 225 516Q249 430 345 366Q367 351 398.0 337.5Q429 324 453 318H456Q463 316 465.0 312.0Q467 308 468 292Q468 280 468 235V218Q468 129 466.0 127.0Q464 125 399 125L334 124L327 119Q313 110 313 93Q313 87 315.0 82.5Q317 78 321 73L323 71Q327 66 333 65Q342 63 370 63L494 62Q652 62 661 63Q679 67 685.0 83.0Q691 99 681 113Q676 119 670.5 121.5Q665 124 650 124Q638 125 599 125Q536 125 534.0 127.0Q532 129 532 218V236Q532 280 532 292Q533 308 535.0 312.0Q537 316 544 318H547Q571 324 602.0 337.5Q633 351 655 366Q751 430 775 516Q779 529 781.0 532.0Q783 535 798 540Q853 560 891.5 620.5Q930 681 937 760Q940 800 936.5 816.5Q933 833 920 840Q915 842 905.0 842.5Q895 843 850 843Q787 843 784.5 845.0Q782 847 781.0 867.0Q780 887 777 897Q767 923 740 934Q734 936 701.0 936.5Q668 937 501 937Q271 936 264 934ZM215 780Q217 779 217.5 767.0Q218 755 218 693V628Q218 611 216.5 607.5Q215 604 210 606H209Q205 607 195 615Q168 637 149.5 675.0Q131 713 127 756L126 761Q125 773 126.0 776.5Q127 780 135 781Q141 782 162 782H171Q212 782 215 780ZM872 778Q874 776 874.5 772.5Q875 769 873 756Q869 714 851.5 677.0Q834 640 808 618Q791 603 785 606Q783 607 782.5 620.5Q782 634 782.0 692.5Q782 751 782.5 764.5Q783 778 785.0 780.0Q787 782 828 782Q857 782 863.5 781.5Q870 781 872 778Z'},
  flag: {tr: 'translate(50,50) scale(0.11442,-0.11442) translate(-500.0,-499.0)', d: 'M262 936Q252 935 240 933Q204 929 176.0 919.0Q148 909 137 897L134 895Q130 891 129 885Q127 875 126.0 847.0Q125 819 125 751V480Q125 195 125.5 140.5Q126 86 128.5 80.0Q131 74 136.0 70.0Q141 66 148.5 64.0Q156 62 159 62L165 64Q170 65 176.0 70.5Q182 76 184.5 80.0Q187 84 187.5 109.0Q188 134 188 238L189 389L201 393Q222 400 261.0 403.5Q300 407 335.5 405.0Q371 403 408.0 396.5Q445 390 515 373Q604 352 643.0 347.0Q682 342 720 345Q779 350 829 367Q844 372 851.0 375.5Q858 379 864 385L866 386Q870 390 871 394Q873 401 874.0 418.0Q875 435 875 477L874 851L870 858Q862 869 848 874Q842 875 834.0 873.5Q826 872 807 865Q758 847 703 844Q680 843 652.0 848.5Q624 854 575 871Q496 898 469.0 907.0Q442 916 422 921Q384 930 366.0 932.5Q348 935 311 936Q267 936 262 936Z'},
  route: {tr: 'translate(50,50) scale(0.10674,-0.10674) translate(-500.2,-499.8)', d: 'M734 966Q717 962 698.5 949.5Q680 937 666 920Q633 882 610.0 825.0Q587 768 577 703Q575 684 574.5 654.0Q574 624 576 610Q596 501 709 484Q770 475 813.5 502.0Q857 529 879 589Q906 661 906 750Q906 779 904.0 797.0Q902 815 896 838Q883 886 856.0 918.5Q829 951 792 963Q780 967 762.0 968.0Q744 969 734 966ZM229 780Q195 775 167.0 752.5Q139 730 121.5 695.5Q104 661 96 611Q94 595 94.5 559.5Q95 524 97 504Q109 416 137.0 367.0Q165 318 215 301Q226 298 232.5 297.0Q239 296 255 295Q284 294 306.5 299.0Q329 304 352 316Q367 324 382.0 338.5Q397 353 404 367Q425 403 426.5 455.5Q428 508 411 574Q390 655 352.0 710.0Q314 765 270 777Q261 780 249.0 780.5Q237 781 229 780ZM585 469Q548 459 536 413Q533 401 533 373Q533 353 533.5 346.0Q534 339 537 328Q548 288 572.0 261.0Q596 234 628.0 224.0Q660 214 695 223Q739 236 769.5 272.0Q800 308 805 354Q810 398 782 423Q770 434 752.5 441.0Q735 448 701 454Q679 458 654 464Q607 475 585 469ZM372 282Q367 281 342.5 275.5Q318 270 292 265Q247 256 227.0 243.0Q207 230 198 205Q193 190 195.5 165.5Q198 141 207.0 121.5Q216 102 231.5 84.0Q247 66 265 54Q296 33 332.0 31.5Q368 30 398 48Q416 58 431.5 77.5Q447 97 456 119Q463 137 465.0 150.0Q467 163 467 187Q467 204 466.5 211.5Q466 219 464 227Q453 264 425 278Q419 281 414.0 281.5Q409 282 396 283Q376 283 372 282Z'},
  run: {tr: 'translate(50,50) scale(0.10875,-0.10875) translate(-486.3,-491.8)', d: 'M482 950Q460 946 440 925Q426 911 420.0 897.0Q414 883 414.5 863.5Q415 844 421.0 829.5Q427 815 442 800Q455 788 469.5 782.5Q484 777 502 777Q539 777 564.5 803.0Q590 829 590.0 864.5Q590 900 564 926Q548 942 526.5 948.0Q505 954 482 950ZM383 750Q349 745 312 713Q291 695 266.0 661.5Q241 628 224 594L218 583V423L221 416Q227 406 236.5 401.5Q246 397 257 400Q264 402 271.0 409.0Q278 416 279.0 421.5Q280 427 280 497V568L289 583Q317 631 347 660L361 674L363 470Q364 445 366 434Q367 426 372 412L373 410Q377 397 381.5 389.0Q386 381 429 326L472 271L528 159Q583 47 587 42Q598 30 614.5 32.5Q631 35 638 49L639 50Q642 57 641 63Q640 72 628 96Q620 113 589 176L534 286L533 474Q533 607 532.5 636.0Q532 665 529 672Q524 687 518.5 696.5Q513 706 502 717Q483 736 465.0 743.0Q447 750 416 750Q392 751 383 750ZM566 600Q564 597 563.5 592.0Q563 587 563 568Q563 543 565.0 534.0Q567 525 575 518Q581 512 642.0 473.0Q703 434 709 432Q720 428 731.5 433.0Q743 438 749.0 448.0Q755 458 754.5 469.5Q754 481 747 489Q741 495 659.0 549.0Q577 603 573.0 603.0Q569 603 566 600ZM431 246Q424 240 364.5 164.5Q305 89 303 84Q296 66 306.5 51.5Q317 37 336 37H338Q346 37 351.0 40.0Q356 43 367 57Q376 67 406 106L410 112Q465 184 468.0 190.5Q471 197 469.5 205.5Q468 214 461 228Q453 243 449.0 246.5Q445 250 440.0 250.0Q435 250 431 246Z'},
  star: {tr: 'translate(50,50) scale(0.10682,-0.10682) translate(-500.0,-499.3)', d: 'M485 933Q484 933 483 932Q478 930 475 924Q471 915 460 884L376 625L52 624L45 620Q35 613 32.5 599.0Q30 585 38 576Q43 570 167 484L299 394L249 247Q199 100 200 93Q200 78 212.0 69.0Q224 60 237 63Q245 65 372.0 157.5Q499 250 500.0 250.0Q501 250 628.0 157.5Q755 65 762 64Q777 60 788.5 69.5Q800 79 800 94Q800 101 751.0 246.5Q702 392 702.0 393.5Q702 395 828.0 481.0Q954 567 960 572Q969 582 968 597Q967 605 963.0 611.5Q959 618 953.5 620.5Q948 623 924.5 623.5Q901 624 785 625H624L536 896Q527 922 525 925Q519 933 506.5 935.5Q494 938 485 933Z'},
  sparkles: {tr: 'translate(50,50) scale(0.10003,-0.10003) translate(-499.9,-499.8)', d: 'M161 998Q153 994 148.0 984.5Q143 975 129 940Q111 894 108.5 891.0Q106 888 60.0 870.5Q14 853 9 849Q0 840 0 828Q0 823 3.5 815.5Q7 808 11.5 805.0Q16 802 60.0 785.5Q104 769 107.5 766.5Q111 764 128.0 718.5Q145 673 148 668Q155 657 170.5 657.0Q186 657 194 667Q198 673 215.0 717.5Q232 762 235.0 765.0Q238 768 282.5 785.0Q327 802 333 806Q344 815 343.0 830.0Q342 845 330 852Q322 856 279.0 872.5Q236 889 233.5 892.5Q231 896 215.0 939.0Q199 982 196 987Q191 995 180.0 998.0Q169 1001 161 998ZM766 933Q759 929 756.0 925.0Q753 921 730.0 860.0Q707 799 704.0 796.0Q701 793 639.0 769.0Q577 745 573 742Q566 735 563.5 724.0Q561 713 565.5 705.5Q570 698 579.0 693.0Q588 688 621 675L641 667Q688 649 696.0 645.5Q704 642 706 638V637Q710 631 732 573Q747 533 751.5 523.5Q756 514 761 509Q773 497 791 502Q798 504 802.5 508.5Q807 513 813 528Q818 539 831 573Q849 622 853.5 632.0Q858 642 863.0 644.0Q868 646 925.5 668.0Q983 690 988 695Q998 702 999.5 715.5Q1001 729 992 739Q987 744 977.5 748.0Q968 752 921 771Q864 793 860.5 795.5Q857 798 833 860Q814 908 808.5 919.0Q803 930 795 934Q789 937 780.5 936.5Q772 936 766 933ZM391 747Q374 741 366 729Q362 723 321.5 618.0Q281 513 278.5 509.0Q276 505 271.0 502.0Q266 499 163.5 459.5Q61 420 54.0 416.0Q47 412 41.0 404.0Q35 396 33.0 389.0Q31 382 32.0 371.0Q33 360 36.0 354.0Q39 348 46.0 340.5Q53 333 59 331L168 289Q231 265 252.0 256.0Q273 247 276.0 244.0Q279 241 288.0 219.0Q297 197 322 133Q362 26 367 20Q373 11 384.0 5.5Q395 0 406 0Q425 0 440 15L449 24L490 130Q530 236 534.5 241.5Q539 247 545.0 250.0Q551 253 652.0 291.5Q753 330 757.0 332.5Q761 335 768.0 343.0Q775 351 778.0 357.0Q781 363 780.5 374.5Q780 386 777 394Q770 409 758 417Q753 420 652.0 458.5Q551 497 545.0 500.0Q539 503 534.5 508.5Q530 514 490 620L449 726L440 735Q419 757 391 747Z'},
  infinite: {tr: 'translate(50,50) scale(0.10330,-0.10330) translate(-500.0,-499.4)', d: 'M213 731Q164 722 122.5 695.0Q81 668 54 628Q16 569 16.0 500.0Q16 431 54 372Q90 319 149.5 290.0Q209 261 273 267Q317 271 354.5 287.0Q392 303 429 334Q443 345 448.0 354.0Q453 363 452 376Q452 383 451.5 387.0Q451 391 448 396Q434 421 407 421Q396 421 388.5 418.0Q381 415 370 406Q326 370 279 362Q265 359 244.0 360.5Q223 362 210 366Q149 385 122 444Q115 459 113.0 469.0Q111 479 111.0 500.0Q111 521 113.0 531.0Q115 541 122 556Q136 588 163.0 609.0Q190 630 224 637Q265 646 305.5 630.5Q346 615 385 577Q427 535 462.0 472.0Q497 409 547 359Q572 334 593.5 318.5Q615 303 641 291Q732 247 826 279Q884 299 926 347Q960 386 974.5 435.0Q989 484 981.5 534.0Q974 584 946 628Q920 666 881.5 692.0Q843 718 795 729Q783 732 754.5 733.0Q726 734 714 732Q651 722 594 684Q560 661 553 647Q549 641 548.5 637.0Q548 633 548 625Q548 597 572 584Q578 581 582.0 580.0Q586 579 594 579Q606 579 612.0 582.0Q618 585 636 598Q664 620 691.0 630.0Q718 640 747 640Q790 640 825.0 617.5Q860 595 878 556Q885 541 887.0 531.0Q889 521 889.0 500.0Q889 479 887.0 469.0Q885 459 878 444Q851 386 790 366Q780 362 774.0 361.5Q768 361 749 361Q727 361 717.0 363.0Q707 365 689 372Q652 387 612.5 426.0Q573 465 538 527Q492 611 426.5 665.5Q361 720 293 731Q279 733 252.5 733.0Q226 733 213 731Z'},
};

function AchIcon({id, size = 64, color = T1}: {id: AchIconId; size?: number; color?: string}) {
  const g = GLYPHS[id] ?? GLYPHS.flag;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Path d={g.d} transform={g.tr} fill={color} />
    </Svg>
  );
}

// ── 메달('러닝의 옷' 리디자인 2026-07-04) — 애플 워치 어워드 문법 ────────────────
// 이전의 '틴트 원 + 라인 아이콘'은 납작했다(사용자: 대충 만든 것 같다). 층위로 입체를
// 만든다: ①금속 림(수직 그라데이션 — 위는 빛, 아래는 그늘) ②다크 페이스(등급색
// 라디얼 틴트) ③새김 홈(밝은 선 위·어두운 선 아래 = 파인 느낌) ④좌상단 스펙큘러
// ⑤글리프는 웜 화이트(금속에 새긴 인상 — 색은 림과 글로우가 말한다).
// 레전더리는 샴페인 골드(HALL_GOLD 계열 — 전당과 같은 언어).
function Medal({color, legendary, icon}: {color: string; legendary?: boolean; icon: AchIconId}) {
  const c = legendary ? HALL_GOLD : color;
  const uid = icon; // 화면당 1개 마운트 — id 충돌 없음
  return (
    <View style={{width: 148, height: 148, alignItems: 'center', justifyContent: 'center'}}>
      <Svg width={148} height={148}>
        <Defs>
          <LinearGradient id={`rim-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.55} />
            <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0.06} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.5} />
          </LinearGradient>
          <RadialGradient id={`face-${uid}`} cx="50%" cy="36%" rx="72%" ry="72%">
            <Stop offset="0" stopColor={c} stopOpacity={0.3} />
            <Stop offset="0.6" stopColor={c} stopOpacity={0.1} />
            <Stop offset="1" stopColor={c} stopOpacity={0.02} />
          </RadialGradient>
        </Defs>
        {/* 림 — 등급색 금속 */}
        <Circle cx={74} cy={74} r={70} fill={c} opacity={0.92} />
        <Circle cx={74} cy={74} r={70} fill={`url(#rim-${uid})`} />
        {/* 페이스 — 깊은 차콜 + 등급색 틴트 */}
        <Circle cx={74} cy={74} r={59} fill="#141417" />
        <Circle cx={74} cy={74} r={59} fill={`url(#face-${uid})`} />
        {/* 새김 홈 — 위 밝음/아래 어두움의 1px 쌍 */}
        <Circle cx={74} cy={74} r={52.5} stroke={withAlpha('#FFFFFF', 0.12)} strokeWidth={1} fill="none" />
        <Circle cx={74} cy={74} r={51.5} stroke={withAlpha('#000000', 0.4)} strokeWidth={1} fill="none" />
        {/* 좌상단 스펙큘러 */}
        <Ellipse cx={54} cy={44} rx={30} ry={15} fill="#FFFFFF" opacity={0.09} />
      </Svg>
      <View style={{position: 'absolute'}} pointerEvents="none">
        <AchIcon id={icon} size={62} color={legendary ? '#F4E8C8' : '#F1EFE9'} />
      </View>
    </View>
  );
}

// 큰 메달/크레스트 글로우(radial)
function Glow({color}: {color: string}) {
  return (
    <Svg width={380} height={380} style={st.glow} pointerEvents="none">
      <Defs>
        <RadialGradient id="cel-glow" cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor={color} stopOpacity={0.16} />
          <Stop offset="0.62" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx="190" cy="190" r="190" fill="url(#cel-glow)" />
    </Svg>
  );
}

// 메달 주변 ping 링(무한)
function PingRing({color, delay = 0}: {color: string; delay?: number}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, {toValue: 1, duration: 2800, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true}),
    );
    loop.start();
    return () => loop.stop();
  }, [v, delay]);
  const scale = v.interpolate({inputRange: [0, 1], outputRange: [1, 1.7]});
  const opacity = v.interpolate({inputRange: [0, 0.1, 1], outputRange: [0, 0.55, 0]});
  return <Animated.View style={[st.ring, {borderColor: withAlpha(color, 0.36), opacity, transform: [{scale}]}]} pointerEvents="none" />;
}

// 스태거 진입 래퍼
function Rise({
  anim, from, to, children, style, pop,
}: {
  anim: Animated.Value;
  from: number;
  to: number;
  children: React.ReactNode;
  style?: any;
  pop?: boolean;
}) {
  const opacity = anim.interpolate({inputRange: [from, to], outputRange: [0, 1], extrapolate: 'clamp'});
  const ty = anim.interpolate({inputRange: [from, to], outputRange: [pop ? 0 : 14, 0], extrapolate: 'clamp'});
  const scale = anim.interpolate({inputRange: [from, to], outputRange: [pop ? 0.6 : 1, 1], extrapolate: 'clamp'});
  return <Animated.View style={[style, {opacity, transform: pop ? [{scale}] : [{translateY: ty}]}]}>{children}</Animated.View>;
}

export default function CelebrationScreen({data, onClose}: {data: CelebrationData; onClose: () => void}) {
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    // 보상 순간의 촉각 피드백 — 등급 상승은 묵직한 단발, 그 외 업적은 성공 펄스.
    // (큐로 다음 축하가 떠도 마운트마다 한 번씩 울린다. 설정 off 면 graceful no-op.)
    if (data.type === 'rankup') impactHeavy();
    else success();
    Animated.timing(anim, {toValue: 1, duration: 950, easing: Easing.out(Easing.cubic), useNativeDriver: true}).start();
  }, [anim, data.type]);

  if (data.type === 'rankup') {
    const c = data.rankColor;
    return (
      <View style={[st.screen, {paddingTop: insets.top + 64, paddingBottom: insets.bottom + 32}]}>
        <Glow color={c} />
        <View style={st.body}>
          <Rise anim={anim} from={0.05} to={0.35}>
            <Text style={[st.eyebrow, {color: c}]}>등급 상승</Text>
          </Rise>
          <Rise anim={anim} from={0.12} to={0.5} pop style={st.medalwrap}>
            <PingRing color={c} />
            <PingRing color={c} delay={1400} />
            <Medal color={c} icon="star" />
          </Rise>
          {!!data.prevKo && (
            <Rise anim={anim} from={0.16} to={0.6}>
              <Text style={st.rankfrom}>{`${data.prevKo} → `}</Text>
            </Rise>
          )}
          <Rise anim={anim} from={0.2} to={0.6}>
            <Text style={[st.name, {color: c}]}>{data.rankKo}</Text>
          </Rise>
          <Rise anim={anim} from={0.26} to={0.66}>
            <Text style={st.meta}>{data.rankName}</Text>
          </Rise>
          <Rise anim={anim} from={0.32} to={0.72}>
            <Text style={st.desc}>
              {data.nextKo ? (
                <>
                  이제 <Text style={st.b}>{data.rankKo}</Text>예요. 다음 여정은 <Text style={st.b}>{data.nextKo}</Text>.
                </>
              ) : (
                <>
                  최고 등급 <Text style={st.b}>{data.rankKo}</Text>에 도달했어요. 여정의 정점이에요.
                </>
              )}
            </Text>
          </Rise>
        </View>
        <Rise anim={anim} from={0.48} to={0.9} style={st.actions}>
          <Pressable style={st.primary} onPress={onClose} accessibilityRole="button" accessibilityLabel="계속하기">
            <Text style={st.primaryTxt}>계속하기</Text>
          </Pressable>
        </Rise>
      </View>
    );
  }

  // 업적 획득
  const c = data.rarityColor;
  return (
    <View style={[st.screen, {paddingTop: insets.top + 64, paddingBottom: insets.bottom + 32}]}>
      <Glow color={c} />
      <Pressable style={[st.skip, {top: insets.top + 14}]} onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="건너뛰기">
        <Text style={st.skipTxt}>건너뛰기</Text>
      </Pressable>
      <View style={st.body}>
        <Rise anim={anim} from={0.05} to={0.35}>
          <Text style={[st.eyebrow, {color: c}]}>업적 획득</Text>
        </Rise>
        <Rise anim={anim} from={0.12} to={0.5} pop style={st.medalwrap}>
          <PingRing color={c} />
          <PingRing color={c} delay={1400} />
          <Medal color={c} legendary={data.legendary} icon={data.icon ?? 'medal'} />
        </Rise>
        <Rise anim={anim} from={0.2} to={0.6}>
          <Text style={st.name}>{data.nameKo}</Text>
        </Rise>
        <Rise anim={anim} from={0.26} to={0.66}>
          {/* 레어리티 단어·+XP 는 표면에 세우지 않는다('러닝의 옷') — 색과 메달이 말한다. */}
          <Text style={st.meta}>{data.catKo}</Text>
        </Rise>
        <Rise anim={anim} from={0.32} to={0.72}>
          <Text style={st.desc}>{data.detail}</Text>
        </Rise>
      </View>
      <Rise anim={anim} from={0.48} to={0.9} style={st.actions}>
        <Pressable style={st.primary} onPress={onClose} accessibilityRole="button" accessibilityLabel="확인">
          <Text style={st.primaryTxt}>확인</Text>
        </Pressable>
      </Rise>
    </View>
  );
}

const st = StyleSheet.create({
  screen: {flex: 1, backgroundColor: BG, alignItems: 'center', paddingHorizontal: 28, overflow: 'hidden'},
  glow: {position: 'absolute', top: '-8%'},
  skip: {position: 'absolute', right: 22, zIndex: 2, padding: 6},
  skipTxt: {fontSize: 13, fontWeight: '500', color: T3, fontFamily: FONT},
  body: {flex: 1, alignItems: 'center', justifyContent: 'center'},

  eyebrow: {fontSize: 12, fontWeight: '700', letterSpacing: 2.6, marginBottom: 32, textTransform: 'uppercase', fontFamily: FONT},
  medalwrap: {width: 124, height: 124, marginBottom: 30, alignItems: 'center', justifyContent: 'center'},
  ring: {position: 'absolute', width: 124, height: 124, borderRadius: 62, borderCurve: 'continuous', borderWidth: 1},

  rankfrom: {fontSize: 14, fontWeight: '500', color: T3, marginBottom: 2, fontFamily: FONT, textAlign: 'center'},
  name: {fontSize: 32, fontWeight: '800', color: T1, letterSpacing: -0.6, lineHeight: 38, textAlign: 'center', fontFamily: DISPLAY},
  meta: {fontSize: 13, fontWeight: '500', color: T3, fontFamily: FONT},
  desc: {fontSize: 15, color: withAlpha(T1, 0.72), lineHeight: 24, marginTop: 18, maxWidth: 300, textAlign: 'center', fontFamily: FONT},
  b: {color: T1, fontWeight: '700'},

  actions: {alignSelf: 'stretch'},
  primary: {height: 56, borderRadius: RADIUS.md, borderCurve: 'continuous', backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center'},
  primaryTxt: {fontSize: 17, fontWeight: '700', color: T1, fontFamily: FONT},
});
