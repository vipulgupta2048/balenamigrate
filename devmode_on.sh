#!/usr/bin/env bash
# Command to convert os variant in balenaOS to development. Change development Mode to false below to convert device to Production os variant. '

`tmp=$(mktemp)&& jq '.developmentMode="true"' /mnt/boot/config.json > "$tmp" && mv "$tmp" /mnt/boot/config.json`