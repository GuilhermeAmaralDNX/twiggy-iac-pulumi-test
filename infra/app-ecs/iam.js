const aws = require("@pulumi/aws");


async function CreateCustomRoles(roles) {
    for (const role of roles) {

        const policyDocRoleAssume = await aws.iam.getPolicyDocument({
            statements: role.assume
        })
        const policyDoc = await aws.iam.getPolicyDocument({
            statements: role.permissions
        });

        const policy = await new aws.iam.Policy(role.name,{
            namePrefix: role.name,
            policy: policyDoc.json
        })

        const roleIam = await new aws.iam.Role(role.name,{
            namePrefix: `${role.name}`,
            assumeRolePolicy: policyDocRoleAssume.json
        });        

        const policyAttach = await new aws.iam.RolePolicyAttachment(role.name, {
            role: roleIam.name,
            policyArn: policy.arn
        });

        for (const pol of role.policies || []) {
            await new aws.iam.RolePolicyAttachment(`${pol.name}`, {
                role: roleIam.name,
                policyArn: pol.policy,
            });
        }

    }
}

module.exports = {
    CreateCustomRoles
}