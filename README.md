# balenaMigrate

> Tool to migrate balena devices between balenaCloud environments

The tool is one stop solution to migrate all devices in a fleet and their configuration, variables, names, even notes between balenaCloud environments. The whole experience is meant to be least-disruptive for fleetops, fully automated and one button action. 

**Usecases involve:** Transfering your fleet of devices back and forth to balenaCloud, balenaMachine, balenaStaging and even OpenBalena 
**Usecases don't involve:** Transfering devices from one fleet to another while preserving configuration. Use [balenaClone](https://github.com/balena-io-experimental/balenaclone) for that.

The tool is experimental and under development. Do test it out first before running on a production fleet.

![](https://github.com/balena-io/docs/assets/22801822/47984791-43c0-4ca4-b2f9-e5b88c03a1c0)

## Demo!

Make sure to double-check your devices before pressing <enter> to migrate. Don't interrupt the script in progress. 

[![asciicast](https://asciinema.org/a/601026.svg)](https://asciinema.org/a/601026)

## Get Started 

The tool needs latest balenaCLI. First install [balena-cli](https://github.com/balena-io/balena-cli/blob/master/INSTALL.md) and clone the repository. Next, provide the values of `Source` and `Target` in the `index.mjs` script and run the following command to initiate the migration. The tool has only been tested using bash.

Th

```bash
sudo balena scan # this is to confirm CLI is installed correctly
npm install
npx zx index.mjs
```

### What is happening!

1. First the tool scans for devices locally and in the source fleet to create a final list of devices based on pre-defined parameters (Needs balenaCLI to be installed). 
2. (Optional) Creates temporary SSH keys to access local production devices. 
3. SSH into said devices and convert all devices to development OS variant. 
4. Once complete, migrate device to new target environement using balena join 
5. Re-assigns device old configuration, tags, names and related settings when it comes online in the new environment. 
6. (Optional) Clean up SSH keys that are created.

## Configuration Guide

You can either set up these environment variables or even add values to the [variables](https://github.com/vipulgupta2048/balena-migrate/blob/632219ec887ff28fcf9c503a6f078996f0227d80/index.mjs#L12-L18) defined in the script. **Values for all variables are required.**

| Environment Variable      | Description                                                      |
| ------------------------- | ---------------------------------------------------------------- |
| BALENA_SOURCE_FLEET_TOKEN | Token for the source fleet in the source balenaCloud environment |
| BALENA_SOURCE_FLEET_URL   | URL for the source fleet in the source balenaCloud environment   |
| BALENA_SOURCE_FLEET_SLUG  | Slug for the source fleet in the source balenaCloud environment  |
| BALENA_TARGET_FLEET_TOKEN | Token for the target fleet in the target balenaCloud environment |
| BALENA_TARGET_FLEET_URL   | URL for the target fleet in the target balenaCloud environment   |
| BALENA_TARGET_FLEET_SLUG  | Slug for the target fleet in the target balenaCloud environment  |

## Deployment

The script only works when there are local devices available to migrate. If you intend to migrate devices remotely, you would need to setup a migrator device. A migrator device is another device in the same network that has SSH access to all devices you intend to migrate. You can provision this migrator device to a new fleet and run the following command to push a release of balena-migrate onto the device. 

```
balena push <Name-of-migrator-fleet>
```

The Dockerfile by design doesn't start or execute the script using an entrypoint. The process is intended to be executed manually and under supervision to ensure all devices in the fleet are migrated without any errors. SSH into your migrator device, configure the script with variables and execute the script. By having a migrator device that can access devices locally, you can ensure that devices can still be accessed even if the balena-migrate tool fails during the process. 

## Tools used

1. LTS NodeJS and npm 
2. [zx](https://github.com/google/zx) to write the migrator tool
3. balena-cli, balenaSDK to run the migration between environments 


## License

MIT License by Vipul Gupta.