import type { Metadata, Viewport } from "next";
import TabBar from "@/components/TabBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "서울 뮤지컬 학원 찾기",
  description: "서울(강서구 마곡 중심) 초·중등 보컬·댄스·발레·탭댄스·아크로바틱·체조·연기·뮤지컬 학원을 출처와 함께 비교",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#6d28d9",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="bg-surface font-sans text-[15px] leading-normal text-ink">
        <div className="mx-auto min-h-dvh max-w-[480px] bg-white pb-[calc(60px+env(safe-area-inset-bottom))]">
          {children}
          <TabBar />
        </div>
      </body>
    </html>
  );
}
