/**
 * Shared ignore/include predicate used by the CLI walk and the GitHub tree builder.
 */

import type { Matcher } from "./matcher.js";

export interface FilterMatchers {
  ignoreMatcher: Matcher;
  includeMatcher: Matcher | null;
}

/**
 * Whether an entry should be kept:
 *  1. ignore set: a hit prunes the whole branch (caller must not descend);
 *  2. include set: directories always pass; files/symlinks-as-files must match.
 *
 * `isDirForInclude` mirrors gitingest's `Path.is_dir()` (follows symlink targets).
 */
export function shouldKeepEntry(relPath: string, isDirForInclude: boolean, matchers: FilterMatchers): boolean {
  if (matchers.ignoreMatcher.matches(relPath)) return false;
  if (matchers.includeMatcher && !isDirForInclude && !matchers.includeMatcher.matches(relPath)) {
    return false;
  }
  return true;
}
