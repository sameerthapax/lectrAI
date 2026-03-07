resource "google_pubsub_topic" "topic" {
  project = var.project_id
  name    = var.topic_name
}

resource "google_pubsub_subscription" "subscription" {
  project = var.project_id
  name    = var.subscription_name
  topic   = google_pubsub_topic.topic.id

  ack_deadline_seconds       = var.ack_deadline_seconds
  message_retention_duration = var.message_retention_duration
  retain_acked_messages      = var.retain_acked_messages
}
