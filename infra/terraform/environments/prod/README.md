# prod

Production Terraform environment for ParkU.

Defaults in this environment are production-safe:
- `cloud_run_deletion_protection = true`

Quick start:
- `cp infra/terraform/environments/prod/terraform.tfvars.example infra/terraform/environments/prod/terraform.tfvars`
- set production values/backend settings
- run `terraform -chdir=infra/terraform/environments/prod init && terraform -chdir=infra/terraform/environments/prod plan`
