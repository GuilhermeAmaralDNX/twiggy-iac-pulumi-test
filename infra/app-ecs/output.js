const pulumi = require('@pulumi/pulumi');

async function GetOutputs(org, account) {

    const stackRoot = new pulumi.StackReference(`${org}/aws-root/root`);
    const orgName = await stackRoot.getOutputDetails('orgName');
    const accounts = await stackRoot.getOutputDetails('accounts');
    const kmsAudit = await stackRoot.getOutputDetails(`${org}/audit/audit`);


    const stackNetwork = new pulumi.StackReference(`${org}/network/${account}`);
    const defaultDomain = await stackNetwork.getOutputDetails(`defaultDomain`);
    const domains = await stackNetwork.getOutputDetails(`domains`);


    const stackUtilities = new pulumi.StackReference(`${org}/utilities/${account}`);
    const defaultCertificate = await stackUtilities.getOutputDetails(`defaultCertificate`);

    const stackVpn = new pulumi.StackReference(`${org}/vpn-pritunl/${account}`);
    const vpnSG = await stackVpn.getOutputDetails(`vpnSecurityGroupVPN`);    


    return {
        accounts: accounts,
        orgName: orgName,
        kmsAudit: kmsAudit,
        defaultDomain: defaultDomain,
        domains: domains,
        defaultCertificate: defaultCertificate,
        vpnSG: vpnSG
    };
}

module.exports = {
    GetOutputs
}