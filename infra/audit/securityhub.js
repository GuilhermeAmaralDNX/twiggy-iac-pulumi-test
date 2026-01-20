const aws = require('@pulumi/aws');

async function CreateSecurityHub(isPCI, isCIS, isFoundational,configuration) {

    const securityHub = await new aws.securityhub.Account('securityhub');

    if (isPCI) {
        const pci = await new aws.securityhub.StandardsSubscription('pci', {
            standardsArn: `arn:aws:securityhub:${configuration.region}::standards/pci-dss/v/3.2.1`
        }, { dependsOn: [securityHub] });
    }


    if (isCIS) {
        const cis = await new aws.securityhub.StandardsSubscription('cis', {
            standardsArn: `arn:aws:securityhub:::ruleset/cis-aws-foundations-benchmark/v/1.2.0`
        }, { dependsOn: [securityHub] });
    }


    if (isFoundational) {
        const foundational = await new aws.securityhub.StandardsSubscription('foundational', {
            standardsArn: `arn:aws:securityhub:${configuration.region}::standards/aws-foundational-security-best-practices/v/1.0.0`
        }, { dependsOn: [securityHub] });
    }


    for (const account of configuration.accounts.filter((a)=> { if (a.env != 'audit') return a}) ) {

        const members = await new aws.securityhub.Member(`member-${account.env}`, {
            accountId: account.id,
            email: account.email,
            invite: true
        }, { dependsOn: [securityHub] });
    }

}

module.exports = {
    CreateSecurityHub
}