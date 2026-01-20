const aws = require("@pulumi/aws");
const pulumi = require('@pulumi/pulumi');

const config = require('./conf');

async function CreateMultiRepository() {
    let reposistories = [];
    for (const repo of config.repositories) {
        const repository = await new aws.codecommit.Repository(repo.name, {
            repositoryName: repo.name,
            defaultBranch: 'main'
        });
        reposistories.push(repository);
    }
    return reposistories;
}

async function CreateRoleCodeBuild(bucket) {
    const codeBuildRole = await new aws.iam.Role("codeBuildRole", {
        name: `codeBuildRole`,
        assumeRolePolicy: `{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Principal": {
              "Service": "codebuild.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
          }
        ]
      }
      `, path: '/service-role/'
    });

    const policyDoc = await aws.iam.getPolicyDocument({
        version: '2012-10-17',
        statements: [
            {
                effect: 'Allow',
                actions: [
                    "s3:GetObject",
                    "s3:GetObjectVersion",
                    "s3:GetBucketVersioning",
                    "s3:PutObjectAcl",
                    "s3:PutObject",
                    "s3:GetBucketLocation"
                ],
                resources: [
                    bucket.arn,
                    bucket.arn.apply(b => `${b}/*`)
                ]
            },
            {
                effect: 'Allow',
                actions: [
                    "codecommit:GitPull"
                ],
                resources: [
                    "arn:aws:codecommit:us-east-1:*:*"
                ]
            },
            {
                effect: 'Allow',
                actions: [
                    "codebuild:CreateReportGroup",
                    "codebuild:CreateReport",
                    "codebuild:UpdateReport",
                    "codebuild:BatchPutTestCases",
                    "codebuild:BatchPutCodeCoverages"
                ],
                resources: [
                    "arn:aws:codebuild:us-east-1:*:report-group/*"
                ]
            },
            {
                actions: [
                    "logs:CreateLogStream",
                    "logs:PutLogEvents",
                    "logs:CreateLogGroup",
                    "cloudwatch:*"
                ],
                effect: 'Allow',
                resources: [
                    "arn:aws:logs:*:*:*",
                    "arn:aws:cloudwatch:*:*:*"
                ]
            },
            {
                actions: [
                    "ssm:PutParameter",
                    "ssm:RemoveTagsFromResource",
                    "ssm:AddTagsToResource",
                    "ssm:GetParametersByPath",
                    "ssm:GetParameter",
                    "ssm:GetParameters"
                ],
                effect: 'Allow',
                resources: [
                    "arn:aws:ssm:*:*:parameter/*",
                    "arn:aws:ssm:*:*:parameter/*/*"
                ]
            }            
        ]
    })


    const policyShared = await new aws.iam.Policy(`infra-deploy-shared`, {
        name: 'infra-deploy-shared',
        policy: {
            Version: '2012-10-17',
            Statement: [{
                Action: ['organizations:Describe*','organizations:List*','sts:Get*'],
                Resource: '*',
                Effect:'Allow'
            },
            {
                Action: 'sts:AssumeRole',
                Resource: ['arn:aws:iam::*:role/CIDeployAccess','arn:aws:iam::*:role/InfraDeployAccess'],
                Effect: 'Allow'
            }]
        }});

    const codeBuildPolicy = await new aws.iam.RolePolicy("codeBuildPolicy", {
        role: codeBuildRole.id,
        policy: policyDoc.json
    });

    const policySharedAttach = await new aws.iam.RolePolicyAttachment(`attachAssumeInfra`,{
        role: codeBuildRole.name,
        policyArn: policyShared.arn
    });

    return codeBuildRole;
}

async function CreateRoleCodePipeline(bucket) {
    const codepipelineRole = await new aws.iam.Role("codepipelineRole", {
        assumeRolePolicy: `{
        "Version": "2012-10-17",
        "Statement": [
          {
            "Effect": "Allow",
            "Principal": {
              "Service": "codepipeline.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
          }
        ]
      }
      `, path: '/service-role/'
    });

    const policyDoc = await aws.iam.getPolicyDocument({
        version: '2012-10-17',
        statements: [
            {
                effect: 'Allow',
                actions: [
                    "s3:GetObject",
                    "s3:GetObjectVersion",
                    "s3:GetBucketVersioning",
                    "s3:PutObjectAcl",
                    "s3:PutObject"
                ],
                resources: [
                    bucket.arn,
                    bucket.arn.apply(b => `${b}/*`)
                ]
            },
            {
                effect: 'Allow',
                actions: [
                    "codecommit:GetBranch",
                    "codecommit:GetCommit",
                    "codecommit:UploadArchive",
                    "codecommit:GetUploadArchiveStatus",
                    "codecommit:CancelUploadArchive",
                    "codecommit:GetRepository"
                ],
                resources: ['*']
            },
            {
                effect: 'Allow',
                actions: [
                    "codebuild:BatchGetBuilds",
                    "codebuild:StartBuild",
                    "codebuild:StartBuildBatch",
                    "codebuild:BatchGetBuildBatches"
                ],
                resources: ['*']
            },
            {
                actions: [
                    "logs:CreateLogStream",
                    "logs:PutLogEvents",
                    "logs:CreateLogGroup",
                    "cloudwatch:*"
                ],
                effect: 'Allow',
                resources: [
                    "arn:aws:logs:*:*:*",
                    "arn:aws:cloudwatch:*:*:*"
                ]
            }, {
                effect: "Allow",
                actions: ["codecommit:GitPull"],
                resources: ["arn:aws:codecommit:us-east-1:233818990303:*"]
            }
        ]
    })

    const codepipelinePolicy = await new aws.iam.RolePolicy("codepipelinePolicy", {
        role: codepipelineRole.id,
        policy: policyDoc.json
    });


    return codepipelineRole;

}

