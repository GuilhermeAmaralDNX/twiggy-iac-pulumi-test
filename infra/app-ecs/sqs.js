const aws = require("@pulumi/aws");

async function CreatePolicyKMS(customPermission) {

    const currentId = await aws.getCallerIdentity();

    let statements = [{
        effect: "Allow",
        principals: [{
            identifiers: [`arn:aws:iam::${currentId.accountId}:root`],
            type: "AWS"
        }],
        actions: ["kms:*"],
        resources: ["*"],
        sid: "default",
    }
    ];

    statements = statements.concat(customPermission);

    const policy = await aws.iam.getPolicyDocument({
        statements: statements
    });

    return policy;
}

async function CreateKMS(customKMSPermission) {
    const kms = await new aws.kms.Key(`sqs-default`, {
        enableKeyRotation: true,
        description: 'SQS default kms',
        policy: (await CreatePolicyKMS(customKMSPermission)).json
    });

    return kms;
}

async function CreateSQS(sqsConfig) {

    let kms;
    let sqsOutputs = [];

    // Se não há configurações ou se sqsConfig não tem a propriedade listSqs
    if (!sqsConfig || !sqsConfig.listSqs) {
        return [];
    }

    if (sqsConfig.listSqs.length)
        kms = await CreateKMS(sqsConfig.customKMSPermission);

    let index = 0;
    const currentId = await aws.getCallerIdentity();

    for (const sqs of sqsConfig.listSqs) {

        const basePolicy = (queueArn) => ({
            Version: "2012-10-17",
            Statement: [
                {
                    Effect: "Allow",
                    Principal: "*",
                    Action: "sqs:*",
                    Resource: queueArn,
                },
            ],
        });

        const sqsInfo = new aws.sqs.Queue(sqs.name, {
            name: sqs.name,
            fifoQueue: sqs.fifoQueue ?? false,
            kmsMasterKeyId: kms.arn,
            tags: sqs.tags,
        }, {

        });

        const queuePolicy = sqsInfo.arn.apply(async (arn) => {
            const base = basePolicy(arn);
            const userPolicy = sqs.policy ?? {};

            const mergedPolicy = {
                ...base,
                Statement: [
                    ...base.Statement,
                    ...(userPolicy.Statement || []),
                ]
            };

            return JSON.stringify(mergedPolicy);
        });

        const sqsPolicy = new aws.sqs.QueuePolicy(`${sqs.name}-policy`, {
            queueUrl: sqsInfo.id,
            policy: queuePolicy,
        });
        sqsOutputs.push({
            sqs: sqsInfo.name,
            sqsARN: sqsInfo.arn
        });
    }

    return {
        kms: sqsConfig.listSqs.length > 0 ? kms.arn : '',
        sqs: sqsOutputs
    };

}

module.exports = {
    CreateSQS
}