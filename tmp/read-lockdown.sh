#!/bin/sh
wc -l components/lockdown/LockdownPage.tsx
sed -n '200,400p' components/lockdown/LockdownPage.tsx
