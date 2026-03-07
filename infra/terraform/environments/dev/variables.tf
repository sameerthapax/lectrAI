variable "project_id" {
  type        = string
  description = "GCP project ID"
}

variable "region" {
  type        = string
  description = "GCP region"
  default     = "us-central1"
}

variable "environment" {
  type        = string
  description = "Environment name suffix"
  default     = "dev"
}

variable "cloud_run_service_name" {
  type        = string
  description = "Cloud Run service name"
  default     = "parku-worker-dev"
}

variable "cloud_run_image" {
  type        = string
  description = "Container image for Cloud Run"
}

variable "pubsub_topic_name" {
  type        = string
  description = "Pub/Sub topic name"
  default     = "parku-events-dev"
}

variable "pubsub_subscription_name" {
  type        = string
  description = "Pub/Sub subscription name"
  default     = "parku-events-worker-dev"
}
