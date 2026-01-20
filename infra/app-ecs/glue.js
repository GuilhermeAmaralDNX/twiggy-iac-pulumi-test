const aws = require("@pulumi/aws");
const { jsonStringify } = require("@pulumi/pulumi");

async function CreateGlueResources(input,vpc,Subnets) {
    const { databases } = input;
    const databaseResources = [];
    const crawlerResources = [];
    for (const db of databases) {

        const glueRole = new aws.iam.Role(`${db.name}-glueS3Role`, {
            name: `${db.name}-glueS3Role`,
            assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
                Service: "glue.amazonaws.com",
            }),
        });
        console.log(JSON.stringify({
            Version: "2012-10-17",
            Statement: [{
                Action:[ 
                    "s3:ListBucket", 
                    "s3:GetObject",
                    "s3:PutObject",
                    "s3:DeleteObject"],
                Effect: "Allow",
                Resource: db.bucketsArn,
            }],
        }))
        if(db.bucketsArn.length > 0){
            const s3Policy = new aws.iam.Policy(`${db.name}-glueS3Policy`,{
                name: `${db.name}-glueS3Policy`,
                policy: JSON.stringify({
                    Version: "2012-10-17",
                    Statement: [{
                        Action:[ 
                            "s3:ListBucket", 
                            "s3:GetObject",
                            "s3:PutObject",
                            "s3:DeleteObject"],
                        Effect: "Allow",
                        Resource: db.bucketsArn,
                    }],
                }),
            });
            new aws.iam.RolePolicyAttachment(`${db.name}-glueS3Attach`, {
                role: glueRole.name,
                policyArn: s3Policy.arn,
            });
        }
    
        new aws.iam.RolePolicyAttachment(`${db.name}-glueAttachPolicy`, {
            role: glueRole.name, 
            policyArn: "arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole",
        });    
    


        const database = new aws.glue.CatalogDatabase(db.name, {
            name: db.name,
            description: db.description,
        });

        databaseResources.push(database);

            for (const crawler of db.crawlers) {

                const createdCrawler = new aws.glue.Crawler(crawler.name, {
                    name: crawler.name,
                    role: glueRole.arn,
                    databaseName: db.name,
                    ...(crawler.dataSourceType === "s3" && {
                        s3Targets: crawler.s3Targets.map(function(i){return {path: i}})
                    }),
                });


                crawlerResources.push(createdCrawler);
            }
    }

    return {
        databases: databaseResources,
        crawlers: crawlerResources,
    };
}

module.exports = {
    CreateGlueResources
};