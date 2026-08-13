import type { Ingredient } from '../data/types';
import { getExpirationInfo } from './expiration';

export type PantryAvailability = 'usable' | 'expired_unconfirmed' | 'unavailable';

/**
 * 재료의 실제 활용 가능 상태 — owned 여부와 유통기한 경과 여부를 함께 판단하는 단일 기준.
 * 앱은 식품 안전을 스스로 판단하지 않는다: 유통기한이 지났다고 자동으로 "없음" 처리하지 않고,
 * 사용자가 직접 확인("아직 괜찮아요"/"버렸어요")하기 전까지는 expired_unconfirmed로 남는다
 * (재료별로 실제 먹을 수 있는 기간이 다르고 보관 상태에 따라서도 달라지므로).
 *
 * - usable: owned=true, 유통기한 안 지남 — 확실히 쓸 수 있음
 * - expired_unconfirmed: owned=true, 유통기한 지남, 아직 사용자 확인 전 — 쓸 수 있는지 불확실
 * - unavailable: owned=false — 없음
 *
 * "보유 재료로 가능한 레시피" 판단, 장보기/식단 집계, 홈 추천 등 owned 여부로 재료의 실사용
 * 가능성을 판단하는 모든 곳이 이 함수를 공유해야 한다(개별로 `ingredient.owned`만 보면 유통기한
 * 지난 재료를 "있음"으로 잘못 취급하게 됨).
 */
export function getPantryAvailability(ingredient: Ingredient): PantryAvailability {
  if (!ingredient.owned) return 'unavailable';
  const info = getExpirationInfo(ingredient.expirationDate);
  if (info?.level === 'expired') return 'expired_unconfirmed';
  return 'usable';
}

export function isPantryUsable(ingredient: Ingredient | undefined): boolean {
  return ingredient != null && getPantryAvailability(ingredient) === 'usable';
}
