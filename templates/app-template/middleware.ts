// Human-owned access gate. The Codex agent must not edit this file (see AGENTS.md).
// The Discord-membership gate lives at the proxy layer (M4); this in-app middleware
// stays pass-through and only reserves the boundary.
import { NextResponse } from 'next/server';

export function middleware() {
  return NextResponse.next();
}

export const config = { matcher: [] };
