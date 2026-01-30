# Execution Plan

How to set up, scaffold, run, test, and validate the 8P3P Control Layer locally.

---

## Current State

| Item | Status |
|------|--------|
| `package.json` | ⬜ Not created |
| `tsconfig.json` | ⬜ Not created |
| `vitest.config.ts` | ⬜ Not created |
| `src/` directory | ⬜ Not created |
| Dependencies installed | ⬜ Not installed |
| Database initialized | ⬜ Not created |

**Starting point:** Empty repository with documentation only.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | >= 20.0.0 | Required by Vitest; use LTS recommended |
| **npm** | >= 10.0.0 | Comes with Node.js 20+ |
| **Git** | Any recent | For version control |

### Verify Prerequisites

```bash
node --version   # Should output v20.x.x or higher
npm --version    # Should output 10.x.x or higher
```

### Optional: Use Node Version Manager

```bash
# Using nvm
nvm install 20
nvm use 20

# Using fnm
fnm install 20
fnm use 20
```

---

## Phase 0: Project Scaffolding

This section creates the project from scratch.

### Step 1: Initialize npm Project

```bash
npm init -y
```

### Step 2: Install Dependencies

**Production dependencies:**

```bash
npm install fastify better-sqlite3
```

> **Note:** Fastify includes `ajv` and `ajv-formats` via `@fastify/ajv-compiler`. No need to install separately.

**Development dependencies:**

```bash
npm install -D typescript @types/node @types/better-sqlite3 \
  vitest tsx eslint @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

> **Versions (as of January 2025):** fastify 5.7.x, typescript 5.9.x, vitest 4.x, better-sqlite3 12.x, tsx 4.x

### Step 3: Create TypeScript Configuration

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### Step 4: Create Vitest Configuration

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts']
    }
  }
});
```

### Step 5: Create Directory Structure

```bash
mkdir -p src/contracts/schemas
mkdir -p src/contracts/validators
mkdir -p src/ingestion
mkdir -p src/signalLog
mkdir -p src/state
mkdir -p src/decision
mkdir -p src/output
mkdir -p src/shared
mkdir -p tests/contracts
mkdir -p tests/integration
mkdir -p tests/unit
mkdir -p scripts
mkdir -p data
```

**Resulting structure:**

```
8p3p-control-layer/
├── src/
│   ├── contracts/
│   │   ├── schemas/         # JSON Schema files
│   │   └── validators/      # Compiled Ajv validators
│   ├── ingestion/           # Signal ingestion API
│   ├── signalLog/           # Append-only signal storage
│   ├── state/               # STATE engine
│   ├── decision/            # Decision engine
│   ├── output/              # Decision output API
│   └── shared/              # Utilities, types, error codes
├── tests/
│   ├── contracts/           # Contract validation tests
│   ├── integration/         # End-to-end lifecycle tests
│   └── unit/                # Component unit tests
├── scripts/                 # Build and validation scripts
├── data/                    # Local SQLite database (gitignored)
├── docs/                    # Documentation (existing)
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Step 6: Update package.json Scripts

Add to `package.json`:

```json
{
  "name": "8p3p-control-layer",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:contracts": "vitest run tests/contracts",
    "test:integration": "vitest run tests/integration",
    "test:unit": "vitest run tests/unit",
    "validate:schemas": "tsx scripts/validate-schemas.ts",
    "validate:fixtures": "tsx scripts/validate-fixtures.ts",
    "db:init": "tsx scripts/init-db.ts",
    "db:reset": "tsx scripts/reset-db.ts",
    "lint": "eslint src tests",
    "typecheck": "tsc --noEmit"
  }
}
```

### Step 7: Update .env.example

The existing `.env.example` has:

```env
PORT=3000
NODE_ENV=development
```

Add the missing variables:

```env
PORT=3000
NODE_ENV=development
DB_PATH=data/control-layer.db
LOG_LEVEL=info
```

### Step 8: Add data/ to .gitignore

Append to `.gitignore`:

```
# Local database
data/
```

### Step 9: Create Entry Point Placeholder

Create `src/server.ts`:

```typescript
import Fastify from 'fastify';

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  }
});

