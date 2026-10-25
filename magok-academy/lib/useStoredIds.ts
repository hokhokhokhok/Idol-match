"use client";

// 즐겨찾기·비교 목록: 이 기기 localStorage에만 저장 (로그인 없음).
// 메모리 값이 기준이고 localStorage는 보관용. 사생활 보호 모드 등에서 저장소가 막혀도 이번 방문 동안은 동작한다.

import { useCallback, useSyncExternalStore } from "react";
import { COMPARE_MAX } from "./constants.ts";

const EMPTY: readonly string[] = [];
const memory = new Map<string, readonly string[]>();
const listeners = new Map<string, Set<() => void>>();

function load(key: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string");
  } catch {}
  return EMPTY;
}

function get(key: string): readonly string[] {
  if (!memory.has(key)) memory.set(key, load(key));
  return memory.get(key)!;
}

function set(key: string, ids: readonly string[]) {
  memory.set(key, ids);
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {}
  listeners.get(key)?.forEach((l) => l());
}

function subscribe(key: string, cb: () => void) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key)!.add(cb);
  // 다른 탭에서 바뀐 경우
  const onStorage = (e: StorageEvent) => {
    if (e.key !== key) return;
    memory.set(key, load(key));
    cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.get(key)!.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function useStoredIds(key: string, max = Infinity) {
  const ids = useSyncExternalStore(
    useCallback((cb: () => void) => subscribe(key, cb), [key]),
    () => get(key),
    () => EMPTY,
  );
  /** 바꾸면 true, 최대 개수가 차서 못 넣으면 false */
  const toggle = useCallback(
    (id: string): boolean => {
      const cur = get(key);
      if (cur.includes(id)) set(key, cur.filter((x) => x !== id));
      else if (cur.length >= max) return false;
      else set(key, [...cur, id]);
      return true;
    },
    [key, max],
  );
  const clear = useCallback(() => set(key, EMPTY), [key]);
  return { ids, toggle, clear, has: (id: string) => ids.includes(id), full: ids.length >= max };
}

export const useFavorites = () => useStoredIds("magok.favorites");
export const useCompare = () => useStoredIds("magok.compare", COMPARE_MAX);
