# Publishing to npm

This guide describes how to publish `devn-bot-detector` packages (`devn-bot-detector-core`, `devn-bot-detector-client`, and `devn-bot-detector-server`) to the npm registry.

---

## 1. Monorepo Publishing Architecture

The monorepo is configured using **pnpm workspaces** with automated build-before-pack hooks:

| Package | Role | npm Registry Target |
| :--- | :--- | :--- |
| [`devn-bot-detector-core`](../packages/core) | Shared types, validation, error definitions | `https://registry.npmjs.org/devn-bot-detector-core` |
| [`devn-bot-detector-client`](../packages/client) | Browser behavioral telemetry SDK | `https://registry.npmjs.org/devn-bot-detector-client` |
| [`devn-bot-detector-server`](../packages/server) | Server risk engine & framework adapters | `https://registry.npmjs.org/devn-bot-detector-server` |

### Key Package Settings

- **Public Access**: Each package defines `"publishConfig": { "access": "public" }` in its `package.json` so scoped packages publish publicly without requiring paid private organizations.
- **Dynamic Semver Linking**: Client and server depend on `devn-bot-detector-core: "workspace:^"`. When publishing, pnpm converts `workspace:^` into standard semver ranges (e.g., `^0.1.0`).
- **Guaranteed Build Freshness**: Every package contains `"prepack": "pnpm run build"`, ensuring bundles and `.d.ts` declaration maps are compiled immediately prior to packing.
- **Tarball Whitelist**: Packaged files are restricted to `dist/`, `README.md`, and `LICENSE`.

---

## 2. Prerequisites

### A. npm Account
1. Log in to your npm account at [npmjs.com](https://www.npmjs.com/).
2. Because packages are unscoped (`devn-bot-detector-*`), they do not require an organization or scope and can be published directly from your verified account (`devnmishra`).

### B. Local Authentication
Log in via the npm CLI in your terminal:
```bash
npm login
```
Verify your active credentials:
```bash
npm whoami
```

---

## 3. Local Publishing Workflow

### Step 1: Run Pre-Flight Checks & Dry Run
Before publishing real packages, verify typechecking, unit tests, and simulate the exact npm tarballs:

```bash
# 1. Full verification (typecheck + tests + build)
pnpm run check

# 2. Dry-run publish (simulates packaging and registry upload)
pnpm run publish:dry-run
```

Inspect the terminal output to confirm that:
- All 3 packages emit tarballs with status `200`
- `workspace:^` references are replaced by valid semver ranges
- Access is listed as `public`

### Step 2: Publish All Packages
To publish all workspace packages to npm:

```bash
pnpm run publish:packages
```

> [!TIP]
> If your npm account has Two-Factor Authentication (2FA) enabled for writes, provide your one-time code using `--otp`:
> ```bash
> pnpm -r --filter './packages/*' publish --access public --otp=123456
> ```

---

## 4. Versioning Strategy

When releasing updates, increment the version numbers across all 3 packages:

### Patch Release (Bug fixes, internal improvements)
```bash
pnpm -r --filter './packages/*' exec npm version patch --no-git-tag-version
```

### Minor Release (New features, backward-compatible API additions)
```bash
pnpm -r --filter './packages/*' exec npm version minor --no-git-tag-version
```

### Major Release (Breaking API changes)
```bash
pnpm -r --filter './packages/*' exec npm version major --no-git-tag-version
```

After updating versions, rebuild and commit:
```bash
pnpm install
pnpm run check
git commit -am "chore(release): v0.2.0"
git tag v0.2.0
```

---

## 5. Automated CI/CD Publishing (GitHub Actions)

A GitHub Actions workflow is provided at [`.github/workflows/publish.yml`](../.github/workflows/publish.yml).

### Setup Secrets
1. Go to your GitHub repository **Settings → Secrets and variables → Actions**.
2. Click **New repository secret**.
3. Name: `NPM_TOKEN`.
4. Value: An npm Access Token (type: **Automation** or **Granular Access Token** with *Read and Write* packages permission for `devn-*`).

### Triggering Releases
- **Automatic**: Create and publish a GitHub Release tagged `v*` (e.g. `v0.1.0`).
- **Manual**: Go to **Actions → Publish to npm → Run workflow** (supports dry-run mode via checkbox).

---

## 6. Troubleshooting Common Issues

### Issue 1: `403 Forbidden - You must sign up for private packages`
- **Cause**: Scoped packages (`@scope/name`) default to private unless specified.
- **Fix**: Verify `"publishConfig": { "access": "public" }` exists in each package's `package.json`, or pass `--access public` to the publish command.

### Issue 2: `ENEEDAUTH - need auth`
- **Cause**: Invalid or expired npm credentials.
- **Fix**: Run `npm login` or set `NODE_AUTH_TOKEN` in your environment.

### Issue 3: `EOTP - This action requires two-factor authentication`
- **Cause**: npm 2FA is active on your account.
- **Fix**: Append `--otp=<code>` to the publish command with your authenticator code.
