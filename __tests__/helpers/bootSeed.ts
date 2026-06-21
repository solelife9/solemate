// 테스트 공용: 부팅 폴백 캐시(cache_shoes_v1/cache_runs_v1)에 신발/런을 시드한다.
// Phase 5b·Stage 3 이후 App 부팅은 REST GET 이 아니라 이 로컬 캐시에서 데이터를 읽는다
// (Firestore 정본). 따라서 화면에 신발/런이 필요한 테스트는 REST 목 대신 이걸로 시드한다.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const CACHE_SHOES_KEY = 'cache_shoes_v1';
export const CACHE_RUNS_KEY = 'cache_runs_v1';

/** 부팅 캐시에 신발/런을 써, mount 직후 loadBootCache 가 즉시 'ready' 로 띄우게 한다. */
export async function seedBootCache(shoes: any[] = [], runs: any[] = []): Promise<void> {
  await AsyncStorage.setItem(CACHE_SHOES_KEY, JSON.stringify(shoes));
  await AsyncStorage.setItem(CACHE_RUNS_KEY, JSON.stringify(runs));
}
