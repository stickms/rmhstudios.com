#!/bin/sh
# Fails unless every setting in the fragment ($2) is present, exactly as
# written, in the final kernel .config ($1). Comment lines other than
# "# CONFIG_X is not set" are ignored.
set -eu
config=$1
fragment=$2
missing=0
while IFS= read -r line; do
	case $line in
	CONFIG_* | '# CONFIG_'*) ;;
	*) continue ;;
	esac
	if ! grep -qxF -- "$line" "$config"; then
		echo "verify-config: missing from final .config: $line" >&2
		missing=$((missing + 1))
	fi
done <"$fragment"
if [ "$missing" -ne 0 ]; then
	echo "verify-config: $missing required setting(s) did not survive olddefconfig" >&2
	exit 1
fi
echo "verify-config: every setting in $fragment is in the final .config"
