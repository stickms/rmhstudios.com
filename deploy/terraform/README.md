# Terraform — rmhstudios DNS / infra

Manages DNS records pointing the app + websocket hostnames at the k3s VPS.

## Usage
1. `cp terraform.tfvars.example terraform.tfvars` and fill in real values.
2. `terraform init`
3. `terraform plan`
4. `terraform apply`

## Provider
Default is Cloudflare. To use another DNS provider, replace `providers.tf`,
`versions.tf` provider block, and the `cloudflare_record` resource in `dns.tf`.
The variable surface (`vps_ip`, `*_host`, zone) is provider-agnostic.

## State
Default is local state (`terraform.tfstate`, gitignored). For team use, move to
a remote backend (S3/GCS/Terraform Cloud) by adding a `backend` block to
`versions.tf` and re-running `terraform init`.

## Scope (intentionally narrow)
DNS only on day one. VPS-provider resources (droplet, firewall) can be added
once the hosting provider is confirmed — they need that provider's API.
