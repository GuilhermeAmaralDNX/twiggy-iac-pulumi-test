const pulumi = require('@pulumi/pulumi');

async function GetOutputRoot(org) {

    const stackRoot = new pulumi.StackReference(`${org}/aws-root/root`);
    const orgName = await stackRoot.getOutputDetails('orgName');
    const accounts = await stackRoot.getOutputDetails('accounts');
    const kmsAudit = await stackRoot.getOutputDetails(`${org}/audit/audit`);
    return {
        accounts: accounts,
        orgName: orgName,
        kmsAudit: kmsAudit
    };
}

module.exports = {
    GetOutputRoot
}