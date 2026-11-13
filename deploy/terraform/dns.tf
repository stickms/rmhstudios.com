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

# wiki.rmhstudios.com (Wiki.js; docs/wiki.md). Always proxied, whatever `proxied`
# says for the websocket hosts: its Apache vhost listens on :80 only and relies
# on Cloudflare to terminate TLS, the same arrangement as the main site.
resource "cloudflare_record" "wiki" {
  count = var.wiki_host == "" ? 0 : 1

  zone_id = var.cloudflare_zone_id
  name    = var.wiki_host
  type    = "A"
  content = var.vps_ip
  proxied = true
  ttl     = 1
}
