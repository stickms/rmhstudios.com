locals {
  records = {
    app     = var.app_host
    socket  = var.socket_host
    rmhbox  = var.rmhbox_host
    rmhtube = var.rmhtube_host
  }
}

resource "cloudflare_record" "app" {
  for_each = local.records

  zone_id = var.cloudflare_zone_id
  name    = each.value
  type    = "A"
  content = var.vps_ip
  proxied = var.proxied
  ttl     = var.proxied ? 1 : 300
}
