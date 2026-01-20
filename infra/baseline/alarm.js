const aws = require('@pulumi/aws');
const pulumi = require('@pulumi/pulumi');

async function CreateSNSTopic() {

    const currentId = await aws.getCallerIdentity();


    const policyDockKms = await aws.iam.getPolicyDocument({
        version: "2012-10-17",
        statements: [{
            sid: "EnableIAMUserPermissions",
            effect: "Allow",
            principals: [{
                type: "AWS",
                identifiers: [`arn:aws:iam::${currentId.accountId}:root`]
            }],
            actions: ["kms:*"],
            resources: ["*"]
        },
        {
            sid: "AllowCloudWatchKMS",
            effect: "Allow",
            actions: ["kms:Decrypt", "kms:GenerateDataKey*"],
            principals: [{
                type: "Service",
                identifiers: ["cloudwatch.amazonaws.com"]
            }],
            resources: ["*"]
        }]
    });

    const kms = await new aws.kms.Key('alarms', {
        description: 'SNS CMK Encryption Key',
        enableKeyRotation: true,
        deletionWindowInDays: 7,
        policy: policyDockKms.json
    });

    const topic = await new aws.sns.Topic('alarms', {
        kmsMasterKeyId: kms.id,
        name: 'CISAlarm'
    });


    const topicPolicy = new aws.sns.TopicPolicy('alarms', {
        arn: topic.arn,
        policy: topic.arn.apply(arn => {
            return aws.iam.getPolicyDocument({
                version: "2012-10-17",
                statements: [{
                    effect: "Allow",
                    actions: [
                        "sns:GetTopicAttributes",
                        "sns:SetTopicAttributes",
                        "sns:AddPermission",
                        "sns:RemovePermission",
                        "sns:DeleteTopic",
                        "sns:Subscribe",
                        "sns:ListSubscriptionsByTopic",
                        "sns:Publish",
                        "sns:Receive"
                    ],
                    condition: [{
                        test: "StringEquals",
                        variable: "aws:SourceOwner",
                        values: [currentId.accountId]
                    }],
                    principals: [{
                        type: "AWS",
                        identifiers: ["*"]
                    }],
                    resources: [arn],
                    sid: "AllowOrgAccounts"
                }]
            }).then(doc => doc.json);
        })
    });

    return topic;
}

