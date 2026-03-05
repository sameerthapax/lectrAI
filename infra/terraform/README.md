# Terraform

Infrastructure as code for ParkU.

## Nx targets

```bash
nx run infra:fmt
nx run infra:validate
nx run infra:plan
```

Targets currently default to the `dev` environment for validate/plan.
