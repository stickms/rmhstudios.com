#!/bin/bash
cd "$(dirname "$0")"
./node_modules/.bin/tsc --noEmit 2>&1 | head -100
