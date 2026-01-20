const pulumi = require('@pulumi/pulumi');

async function GetOutputRoot(org) {
    const stack = new pulumi.StackReference(`${org}/aws-root/root`);
    const orgName = await stack.getOutputDetails('orgName');
    const accounts = await stack.getOutputDetails('accounts');
    return {
        accounts: accounts,
        orgName: orgName
    };
}

module.exports = {
    GetOutputRoot
}