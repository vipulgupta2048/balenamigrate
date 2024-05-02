#!/usr/bin/env zx

// Script to migrate all local devices between balenaCloud environments. Read README.md for detailled instructions. 

$.shell = await which("bash")  // zx can't run on sh in Alpine correctly: https://github.com/google/zx/issues/164
$.prefix = ''
$.verbose = false; // Toggle to get outputs from all commands

const { getSdk } = require('balena-sdk');
const semver = require('balena-semver')

// FILL VALUES FOR THESE FIELDS - SOURCE FLEET
const BALENA_SOURCE_FLEET_TOKEN = process.env.BALENA_SOURCE_FLEET_TOKEN || ""
const BALENA_SOURCE_FLEET_URL = process.env.BALENA_SOURCE_FLEET_URL || "balena-cloud.com"
const BALENA_SOURCE_FLEET_SLUG = process.env.BALENA_SOURCE_FLEET_SLUG || ""

// FILL VALUES FOR THESE FIELDS - TARGET FLEET
const BALENA_TARGET_FLEET_TOKEN = process.env.BALENA_TARGET_FLEET_TOKEN || ""
const BALENA_TARGET_FLEET_URL = process.env.BALENA_TARGET_FLEET_SLUG || "bm.balena-dev.com"
const BALENA_TARGET_FLEET_SLUG = process.env.BALENA_TARGET_FLEET_SLUG || ""

// Check if balena-cli is installed and available
await which("balena")
console.log(`Migration Order Received: From ${BALENA_SOURCE_FLEET_URL} to ${BALENA_TARGET_FLEET_URL} over to ${BALENA_TARGET_FLEET_SLUG}`)

const balena_sourcesdk = getSdk({
    apiUrl: `https://api.${BALENA_SOURCE_FLEET_URL}`,
});

await balena_sourcesdk.auth.loginWithToken(BALENA_SOURCE_FLEET_TOKEN)

const balena_targetsdk = getSdk({
    apiUrl: `https://api.${BALENA_TARGET_FLEET_URL}`,
});

await balena_targetsdk.auth.loginWithToken(BALENA_TARGET_FLEET_TOKEN)

const whoami = (await $`whoami`).stdout.trim()
const sudo = whoami === 'root' ? '' : 'sudo'

// Fetch info about devices pending migration in the source fleet
async function sourceThemDevices(balena_sourcesdk) {
    let devices = []
    if (argv.uuid) {
        devices = await balena_sourcesdk.models.device.get(argv.uuid, {
            "$select": ["os_version", "overall_status", "device_name", "uuid"],
        })
    } else {
        devices = await balena_sourcesdk.models.device.getAllByApplication(BALENA_SOURCE_FLEET_SLUG, {
            "$select": ["os_version", "overall_status", "device_name", "uuid"],
        })
    }

    devices = Array.isArray(devices) ? devices : [devices]
    
    console.log("Finding offline devices or devices running balenaOS version < 2.85.0 in the fleet\n")
    const semverRegex = /\d+\.\d+\.\d+/;
    return devices.filter(device => {
        // Remove offline devices from the source fleet
        // Remove devices running < balenaOS v2.85.0
        // Development mode was introduced from 2.85.0 - https://github.com/balena-os/meta-balena/blob/master/CHANGELOG.md#v2850
        return device.overall_status === 'idle' && semver.gte(device.os_version.match(semverRegex)[0], '2.85.0')
    })
}

// Fetch devices from the source fleet
const sourceDevices = await sourceThemDevices(balena_sourcesdk)
// Scan devices locally available
const localDevices = JSON.parse((await $`DEBUG=0 ${sudo} balena scan --json`).stdout)

const finalDevices = []


// for (const device in sourceDevices) {
// if (semver.gt('2.85.0', sourceDevices[device].os_version.match(semverRegex)[0])) {
// console.log(`Removing ${sourceDevices[device].device_name}: ${sourceDevices[device].os_version}`)
// sourceDevices.splice(device)
// }
// else if (sourceDevices[device].overall_status !== 'idle') {
// console.log(`Removing ${sourceDevices[device].device_name}: ${sourceDevices[device].overall_status}`)
// sourceDevices.splice(device)
// }
// }

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

console.table(finalDevices)
console.log("")

if (!Object.keys(finalDevices).length) {
    console.log("Found no devices to migrate. Am I a joke to you, killing ....")
    process.kill(1)
}

await question(`Migrating ${Object.keys(finalDevices).length} devices. Press enter to continue ✅`)

// Login to source fleet
await $`BALENARC_BALENA_URL=${BALENA_SOURCE_FLEET_URL} balena login --token ${BALENA_SOURCE_FLEET_TOKEN}`
// await $`BALENARC_BALENA_URL=${BALENA_SOURCE_FLEET_URL} balena whoami`

