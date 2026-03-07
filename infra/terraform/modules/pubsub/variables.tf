variable "project_id" {
  type        = string
  description = "GCP project ID"
}

variable "topic_name" {
  type        = string
  description = "Pub/Sub topic name"
}

variable "subscription_name" {
  type        = string
  description = "Pub/Sub subscription name"
}

variable "ack_deadline_seconds" {
  type        = number
  description = "Ack deadline in seconds"
  default     = 20
}

variable "message_retention_duration" {
  type        = string
  description = "How long to retain unacked messages"
  default     = "604800s"
}

variable "retain_acked_messages" {
  type        = bool
  description = "Whether to retain acknowledged messages"
  default     = false
}
