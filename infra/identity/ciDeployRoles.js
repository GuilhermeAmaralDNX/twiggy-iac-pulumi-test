const aws = require("@pulumi/aws");

async function CreatePolicyCiDeploy() {
    const ciDeployPolicyDocument = await aws.iam.getPolicyDocument({
        version: "2012-10-17",
        statements: [
            {
                actions: ["sts:AssumeRole"],
                resources: ["arn:aws:iam::*:role/CIDeployAccess"],
            },
            {
                actions: ["ecr:*"],
                resources: ["*"],
            },
        ],
    });
    const ciDeployPolicy = await new aws.iam.Policy("ciDeployPolicy", {
        name: 'ci-deploy-policy',
        policy: ciDeployPolicyDocument.json
    });


    return { document: ciDeployPolicyDocument, policy: ciDeployPolicy };

}

async function CreateCIDeployGroup(user, policy) {
    const group = await new aws.iam.Group(`CIDeploy`);

    await new aws.iam.GroupMembership(`CiDeployUserGroup`, {
        group: group.name,
        users: [user.name]
    });

    await new aws.iam.GroupPolicyAttachment(`CiDeployGroup`, {
        group: group.name,
        policyArn: policy.arn

    });

    return group;
}

async function CreateIamUser() {
    const user = await new aws.iam.User('CIDeploy', {
        name: 'CIDeploy'
    });

    // const role = await new aws.iam.Role(`CIDeployIamRole`,{});

    // new aws.iam.RolePolicyAttachment(``,{
    //     role: role.name,
    //     policyArn: policy.arn
    // });

    //new aws.iam.user

    // const policyAttach = await new aws.iam.UserPolicyAttachment('CIDeployAttach', {
    //     user: user.name,
    //     policyArn: policy.arn
    // });


    return user;

}

async function CreatePolicySaml(configuration) {
    const assumeRoleSaml = await aws.iam.getPolicyDocument({
        statements: [{
            principals: [{
                type: "Federated",
                identifiers: [configuration.samlProviderArn],
            }],
            actions: ["sts:AssumeRoleWithSAML"],
            conditions: [{
                test: "StringEquals",
                variable: "SAML:aud",
                values: ["https://signin.aws.amazon.com/saml"],
            }],
        }],
    });

    return assumeRoleSaml;

}


async function CreateCiDeployRole(policy, policySaml) {
    const ciDeployRole = await new aws.iam.Role("ciDeployRole", {
        name: 'CIDeploy',
        assumeRolePolicy: policySaml.json
    }
    );

    const ciDeployRolePolicyAttachment = await new aws.iam.RolePolicyAttachment("ciDeployRolePolicyAttachment", {
        role: ciDeployRole.name,
        policyArn: policy.arn,
    });
    return ciDeployRole;
}


async function CreateRolePolicyEC2() {
    const assumeRoleCiDeployEc2 = await aws.iam.getPolicyDocument({
        statements: [{
            actions: ["sts:AssumeRole"],
            principals: [{
                identifiers: ["ec2.amazonaws.com"],
                type: "Service",
            }],
        }],
    });

    return assumeRoleCiDeployEc2;
}

//if INSTANCE PROFILE
async function CreateRoleEc2CI(policyDoc, policy) {
    const RoleCiDeployEc2 = await new aws.iam.Role("ciDeployEc2", {
        name: 'CIDeployEc2',
        assumeRolePolicy: policyDoc.json
    }
    );

    const ciDeployEc2Profile = await new aws.iam.InstanceProfile("ciDeployEc2",
        {
            name: 'CIDeployInstanceProfile',
            role: RoleCiDeployEc2.name
        });

    const ciDeployEc2Policy = await new aws.iam.RolePolicyAttachment("ciDeployEc2", {
        role: RoleCiDeployEc2.name,
        policyArn: policy.arn,
    });

    return RoleCiDeployEc2;

}

async function CreateCiDeployAccessDocPolicy() {
    const ciDeployAccess = await aws.iam.getPolicyDocument({
        statements: [
            {
                actions: [
                    "s3:*",
                    "cloudfront:CreateInvalidation",
                ],
                resources: ["*"],
                sid: "staticapps",
            },
            {
                actions: [
                    "ecs:Describe*",
                    "ecs:List*",
                    "ecs:RunTask",
                    "ecs:RegisterTaskDefinition",
                    "ecs:TagResource",
                    "ecs:UpdateService",
                    "codedeploy:CreateDeployment",
                    "codedeploy:Get*",
                    "codedeploy:List*",
                    "codedeploy:ContinueDeployment",
                    "codedeploy:StopDeployment",
                    "codedeploy:RegisterApplicationRevision",
                    "ecr:*",
                    "secretsmanager:GetSecretValue",

                ],
                resources: ["*"],
                sid: "ecsecr",
            },
            {
                actions: [
                    "eks:Describe*",
                    "eks:List*",
                    "eks:UpdateClusterConfig",
                ],
                resources: ["*"],
                sid: "eks",
            },
            {
                actions: ["elasticloadbalancing:Describe*"],
                resources: ["*"],
                sid: "elb",
            },
            {
                actions: [
                    "logs:GetLogEvents",
                    "logs:GetLogRecord",
                    "logs:GetLogDelivery",
                    "logs:GetLogGroupFields",
                    "logs:GetQueryResults",
                    "logs:FilterLogEvents",
                    "logs:DescribeLogGroups",
                    "logs:DescribeLogStreams",
                    "logs:StartQuery",
                    "logs:StopQuery",
                    "logs:TestMetricFilter",
                ],
                resources: ["*"],
                sid: "logs",
            },
            {
                actions: ["iam:PassRole"],
                resources: ["arn:aws:iam::*:role/ecs-task-*"],
                sid: "ecspassrole",
            },
            {
                actions: ["iam:PassRole"],
                resources: ["arn:aws:iam::*:role/custom-role-*"],
                sid: "ecspassrolecuston",
            },
        ],
    });

    return ciDeployAccess;

}

