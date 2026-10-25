"use client";
import { useState } from "react";

/** 별점 입력: 라디오 5개(키보드 ←→ 지원), 반쪽 없음 */
export default function RatingInput({ name, defaultValue, label = "별점" }: { name: string; defaultValue?: number; label?: string }) {
  const [value, setValue] = useState(defaultValue ?? 0);
  return (
    <fieldset className="rating-input">
      <legend>{label}</legend>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className={n <= value ? "star-on" : "star-off"}>
          <input type="radio" name={name} value={n} checked={value === n} onChange={() => setValue(n)} required className="sr-only" />
          <span aria-hidden="true">★</span>
          <span className="sr-only">{label} {n}점</span>
        </label>
      ))}
    </fieldset>
  );
}
