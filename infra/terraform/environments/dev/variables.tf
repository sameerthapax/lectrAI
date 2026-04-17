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

variable "openai_api_key" {
  type        = string
  description = "OPENAI_API_KEY value exposed to the Cloud Run container"
  sensitive   = true

  validation {
    condition     = length(trimspace(var.openai_api_key)) > 0
    error_message = "openai_api_key must be provided. Set the OPENAI_API_KEY GitHub secret for CI/CD deploys."
  }
}

variable "elevenlabs_api_key" {
  type        = string
  description = "ELEVENLABS_API_KEY value exposed to the Cloud Run container"
  sensitive   = true

  validation {
    condition     = length(trimspace(var.elevenlabs_api_key)) > 0
    error_message = "elevenlabs_api_key must be provided. Set the ELEVENLABS_API_KEY GitHub secret for CI/CD deploys."
  }
}

variable "openai_transcription_model" {
  type        = string
  description = "OpenAI audio transcription model used by the API"
  default     = "gpt-4o-transcribe-diarize"
}

variable "openai_transcript_processing_model" {
  type        = string
  description = "OpenAI model used to classify transcript speakers and produce processed transcript JSON"
  default     = "gpt-4o-2024-08-06"
}
