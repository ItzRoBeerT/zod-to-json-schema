# zod-to-json-schema

CLI tool to batch-convert Zod 4 schemas to JSON Schema files using **Zod's native `z.toJSONSchema()`**.

## Why This Tool?

Zod 4 includes native JSON Schema support via `z.toJSONSchema()`, but there's no built-in CLI for batch conversion. This tool:

- Auto-discovers Zod schema exports from TypeScript files
- Batch-converts entire directories of schemas
- Supports both separate files and combined output with `$defs`
- Uses Zod's native converter (no custom implementation needed)

## Installation

```bash
# Clone and install
git clone https://github.com/YOUR_USERNAME/zod-to-json-schema.git
cd zod-to-json-schema
npm install

# Or use directly with npx
npx tsx src/index.ts ./your-schemas -o ./output
```

## Usage

### Basic Usage

```bash
# Convert all schemas to separate JSON files (default: draft-2020-12)
npx tsx src/index.ts ./schemas -o ./json-schemas

# Use draft-7 format
npx tsx src/index.ts ./schemas -o ./json-schemas -t draft-7

# Output all schemas in a single combined file
npx tsx src/index.ts ./schemas -o ./json-schemas --combined
```

### Options

```
Usage: zod-to-json-schema [options] <input>

Arguments:
  input                          Input directory containing Zod schemas

Options:
  -V, --version                  output the version number
  -o, --output <dir>             Output directory (default: "./json-schemas")
  -t, --target <version>         JSON Schema version (default: "draft-2020-12")
                                 Options: draft-7, draft-2020-12
  -c, --combined                 Output all schemas in a single file with $defs
  -s, --separate                 Output each schema as a separate file (default)
  -f, --format                   Pretty-print JSON output (default: true)
  -v, --verbose                  Verbose output
  -p, --pattern <glob>           Glob pattern for TypeScript files (default: "**/*.ts")
  -e, --exclude <patterns...>    Patterns to exclude (default: ["**/*.test.ts", "**/*.spec.ts"])
  -h, --help                     display help for command
```

### Examples

```bash
# Separate files with draft-7
npx tsx src/index.ts ./harmonia -o ./schemas -t draft-7
# Creates: ./schemas/Money.json, ./schemas/JourneyProfile.json, etc.

# Single combined file
npx tsx src/index.ts ./harmonia -o ./schemas -c
# Creates: ./schemas/schemas.json with all schemas in $defs

# Verbose output to see all detected schemas
npx tsx src/index.ts ./harmonia -o ./schemas -v

# Custom file pattern
npx tsx src/index.ts ./src -o ./schemas -p "**/schemas/*.ts"
```

## How It Works

This tool uses Zod 4's native `z.toJSONSchema()` function:

```typescript
import { z } from 'zod';

const UserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
});

// Zod 4 native conversion
const jsonSchema = z.toJSONSchema(UserSchema, {
  target: 'draft-7',
  unrepresentable: 'any',
  reused: 'ref',
});
```

### Zod 4 toJSONSchema Options

| Option | Values | Default | Description |
|--------|--------|---------|-------------|
| `target` | `draft-7`, `draft-2020-12` | `draft-2020-12` | JSON Schema version |
| `unrepresentable` | `throw`, `any` | `throw` | How to handle unconvertible types |
| `reused` | `inline`, `ref` | `inline` | Handle repeated schemas |
| `cycles` | `ref`, `throw` | `ref` | Handle circular references |
| `io` | `input`, `output` | `output` | Input vs output type |

## Important: Use `zod/v4` Import

Your schema files **must** import from `zod/v4` (not just `zod`):

```typescript
// Correct - uses Zod 4 native types
import { z } from 'zod/v4';

// Incorrect - uses backwards-compatible Zod 3 types
import { z } from 'zod';
```

The `z.toJSONSchema()` function only works with Zod 4 schema types. If you use the `zod` import (without `/v4`), the conversion will fail.

## Schema Detection

The tool automatically detects exports that:

1. Are Zod schema objects (have `_zod.def` or `_def` property)
2. Follow common naming patterns:
   - `*Schema` (e.g., `UserSchema`, `MoneySchema`)
   - `*Zod` (e.g., `UserZod`)
   - `z*` (e.g., `zUser`)
   - `*Validator`

### Example Schema File

```typescript
// schemas/user.ts
import { z } from 'zod/v4';

// These will be detected and converted:
export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  age: z.number().int().positive().optional(),
});

export const AddressSchema = z.object({
  street: z.string(),
  city: z.string(),
  country: z.string(),
});

// This will NOT be detected (no Schema suffix):
export const Config = z.object({
  debug: z.boolean(),
});
```

## Output Format

### Separate Files (Default)

Each schema is output as its own JSON file:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "User",
  "type": "object",
  "properties": {
    "id": { "type": "string", "format": "uuid" },
    "name": { "type": "string", "minLength": 1 },
    "email": { "type": "string", "format": "email" },
    "age": { "type": "integer", "exclusiveMinimum": 0 }
  },
  "required": ["id", "name", "email"]
}
```

### Combined File (`--combined`)

All schemas in a single file with `$defs`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$defs": {
    "User": {
      "title": "User",
      "type": "object",
      "properties": { ... }
    },
    "Address": {
      "title": "Address",
      "type": "object",
      "properties": { ... }
    }
  }
}
```

## Supported Zod Types

Zod 4's `z.toJSONSchema()` handles most Zod types natively:

### Fully Supported
- All primitives: `string`, `number`, `boolean`, `null`
- String validations: `email`, `url`, `uuid`, `min`, `max`, `regex`, etc.
- Number validations: `min`, `max`, `int`, `positive`, `negative`, etc.
- `object`, `array`, `tuple`, `record`
- `enum`, `nativeEnum`, `literal`
- `union`, `discriminatedUnion`, `intersection`
- `optional`, `nullable`, `default`, `readonly`

### Converted to `{}` (unrepresentable: 'any')
- `z.bigint()`, `z.symbol()`, `z.undefined()`, `z.void()`
- `z.date()`, `z.map()`, `z.set()`
- `z.transform()`, `z.nan()`, `z.custom()`

## Development

```bash
# Install dependencies
npm install

# Build for distribution
npm run build

# Run the CLI directly during development
npm start -- ./your-schemas -o ./json-schemas
```

## Requirements

- Node.js >= 18
- Zod >= 3.25 (Zod 4)

## License

MIT