async function CreateMetricsAlarms(topic,configuration) {
    const env = configuration.account;

    // Use the log group name directly since we know it's created by CloudTrail
    const logGroupName = `${configuration.orgName}-cloudtrail`;

    // Create the metric filter using the known log group name
    const filterUnauthorizedApiCalls = new aws.cloudwatch.LogMetricFilter('UnauthorizedAPICalls',{
        name: 'UnauthorizedAPICalls',
        pattern: "{ ($.errorCode = \"*UnauthorizedOperation\") || ($.errorCode = \"AccessDenied*\") }",
        logGroupName: logGroupName,
        metricTransformation: {
            name: 'UnauthorizedAPICalls',
            namespace: 'CISBenchmark',
            value: '1'
        }
    })


    const alarmUnauthorizedAPICalls = await new aws.cloudwatch.MetricAlarm('UnauthorizedAPICalls',{
        name: `UnauthorizedAPICalls-${env}`,
        comparisonOperator: 'GreaterThanOrEqualToThreshold',
        evaluationPeriods: 1,
        metricName: filterUnauthorizedApiCalls.id,
        period: 300,
        statistic: 'Sum',
        threshold: 1,
        alarmDescription: 'Monitoring unauthorized API calls will help reveal application errors and may reduce time to detect malicious activity.',
        alarm_actions: topic.arn,
        treatMissingData: 'notBreaching',
        namespace: 'CISBenchmark'
    });

    
    const filterNoMFAConsoleSignin = await new aws.cloudwatch.LogMetricFilter('NoMFAConsoleSignin',{
        name: 'NoMFAConsoleSignin',
        pattern: "{ ($.eventName = \"ConsoleLogin\") && ($.additionalEventData.MFAUsed != \"Yes\") }",
        logGroupName: `${configuration.orgName}-cloudtrail`,
        metricTransformation: {
            name: 'NoMFAConsoleSignin',
            namespace: 'CISBenchmark',
            value: '1'
        }
    })


    const alarmNoMFAConsoleSignin = await new aws.cloudwatch.MetricAlarm('NoMFAConsoleSignin',{
        name: `NoMFAConsoleSignin-${env}`,
        comparisonOperator: 'GreaterThanOrEqualToThreshold',
        evaluationPeriods: 1,
        metricName: filterNoMFAConsoleSignin.id,
        period: 300,
        statistic: 'Sum',
        threshold: 1,
        alarmDescription: 'Monitoring unauthorized API calls will help reveal application errors and may reduce time to detect malicious activity.',
        alarm_actions: topic.arn,
        treatMissingData: 'notBreaching',
        namespace: 'CISBenchmark'
    });    



    const filterRootUsage = await new aws.cloudwatch.LogMetricFilter('RootUsage',{
        name: 'RootUsage',
        pattern: "{ $.userIdentity.type = \"Root\" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != \"AwsServiceEvent\" }",
        logGroupName: `${configuration.orgName}-cloudtrail`,
        metricTransformation: {
            name: 'RootUsage',
            namespace: 'CISBenchmark',
            value: '1'
        }
    })


    const alarmRootUsage = await new aws.cloudwatch.MetricAlarm('RootUsage',{
        name: `RootUsage-${env}`,
        comparisonOperator: 'GreaterThanOrEqualToThreshold',
        evaluationPeriods: 1,
        metricName: filterRootUsage.id,
        period: 300,
        statistic: 'Sum',
        threshold: 1,
        alarmDescription: 'Monitoring for root account logins will provide visibility into the use of a fully privileged account and an opportunity to reduce the use of it.',
        alarm_actions: topic.arn,
        treatMissingData: 'notBreaching',
        namespace: 'CISBenchmark'
    });  

    
    const filterIAMChanges = await new aws.cloudwatch.LogMetricFilter('IAMChanges',{
        name: 'IAMChanges',
        pattern: "{($.eventName=DeleteGroupPolicy)||($.eventName=DeleteRolePolicy)||($.eventName=DeleteUserPolicy)||($.eventName=PutGroupPolicy)||($.eventName=PutRolePolicy)||($.eventName=PutUserPolicy)||($.eventName=CreatePolicy)||($.eventName=DeletePolicy)||($.eventName=CreatePolicyVersion)||($.eventName=DeletePolicyVersion)||($.eventName=AttachRolePolicy)||($.eventName=DetachRolePolicy)||($.eventName=AttachUserPolicy)||($.eventName=DetachUserPolicy)||($.eventName=AttachGroupPolicy)||($.eventName=DetachGroupPolicy)}",
        logGroupName: `${configuration.orgName}-cloudtrail`,
        metricTransformation: {
            name: 'IAMChanges',
            namespace: 'CISBenchmark',
            value: '1'
        }
    })


    const alarmIAMChanges = await new aws.cloudwatch.MetricAlarm('IAMChanges',{
        name: `IAMChanges-${env}`,
        comparisonOperator: 'GreaterThanOrEqualToThreshold',
        evaluationPeriods: 1,
        metricName: filterIAMChanges.id,
        period: 300,
        statistic: 'Sum',
        threshold: 1,
        alarmDescription: 'Monitoring changes to IAM policies will help ensure authentication and authorization controls remain intact.',
        alarm_actions: topic.arn,
        treatMissingData: 'notBreaching',
        namespace: 'CISBenchmark'
    }); 


    const filterCloudTrailCfgChanges = await new aws.cloudwatch.LogMetricFilter('CloudTrailCfgChanges',{
        name: 'CloudTrailCfgChanges',
        pattern: "{ ($.eventName = CreateTrail) || ($.eventName = UpdateTrail) || ($.eventName = DeleteTrail) || ($.eventName = StartLogging) || ($.eventName = StopLogging) }",
        logGroupName: `${configuration.orgName}-cloudtrail`,
        metricTransformation: {
            name: 'CloudTrailCfgChanges',
            namespace: 'CISBenchmark',
            value: '1'
        }
    })


    const alarmCloudTrailCfgChanges = await new aws.cloudwatch.MetricAlarm('CloudTrailCfgChanges',{
        name: `CloudTrailCfgChanges-${env}`,
        comparisonOperator: 'GreaterThanOrEqualToThreshold',
        evaluationPeriods: 1,
        metricName: filterCloudTrailCfgChanges.id,
        period: 300,
        statistic: 'Sum',
        threshold: 1,
        alarmDescription: 'Monitoring changes to CloudTrails configuration will help ensure sustained visibility to activities performed in the AWS account.',
        alarm_actions: topic.arn,
        treatMissingData: 'notBreaching',
        namespace: 'CISBenchmark'
    });     



    const filterConsoleSigninFailures = await new aws.cloudwatch.LogMetricFilter('ConsoleSigninFailures',{
        name: 'ConsoleSigninFailures',
        pattern: "{ ($.eventName = ConsoleLogin) && ($.errorMessage = \"Failed authentication\") }",
        logGroupName: `${configuration.orgName}-cloudtrail`,
        metricTransformation: {
            name: 'ConsoleSigninFailures',
            namespace: 'CISBenchmark',
            value: '1'
        }
    })


    const alarmConsoleSigninFailures = await new aws.cloudwatch.MetricAlarm('ConsoleSigninFailures',{
        name: `ConsoleSigninFailures-${env}`,
        comparisonOperator: 'GreaterThanOrEqualToThreshold',
        evaluationPeriods: 1,
        metricName: filterConsoleSigninFailures.id,
        period: 300,
        statistic: 'Sum',
        threshold: 1,
        alarmDescription: 'Monitoring failed console logins may decrease lead time to detect an attempt to brute force a credential, which may provide an indicator, such as source IP, that can be used in other event correlation.',
        alarm_actions: topic.arn,
        treatMissingData: 'notBreaching',
        namespace: 'CISBenchmark'
    });



    const filterDisableOrDeleteCMK = await new aws.cloudwatch.LogMetricFilter('DisableOrDeleteCMK',{
        name: 'DisableOrDeleteCMK',
        pattern: "{ ($.eventSource = kms.amazonaws.com) && (($.eventName = DisableKey) || ($.eventName = ScheduleKeyDeletion)) }",
        logGroupName: `${configuration.orgName}-cloudtrail`,
        metricTransformation: {
            name: 'DisableOrDeleteCMK',
            namespace: 'CISBenchmark',
            value: '1'
        }
    })


    const alarmDisableOrDeleteCMK = await new aws.cloudwatch.MetricAlarm('DisableOrDeleteCMK',{
        name: `DisableOrDeleteCMK-${env}`,
        comparisonOperator: 'GreaterThanOrEqualToThreshold',
        evaluationPeriods: 1,
        metricName: filterDisableOrDeleteCMK.id,
        period: 300,
        statistic: 'Sum',
        threshold: 1,
        alarmDescription: 'Monitoring failed console logins may decrease lead time to detect an attempt to brute force a credential, which may provide an indicator, such as source IP, that can be used in other event correlation.',
        alarm_actions: topic.arn,
        treatMissingData: 'notBreaching',
        namespace: 'CISBenchmark'
    });




    const filterS3BucketPolicyChanges = await new aws.cloudwatch.LogMetricFilter('S3BucketPolicyChanges',{
        name: 'S3BucketPolicyChanges',
        pattern: "{ ($.eventSource = s3.amazonaws.com) && (($.eventName = PutBucketAcl) || ($.eventName = PutBucketPolicy) || ($.eventName = PutBucketCors) || ($.eventName = PutBucketLifecycle) || ($.eventName = PutBucketReplication) || ($.eventName = DeleteBucketPolicy) || ($.eventName = DeleteBucketCors) || ($.eventName = DeleteBucketLifecycle) || ($.eventName = DeleteBucketReplication)) }",
        logGroupName: `${configuration.orgName}-cloudtrail`,
        metricTransformation: {
            name: 'S3BucketPolicyChanges',
            namespace: 'CISBenchmark',
            value: '1'
        }
    })


    const alarmS3BucketPolicyChanges = await new aws.cloudwatch.MetricAlarm('S3BucketPolicyChanges',{
        name: `S3BucketPolicyChanges-${env}`,
        comparisonOperator: 'GreaterThanOrEqualToThreshold',
        evaluationPeriods: 1,
        metricName: filterS3BucketPolicyChanges.id,
        period: 300,
        statistic: 'Sum',
        threshold: 1,
        alarmDescription: 'Monitoring changes to S3 bucket policies may reduce time to detect and correct permissive policies on sensitive S3 buckets.',
        alarm_actions: topic.arn,
        treatMissingData: 'notBreaching',
        namespace: 'CISBenchmark'
    });




    const filterAWSConfigChanges = await new aws.cloudwatch.LogMetricFilter('AWSConfigChanges',{
        name: 'AWSConfigChanges',
        pattern: "{ ($.eventSource = config.amazonaws.com) && (($.eventName=StopConfigurationRecorder)||($.eventName=DeleteDeliveryChannel)||($.eventName=PutDeliveryChannel)||($.eventName=PutConfigurationRecorder)) }",
        logGroupName: `${configuration.orgName}-cloudtrail`,
        metricTransformation: {
            name: 'AWSConfigChanges',
            namespace: 'CISBenchmark',
            value: '1'
        }
    })


    const alarmAWSConfigChanges = await new aws.cloudwatch.MetricAlarm('AWSConfigChanges',{
        name: `AWSConfigChanges-${env}`,
        comparisonOperator: 'GreaterThanOrEqualToThreshold',
        evaluationPeriods: 1,
        metricName: filterAWSConfigChanges.id,
        period: 300,
        statistic: 'Sum',
        threshold: 1,
        alarmDescription: 'Monitoring changes to AWS Config configuration will help ensure sustained visibility of configuration items within the AWS account.',
        alarm_actions: topic.arn,
        treatMissingData: 'notBreaching',
        namespace: 'CISBenchmark'
    });



    const filterSecurityGroupChanges = await new aws.cloudwatch.LogMetricFilter('SecurityGroupChanges',{
        name: 'SecurityGroupChanges',
        pattern: "{ ($.eventName = AuthorizeSecurityGroupIngress) || ($.eventName = AuthorizeSecurityGroupEgress) || ($.eventName = RevokeSecurityGroupIngress) || ($.eventName = RevokeSecurityGroupEgress) || ($.eventName = CreateSecurityGroup) || ($.eventName = DeleteSecurityGroup)}",
        logGroupName: `${configuration.orgName}-cloudtrail`,
        metricTransformation: {
            name: 'SecurityGroupChanges',
            namespace: 'CISBenchmark',
            value: '1'
        }
    })


    const alarmSecurityGroupChanges = await new aws.cloudwatch.MetricAlarm('SecurityGroupChanges',{
        name: `SecurityGroupChanges-${env}`,
        comparisonOperator: 'GreaterThanOrEqualToThreshold',
        evaluationPeriods: 1,
        metricName: filterSecurityGroupChanges.id,
        period: 300,
        statistic: 'Sum',
        threshold: 1,
        alarmDescription: 'Monitoring changes to security group will help ensure that resources and services are not unintentionally exposed.',
        alarm_actions: topic.arn,
        treatMissingData: 'notBreaching',
        namespace: 'CISBenchmark'
    });


    const filterNACLChanges = await new aws.cloudwatch.LogMetricFilter('NACLChanges',{
        name: 'NACLChanges',
        pattern: "{ ($.eventName = CreateNetworkAcl) || ($.eventName = CreateNetworkAclEntry) || ($.eventName = DeleteNetworkAcl) || ($.eventName = DeleteNetworkAclEntry) || ($.eventName = ReplaceNetworkAclEntry) || ($.eventName = ReplaceNetworkAclAssociation) }",
        logGroupName: `${configuration.orgName}-cloudtrail`,
        metricTransformation: {
            name: 'NACLChanges',
            namespace: 'CISBenchmark',
            value: '1'
        }
    })


    const alarmNACLChanges = await new aws.cloudwatch.MetricAlarm('NACLChanges',{
        name: `NACLChanges-${env}`,
        comparisonOperator: 'GreaterThanOrEqualToThreshold',
        evaluationPeriods: 1,
        metricName: filterNACLChanges.id,
        period: 300,
        statistic: 'Sum',
        threshold: 1,
        alarmDescription: 'Monitoring changes to NACLs will help ensure that AWS resources and services are not unintentionally exposed.',
        alarm_actions: topic.arn,
        treatMissingData: 'notBreaching',
        namespace: 'CISBenchmark'
    });    




    const filterNetworkGWChanges = await new aws.cloudwatch.LogMetricFilter('NetworkGWChanges',{
        name: 'NetworkGWChanges',
        pattern: "{ ($.eventName = CreateCustomerGateway) || ($.eventName = DeleteCustomerGateway) || ($.eventName = AttachInternetGateway) || ($.eventName = CreateInternetGateway) || ($.eventName = DeleteInternetGateway) || ($.eventName = DetachInternetGateway) }",
        logGroupName: `${configuration.orgName}-cloudtrail`,
        metricTransformation: {
            name: 'NetworkGWChanges',
            namespace: 'CISBenchmark',
            value: '1'
        }
    })


    const alarmNetworkGWChanges = await new aws.cloudwatch.MetricAlarm('NetworkGWChanges',{
        name: `NetworkGWChanges-${env}`,
        comparisonOperator: 'GreaterThanOrEqualToThreshold',
        evaluationPeriods: 1,
        metricName: filterNetworkGWChanges.id,
        period: 300,
        statistic: 'Sum',
        threshold: 1,
        alarmDescription: 'Monitoring changes to network gateways will help ensure that all ingress/egress traffic traverses the VPC border via a controlled path.',
        alarm_actions: topic.arn,
        treatMissingData: 'notBreaching',
        namespace: 'CISBenchmark'
    });    



    const filterRouteTableChanges = await new aws.cloudwatch.LogMetricFilter('RouteTableChanges',{
        name: 'RouteTableChanges',
        pattern: "{ ($.eventName = CreateRoute) || ($.eventName = CreateRouteTable) || ($.eventName = ReplaceRoute) || ($.eventName = ReplaceRouteTableAssociation) || ($.eventName = DeleteRouteTable) || ($.eventName = DeleteRoute) || ($.eventName = DisassociateRouteTable) }",
        logGroupName: `${configuration.orgName}-cloudtrail`,
        metricTransformation: {
            name: 'RouteTableChanges',
            namespace: 'CISBenchmark',
            value: '1'
        }
    })


    const alarmRouteTableChanges = await new aws.cloudwatch.MetricAlarm('RouteTableChanges',{
        name: `RouteTableChanges-${env}`,
        comparisonOperator: 'GreaterThanOrEqualToThreshold',
        evaluationPeriods: 1,
        metricName: filterRouteTableChanges.id,
        period: 300,
        statistic: 'Sum',
        threshold: 1,
        alarmDescription: 'Monitoring changes to route tables will help ensure that all VPC traffic flows through an expected path.',
        alarm_actions: topic.arn,
        treatMissingData: 'notBreaching',
        namespace: 'CISBenchmark'
    }); 


    const filterVPCChanges = await new aws.cloudwatch.LogMetricFilter('VPCChanges',{
        name: 'VPCChanges',
        pattern: "{ ($.eventName = CreateVpc) || ($.eventName = DeleteVpc) || ($.eventName = ModifyVpcAttribute) || ($.eventName = AcceptVpcPeeringConnection) || ($.eventName = CreateVpcPeeringConnection) || ($.eventName = DeleteVpcPeeringConnection) || ($.eventName = RejectVpcPeeringConnection) || ($.eventName = AttachClassicLinkVpc) || ($.eventName = DetachClassicLinkVpc) || ($.eventName = DisableVpcClassicLink) || ($.eventName = EnableVpcClassicLink) }",
        logGroupName: `${configuration.orgName}-cloudtrail`,
        metricTransformation: {
            name: 'VPCChanges',
            namespace: 'CISBenchmark',
            value: '1'
        }
    })


    const alarmVPCChanges = await new aws.cloudwatch.MetricAlarm('VPCChanges',{
        name: `VPCChanges-${env}`,
        comparisonOperator: 'GreaterThanOrEqualToThreshold',
        evaluationPeriods: 1,
        metricName: filterVPCChanges.id,
        period: 300,
        statistic: 'Sum',
        threshold: 1,
        alarmDescription: 'Monitoring changes to VPC will help ensure that all VPC traffic flows through an expected path.',
        alarm_actions: topic.arn,
        treatMissingData: 'notBreaching',
        namespace: 'CISBenchmark'
    }); 


}




async function CreateAlarms(configuration) {
    const topic = await CreateSNSTopic();
    await CreateMetricsAlarms(topic,configuration);

    return topic;
}


module.exports = {
    CreateAlarms
}