/**
 * Internal types for the zod-to-json-schema CLI
 */

import type { z } from 'zod/v4';

// CLI Options
export interface CLIOptions {
  input: string;
  output: string;
  combined: boolean;
  format: boolean;
  verbose: boolean;
  target: JSONSchemaTarget;
  pattern: string;
  exclude: string[];
}

// JSON Schema target versions supported by Zod 4
export type JSONSchemaTarget = 'draft-7' | 'draft-2020-12';

// Scanner result
export interface ScanResult {
  filePath: string;
  exports: ExportInfo[];
}

export interface ExportInfo {
  name: string;
  isSchema: boolean;
  isType: boolean;
}

// Zod schema type (generic for type checking)
export type ZodSchema = z.ZodType;

/**
 * Type guard for Zod schemas
 *
 * Checks for Zod 4 structure (_zod.def) and Zod 3 structure (_def)
 */
export function isZodSchema(value: unknown): value is ZodSchema {
  if (!value || typeof value !== 'object') return false;

  // Check for Zod 4 structure (_zod.def)
  if ('_zod' in value && value._zod && typeof value._zod === 'object' && 'def' in value._zod) {
    return true;
  }

  // Check for Zod 3 structure (_def)
  if ('_def' in value && value._def && typeof value._def === 'object') {
    return true;
  }

  return false;
}