async function CreateCiDeployAccessAdminDocPolicy() {
    const ciDeployAccessAdmin = await aws.iam.getPolicyDocument({
        statements: [{
            actions: ["*"],
            resources: ["*"],
            sid: "admin",
        }],
    });

    return ciDeployAccessAdmin;

}

async function CreateAssumeRoleCiDeployAccess(roles) {
    const assumeRoleCiDeployAccess = await aws.iam.getPolicyDocument({
        statements: [{
            principals: [{
                type: "AWS",
                identifiers: roles,
            }],
            actions: ["sts:AssumeRole"],
        }],
    });

    return assumeRoleCiDeployAccess;
}


async function CreateCiDeployAccess(docPolicyAccess, docAssumePolicyAccess, docAdminPolicyAccess, configuration) {
    const ciDeployAccessPolicy = await new aws.iam.Policy("ciDeployAccess",
        {
            name: 'ci-deploy',
            policy: docPolicyAccess.json
        }
    );

    // const assumeRolePolicy = await aws.iam.getPolicyDocument({
    //     version: "2012-10-17",
    //     statements: [{
    //         effect: "Allow",
    //         principals: [{
    //             type: "Service",
    //             identifiers: ["codebuild.amazonaws.com", "codedeploy.amazonaws.com", "codepipeline.amazonaws.com"]
    //         }],
    //         actions: ["sts:AssumeRole"]
    //     }]
    // });

    const ciDeployAccessRole = await new aws.iam.Role("ciDeployAccess", {
        name: 'CIDeployAccess',
        assumeRolePolicy: docAssumePolicyAccess.json
    });

    const ciDeployAccess = await new aws.iam.RolePolicyAttachment("ciDeployAccess", {
        role: ciDeployAccessRole.name,
        policyArn: ciDeployAccessPolicy.arn,
    });


    if (configuration.enableAdminCI) {
        const ciDeployAccessAdminPolicy = await new aws.iam.Policy("ciDeployAccessAdmin",
            {
                name: 'ci-deploy-admin',
                policy: docAdminPolicyAccess.json
            });

        const ciDeployAccessAdmin = await new aws.iam.RolePolicyAttachment("ciDeployAccessAdmin", {
            role: ciDeployAccessRole.name,
            policyArn: ciDeployAccessAdminPolicy.arn,
        });

    }



}

async function CreateCiDeploy(configuration) {

    let role;
    let user;
    let group;
    let roleEc2;
    let identifiers = [];
    let docAdminPolicyAccess;

    if (configuration.enableCiDeployRole) {
        const policyAccess = await CreatePolicyCiDeploy();

        const samlDoc = await CreatePolicySaml(configuration);

        role = await CreateCiDeployRole(policyAccess.policy, samlDoc);
        identifiers.push(role.arn);

        const policyEc2Doc = await CreateRolePolicyEC2();

        if (configuration.enableIamUser) {
            //policyAccess.policy
            user = await CreateIamUser()
            group = await CreateCIDeployGroup(user, policyAccess.policy);
            identifiers.push(user.arn);
        }

        if (configuration.enableInstanceProfile) {
            roleEc2 = await CreateRoleEc2CI(policyEc2Doc, policyAccess.policy);
            identifiers.push(role.arn);
        }

    }


    if (configuration.enableCiDeployAccess) {

        for (const account of configuration.trustAccountIds) {
            identifiers.push(`arn:aws:iam::${account}:root`)
        }

        for (const arns of configuration.trustArns) {
            identifiers.push(arns)
        }

        const docPolicyAccess = await CreateCiDeployAccessDocPolicy();

        if (configuration.enableAdminCI)
            docAdminPolicyAccess = await CreateCiDeployAccessAdminDocPolicy();

        const docAssumePolicyAccess = await CreateAssumeRoleCiDeployAccess(identifiers);

        await CreateCiDeployAccess(docPolicyAccess, docAssumePolicyAccess, docAdminPolicyAccess, configuration);
    }

}



module.exports = {
    CreateCiDeploy
}