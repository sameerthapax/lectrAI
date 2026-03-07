# Terraform

Infrastructure as code for ParkU.

## What is scaffolded

- `modules/cloudrun`: deploys one Cloud Run service + runtime service account
- `modules/pubsub`: deploys one Pub/Sub topic + subscription
- `environments/dev`: wires modules together and enables required GCP APIs

## Quick start (dev)

1. Copy vars file:
   - `cp infra/terraform/environments/dev/terraform.tfvars.example infra/terraform/environments/dev/terraform.tfvars`
2. Fill values in `terraform.tfvars` (`project_id`, `cloud_run_image`, names).
3. Authenticate to GCP (for example `gcloud auth application-default login`).
4. Run:
   - `terraform -chdir=infra/terraform/environments/dev init`
   - `terraform -chdir=infra/terraform/environments/dev plan`
   - `terraform -chdir=infra/terraform/environments/dev apply`

## Nx targets

```bash
nx run infra:fmt
nx run infra:validate
nx run infra:plan
```

Targets currently default to the `dev` environment for validate/plan.
