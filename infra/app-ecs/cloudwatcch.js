const aws = require("@pulumi/aws");

async function CreateLogGroup(apps,configuration) {

    let logs = [];
    for (const app of apps) {
        const log = await new aws.cloudwatch.LogGroup(app.name,{
            name: `/ecs/ecs-${configuration.ecsName}-${configuration.account}-${configuration.region}/${app.name}`,
            retentionInDays: configuration.retentionInDays,
            tags: {
                ExportToS3: configuration.exportToS3
            }
        });
        logs.push(log);
    }

    return logs;
}

module.exports = {
    CreateLogGroup
}