async function CreateProjects(role, repositories) {
    let projects = [];

    let index = 0;
    for (const repository of repositories) {
        const logGroup = await new aws.cloudwatch.LogGroup(config.repositories[index].name, {
            name: repositories[index].repositoryName,
            retentionInDays: 30,
        });

        let projectVariables = [{
            name: 'PULUMI_ACCESS_TOKEN',
            value: '/pulumi/token',
            type: 'PARAMETER_STORE'
        }];

        // for (const st of config.repositories[index].stacks) {
        //     projectVariables.push({
        //         name: `CREDENTIAL_${st}`,
        //         value: `/account/${st}`,
        //         type: 'PARAMETER_STORE'            
        //     })
        // }

        const project = await new aws.codebuild.Project(config.repositories[index].name, {
            name: repository.repositoryName.apply(r => `pulumi-${r}`),
            buildTimeout: 15,
            description: 'Project for apply pulumi',
            serviceRole: role.arn,
            logsConfig: {
                cloudwatchLogs: {
                    groupName: logGroup.name
                },
            },
            environment: {
                computeType: 'BUILD_GENERAL1_MEDIUM',
                image: 'aws/codebuild/amazonlinux2-x86_64-standard:3.0',
                type: 'LINUX_CONTAINER',
                environmentVariables: projectVariables
            },
            artifacts: {
                type: 'NO_ARTIFACTS',
            },
            source: {
                type: 'CODECOMMIT',
                buildspec: './buildspec.yaml',
                location: repository.cloneUrlHttp
            }
        });

        index = index + 1;

    }

    return projects;



}

async function CreateS3() {
    const codepipelineBucket = await new aws.s3.Bucket("codepipelineBucket", { acl: "private" });
    return codepipelineBucket;
}

async function CreateKMS() {
    const kms = await new aws.kms.Key(`codepipelineRole`);
    return kms;
}

async function CreateMultiRepoPipeline(repositories, role, kms, s3) {

    let index = 0;
    for (const repository of repositories) {

        let stagesDefinition = [];

        stagesDefinition.push({
            name: 'Source',
            actions: [{
                name: 'Source',
                category: 'Source',
                owner: 'AWS',
                provider: 'CodeCommit',
                version: '1',
                configuration: {
                    RepositoryName: repository.repositoryName,
                    BranchName: 'main'
                },
                outputArtifacts: ['source_output']
            }]
        });

        for (const stack of config.repositories[index].stacks) {
            stagesDefinition.push({
                name: `plan-${stack}`,
                actions: [{
                    name: `plan-${stack}`,
                    category: 'Build',
                    owner: 'AWS',
                    provider: 'CodeBuild',
                    inputArtifacts: ['source_output'],
                    version: '1',
                    configuration: {
                        ProjectName: repository.repositoryName.apply(r => `pulumi-${r}`),
                        EnvironmentVariables: `[{"name": "STAGE", "value": "plan-${stack}", "type": "PLAINTEXT"}]`
                    }
                }]
            });
            stagesDefinition.push({
                name: `aprove-${stack}`,
                actions: [{
                    name: `aprove-${stack}`,
                    category: 'Approval',
                    owner: 'AWS',
                    provider: 'Manual',
                    inputArtifacts: [],
                    version: '1',
                    configuration: {}
                }]
            });
            stagesDefinition.push({
                name: `apply-${stack}`,
                actions: [{
                    name: `apply-${stack}`,
                    category: 'Build',
                    owner: 'AWS',
                    provider: 'CodeBuild',
                    inputArtifacts: ['source_output'],
                    version: '1',
                    configuration: {
                        ProjectName: repository.repositoryName.apply(r => `pulumi-${r}`),
                        EnvironmentVariables: `[{"name": "STAGE", "value": "apply-${stack}", "type": "PLAINTEXT"}]`
                    }
                }]
            });            
        }

        await new aws.codepipeline.Pipeline(`pipeline-${config.repositories[index].name}`, {
            roleArn: role.arn,
            name: repository.repositoryName.apply(r => `pipeline-${r}`),
            artifactStore: {
                location: s3.bucket,
                type: 'S3',
                // encryptionKey: {
                //     id: kms.arn,
                //     type: 'KMS'
                // }
            },
            stages: stagesDefinition
        });
        index = index + 1;
    }

}

async function CreateSSMParameter() {
    await new aws.ssm.Parameter(`pulumi-token`,
    {
        type: 'SecureString',
        value: config.pulumiToken,
        name: '/pulumi/token',
        dataType: 'text',
    },{
        ignoreChanges: ['value']
    }); 

}

module.exports = {
    CreateMultiRepository,
    CreateS3,
    CreateKMS,
    CreateRoleCodePipeline,
    CreateMultiRepoPipeline,
    CreateRoleCodeBuild,
    CreateProjects,
    CreateSSMParameter
}