export GOOGLE_IDP_ID?=C03jzkjg6
export GOOGLE_SP_ID?=331336665121
export AZURE_TENANT_ID?=e5e9d8fd-e8df-4107-8326-0c228996f7d3
export AZURE_APP_ID_URI?=6a6e00d9-0f77-4cf2-9c68-51c0a4baca11
export TF_PLUGIN_CACHE_DIR=.terraform/cache
export AWS_DEFAULT_REGION=us-east-1

GOOGLE_AUTH_IMAGE   = public.ecr.aws/dnxbrasil/oni-sso:latest
AZURE_AUTH_IMAGE    = public.ecr.aws/dnxsolutions/docker-aws-azure-ad:latest
AWS_IMAGE           = public.ecr.aws/dnxsolutions/aws-v2:2.4.27-dnx1
TERRAFORM_IMAGE     = public.ecr.aws/dnxsolutions/terraform:1.7.4-dnx2
PULUMI_IMAGE        = pulumi/pulumi-nodejs:3.83.0


RUN_GOOGLE_AUTH = docker run -it --rm -v $(PWD):/work $(GOOGLE_AUTH_IMAGE) auth-google -i ${GOOGLE_IDP_ID} -s ${GOOGLE_SP_ID} -o env
RUN_AZURE_AUTH  = docker run -it --rm --env-file=.env -v $(PWD)/.env.auth:/work/.env $(AZURE_AUTH_IMAGE)
RUN_AWS         = docker run -i --rm --env-file=.env.auth --env-file=.env -v $(PWD):/work -v $(PWD)/aws-sso-config:/root/.aws/config --entrypoint "" $(AWS_IMAGE)
RUN_TERRAFORM   = docker run -i --rm -e TF_VAR_WORKSPACE_FILE=$(WORKSPACE) --env-file=.env.auth --env-file=.env -v $(PWD):/work -v /var/run/secrets:/var/run/secrets $(TERRAFORM_IMAGE)

env-%: # Check for specific environment variables
    @ if [ "${${*}}" = "" ]; then echo "Environment variable $* not set"; exit 1;fi

.env:
    cp .env.template .env
    echo >> .env
    touch .env.auth
    touch .env.assume

clean-dotenv:
    -rm .env

clean-oni-auth:
    rm -f .env.oni-auth

google-auth: clean-oni-auth .env
    $(RUN_GOOGLE_AUTH)

azure-auth: .env env-AZURE_TENANT_ID env-AZURE_APP_ID_URI
    echo > .env.auth
    $(RUN_AZURE_AUTH)

init:
        docker run --rm -i -w /app -v $(PWD):/app --entrypoint bash   $(PULUMI_IMAGE) -c "npm i"
        docker run --rm -i -w /app -v $(PWD):/app --entrypoint bash -e PULUMI_ACCESS_TOKEN=${PULUMI_ACCESS_TOKEN} -e ENVIRONMENT_STACK=${ENVIRONMENT_STACK} $(PULUMI_IMAGE) -c "pulumi stack init ${ENVIRONMENT_STACK} --non-interactive" || true

preview:
        docker run --rm -i -w /app -v $(PWD):/app --entrypoint bash -e PULUMI_ACCESS_TOKEN=${PULUMI_ACCESS_TOKEN} -e ENVIRONMENT_STACK=${ENVIRONMENT_STACK} $(PULUMI_IMAGE) -c "pulumi preview --diff --stack ${ENVIRONMENT_STACK} --non-interactive"

up:
        docker run --rm -i -w /app -v $(PWD):/app --entrypoint bash -e PULUMI_ACCESS_TOKEN=${PULUMI_ACCESS_TOKEN} -e ENVIRONMENT_STACK=${ENVIRONMENT_STACK} $(PULUMI_IMAGE) -c "pulumi up -y --stack ${ENVIRONMENT_STACK} --non-interactive"

lint: .env
    $(RUN_TERRAFORM) fmt --recursive -check=true
.SILENT:
.PHONY: lint

validate: .env
    $(RUN_TERRAFORM) validate
.SILENT:
.PHONY: validate

shell: .env
    docker run -it --rm --env-file=.env.auth --env-file=.env -v $(PWD):/work --entrypoint "/bin/bash" $(TERRAFORM_IMAGE)
.PHONY: shell

apply: .env env-WORKSPACE
    $(RUN_TERRAFORM) apply .terraform-plan-$(WORKSPACE)
.SILENT:
.PHONY: apply

destroy: .env env-WORKSPACE
    $(RUN_TERRAFORM) destroy
.SILENT:
.PHONY: destroy

plan: .env env-WORKSPACE
    $(RUN_TERRAFORM) plan -out=.terraform-plan-$(WORKSPACE)
.SILENT:
.PHONY: plan

check_clean:
    @echo "Are you sure you want to delete the files? It's including (terraform files, gsuite xml and git repository) [yes/no] " && read ans && [ $${ans:-N} == yes ]
.PHONY: clean check_clean

clean: check_clean .env
    echo "+++ :system: Cleaning default files"
    rm -rf .terraform terraform.tfstate* terraform.tfstate.d .git ||:

output:
    @$(RUN_TERRAFORM) output -json > output.json
.SILENT:
.PHONY: output

aws-sso-configure:
    $(RUN_AWS) aws configure sso
.PHONY: aws-sso-configure

aws-sso-auth: .env env-AWS_SSO_PROFILE
    $(RUN_AWS) bash /opt/scripts/aws-sso.sh > .env.auth
.PHONY: aws-sso-auth
