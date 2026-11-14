#!/bin/sh
# First-run setup and upgrades for the MediaWiki behind wiki.rmhstudios.com
# (docs/wiki.md). Baked into the image as /usr/local/bin/wiki-bootstrap and run
# inside the running container, which has PHP and reaches the database:
#
#   docker exec -e MEDIAWIKI_ADMIN_PASSWORD='…' rmhstudios-prod-mediawiki wiki-bootstrap
#
# It is safe to run again, and each step is skipped when it is already done:
#
#   1. install: create the tables and the administrator account, on an empty
#      database only (needs MEDIAWIKI_ADMIN_PASSWORD; MEDIAWIKI_ADMIN_USER
#      defaults to "Admin");
#   2. upgrade: run update.php, which brings the tables up to the image's
#      MediaWiki version (the step to run after moving to a new LTS);
#   3. issue the bot password rmhstudios.com uses for /admin/wiki and print it.
#      A run always issues a new one and revokes the old, so this is also how
#      the password is rotated.
#
# Secrets never go on a command line, where the host's process list would show
# them: the passwords reach the installer through files in a private temporary
# directory that is removed on exit.
set -eu

cd /var/www/html

admin="${MEDIAWIKI_ADMIN_USER:-Admin}"
app_id="rmhsite"
grants="basic,highvolume,editpage,editprotected,createeditmovepage,delete,editinterface"

fail() {
	echo "wiki bootstrap failed: $*" >&2
	exit 1
}

[ -n "${MEDIAWIKI_DB_PASS:-}" ] || fail "MEDIAWIKI_DB_PASS is not set on the container"
[ -n "${MEDIAWIKI_SECRET_KEY:-}" ] || fail "MEDIAWIKI_SECRET_KEY is not set on the container"

umask 077
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT INT TERM

# Whether the wiki's tables exist. Asked of Postgres directly: MediaWiki itself
# cannot start against an empty database.
installed="$(php -r '
	$q = fn ($v) => "'\''" . addcslashes($v, "'\''\\") . "'\''";
	$env = fn ($k, $d) => getenv($k) ?: $d;
	$conn = @pg_connect(implode(" ", [
		"host=" . $q($env("MEDIAWIKI_DB_HOST", "host.docker.internal")),
		"port=" . $q($env("MEDIAWIKI_DB_PORT", "5432")),
		"dbname=" . $q($env("MEDIAWIKI_DB_NAME", "mediawiki")),
		"user=" . $q($env("MEDIAWIKI_DB_USER", "mediawiki")),
		"password=" . $q(getenv("MEDIAWIKI_DB_PASS")),
		"connect_timeout=10",
	]));
	if (!$conn) { fwrite(STDERR, "cannot connect to the wiki database\n"); exit(1); }
	$r = pg_query($conn, "SELECT to_regclass('\''mediawiki.page'\'') IS NOT NULL");
	echo pg_fetch_result($r, 0, 0) === "t" ? "yes" : "no";
')" || fail "cannot reach the wiki database; check MEDIAWIKI_DB_* and pg_hba.conf"

if [ "$installed" = "yes" ]; then
	echo "install: already done"
else
	password="${MEDIAWIKI_ADMIN_PASSWORD:-}"
	[ -n "$password" ] || fail "set MEDIAWIKI_ADMIN_PASSWORD to install the wiki"
	[ "${#password}" -ge 10 ] || fail "the administrator password needs at least 10 characters"
	printf '%s' "$MEDIAWIKI_DB_PASS" > "$tmp/dbpass"
	printf '%s' "$password" > "$tmp/adminpass"
	echo "install: creating the tables and the administrator \"$admin\""
	# The installer refuses to run beside an existing LocalSettings.php, and the
	# image ships one. Point it at a path that does not exist; the settings file
	# it writes goes to the temporary directory and is thrown away, because the
	# image's LocalSettings.php is the configuration.
	MW_CONFIG_FILE="$tmp/none/LocalSettings.php" php maintenance/run.php install \
		--dbtype postgres \
		--dbserver "${MEDIAWIKI_DB_HOST:-host.docker.internal}" \
		--dbport "${MEDIAWIKI_DB_PORT:-5432}" \
		--dbname "${MEDIAWIKI_DB_NAME:-mediawiki}" \
		--dbuser "${MEDIAWIKI_DB_USER:-mediawiki}" \
		--dbpassfile "$tmp/dbpass" \
		--dbschema mediawiki \
		--server "${MEDIAWIKI_SERVER:-https://wiki.rmhstudios.com}" \
		--scriptpath "" \
		--passfile "$tmp/adminpass" \
		--confpath "$tmp" \
		--skins Vector \
		--extensions ParserFunctions,Cite,WikiEditor \
		"RMH Studios Wiki" "$admin" > "$tmp/install.log" 2>&1 \
		|| { cat "$tmp/install.log" >&2; fail "the installer failed"; }
	rm -f "$tmp/dbpass" "$tmp/adminpass"
fi

echo "upgrade: running update.php"
php maintenance/run.php update --quick > "$tmp/update.log" 2>&1 \
	|| { cat "$tmp/update.log" >&2; fail "update.php failed"; }

# A bot password belongs to one account and one app id; drop the old one so
# this run's password is the only one that works.
php maintenance/run.php sql --query "DELETE FROM bot_passwords WHERE bp_app_id = '$app_id'" \
	> /dev/null 2>&1 || true
php maintenance/run.php createBotPassword --appid "$app_id" --grants "$grants" "$admin" \
	> "$tmp/bot.log" 2>&1 || { cat "$tmp/bot.log" >&2; fail "could not create the bot password"; }
bot_password="$(sed -n "s/.*password:'\([^']*\)'.*/\1/p" "$tmp/bot.log")"
[ -n "$bot_password" ] || { cat "$tmp/bot.log" >&2; fail "createBotPassword printed no password"; }
echo "bot password: issued for $admin@$app_id (any earlier one is revoked)"

echo
echo "Set these in the deploy env file, then recreate web (docs/wiki.md):"
echo
echo "MEDIAWIKI_BOT_USER=$admin@$app_id"
echo "MEDIAWIKI_BOT_PASSWORD=$bot_password"
