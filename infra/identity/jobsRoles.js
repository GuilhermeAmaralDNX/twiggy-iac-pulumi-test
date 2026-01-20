const aws = require("@pulumi/aws");


async function CreateIAMAlias(configuration) {
    const alias = await new aws.iam.AccountAlias('alias', {
        accountAlias: `${configuration.orgName}-${configuration.account}`
    });
    return alias;
}

async function CreateIAMAccountPasswordPolicy() {
    const passPolicy = await new aws.iam.AccountPasswordPolicy('password-policy', {
        minimumPasswordLength: 14,
        requireLowercaseCharacters: true,
        requireNumbers: true,
        requireUppercaseCharacters: true,
        requireSymbols: true,
        allowUsersToChangePassword: true,
        maxPasswordAge: 90,
        passwordReusePrevention: 24
    });
}


async function CreateRolePolicy(configuration) {
    const currentId = await aws.getCallerIdentity();

        const assumeRoleSaml = await aws.iam.getPolicyDocument({
        statements: [{
            principals: [{
                type: "Federated",
                identifiers: [`arn:aws:iam::${currentId.accountId}:saml-provider/${configuration.orgName}-sso`],
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

//IF
async function CreateRoleAdmin(saml,configuration) {

    const adminRole = await new aws.iam.Role("adminRole", {
        name: 'AdministratorAccess',
        assumeRolePolicy: saml.json,
        maxSessionDuration: configuration.roleMaxSessionDuration,
    });

    const adminRolePolicyAttachment = await new aws.iam.RolePolicyAttachment("adminRolePolicyAttachment", {
        role: adminRole.name,
        policyArn: "arn:aws:iam::aws:policy/AdministratorAccess",
    });

}

//IF
async function CreateRoleDataScience(saml,configuration) {
    const dataScientistRole = await new aws.iam.Role("dataScientistRole", {
        name: 'DataScientist',
        assumeRolePolicy: saml.json,
        maxSessionDuration: configuration.roleMaxSessionDuration,
    });
    const dataScientistRolePolicyAttachment = await new aws.iam.RolePolicyAttachment("dataScientistRolePolicyAttachment", {
        role: dataScientistRole.name,
        policyArn: "arn:aws:iam::aws:policy/job-function/DataScientist",
    });

}


//IF
async function CreateRoleDatabaseAdmin(saml,configuration) {
    const databaseAdminRole = await new aws.iam.Role("databaseAdminRole", {
        name: 'DatabaseAdministrator',
        assumeRolePolicy: saml.json,
        maxSessionDuration: configuration.roleMaxSessionDuration,
    });
    const databaseAdminRolePolicyAttachment = await new aws.iam.RolePolicyAttachment("databaseAdminRolePolicyAttachment", {
        role: databaseAdminRole.name,
        policyArn: "arn:aws:iam::aws:policy/job-function/DatabaseAdministrator",
    });

}

//IF
async function CreateRoleNetWorkAdmin(saml,configuration) {
    const networkAdminRole = await new aws.iam.Role("networkAdminRole", {
        name: 'NetworkAdministrator',
        assumeRolePolicy: saml.json,
        maxSessionDuration: configuration.roleMaxSessionDuration,
    });
    const networkAdminRolePolicyAttachment = await new aws.iam.RolePolicyAttachment("networkAdminRolePolicyAttachment", {
        role: networkAdminRole.name,
        policyArn: "arn:aws:iam::aws:policy/job-function/NetworkAdministrator",
    });

}


async function CreateRolePowerUser(saml,configuration) {
    const powerUserRole = await new aws.iam.Role("powerUserRole", {
        name: 'PowerUserAccess',
        assumeRolePolicy: saml.json,
        maxSessionDuration: configuration.roleMaxSessionDuration,
    });
    const powerUserRolePolicyAttachment = await new aws.iam.RolePolicyAttachment("powerUserRolePolicyAttachment", {
        role: powerUserRole.name,
        policyArn: "arn:aws:iam::aws:policy/PowerUserAccess",
    });

}


async function CreateRoleSecurityAudit(saml,configuration) {
    const securityAudit = await new aws.iam.Role("SecurityAudit", {
        name: 'SecurityAudit',
        assumeRolePolicy: saml.json,
        maxSessionDuration: configuration.roleMaxSessionDuration,
    });
    const securityAuditAttachment = await new aws.iam.RolePolicyAttachment("SecurityAuditAttachment", {
        role: securityAudit.name,
        policyArn: "arn:aws:iam::aws:policy/SecurityAudit",
    });

}


async function CreateRoleSupportUser(saml,configuration) {
    const supportUserRole = new aws.iam.Role("supportUserRole", {
        name: 'SupportUser',
        assumeRolePolicy: saml.json,
        maxSessionDuration: configuration.roleMaxSessionDuration,
    });
    const supportUserRolePolicyAttachment = new aws.iam.RolePolicyAttachment("supportUserRolePolicyAttachment", {
        role: supportUserRole.name,
        policyArn: "arn:aws:iam::aws:policy/job-function/SupportUser",
    });


}


async function CreateRoleSystemAdministrator(saml,configuration) {
    const systemAdminRole = new aws.iam.Role("systemAdminRole", {
        name: 'SystemAdministrator',
        assumeRolePolicy: saml.json,
        maxSessionDuration: configuration.roleMaxSessionDuration,
    });
    const systemAdminRolePolicyAttachment = new aws.iam.RolePolicyAttachment("systemAdminRolePolicyAttachment", {
        role: systemAdminRole.name,
        policyArn: "arn:aws:iam::aws:policy/job-function/SystemAdministrator",
    });

}


async function CreateRoleViewOnlyAccess(saml,configuration) {
    const viewOnlyRole = new aws.iam.Role("viewOnlyRole", {
        name: 'ViewOnlyAccess',
        assumeRolePolicy: saml.json,
        maxSessionDuration: configuration.roleMaxSessionDuration,
    });
    const viewOnlyRolePolicyAttachment = new aws.iam.RolePolicyAttachment("viewOnlyRolePolicyAttachment", {
        role: viewOnlyRole.name,
        policyArn: "arn:aws:iam::aws:policy/job-function/ViewOnlyAccess",
    });


}

async function CreateRoleSupport(saml,configuration) {

    const adminRole = await new aws.iam.Role("support", {
        name: 'SupportAccess',
        assumeRolePolicy: saml.json,
        maxSessionDuration: configuration.roleMaxSessionDuration,
    });

    const adminRolePolicyAttachment = await new aws.iam.RolePolicyAttachment("support", {
        role: adminRole.name,
        policyArn: "arn:aws:iam::aws:policy/AWSSupportAccess",
    });

}

//IF LOOP EXtra Roles
async function CreateExtraRoles(saml) {

}


async function CreateRoles(configuration) {
    const policy= await CreateRolePolicy(configuration);
    await CreateRoleAdmin(policy,configuration);
    await CreateRoleDataScience(policy,configuration);
    await CreateRoleDatabaseAdmin(policy,configuration);
    await CreateRoleNetWorkAdmin(policy,configuration);
    await CreateRolePowerUser(policy,configuration);
    await CreateRoleSecurityAudit(policy,configuration);
    await CreateRoleSupportUser(policy,configuration);
    await CreateRoleSystemAdministrator(policy,configuration);
    await CreateRoleViewOnlyAccess(policy,configuration);
    await CreateRoleSupport(policy,configuration);
}



module.exports = {
    CreateRoles, CreateIAMAccountPasswordPolicy
}