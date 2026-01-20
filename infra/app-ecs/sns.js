const aws = require("@pulumi/aws");


async function CreateKMS() {
    const kms = await new aws.kms.Key(`sns-default`, {
        enableKeyRotation: true,
        description: 'SNS default kms'
    });

    return kms;
}

async function CreateRoleLoggingDelivery() {
    const role = await new aws.iam.Role("sns-delivery", {
        namePrefix: `sns-delivery-status`,
        assumeRolePolicy: `{
            "Version": "2012-10-17",
            "Statement": [
              {
                "Action": "sts:AssumeRole",
                "Principal": {
                  "Service": "sns.amazonaws.com"
                },
                "Effect": "Allow",
                "Sid": ""
              }
            ]
          }          
          `});

          const policy = await new aws.iam.RolePolicyAttachment("sns-delivery", {
            role: role.name,
            policyArn: "arn:aws:iam::aws:policy/service-role/AmazonSNSRole",
          });          

          return role;
}

async function SubscriptionIAM(name,statements) {
    const role = await new aws.iam.Role(`subsc-${name}`, {
        namePrefix: `subsc-${name}`,
        assumeRolePolicy: `{
            "Version": "2012-10-17",
            "Statement": [
              {
                "Action": "sts:AssumeRole",
                "Principal": {
                  "Service": "sns.amazonaws.com"
                },
                "Effect": "Allow",
                "Sid": ""
              }
            ]
          }          
          `});

        const policyDoc = await aws.iam.getPolicyDocument({
            statements: statements
      });          

      const policy = await new aws.iam.Policy(`subsc-${name}`,{
        policy: policyDoc.json
      })

          await new aws.iam.RolePolicyAttachment(`subsc-${name}`, {
            role: role.name,
            policyArn: policy.arn,
          });          

          return role;
}

async function CreateSNS(snsList) {
    let kms;
    let role;
    let snsOutputs = [];

    if (snsList.length) {
        kms = await CreateKMS();
        role = await CreateRoleLoggingDelivery();
    }
    
    for (sns of snsList) {
        const snsInfo = await new aws.sns.Topic(sns.name, {
            name: sns.name,
            kmsMasterKeyId: kms.arn,
            //tags: {...sns.tags,...config.tags},
            sqsFailureFeedbackRoleArn: role.arn,
            sqsSuccessFeedbackRoleArn: role.arn,
            firehoseFailureFeedbackRoleArn: role.arn,
            firehoseSuccessFeedbackRoleArn: role.arn,
            
        });


        for (const subsc of sns.subscriptions) {

            let roleSubscription;
            if (subsc.permission)
                roleSubscription = await SubscriptionIAM(subsc.name,subsc.permission);

            await new aws.sns.TopicSubscription(subsc.name, {
                rawMessageDelivery: subsc.rawMessageDelivery ? true : false,
                topic: snsInfo.arn,
                endpoint: subsc.endpoint,
                protocol: subsc.protocol,
                ...(subsc.permission && {subscriptionRoleArn: roleSubscription.arn}),
                ...(subsc.filterPolicy && {filterPolicy: JSON.stringify(subsc.filterPolicy)}),
                ...(subsc.filterPolicy && {filterPolicyScope: subsc.filterPolicyScope})
                
            });
        }


        snsOutputs.push({
            sns: snsInfo.name,
            snsARN: snsInfo.arn
        });
    }

    return {
        kms: snsList.length > 0 ? kms.arn : '',
        sns: snsOutputs
    };

}

module.exports = {
    CreateSNS
}