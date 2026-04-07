# Relai CRM

A full-featured CRM you can self-host or use as SaaS. Built on React, TypeScript, and PostgreSQL.

## Features

- **Accounts & Contacts** — Company directory, contact management, account 360 views
- **Pipeline** — Kanban board, opportunity tracking, stage history, email drafts
- **Campaigns** — Campaign management, target tracking, auto-tracking, scoring
- **Analytics** — Sales rollup dashboard, KPIs, charts, team performance
- **Forecasting** — Revenue forecasting by category with snapshots
- **Renewals** — Renewal pipeline, contract management, invoicing
- **Territories & Quotas** — Territory hierarchy, quota tracking, attainment
- **Commissions** — Commission plans, ledger, payroll tracking
- **Intelligence** — AI-powered account discovery, fund intelligence, entity resolution
- **Workflows** — Event-triggered automation, approval chains, notifications
- **Admin** — User management, roles (admin/manager/rep/viewer), audit logs
- **Import/Export** — CSV import for contacts, companies, deals

## Architecture

```
relai/
├── apps/web/          # React frontend (Vite + shadcn/ui + Tailwind)
├── packages/
│   ├── db/            # Database abstraction layer (adapters for Supabase & HTTP)
│   ├── api/           # Hono API server (self-hosted mode)
│   ├── core/          # Business logic (WIP)
│   └── config/        # Tenant configuration
├── supabase/          # Migrations + Edge Functions
└── docker-compose.yml # Self-hosted deployment
```

**Two deployment modes:**

| | Hosted (SaaS) | Self-Hosted |
|---|---|---|
| Database | Supabase | Your PostgreSQL |
| Auth | Supabase Auth | JWT (bcrypt + jose) |
| Storage | Supabase Storage | Local filesystem |
| AI Features | Edge Functions | Cloud-only (for now) |
| Realtime | Supabase Realtime | Polling |

## Quick Start

### Option 1: Hosted (Supabase)

```bash
git clone https://github.com/miitheu/relai.git
cd relai
pnpm install

# Create a Supabase project, then:
cp .env.example .env
# Edit .env with your Supabase URL and anon key

pnpm dev
# Open http://localhost:8080
```

### Option 2: Self-Hosted (Docker)

```bash
git clone https://github.com/miitheu/relai.git
cd relai
docker compose up -d

# Run setup wizard
npx tsx scripts/setup.ts

# Open http://localhost:3000
```

### Option 3: Self-Hosted (Manual)

```bash
git clone https://github.com/miitheu/relai.git
cd relai
pnpm install

# Set up PostgreSQL and run setup wizard
npx tsx scripts/setup.ts

# Start API server + frontend
pnpm --filter @relai/api dev &
pnpm dev
```

## Environment Variables

### Hosted Mode

```env
VITE_CRM_MODE=hosted
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### Self-Hosted Mode

```env
VITE_CRM_MODE=self-hosted
VITE_API_URL=http://localhost:3001
DATABASE_URL=postgres://user:pass@localhost:5432/relai
AUTH_SECRET=your-secret-min-32-chars
API_PORT=3001
CORS_ORIGIN=http://localhost:8080
```

## Development

```bash
# Install dependencies
pnpm install

# Start frontend dev server
pnpm dev

# Start API server (self-hosted mode)
pnpm --filter @relai/api dev

# Build all packages
pnpm build

# Run setup wizard
npx tsx scripts/setup.ts
```

## Multi-Tenancy

Every data table has an `org_id` column. In hosted mode, RLS policies enforce org-level isolation. In self-hosted mode, the API server filters by org_id.

New users go through an onboarding wizard to create their organization. Each organization has its own data, settings, and users.

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Query
- **Backend (hosted):** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **Backend (self-hosted):** Hono, postgres.js, bcrypt, jose (JWT)
- **Monorepo:** pnpm workspaces

## License

MIT
