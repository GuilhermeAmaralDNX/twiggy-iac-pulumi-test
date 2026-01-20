const pulumi = require('@pulumi/pulumi');

async function GetOutputs(org,account,skipNetwork) {

    const stackRoot = new pulumi.StackReference(`${org}/aws-root/root`);
    const orgName = await stackRoot.getOutputDetails('orgName');
    const accounts = await stackRoot.getOutputDetails('accounts');
    const kmsAudit = await stackRoot.getOutputDetails(`${org}/audit/audit`);


    let stackNetwork;
    let defaultDomain=[];
    let domains = [];
    
    if (!skipNetwork) {
        stackNetwork = new pulumi.StackReference(`${org}/network/${account}`);
        defaultDomain = await stackNetwork.getOutputDetails(`defaultDomain`);
        domains = await stackNetwork.getOutputDetails(`domains`);
        
    }



    

    return {
        accounts: accounts,
        orgName: orgName,
        kmsAudit: kmsAudit,
        defaultDomain: defaultDomain,
        domains: domains
    };
}

module.exports = {
    GetOutputs
}