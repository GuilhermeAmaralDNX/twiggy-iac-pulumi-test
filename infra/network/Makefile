PULUMI_IMAGE="pulumi/pulumi-nodejs:3.83.0"

init:
	docker run --rm -i -w /app -v $(pwd):/app --entrypoint bash   $(PULUMI_IMAGE) -c "npm i"
	docker run --rm -i -w /app -v $(pwd):/app --entrypoint bash -e PULUMI_ACCESS_TOKEN=$(PULUMI_ACCESS_TOKEN)    $(PULUMI_IMAGE) -c "pulumi stack init $(ENVIRONMENT) --non-interactive"

preview:
	docker run --rm -i -w /app -v $(pwd):/app --entrypoint bash  -e PULUMI_ACCESS_TOKEN=$(PULUMI_ACCESS_TOKEN)   $(PULUMI_IMAGE) -c "pulumi preview --diff --stack $(ENVIRONMENT) --non-interactive"

up:
	docker run --rm -i -w /app -v $(pwd):/app --entrypoint bash -e PULUMI_ACCESS_TOKEN=$(PULUMI_ACCESS_TOKEN)   $(PULUMI_IMAGE) -c "pulumi up -y --stack $(ENVIRONMENT) --non-interactive"

teste:
	docker run --rm -i -w /app -v $(PWD):/app --entrypoint bash   $(PULUMI_IMAGE) -c " echo ${ENVIRONMENT}"
	echo ${ENVIRONMENT}