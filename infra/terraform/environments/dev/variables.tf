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

variable "google_cloud_project" {
  type        = string
  description = "GOOGLE_CLOUD_PROJECT value exposed to the Cloud Run container"
}

variable "supabase_url" {
  type        = string
  description = "SUPABASE_URL value exposed to the Cloud Run container"
}

variable "supabase_anon_key" {
  type        = string
  description = "SUPABASE_ANON_KEY value exposed to the Cloud Run container"
}

variable "supabase_service_role_key" {
  type        = string
  description = "SUPABASE_SERVICE_ROLE_KEY value exposed to the Cloud Run container"
  sensitive   = true
}

variable "database_url" {
  type        = string
  description = "DATABASE_URL value exposed to the Cloud Run container"
  sensitive   = true
}
