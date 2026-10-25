import "server-only";
import { listBenefits } from "./benefits";
import { listMyWishlist } from "./wishlist";
import { kstDateString } from "@/lib/date";

/** 홈(SPEC-2 A-6 getHome): 오늘 마감 3 + 곧 열리는 티켓 3 + 내 찜 공연(지난 공연 제외, 비로그인이면 null) */
export async function getHome() {
  const [endingToday, upcomingOpen, wishlist] = await Promise.all([
    listBenefits({ endingToday: true, limit: 3 }),
    listBenefits({ upcomingOpen: true, limit: 3 }),
    listMyWishlist(),
  ]);
  const today = kstDateString();
  return { endingToday, upcomingOpen, wishlist: wishlist && wishlist.filter((s) => s.ends_on >= today) };
}
