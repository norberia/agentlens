/**
 * gitwildmatch matcher — a faithful TypeScript port of Python pathspec's
 * `GitIgnoreSpecPattern` (registered as "gitwildmatch"), which is what
 * gitingest uses for all pattern matching.
 *
 * Why a port instead of the `ignore` npm package: gitingest's output is the
 * compatibility target, and pathspec's semantics differ from real git in at
 * least one observable way — pathspec evaluates every path independently, so a
 * negation can re-include a file inside an excluded directory (real git, and
 * the `ignore` package, cannot). Porting guarantees byte-identical trees.
 *
 * Semantics (mirroring pathspec):
 *  - each pattern compiles to a single RegExp used with search() semantics;
 *  - matching is case-sensitive;
 *  - the LAST matching pattern wins; a leading `!` flips it to "include";
 *  - a blank line, comment, lone `/`, or invalid range notation is a null-op;
 *  - gitingest compiles one PathSpec per file check (slow); agentlens compiles
 *    each pattern set exactly once before traversal.
 */

interface CompiledPattern {
  regex: RegExp;
  /** true = matched paths are ignored; false = negation re-includes them. */
  include: boolean;
}

const DIR_MARK_CG = "(/)";
const DIR_MARK_OPT = "(?:(/)|$)";

/** JS equivalent of Python's `re.escape` for a single character. */
function escapeChar(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

class RangeError_ extends Error {}

/**
 * Port of `_GitIgnoreBasePattern._translate_segment_glob` with
 * `range_error='raise'`: translates one path segment glob into regex source.
 */
function translateSegmentGlob(pattern: string): string {
  let escape = false;
  let regex = "";
  let i = 0;
  const end = pattern.length;

  while (i < end) {
    const char = pattern[i]!;
    i += 1;

    if (escape) {
      escape = false;
      regex += escapeChar(char);
    } else if (char === "\\") {
      escape = true;
    } else if (char === "*") {
      regex += "[^/]*";
    } else if (char === "?") {
      regex += "[^/]";
    } else if (char === "[") {
      let j = i;

      // Pass bracket expression negation.
      if (j < end && (pattern[j] === "!" || pattern[j] === "^")) j += 1;
      // Pass a first closing bracket (it is a literal there).
      if (j < end && pattern[j] === "]") j += 1;
      // Find the closing bracket.
      while (j < end && pattern[j] !== "]") j += 1;

      if (j < end) {
        j += 1; // one past the closing bracket
        let expr = "[";
        if (pattern[i] === "!" || pattern[i] === "^") {
          expr += "^";
          i += 1;
        }
        expr += pattern.slice(i, j).replace(/\\/g, "\\\\");
        regex += expr;
        i = j;
      } else {
        // Git discards patterns with invalid range notation.
        throw new RangeError_(`invalid range notation in pattern: ${pattern}`);
      }
    } else {
      regex += escapeChar(char);
    }
  }

  if (escape) {
    // pathspec raises GitIgnorePatternError here (which would crash gitingest);
    // agentlens treats the pattern as a null-op instead.
    throw new RangeError_(`dangling escape in pattern: ${pattern}`);
  }

  return regex;
}

/**
 * Port of `GitIgnoreSpecPattern.__normalize_segments` +
 * `__translate_segments`. Returns regex source, or null when the pattern is a
 * null-operation (blank / comment / lone slash / invalid range).
 */
function patternToRegex(rawPattern: string): { regex: string; include: boolean } | null {
  // EDGE CASE: a pattern ending in an escaped space keeps trailing whitespace.
  let pattern = rawPattern.endsWith("\\ ") ? rawPattern : rawPattern.replace(/\s+$/, "");

  if (!pattern) return null; // blank → null-op
  if (pattern.startsWith("#")) return null; // comment → null-op
  if (pattern === "/") return null; // lone slash matches nothing

  let include: boolean;
  if (pattern.startsWith("!")) {
    include = false;
    pattern = pattern.slice(1);
  } else {
    include = true;
  }

  const segs = pattern.split("/");
  const isDirPattern = segs[segs.length - 1] === "";

  // --- normalize segments ---
  if (segs[0] === "") {
    // Leading '/': anchor to root by dropping the empty first segment.
    segs.shift();
  } else if (segs.length === 1 || (segs.length === 2 && segs[1] === "")) {
    // Single segment (with or without trailing slash) matches at any depth.
    if (segs[0] !== "**") segs.unshift("**");
  }

  if (segs.length === 0) return null; // normalized to nothing → null-op

  if (segs[segs.length - 1] === "") {
    // Trailing slash: match all descendants ("{pattern}/**").
    segs[segs.length - 1] = "**";
  }

  // Collapse duplicate '**' sequences.
  for (let i = segs.length - 1; i > 0; i--) {
    if (segs[i - 1] === "**" && segs[i] === "**") segs.splice(i, 1);
  }

  let regex: string;
  if (segs.length === 1 && segs[0] === "**") {
    regex = isDirPattern ? DIR_MARK_CG : ".";
  } else if (segs.length === 2 && segs[0] === "**" && segs[1] === "*") {
    regex = ".";
  } else if (segs.length === 3 && segs[0] === "**" && segs[1] === "*" && segs[2] === "**") {
    regex = isDirPattern ? DIR_MARK_CG : "/";
  } else {
    // --- translate segments ---
    const parts: string[] = [];
    let needSlash = false;
    const end = segs.length - 1;
    try {
      for (let i = 0; i <= end; i++) {
        const seg = segs[i]!;
        if (seg === "**") {
          if (i === 0) {
            parts.push("^(?:.+/)?");
          } else if (i < end) {
            parts.push("(?:/.+)?");
            needSlash = true;
          } else {
            parts.push(isDirPattern ? DIR_MARK_CG : "/");
          }
        } else {
          if (i === 0) parts.push("^");
          if (needSlash) parts.push("/");
          parts.push(seg === "*" ? "[^/]+" : translateSegmentGlob(seg));
          if (i === end) parts.push(DIR_MARK_OPT);
          needSlash = true;
        }
      }
    } catch (err) {
      if (err instanceof RangeError_) return null; // discarded pattern
      throw err;
    }
    regex = parts.join("");
  }

  return { regex, include };
}

export interface Matcher {
  /**
   * Returns true when the root-relative POSIX path matches the pattern set
   * (i.e. gitingest would ignore / include it, depending on the set).
   */
  matches(relPath: string): boolean;
}

/**
 * Compile a pattern set once. Iteration order of the input is preserved;
 * later patterns override earlier ones on conflict (pathspec semantics).
 */
export function compileMatcher(patterns: Iterable<string>): Matcher {
  const compiled: CompiledPattern[] = [];
  for (const pattern of patterns) {
    const result = patternToRegex(pattern);
    if (result === null) continue;
    compiled.push({ regex: new RegExp(result.regex), include: result.include });
  }
  // Check in reverse: the first match in reverse order is the last match in
  // declaration order, which is what takes precedence (pathspec's reversed
  // backend does exactly this as an optimization).
  const reversed = compiled.reverse();
  return {
    matches(relPath: string): boolean {
      if (reversed.length === 0 || relPath === "") return false;
      for (const { regex, include } of reversed) {
        if (regex.test(relPath)) return include;
      }
      return false;
    },
  };
}
