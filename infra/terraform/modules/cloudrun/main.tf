locals {
  runtime_service_account_id = substr(replace(lower("${var.service_name}-sa"), "/[^a-z0-9-]/", "-"), 0, 30)
  invoker_members            = var.allow_unauthenticated ? concat(var.invoker_members, ["allUsers"]) : var.invoker_members
}

resource "google_service_account" "runtime" {
  project      = var.project_id
  account_id   = trimsuffix(local.runtime_service_account_id, "-")
  display_name = "${var.service_name} runtime"
}

resource "google_cloud_run_v2_service" "service" {
  project             = var.project_id
  location            = var.region
  name                = var.service_name
  ingress             = var.ingress
  deletion_protection = var.deletion_protection

  template {
    service_account = google_service_account.runtime.email

    scaling {
      min_instance_count = var.min_instance_count
      max_instance_count = var.max_instance_count
    }

    containers {
      image = var.container_image

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
      }

      ports {
        container_port = var.container_port
      }

      dynamic "env" {
        for_each = var.environment_variables
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secret_environment_variables
        content {
          name = env.value.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
          }
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "invoker" {
  for_each = toset(local.invoker_members)

  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.service.name
  role     = "roles/run.invoker"
  member   = each.value
}
