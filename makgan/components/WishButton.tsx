"use client";
import ToggleButton from "./ToggleButton";
import { toggleWishlist } from "@/lib/actions/wishlist";

export default function WishButton({ showId, title, wished }: { showId: string; title: string; wished: boolean }) {
  return (
    <ToggleButton
      on={wished}
      action={() => toggleWishlist(showId)}
      labels={{ on: "♥", off: "♡", aria: `${title} 찜` }}
      className="wish-btn"
    />
  );
}
