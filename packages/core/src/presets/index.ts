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
