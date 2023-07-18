# Script to migrate all local devices between balenaCloud environments. 

# Steps: 

1. Scan for devices (Needs balenaCLI to be installed)
2. SSH into devices and convert all devices to development OS variant
3. Once complete, migrate devices to new target environement using balena join 
4. Shows migrated devices in the new target fleet 
5. Optionally you can convert all devices back to production OS variant after migration

## Get Started

1. install dependencies 

```
npm install
```