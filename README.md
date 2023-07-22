# balenaMigrate

> Script to migrate balena devices to a new balenaCloud environment

## Get Started 

Provide the values for the variables provided in the script and install [balena-cli](https://github.com/balena-io/balena-cli/blob/master/INSTALL.md).

```
npm ci -g 
zx --quiet index.mjs
```

### Steps to migrate

1. Scans for devices locally and in the fleet to cross-reference devices to migrate (Needs balenaCLI to be installed)
2. SSH into devices and convert all devices to development OS variant
3. Once complete, migrate device to new target environement using balena join 
4. Assigns device old configuration, tags, names and related settings 


## Tools used

1. LTS NodeJS and npm 
2. [zx](https://github.com/google/zx) to write the migrator script
3. balena-cli, balenaSDK to run the migration between environments 

## License

MIT License by Vipul Gupta.