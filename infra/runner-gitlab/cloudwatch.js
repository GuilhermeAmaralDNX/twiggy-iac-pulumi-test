const aws = require("@pulumi/aws");

async function CreateLogGroup(kms,configuration) {
    const logGroup = await new aws.cloudwatch.LogGroup(`${configuration.name}-environment`,{
        name: configuration.name,
        retentionInDays: configuration.retentionLogGroup,
        tags: {},
        //kmsKeyId: kms.id
    });
}


module.exports = {
    CreateLogGroup
}