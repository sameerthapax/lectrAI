# LectrAI Monorepo

LectrAI is an AI-powered lecture capture and intelligent study assistant designed to help students record, organize, and study lecture material more effectively. The system allows students to record lectures through a mobile application, upload the audio to a cloud backend, and automatically generate structured study materials including transcripts, summaries, key concepts, timelines, and practice quizzes. LectrAI also provides an AI-powered chat assistant that uses retrieval-augmented generation (RAG) to answer questions based on a student's own lecture recordings.

This Nx monorepo contains the LectrAI mobile app, backend services, shared packages, and infrastructure for a cloud-backed lecture capture and study platform.

## Workspace layout

- `apps/mobile`: Expo app for lecture capture and study workflows
- `apps/api`: Node API for cloud-backed LectrAI services (Cloud Run ready)
- `packages/shared-types`: shared TypeScript types
- `packages/shared-utils`: shared utility helpers
- `infra/terraform`: Terraform environments and modules
- `tools/scripts`: misc scripts

## Common commands

```bash
nx start mobile
nx serve api
nx run infra:fmt
nx run infra:validate
nx run infra:plan
```

## Mobile setup

The Expo app reads public client-side variables from `apps/mobile/.env.local`.

1. Copy `apps/mobile/.env.example` to `apps/mobile/.env.local`.
2. Set `EXPO_PUBLIC_API_BASE_URL` to your backend URL.

Example for the iOS simulator:

```bash
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000/api
```

Example for a physical device on the same network:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.42:3000/api
```

Start the app from the repo root so Expo injects the variables during bundling:

```bash
npx nx run-ios mobile
```

If you change an `EXPO_PUBLIC_*` variable, restart Metro before relaunching the app.
