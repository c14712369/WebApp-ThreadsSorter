import { NextResponse } from 'next/server'
import { APP_VERSION } from '@/lib/app-version'

// 每次都回傳目前線上部署的版本，不可被任何層快取
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json({ version: APP_VERSION }, { headers: { 'Cache-Control': 'no-store' } })
}