server.get('/health', async () => {
  return { status: 'ok' };
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
```

### Phase 0 Scaffolding Checklist

After completing the above steps, verify:

- [ ] `npm install` completes without errors
- [ ] `npm run typecheck` passes
- [ ] `npm run dev` starts the server on port 3000
- [ ] `curl http://localhost:3000/health` returns `{"status":"ok"}`

---

## Technology Stack

| Component | Package | Version | Purpose |
|-----------|---------|---------|---------|
| **Language** | typescript | 5.9.x | Type safety, better AI agent performance |
| **Framework** | fastify | 5.7.x | Minimal HTTP framework with schema support |
| **Validation** | ajv | (bundled) | JSON Schema validation — included in Fastify |
| **Local Storage** | better-sqlite3 | 12.x | Synchronous SQLite for local development |
| **Test Runner** | vitest | 4.x | Fast, TypeScript-native testing |
| **Dev Runner** | tsx | 4.x | TypeScript execution without compilation |

---

## Running Locally

### Start the Development Server

```bash
npm run dev
```

The server starts at `http://localhost:3000` with hot-reload enabled.

### Available Endpoints (After Implementation)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check endpoint |
| `POST` | `/signals` | Ingest a SignalEnvelope |
| `GET` | `/decisions` | Query decisions for a learner |

### Example: Health Check

```bash
curl http://localhost:3000/health
# Response: {"status":"ok"}
```

---

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run Specific Test Suites

```bash
# Contract tests only
npm run test:contracts

# Integration tests only
npm run test:integration

# Unit tests only
npm run test:unit
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

### Test Naming Convention

Tests are named by their Contract Test Matrix ID:

```
tests/
├── contracts/
│   ├── SIG-API-001.test.ts      # Signal API contract tests
│   ├── SIGLOG-001.test.ts       # Signal Log contract tests
│   ├── STATE-001.test.ts        # STATE engine contract tests
│   ├── DEC-001.test.ts          # Decision engine contract tests
│   └── OUT-API-001.test.ts      # Output API contract tests
```

---

## Validating Contracts

Contract validation ensures all inputs/outputs match the schemas defined in `docs/foundation/`.

### Validate All Schemas

```bash
npm run validate:schemas
```

### Validate Against Test Data

```bash
npm run validate:fixtures
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `NODE_ENV` | `development` | Environment mode |
| `DB_PATH` | `data/control-layer.db` | SQLite database path |
| `LOG_LEVEL` | `info` | Logging verbosity (debug, info, warn, error) |

---

## NPM Scripts Reference

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `tsx watch src/server.ts` | Start dev server with hot-reload |
| `build` | `tsc` | Compile TypeScript to JavaScript |
| `start` | `node dist/server.js` | Run compiled server |
| `test` | `vitest run` | Run all tests once |
| `test:watch` | `vitest` | Run tests in watch mode |
| `test:coverage` | `vitest run --coverage` | Run tests with coverage |
| `typecheck` | `tsc --noEmit` | Type-check without emitting |
| `lint` | `eslint src tests` | Run linter |

---

## Development Workflow

### Starting a New Session

1. Pull latest changes: `git pull`
2. Install any new dependencies: `npm install`
3. Run tests to verify baseline: `npm test`
4. Start development server: `npm run dev`

### Before Committing

```bash
npm run typecheck && npm run lint && npm test
```

All checks must pass before committing.

---

## Troubleshooting

### "Cannot find module 'better-sqlite3'"

The `better-sqlite3` package requires native compilation:

```bash
rm -rf node_modules package-lock.json
npm install
```

On macOS, you may need Xcode Command Line Tools:

```bash
xcode-select --install
```

### "Port 3000 already in use"

```bash
PORT=3001 npm run dev
```

### Tests Failing After Pull

```bash
npm install
npm test
```

---

## Next Steps After Scaffolding

Once scaffolding is complete, proceed to **Phase 1** implementation:

1. **Session 1-2**: Implement Ingestion (SIG-API-* tests)
2. **Session 3**: Implement Signal Log (SIGLOG-* tests)
3. **Session 4**: Implement STATE Engine (STATE-* tests)
4. **Session 5**: Implement Decision Engine (DEC-* tests)
5. **Session 6**: Implement Output (OUT-API-* tests)

Refer to `docs/solo-dev-execution-playbook.md` for detailed implementation guidance.
