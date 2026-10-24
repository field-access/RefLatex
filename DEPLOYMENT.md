# Deploy ConceptCards to Vercel

Requires Node.js LTS and a Vercel account. This deploys the static web app using
`vercel.json`; no build step or Windows desktop build is needed.

First, sign in:

```powershell
npx --yes vercel@latest login
```

From the repository folder, create a preview deployment:

```powershell
./scripts/deploy-vercel.ps1
```

On the first deployment, the CLI asks which Vercel account and project to use.
Choose the existing ConceptCards project if it is already deployed. The CLI saves
the project link locally in `.vercel/` for subsequent runs.

Deploy to the production domain:

```powershell
./scripts/deploy-vercel.ps1 -Production
```

Inspect the command without uploading anything:

```powershell
./scripts/deploy-vercel.ps1 -Production -DryRun
```

The script also works when invoked from another folder. If PowerShell blocks
local scripts, use a one-time process override:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/deploy-vercel.ps1
```

For deployments from a connected Git branch, Vercel uses the existing static-site
configuration automatically. The CLI script is an additional manual deployment
option.
