output "cloud_run_service_name" {
  value       = module.cloudrun.service_name
  description = "Cloud Run service name"
}

output "cloud_run_service_uri" {
  value       = module.cloudrun.service_uri
  description = "Cloud Run service URL"
}

output "cloud_run_service_account_email" {
  value       = module.cloudrun.cloud_run_service_account_email
  description = "Cloud Run runtime service account"
}

output "pubsub_topic_name" {
  value       = module.pubsub.topic_name
  description = "Pub/Sub topic name"
}

output "pubsub_subscription_name" {
  value       = module.pubsub.subscription_name
  description = "Pub/Sub subscription name"
}
