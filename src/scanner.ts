/**
 * Directory scanner for Zod schema files
 *
 * Scans a directory for TypeScript files and dynamically imports them
 * to find Zod schema exports.
 */

import { glob } from 'glob';
import { pathToFileURL } from 'url';
import path from 'path';
import { isZodSchema } from './types.js';
import type { z } from 'zod/v4';

export interface SchemaFile {
  filePath: string;
  schemas: SchemaExport[];
}

export interface SchemaExport {
  name: string;
  schema: z.ZodType;
}

export interface ScanOptions {
  verbose?: boolean;
  pattern?: string;
  exclude?: string[];
}

/**
 * Scan a directory for Zod schema exports
 */
export async function scanDirectory(
  inputDir: string,
  options: ScanOptions = {}
): Promise<SchemaFile[]> {
  const { verbose = false, pattern = '**/*.ts', exclude = ['**/*.test.ts', '**/*.spec.ts'] } = options;

  const absoluteDir = path.resolve(inputDir);

  if (verbose) {
    console.log(`Scanning directory: ${absoluteDir}`);
  }

  // Find all TypeScript files
  const files = await glob(pattern, {
    cwd: absoluteDir,
    ignore: exclude,
    nodir: true,
    absolute: false,
  });

  if (verbose) {
    console.log(`Found ${files.length} TypeScript files`);
  }

  const results: SchemaFile[] = [];

  for (const file of files) {
    const filePath = path.join(absoluteDir, file);

    try {
      const schemas = await extractSchemasFromFile(filePath, verbose);

      if (schemas.length > 0) {
        results.push({ filePath, schemas });

        if (verbose) {
          console.log(`  Found ${schemas.length} schemas in ${file}:`);
          for (const s of schemas) {
            console.log(`    - ${s.name}`);
          }
        }
      }
    } catch (error) {
      if (verbose) {
        console.warn(`  Warning: Could not process ${file}: ${error}`);
      }
    }
  }

  if (verbose) {
    const totalSchemas = results.reduce((sum, r) => sum + r.schemas.length, 0);
    console.log(`Total: ${totalSchemas} schemas found in ${results.length} files`);
  }

  return results;
}

/**
 * Extract Zod schema exports from a TypeScript file
 */
async function extractSchemasFromFile(
  filePath: string,
  verbose: boolean
): Promise<SchemaExport[]> {
  // Convert to file URL for dynamic import
  const fileUrl = pathToFileURL(filePath).href;

  // Dynamic import the module
  const module = await import(fileUrl);

  const schemas: SchemaExport[] = [];

  // Iterate over all exports
  for (const [exportName, exportValue] of Object.entries(module)) {
    // Skip non-schema exports
    if (exportName === 'default') continue;

    // Check if it's a Zod schema
    if (isZodSchema(exportValue)) {
      // Only include exports that end with "Schema" or match schema patterns
      if (
        exportName.endsWith('Schema') ||
        exportName.endsWith('Zod') ||
        isLikelySchemaName(exportName)
      ) {
        schemas.push({
          name: normalizeSchemaName(exportName),
          schema: exportValue,
        });
      } else if (verbose) {
        // Also include schemas without standard naming if verbose
        schemas.push({
          name: exportName,
          schema: exportValue,
        });
      }
    }
  }

  return schemas;
}

/**
 * Check if an export name is likely a schema
 */
function isLikelySchemaName(name: string): boolean {
  // Common schema naming patterns
  const schemaPatterns = [
    /Schema$/,
    /Zod$/,
    /^z[A-Z]/, // zUser, zProduct, etc.
    /Validator$/,
  ];

  return schemaPatterns.some((pattern) => pattern.test(name));
}

/**
 * Normalize schema name (remove Schema suffix, etc.)
 */
function normalizeSchemaName(name: string): string {
  // Remove common suffixes
  let normalized = name;

  if (normalized.endsWith('Schema')) {
    normalized = normalized.slice(0, -6);
  } else if (normalized.endsWith('Zod')) {
    normalized = normalized.slice(0, -3);
  }

  // Remove z prefix if present
  if (normalized.startsWith('z') && normalized.length > 1 && normalized[1] === normalized[1].toUpperCase()) {
    normalized = normalized.slice(1);
  }

  return normalized;
}

/**
 * Get a flat list of all schemas from scan results
 */
export function flattenSchemas(scanResults: SchemaFile[]): SchemaExport[] {
  const schemas: SchemaExport[] = [];
  const seenNames = new Set<string>();

  for (const file of scanResults) {
    for (const schema of file.schemas) {
      // Handle duplicate names by appending file context
      let name = schema.name;
      if (seenNames.has(name)) {
        const fileName = path.basename(file.filePath, '.ts');
        name = `${fileName}_${name}`;
      }

      if (!seenNames.has(name)) {
        seenNames.add(name);
        schemas.push({ name, schema: schema.schema });
      }
    }
  }

  return schemas;
}
