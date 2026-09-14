import { redirectOAuthSystemPath } from '@/services/google-oauth';

export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return redirectOAuthSystemPath(path);
}
