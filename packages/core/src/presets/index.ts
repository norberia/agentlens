/**
 * Built-in preset registry. `--preset <name>` expands to the pattern list
 * registered here; new presets live in sibling modules and are added to the
 * map so unknown-value errors always list every available name.
 */

import { DEPLOY_PRESET_PATTERNS } from "./deploy.js";

export const PRESETS: Readonly<Record<string, readonly string[]>> = {
  deploy: DEPLOY_PRESET_PATTERNS,
};

export function presetNames(): string[] {
  return Object.keys(PRESETS);
}

export class UnknownPresetError extends Error {
  readonly preset: string;

  constructor(preset: string) {
    super(`unknown preset: "${preset}" (available: ${presetNames().join(", ")})`);
    this.name = "UnknownPresetError";
    this.preset = preset;
  }
}

/** Expand preset names to their pattern lists; throws UnknownPresetError. */
export function resolvePresetPatterns(names: string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    const patterns = PRESETS[name];
    if (!patterns) throw new UnknownPresetError(name);
    out.push(...patterns);
  }
  return out;
}
