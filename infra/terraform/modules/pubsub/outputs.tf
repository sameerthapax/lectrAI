output "topic_name" {
  value       = google_pubsub_topic.topic.name
  description = "Pub/Sub topic name"
}

output "topic_id" {
  value       = google_pubsub_topic.topic.id
  description = "Pub/Sub topic resource ID"
}

output "subscription_name" {
  value       = google_pubsub_subscription.subscription.name
  description = "Pub/Sub subscription name"
}

output "subscription_id" {
  value       = google_pubsub_subscription.subscription.id
  description = "Pub/Sub subscription resource ID"
}
