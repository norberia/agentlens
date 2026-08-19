/**
 * Default ignore patterns + gitignore file parsing.
 *
 * Faithful TypeScript port of gitingest's
 * `src/gitingest/utils/ignore_patterns.py` and `utils/pattern_utils.py`.
 * Filesystem walking lives in the CLI; this module is isomorphic.
 */

/**
 * Default ignore patterns, copied item-for-item (in source order) from
 * gitingest's `DEFAULT_IGNORE_PATTERNS`.
 */
export const DEFAULT_IGNORE_PATTERNS: readonly string[] = [
  // Python
  "*.pyc",
  "*.pyo",
  "*.pyd",
  "__pycache__",
  ".pytest_cache",
  ".coverage",
  ".tox",
  ".nox",
  ".mypy_cache",
  ".ruff_cache",
  ".hypothesis",
  "poetry.lock",
  "Pipfile.lock",
  // JavaScript/FileSystemNode
  "node_modules",
  "bower_components",
  "package-lock.json",
  "yarn.lock",
  ".npm",
  ".yarn",
  ".pnpm-store",
  "bun.lock",
  "bun.lockb",
  // Java
  "*.class",
  "*.jar",
  "*.war",
  "*.ear",
  "*.nar",
  ".gradle/",
  "build/",
  ".settings/",
  ".classpath",
  "gradle-app.setting",
  "*.gradle",
  // IDEs and editors / Java
  ".project",
  // C/C++
  "*.o",
  "*.obj",
  "*.dll",
  "*.dylib",
  "*.exe",
  "*.lib",
  "*.out",
  "*.a",
  "*.pdb",
  // Binary
  "*.bin",
  // Swift/Xcode
  ".build/",
  "*.xcodeproj/",
  "*.xcworkspace/",
  "*.pbxuser",
  "*.mode1v3",
  "*.mode2v3",
  "*.perspectivev3",
  "*.xcuserstate",
  "xcuserdata/",
  ".swiftpm/",
  // Ruby
  "*.gem",
  ".bundle/",
  "vendor/bundle",
  "Gemfile.lock",
  ".ruby-version",
  ".ruby-gemset",
  ".rvmrc",
  // Rust
  "Cargo.lock",
  "**/*.rs.bk",
  // Java / Rust
  "target/",
  // Go
  "pkg/",
  // .NET/C#
  "obj/",
  "*.suo",
  "*.user",
  "*.userosscache",
  "*.sln.docstates",
  "*.nupkg",
  // Go / .NET / C#
  "bin/",
  // Version control
  ".git",
  ".svn",
  ".hg",
  ".gitignore",
  ".gitattributes",
  ".gitmodules",
  // Images and media
  "*.svg",
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.ico",
  "*.pdf",
  "*.mov",
  "*.mp4",
  "*.mp3",
  "*.wav",
  // Virtual environments
  "venv",
  ".venv",
  "env",
  ".env",
  "virtualenv",
  // IDEs and editors
  ".idea",
  ".vscode",
  ".vs",
  "*.swo",
  "*.swn",
  ".settings",
  "*.sublime-*",
  // Temporary and cache files
  "*.log",
  "*.bak",
  "*.swp",
  "*.tmp",
  "*.temp",
  ".cache",
  ".sass-cache",
  ".eslintcache",
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
  // Build directories and artifacts
  "build",
  "dist",
  "target",
  "out",
  "*.egg-info",
  "*.egg",
  "*.whl",
  "*.so",
  // Documentation
  "site-packages",
  ".docusaurus",
  ".next",
  ".nuxt",
  // Database
  "*.db",
  "*.sqlite",
  "*.sqlite3",
  // Other common patterns
  // Minified files
  "*.min.js",
  "*.min.css",
  // Source maps
  "*.map",
  // Terraform
  "*.tfstate*",
  // Dependencies in various languages
  "vendor/",
  // Gitingest
  "digest.txt",
];

const PATTERN_SPLIT_RE = /[,\s]+/;

/**
 * Normalize CLI pattern strings: each string may hold several comma- or
 * whitespace-separated sub-patterns; backslashes become forward slashes.
 * Port of gitingest's `_parse_patterns`.
 */
export function parsePatterns(patterns: string[]): Set<string> {
  const out = new Set<string>();
  for (const pat of patterns) {
    for (const part of pat.trim().split(PATTERN_SPLIT_RE)) {
      if (part) out.add(part.replace(/\\/g, "/"));
    }
  }
  return out;
}

export interface ProcessedPatterns {
  ignorePatterns: Set<string>;
  includePatterns: Set<string> | null;
}

/**
 * Combine the default ignore set with include patterns. Each include pattern
 * is subtracted from the ignore set by exact string match.
 * Port of gitingest's `process_patterns` (exclude patterns unsupported by design).
 *
 * `extraInclude` carries already-normalized patterns (e.g. preset expansions)
 * that bypass the comma/whitespace splitting applied to raw CLI strings.
 */
export function processPatterns(includeRaw: string[], extraInclude: readonly string[] = []): ProcessedPatterns {
  const ignorePatterns = new Set<string>(DEFAULT_IGNORE_PATTERNS);
  let includePatterns: Set<string> | null = null;
  if (includeRaw.length > 0 || extraInclude.length > 0) {
    includePatterns = parsePatterns(includeRaw);
    for (const p of extraInclude) includePatterns.add(p);
    for (const p of includePatterns) ignorePatterns.delete(p);
  }
  return { ignorePatterns, includePatterns };
}

/**
 * Emulate `pathlib.PurePosixPath` join semantics: drop empty and `.` segments,
 * keep `..`, collapse duplicate slashes, drop the trailing slash.
 */
function posixJoin(base: string, leaf: string): string {
  const segments: string[] = [];
  for (const seg of `${base}/${leaf}`.split("/")) {
    if (seg === "" || seg === ".") continue;
    segments.push(seg);
  }
  return segments.length === 0 ? "." : segments.join("/");
}

/**
 * Parse one ignore file into prefixed patterns. Port of gitingest's
 * `_parse_ignore_file`:
 *  - skip blank lines and `#` comments;
 *  - keep a leading `!` (negation) on the emitted pattern;
 *  - strip leading `/` from the pattern body;
 *  - prefix the body with the ignore file's directory, relative to `root`.
 */
export function parseIgnoreFileContent(content: string, relDir: string): string[] {
  const patterns: string[] = [];
  for (const raw of content.split("\n")) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    let negated = false;
    if (line.startsWith("!")) {
      negated = true;
      line = line.slice(1);
    }
    if (line.startsWith("/")) {
      line = line.replace(/^\/+/, "");
    }

    const body = relDir ? posixJoin(relDir, line) : posixJoin("", line);
    patterns.push(negated ? `!${body}` : body);
  }
  return patterns;
}

/** Directory containing `relPath`, or "" for a top-level entry. */
export function parentDir(relPath: string): string {
  const i = relPath.lastIndexOf("/");
  return i === -1 ? "" : relPath.slice(0, i);
}
