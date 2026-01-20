
const aws = require('@pulumi/aws');

async function AccepterSecuirtyHub(configuration) {
    const hub = await new aws.securityhub.Account('default');

    const invite = await new aws.securityhub.InviteAccepter('accepter',{
        masterId: configuration.auditAccountId
    },{dependsOn:[hub]});
}

module.exports = {
    AccepterSecuirtyHub
}