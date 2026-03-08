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
}

variable "cloud_run_image" {
  type        = string
  description = "Container image for Cloud Run"
}

variable "pubsub_topic_name" {
  type        = string
  description = "Pub/Sub topic name"
}

variable "pubsub_subscription_name" {
  type        = string
  description = "Pub/Sub subscription name"
}

variable "cloud_run_deletion_protection" {
  type        = bool
  description = "Whether Cloud Run deletion protection is enabled"
  default     = false
}
