import { test } from "node:test";
import assert from "node:assert/strict";
import { isBlockedIp } from "./ssrf.ts";

test("내부 주소 차단", () => {
  for (const ip of ["127.0.0.1", "127.1.2.3", "10.0.0.5", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0",
    "100.64.0.1", "224.0.0.1", "::1", "::", "fc00::1", "fd12::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::ffff:7f00:1", "not-an-ip"]) {
    assert.equal(isBlockedIp(ip), true, ip);
  }
});

test("공인 주소 허용", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.255.255", "223.130.195.200", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) {
    assert.equal(isBlockedIp(ip), false, ip);
  }
});
