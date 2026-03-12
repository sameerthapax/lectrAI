# Terraform

Infrastructure as code for LectrAI.

LectrAI is an AI-powered lecture capture and intelligent study assistant designed to help students record, organize, and study lecture material more effectively. The system allows students to record lectures through a mobile application, upload the audio to a cloud backend, and automatically generate structured study materials including transcripts, summaries, key concepts, timelines, and practice quizzes. LectrAI also provides an AI-powered chat assistant that uses retrieval-augmented generation (RAG) to answer questions based on a student's own lecture recordings.

## What is scaffolded

- `modules/cloudrun`: deploys one Cloud Run service + runtime service account
- `modules/pubsub`: deploys one Pub/Sub topic + subscription
- `environments/dev`: wires modules together and enables required GCP APIs
- `environments/prod`: production environment wiring with safer defaults

## Quick start (dev)

1. Copy vars file:
   - `cp infra/terraform/environments/dev/terraform.tfvars.example infra/terraform/environments/dev/terraform.tfvars`
2. Fill values in `terraform.tfvars` (`project_id`, `cloud_run_image`, names).
3. `cloud_run_deletion_protection` defaults:
   - `dev`: `false`
   - `prod`: `true`
4. Authenticate to GCP (for example `gcloud auth application-default login`).
5. Run:
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
