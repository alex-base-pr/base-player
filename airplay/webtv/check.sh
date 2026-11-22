#!/bin/sh
# Store post-install check of the optional Web TV tool: the private ELF
# runtime resolves. Starts no browser and opens no frame file.
set -eu
BASE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
R="$BASE/runtime"
for exe in base-player-webtv WPEWebProcess WPENetworkProcess; do
    "$R/lib/ld-linux-x86-64.so.2" --library-path "$R/lib" --list "$R/libexec/$exe" >/dev/null
done
test -x "$BASE/bin/base-player-webtv"
test -x "$BASE/wpe/WPEWebProcess"
test -x "$BASE/wpe/WPENetworkProcess"
test -f "$BASE/wpe/injected-bundle/libWPEInjectedBundle.so"
test -f "$R/plugins/libgstwpe.so"
test -f "$R/plugins/libgstmguvideo.so"
test -f "$R/etc/ca-certificates.crt"
test ! -e "$R/lib/libasound.so.2"
echo "Web TV runtime: private ELF runtime verified"
