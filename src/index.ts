#!/usr/bin/env node

/**
 * zod-to-json-schema CLI
 *
 * Convert Zod 4 schemas to JSON Schema files using Zod's native z.toJSONSchema()
 */

import { Command } from 'commander';
import path from 'path';
import fs from 'fs/promises';
import { z } from 'zod/v4';
import { scanDirectory, flattenSchemas, type SchemaExport } from './scanner.js';
import type { JSONSchemaTarget } from './types.js';

const program = new Command();

program
  .name('zod-to-json-schema')
  .description('Convert Zod 4 schemas to JSON Schema using native z.toJSONSchema()')
  .version('1.0.0')
  .argument('<input>', 'Input directory containing Zod schemas')
  .option('-o, --output <dir>', 'Output directory for JSON Schema files', './json-schemas')
  .option('-c, --combined', 'Output all schemas in a single file with $defs', false)
  .option('-s, --separate', 'Output each schema as a separate file (default)', true)
  .option('-t, --target <version>', 'JSON Schema version: draft-7, draft-2020-12', 'draft-2020-12')
  .option('-f, --format', 'Pretty-print JSON output', true)
  .option('-v, --verbose', 'Verbose output', false)
  .option('-p, --pattern <glob>', 'Glob pattern for TypeScript files', '**/*.ts')
  .option('-e, --exclude <patterns...>', 'Patterns to exclude', ['**/*.test.ts', '**/*.spec.ts'])
  .action(async (input, options) => {
    try {
      await run(input, options);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

interface CLIOptions {
  output: string;
  combined: boolean;
  separate: boolean;
  target: JSONSchemaTarget;
  format: boolean;
  verbose: boolean;
  pattern: string;
  exclude: string[];
}

async function run(inputDir: string, options: CLIOptions): Promise<void> {
  const { output, combined, target, format, verbose, pattern, exclude } = options;

  // Resolve paths
  const absoluteInput = path.resolve(inputDir);
  const absoluteOutput = path.resolve(output);

  console.log('zod-to-json-schema v1.0.0');
  console.log('========================');
  console.log(`Input:  ${absoluteInput}`);
  console.log(`Output: ${absoluteOutput}`);
  console.log(`Mode:   ${combined ? 'Combined' : 'Separate files'}`);
  console.log(`Target: ${target}`);
  console.log('');

  // Check input directory exists
  try {
    const stat = await fs.stat(absoluteInput);
    if (!stat.isDirectory()) {
      throw new Error(`Input path is not a directory: ${absoluteInput}`);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Input directory does not exist: ${absoluteInput}`);
    }
    throw error;
  }

  // Scan for schemas
  console.log('Scanning for Zod schemas...');
  const scanResults = await scanDirectory(absoluteInput, { verbose, pattern, exclude });

  if (scanResults.length === 0) {
    console.log('No schemas found.');
    return;
  }

  // Flatten all schemas
  const allSchemas = flattenSchemas(scanResults);
  console.log(`Found ${allSchemas.length} schemas\n`);

  // Create output directory
  await fs.mkdir(absoluteOutput, { recursive: true });

  if (combined) {
    // Output all schemas in a single file
    await writeCombinedOutput(allSchemas, absoluteOutput, target, format, verbose);
  } else {
    // Output each schema as a separate file
    await writeSeparateOutputs(allSchemas, absoluteOutput, target, format, verbose);
  }

  console.log('\nDone!');
}

/**
 * Convert a Zod schema to JSON Schema using native z.toJSONSchema()
 */
function convertToJsonSchema(
  schema: z.ZodType,
  name: string,
  target: JSONSchemaTarget
): Record<string, unknown> {
  try {
    const jsonSchema = z.toJSONSchema(schema, {
      target,
      unrepresentable: 'any', // Convert unsupported types to {}
      reused: 'ref', // Use $ref for repeated schemas
      io: 'output', // Use output types
    });

    // Add title if not present
    if (typeof jsonSchema === 'object' && jsonSchema !== null && !('title' in jsonSchema)) {
      return { title: name, ...jsonSchema };
    }

    return jsonSchema as Record<string, unknown>;
  } catch (error) {
    throw new Error(`Failed to convert schema "${name}": ${error}`);
  }
}

async function writeCombinedOutput(
  schemas: SchemaExport[],
  outputDir: string,
  target: JSONSchemaTarget,
  format: boolean,
  verbose: boolean
): Promise<void> {
  const $defs: Record<string, unknown> = {};
  let errorCount = 0;

  for (const { name, schema } of schemas) {
    try {
      const jsonSchema = convertToJsonSchema(schema, name, target);
      // Remove $schema from individual schemas in combined mode
      const { $schema, ...schemaWithoutMeta } = jsonSchema as Record<string, unknown>;
      $defs[name] = schemaWithoutMeta;
    } catch (error) {
      errorCount++;
      if (verbose) {
        console.error(`  Error converting ${name}: ${error}`);
      }
    }
  }

  // Get the $schema URL based on target
  const schemaUrl = getSchemaUrl(target);

  const combined = {
    $schema: schemaUrl,
    $defs,
  };

  const outputPath = path.join(outputDir, 'schemas.json');
  const content = format ? JSON.stringify(combined, null, 2) : JSON.stringify(combined);

  await fs.writeFile(outputPath, content, 'utf-8');

  console.log(`Written combined schema to: ${outputPath}`);
  if (verbose) {
    console.log(`  Contains ${Object.keys($defs).length} schema definitions`);
  }
  if (errorCount > 0) {
    console.log(`  Errors: ${errorCount}`);
  }
}

async function writeSeparateOutputs(
  schemas: SchemaExport[],
  outputDir: string,
  target: JSONSchemaTarget,
  format: boolean,
  verbose: boolean
): Promise<void> {
  let successCount = 0;
  let errorCount = 0;

  for (const { name, schema } of schemas) {
    try {
      const jsonSchema = convertToJsonSchema(schema, name, target);

      // Add $schema if not present
      const schemaUrl = getSchemaUrl(target);
      const finalSchema = '$schema' in jsonSchema
        ? jsonSchema
        : { $schema: schemaUrl, ...jsonSchema };

      const outputPath = path.join(outputDir, `${name}.json`);
      const content = format ? JSON.stringify(finalSchema, null, 2) : JSON.stringify(finalSchema);

      await fs.writeFile(outputPath, content, 'utf-8');

      if (verbose) {
        console.log(`  Written: ${name}.json`);
      }

      successCount++;
    } catch (error) {
      errorCount++;
      if (verbose) {
        console.error(`  Error converting ${name}: ${error}`);
      }
    }
  }

  console.log(`Written ${successCount} schema files`);
  if (errorCount > 0) {
    console.log(`Errors: ${errorCount}`);
  }
}

/**
 * Get the JSON Schema $schema URL for the target version
 */
function getSchemaUrl(target: JSONSchemaTarget): string {
  switch (target) {
    case 'draft-7':
      return 'http://json-schema.org/draft-07/schema#';
    case 'draft-2020-12':
      return 'https://json-schema.org/draft/2020-12/schema';
    default:
      return 'https://json-schema.org/draft/2020-12/schema';
  }
}

// Run CLI
program.parse();
