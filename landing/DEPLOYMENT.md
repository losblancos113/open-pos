# Deploying Landing Page to Vercel

This document outlines the setup, secrets, and manual GitHub Actions workflow used to build and deploy the Open POS landing page to Vercel.

---

## 1. Architecture Overview

The landing page (`landing/`) is a standalone Vue 3 + Vite Single Page Application. Deployment is handled via a **manual GitHub Actions workflow** (`.github/workflows/deploy-landing.yml`) featuring two distinct jobs:

1. **`build` (Build & Validate)**:
   - Runs on `ubuntu-latest` with Node.js 22.
   - Installs dependencies with `npm ci` inside `landing/`.
   - Runs strict TypeScript typechecking (`vue-tsc --noEmit`).
   - Compiles production assets (`vite build`).
   - Uploads dist artifacts (`landing-dist`) for inspection.
   - Generates a GitHub Step Summary with bundle statistics.

2. **`deploy` (Deploy to Vercel)**:
   - Depends on `build` succeeding.
   - Skipped if `dry_run: true` was selected.
   - Validates that required Vercel credentials exist, providing friendly diagnostic errors if any are missing.
   - Authenticates via Vercel CLI (`vercel pull --environment=<env>`).
   - Builds project artifacts (`vercel build`).
   - Deploys prebuilt output (`vercel deploy --prebuilt`).
   - Reports the live deployment URL directly to the GitHub Environment and Step Summary.

---

## 2. Required Secrets and Variables

Configure the following credentials in **GitHub Repository Settings** (`Settings` → `Secrets and variables` → `Actions`):

| Name | Type | Description | Where to find |
| :--- | :--- | :--- | :--- |
| `VERCEL_TOKEN` | **Repository Secret** | Personal Access Token with deployment permissions | Vercel Dashboard → [Account Settings → Tokens](https://vercel.com/account/tokens) |
| `VERCEL_ORG_ID` | **Secret or Variable** | Organization or User Account ID | In Vercel Project Settings or via `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | **Secret or Variable** | Vercel Project ID | In Vercel Project Settings → General or via `.vercel/project.json` |

> **Note on Org ID & Project ID:** The workflow supports setting `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` as either Repository Secrets or Repository Variables (`vars.*`).

### Quick Way to Retrieve `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`

If you have the Vercel CLI installed locally:

```bash
cd landing
npx vercel link
cat .vercel/project.json
```

The output file `.vercel/project.json` will contain:

```json
{
  "orgId": "team_xxxxxxxxxxxxxxxxxxxx",
  "projectId": "prj_xxxxxxxxxxxxxxxxxxxx"
}
```

Copy `orgId` to `VERCEL_ORG_ID` and `projectId` to `VERCEL_PROJECT_ID`.

---

## 3. Vercel Project Settings

When creating or importing the project in Vercel:

1. **Framework Preset:** `Vite` (automatically detected via `landing/vercel.json`).
2. **Root Directory:** Set to `landing`.
3. **Build Command:** `npm run build` (or left to default).
4. **Output Directory:** `dist`.
5. **Install Command:** `npm ci`.

### Configuration File (`landing/vercel.json`)

The repository includes `landing/vercel.json` with:
- **SPA Fallback:** Rewrites all routes to `/index.html`.
- **Cache Optimization:** 1-year immutable caching (`max-age=31536000, immutable`) for content-hashed assets under `/assets/*`.
- **Security Headers:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.

---

## 4. GitHub Environments (Optional but Recommended)

You can configure GitHub Environments for fine-grained governance:

1. Navigate to **Settings → Environments** in your GitHub repository.
2. Create two environments:
   - `production` (maps to production deployments and custom domains).
   - `preview` (maps to staging/preview deployments).
3. (Optional) Set **Required Reviewers** on `production` if you require sign-off before production pushes.
4. (Optional) Define environment-level secrets if staging and production use distinct Vercel projects or tokens.

---

## 5. How to Run the Workflow

### Via GitHub Web UI

1. Go to the **Actions** tab in GitHub.
2. In the left sidebar, click **Deploy Landing Page to Vercel**.
3. Click the **Run workflow** dropdown on the right:
   - **Branch:** Select branch (typically `main`).
   - **Deployment target environment:** Select `production` or `preview`.
   - **Dry run:** Check this box if you only want to validate typechecking and building without deploying to Vercel.
4. Click **Run workflow**.
5. Once complete, click into the workflow run to see the build summary and click the generated **Deployment URL**.

### Via GitHub CLI (`gh`)

**Deploy to Production:**
```bash
gh workflow run deploy-landing.yml -f environment=production
```

**Deploy to Preview:**
```bash
gh workflow run deploy-landing.yml -f environment=preview
```

**Dry Run (Build & Typecheck only):**
```bash
gh workflow run deploy-landing.yml -f environment=production -f dry_run=true
```

---

## 6. Troubleshooting

- **"Missing required Vercel credentials" error:** Ensure `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID` are configured in GitHub Actions secrets/variables.
- **TypeScript build error:** Run `npm run landing:build` locally to reproduce and fix type errors before dispatching.
- **Custom Domains:** Configure custom domains (e.g. `openpos.dev`) in the Vercel Project Dashboard under **Settings → Domains**. Production runs will automatically update the primary domain.
