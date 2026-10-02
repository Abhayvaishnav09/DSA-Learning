# CI/CD

How code gets from a pull request to users. Workflows live in `.github/workflows/`.

```
pull request ──► CI (ci.yml) ── must pass to merge
                   quality · integration · build · e2e · infra · docker · security

merge to main ──► CD (cd.yml)
                   CI again ─► images :main, :sha-abc1234 (GHCR, signed provenance + SBOM, Trivy scan)
                            ─► website on Vercel (free plan)
                            ─► staging   (Kubernetes and/or Render, if connected)

tag v1.2.3 ────► CD (cd.yml)
                   CI again ─► images :1.2.3, :1.2, :latest (scan must be clean)
                            ─► GitHub Release (notes, demo file, Kubernetes manifests for this version)
                            ─► production (waits for approval; Kubernetes and/or Render)
```

## CI: what every pull request must pass

| Job | What it checks |
|---|---|
| Lint, types, unit tests | Prettier, content check (every answer key is verified by running the code), ESLint (with accessibility and type-aware rules), knip (unused code), TypeScript, unit tests with coverage thresholds |
| Service integration tests | Every service against real Postgres 16, NATS JetStream and Redis, including contract tests (each service's API must match the shared endpoint table) |
| Build everything | All packages, service bundles, the website and the single-file demo |
| End-to-end | Playwright on desktop and phone sizes: journeys, accessibility (axe), keyboard use, 3D fallbacks, JavaScript size budgets |
| Infrastructure as code | Generated files are up to date; Kubernetes manifests pass `kubeconform -strict`; the compose file is valid |
| Container images build | The service, gateway and web Dockerfiles still build |
| Security (security.yml) | CodeQL on the code and the workflows; dependency review blocks new high-severity or GPL/AGPL dependencies |

`CI passed` is the single check to require in branch protection.

## One-time setup (repository settings)

1. **Default branch**: Settings → General → Default branch → `main`. Dependabot and release notes follow the default branch.
2. **Branch protection** for `main`: Settings → Branches → require the `CI passed` check and a review.
3. **Website on Vercel** (free Hobby plan, nothing to install):
   1. Sign up at vercel.com with **Continue with GitHub**.
   2. Account Settings → **Tokens** → create a token and copy it.
   3. Here: Settings → Secrets and variables → Actions → **New repository secret** `VERCEL_TOKEN`.

   The next push to main (or **Run workflow** on CD) creates the Vercel project `logicpath` and deploys the website. The address appears in the run summary and under the repository's **Deployments → website**. Don't import the repository in Vercel's dashboard: CD deploys only after CI passes, and `apps/web/vercel.json` turns off Vercel's own Git deploys. Until the API is hosted, the website uses the in-browser backend with the demo accounts. Without the secret, the job passes and says "Website not deployed".
4. **Environments**: Settings → Environments → create `staging` and `production`. On `production`, add **required reviewers** so deploys wait for approval. In each environment, add a variable `PUBLIC_URL` (for example `https://staging.logicpath.dev`) to enable the post-deploy smoke test.
5. **Packages**: after the first CD run, open each package under the repository's Packages and set its visibility (public is simplest for Render; for a private registry, give Render and the cluster a pull credential).
6. **Dependabot** and **code scanning** are on by default once the files are merged.

## Connecting deploy targets

Both targets are optional and independent. Without their secrets, the deploy jobs pass and say "not connected" in the run summary.

### Kubernetes

Manifests are generated in `infra/k8s/` (run `pnpm infra:generate` after adding a service):

- `base/`: every service, the gateway and the website as hardened Deployments (non-root, read-only filesystem, no capabilities). Each has readiness, liveness and startup probes, plus an HPA, a PodDisruptionBudget, a NetworkPolicy and an Ingress (`/v1`, `/public`, `/.well-known`, `/media` go to the gateway; everything else goes to the website). NATS and Redis run in the cluster.
- `overlays/staging/`: one replica each, an in-cluster Postgres with one database per service, host `staging.logicpath.dev`.
- `overlays/production/`: two replicas and up to ten under load, an external managed Postgres, host `logicpath.dev`.

Steps:

1. In each environment, add a secret `KUBE_CONFIG` holding the base64 kubeconfig of a deploy account (`base64 -w0 kubeconfig`).
2. Create the runtime secrets once per namespace (`logicpath-staging` and `logicpath`):

   ```sh
   kubectl -n logicpath create secret generic logicpath-secrets \
     --from-literal=internal-token="$(openssl rand -hex 32)" \
     --from-literal=admin-email=admin@example.com \
     --from-literal=admin-password='<strong password>' \
     --from-literal=postgres-password='<staging only>'
   kubectl -n logicpath create secret generic logicpath-db \
     --from-literal=identity=postgres://identity:<pw>@<host>:5432/identity \
     --from-literal=profile=postgres://profile:<pw>@<host>:5432/profile   # one key per service
   ```

3. The cluster needs an NGINX ingress controller and a TLS setup of your choice (for example cert-manager).

CD sets every image to the commit (staging) or version (production) tag and applies the overlay. It waits for each rollout and rolls back automatically if one fails.

### Render

Cost: Render's free instances are for web services only, so each private service, NATS and the gateway need at least the Starter plan (about $7 a month each), plus Key Value and Postgres. With today's four services that is roughly $60–70 a month, and it grows with each service you add. Check render.com/pricing before you start.

1. In Render: **New → Blueprint**, then pick this repository. `render.yaml` creates the services, NATS with a disk, and a Key Value store for Redis.
2. Create one database per service in a Render Postgres instance (`infra/compose/postgres-init.sh` lists them). Fill each service's `DATABASE_URL`, plus `ADMIN_EMAIL`, `ADMIN_PASSWORD` and the gateway's `CORS_ORIGINS`.
3. For each service, copy its **Deploy Hook** URL, then add an environment secret `RENDER_DEPLOY_HOOKS`:

   ```json
   { "identity": "https://api.render.com/deploy/srv-…?key=…", "gateway": "…", "web": "…" }
   ```

   CD calls each hook with the new image, so Render runs exactly what was tested.

## Releasing

```sh
git tag v1.2.0 && git push origin v1.2.0      # a tag with a hyphen (v1.3.0-rc.1) makes a pre-release
```

The release notes are generated from merged pull requests. The production deploy waits for an approver. To roll back, re-run the production deploy of the previous tag from the Actions tab, or run `kubectl rollout undo`.

## Images

`ghcr.io/abhayvaishnav09/dsa-learning/<name>`, with names from `infra/ci/images.mjs` (each service, `gateway`, `web`). The images:

- are multi-stage, with Node 22 slim as the base;
- run as an unprivileged user, with a health check;
- carry build provenance and an SBOM.

Build one locally:

```sh
docker build -f infra/docker/service.Dockerfile --build-arg SERVICE=identity -t logicpath/identity .
docker build -f infra/docker/web.Dockerfile -t logicpath/web .
```

Behind a TLS-inspecting proxy, add `--secret id=extra_ca,src=/path/to/ca.crt`. Docker passes the CA to the build as a secret and it never ends up in the image.
