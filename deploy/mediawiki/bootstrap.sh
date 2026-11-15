#!/bin/sh
# Runs every time the wiki container starts, before Apache (docs/wiki.md).
# Baked into the image as /usr/local/bin/wiki-bootstrap. Each step is skipped
# when it is already done, so a restart is just an upgrade check:
#
#   1. install: on the first start against a database without the wiki's
#      tables, create them in the `mediawiki` schema of the site's database,
#      then import the starter pages and the sidebar (deploy/mediawiki/pages,
#      Sidebar.wiki). Later starts never touch pages again;
#   2. upgrade: run update.php when the MediaWiki version or LocalSettings.php
#      changed since the last start (a new LTS, or an extension with tables of
#      its own). Not on every start: update.php always empties the object cache
#      table, which holds everyone's sessions, so it would sign the whole wiki
#      out on each restart. The fingerprint of what it last ran against is kept
#      in MediaWiki's own updatelog table;
#   3. drain the job queue, so link tables and caches are current.
#
# The installer needs an administrator account. Readers sign in through
# rmhstudios.com and never use it, so it gets a random password that nobody is
# told; docs/wiki.md shows how to set one if it is ever needed. Passwords reach
# the installer through files in a private temporary directory, never on a
# command line, where the host's process list would show them.
set -eu

cd /var/www/html

admin="RMH Studios"
share=/usr/local/share/rmhstudios-wiki
marker="rmhstudios-schema-fingerprint"
# What update.php depends on: the MediaWiki release and the configuration.
fingerprint="$(cat includes/Defines.php LocalSettings.php | sha256sum | cut -c1-64)"

fail() {
	echo "wiki bootstrap failed: $*" >&2
	exit 1
}

umask 077
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT INT TERM

# Connection settings and whether the wiki's tables exist, asked of Postgres
# directly: MediaWiki itself cannot start against an empty schema.
php -r '
	require "/usr/local/lib/rmhstudios/env.php";
	$db = rmhWikiDatabase();
	$q = fn ($v) => "'\''" . addcslashes((string)$v, "'\''\\") . "'\''";
	$conn = @pg_connect(implode(" ", [
		"host=" . $q($db["host"]), "port=" . $q($db["port"]), "dbname=" . $q($db["name"]),
		"user=" . $q($db["user"]), "password=" . $q($db["password"]), "connect_timeout=10",
		"sslmode=" . ($db["ssl"] ? "require" : "prefer"),
	]));
	if (!$conn) { fwrite(STDERR, "cannot connect to the database\n"); exit(1); }
	$r = pg_query($conn, "SELECT to_regclass('\''mediawiki.page'\'') IS NOT NULL");
	$installed = pg_fetch_result($r, 0, 0) === "t";
	file_put_contents($argv[1] . "/installed", $installed ? "yes" : "no");
	$applied = "";
	if ($installed) {
		$r = pg_query_params($conn, "SELECT ul_value FROM mediawiki.updatelog WHERE ul_key = \$1", [$argv[2]]);
		$applied = (string)(pg_fetch_result($r, 0, 0) ?: "");
	}
	file_put_contents($argv[1] . "/applied", $applied);
	file_put_contents($argv[1] . "/dbpass", $db["password"]);
	foreach (["host", "port", "name", "user"] as $k) file_put_contents($argv[1] . "/db$k", $db[$k]);
' "$tmp" "$marker" || fail "cannot reach the database; check DATABASE_URL (or DATABASE_DIRECT_URL) and pg_hba.conf"

if [ "$(cat "$tmp/installed")" = "yes" ]; then
	echo "wiki: tables present"
else
	echo "wiki: first start, creating the tables in schema mediawiki"
	head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$tmp/adminpass"
	# The installer refuses to run beside an existing LocalSettings.php, and the
	# image ships one. Point it at a path that does not exist; the settings file
	# it writes goes to the temporary directory and is thrown away, because the
	# image's LocalSettings.php is the configuration.
	MW_CONFIG_FILE="$tmp/none/LocalSettings.php" php maintenance/run.php install \
		--dbtype postgres \
		--dbserver "$(cat "$tmp/dbhost")" \
		--dbport "$(cat "$tmp/dbport")" \
		--dbname "$(cat "$tmp/dbname")" \
		--dbuser "$(cat "$tmp/dbuser")" \
		--dbpassfile "$tmp/dbpass" \
		--dbschema mediawiki \
		--server "${WIKI_PUBLIC_URL:-https://wiki.rmhstudios.com}" \
		--scriptpath "" \
		--passfile "$tmp/adminpass" \
		--confpath "$tmp" \
		--skins Vector \
		"RMH Studios Wiki" "$admin" > "$tmp/install.log" 2>&1 \
		|| { cat "$tmp/install.log" >&2; fail "the installer failed"; }

	# The installer's Main Page is a placeholder, so the starter pages may
	# overwrite it; nothing else exists yet.
	php maintenance/run.php importTextFiles --overwrite --rc \
		--user "$admin" --summary "Starter page" "$share"/pages/*.wiki > "$tmp/import.log" 2>&1 \
		|| { cat "$tmp/import.log" >&2; fail "could not import the starter pages"; }
	php maintenance/run.php importTextFiles --overwrite --rc --prefix "MediaWiki:" \
		--user "$admin" --summary "Sidebar" "$share"/Sidebar.wiki > "$tmp/sidebar.log" 2>&1 \
		|| { cat "$tmp/sidebar.log" >&2; fail "could not import the sidebar"; }
	echo "wiki: installed, with the starter pages and the sidebar"
fi

if [ "$(cat "$tmp/applied")" = "$fingerprint" ]; then
	echo "wiki: schema current"
else
	echo "wiki: MediaWiki or its settings changed, running update.php"
	php maintenance/run.php update --quick > "$tmp/update.log" 2>&1 \
		|| { cat "$tmp/update.log" >&2; fail "update.php failed"; }
	php maintenance/run.php sql --query \
		"INSERT INTO updatelog (ul_key, ul_value) VALUES ('$marker', '$fingerprint') ON CONFLICT (ul_key) DO UPDATE SET ul_value = EXCLUDED.ul_value" \
		> "$tmp/marker.log" 2>&1 || { cat "$tmp/marker.log" >&2; fail "could not record the update"; }
fi
php maintenance/run.php runJobs > /dev/null 2>&1 || true
echo "wiki: up to date"
