locals {
  required_apis = toset([
    "run.googleapis.com",
    "pubsub.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "iam.googleapis.com"
  ])
}

resource "google_project_service" "required" {
  for_each           = local.required_apis
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

module "cloudrun" {
  source = "../../modules/cloudrun"

  project_id          = var.project_id
  region              = var.region
  service_name        = var.cloud_run_service_name
  container_image     = var.cloud_run_image
  deletion_protection = var.cloud_run_deletion_protection

  allow_unauthenticated = false

  environment_variables = {
    NODE_ENV             = var.environment
    GOOGLE_CLOUD_PROJECT = var.google_cloud_project
    FIRESTORE_DATABASE_ID = var.firestore_database_id
  }

  depends_on = [google_project_service.required]
}

module "pubsub" {
  source = "../../modules/pubsub"

  project_id        = var.project_id
  topic_name        = var.pubsub_topic_name
  subscription_name = var.pubsub_subscription_name

  depends_on = [google_project_service.required]
}
