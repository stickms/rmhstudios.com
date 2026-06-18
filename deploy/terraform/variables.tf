variable "cloudflare_api_token" {
  description = "Cloudflare API token with DNS edit on the zone"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for the domain"
  type        = string
}

variable "vps_ip" {
  description = "Public IPv4 of the VPS running k3s"
  type        = string
}

variable "app_host" {
  description = "Root app hostname (e.g. rmhstudios.com)"
  type        = string
}

variable "socket_host" {
  description = "Socket.IO hostname (e.g. socket.rmhstudios.com)"
  type        = string
}

variable "rmhbox_host" {
  description = "RMHBox websocket hostname"
  type        = string
}

variable "rmhtube_host" {
  description = "RMHTube websocket hostname"
  type        = string
}

variable "proxied" {
  description = "Whether Cloudflare proxies (orange-cloud) the records. Use false for raw websockets unless on a proxy-compatible plan."
  type        = bool
  default     = false
}
