# RunningHub Open Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace private cloud and local AI dependencies with user-configured RunningHub OpenAPI workflows and prepare a clean Apache-2.0 repository.

**Architecture:** A tested local Node adapter owns configuration and remote calls. React consumes only local routes. Existing local media conversion and preview code remains unchanged.

**Tech Stack:** Node.js 18+, Express 5, React 19, TypeScript 6, Vite 8, Node test runner.

## Global Constraints

- Never commit API keys, cookies, private keys, user media, generated output, models, or bundled executables.
- Keep FFmpeg media transforms local; move ASR, rewrite, and digital-human inference to RunningHub.
- Workflow IDs and node mappings must be user configurable.
- License the repository under Apache-2.0.

---

### Task 1: RunningHub Client

**Files:**
- Create: `server/runninghub-client.mjs`
- Test: `server/runninghub-client.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `RunningHubClient`, `normalizeOutputs`, and `RunningHubError`.

- [ ] Write tests asserting upload uses Bearer authentication, create uses `apiKey/workflowId/nodeInfoList`, and outputs normalize URLs and text.
- [ ] Run `npm test` and confirm failure because the module does not exist.
- [ ] Implement the client with injected `fetch`, timeouts, redacted errors, and no logging of secrets.
- [ ] Run `npm test` and confirm all client tests pass.

### Task 2: Local Configuration And Routes

**Files:**
- Create: `server/runninghub-config.mjs`
- Test: `server/runninghub-config.test.mjs`
- Modify: `server/local-api.mjs`

**Interfaces:**
- Produces: `loadRunningHubConfig()`, `saveRunningHubConfig(input)`, `publicRunningHubConfig(config)`.
- Consumes: `RunningHubClient` from Task 1.

- [ ] Write failing tests for defaults, masked reads, environment override, and validation.
- [ ] Implement configuration persistence under `user-data/settings.json` and compatibility routes for upload/create/sync.
- [ ] Add `/api/runninghub/config` and `/api/runninghub/test` routes.
- [ ] Run `npm test` and confirm all tests pass.

### Task 3: React Configuration Experience

**Files:**
- Modify: `src/lib/edgeApi.ts`
- Modify: `src/store/useProjectStore.ts`
- Modify: `src/components/ApiConfig/ApiConfigModal.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar/Sidebar.tsx`
- Modify: `src/components/StepList/steps/Step3Audio.tsx`

**Interfaces:**
- Consumes: local configuration and RunningHub compatibility routes from Task 2.
- Produces: connection state and a settings dialog without account or quota behavior.

- [ ] Add API-level tests where practical and run them red before changing behavior.
- [ ] Replace login, token, password, and quota logic with settings and connection state.
- [ ] Remove quota gating and update user-facing copy to identify RunningHub.
- [ ] Run `npm run build` and `npm run lint`.

### Task 4: Repository Hygiene And Documentation

**Files:**
- Modify: `.gitignore`
- Modify: `.env.example`
- Modify: `README.md`
- Create: `LICENSE`
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `workflows/README.md`
- Delete: `scripts/patch_remote_bff_error_mapping.py`
- Delete: `scripts/patch_remote_runninghub_client.py`
- Delete: `scripts/rh_probe_in_container.py`
- Delete: `server/__pycache__/extract_workflow.cpython-311.pyc`

**Interfaces:**
- Documents exact setup keys, workflow-node mappings, installation, operation, testing, and security reporting.

- [ ] Expand ignore rules and remove private operations artifacts.
- [ ] Add Apache-2.0 and repository policy documents.
- [ ] Rewrite README with quick start and RunningHub workflow configuration.
- [ ] Run a repository secret and large-file scan and confirm no blocked files remain.

### Task 5: Final Verification

- [ ] Run `npm ci`, `npm test`, `npm run lint`, and `npm run build`.
- [ ] Start the local server and verify settings save/test/error flows in a browser.
- [ ] Inspect `git status`, staged files, file sizes, and secret-pattern scan.
- [ ] Commit the verified open-source release changes.
