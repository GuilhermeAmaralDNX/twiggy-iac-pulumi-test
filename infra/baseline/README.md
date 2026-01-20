# baseline

### The module

This module setup security configuration and notifications per account.

The following resources will be created:

+ Guard Duty Detector
+ Guard Duty Invite Accepter
+ Event Rule:
+ Event Target:
+ AWS Config Recorder:
+ AWS Config Delivery Channel:
+ Security Hub Account
+ Security Hub Account
+ Cloudtrail
+ Cloudtrail Logs
+ Cloudtrail Alarms
+ IAM Role:
+ Lambda:
+ IAM Policy: 
+ IAM Role:
+ KMS:
+ CloudWatch Log Group:
=+ Cloud Trail:
=+ SNS Topic:
=+ SNS Topic Policy:
=+ CloudWatch Log Metrics Filter
+ CloudWatch Metric Alarm

### Applied to stacks
 - nonprod
 - prod
 - shared

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|:--------:|
| pulumiOrg | Pulumi organization name | `string` | n/a | yes |
| orgName | Organization name | `string` | n/a | yes |
| region | Region where resources will be created | `string` | n/a | yes |
| account |Account Name | `string` | n/a | yes |
| accountNumber |Account id | `string` | n/a | yes |
| CloudTrailKmsKeyId | KMS arn from account audit | `string` | n/a | yes |
| auditAccountId | Account ID Audit `number` | `true` | yes |
| enableSecuirtyHub |Create Security Hub | `bool` | `true` | yes |
| enableConfig | Create AWS Config | `bool` | `true` | yes |
| enableCloudtrail | Enable Cloud Trail | `bool` | `true` | yes |
| enableGuardDuty |Enable Guard Duty| `bool` | `true` | yes |
| globalCloutrail | Enable Global Cloud Trail | `bool` | `true` | yes |
| globalConfig | Enable Global AWS Config | `bool` | `true` | yes |
| logGroupRetention | Log Group retention in days | `number` | `30` | yes |
| notification.enable | Enable send notification | `bool` | `true` | false |
| notification.endpointType | Type of notification channel (teams, slack, google) | `string` | n/a | false |
| notification.webhookTeams | Teams webhook | `string` | n/a | false |
| notification.webhookGoole | Google Chat webhook | `string` | n/a | false |
| notification.slackChannel | Slack channel | `string` | n/a | false |
| notification.slackChannel | Slack slackToken | `string` | n/a | false |
| notification.logOnly | Log events of guardduty only in cloudwatch and not send any notification | `string` | n/a | false |


## Outputs
| Name | Description |
|------|-------------|
| bucketLoadBalanceAccess | Bucket for logging access logs for load balancer| 
| bucketAccessLogging | Bucket for logging access in another bukcets in account| 



## How use

```shell
git clone ...
npm install
pulumi login #OR export env PULUMI_ACCESS_TOKEN
pulumi stack select <organame/stack-namne>
pulumi up
```

## Author

Module managed by [DNXBrasil](https://dnxbrasil.com).