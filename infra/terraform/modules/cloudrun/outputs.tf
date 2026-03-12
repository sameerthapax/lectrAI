output "service_name" {
  value       = google_cloud_run_v2_service.service.name
  description = "Cloud Run service name"
}

output "service_uri" {
  value       = google_cloud_run_v2_service.service.uri
  description = "Cloud Run service URI"
}

output "cloud_run_service_account_email" {
  value       = "lectrai-api-dev-sa@${var.project_id}.iam.gserviceaccount.com"
  description = "Existing service account used by Cloud Run runtime"
}

output "service_account_email" {
  value       = "lectrai-api-dev-sa@${var.project_id}.iam.gserviceaccount.com"
  description = "Existing service account used by Cloud Run runtime"
}
