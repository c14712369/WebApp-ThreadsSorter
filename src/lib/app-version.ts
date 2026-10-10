/** 目前執行中的版本（build 時由 next.config 注入 commit 短碼；本機開發為 'dev'） */
export const APP_VERSION = process.env.NEXT_PUBLIC_BUILD_ID || 'dev'

/** 線上部署的版本與執行中的不同才算有更新；任一邊未知或本機開發都不提示 */
export function hasNewerVersion(current: string | null | undefined, latest: string | null | undefined) {
  if (!current || !latest || current === 'dev') return false
  return current !== latest
}
