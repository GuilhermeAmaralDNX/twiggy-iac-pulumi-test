const aws = require("@pulumi/aws");
const pulumi = require('@pulumi/pulumi');
const fs = require('fs');
const {configuration} = require('./conf');

async function CreateIdentyProvider(provider, environment) {
    const saml = await fs.readFileSync('./saml-metadata.xml', 'utf-8');
    const identy = await new aws.iam.SamlProvider(`${configuration.orgName}-sso-${environment}`, { name: `${configuration.orgName}-sso`, samlMetadataDocument: saml }, { provider: provider });
    return identy;
}

async function CreateIAMRoleInfraDeploy(provider, saml, environment) {
    const role = await new aws.iam.Role(`InfraDeploy-${environment}`, {
        name: 'InfraDeploy',
        assumeRolePolicy: {
            Version: '2012-10-17',
            Statement: [{
                Action: 'sts:AssumeRoleWithSAML',
                Effect: 'Allow',
                Condition: { StringEquals: { 'saml:aud': 'https://signin.aws.amazon.com/saml' } },
                Principal: {
                    Federated: [saml.arn]
                },
            }],
        }
    }
        , { provider: provider });

    return role;
}

async function CreateIamInfraDeploy(provider, environment) {
    const iam = await new aws.iam.User(`InfraDeploy-Services-${environment}`, { name: 'InfraDeploy' }, { provider: provider })
    return iam;
}

async function CreateIAMInstanceProfileInfraDeploy(provider, role, environment) {
    const profile = await new aws.iam.InstanceProfile(`InfraDeployInstanceProfile-${environment}`, { name: 'InfraDeployInstanceProfile', role: role.name }, { provider: provider });
    return profile;
}

async function CreateIAMPolicyAdmin(provider, roleInfra, roleDNX, environment) {
    const policy = await new aws.iam.Policy(`admin-${environment}`, {
        name: 'admin',
        policy: {
            Version: '2012-10-17',
            Statement: [{
                Action: "*",
                Effect: "Allow",
                Resource: "*"
            }],
        }
    }, { provider: provider });

    //arn:aws:iam::aws:policy/AdministratorAccess
    const policyAttach = await new aws.iam.PolicyAttachment(`admin-${environment}`,
        { name: 'admin', policyArn: policy.arn, roles: [roleInfra.name, roleDNX.name] },
        { provider: provider })

}

async function CreateIamRoleDNXAcess(provider, environment) {
    const role = await new aws.iam.Role(`${configuration.orgName}DNXAccess-${environment}`, {
        name: `${configuration.orgName}DNXAccess`,
        maxSessionDuration: 43200,
        assumeRolePolicy: {
            Version: '2012-10-17',
            Statement: [{
                Action: "sts:AssumeRole",
                Effect: "Allow",
                Principal: {
                    AWS: `arn:aws:iam::${configuration.dnxAccount}:root`,
                },
            }],
        }
    }, { provider: provider });

    return role;
}

async function CreateIAMRoleInfraDeployEc2(provider, environment) {
    const role = await new aws.iam.Role(`infraDeployEc2-${environment}`, {
        name: 'InfraDeployEc2',
        assumeRolePolicy: {
            Version: '2012-10-17',
            Statement: [{
                Action: "sts:AssumeRole",
                Effect: "Allow",
                Principal: {
                    Service: 'ec2.amazonaws.com',
                },
            }],
        }
    }, { provider: provider });

    return role;
}

async function CreateIAMPolicyInfraDeployAssume(provider, user, role, roleSSO, environment) {

    const policy = await new aws.iam.Policy(`infra-deploy-${environment}`, {
        name: 'infra-deploy',
        policy: {
            Version: '2012-10-17',
            Statement: [{
                Action: ['organizations:Describe*', 'organizations:List*', 'sts:Get*'],
                Resource: '*',
                Effect: 'Allow'
            },
            {
                Action: 'sts:AssumeRole',
                Resource: ['arn:aws:iam::*:role/CIDeployAccess', 'arn:aws:iam::*:role/InfraDeployAccess'],
                Effect: 'Allow'
            }]
        }
    }, { provider: provider });

    let users = environment === 'services' ? [user.name] : [];

    const policyAttachUser = await new aws.iam.PolicyAttachment(`infra-deploy-${environment}`,
        { name: 'infra-deploy', policyArn: policy.arn, users: users, roles: [role.name, roleSSO.name] },
        { provider: provider })
}

async function CreateInfraDeployAccess(provider, environment, serviceAccountId) {
    const indentProvider = await CreateIdentyProvider(provider, environment);
    const roleSSO = await CreateIAMRoleInfraDeploy(provider, indentProvider, environment);
    const iamUser = await CreateIamInfraDeploy(provider, environment);
    const roleEc2 = await CreateIAMRoleInfraDeployEc2(provider, environment);
    const profile = await CreateIAMInstanceProfileInfraDeploy(provider, roleEc2, environment);
    const roleDNX = await CreateIamRoleDNXAcess(provider, environment);

    let trustRelationship = [roleEc2.arn, `arn:aws:iam::${configuration.dnxAccount}:root`, roleSSO.arn];
    for (const resourceAWS of configuration.extraTrustRelationshipInfraDeploy) {
        trustRelationship.push(resourceAWS);
    }

    let policy = {
        Version: '2012-10-17',
        Statement: [{
            Action: ["sts:AssumeRole","sts:TagSession"],
            Effect: "Allow",
            Principal: {
                AWS: trustRelationship,
            },
        }],
    };

    if (environment === 'services')
        policy.Statement[0].Principal.AWS.push(iamUser.arn);

    const role = await new aws.iam.Role(`InfraDeployAccess-${environment}`, {
        name: 'InfraDeployAccess',
        assumeRolePolicy: policy
    }, { provider: provider });

    await CreateIAMPolicyAdmin(provider, role, roleDNX, environment);
    await CreateIAMPolicyInfraDeployAssume(provider, iamUser, roleEc2, roleSSO, environment);

    return role;
}

async function CreateServiceLinkedRoles(provider, account) {
    for (const role of configuration.serviceLinkedRoles) {
        await new aws.iam.ServiceLinkedRole(`${role.name}-${account}`,
            {
                awsServiceName: role.service
            }, {
            provider: provider
        });
    }
}

async function CreateRoleInfraDeployAccess(accounts) {
    let serviceAccountId;

    for (const account of accounts) {
        if (account.name === 'services') {
            serviceAccountId = account.account.id
            break;
        }
    }

    for (const account of accounts) {
        const provider = await new aws.Provider(`${account.name}Provider`, {
            assumeRoles: [{
                roleArn: configuration.isCreateAccounts ?  account.account.id.apply(i => `arn:aws:iam::${i}:role/${configuration.orgRole}`) : `arn:aws:iam::${account.account.id}:role/${configuration.orgRole}`,

            }], region: configuration.region
        });
        await CreateInfraDeployAccess(provider, account.name, serviceAccountId);
        if (configuration.createServiceLinkedRoles)
            await CreateServiceLinkedRoles(provider, account.name)
    }
}

module.exports = { CreateRoleInfraDeployAccess }
