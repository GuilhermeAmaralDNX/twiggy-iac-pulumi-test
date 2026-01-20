# AWS Gitlab Runner

### The module

This module setup an Gitlab Runner instance in EC2 with executor docker+machine to provision execution agent node for infrastructure and application pipelines:


### GitLab runner token configuration
To register the runner automatically set the variable gitlab_runner_registration_token. This token value can be found in your GitLab project, group, or global settings. For a generic runner you can find the token in the admin section. By default the runner will be locked to the target project, not run untagged. Below is an example of the configuration map.

### GitLab runner cache
By default the module creates a a cache for the runner in S3. Old objects are automatically remove via a configurable life cycle policy on the bucket.

## Inputs


| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| name | runner name | `string` | n/a | yes |
| instanceType | instance size of ec2 docker machine | `string` | n/a | yes |
| account | Account name | `string` | n/a | yes |
| cache.lifecycleClear | Enable clear cache | `bool` | n/a | yes |
| cache.lifecyclePrefix | S3 cache path prefix | `string` | n/a | yes |
| cache.expirationDays | Cache expiration time in days | `number` | n/a | yes |
| cache.bucketPrefix | Bucket prefix name | `string` | n/a | yes |
| gitlabRunnerConfig.gitlab_runner_version | Gitlab Runner Version| `string` | n/a | yes |
| gitlabRunnerConfig.docker_machine_version | Docker Machine Version| `string` | n/a | yes |
| gitlabRunnerConfig.secure_parameter_store_runner_token_key | SSM Parameter name for store Gitlab Token| `string` | n/a | yes |
| gitlabRunnerConfig.secure_parameter_store_region | SSM Parameter region| `string` | n/a | yes |
| gitlabRunnerConfig.gitlab_runner_registration_token | Gitlab Runner registration token| `string` | n/a | yes |
| gitlabRunnerConfig.gitlab_runner_tag_list | Gitlab Runner tags | `string` | n/a | yes |
| gitlabRunnerConfig.gitlab_runner_locked_to_project | Gitlab Runner Locked for Project | `string` | n/a | yes |
| gitlabRunnerConfig.gitlab_runner_run_untagged | Runner pipeline wiht untagged | `bool` | n/a | yes |
| gitlabRunnerConfig.gitlab_runner_maximum_timeout | Gitlab Runner timeout | `number` | n/a | yes |
| runnerConfig.aws_region | Gitlab Runner ec2 region | `string` | n/a | yes |
| runnerConfig.runners_aws_zone | Gitlab Runner ec2 zone | `string` | n/a | yes |
| runnerConfig.runners_instance_type | Gitlab Runner ec2 instance size | `string` | n/a | yes |
| runnerConfig.runners_off_peak_timezone | Gitlab Runner timezone | `string` | n/a | yes |
| runnerConfig.runners_off_peak_periods_string | Off peak periods of the runners, will be used in the runner config.toml | `string` | n/a | yes |


## Outputs
N/A

## How use

```shell
git clone ...
npm install
pulumi login
pulumi stack select <organame/stack-namne>
pulumi up
```

## Author

Module managed by [DNXBrasil](https://dnxbrasil.com).