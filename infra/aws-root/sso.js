const aws = require("@pulumi/aws");
const { configuration } = require('./conf');

async function AssingSSOUsersAccount(accounts) {
    const sso = await new aws.ssoadmin.getInstances();
    const permission = await new aws.ssoadmin.PermissionSet('AdministratorAccess', {
        instanceArn: sso.arns[0],
        description: 'Admin',
        name: 'AdministratorAccess',
    })

    const policyAttach = await new aws.ssoadmin.ManagedPolicyAttachment('AdministratorAccessPolicy', {
        instanceArn: sso.arns[0],
        permissionSetArn: permission.arn,
        managedPolicyArn: 'arn:aws:iam::aws:policy/AdministratorAccess'
    });

    for (const account of accounts) {
        const accountAssing = await new aws.ssoadmin.AccountAssignment(account.name,
            {
                instanceArn: sso.arns[0],
                targetId: account.account.id,
                principalId: configuration.groupsId[account.name],
                principalType: 'GROUP',
                targetType: 'AWS_ACCOUNT',
                permissionSetArn: permission.arn
            });
    }
}

module.exports = { AssingSSOUsersAccount }
