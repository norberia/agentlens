export function queryList(searchParams: URLSearchParams, keys: string[]): string[] {
  const out: string[] = [];
  for (const key of keys) {
    for (const value of searchParams.getAll(key)) {
      for (const part of value.split(",")) {
        const trimmed = part.trim();
        if (trimmed) out.push(trimmed);
      }
    }
  }
  return out;
}
