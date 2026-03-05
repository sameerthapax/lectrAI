# ParkU Monorepo

Nx monorepo for ParkU mobile, backend, shared packages, infrastructure, and edge runtimes.

## Workspace layout

- `apps/mobile`: Expo app
- `apps/api`: Node API (Cloud Run ready)
- `packages/shared-types`: shared TypeScript types
- `packages/shared-utils`: shared utility helpers
- `packages/vision-protocol`: pub/sub payload envelopes and versioning
- `infra/terraform`: Terraform environments and modules
- `edge/pi`: provisioning, detector, and publisher components
- `edge/models/yolo`: model artifacts and labels
- `tools/scripts`: misc scripts

## Common commands

```bash
nx start mobile
nx serve api
nx run infra:fmt
nx run infra:validate
nx run infra:plan
nx run pi-detector:run
```
