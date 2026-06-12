# PostgreSQL Production Migration Strategy

This guide outlines the technical steps to migrate the Mediloop v4.0 database from the local SQLite setup to a production PostgreSQL database.

---

## 1. Schema Configuration

In production, Prisma must be configured to use `postgresql` as the datasource provider. Since Prisma schemas do not support dynamic provider variables, we maintain two schema definitions:

*   **Development Schema**: [schema.prisma](file:///c:/Users/soham/Desktop/Mediloop/Mediloop-main/Mediloop-main/backend/prisma/schema.prisma) (SQLite)
*   **Production Schema**: [schema.postgres.prisma](file:///c:/Users/soham/Desktop/Mediloop/Mediloop-main/Mediloop-main/backend/prisma/schema.postgres.prisma) (PostgreSQL)

### Production Schema Connection configuration
```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

---

## 2. Docker & Environment Setup

The production database is managed via Docker Compose (`docker-compose.yml`) using a standard PostgreSQL image:

```yaml
services:
  db:
    image: postgres:15-alpine
    container_name: mediloop-db
    restart: always
    environment:
      POSTGRES_DB: mediloop
      POSTGRES_USER: mediloop_user
      POSTGRES_PASSWORD: mediloop_secure_pass_2026
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

Ensure `DATABASE_URL` is set in the environment variables:
```bash
DATABASE_URL="postgresql://mediloop_user:mediloop_secure_pass_2026@localhost:5432/mediloop?schema=public"
```

---

## 3. Migration Steps

### Step 3.1: Generate client types for PostgreSQL
Override the default schema parameter during generation:
```bash
npx prisma generate --schema=backend/prisma/schema.postgres.prisma
```

### Step 3.2: Create and Apply Migration
To generate and apply the initial migration on the PostgreSQL target instance:
```bash
npx prisma migrate dev --name init_postgres --schema=backend/prisma/schema.postgres.prisma
```

This will connect to the PostgreSQL instance, create the required tables, indexes, and constraints, and output SQL migration files under the `backend/prisma/migrations/` directory.

### Step 3.3: Seed PostgreSQL Database
Once migrations have succeeded, populate the production/staging database using the seeding script:
```bash
node backend/prisma/seed.js
```

---

## 4. SQLite to PostgreSQL Data Portability (Production Transition)

For a one-time migration of active pilot rotation records from SQLite to PostgreSQL, follow these steps:

1.  **Export SQLite Data**: Dump the SQLite tables to SQL format or CSV.
    ```bash
    sqlite3 backend/data/mediloop.db .dump > sqlite_dump.sql
    ```
2.  **Clean SQL Syntax**: Convert SQLite specific types (like autoincrement keywords or SQLite specific index declarations) to PostgreSQL compatible syntax.
3.  **Insert into PostgreSQL**: Run the database client or pg_restore to seed the PostgreSQL database:
    ```bash
    psql -h localhost -U mediloop_user -d mediloop -f sqlite_dump.sql
    ```
4.  **Validate Constrains**: Verify that all foreign keys, indexes, and unique constraints are fully synchronized and active.
