output "dns_records" {
  description = "Managed DNS hostnames -> VPS IP"
  value       = { for k, r in cloudflare_record.app : k => r.name }
}
