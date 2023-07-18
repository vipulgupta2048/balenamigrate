#!/usr/bin/env zx
$.shell = '/usr/bin/bash'

// Script to migrate all local devices between balenaCloud environments. Steps: 

// # 1. Scan for devices (Needs balenaCLI to be installed)
// # 2. SSH into devices and convert all devices to development OS variant
// # 3. Once complete, migrate devices to new target environement using balena join 
// # 4. Shows migrated devices in the new target fleet 
// # 5. Optionally you can convert all devices back to production OS variant after migration

const BALENA_SOURCE_FLEET_TOKEN = ""   // balena-cloud.com
const BALENA_SOURCE_FLEET_URL = "balena-cloud.com"
const BALENA_SOURCE_FLEET_SLUG = ""

const BALENA_TARGET_FLEET_TOKEN = ""   // bm.balena.dev.com
const BALENA_TARGET_FLEET_URL = "bm.balena-dev.com"
const BALENA_TARGET_FLEET_SLUG = ""

const { getSdk } = require('balena-sdk');
const util = require('util');
const exec = util.promisify(require('child_process').exec);

const balena_sourcesdk = getSdk({
    apiUrl: `https://api.${BALENA_SOURCE_FLEET_URL}`,
});
await balena_sourcesdk.auth.loginWithToken(BALENA_SOURCE_FLEET_TOKEN)

const balena_targetsdk = getSdk({
    apiUrl: `https://api.${BALENA_TARGET_FLEET_URL}`,
});
await balena_targetsdk.auth.loginWithToken(BALENA_TARGET_FLEET_TOKEN)

// # Command to convert devices to dev mode
const devmode_on = `tmp=$(mktemp)&& jq '.developmentMode="true"' /mnt/boot/config.json > "$tmp" && mv "$tmp" /mnt/boot/config.json && exit`

// Find local devices that need to be migrated 
const sourceDevices = await balena_sourcesdk.models.device.getAllByApplication(BALENA_SOURCE_FLEET_SLUG)

// # Scan local devices available
const localDevices = await retry(3, () => $`sudo balena scan --json`)

const finalDevices = []

for (const device of localDevices) {
    for (const sourceDevice of sourceDevices) {
        if (sourceDevice.uuid.substring(0, 7) === device.host.substring(0, 7)) {
            device["name"] = sourceDevice.device_name
            device["uuid"] = sourceDevice.uuid
            finalDevices.push(device)
        }
    }
}

console.table(finalDevices)

await question(`Migrating ${Object.keys(finalDevices).length} devices. Press enter to continue.`)

// Login to source fleet
await $`BALENARC_BALENA_URL=${BALENA_SOURCE_FLEET_URL} balena login --token ${BALENA_SOURCE_FLEET_TOKEN}`
await $`BALENARC_BALENA_URL=${BALENA_SOURCE_FLEET_URL} balena whoami`

await spinner('If this isnt correct, stop now... waiting 5 seconds', () => $`sleep 5`)

for (const device of finalDevices) {
    console.log(`Converting ${device.name} to dev mode`)
    try {
        await $`'bash -c "$devmode_on"' | BALENARC_BALENA_URL=$BALENA_SOURCE_FLEET_URL balena ssh "$address"`
    } catch (e) {
        console.log(e)
    }
}

// Once all devices are converted to development 
console.log("********************* Let the migration begin")

// Transfer fleet config
const sourceConfig = await balena_sourcesdk.models.application.configVar.getAllByApplication(BALENA_SOURCE_FLEET_SLUG)

if (Object.keys(sourceConfig).length) {
    for (const config of sourceConfig) {
        await balena_targetsdk.models.application.configVar.set(BALENA_TARGET_FLEET_SLUG, config.name, config.value)
    }
}

// Transfer fleet variables
const sourceVariables = await balena_sourcesdk.models.application.envVar.getAllByApplication(BALENA_SOURCE_FLEET_SLUG)

if (Object.keys(sourceVariables).length) {
    for (const config of sourceVariables) {
        await balena_targetsdk.models.application.configVar.set(BALENA_TARGET_FLEET_SLUG, config.name, config.value)
    }
}

// Login to target fleet
await $`BALENARC_BALENA_URL=${BALENA_TARGET_FLEET_URL} balena login --token ${BALENA_TARGET_FLEET_TOKEN}`
await $`BALENARC_BALENA_URL=${BALENA_TARGET_FLEET_URL} balena whoami`

await spinner('If this isnt correct, stop now... waiting 5 seconds', () => $`sleep 5`)

for (const device of finalDevices) {
    await $`BALENARC_BALENA_URL=${BALENA_TARGET_FLEET_URL} balena join ${device.address} --fleet ${BALENA_TARGET_FLEET_SLUG} --pollInterval 10`

    console.log(`Migrated ${device.name} to ${BALENA_TARGET_FLEET_SLUG}"`)

}

// for (const device of finalDevices) {
//     console.log(`Appling ${device.name}'s configuration`)
//     await balena.models.device.enableDeviceUrl('7cf02a6');

// }


// BALENARC_BALENA_URL=$BALENA_TARGET_FLEET_URL balena devices | grep "$BALENA_TARGET_FLEET_SLUG"
// ## Problems that you might face

// # SSH: Process exited with non-zero status code "255"

// # Are the SSH keys correctly configured in balenaCloud? See:
// # https://www.balena.io/docs/learn/manage/ssh-access/#add-an-ssh-key-to-balenacloud
// # Are you accidentally using sudo?

// #If you are seeing this ^^^ don't use sudo to start the script
