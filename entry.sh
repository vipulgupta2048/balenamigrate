#!/usr/bin/bash

ssh-keygen -t ed25519 -C "autokit@balena.io" -f /root/.ssh/id_ed25519 -P ""

eval 'ssh-agent'
ssh add

balena login --token $BALENA_API_KEY
balena key add Main- /root/.ssh/id_ed25519.pub

echo "Ready to go!"
tail -f /dev/null
