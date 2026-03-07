output "service_name" {
  value       = google_cloud_run_v2_service.service.name
  description = "Cloud Run service name"
}

output "service_uri" {
  value       = google_cloud_run_v2_service.service.uri
  description = "Cloud Run service URI"
}

output "service_account_email" {
  value       = google_service_account.runtime.email
  description = "Service account used by Cloud Run runtime"
}
