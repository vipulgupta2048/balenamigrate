#!/usr/bin/env zx

// Script to migrate all local devices between balenaCloud environments. Steps:

/**
 * 1. Scans for devices locally and in the fleet to cross-reference devices to migrate (Needs balenaCLI to be installed)
 * 2. SSH into devices and convert all devices to development OS variant
 * 3. Once complete, migrate device to new target environement using balena join
 * 4. Assigns device old configuration, tags, names and related settings
 */

$.shell = '/usr/bin/bash'
$.prefix = ''

const { getSdk } = require('balena-sdk');

const BALENA_SOURCE_FLEET_TOKEN = process.env.BALENA_SOURCE_FLEET_TOKEN | ""
const BALENA_SOURCE_FLEET_URL = process.env.BALENA_SOURCE_FLEET_URL | "balena-cloud.com"
const BALENA_SOURCE_FLEET_SLUG = process.env.BALENA_SOURCE_FLEET_SLUG | ""

const BALENA_TARGET_FLEET_TOKEN = process.env.BALENA_TARGET_FLEET_TOKEN | ""
const BALENA_TARGET_FLEET_URL = process.env.BALENA_TARGET_FLEET_SLUG | "balena-staging.com"
const BALENA_TARGET_FLEET_SLUG = process.env.BALENA_TARGET_FLEET_SLUG | ""

const balena_sourcesdk = getSdk({
    apiUrl: `https://api.${BALENA_SOURCE_FLEET_URL}`,
});
await balena_sourcesdk.auth.loginWithToken(BALENA_SOURCE_FLEET_TOKEN)

const balena_targetsdk = getSdk({
    apiUrl: `https://api.${BALENA_TARGET_FLEET_URL}`,
});
await balena_targetsdk.auth.loginWithToken(BALENA_TARGET_FLEET_TOKEN)

// Fetch all devices in the source fleet
const sourceDevices = await balena_sourcesdk.models.device.getAllByApplication(BALENA_SOURCE_FLEET_SLUG)

// Scan local devices available
const localDevices = JSON.parse((await $`sudo balena scan --json`).stdout)

const finalDevices = []

// Cross-reference local and source fleet devices to create final list of online, local devices
for (const device of localDevices) {
    for (const sourceDevice of sourceDevices) {
        if (sourceDevice.uuid.substring(0, 7) === device.host.substring(0, 7)) {
            device["name"] = sourceDevice.device_name
            device["uuid"] = sourceDevice.uuid
            delete device.dockerInfo
            delete device.dockerVersion
            finalDevices.push(device)
        }
    }
}

console.log(`Migration Order Received: From ${BALENA_SOURCE_FLEET_URL} to ${BALENA_TARGET_FLEET_URL} over to ${BALENA_TARGET_FLEET_SLUG}`)
console.table(finalDevices)
console.log("")

if (!Object.keys(finalDevices).length) {
    console.log("Found no devices to migrate. Am I a joke to you, killing ....")
    process.kill(1)
}

await question(`Migrating ${Object.keys(finalDevices).length} devices. Press enter to continue ✅`)

// Login to source fleet
await $`BALENARC_BALENA_URL=${BALENA_SOURCE_FLEET_URL} balena login --token ${BALENA_SOURCE_FLEET_TOKEN}`
await $`BALENARC_BALENA_URL=${BALENA_SOURCE_FLEET_URL} balena whoami`

// await spinner('If this isnt correct, stop now... waiting 5 seconds', () => $`sleep 5`)

// Convert devices to dev mode
for (const device of finalDevices) {
    try {
        /**
         * To presever quotes and insertion, the os variant command has been transferred to another bash file.
         * If you don't have that bash file, then create a new file on the same location called devmode_on.sh with the contents as following.
         *
         * # ***** Begin file ******
         *
         * #!/usr/bin/env bash
         * # Command to convert os variant in balenaOS to development. Change development Mode to false below to convert device to Production os variant. '
         * `tmp=$(mktemp)&& jq '.developmentMode="true"' /mnt/boot/config.json > "$tmp" && mv "$tmp" /mnt/boot/config.json && exit`
         *
         * # ***** End file ******
         */
        await $`cat devmode_on.sh | balena ssh ${device.host}`
        console.log(`Converted ${device.name} to dev mode ✅`)
    } catch (e) {
        console.log(e)
    }
}

// Once all devices are converted to development
console.log("\n*********  Let the migration begin  *********")

// Transfer fleet config
const sourceConfig = await balena_sourcesdk.models.application.configVar.getAllByApplication(BALENA_SOURCE_FLEET_SLUG)

if (Object.keys(sourceConfig).length) {
    for (const config of sourceConfig) {
        await balena_targetsdk.models.application.configVar.set(BALENA_TARGET_FLEET_SLUG, config.name, config.value)
    }
    console.log("Migrated fleet config ✅")
}

// Transfer fleet variables
const sourceVariables = await balena_sourcesdk.models.application.envVar.getAllByApplication(BALENA_SOURCE_FLEET_SLUG)

if (Object.keys(sourceVariables).length) {
    for (const variable of sourceVariables) {
        await balena_targetsdk.models.application.envVar.set(BALENA_TARGET_FLEET_SLUG, variable.name, variable.value)
    }
    console.log("Migrated fleet variables ✅")
}

