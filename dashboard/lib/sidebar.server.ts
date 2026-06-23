import 'server-only';

import { cookies } from 'next/headers';

const SIDEBAR_COOKIE_NAME = 'sidebar_state';

/** Reads persisted sidebar collapse state for SSR-safe SidebarProvider defaultOpen. */
export async function getSidebarDefaultOpen(): Promise<boolean> {
  const cookieStore = await cookies();
  const value = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value;

  if (value === 'false') return false;
  if (value === 'true') return true;
  return true;
}
