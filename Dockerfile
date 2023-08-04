FROM node:16-bullseye-slim as base

# install docker, balena-cli dependencies, and suite dependencies
# https://github.com/balena-io/balena-cli/blob/master/INSTALL-LINUX.md#additional-dependencies
# hadolint ignore=DL3008

RUN apt-get update && apt-get install --no-install-recommends -y \
	ca-certificates \
	wget \
	nano \
	openssh-client \
	bind9-dnsutils \
	libudev-dev \	
	util-linux \
	build-essential \
	make \
	python3 && \
	apt-get clean && \
	rm -rf /var/lib/apt/lists/*

ARG BALENA_CLI_REF="v16.7.5"
ARG BALENA_CLI_VERSION="16.7.5"

WORKDIR /usr/app
# Install balena-cli via standlone zip, only compatible with glibc (not alpine/musl)
RUN if [ "$(uname -m)" = "arm64" ] || [ "$(uname -m)" = "aarch64" ] ; \
	then \
		wget -q -O balena-cli.zip "https://github.com/balena-io/balena-cli/releases/download/${BALENA_CLI_REF}/balena-cli-v${BALENA_CLI_VERSION}-linux-arm64-standalone.zip" && \
		unzip balena-cli.zip && rm balena-cli.zip ; \
	elif [ "$(uname -m)" = "armv7l" ] || [ "$(uname -m)" = "armv7hf" ] ; \
	then \
		npm i balena-cli ; \
		mv /usr/app/node_modules/balena-cli/ /usr/app ; \
		rm -rf /usr/app/node_modules/ ; \
	else \
		wget -q -O balena-cli.zip "https://github.com/balena-io/balena-cli/releases/download/${BALENA_CLI_REF}/balena-cli-v${BALENA_CLI_VERSION}-linux-x64-standalone.zip" && \
		unzip balena-cli.zip && rm balena-cli.zip ; \
	fi

# Add balena-cli to PATH
#ENV PATH /usr/app/balena-cli:$PATH
ENV PATH $PATH:/usr/app/balena-cli/bin

RUN balena version

COPY package*.json ./

RUN npm ci

COPY . .

RUN chmod u+x entry.sh && eval `ssh-agent -s`

## Wait for us to go in and run script manually
ENTRYPOINT ["tail", "-f", "/dev/null"]