// Login to target fleet
await $`BALENARC_BALENA_URL=${BALENA_TARGET_FLEET_URL} balena login --token ${BALENA_TARGET_FLEET_TOKEN}`
await $`BALENARC_BALENA_URL=${BALENA_TARGET_FLEET_URL} balena whoami`

// await spinner('If this isnt correct, stop now... waiting 5 seconds', () => $`sleep 5`)

let migratedDevices = 1
for (const device of finalDevices) {
    // Store Device config
    const sourceDeviceConfig = await balena_sourcesdk.models.device.configVar.getAllByDevice(device.uuid)

    // Store Device variables
    const sourceDeviceVariables = await balena_sourcesdk.models.device.envVar.getAllByDevice(device.uuid)

    // Store Device Tags
    const sourceDeviceTags = await balena_sourcesdk.models.device.tags.getAllByDevice(device.uuid)
    console.log(`Stored ${device.name}'s device level configuration, tags, variables ✅`)

    // Joining target fleet
    try {
        console.log(`\nMigrating ${migratedDevices} out of ${finalDevices.length} devices`)
        await $`BALENARC_BALENA_URL=${BALENA_TARGET_FLEET_URL} balena join ${device.host} --fleet ${BALENA_TARGET_FLEET_SLUG} --pollInterval 1`
        console.log(`Device successfully joined ${BALENA_TARGET_FLEET_URL} ✅ Find it in ${BALENA_TARGET_FLEET_SLUG} \n`)
    } catch (e) {
        if (e.stderr.split('\n')[0] === "Error: Awaiting prepare-openvpn.service to exit failed") {
            console.log("Detected known error. Deploying troubleshooting steps.")
            await $`echo "os-config update" | balena ssh ${device.host}`
            console.log(`Device successfully joined ${BALENA_TARGET_FLEET_URL} ✅ Find it in ${BALENA_TARGET_FLEET_SLUG} \n`)

            // Waiting for it to join
            await sleep(20000)
        } else {
            console.log(e)
            process.kill(1)
        }
    }

    let uuidFinder = true
    let uuidTarget = null
    while (uuidFinder) {
        if (await balena_targetsdk.models.device.isOnline(device.uuid)) {
            uuidTarget = device.uuid
            uuidFinder = false
        } else {
            uuidTarget = await $`echo "cat /mnt/boot/config.json | jq .uuid" | balena ssh ${device.host}`
            uuidTarget = uuidTarget.toString().replace(/['"]+/g, '').trim()
            if (await balena_targetsdk.models.device.isOnline(uuidTarget)) {
                uuidFinder = false
            }
        }
    }

    console.log(`Old UUID: ${device.uuid}\nNew UUID: ${uuidTarget}`)
    console.log(`Appling ${device.name}'s old configuration to new device`)

    // Waiting for it to join
    await retry(20, '10s', async () => await balena_targetsdk.models.device.isOnline(uuidTarget))
    await retry(10, '10s', async () => await balena_targetsdk.models.device.get(uuidTarget))

    // Rename the new device to old device name
    await balena_targetsdk.models.device.rename(uuidTarget, device.name);
    console.log("Renamed device ✅")

    // Enable Public Device Url
    await balena_targetsdk.models.device.enableDeviceUrl(uuidTarget);
    console.log("Turned on Public Device Url ✅")

    // Transfer Device config
    if (Object.keys(sourceDeviceConfig).length) {
        for (const config of sourceDeviceConfig) {
            await balena_targetsdk.models.device.configVar.set(uuidTarget, config.name, config.value)
        }
        console.log("Migrated Device config ✅")
    }

    // Transfer Device Tags
    if (Object.keys(sourceDeviceTags).length) {
        for (const tag of sourceDeviceTags) {
            await balena_targetsdk.models.device.tags.set(uuidTarget, tag.tag_key, tag.value)
        }
        console.log("Migrated Device Tags ✅")
    }

    // Transfer Device Note
    if (sourceDeviceNote) {
        await balena_targetsdk.models.device.setNote(uuidTarget, sourceDeviceNote + ` - Migrated from ${BALENA_SOURCE_FLEET_URL} on ${new Date().toUTCString()}`)
        console.log("Migrated Device Note ✅")
    }

    // Transfer Device variables
    if (Object.keys(sourceDeviceVariables).length) {
        for (const variable of sourceDeviceVariables) {
            await balena_targetsdk.models.device.envVar.set(uuidTarget, variable.name, variable.value)
        }
        console.log("Migrated Device variables ✅")
    }

    console.log(`Migrated ${device.name} to ${BALENA_TARGET_FLEET_SLUG} ✅`)
    migratedDevices++
}

console.log("Results of migration")
console.table(JSON.parse((await $`BALENARC_BALENA_URL=${BALENA_TARGET_FLEET_URL} balena devices --fleet ${BALENA_TARGET_FLEET_SLUG} --json`).stdout))


// ## Problems that you might face

// # SSH: Process exited with non-zero status code "255"

// # Are the SSH keys correctly configured in balenaCloud? See:
// # https://www.balena.io/docs/learn/manage/ssh-access/#add-an-ssh-key-to-balenacloud
// # Are you accidentally using sudo?

// #If you are seeing this ^^^ don't use sudo to start the script
