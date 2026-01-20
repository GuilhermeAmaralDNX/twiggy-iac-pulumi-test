const aws = require("@pulumi/aws");

async function CreateDomain(vpc,configuration) {
    let domains = [];

    domains.push(await CreatePublicDomain(configuration));
    domains.push(await CreatePrivateDomain(vpc,configuration));

    return domains;
}

async function CreatePublicDomain(configuration) {
	console.log('CreatePublicDomain');
    let domains = [];
    for (const zone of configuration.publicZones) {
        let conf = {
            name: zone
        }

        const domain = await new aws.route53.Zone(`${zone}`,conf);
        domains.push({
            name: domain.name,
            nameServers: domain.nameServers,
            zoneId: domain.id
        })
    }
    return domains;
}

async function CreatePrivateDomain(vpc,configuration) {
	console.log('CreatePrivateDomain');
    let domains = [];
    for (const zone of configuration.privateZones) {
        let conf = {
            name: zone,
            vpcs: [{
				vpcId: vpc.id,
				vpcRegion: configuration.region
			}]
        }

        const domain = await new aws.route53.Zone(`priv-${zone}`,conf);
        domains.push({
            name: domain.name,
            nameServers: domain.nameServers,
            zoneId: domain.id
        })
    }
    return domains;
}

module.exports = {
    CreateDomain
}