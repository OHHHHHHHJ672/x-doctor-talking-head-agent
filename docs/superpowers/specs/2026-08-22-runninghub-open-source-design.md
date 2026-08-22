# RunningHub Open Source Design

## Goal

Publish the talking-head workbench as a standalone Apache-2.0 repository that uses each user's RunningHub account instead of the original account, quota, BFF, MiniMax, and local Whisper services.

## Architecture

The React UI only talks to the local Express service. The service owns a small user-data configuration file, redacts the API key from reads and logs, and exposes configuration, connection-test, upload, create, and output-query routes. RunningHub calls use its OpenAPI upload/create/outputs contract. Workflow IDs and node mappings are user configuration rather than repository secrets.

Local FFmpeg remains responsible for format conversion and subtitle preview. AI operations move to three user-supplied RunningHub workflows: ASR, rewrite, and digital human. Browser code never sends the API key to a remote host directly.

## User Experience

The existing account modal becomes a RunningHub settings dialog with masked API key input, base URL, workflow IDs, save, and test controls. The top bar and sidebar show connection state rather than usernames or points. Missing configuration produces a precise setup message and opens the settings dialog.

## Security And Distribution

The repository excludes environment files, cookies, SSH keys, user data, models, binaries, build output, and operational server scripts. The key is stored only under the ignored local `user-data` directory unless supplied through `RUNNINGHUB_API_KEY`. No key value is returned by configuration endpoints.

## Testing

Node unit tests cover request shapes, output normalization, configuration redaction, and failure handling without paid network calls. TypeScript build and ESLint cover the UI. A manual smoke check validates settings, keyboard use, responsive layout, and empty/error states.