// Creating Temp SSH Keys only if running on root gateway device and not on personal machines
const random = (await $`date +%N`).stdout.trim()
const homePath = (await $`echo $HOME`).stdout.trim()
const sshKeyPath = `${homePath}/.ssh/id_ed25519_${random}`
if (whoami === 'root') {
    await $`ssh-keygen -t ed25519 -C "autokit@balena.io" -f ${sshKeyPath} -P ""`

    // Still flaky - sometimes the ssh-agent doesn't start. Use the command to start it eval `ssh-agent`
    await $`eval ssh-agent -s && ssh-add ${sshKeyPath}`

    await $`BALENARC_BALENA_URL=${BALENA_SOURCE_FLEET_URL} balena key add Main-${random} ${sshKeyPath}.pub`
    console.log("Created and added temp SSH key to balenaCloud with ID")
}

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
        await $`cat devmode_on.sh | balena ssh ${device.address}`
        console.log(`Converted ${device.name} to dev mode ✅`)
    } catch (e) {
        console.error(e)
        process.kill(1)
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
// await $`BALENARC_BALENA_URL=${BALENA_TARGET_FLEET_URL} balena whoami`

// await spinner('If this isnt correct, stop now... waiting 5 seconds', () => $`sleep 5`)

let migratedDevices = 1
for (const device of finalDevices) {
    // Store Device config
    const sourceDeviceConfig = await balena_sourcesdk.models.device.configVar.getAllByDevice(device.uuid)

    // Store Device variables
    const sourceDeviceVariables = await balena_sourcesdk.models.device.envVar.getAllByDevice(device.uuid)

    // Store Device Tags
    const sourceDeviceTags = await balena_sourcesdk.models.device.tags.getAllByDevice(device.uuid)

    // Store Device Note
    const sourceDeviceNote = (await balena_sourcesdk.models.device.get(device.uuid, {
        "$select": ["note"],
    }))

    console.log(`Stored ${device.name}'s device level configuration, tags, variables ✅`)


    // Joining target fleet
    try {
        console.log(`\nMigrating ${migratedDevices} out of ${finalDevices.length} devices`)
        await $`BALENARC_BALENA_URL=${BALENA_TARGET_FLEET_URL} balena join ${device.address} --fleet ${BALENA_TARGET_FLEET_SLUG} --pollInterval 1`
        
        console.log(`Device successfully joined ${BALENA_TARGET_FLEET_URL} ✅ Find it in ${BALENA_TARGET_FLEET_SLUG} \n`)
        
        // Waiting for it to join
        await sleep(20000)
        await $`echo "systemctl restart prepare-openvpn" | balena ssh ${device.address}`
    } catch (e) {
        console.log(`Detected error, it was:\n${e}\n\nTrying troubleshooting steps.`)
        await $`echo "os-config update" | balena ssh ${device.address}`
        
        console.log(`Device successfully joined ${BALENA_TARGET_FLEET_URL} ✅ Find it in ${BALENA_TARGET_FLEET_SLUG} \n`)
        
        // Waiting for it to join
        await sleep(10000)
    }

    console.log(`Waiting for the device to come online on ${BALENA_TARGET_FLEET_SLUG}`)

    let uuidFinder = true
    let uuidTarget = null
    while (uuidFinder) {
        try {
            if (await balena_targetsdk.models.device.isOnline(device.uuid)) {
                uuidTarget = device.uuid
                uuidFinder = false
            } else {
                uuidTarget = await $`echo "cat /mnt/boot/config.json | jq .uuid" | balena ssh ${device.address}`
                uuidTarget = uuidTarget.toString().replace(/['"]+/g, '').trim()
                if (await balena_targetsdk.models.device.isOnline(uuidTarget)) {
                    uuidFinder = false
                }
            }
        } catch (error) {
            // Do Nothing
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
        await balena_targetsdk.models.device.setNote(uuidTarget, `Migrated from ${BALENA_SOURCE_FLEET_URL} on ${new Date().toUTCString()} - ` + sourceDeviceNote)
        console.log("Migrated Device Note ✅")
    } else {
        await balena_targetsdk.models.device.setNote(uuidTarget, `Migrated from ${BALENA_SOURCE_FLEET_URL} on ${new Date().toUTCString()}`)
    }

    // Transfer Device variables
    if (Object.keys(sourceDeviceVariables).length) {
        for (const variable of sourceDeviceVariables) {
            await balena_targetsdk.models.device.envVar.set(uuidTarget, variable.name, variable.value)
        }
        console.log("Migrated Device variables ✅")
    }

    console.log(`Migrated ${device.name} to ${BALENA_TARGET_FLEET_SLUG} ✅\n`)
    migratedDevices++
}

console.log("Results of migration")
console.table(JSON.parse((await $`BALENARC_BALENA_URL=${BALENA_TARGET_FLEET_URL} balena devices --fleet ${BALENA_TARGET_FLEET_SLUG} --json`).stdout))

if (whoami === 'root') {
    // Login to target fleet
    await $`BALENARC_BALENA_URL=${BALENA_SOURCE_FLEET_URL} balena login --token ${BALENA_SOURCE_FLEET_TOKEN}`

    const balenaKeyId = (await $`BALENARC_BALENA_URL=${BALENA_SOURCE_FLEET_URL} balena keys | grep "Main-${random}" | awk '{print $1}'`).stdout.trim()

    console.log("Cleaning up migration setup")
    await $`BALENARC_BALENA_URL=${BALENA_SOURCE_FLEET_URL} balena key rm ${balenaKeyId} --yes`
    await $`ssh-add -d ${sshKeyPath}.pub`

    console.log("Deleting temp. SSH key:", balenaKeyId)
}

// ## Problems that you might face

// # SSH: Process exited with non-zero status code "255"

// # Are the SSH keys correctly configured in balenaCloud? See:
// # https://www.balena.io/docs/learn/manage/ssh-access/#add-an-ssh-key-to-balenacloud
// # Are you accidentally using sudo?

// #If you are seeing this ^^^ don't use sudo to start the script
