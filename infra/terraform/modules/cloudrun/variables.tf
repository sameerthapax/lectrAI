variable "project_id" {
  type        = string
  description = "GCP project ID"
}

variable "region" {
  type        = string
  description = "GCP region for Cloud Run"
}

variable "service_name" {
  type        = string
  description = "Cloud Run service name"
}

variable "container_image" {
  type        = string
  description = "Container image URI"
}

variable "container_port" {
  type        = number
  description = "Container port"
  default     = 8080
}

variable "min_instance_count" {
  type        = number
  description = "Minimum number of Cloud Run instances"
  default     = 0
}

variable "max_instance_count" {
  type        = number
  description = "Maximum number of Cloud Run instances"
  default     = 2
}

variable "cpu" {
  type        = string
  description = "CPU limit for each instance"
  default     = "1"
}

variable "memory" {
  type        = string
  description = "Memory limit for each instance"
  default     = "512Mi"
}

variable "ingress" {
  type        = string
  description = "Cloud Run ingress policy"
  default     = "INGRESS_TRAFFIC_ALL"
}

variable "allow_unauthenticated" {
  type        = bool
  description = "Whether to allow unauthenticated invocation"
  default     = false
}

variable "invoker_members" {
  type        = list(string)
  description = "Additional IAM members that can invoke the service"
  default     = []
}

variable "environment_variables" {
  type        = map(string)
  description = "Plain text environment variables for container"
  default     = {}
}

variable "secret_environment_variables" {
  type = list(object({
    key        = string
    secret     = string
    version    = string
    project_id = optional(string)
  }))
  description = "Secret Manager-backed environment variables"
  default     = []
}
variable "deletion_protection" {
  type    = bool
  default = false
}