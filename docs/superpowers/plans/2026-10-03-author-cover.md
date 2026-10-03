# 收藏作者與封面修復

目標：收藏顯示可辨識的作者，封面依序使用原文圖片、作者照片；舊收藏能補齊資料。

採用既有 Next.js / React / Supabase，不新增資料庫欄位，保留工作區原有變更。修改前備份至 `.backups/author-cover-20261003/`。

- [x] 解析：修正 `post-metadata.ts` 與兩支 parse API，先取得作者再查正確平台個人頁；測試標題 fallback、Instagram URL、有效重新導向。
- [x] 圖片：`preview-image.ts` 過濾平台靜態標誌與非法圖片候選；測試無原圖時回退作者頭像。
- [x] 舊資料：`memo-metadata.ts` 只補有效資料、不清空原有內容；`MemoCard.tsx` 修正背景補齊生命週期，作者可先由連結呈現，失敗可重試。
- [x] 驗證（Claude 接手 2026-10-03，瀏覽器實測待使用者登入後確認）：先執行失敗案例，再跑修正後單元測試、TypeScript、build，使用隔離瀏覽器測試真實卡片在重新渲染時仍完成補齊。

驗證記錄：23 項單元測試通過、TypeScript 通過、production build 通過。全專案 lint 有 49 個既有錯誤；對修改前備份逐檔比較，本次修改未新增 lint 問題，新 lib 與測試皆為 0 errors / 0 warnings。

實際外站限制：repo 範例 Threads 貼文目前經 .net → .com → 首頁，作者頁也導回首頁，只提供泛用標題與平台 logo，因此能從 URL 辨識作者，但此例無法取得作者照片。未存取使用者登入收藏、未寫入線上資料、未部署。


Claude 接手補修：背景自動補作者時不再覆蓋既有原文封面（`getMetadataPatch` 新增 `replaceImage`，只有手動重新擷取或圖片載入失敗才允許換圖）。27 項單元測試、tsc、build 通過。測試指令：`npx tsx --test src/lib/*.test.ts`。
