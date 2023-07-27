# balenaMigrate

> Script to migrate balena devices to a new balenaCloud environment

## Get Started 

The script needs latest balenaCLI. First install [balena-cli](https://github.com/balena-io/balena-cli/blob/master/INSTALL.md) and clone the repository. Next, provide the values of `Source` and `Target` in the `index.mjs` script and run the following command to initiate the migration. The script has only been tested using bash. 

```bash
sudo balena scan # this is to confirm CLI is installed correctly
npm install
npx zx --quiet index.mjs
```

# Demo!



### What is happening!

1. First the script scans for devices locally and in the source fleet to create a final list of devices to migrate (Needs balenaCLI to be installed). 
2. SSH into devices and convert all devices to development OS variant
3. Once complete, migrate device to new target environement using balena join 
4. Assigns device old configuration, tags, names and related settings 


## Configuration Guide




## Tools used

1. LTS NodeJS and npm 
2. [zx](https://github.com/google/zx) to write the migrator script
3. balena-cli, balenaSDK to run the migration between environments 

## License

MIT License by Vipul Gupta.