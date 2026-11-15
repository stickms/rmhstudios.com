#!/bin/sh
# rmhOS desktop session: a flat background, then the IceWM window manager.
xsetroot -solid '#1b2330' 2>/dev/null
exec icewm-session
