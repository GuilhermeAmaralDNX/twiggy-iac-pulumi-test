const aws = require("@pulumi/aws");


async function CreateRecordExternal(hostname,domain,loadBalance) {
            const zone = await aws.route53.getZone({ name: domain });
            const record = await new aws.route53.Record(`ext-${hostname}`,{
                zoneId: zone.zoneId,
                name: `${hostname}.${domain}`,
                type: 'CNAME',
                ttl: 300,
                records: [loadBalance.dnsName]
            },{deleteBeforeReplace: true});
}


module.exports = {
    CreateRecordExternal
}